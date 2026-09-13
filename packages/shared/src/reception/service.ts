import type { PublicClient, WalletClient, Address } from "viem";
import { formatEther } from "viem";
import { NFTsRepository } from "../db/repositories/nfts.repository";
import { NotificationQueueService } from "../queue/notifications";
import { verifyTicketJWS, type TicketPayload } from "../passes/jws";
import { hotelNftAbi } from "../abi";

export interface ReceptionCheckInResult {
  status: "CHECKED_IN";
  tokenId: string;
  roomNumber: number;
  checkInDate: string;
  roomType: string;
  onChainTxDispatched: boolean;
}

export interface ContingencyCheckInParams {
  roomNumber: number;
  checkInDate: string;
  possessionProofType: "WALLET_ADDRESS" | "TX_HASH" | "VOUCHER_CODE";
  possessionProofValue: string;
  reason: string;
}

export interface ReceptionConfig {
  nftContractAddress?: Address;
  receptionWalletAddress?: Address;
  minBalancePol?: number;
  devopsEmail?: string;
}

export class ReceptionService {
  private nftsRepo: NFTsRepository;
  private notificationQueue: NotificationQueueService;
  private publicClient?: PublicClient;
  private walletClient?: WalletClient | null;
  private config: ReceptionConfig;

  constructor(
    nftsRepo: NFTsRepository = new NFTsRepository(),
    notificationQueue: NotificationQueueService = new NotificationQueueService(),
    publicClient?: PublicClient,
    walletClient?: WalletClient | null,
    config: ReceptionConfig = {},
  ) {
    this.nftsRepo = nftsRepo;
    this.notificationQueue = notificationQueue;
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.config = config;
  }

  /**
   * Validación optimista (< 500ms, SLA RNF-03) mediante ticket JWS (US-14).
   */
  async processTicketCheckIn(ticketJws: string): Promise<ReceptionCheckInResult> {
    const payload: TicketPayload = await verifyTicketJWS(ticketJws);

    const nft = await this.nftsRepo.getNFTById(payload.tokenId);
    if (!nft) {
      throw new Error(`NFT no encontrado: ${payload.tokenId}`);
    }

    if (nft.status === "CHECKED_IN") {
      throw new Error(`La habitación ${nft.roomNumber} ya ha realizado check-in previamente`);
    }

    if (nft.status === "BURNED") {
      throw new Error(`El token ${nft.tokenId} fue quemado por expiración`);
    }

    // Actualización atómica inmediata en base de datos off-chain
    await this.nftsRepo.markCheckedIn(nft.tokenId);

    // Despacho de la tx on-chain en segundo plano (asíncrono)
    const onChainTxDispatched = await this.dispatchOnChainCheckIn(nft.tokenId);

    return {
      status: "CHECKED_IN",
      tokenId: nft.tokenId,
      roomNumber: nft.roomNumber,
      checkInDate: nft.checkInDate,
      roomType: nft.roomType,
      onChainTxDispatched,
    };
  }

  /**
   * Protocolo de contingencia para huéspedes sin dispositivo móvil (SRS §4.2, RD 933/2021).
   */
  async processContingencyCheckIn(params: ContingencyCheckInParams): Promise<ReceptionCheckInResult> {
    const nft = await this.nftsRepo.findNFTByRoomAndDate(params.roomNumber, params.checkInDate);
    if (!nft) {
      throw new Error(`No se encontró reserva para la habitación ${params.roomNumber} en fecha ${params.checkInDate}`);
    }

    if (nft.status === "CHECKED_IN") {
      throw new Error(`La reserva para la habitación ${params.roomNumber} ya fue procesada`);
    }

    if (!params.possessionProofValue || params.possessionProofValue.trim().length === 0) {
      throw new Error("Debe proporcionarse un valor de prueba de posesión");
    }

    // Registro de auditoría y marcado en BD
    await this.nftsRepo.markCheckedIn(nft.tokenId);
    await this.nftsRepo.recordContingencyCheckIn(nft.tokenId, {
      roomNumber: params.roomNumber,
      checkInDate: params.checkInDate,
      possessionProofType: params.possessionProofType,
      possessionProofValue: params.possessionProofValue,
      reason: params.reason,
    });

    const onChainTxDispatched = await this.dispatchOnChainCheckIn(nft.tokenId);

    return {
      status: "CHECKED_IN",
      tokenId: nft.tokenId,
      roomNumber: nft.roomNumber,
      checkInDate: nft.checkInDate,
      roomType: nft.roomType,
      onChainTxDispatched,
    };
  }

  /**
   * Despacha la transacción markCheckedIn(tokenId) on-chain y monitoriza el saldo de la wallet de recepción.
   */
  private async dispatchOnChainCheckIn(tokenId: string): Promise<boolean> {
    if (!this.walletClient || !this.publicClient || !this.config.nftContractAddress) {
      return false;
    }

    try {
      // Monitor de gas: alerta si balance < 5 POL
      if (this.config.receptionWalletAddress) {
        const balanceWei = await this.publicClient.getBalance({ address: this.config.receptionWalletAddress });
        const balancePol = parseFloat(formatEther(balanceWei));
        const minBalance = this.config.minBalancePol ?? 5;

        if (balancePol < minBalance) {
          const devopsEmail = this.config.devopsEmail || process.env.DEVOPS_ALERT_EMAIL || "devops@marinadelsol.es";
          await this.notificationQueue.enqueueNotification("DEVOPS_ALERT", devopsEmail, {
            subject: "ALERTA: Saldo bajo en hot-wallet de recepción",
            address: this.config.receptionWalletAddress,
            currentBalancePol: balancePol,
            thresholdPol: minBalance,
          });
        }
      }

      const account = this.walletClient.account;
      if (!account) return false;

      const hash = await this.walletClient.writeContract({
        address: this.config.nftContractAddress,
        abi: hotelNftAbi,
        functionName: "markCheckedIn",
        args: [BigInt(tokenId)],
        account,
        chain: this.walletClient.chain,
      });

      return Boolean(hash);
    } catch (err) {
      console.error(`[ReceptionService] Error al despachar markCheckedIn(${tokenId}) on-chain:`, err);
      return false;
    }
  }
}

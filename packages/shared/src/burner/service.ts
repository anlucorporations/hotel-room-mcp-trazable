import type { PublicClient, WalletClient } from "viem";
import { formatEther } from "viem";
import { NFTsRepository } from "../db/repositories/nfts.repository";
import { acquireDistributedLock, releaseDistributedLock } from "../redis/client";
import { NotificationQueueService } from "../queue/notifications";
import { hotelNftAbi } from "../abi";


export interface BurnerOptions {
  nftContractAddress: `0x${string}`;
  operatorAddress: `0x${string}`;
  minBalancePol?: number;
  devopsEmail?: string;
  dryRun?: boolean;
}

export class BurnerService {
  private nftsRepo: NFTsRepository;
  private notificationQueue: NotificationQueueService;
  private readonly LOCK_KEY = "hotel:burn:lock";
  private readonly LOCK_TTL = 30; // 30s Redlock

  constructor(
    nftsRepo: NFTsRepository = new NFTsRepository(),
    notificationQueue: NotificationQueueService = new NotificationQueueService(),
  ) {
    this.nftsRepo = nftsRepo;
    this.notificationQueue = notificationQueue;
  }

  /**
   * Ejecuta el ciclo de quema programada desatendida a las 12:00 PM Europe/Madrid (US-09).
   */
  async executeScheduledBurn(
    publicClient: PublicClient,
    walletClient: WalletClient | null,
    options: BurnerOptions,
  ): Promise<{ executed: boolean; burnedTokensCount: number; reason?: string }> {
    const minBalance = options.minBalancePol ?? 5;
    const devopsEmail = options.devopsEmail || process.env.DEVOPS_ALERT_EMAIL || "devops@hotel.es";

    // 1. Adquisición de Redlock (exclusión mutua distribuida, TTL 30s)
    const lock = await acquireDistributedLock(this.LOCK_KEY, this.LOCK_TTL);
    if (!lock) {
      console.warn("[Burner] No se pudo adquirir el lock hotel:burn:lock. Otra instancia está en ejecución.");
      return { executed: false, burnedTokensCount: 0, reason: "LOCKED" };
    }

    try {
      // 2. Comprobación del balance de gas de la wallet operadora (alerta si < 5 POL)
      const balanceWei = await publicClient.getBalance({ address: options.operatorAddress });
      const balancePol = parseFloat(formatEther(balanceWei));

      if (balancePol < minBalance) {
        const alertMsg = `[CRITICAL] Saldo de la wallet operadora (${options.operatorAddress}) es de ${balancePol} POL (< ${minBalance} POL). Quema desatendida suspendida.`;
        console.error(alertMsg);

        // Disparar alerta inmediata a DevOps vía cola de notificaciones
        await this.notificationQueue.enqueueNotification("DEVOPS_ALERT", devopsEmail, {
          subject: "ALERTA CRÍTICA: Saldo insuficiente en Bot Burner",
          message: alertMsg,
          balancePol,
          threshold: minBalance,
          timestamp: new Date().toISOString(),
        });

        return { executed: false, burnedTokensCount: 0, reason: "INSUFFICIENT_GAS" };
      }

      // 3. Determinar fecha límite según horario de check-in vencido (formato YYYY-MM-DD en hora de España)
      const now = new Date();
      const todayMadrid = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Madrid",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);

      // 4. Buscar habitaciones no vendidas expiradas en BD (status = 'AVAILABLE' y check_in_date <= today)
      const expiredNFTs = await this.nftsRepo.getUnsoldExpiredNFTs(todayMadrid);

      if (expiredNFTs.length === 0) {
        console.log("[Burner] No hay habitaciones expiradas pendientes de quema.");
        return { executed: true, burnedTokensCount: 0, reason: "NO_TOKENS" };
      }

      const tokenIds = expiredNFTs.map((nft) => BigInt(nft.tokenId));
      console.log(`[Burner] Se encontraron ${tokenIds.length} tokens para quema masiva.`);

      // 5. Quema on-chain vía HotelNFT.burnBatch(uint256[])
      if (!options.dryRun && walletClient) {
        const txHash = await walletClient.writeContract({
          address: options.nftContractAddress,
          abi: hotelNftAbi,
          functionName: "burnBatch",
          args: [tokenIds],
          account: walletClient.account!,
          chain: walletClient.chain,
        });


        console.log(`[Burner] Transacción burnBatch despachada: ${txHash}`);
      }

      // 6. Actualizar estado en PostgreSQL a 'BURNED'
      for (const nft of expiredNFTs) {
        await this.nftsRepo.updateNFTStatus(nft.tokenId, "BURNED");
      }

      // 7. Notificar a Carlos y DevOps de la quema completada
      await this.notificationQueue.enqueueNotification("BURN_EXECUTED", devopsEmail, {
        burnedCount: tokenIds.length,
        tokenIds: expiredNFTs.map((n) => n.tokenId),
        date: todayMadrid,
      });

      return { executed: true, burnedTokensCount: tokenIds.length };
    } finally {
      // 8. Liberar lock atómicamente
      await releaseDistributedLock(this.LOCK_KEY, lock);
    }
  }
}

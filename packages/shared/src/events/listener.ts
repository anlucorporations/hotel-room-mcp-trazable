import crypto from "node:crypto";
import type { PublicClient, Log } from "viem";
import { NFTsRepository } from "../db/repositories/nfts.repository";
import { NotificationQueueService } from "../queue/notifications";


export interface EventListenerConfig {
  nftAddress: `0x${string}`;
  marketplaceAddress: `0x${string}`;
  carlosEmail?: string;
  devopsEmail?: string;
  reorgConfirmations?: number; // 32 bloques (SRS §6)
  heartbeatIntervalMs?: number; // 30.000 ms
  heartbeatTimeoutMs?: number; // 5000 ms
  silenceThresholdMs?: number; // 10 minutos (600.000 ms)
  chunkSize?: number; // 2.000 bloques
}

export interface StagedEvent {
  id: string;
  eventType: "NFTSold" | "NFTListed" | "NFTCheckedInOnChain";
  blockNumber: bigint;
  txHash: string;
  data: any;
  receivedAt: number;
}

export class EventListenerService {
  private nftsRepo: NFTsRepository;
  private notificationQueue: NotificationQueueService;
  private config: Required<EventListenerConfig>;
  private lastBlockNumber: bigint = 0n;
  private lastBlockTimestamp: number = Date.now();
  private stagedEvents: StagedEvent[] = [];
  private isConnected = false;

  constructor(
    config: EventListenerConfig,
    nftsRepo: NFTsRepository = new NFTsRepository(),
    notificationQueue: NotificationQueueService = new NotificationQueueService(),
  ) {
    this.nftsRepo = nftsRepo;
    this.notificationQueue = notificationQueue;
    this.config = {
      nftAddress: config.nftAddress,
      marketplaceAddress: config.marketplaceAddress,
      carlosEmail: config.carlosEmail || process.env.CARLOS_NOTIFICATION_EMAIL || "carlos@hotel.es",
      devopsEmail: config.devopsEmail || process.env.DEVOPS_ALERT_EMAIL || "devops@hotel.es",
      reorgConfirmations: config.reorgConfirmations ?? 32,
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 30000,
      heartbeatTimeoutMs: config.heartbeatTimeoutMs ?? 5000,
      silenceThresholdMs: config.silenceThresholdMs ?? 600000,
      chunkSize: config.chunkSize ?? 2000,
    };
  }

  /**
   * Genera y cifra un nuevo secreto checkInSecret con AES-256-GCM.
   */
  generateAndEncryptSecret(): { plainSecret: string; encryptedSecret: string } {
    const plainSecret = crypto.randomBytes(32).toString("hex");
    const encryptionKey = crypto
      .createHash("sha256")
      .update(process.env.CHECKIN_SECRET_KEY || "hotel_master_aes_key_32_bytes_2026")
      .digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);

    let encrypted = cipher.update(plainSecret, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    const encryptedSecret = `${iv.toString("hex")}:${authTag}:${encrypted}`;
    return { plainSecret, encryptedSecret };
  }

  /**
   * Registra la recepción de un nuevo bloque para actualizar el monitor de silencio (US-07).
   */
  async onNewBlock(blockNumber: bigint): Promise<void> {
    this.lastBlockNumber = blockNumber;
    this.lastBlockTimestamp = Date.now();
    this.isConnected = true;
    await this.processStagedEvents(blockNumber);
  }


  /**
   * Comprueba si se ha superado el umbral de silencio (> 10 min) y emite alerta a DevOps si es necesario (US-07).
   */
  async checkSilenceAlert(): Promise<boolean> {
    const silenceElapsed = Date.now() - this.lastBlockTimestamp;
    if (silenceElapsed > this.config.silenceThresholdMs) {
      console.error(
        `[EventListener] ALERTA CRÍTICA: Sin bloques recibidos durante ${Math.floor(silenceElapsed / 1000)}s (> 10 min). Notificando a DevOps.`,
      );
      await this.notificationQueue.enqueueNotification("DEVOPS_ALERT", this.config.devopsEmail, {
        subject: "ALERTA CRÍTICA: Silencio prolongado en Polygon RPC (>10 min)",
        silenceSeconds: Math.floor(silenceElapsed / 1000),
        lastBlockNumber: this.lastBlockNumber.toString(),
        timestamp: new Date().toISOString(),
      });
      return true;
    }
    return false;
  }

  /**
   * Pone en cola un evento on-chain en estado transitorio CONFIRMING (buffer de 32 bloques).
   */
  stageEvent(
    eventType: "NFTSold" | "NFTListed" | "NFTCheckedInOnChain",
    blockNumber: bigint,
    txHash: string,
    data: any,
  ): void {
    const staged: StagedEvent = {
      id: `${txHash}-${eventType}`,
      eventType,
      blockNumber,
      txHash,
      data,
      receivedAt: Date.now(),
    };
    this.stagedEvents.push(staged);

    // Si es una venta, marcar de inmediato en BD como CONFIRMING
    if (eventType === "NFTSold" && data.tokenId) {
      void this.nftsRepo.updateNFTStatus(data.tokenId.toString(), "CONFIRMING");
    }
  }

  /**
   * Consolida eventos cuando alcanzan la profundidad requerida de 32 bloques de confirmación anti-reorgs.
   */
  async processStagedEvents(currentBlock: bigint): Promise<number> {
    const maturedEvents: StagedEvent[] = [];
    const remainingEvents: StagedEvent[] = [];

    for (const ev of this.stagedEvents) {
      if (currentBlock - ev.blockNumber >= BigInt(this.config.reorgConfirmations)) {
        maturedEvents.push(ev);
      } else {
        remainingEvents.push(ev);
      }
    }

    this.stagedEvents = remainingEvents;

    for (const ev of maturedEvents) {
      await this.commitEvent(ev);
    }

    return maturedEvents.length;
  }

  /**
   * Consolida un evento en PostgreSQL tras alcanzar las 32 confirmaciones.
   */
  private async commitEvent(event: StagedEvent): Promise<void> {
    console.log(`[EventListener] Consolidando evento ${event.eventType} (Tx: ${event.txHash}) con 32 confirmaciones.`);

    if (event.eventType === "NFTSold") {
      const { tokenId, seller, buyer, priceInWei, royaltyAmount, isSecondary } = event.data;
      const tokenIdStr = tokenId.toString();

      // Rotar y cifrar nuevo checkInSecret para el nuevo propietario
      const { encryptedSecret } = this.generateAndEncryptSecret();

      // 1. Actualizar estado definitivo a SOLD en PostgreSQL
      await this.nftsRepo.updateNFTStatus(tokenIdStr, "SOLD", {
        currentOwner: buyer,
        checkInSecretEnc: encryptedSecret,
      });

      // 2. Registrar evento en histórico de ventas
      await this.nftsRepo.recordSaleEvent({
        tokenId: tokenIdStr,
        seller,
        buyer,
        priceInWei: priceInWei.toString(),
        royaltyAmountWei: (royaltyAmount || 0n).toString(),
        isSecondary: Boolean(isSecondary),
        txHash: event.txHash,
        blockNumber: Number(event.blockNumber),
      });

      // 3. Encolar notificación a Carlos en < 60s (US-08)
      await this.notificationQueue.enqueueNotification("NFT_SOLD", this.config.carlosEmail, {
        tokenId: tokenIdStr,
        seller,
        buyer,
        priceInWei: priceInWei.toString(),
        isSecondary: Boolean(isSecondary),
        txHash: event.txHash,
        blockNumber: event.blockNumber.toString(),
      });
    } else if (event.eventType === "NFTListed") {
      const { tokenId, seller, priceInWei } = event.data;
      await this.nftsRepo.createListing({
        tokenId: tokenId.toString(),
        seller,
        priceInWei: priceInWei.toString(),
        active: true,
        txHashList: event.txHash,
      });
    } else if (event.eventType === "NFTCheckedInOnChain") {
      const { tokenId } = event.data;
      await this.nftsRepo.updateNFTStatus(tokenId.toString(), "CHECKED_IN");
    }
  }

  /**
   * Reconciliación histórica con paginación en trozos de máx. 2.000 bloques (SRS §6).
   */
  async reconcileLogsChunked(
    publicClient: PublicClient,
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<number> {
    let currentFrom = fromBlock;
    let totalLogsCount = 0;
    const chunkSize = BigInt(this.config.chunkSize);

    while (currentFrom <= toBlock) {
      const currentTo = currentFrom + chunkSize - 1n < toBlock ? currentFrom + chunkSize - 1n : toBlock;

      let retries = 4;
      let delayMs = 500;
      let logs: Log[] = [];

      while (retries > 0) {
        try {
          logs = await publicClient.getLogs({
            address: this.config.marketplaceAddress,
            fromBlock: currentFrom,
            toBlock: currentTo,
          });
          break;
        } catch (err) {
          retries--;
          if (retries === 0) throw err;
          await new Promise((res) => setTimeout(res, delayMs));
          delayMs *= 2; // Retroceso exponencial: 500ms, 1s, 2s, 4s
        }
      }

      totalLogsCount += logs.length;
      currentFrom = currentTo + 1n;
    }

    return totalLogsCount;
  }

  getStagedEventsCount(): number {
    return this.stagedEvents.length;
  }

  getLastBlockNumber(): bigint {
    return this.lastBlockNumber;
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }
}


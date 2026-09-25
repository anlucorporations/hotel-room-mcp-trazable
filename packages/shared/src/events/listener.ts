import crypto from "node:crypto";
import { decodeEventLog, parseAbiItem, type PublicClient, type Log } from "viem";
import { NFTsRepository } from "../db/repositories/nfts.repository";
import { NotificationQueueService } from "../queue/notifications";
import { encryptCheckInSecret } from "../auth/crypto";
import { roomTypeOf, toRoomTypeDb } from "../domain/room-master";

export interface EventListenerConfig {
  /** Contrato canónico `HotelNights`: es la única fuente de eventos del sistema (D-02). */
  nftAddress: `0x${string}`;
  carlosEmail?: string;
  devopsEmail?: string;
  /** Confirmaciones antes de consolidar un evento (1 en Anvil, 32 en Polygon; D-12). */
  reorgConfirmations?: number;
  heartbeatIntervalMs?: number; // 30.000 ms
  heartbeatTimeoutMs?: number; // 5000 ms
  silenceThresholdMs?: number; // 10 minutos (600.000 ms)
  chunkSize?: number; // 2.000 bloques
  /**
   * Reloj inyectable (ms). Permite probar la alerta de silencio de forma **determinista**: con el
   * umbral mínimo y `Date.now()` real, cualquier retardo de planificación (>1 ms bajo carga) hacía
   * que la comprobación posterior a un bloque viera «silencio» y el test fallara al azar (flake
   * observado en `pnpm test` bajo turbo durante la verificación de M7).
   */
  now?: () => number;
}

/** Eventos del contrato canónico que el índice off-chain necesita. */
const CANONICAL_EVENTS = {
  Mint: parseAbiItem(
    "event Mint(uint256 indexed tokenId, uint256 indexed room, uint256 dateYYYYMMDD, string roomType, uint256 price)",
  ),
  Sale: parseAbiItem(
    "event Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint8 saleType)",
  ),
  Listed: parseAbiItem("event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)"),
  CheckedIn: parseAbiItem("event CheckedIn(uint256 indexed tokenId, address indexed by, uint256 timestamp)"),
  Burn: parseAbiItem("event Burn(uint256 indexed tokenId)"),
  RoyaltyPaid: parseAbiItem("event RoyaltyPaid(uint256 indexed tokenId, address indexed receiver, uint256 amount)"),
} as const;

/** Carga útil ya decodificada del `Mint` canónico. */
export interface MintEventData {
  tokenId: bigint;
  room: bigint;
  dateYYYYMMDD: bigint;
  roomType: string;
  price: bigint;
}

/** Carga útil del `Sale` canónico (el royalty real se adjunta después desde su `RoyaltyPaid`). */
export interface SaleEventData {
  tokenId: bigint;
  seller: string;
  buyer: string;
  priceInWei: bigint;
  royaltyAmount: bigint;
  isSecondary: boolean;
}

/** Carga útil del `Listed` canónico. */
export interface ListedEventData {
  tokenId: bigint;
  seller: string;
  priceInWei: bigint;
}

/** Carga útil de los eventos que solo identifican la noche (`CheckedIn`, `Burn`). */
export interface TokenEventData {
  tokenId: bigint;
}

interface StagedEventBase<TEventType extends StagedEventType, TData> {
  id: string;
  eventType: TEventType;
  blockNumber: bigint;
  txHash: string;
  data: TData;
  receivedAt: number;
}

/**
 * Evento on-chain apilado a la espera de confirmaciones.
 *
 * Es una **unión discriminada** por `eventType`: `data` queda correlacionada con su tipo de evento,
 * de modo que consolidar un `Mint` no puede leer por error campos de una venta.
 */
export type StagedEvent =
  | StagedEventBase<"NFTMinted", MintEventData>
  | StagedEventBase<"NFTSold", SaleEventData>
  | StagedEventBase<"NFTListed", ListedEventData>
  | StagedEventBase<"NFTCheckedInOnChain", TokenEventData>
  | StagedEventBase<"NFTBurned", TokenEventData>;

export type StagedEventType = StagedEvent["eventType"];

/** Carga útil asociada a un tipo de evento apilado. */
export type StagedEventData<TEventType extends StagedEventType> = Extract<
  StagedEvent,
  { eventType: TEventType }
>["data"];

export class EventListenerService {
  private nftsRepo: NFTsRepository;
  private notificationQueue: NotificationQueueService;
  private config: {
    nftAddress: `0x${string}`;
    carlosEmail: string;
    devopsEmail: string;
    reorgConfirmations: number;
    heartbeatIntervalMs: number;
    heartbeatTimeoutMs: number;
    silenceThresholdMs: number;
    chunkSize: number;
  };
  private lastBlockNumber: bigint = 0n;
  private lastBlockTimestamp: number = Date.now();
  private stagedEvents: StagedEvent[] = [];
  private isConnected = false;
  /** Evita re-encolar la alerta de silencio en cada heartbeat (una por episodio). */
  private silenceAlerted = false;
  /** Reloj (ms). Inyectable para pruebas deterministas de la alerta de silencio. */
  private readonly now: () => number;

  constructor(
    config: EventListenerConfig,
    nftsRepo: NFTsRepository = new NFTsRepository(),
    notificationQueue: NotificationQueueService = new NotificationQueueService(),
    /** Cliente de lectura para resolver el estado real del token al consolidar (opcional). */
    private readonly publicClient?: PublicClient,
  ) {
    this.nftsRepo = nftsRepo;
    this.notificationQueue = notificationQueue;
    this.now = config.now ?? (() => Date.now());
    this.lastBlockTimestamp = this.now();
    this.config = {
      nftAddress: config.nftAddress,
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
   * La clave es `CHECKIN_SECRET_KEY` (obligatoria, sin valor por defecto).
   */
  generateAndEncryptSecret(): { plainSecret: string; encryptedSecret: string } {
    const plainSecret = crypto.randomBytes(32).toString("hex");
    return { plainSecret, encryptedSecret: encryptCheckInSecret(plainSecret) };
  }

  /**
   * Registra la recepción de un nuevo bloque para actualizar el monitor de silencio (US-07).
   */
  async onNewBlock(blockNumber: bigint): Promise<void> {
    this.lastBlockNumber = blockNumber;
    this.lastBlockTimestamp = this.now();
    this.isConnected = true;
    // Vuelven los bloques: se rearma la alerta de silencio (se avisa una vez por episodio).
    this.silenceAlerted = false;
    await this.processStagedEvents(blockNumber);
  }


  /**
   * Comprueba si se ha superado el umbral de silencio y emite alerta a DevOps si es necesario (US-07).
   *
   * Se avisa **una sola vez por episodio de silencio** (el flag se rearma cuando llega un bloque):
   * antes, cada heartbeat de 30 s volvía a encolar la misma alerta y llenaba la cola de correo.
   */
  async checkSilenceAlert(): Promise<boolean> {
    const silenceElapsed = this.now() - this.lastBlockTimestamp;
    if (silenceElapsed <= this.config.silenceThresholdMs) {
      return false;
    }
    if (this.silenceAlerted) {
      return false;
    }
    this.silenceAlerted = true;

    console.error(
      `[EventListener] ALERTA CRÍTICA: Sin bloques recibidos durante ${Math.floor(silenceElapsed / 1000)}s (umbral ${Math.floor(this.config.silenceThresholdMs / 1000)}s). Notificando a DevOps.`,
    );
    await this.notificationQueue.enqueueNotification("DEVOPS_ALERT", this.config.devopsEmail, {
      subject: "ALERTA CRÍTICA: Silencio prolongado en la cadena RPC",
      silenceSeconds: Math.floor(silenceElapsed / 1000),
      lastBlockNumber: this.lastBlockNumber.toString(),
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  /**
   * Pone en cola un evento on-chain en estado transitorio CONFIRMING (buffer de 32 bloques).
   */
  stageEvent<TEventType extends StagedEventType>(
    eventType: TEventType,
    blockNumber: bigint,
    txHash: string,
    data: StagedEventData<TEventType>,
  ): void {
    const id = `${txHash}-${eventType}`;
    // Deduplicación por `(txHash, tipo)`: si un ciclo de reconciliación falla a mitad y repite el
    // mismo rango de bloques, el evento no se apila dos veces (antes el `id` se calculaba y no se
    // usaba para nada: histórico y avisos duplicados).
    if (this.stagedEvents.some((staged) => staged.id === id)) return;

    // El genérico correlaciona `data` con `eventType`, pero TypeScript no puede expresar «un miembro
    // cualquiera de la unión»: se afirma una vez, aquí, sobre la construcción ya validada arriba.
    const staged = {
      id,
      eventType,
      blockNumber,
      txHash,
      data,
      receivedAt: Date.now(),
    } as StagedEvent;
    this.stagedEvents.push(staged);

    // Si es una venta, marcar de inmediato en BD como CONFIRMING
    if (staged.eventType === "NFTSold" && staged.data.tokenId) {
      void this.nftsRepo.updateNFTStatus(staged.data.tokenId.toString(), "CONFIRMING");
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
    // eslint-disable-next-line no-console -- traza operativa del consolidador: formato de log de stdout ya consumido por la operación (no es un error)
    console.log(`[EventListener] Consolidando evento ${event.eventType} (Tx: ${event.txHash}) con las confirmaciones requeridas.`);

    if (event.eventType === "NFTMinted") {
      const { tokenId, room, dateYYYYMMDD, roomType, price } = event.data;
      const onChain = await this.resolveMintState(BigInt(tokenId));
      if (onChain === null) {
        // Estado indeterminado (RPC): no se escribe una fila inventada. El evento ya se consumió,
        // así que el próximo ciclo de reconciliación volverá a apilarlo desde los logs.
        return;
      }
      // El tipo viene del evento como texto: se traduce con el vocabulario del maestro. Antes era
      // `=== "suite" ? "SUITE" : "SIMPLE"`, así que una habitación **doble** se persistía como
      // simple y el catálogo no podía filtrarla (M9). Si el evento trae un tipo desconocido se cae
      // al maestro por número de habitación.
      const roomTypeDb = toRoomTypeDb(String(roomType)) ?? toRoomTypeDb(roomTypeOf(Number(room)));
      if (roomTypeDb === null) {
        // Ni el evento ni el maestro reconocen la habitación: escribir la fila con un tipo inventado
        // sería peor que no escribirla, porque el catálogo la mostraría mal. Se registra y no se
        // escribe (la reconciliación lo reintentará si el problema era transitorio).
        console.error(
          `[EventListener] Mint con tipo de habitación desconocido (token ${String(tokenId)}, habitación ${String(room)}, tipo "${String(roomType)}"): no se escribe la fila`,
        );
        return;
      }
      await this.nftsRepo.upsertNFT({
        tokenId: tokenId.toString(),
        roomNumber: Number(room),
        roomType: roomTypeDb,
        checkInDate: yyyymmddToIso(Number(dateYYYYMMDD)),
        basePriceWei: price.toString(),
        status: onChain.status,
        currentOwner: onChain.owner,
        txHashMint: event.txHash,
        onChainAnchored: true,
      });
      return;
    }

    if (event.eventType === "NFTBurned") {
      await this.nftsRepo.updateNFTStatus(event.data.tokenId.toString(), "BURNED");
      return;
    }

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
   *
   * **Lee Y APILA** los eventos del contrato canónico (antes solo contaba logs, así que la
   * «reconciliación» no reconciliaba nada). Los eventos quedan en estado transitorio y se
   * consolidan al alcanzar las confirmaciones configuradas.
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
            address: this.config.nftAddress,
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

      for (const log of logs) {
        this.stageFromLog(log);
      }

      totalLogsCount += logs.length;
      currentFrom = currentTo + 1n;
    }

    return totalLogsCount;
  }

  /** Traduce un log del contrato canónico al evento de dominio y lo apila. */
  private stageFromLog(log: Log): void {
    try {
      const decoded = decodeEventLog({
        abi: Object.values(CANONICAL_EVENTS),
        data: log.data,
        topics: log.topics,
      });
      const blockNumber = log.blockNumber ?? 0n;
      const txHash = log.transactionHash ?? "0x";

      switch (decoded.eventName) {
        case "Mint":
          this.stageEvent("NFTMinted", blockNumber, txHash, {
            tokenId: decoded.args.tokenId,
            room: decoded.args.room,
            dateYYYYMMDD: decoded.args.dateYYYYMMDD,
            roomType: decoded.args.roomType,
            price: decoded.args.price,
          });
          break;
        case "Sale":
          this.stageEvent("NFTSold", blockNumber, txHash, {
            tokenId: decoded.args.tokenId,
            seller: decoded.args.seller,
            buyer: decoded.args.buyer,
            priceInWei: decoded.args.price,
            royaltyAmount: 0n,
            isSecondary: Number(decoded.args.saleType) === 1,
          });
          break;
        case "Listed":
          this.stageEvent("NFTListed", blockNumber, txHash, {
            tokenId: decoded.args.tokenId,
            seller: decoded.args.seller,
            priceInWei: decoded.args.price,
          });
          break;
        case "CheckedIn":
          this.stageEvent("NFTCheckedInOnChain", blockNumber, txHash, { tokenId: decoded.args.tokenId });
          break;
        case "Burn":
          this.stageEvent("NFTBurned", blockNumber, txHash, { tokenId: decoded.args.tokenId });
          break;
        case "RoyaltyPaid": {
          // `RoyaltyPaid` sale en la misma transacción que su `Sale`: se adjunta el importe real al
          // evento de venta ya apilado (si no, el histórico registraría royalty 0 en las reventas).
          const sale = this.stagedEvents.find(
            (staged) => staged.txHash === txHash && staged.eventType === "NFTSold",
          );
          if (sale?.eventType === "NFTSold") sale.data.royaltyAmount = decoded.args.amount;
          break;
        }
        default:
          break;
      }
    } catch {
      // Log de otro evento del mismo contrato (p. ej. transferencias ERC-721): se ignora.
    }
  }

  /**
   * Estado real del token cuando madura su `Mint`: si la noche ya se vendió (o se consumió) antes
   * de consolidar, la fila se escribe con el estado correcto en lugar de asumir «disponible».
   *
   * Devuelve `null` cuando el estado **no se puede determinar** (RPC caído): en ese caso el llamante
   * NO escribe nada. Escribir «disponible» a ciegas era el defecto que resucitaba noches quemadas
   * (verificación adversarial de M6): `ownerOf` revierte en un token inexistente —quemado— y el
   * `catch` genérico lo convertía en una fila `AVAILABLE` con propietario falso.
   */
  private async resolveMintState(
    tokenId: bigint,
  ): Promise<{ status: "AVAILABLE" | "SOLD" | "CHECKED_IN" | "BURNED"; owner: string } | null> {
    if (!this.publicClient) {
      return { status: "AVAILABLE", owner: this.config.nftAddress };
    }

    let owner: string;
    try {
      owner = (await this.publicClient.readContract({
        address: this.config.nftAddress,
        abi: [parseAbiItem("function ownerOf(uint256 tokenId) view returns (address)")],
        functionName: "ownerOf",
        args: [tokenId],
      })) as string;
    } catch {
      // Un revert de `ownerOf` significa que el token no existe: la noche se quemó (o nunca se
      // creó). Un fallo de RED no se puede distinguir aquí, así que se comprueba `soldOnce`: si
      // tampoco responde, no se escribe nada (fail-closed, se reintentará en el próximo ciclo).
      const soldOnce = await this.publicClient
        .readContract({
          address: this.config.nftAddress,
          abi: [parseAbiItem("function soldOnce(uint256 tokenId) view returns (bool)")],
          functionName: "soldOnce",
          args: [tokenId],
        })
        .catch(() => null);
      if (soldOnce === null) {
        console.warn(
          `[EventListener] No se pudo resolver el estado de la noche ${tokenId}: no se escribe la fila (se reintentará).`,
        );
        return null;
      }
      return { status: "BURNED", owner: ZERO_ADDRESS };
    }

    try {
      const [soldOnce, checkedIn] = await Promise.all([
        this.publicClient.readContract({
          address: this.config.nftAddress,
          abi: [parseAbiItem("function soldOnce(uint256 tokenId) view returns (bool)")],
          functionName: "soldOnce",
          args: [tokenId],
        }) as Promise<boolean>,
        this.publicClient.readContract({
          address: this.config.nftAddress,
          abi: [parseAbiItem("function isCheckedIn(uint256 tokenId) view returns (bool)")],
          functionName: "isCheckedIn",
          args: [tokenId],
        }) as Promise<boolean>,
      ]);
      return {
        status: checkedIn ? "CHECKED_IN" : soldOnce ? "SOLD" : "AVAILABLE",
        owner,
      };
    } catch {
      console.warn(
        `[EventListener] Estado incompleto de la noche ${tokenId}: no se escribe la fila (se reintentará).`,
      );
      return null;
    }
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

/** `AAAAMMDD` → `AAAA-MM-DD` (formato de `nfts.check_in_date`). */
function yyyymmddToIso(value: number): string {
  const raw = String(value).padStart(8, "0");
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

/** Propietario de un token inexistente (noche quemada): la fila no puede apuntar a nadie. */
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";


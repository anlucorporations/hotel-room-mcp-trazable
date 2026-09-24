import type { PublicClient, WalletClient, Address, Hex } from "viem";
import { formatEther } from "viem";
import { NFTsRepository } from "../db/repositories/nfts.repository";
import { NotificationQueueService } from "../queue/notifications";
import { verifyTicketJWS, type TicketPayload } from "../passes/jws";
import { hotelNightsAbi } from "../abi/hotel-nights";
import { acquireDistributedLock, consumeOnce, releaseDistributedLock, releaseOnce } from "../redis/client";

/** Códigos de error estables del check-in (la API los traduce a HTTP y la UI a mensajes). */
export type CheckInErrorCode =
  | "TICKET_INVALIDO"
  | "TICKET_YA_USADO"
  | "TOKEN_NO_ENCONTRADO"
  | "TITULARIDAD_CAMBIADA"
  | "TITULARIDAD_NO_VERIFICABLE"
  | "YA_CONSUMIDA"
  | "CHECKIN_EN_PROCESO"
  | "TOKEN_QUEMADO"
  | "NOCHE_NO_VENDIDA"
  | "CONTRATO_EN_PAUSA"
  | "ANCLAJE_FALLIDO"
  | "ANCLAJE_NO_CONFIGURADO"
  | "PRUEBA_POSESION_INVALIDA"
  | "PRUEBA_POSESION_CON_PII"
  | "MOTIVO_INVALIDO"
  | "RESERVA_NO_ENCONTRADA";

/**
 * Error de dominio del check-in. Lleva un `code` estable y un mensaje apto para el mostrador:
 * la API decide el HTTP por el código, nunca por el texto (que puede cambiar).
 */
export class CheckInError extends Error {
  constructor(
    readonly code: CheckInErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CheckInError";
  }
}

export interface ReceptionCheckInResult {
  status: "CHECKED_IN";
  tokenId: string;
  roomNumber: number;
  checkInDate: string;
  roomType: string;
  /** Hash de la transacción `markCheckedIn` ya difundida (ancla on-chain OBLIGATORIA, D-05). */
  onChainTxHash: Hex;
  /** Momento del ancla, dentro del mismo flujo (no es un despacho «en segundo plano»). */
  onChainAnchor: "BROADCAST";
  /** Tiempo total del check-in (SLA < 500 ms del RNF-03, medido en el servidor). */
  executionTimeMs: number;
}

export type PossessionProofType = "WALLET_ADDRESS" | "TX_HASH" | "VOUCHER_CODE";

/**
 * Motivos de contingencia: **vocabulario cerrado**, no texto libre (D-13/D-14).
 *
 * El estado auditado guardaba un `reason` de texto libre en la tabla de contingencias: la vía más
 * fácil para que un recepcionista escribiera «DNI del huésped 12345678Z» y lo dejara persistido en
 * la plataforma. Con una lista cerrada el campo solo puede contener uno de estos códigos.
 */
export const CONTINGENCY_REASONS = [
  "SIN_DISPOSITIVO",
  "RESGUARDO_IMPRESO",
  "FALLO_TECNICO",
  "OTRO",
] as const;

export type ContingencyReason = (typeof CONTINGENCY_REASONS)[number];

export interface ContingencyCheckInParams {
  roomNumber: number;
  checkInDate: string;
  possessionProofType: PossessionProofType;
  /** Prueba de posesión **sin datos personales** (D-13/D-14): wallet, hash de tx o código. */
  possessionProofValue: string;
  /** Uno de `CONTINGENCY_REASONS` (vocabulario cerrado). */
  reason: ContingencyReason;
}

export interface ReceptionConfig {
  nftContractAddress?: Address;
  receptionWalletAddress?: Address;
  /** Umbral de aviso de saldo de la hot-wallet (en la moneda nativa de la red). */
  minBalanceNative?: number;
  devopsEmail?: string;
}

/**
 * Consumo de un solo uso del `jti` del resguardo (D-05).
 *
 * Se abstrae para poder probar el servicio sin Redis; la implementación por defecto es la de
 * producción (Redis con `SET NX EX`), de modo que el uso único vale también con varias instancias
 * y con dos puestos de recepción escaneando a la vez.
 */
export interface TicketUseStore {
  consume(jti: string): Promise<boolean>;
  release(jti: string): Promise<void>;
}

export class RedisTicketUseStore implements TicketUseStore {
  /** TTL = vigencia máxima de un resguardo (7 días, la misma que emite `/api/qr`). */
  constructor(private readonly ttlSeconds: number = 7 * 24 * 3600) {}

  async consume(jti: string): Promise<boolean> {
    return consumeOnce(`hotel:ticket:used:${jti}`, this.ttlSeconds);
  }

  async release(jti: string): Promise<void> {
    await releaseOnce(`hotel:ticket:used:${jti}`);
  }
}

/**
 * Cerrojo por noche del check-in (Redis, `SET NX EX`).
 *
 * El resguardo de un solo uso cierra el doble escaneo del MISMO pase, pero la emisión puede dar
 * varios pases de la misma noche (basta pedir el resguardo dos veces) y el mostrador puede lanzar
 * dos check-ins a la vez: ambos leerían «noche libre», ambos simularían bien y ambos difundirían
 * una transacción —una revertiría on-chain— mostrando dos veces «check-in confirmado». El cerrojo
 * hace que el segundo puesto reciba un conflicto explícito en vez de un falso éxito.
 */
export interface CheckInLock {
  /** Devuelve el valor del cerrojo si se adquirió, o `null` si otro proceso lo tiene. */
  acquire(tokenId: string): Promise<string | null>;
  release(tokenId: string, lockValue: string): Promise<void>;
}

export class RedisCheckInLock implements CheckInLock {
  constructor(private readonly ttlSeconds: number = 15) {}

  async acquire(tokenId: string): Promise<string | null> {
    return acquireDistributedLock(`hotel:checkin:lock:${tokenId}`, this.ttlSeconds);
  }

  async release(tokenId: string, lockValue: string): Promise<void> {
    await releaseDistributedLock(`hotel:checkin:lock:${tokenId}`, lockValue);
  }
}

/**
 * Patrones ESTRICTOS de la prueba de posesión de contingencia.
 *
 * D-13/D-14: el check-in de contingencia no puede convertirse en un cajón de sastre donde el
 * mostrador teclee el nombre, el teléfono o el DNI del huésped. La verificación adversarial de M5
 * demostró que un patrón laxo de «código de resguardo» (`[A-Za-z0-9-]{6,32}`) aceptaba y persistía
 * `JuanPerezGarcia`, `600123456` o `12345678`. Por eso el código de resguardo exige el **prefijo que
 * emite el hotel** (`MDS-` + 6-12 caracteres en mayúsculas), de modo que un dato personal no puede
 * satisfacerlo por accidente.
 */
const POSSESSION_PROOF_PATTERNS: Record<PossessionProofType, RegExp> = {
  WALLET_ADDRESS: /^0x[0-9a-fA-F]{40}$/,
  TX_HASH: /^0x[0-9a-fA-F]{64}$/,
  VOUCHER_CODE: /^MDS-[A-Z0-9]{6,12}$/,
};

/** Documentos de identidad: se detectan para dar un mensaje explícito (nunca se almacenan). */
const IDENTITY_DOCUMENT_PATTERNS: readonly RegExp[] = [
  /^\d{8}[A-Za-z]$/, // DNI
  /^[XYZ]\d{7}[A-Za-z]$/i, // NIE
  /^[A-Z]{1,3}\d{6,9}$/i, // pasaporte (aproximado)
];

/**
 * Normaliza un valor para la detección de documentos: quita separadores que se usan al teclear
 * (`12345678-Z`, `12345678 Z`, `123.456.78Z`). Sin esto, un DNI con guion esquivaba la detección y
 * acababa almacenado como si fuera un código de resguardo.
 */
const withoutSeparators = (value: string): string => value.replace(/[\s.\-/]/g, "");

/**
 * Servicio de recepción (CU-12, docs/SRS.md §9, US-14, D-05, D-13).
 *
 * Dos caminos, ambos con la **misma obligación**: el check-in acaba anclado on-chain con
 * `markCheckedIn(tokenId)` (irreversible) o no se da por bueno.
 *
 *   - `processTicketCheckIn`: resguardo QR/JWS del huésped, **de un solo uso** (`jti` en Redis).
 *   - `processContingencyCheckIn`: mostrador, con prueba de posesión sin PII.
 *
 * Qué se corrigió respecto al estado auditado (H-05): el servicio usaba el ABI de la generación
 * legacy, se instanciaba **sin clientes** (el ancla nunca ocurría) y devolvía éxito con un booleano
 * `onChainTxDispatched: false`. Ahora el ancla es requisito: sin wallet configurada, sin RPC o con
 * un revert, el check-in **falla** y el mostrador lo ve.
 */
export class ReceptionService {
  private nftsRepo: NFTsRepository;
  private notificationQueue: NotificationQueueService;
  private publicClient?: PublicClient;
  private walletClient?: WalletClient | null;
  private config: ReceptionConfig;
  private ticketUse: TicketUseStore;
  private checkInLock: CheckInLock;

  /**
   * Cola de serialización de las transacciones de anclaje (D-05).
   *
   * `markCheckedIn` se firma con una única hot-wallet de recepción: dos check-ins simultáneos en
   * dos puestos leerían el mismo `nonce` y una de las dos transacciones se perdería por colisión.
   * Encadenando cada anclaje al anterior, viem resuelve el `nonce` «pending» ya avanzado y la
   * secuencia es correcta sin gestión manual de nonces.
   */
  private anchorQueue: Promise<unknown> = Promise.resolve();

  constructor(
    nftsRepo: NFTsRepository = new NFTsRepository(),
    notificationQueue: NotificationQueueService = new NotificationQueueService(),
    publicClient?: PublicClient,
    walletClient?: WalletClient | null,
    config: ReceptionConfig = {},
    ticketUse: TicketUseStore = new RedisTicketUseStore(),
    checkInLock: CheckInLock = new RedisCheckInLock(),
  ) {
    this.nftsRepo = nftsRepo;
    this.notificationQueue = notificationQueue;
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.config = config;
    this.ticketUse = ticketUse;
    this.checkInLock = checkInLock;
  }

  /**
   * Check-in por resguardo digital (US-14) con ancla on-chain obligatoria (D-05).
   *
   * Orden deliberado: verificar el resguardo → **consumirlo** (uso único) → comprobar el estado
   * off-chain → **anclar on-chain** → marcar la base.
   *
   * El consumo va primero porque es la garantía distribuida que cierra el doble escaneo: si dos
   * puestos escanean el mismo QR a la vez, exactamente uno gana el `SET NX` y el otro recibe
   * `TICKET_YA_USADO`, sin depender de leer el estado de la base. Y el ancla va ANTES del marcado
   * off-chain porque es la fuente de verdad irreversible: si el ancla no se difunde, el check-in no
   * ocurrió y la noche sigue disponible (el estado anterior marcaba la noche como consumida sin
   * ancla real).
   */
  async processTicketCheckIn(ticketJws: string): Promise<ReceptionCheckInResult> {
    const started = Date.now();

    let payload: TicketPayload;
    try {
      payload = await verifyTicketJWS(ticketJws);
    } catch (error: unknown) {
      throw new CheckInError(
        "TICKET_INVALIDO",
        error instanceof Error ? error.message : "Resguardo inválido o corrupto",
      );
    }

    // El `tokenId` de un resguardo válido es un entero positivo (codificación del contrato). Un
    // valor no numérico no identifica ninguna noche y no puede convertirse en `uint256`: se rechaza
    // como resguardo inválido en lugar de degradar a «titularidad no verificable» (M7 · H3).
    if (!/^\d+$/.test(payload.tokenId)) {
      throw new CheckInError(
        "TICKET_INVALIDO",
        "El resguardo no identifica una noche válida (identificador no numérico)",
      );
    }

    // Uso único del resguardo: cierra el doble escaneo (incluso simultáneo).
    const firstUse = await this.ticketUse.consume(payload.jti);
    if (!firstUse) {
      throw new CheckInError(
        "TICKET_YA_USADO",
        "Este resguardo ya se utilizó para un check-in; cada pase sirve una sola vez",
      );
    }

    // Cerrojo por noche: aunque el pase sea de un solo uso, de la MISMA noche se pueden haber
    // emitido varios pases (basta pedir el resguardo dos veces) y dos puestos podrían confirmar
    // ambos. El segundo recibe un conflicto explícito en vez de un falso «check-in confirmado».
    const lockValue = await this.checkInLock.acquire(payload.tokenId);
    if (lockValue === null) {
      await this.ticketUse.release(payload.jti).catch(() => undefined);
      throw new CheckInError(
        "CHECKIN_EN_PROCESO",
        "Otro puesto está procesando el check-in de esta noche; espera unos segundos y reinténtalo",
      );
    }

    try {
      const nft = await this.nftsRepo.getNFTById(payload.tokenId);
      if (!nft) {
        throw new CheckInError("TOKEN_NO_ENCONTRADO", `Noche no encontrada: ${payload.tokenId}`);
      }

      // Titularidad ON-CHAIN (M7 · H3). El resguardo se emite al propietario del momento y vive
      // días: si la noche se revende después, el pase antiguo NO puede canjearla. El índice
      // off-chain no sirve como autoridad aquí —es un espejo del listener, con retraso y sin cota si
      // se atasca— y el contrato tampoco comprueba propiedad en `markCheckedIn` (solo exige el rol
      // de recepción), así que la comprobación tiene que hacerla este servicio contra `ownerOf`.
      const onChainOwner = await this.readCurrentOwnerOnChain(payload.tokenId);
      if (onChainOwner === "no-existe") {
        throw new CheckInError(
          "TOKEN_QUEMADO",
          "Esa noche ya no existe en la cadena (quemada o nunca emitida): no se puede hacer check-in",
        );
      }
      if (onChainOwner === null) {
        throw new CheckInError(
          "TITULARIDAD_NO_VERIFICABLE",
          "No se pudo comprobar la titularidad en la cadena; el check-in no se registra hasta poder verificarla",
        );
      }
      if (onChainOwner.toLowerCase() !== payload.guestWallet.toLowerCase()) {
        throw new CheckInError(
          "TITULARIDAD_CAMBIADA",
          "El resguardo corresponde a un propietario anterior de la noche; el titular actual debe emitir uno nuevo",
        );
      }
      if (nft.currentOwner.toLowerCase() !== onChainOwner.toLowerCase()) {
        // No bloquea (la cadena ya autorizó), pero se registra: el índice va por detrás y conviene
        // saberlo. No lleva datos personales: solo el token y dos direcciones públicas.
        console.warn(
          JSON.stringify({
            event: "INDEX_OUT_OF_SYNC",
            tokenId: payload.tokenId,
            indexOwner: nft.currentOwner,
            onChainOwner,
          }),
        );
      }

      this.assertNotConsumed(nft.status, nft.roomNumber, nft.tokenId);

      const onChainTxHash = await this.anchorCheckInOnChain(nft.tokenId);

      await this.nftsRepo.markCheckedIn(nft.tokenId);

      return {
        status: "CHECKED_IN",
        tokenId: nft.tokenId,
        roomNumber: nft.roomNumber,
        checkInDate: nft.checkInDate,
        roomType: nft.roomType,
        onChainTxHash,
        onChainAnchor: "BROADCAST",
        executionTimeMs: Date.now() - started,
      };
    } catch (error: unknown) {
      // Compensación: si el resguardo no llegó a consumir la noche, vuelve a estar disponible para
      // reintentar (no se le «gasta» el pase al huésped por un RPC caído, una wallet sin fondos o
      // una noche revendida). La única excepción es que la noche ya esté consumida: ahí el pase sí
      // está legítimamente gastado.
      const legitimatelySpent = error instanceof CheckInError && error.code === "YA_CONSUMIDA";
      if (!legitimatelySpent) {
        await this.ticketUse.release(payload.jti).catch(() => undefined);
      }
      throw error;
    } finally {
      await this.checkInLock.release(payload.tokenId, lockValue).catch(() => undefined);
    }
  }

  /**
   * Check-in de contingencia para huéspedes sin dispositivo (mostrador).
   *
   * La prueba de posesión se valida contra un patrón estricto por tipo: el mostrador **no puede**
   * registrar aquí datos personales (D-13/D-14). El check-in sigue anclándose on-chain igual que el
   * camino del QR: la contingencia cambia cómo se acredita la posesión, no la garantía.
   */
  async processContingencyCheckIn(
    params: ContingencyCheckInParams,
  ): Promise<ReceptionCheckInResult> {
    const started = Date.now();

    this.validatePossessionProof(params.possessionProofType, params.possessionProofValue);
    this.validateReason(params.reason);

    const nft = await this.nftsRepo.findNFTByRoomAndDate(params.roomNumber, params.checkInDate);
    if (!nft) {
      throw new CheckInError(
        "RESERVA_NO_ENCONTRADA",
        `No se encontró reserva para la habitación ${params.roomNumber} en fecha ${params.checkInDate}`,
      );
    }

    // Mismo cerrojo por noche que el camino del QR (dos puestos, dos check-ins simultáneos).
    const lockValue = await this.checkInLock.acquire(nft.tokenId);
    if (lockValue === null) {
      throw new CheckInError(
        "CHECKIN_EN_PROCESO",
        "Otro puesto está procesando el check-in de esta noche; espera unos segundos y reinténtalo",
      );
    }

    try {
      const current = await this.nftsRepo.getNFTById(nft.tokenId);
      this.assertNotConsumed(
        current?.status ?? nft.status,
        current?.roomNumber ?? nft.roomNumber,
        nft.tokenId,
      );

      const onChainTxHash = await this.anchorCheckInOnChain(nft.tokenId);

      await this.nftsRepo.markCheckedIn(nft.tokenId);
      await this.nftsRepo.recordContingencyCheckIn(nft.tokenId, {
        roomNumber: params.roomNumber,
        checkInDate: params.checkInDate,
        possessionProofType: params.possessionProofType,
        possessionProofValue: params.possessionProofValue,
        reason: params.reason,
      });

      return {
        status: "CHECKED_IN",
        tokenId: nft.tokenId,
        roomNumber: nft.roomNumber,
        checkInDate: nft.checkInDate,
        roomType: nft.roomType,
        onChainTxHash,
        onChainAnchor: "BROADCAST",
        executionTimeMs: Date.now() - started,
      };
    } finally {
      await this.checkInLock.release(nft.tokenId, lockValue).catch(() => undefined);
    }
  }

  /** Rechaza el check-in si la noche ya se consumió o se quemó (D-05). */
  private assertNotConsumed(status: string, roomNumber: number, tokenId: string): void {
    if (status === "CHECKED_IN") {
      throw new CheckInError(
        "YA_CONSUMIDA",
        `La habitación ${roomNumber} ya ha realizado el check-in (noche ${tokenId} consumida)`,
      );
    }
    if (status === "BURNED") {
      throw new CheckInError("TOKEN_QUEMADO", `La noche ${tokenId} fue quemada por expiración`);
    }
  }

  /**
   * Valida la prueba de posesión de contingencia (sin PII). Lanza `CheckInError` con un mensaje
   * accionable para el mostrador.
   */
  private validatePossessionProof(type: PossessionProofType, value: string): void {
    const pattern = POSSESSION_PROOF_PATTERNS[type];
    if (!pattern) {
      throw new CheckInError(
        "PRUEBA_POSESION_INVALIDA",
        `Tipo de prueba de posesión no admitido: ${String(type)}`,
      );
    }

    const trimmed = value?.trim() ?? "";
    const compact = withoutSeparators(trimmed);
    if (IDENTITY_DOCUMENT_PATTERNS.some((identity) => identity.test(compact))) {
      throw new CheckInError(
        "PRUEBA_POSESION_CON_PII",
        "No se admiten documentos de identidad: el registro de viajeros (RD 933/2021) se hace en el PMS del hotel, fuera de la plataforma",
      );
    }

    if (!pattern.test(trimmed)) {
      throw new CheckInError(
        "PRUEBA_POSESION_INVALIDA",
        type === "WALLET_ADDRESS"
          ? "La prueba debe ser la dirección de wallet compradora (0x + 40 hex)"
          : type === "TX_HASH"
            ? "La prueba debe ser el hash de la transacción (0x + 64 hex)"
            : "La prueba debe ser un código de resguardo emitido por el hotel (MDS-XXXXXXXX)",
      );
    }
  }

  /**
   * El motivo de contingencia pertenece a un vocabulario cerrado: es un campo que se persiste, y
   * con texto libre era la vía evidente para guardar datos personales (nombre, DNI) en la base.
   */
  private validateReason(reason: string): void {
    if (!CONTINGENCY_REASONS.includes(reason as ContingencyReason)) {
      throw new CheckInError(
        "MOTIVO_INVALIDO",
        `Motivo de contingencia no admitido. Valores válidos: ${CONTINGENCY_REASONS.join(", ")}`,
      );
    }
  }

  /**
   * Titularidad actual de la noche **según la cadena** (`ownerOf` del contrato canónico).
   *
   * Tres resultados, y el tercero no se colapsa en los otros dos:
   *   - la dirección del propietario;
   *   - `"no-existe"` si el contrato responde que ese token no existe (noche quemada);
   *   - `null` si no se pudo preguntar (RPC caído). Entonces el check-in NO se registra.
   */
  private async readCurrentOwnerOnChain(tokenId: string): Promise<string | "no-existe" | null> {
    if (!this.publicClient || !this.config.nftContractAddress) {
      throw new CheckInError(
        "ANCLAJE_NO_CONFIGURADO",
        "La recepción no tiene configurada la lectura on-chain: la titularidad no se puede verificar y el check-in no se registra",
      );
    }

    try {
      return (await this.publicClient.readContract({
        address: this.config.nftContractAddress,
        abi: hotelNightsAbi,
        functionName: "ownerOf",
        args: [BigInt(tokenId)],
      })) as string;
    } catch (error: unknown) {
      // Un revert del contrato es una RESPUESTA (el token no existe); si no hay nombre de revert,
      // el fallo es de transporte y la titularidad queda sin verificar. Se deja rastro del motivo.
      const revertName = revertErrorName(error);
      if (revertName === null) {
        console.error(
          `[ReceptionService] No se pudo leer ownerOf(${tokenId}) on-chain: ${errorText(error)}`,
        );
        return null;
      }
      return "no-existe";
    }
  }

  /**
   * Ancla el check-in en la cadena: difunde `markCheckedIn(tokenId)` con el contrato **canónico**
   * y exige un hash. Cualquier fallo (sin wallet, sin RPC, revert) se propaga como `CheckInError`.
   */
  private async anchorCheckInOnChain(tokenId: string): Promise<Hex> {
    if (!this.walletClient || !this.publicClient || !this.config.nftContractAddress) {
      throw new CheckInError(
        "ANCLAJE_NO_CONFIGURADO",
        "La recepción no tiene configurada la wallet on-chain: el check-in no puede anclarse y no se registra",
      );
    }

    return this.serializeAnchor(async () => {
      await this.warnIfReceptionWalletIsLow();

      const account = this.walletClient?.account;
      if (!account) {
        throw new CheckInError(
          "ANCLAJE_NO_CONFIGURADO",
          "La wallet de recepción no tiene cuenta asociada: el check-in no puede anclarse",
        );
      }

      try {
        // Simulación previa OBLIGATORIA: una transacción firmada se difunde aunque vaya a revertir
        // (el revert solo se ve en el recibo), así que sin simular no se podrían detectar
        // `AlreadyCheckedIn` / `NightNotSold` y se marcaría la base con un ancla fallida. Simular
        // cuesta una llamada RPC y no espera minado: mantiene el check-in por debajo del SLA.
        await this.publicClient!.simulateContract({
          address: this.config.nftContractAddress!,
          abi: hotelNightsAbi,
          functionName: "markCheckedIn",
          args: [BigInt(tokenId)],
          account,
        });

        return await this.walletClient!.writeContract({
          address: this.config.nftContractAddress!,
          abi: hotelNightsAbi,
          functionName: "markCheckedIn",
          args: [BigInt(tokenId)],
          account,
          chain: this.walletClient!.chain,
        });
      } catch (error: unknown) {
        const revert = revertErrorName(error);

        // La cadena dice que la noche ya está consumida (p. ej. la base se recreó): se reconcilia
        // el estado off-chain para que la web converja y se informa con claridad.
        if (revert === "AlreadyCheckedIn") {
          await this.nftsRepo.markCheckedIn(tokenId).catch(() => undefined);
          throw new CheckInError(
            "YA_CONSUMIDA",
            "La noche ya estaba consumida on-chain (check-in previo); se ha reconciliado el estado local",
          );
        }
        if (revert === "NightNotSold") {
          throw new CheckInError(
            "NOCHE_NO_VENDIDA",
            "La noche no tiene venta primaria registrada: solo puede hacerse check-in de noches vendidas",
          );
        }
        // El contrato está en pausa (`markCheckedIn` es `whenNotPaused`): NO es un fallo de anclaje
        // ni un problema de RPC/wallet. Se dice lo que pasa (M7 · H4) en lugar de reportar un 502
        // «ANCLAJE_FALLIDO» que mandaba a recepción a buscar el problema donde no está.
        if (revert === "EnforcedPause") {
          throw new CheckInError(
            "CONTRATO_EN_PAUSA",
            "El contrato canónico está en pausa: el hotel ha detenido las operaciones y el check-in no puede registrarse on-chain hasta reanudarlo",
          );
        }

        throw new CheckInError(
          "ANCLAJE_FALLIDO",
          `No se pudo anclar el check-in on-chain: ${revert ?? errorText(error)}`,
        );
      }
    });
  }

  /** Encadena el anclaje al anterior (nonces secuenciales, D-05). */
  private serializeAnchor<T>(task: () => Promise<T>): Promise<T> {
    const run = this.anchorQueue.then(task, task);
    this.anchorQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Alerta de saldo bajo de la hot-wallet de recepción (D-05/D-12). */
  private async warnIfReceptionWalletIsLow(): Promise<void> {
    if (!this.publicClient || !this.config.receptionWalletAddress) return;

    const balanceWei = await this.publicClient.getBalance({
      address: this.config.receptionWalletAddress,
    });
    const balanceNative = parseFloat(formatEther(balanceWei));
    const minBalance = this.config.minBalanceNative ?? 5;

    if (balanceNative >= minBalance) return;

    const devopsEmail =
      this.config.devopsEmail || process.env.DEVOPS_ALERT_EMAIL || "devops@marinadelsol.es";
    try {
      await this.notificationQueue.enqueueNotification("DEVOPS_ALERT", devopsEmail, {
        subject: "ALERTA: saldo bajo en la hot-wallet de recepción",
        address: this.config.receptionWalletAddress,
        currentBalanceNative: balanceNative,
        thresholdNative: minBalance,
      });
    } catch (error: unknown) {
      // La alerta no puede bloquear el check-in del huésped: se registra y se sigue.
      console.error("[ReceptionService] No se pudo encolar la alerta de saldo:", error);
    }
  }
}

/** Nombre del error de revert del contrato, buscándolo en la cadena de `cause` de viem. */
function revertErrorName(error: unknown): string | null {
  let current = error as { data?: { errorName?: string }; cause?: unknown } | undefined;
  while (current) {
    if (typeof current.data?.errorName === "string" && current.data.errorName.length > 0) {
      return current.data.errorName;
    }
    current = current.cause as typeof current;
  }
  return null;
}

function errorText(error: unknown): string {
  const parts: string[] = [];
  let current = error as { shortMessage?: string; message?: string; cause?: unknown } | undefined;
  while (current) {
    if (current.shortMessage) parts.push(current.shortMessage);
    if (current.message) parts.push(current.message);
    current = current.cause as typeof current;
  }
  return parts.join(" | ") || "error desconocido";
}

import type { PublicClient, WalletClient, Address, Hex } from "viem";
import { decodeEventLog, formatEther, getAddress } from "viem";
import { NFTsRepository } from "../db/repositories/nfts.repository";
import { acquireDistributedLock, releaseDistributedLock } from "../redis/client";
import { NotificationQueueService } from "../queue/notifications";
import { hotelNightsAbi } from "../abi/hotel-nights";

export interface BurnerOptions {
  nftContractAddress: Address;
  /** Hot-wallet con `BURNER_ROLE` (en producción, dedicada y con saldo vigilado). */
  operatorAddress: Address;
  /** Umbral de aviso de saldo (en la moneda nativa de la red). */
  minBalanceNative?: number;
  devopsEmail?: string;
  /** No difunde nada: solo calcula y registra lo que quemaría. */
  dryRun?: boolean;
  /**
   * Reloj para **este ciclo**. El planificador pasa la hora del último bloque de la cadena, que es
   * la que decide la caducidad en el contrato (`_isExpired` usa el `block.timestamp`): con el reloj
   * de la máquina, una cadena adelantada o atrasada haría quemar antes de tiempo o no quemar.
   */
  now?: () => Date;
}

export interface BurnCycleResult {
  /** `true` si el ciclo llegó a ejecutarse (aunque no hubiera nada que quemar). */
  readonly executed: boolean;
  readonly burnedTokensCount: number;
  readonly txHashes: readonly Hex[];
  /** Códigos estables: LOCKED · INSUFFICIENT_GAS · NO_TOKENS · COMPLETED · ERROR. */
  readonly reason: "LOCKED" | "INSUFFICIENT_GAS" | "NO_TOKENS" | "COMPLETED" | "ERROR";
  readonly skippedTokens?: readonly string[];
}

export interface BurnerServiceOptions {
  /**
   * Reloj inyectable. En el ciclo programado se usa la **hora de la cadena** (último bloque), que
   * es la que decide la caducidad en el contrato (`_isExpired`), no el reloj de la máquina: con
   * desfase entre ambos, el planificador quemaría antes de tiempo o nunca.
   */
  readonly now?: () => Date;
  readonly lockTtlSeconds?: number;
  /** Cerrojo del ciclo (Redis por defecto; inyectable para pruebas herméticas). */
  readonly lock?: BurnLock;
}

/** Cerrojo distribuido del ciclo de quema. */
export interface BurnLock {
  acquire(key: string, ttlSeconds: number): Promise<string | null>;
  release(key: string, value: string): Promise<void>;
}

export class RedisBurnLock implements BurnLock {
  acquire(key: string, ttlSeconds: number): Promise<string | null> {
    return acquireDistributedLock(key, ttlSeconds);
  }

  async release(key: string, value: string): Promise<void> {
    await releaseDistributedLock(key, value);
  }
}

/**
 * Quema programada de noches impagas (US-09, D-03).
 *
 * Qué corrige respecto al estado auditado (H-09):
 *   - firmaba `burnBatch(uint256[])` con el ABI de la generación **legacy** sobre el contrato
 *     canónico, donde esa función no existe: la transacción habría revertido siempre;
 *   - no esperaba al recibo ni comprobaba el resultado: marcaba las filas como `BURNED` en la base
 *     aunque la quema no hubiera ocurrido;
 *   - no troceaba el lote (el contrato limita `burnBatchMax`) y una sola noche inválida habría
 *     revertido el lote entero, dejando sin quemar las demás.
 *
 * Ahora: ABI canónico `burnExpired`, troceo por `burnBatchMax`, **simulación previa** por lote con
 * reintento token a token (se descartan y se registran los inválidos), espera del recibo y marcado
 * en la base **solo** de lo confirmado por los eventos `Burn`.
 */
export class BurnerService {
  private readonly nftsRepo: NFTsRepository;
  private readonly notificationQueue: NotificationQueueService;
  private readonly now: () => Date;
  private readonly lockTtlSeconds: number;
  private readonly lock: BurnLock;

  constructor(
    nftsRepo: NFTsRepository = new NFTsRepository(),
    notificationQueue: NotificationQueueService = new NotificationQueueService(),
    options: BurnerServiceOptions = {},
  ) {
    this.nftsRepo = nftsRepo;
    this.notificationQueue = notificationQueue;
    this.now = options.now ?? (() => new Date());
    this.lockTtlSeconds = options.lockTtlSeconds ?? 120;
    this.lock = options.lock ?? new RedisBurnLock();
  }

  /**
   * Ejecuta el ciclo de quema. El `lockKey` incluye el día para que, con varias instancias del
   * planificador, el ciclo se ejecute **una sola vez al día** (además del lock del propio ciclo).
   */
  async executeScheduledBurn(
    publicClient: PublicClient,
    walletClient: WalletClient | null,
    options: BurnerOptions,
    lockKey = "hotel:burn:lock",
  ): Promise<BurnCycleResult> {
    const minBalance = options.minBalanceNative ?? 1;
    const devopsEmail = options.devopsEmail || process.env.DEVOPS_ALERT_EMAIL || "devops@hotel.es";

    const lock = await this.lock.acquire(lockKey, this.lockTtlSeconds);
    if (!lock) {
      console.warn(`[Burner] No se pudo adquirir ${lockKey}: otra instancia está en ejecución.`);
      return { executed: false, burnedTokensCount: 0, txHashes: [], reason: "LOCKED" };
    }

    try {
      // 1. Saldo de la hot-wallet: sin gas no se quema, y se avisa.
      const balanceWei = await publicClient.getBalance({ address: options.operatorAddress });
      const balanceNative = Number.parseFloat(formatEther(balanceWei));
      if (balanceNative < minBalance) {
        const message = `Saldo de la wallet de quema (${options.operatorAddress}) en ${balanceNative} (< ${minBalance}). Quema suspendida.`;
        console.error(`[Burner] CRÍTICO: ${message}`);
        await this.notify(devopsEmail, {
          subject: "ALERTA CRÍTICA: saldo insuficiente en la wallet de quema",
          message,
          balanceNative,
          thresholdNative: minBalance,
          timestamp: this.now().toISOString(),
        });
        return { executed: false, burnedTokensCount: 0, txHashes: [], reason: "INSUFFICIENT_GAS" };
      }

      // 2. Fecha límite = hoy según el reloj del ciclo (la hora de la cadena si el planificador la
      //    proporciona, que es la que usa el contrato para caducar).
      const clock = options.now ?? this.now;
      const today = this.todayYYYYMMDD(clock);
      const todayIso = `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6, 8)}`;
      const expiredNfts = await this.nftsRepo.getUnsoldExpiredNFTs(todayIso);

      if (expiredNfts.length === 0) {
        // eslint-disable-next-line no-console -- traza operativa del planificador: formato de log de stdout ya consumido por la operación (no es un error)
        console.log("[Burner] No hay noches impagas caducadas pendientes de quema.");
        return { executed: true, burnedTokensCount: 0, txHashes: [], reason: "NO_TOKENS" };
      }

      const maxBatch = await this.readBurnBatchMax(publicClient, options.nftContractAddress);
      const candidates = expiredNfts.map((nft) => BigInt(nft.tokenId));
      // eslint-disable-next-line no-console -- traza operativa del planificador: formato de log de stdout ya consumido por la operación (no es un error)
      console.log(
        `[Burner] ${candidates.length} noches candidatas · lote máximo del contrato: ${maxBatch}`,
      );

      if (options.dryRun || !walletClient) {
        return {
          executed: false,
          burnedTokensCount: 0,
          txHashes: [],
          reason: options.dryRun ? "COMPLETED" : "ERROR",
          skippedTokens: candidates.map(String),
        };
      }

      const txHashes: Hex[] = [];
      const skipped: string[] = [];
      const confirmed: bigint[] = [];

      for (const chunk of chunked(candidates, maxBatch)) {
        const burnable = await this.filterBurnable(publicClient, walletClient, options, chunk, skipped);
        if (burnable.length === 0) continue;

        const { hash, burned } = await this.burnAndConfirm(publicClient, walletClient, options, burnable);
        txHashes.push(hash);
        confirmed.push(...burned);

        // El estado off-chain se actualiza **por lote confirmado** y solo con los tokens que el
        // recibo declara quemados (eventos `Burn`), no con los que se pretendía quemar. Además se
        // marca al terminar CADA lote: si un lote posterior falla, lo ya quemado en la cadena no
        // puede quedarse como «disponible» en el índice.
        for (const tokenId of burned) {
          await this.nftsRepo.updateNFTStatus(tokenId.toString(), "BURNED");
        }
        // eslint-disable-next-line no-console -- traza operativa del planificador: formato de log de stdout ya consumido por la operación (no es un error)
        console.log(`[Burner] Quema confirmada de ${burned.length} noches en ${hash}`);
      }

      // Reconciliación de descartes: un candidato que ya no existe on-chain está quemado (o lo
      // quemó otro operador) y el índice debe converger en vez de ofrecerlo eternamente.
      for (const tokenId of skipped) {
        if (await this.isGoneOnChain(publicClient, options.nftContractAddress, BigInt(tokenId))) {
          await this.nftsRepo.updateNFTStatus(tokenId, "BURNED");
          // eslint-disable-next-line no-console -- traza operativa del planificador: formato de log de stdout ya consumido por la operación (no es un error)
          console.log(`[Burner] Noche ${tokenId} ya no existe on-chain: reconciliada como BURNED.`);
        }
      }

      // Aviso a administración y DevOps.
      if (confirmed.length > 0) {
        await this.notificationQueue.enqueueNotification("BURN_EXECUTED", devopsEmail, {
          burnedCount: confirmed.length,
          tokenIds: confirmed.map(String),
          txHashes,
          date: todayIso,
        });
      }

      return {
        executed: true,
        burnedTokensCount: confirmed.length,
        txHashes,
        reason: "COMPLETED",
        skippedTokens: skipped.length > 0 ? skipped : undefined,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Burner] Fallo en el ciclo de quema: ${message}`);
      await this.notify(devopsEmail, {
        subject: "ALERTA: fallo en la quema programada",
        message,
        timestamp: this.now().toISOString(),
      });
      return { executed: false, burnedTokensCount: 0, txHashes: [], reason: "ERROR" };
    } finally {
      await this.lock.release(lockKey, lock).catch(() => undefined);
    }
  }

  /** `burnBatchMax()` del contrato: el lote se trocea para no superar el límite on-chain. */
  /**
   * Quema **una lista concreta** de noches (vía administrativa/relayer), no el inventario del índice.
   *
   * La usa el panel de caducadas: descubre las noches por **eventos on-chain**, así que puede incluir
   * noches que no están en el índice off-chain (`nfts`). Reutiliza el troceo por `burnBatchMax`, la
   * simulación por lote (que omite lo no quemable sin tumbar el resto) y la confirmación por recibo.
   *
   * No toma el cerrojo del ciclo programado: es una acción puntual del operador, y la unicidad la
   * garantizan el contrato (un token ya quemado no existe) y `filterBurnable`.
   */
  async burnTokens(
    publicClient: PublicClient,
    walletClient: WalletClient | null,
    options: BurnerOptions,
    tokenIds: readonly bigint[],
  ): Promise<BurnCycleResult> {
    const minBalance = options.minBalanceNative ?? 1;
    const devopsEmail = options.devopsEmail || process.env.DEVOPS_ALERT_EMAIL || "devops@hotel.es";

    if (!walletClient) {
      return { executed: false, burnedTokensCount: 0, txHashes: [], reason: "ERROR", skippedTokens: tokenIds.map(String) };
    }
    if (tokenIds.length === 0) {
      return { executed: true, burnedTokensCount: 0, txHashes: [], reason: "NO_TOKENS" };
    }

    // 1. Saldo del firmante: sin gas no se quema, y se avisa.
    const balanceWei = await publicClient.getBalance({ address: options.operatorAddress });
    const balanceNative = Number.parseFloat(formatEther(balanceWei));
    if (balanceNative < minBalance) {
      const message = `Saldo de la wallet de quema (${options.operatorAddress}) en ${balanceNative} (< ${minBalance}). Quema suspendida.`;
      console.error(`[Burner] CRÍTICO: ${message}`);
      await this.notify(devopsEmail, {
        subject: "ALERTA CRÍTICA: saldo insuficiente en la wallet de quema",
        message,
        balanceNative,
        thresholdNative: minBalance,
        timestamp: this.now().toISOString(),
      });
      return { executed: false, burnedTokensCount: 0, txHashes: [], reason: "INSUFFICIENT_GAS" };
    }

    // 2. Troceo por el límite del contrato, con simulación previa por lote.
    const maxBatch = await this.readBurnBatchMax(publicClient, options.nftContractAddress);
    const txHashes: Hex[] = [];
    const skipped: string[] = [];
    let burnedTokensCount = 0;

    for (let index = 0; index < tokenIds.length; index += maxBatch) {
      const chunk = tokenIds.slice(index, index + maxBatch);
      const burnable = await this.filterBurnable(publicClient, walletClient, options, chunk, skipped);
      if (burnable.length === 0) continue;
      const { hash, burned } = await this.burnAndConfirm(publicClient, walletClient, options, burnable);
      txHashes.push(hash);
      burnedTokensCount += burned.length;
    }

    if (txHashes.length === 0) {
      return { executed: true, burnedTokensCount: 0, txHashes: [], reason: "NO_TOKENS", skippedTokens: skipped };
    }
    return {
      executed: true,
      burnedTokensCount,
      txHashes,
      reason: "COMPLETED",
      ...(skipped.length > 0 ? { skippedTokens: skipped } : {}),
    };
  }

  private async readBurnBatchMax(
    publicClient: PublicClient,
    contractAddress: Address,
  ): Promise<number> {
    try {
      const max = (await publicClient.readContract({
        address: contractAddress,
        abi: hotelNightsAbi,
        functionName: "burnBatchMax",
      })) as bigint;
      return Math.max(1, Number(max));
    } catch {
      // Sin el getter, se usa un lote conservador en vez de arriesgar un revert global.
      return 20;
    }
  }

  /**
   * Simula el lote y, si revierte, prueba token a token para quedarse con los quemables. Un solo
   * token inválido (p. ej. una fila del índice que ya se vendió) no puede impedir la quema del
   * resto: sin esto, el lote entero revierte y no se quema nada.
   */
  private async filterBurnable(
    publicClient: PublicClient,
    walletClient: WalletClient,
    options: BurnerOptions,
    chunk: readonly bigint[],
    skipped: string[],
  ): Promise<bigint[]> {
    if (await this.canSimulate(publicClient, walletClient, options, chunk)) {
      return [...chunk];
    }

    const burnable: bigint[] = [];
    for (const tokenId of chunk) {
      if (await this.canSimulate(publicClient, walletClient, options, [tokenId])) {
        burnable.push(tokenId);
      } else {
        skipped.push(tokenId.toString());
        console.warn(`[Burner] Noche ${tokenId} no quemable (caducidad o estado): se omite.`);
      }
    }
    return burnable;
  }

  private async canSimulate(
    publicClient: PublicClient,
    walletClient: WalletClient,
    options: BurnerOptions,
    tokenIds: readonly bigint[],
  ): Promise<boolean> {
    try {
      await publicClient.simulateContract({
        address: options.nftContractAddress,
        abi: hotelNightsAbi,
        functionName: "burnExpired",
        args: [[...tokenIds]],
        account: walletClient.account ?? options.operatorAddress,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Difunde la quema, **espera el recibo** y devuelve los tokens que el recibo confirma quemados
   * (eventos `Burn`). Sin confirmación no se marca nada en la base; sin eventos `Burn` tampoco
   * (sería marcar por lo que se pretendía, no por lo que pasó).
   */
  private async burnAndConfirm(
    publicClient: PublicClient,
    walletClient: WalletClient,
    options: BurnerOptions,
    tokenIds: readonly bigint[],
  ): Promise<{ hash: Hex; burned: bigint[] }> {
    const hash = await walletClient.writeContract({
      address: options.nftContractAddress,
      abi: hotelNightsAbi,
      functionName: "burnExpired",
      args: [[...tokenIds]],
      account: walletClient.account ?? options.operatorAddress,
      chain: walletClient.chain,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`La quema ${hash} revirtió on-chain`);
    }

    const burned: bigint[] = [];
    for (const log of receipt.logs) {
      if (getAddress(log.address) !== getAddress(options.nftContractAddress)) continue;
      try {
        const decoded = decodeEventLog({ abi: hotelNightsAbi, data: log.data, topics: log.topics });
        if (decoded.eventName === "Burn") {
          burned.push((decoded.args as { tokenId: bigint }).tokenId);
        }
      } catch {
        // Otros eventos del mismo contrato (transferencias ERC-721): se ignoran.
      }
    }

    if (burned.length === 0) {
      throw new Error(`El recibo de ${hash} no declara ningún evento Burn: no se marca nada en la base`);
    }

    return { hash, burned };
  }

  /** `true` si el token ya no existe on-chain (quemado): `ownerOf` revierte. */
  private async isGoneOnChain(
    publicClient: PublicClient,
    contractAddress: Address,
    tokenId: bigint,
  ): Promise<boolean> {
    try {
      await publicClient.readContract({
        address: contractAddress,
        abi: hotelNightsAbi,
        functionName: "ownerOf",
        args: [tokenId],
      });
      return false;
    } catch {
      return true;
    }
  }

  /** Aviso por la cola única de correo (nunca SMTP directo). */
  private async notify(recipient: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.notificationQueue.enqueueNotification("DEVOPS_ALERT", recipient, payload);
    } catch (error: unknown) {
      console.error("[Burner] No se pudo encolar la alerta:", error);
    }
  }

  /** Hoy en `AAAAMMDD` (UTC) según el reloj indicado. */
  private todayYYYYMMDD(clock: () => Date): string {
    const now = clock();
    return (
      now.getUTCFullYear().toString().padStart(4, "0") +
      (now.getUTCMonth() + 1).toString().padStart(2, "0") +
      now.getUTCDate().toString().padStart(2, "0")
    );
  }
}

/** Trocea una lista en lotes de tamaño `size` (el contrato limita el lote de quema). */
export function chunked<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

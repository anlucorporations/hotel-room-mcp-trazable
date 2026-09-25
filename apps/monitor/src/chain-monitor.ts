import type { Logger } from "pino";
import { createPublicClient, formatEther, http, type PublicClient } from "viem";
import { anvilChain, besuChain } from "@hotel/shared";
import type { Alerter } from "./types";

/**
 * Vigilancia de **cadena y saldo de gas** (D-12).
 *
 * El monitor solo miraba los `/health` de los servicios: si el RPC se quedaba mudo o la hot-wallet
 * de quema se quedaba sin gas, nadie se enteraba (los avisos de saldo vivían dentro de cada
 * servicio, así que un servicio caído también silenciaba su propia alerta).
 *
 * Aquí el monitor vigila desde fuera:
 *   - **viveza de la cadena**: si el número de bloque no avanza en `stallCycles` ciclos seguidos;
 *   - **saldo de las wallets** configuradas: por debajo del umbral se alerta (una vez, hasta que
 *     se recupere, para no inundar el correo);
 *   - el propio RPC: un fallo de lectura también es un aviso (con el mismo criterio de una sola vez).
 */
export interface GasWallet {
  readonly name: string;
  readonly address: `0x${string}`;
  /** Umbral de aviso en la moneda nativa (por defecto, el global del monitor). */
  readonly minNative?: number;
}

export interface ChainMonitorConfig {
  readonly rpcUrl: string;
  readonly chainId: number;
  readonly pollIntervalMs: number;
  readonly wallets: readonly GasWallet[];
  readonly minNative: number;
  /** Ciclos consecutivos sin bloque nuevo antes de avisar (por defecto 3). */
  readonly stallCycles?: number;
}

export interface ChainMonitorDeps {
  readonly config: ChainMonitorConfig;
  readonly alerter: Alerter;
  readonly logger: Logger;
  readonly signal: AbortSignal;
  /** Cliente inyectable (pruebas sin RPC). */
  readonly publicClient?: PublicClient;
}

export interface ChainStatus {
  readonly reachable: boolean;
  readonly headBlock: bigint | null;
  readonly stalledCycles: number;
  readonly lowBalances: readonly { name: string; address: string; balanceNative: number }[];
}

export interface ChainMonitor {
  tick(): Promise<ChainStatus>;
  stop(): void;
}

export function startChainMonitor(deps: ChainMonitorDeps): ChainMonitor {
  const { config, alerter, logger, signal } = deps;
  const chain = config.chainId === anvilChain.id ? anvilChain : besuChain;
  const client =
    deps.publicClient ?? createPublicClient({ chain, transport: http(config.rpcUrl) });

  const stallCycles = config.stallCycles ?? 3;
  let lastHead: bigint | null = null;
  let stalled = 0;
  // Estado de avisos: se alerta al ENTRAR en fallo, no en cada ciclo (evita inundar el correo).
  let chainAlerted = false;
  const walletsAlerted = new Set<string>();

  async function tick(): Promise<ChainStatus> {
    let head: bigint | null = null;
    try {
      head = await client.getBlockNumber();
      if (lastHead !== null && head === lastHead) {
        stalled += 1;
      } else {
        stalled = 0;
        if (chainAlerted) {
          chainAlerted = false;
          logger.info({ headBlock: head?.toString() }, "cadena recuperada: vuelven a entrar bloques");
        }
      }
      lastHead = head;

      if (stalled >= stallCycles && !chainAlerted) {
        chainAlerted = true;
        await alerter.sendAlert(
          "ALERTA: la cadena no avanza",
          `El RPC ${config.rpcUrl} (chain ${config.chainId}) lleva ${stalled} ciclos sin producir bloques nuevos (último: ${head}).`,
        );
        logger.error({ stalled, headBlock: head.toString() }, "alerta de cadena estancada enviada");
      }
    } catch (error: unknown) {
      stalled += 1;
      if (!chainAlerted) {
        chainAlerted = true;
        await alerter
          .sendAlert(
            "ALERTA: RPC de la cadena inalcanzable",
            `No se pudo leer el número de bloque de ${config.rpcUrl} (chain ${config.chainId}): ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
          .catch(() => undefined);
      }
      logger.error({ error }, "fallo al consultar la cadena");
      return { reachable: false, headBlock: null, stalledCycles: stalled, lowBalances: [] };
    }

    const lowBalances: { name: string; address: string; balanceNative: number }[] = [];
    for (const wallet of config.wallets) {
      const minimum = wallet.minNative ?? config.minNative;
      try {
        const balanceWei = await client.getBalance({ address: wallet.address });
        const balanceNative = Number.parseFloat(formatEther(balanceWei));
        if (balanceNative < minimum) {
          lowBalances.push({ name: wallet.name, address: wallet.address, balanceNative });
          if (!walletsAlerted.has(wallet.address)) {
            walletsAlerted.add(wallet.address);
            await alerter.sendAlert(
              `ALERTA: saldo bajo en la wallet ${wallet.name}`,
              `La wallet ${wallet.name} (${wallet.address}) tiene ${balanceNative} (< ${minimum}).`,
            );
            logger.error({ wallet: wallet.name, balanceNative, minimum }, "alerta de saldo bajo enviada");
          }
        } else if (walletsAlerted.delete(wallet.address)) {
          logger.info({ wallet: wallet.name, balanceNative }, "wallet recuperada: saldo por encima del umbral");
        }
      } catch (error: unknown) {
        logger.error({ wallet: wallet.name, error }, "no se pudo leer el saldo de la wallet");
      }
    }

    return { reachable: true, headBlock: head, stalledCycles: stalled, lowBalances };
  }

  const timer = setInterval(() => {
    if (signal.aborted) return;
    void tick();
  }, config.pollIntervalMs);
  timer.unref?.();

  logger.info(
    {
      rpcUrl: config.rpcUrl,
      chainId: config.chainId,
      wallets: config.wallets.map((wallet) => wallet.name),
      minNative: config.minNative,
      stallCycles,
    },
    "vigilancia de cadena y gas activa",
  );

  return { tick, stop: () => clearInterval(timer) };
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import { startChainMonitor, type ChainMonitorConfig } from "./chain-monitor";
import { silentLogger } from "./test-fakes";

/**
 * Vigilancia de cadena y gas (D-12).
 *
 * El monitor solo miraba los `/health` de los servicios: un RPC mudo o una hot-wallet sin gas no
 * generaban ninguna alerta (cada servicio avisaba de su propio saldo, así que un servicio caído
 * también silenciaba su alerta). Aquí se prueba la vigilancia desde fuera y, sobre todo, que **no
 * inunda** el correo: se avisa al entrar en fallo, no en cada ciclo.
 */

const WALLET_BURN = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as const;
const WALLET_RECEPTION = "0x90F79bf6EB2c4f870365E785982E1F101E93b906" as const;

function build(overrides: { balances?: Record<string, bigint>; blockNumber?: () => bigint } = {}) {
  const alerts: { subject: string; body: string }[] = [];
  const alerter = {
    sendAlert: vi.fn(async (subject: string, body: string) => {
      alerts.push({ subject, body });
    }),
  };
  const balances: Record<string, bigint> = overrides.balances ?? {
    [WALLET_BURN]: 10_000_000_000_000_000_000n,
    [WALLET_RECEPTION]: 10_000_000_000_000_000_000n,
  };
  const publicClient = {
    getBlockNumber: vi.fn(async () => overrides.blockNumber?.() ?? 100n),
    getBalance: vi.fn(async ({ address }: { address: string }) => balances[address] ?? 0n),
  } as never;

  const config: ChainMonitorConfig = {
    rpcUrl: "http://127.0.0.1:8545",
    chainId: 81234,
    pollIntervalMs: 60_000,
    minNative: 1,
    stallCycles: 3,
    wallets: [
      { name: "quema", address: WALLET_BURN },
      { name: "recepcion", address: WALLET_RECEPTION },
    ],
  };

  const monitor = startChainMonitor({
    config,
    alerter,
    logger: silentLogger() as never,
    signal: new AbortController().signal,
    publicClient,
  });

  return { monitor, alerts, alerter, balances, publicClient };
}

describe("vigilancia de cadena y gas (D-12)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("con la cadena viva y saldo suficiente no alerta", async () => {
    let block = 100n;
    const { monitor, alerts } = build({ blockNumber: () => (block += 1n) });

    const first = await monitor.tick();
    const second = await monitor.tick();

    expect(first.reachable).toBe(true);
    expect(second.headBlock).toBe(102n);
    expect(alerts).toHaveLength(0);
    monitor.stop();
  });

  it("avisa UNA vez cuando la cadena deja de avanzar (no en cada ciclo)", async () => {
    const { monitor, alerts } = build({ blockNumber: () => 100n });

    await monitor.tick();
    await monitor.tick();
    await monitor.tick(); // 3 ciclos sin bloque nuevo ⇒ alerta
    await monitor.tick();
    await monitor.tick();

    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.subject).toContain("no avanza");
    monitor.stop();
  });

  it("avisa si el saldo de una wallet baja del umbral y solo una vez", async () => {
    let block = 0n;
    const { monitor, alerts } = build({
      blockNumber: () => (block += 1n),
      balances: {
        [WALLET_BURN]: 0n, // sin gas
        [WALLET_RECEPTION]: 10_000_000_000_000_000_000n,
      },
    });

    const status = await monitor.tick();
    await monitor.tick();

    expect(status.lowBalances.map((wallet) => wallet.name)).toEqual(["quema"]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.subject).toContain("saldo bajo en la wallet quema");
    monitor.stop();
  });

  it("avisa del RPC inalcanzable y no lanza", async () => {
    const { monitor, alerts, publicClient } = build();
    (publicClient as { getBlockNumber: ReturnType<typeof vi.fn> }).getBlockNumber.mockRejectedValue(
      new Error("ECONNREFUSED"),
    );

    const status = await monitor.tick();

    expect(status.reachable).toBe(false);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.subject).toContain("inalcanzable");
    monitor.stop();
  });

  it("tras recuperarse el saldo, un nuevo bajón vuelve a avisar", async () => {
    let block = 0n;
    const balances: Record<string, bigint> = {
      [WALLET_BURN]: 0n,
      [WALLET_RECEPTION]: 10_000_000_000_000_000_000n,
    };
    const alerts: string[] = [];
    const publicClient = {
      getBlockNumber: vi.fn(async () => (block += 1n)),
      getBalance: vi.fn(async ({ address }: { address: string }) => balances[address] ?? 0n),
    } as never;
    const monitor = startChainMonitor({
      config: {
        rpcUrl: "http://127.0.0.1:8545",
        chainId: 81234,
        pollIntervalMs: 60_000,
        minNative: 1,
        wallets: [{ name: "quema", address: WALLET_BURN }],
      },
      alerter: {
        sendAlert: vi.fn(async (subject: string) => {
          alerts.push(subject);
        }),
      },
      logger: silentLogger() as never,
      signal: new AbortController().signal,
      publicClient,
    });

    await monitor.tick(); // aviso 1
    balances[WALLET_BURN] = 5_000_000_000_000_000_000n; // se recarga
    await monitor.tick(); // recuperada
    balances[WALLET_BURN] = 0n; // vuelve a caer
    await monitor.tick(); // aviso 2

    expect(alerts).toHaveLength(2);
    monitor.stop();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cliente viem falso: `ViemChainSource` construye su `PublicClient` con `createPublicClient`, así
 * que la frontera que se dobla es el módulo `viem` (nunca hay red en los tests del worker).
 */
const { client } = vi.hoisted(() => ({
  client: {
    getBlockNumber: vi.fn(),
    getContractEvents: vi.fn(),
    getBlock: vi.fn(),
  },
}));

import type * as ViemModule from "viem";

vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof ViemModule>()),
  createPublicClient: () => client,
}));

const { ViemChainSource } = await import("./chain-source");
const { anvilChain } = await import("@hotel/shared");

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;

const txHash = (seed: string): `0x${string}` => `0x${seed.repeat(32).slice(0, 64)}` as `0x${string}`;

/** Log crudo tal y como lo devuelve `getContractEvents` (ya decodificado por viem). */
const log = (over: Record<string, unknown> = {}) => ({
  transactionHash: txHash("a1"),
  logIndex: 0,
  blockNumber: 100n,
  args: {},
  ...over,
});

const source = (): InstanceType<typeof ViemChainSource> =>
  new ViemChainSource({ rpcUrl: "http://127.0.0.1:8545", chain: anvilChain, contractAddress: CONTRACT });

beforeEach(() => {
  vi.clearAllMocks();
  client.getBlockNumber.mockResolvedValue(200n);
  client.getContractEvents.mockResolvedValue([]);
  // Reloj de cadena determinista: cada bloque un segundo más que el anterior.
  client.getBlock.mockImplementation(async ({ blockNumber }: { blockNumber: bigint }) => ({
    timestamp: 1_780_000_000n + blockNumber,
  }));
});

describe("ViemChainSource · marcas temporales de bloque (D-16)", () => {
  it("adjunta a cada evento la marca temporal de su bloque, leyendo CADA bloque una sola vez", async () => {
    client.getContractEvents.mockImplementation(
      async ({ eventName }: { eventName: string }) =>
        eventName === "Sale"
          ? [
              log({ logIndex: 0, blockNumber: 100n, args: { tokenId: 1n, seller: "0xs", buyer: "0xb", price: 10n, saleType: 0 } }),
              log({ logIndex: 1, blockNumber: 100n, txHash: txHash("a2"), args: { tokenId: 2n, seller: "0xs", buyer: "0xb", price: 20n, saleType: 1 } }),
              log({ logIndex: 0, blockNumber: 120n, txHash: txHash("a3"), args: { tokenId: 3n, seller: "0xs", buyer: "0xb", price: 30n, saleType: 0 } }),
            ]
          : [],
    );

    const events = await source().getDomainLogs(50n, 200n);

    expect(events).toHaveLength(3);
    expect(events.map((event) => event.blockTimestamp)).toEqual([
      1_780_000_100, 1_780_000_100, 1_780_000_120,
    ]);
    // Dos eventos en el bloque 100 ⇒ una sola lectura de cabecera para ese bloque (y otra para el 120).
    expect(client.getBlock).toHaveBeenCalledTimes(2);
    expect(client.getBlock.mock.calls.map((call) => call[0].blockNumber)).toEqual([100n, 120n]);
  });

  it("reutiliza la caché entre llamadas: un bloque ya leído no se vuelve a pedir", async () => {
    client.getContractEvents.mockImplementation(
      async ({ eventName }: { eventName: string }) =>
        eventName === "Sale"
          ? [log({ blockNumber: 100n, args: { tokenId: 1n, seller: "0xs", buyer: "0xb", price: 10n, saleType: 0 } })]
          : [],
    );
    const chainSource = source();

    await chainSource.getDomainLogs(50n, 110n);
    const second = await chainSource.getDomainLogs(100n, 110n);

    expect(second[0]?.blockTimestamp).toBe(1_780_000_100);
    expect(client.getBlock).toHaveBeenCalledTimes(1);
  });

  it("si la cabecera de un bloque no se puede leer, el chunk FALLA (no se persiste una venta sin fecha)", async () => {
    client.getContractEvents.mockImplementation(
      async ({ eventName }: { eventName: string }) =>
        eventName === "Mint"
          ? [
              log({
                blockNumber: 100n,
                args: { tokenId: 1n, room: 102n, dateYYYYMMDD: 20_260_815n, roomType: "simple", price: 10n },
              }),
            ]
          : [],
    );
    client.getBlock.mockRejectedValue(new Error("RPC caído"));

    // Fail-closed: `catchUp` no avanza `last_block` y lo reintenta en el ciclo siguiente; lo que
    // NO ocurre es agregar la venta con fecha nula para siempre (la idempotencia la daría por vista).
    await expect(source().getDomainLogs(50n, 200n)).rejects.toThrow("RPC caído");
  });

  it("sin eventos no se lee ninguna cabecera (ni se toca el RPC de bloques)", async () => {
    const events = await source().getDomainLogs(50n, 200n);

    expect(events).toEqual([]);
    expect(client.getBlock).not.toHaveBeenCalled();
  });
});

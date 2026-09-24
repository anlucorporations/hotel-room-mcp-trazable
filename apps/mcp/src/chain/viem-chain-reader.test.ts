import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ViemModule from "viem";
import type { Address, Chain } from "viem";
import { GETLOGS_MAX_RANGE, anvilChain } from "@hotel/shared";

/**
 * Pruebas del adaptador viem `ViemChainReader` (el único punto del MCP que habla con el RPC).
 *
 * Se dobla **solo la frontera de red** (`createPublicClient`, que la clase construye en su
 * constructor) y se ejercita el resto del adaptador de verdad: el troceado de `getLogs` en chunks
 * de `GETLOGS_MAX_RANGE` (ADR-09, sin indexador), la decodificación de los eventos
 * `Mint`/`Sale`/`Listed`, la deduplicación de `tokenId`s y la derivación de señales con `ownerOf`
 * como único oráculo de existencia. Sin este doble no habría forma de probar la paginación, que es
 * justo donde vive el coste (y el riesgo) del adaptador.
 */

interface GetLogsCall {
  readonly event?: { readonly name?: string };
  readonly fromBlock?: bigint;
  readonly toBlock?: bigint;
  readonly args?: { readonly buyer?: string };
}

interface ReadContractCall {
  readonly functionName: string;
  readonly args?: readonly unknown[];
}

/** Doble del cliente viem: `getLogs` delega en la fuente que fije cada prueba. */
const h = vi.hoisted(() => {
  const client = {
    getBlockNumber: vi.fn(async (): Promise<bigint> => 12_000n),
    getLogs: vi.fn(async (_call: GetLogsCall): Promise<unknown[]> => []),
    readContract: vi.fn(async (call: ReadContractCall): Promise<unknown> => {
      throw new Error(`sin doble para readContract(${call.functionName})`);
    }),
  };
  return { client };
});

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof ViemModule>();
  return {
    ...actual,
    createPublicClient: (() => h.client) as unknown as typeof actual.createPublicClient,
  };
});

import { ViemChainReader } from "./viem-chain-reader";

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;
const WALLET = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address;

function reader(deploymentBlock: bigint, chain: Chain = anvilChain): InstanceType<typeof ViemChainReader> {
  return new ViemChainReader({ rpcUrl: "http://127.0.0.1:8545", chain, contractAddress: CONTRACT, deploymentBlock });
}

/** Fija la cabeza de cadena que devolverá el doble. */
function setHead(block: bigint): void {
  h.client.getBlockNumber.mockImplementation(async () => block);
}

/** Fija los logs que devolverá `getLogs` para un evento. */
function setLogs(name: string, logs: unknown[]): void {
  h.client.getLogs.mockImplementation(async (call: GetLogsCall) => (call.event?.name === name ? logs : []));
}

/** Fija la respuesta (o el revert) de `readContract` por nombre de función. */
function setReads(behaviours: Record<string, () => unknown>): void {
  h.client.readContract.mockImplementation(async (call: ReadContractCall) => {
    const behaviour = behaviours[call.functionName];
    if (!behaviour) throw new Error(`sin doble para readContract(${call.functionName})`);
    return behaviour();
  });
}

type GetLogsMock = { mock: { calls: GetLogsCall[][] } };

beforeEach(() => {
  vi.clearAllMocks();
  setHead(12_000n);
  h.client.getLogs.mockImplementation(async () => []);
});

describe("ViemChainReader · paginación de getLogs (ADR-09)", () => {
  it("trocea el rango en chunks de GETLOGS_MAX_RANGE y el último termina en la cabeza", async () => {
    await reader(0n).getMintRecords();

    const calls = (h.client.getLogs as unknown as GetLogsMock).mock.calls.map((c) => c[0]);
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => [c.fromBlock, c.toBlock])).toEqual([
      [0n, BigInt(GETLOGS_MAX_RANGE) - 1n],
      [BigInt(GETLOGS_MAX_RANGE), BigInt(GETLOGS_MAX_RANGE) * 2n - 1n],
      [BigInt(GETLOGS_MAX_RANGE) * 2n, 12_000n],
    ]);
    // Un solo `getBlockNumber` para calcular todos los chunks: no se re-consulta la cabeza.
    expect(h.client.getBlockNumber).toHaveBeenCalledTimes(1);
  });

  it("un head exactamente en el borde del chunk produce un único chunk", async () => {
    setHead(BigInt(GETLOGS_MAX_RANGE) - 1n);
    await reader(0n).getMintRecords();

    const calls = (h.client.getLogs as unknown as GetLogsMock).mock.calls.map((c) => c[0]);
    expect(calls).toHaveLength(1);
    expect([calls[0]!.fromBlock, calls[0]!.toBlock]).toEqual([0n, BigInt(GETLOGS_MAX_RANGE) - 1n]);
  });

  it("si el bloque de despliegue va por delante de la cabeza no se consulta ningún chunk", async () => {
    const records = await reader(20_000n).getMintRecords();

    expect(records).toEqual([]);
    expect(h.client.getLogs).not.toHaveBeenCalled();
  });
});

describe("ViemChainReader · getMintRecords", () => {
  it("convierte room/date a number y conserva el precio como bigint", async () => {
    setHead(10n);
    setLogs("Mint", [
      {
        args: { tokenId: 102_202_606_15n, room: 102n, dateYYYYMMDD: 20_260_615n, price: 50n },
      },
    ]);

    expect(await reader(0n).getMintRecords()).toEqual([
      { tokenId: 102_202_606_15n, room: 102, dateYYYYMMDD: 20_260_615, priceWei: 50n },
    ]);
  });

  it("descarta los logs con argumentos incompletos (log mal formado) en vez de inventar un registro", async () => {
    setHead(10n);
    setLogs("Mint", [
      { args: { tokenId: 1n, room: 102n, dateYYYYMMDD: undefined, price: 50n } },
      { args: { tokenId: 2n, room: 116n, dateYYYYMMDD: 20_260_620n, price: 60n } },
    ]);

    expect(await reader(0n).getMintRecords()).toEqual([
      { tokenId: 2n, room: 116, dateYYYYMMDD: 20_260_620, priceWei: 60n },
    ]);
  });
});

describe("ViemChainReader · conjuntos de tokenIds", () => {
  it("getSoldTokenIds deduplica y devuelve strings (una noche puede venderse varias veces)", async () => {
    setHead(10n);
    setLogs("Sale", [{ args: { tokenId: 7n } }, { args: { tokenId: 7n } }, { args: { tokenId: 9n } }]);

    const sold = await reader(0n).getSoldTokenIds();
    expect([...sold].sort()).toEqual(["7", "9"]);
  });

  it("getListedTokenIds deduplica y descarta los logs sin tokenId", async () => {
    setHead(10n);
    setLogs("Listed", [{ args: { tokenId: 3n } }, { args: { tokenId: undefined } }, { args: { tokenId: 3n } }]);

    expect(await reader(0n).getListedTokenIds()).toEqual([3n]);
  });

  it("getPurchasedTokenIds consulta con el buyer indexado y deduplica", async () => {
    setHead(10n);
    h.client.getLogs.mockImplementation(async () => [{ args: { tokenId: 5n } }, { args: { tokenId: 5n } }]);

    expect(await reader(0n).getPurchasedTokenIds(WALLET)).toEqual([5n]);
    expect(h.client.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({ args: { buyer: WALLET }, fromBlock: 0n, toBlock: 10n }),
    );
  });
});

describe("ViemChainReader · getNightSignals", () => {
  it("noche listada: propaga el precio de reventa y el flag active", async () => {
    setHead(10n);
    setReads({
      ownerOf: () => WALLET,
      soldOnce: () => true,
      isExpired: () => false,
      listingOf: () => ({ price: 300n, active: true }),
      priceOf: () => 50n,
    });

    expect(await reader(0n).getNightSignals(1n)).toEqual({
      exists: true,
      soldOnce: true,
      expired: false,
      listed: true,
      primaryPriceWei: 50n,
      listingPriceWei: 300n,
    });
  });

  it("listado inactivo: listingPriceWei es 0 y listed=false (no se arrastra el precio viejo)", async () => {
    setHead(10n);
    setReads({
      ownerOf: () => WALLET,
      soldOnce: () => true,
      isExpired: () => true,
      listingOf: () => ({ price: 300n, active: false }),
      priceOf: () => 50n,
    });

    expect(await reader(0n).getNightSignals(1n)).toEqual({
      exists: true,
      soldOnce: true,
      expired: true,
      listed: false,
      primaryPriceWei: 50n,
      listingPriceWei: 0n,
    });
  });

  it("si ownerOf revierte (no minteada o quemada) devuelve señales ausentes sin propagar el error", async () => {
    setHead(10n);
    setReads({
      ownerOf: () => {
        throw new Error("ERC721: invalid token ID");
      },
      soldOnce: () => true,
      isExpired: () => false,
      listingOf: () => ({ price: 300n, active: true }),
      priceOf: () => 50n,
    });

    expect(await reader(0n).getNightSignals(99n)).toEqual({
      exists: false,
      soldOnce: false,
      expired: false,
      listed: false,
      primaryPriceWei: 0n,
      listingPriceWei: 0n,
    });
  });
});

describe("ViemChainReader · isOwnedBy", () => {
  it("compara la propiedad sin distinguir mayúsculas", async () => {
    setHead(10n);
    setReads({ ownerOf: () => WALLET.toUpperCase().replace("0X", "0x") });

    expect(await reader(0n).isOwnedBy(1n, WALLET)).toBe(true);
  });

  it("devuelve false si el propietario actual es otra wallet", async () => {
    setHead(10n);
    setReads({ ownerOf: () => "0x000000000000000000000000000000000000dEaD" });

    expect(await reader(0n).isOwnedBy(1n, WALLET)).toBe(false);
  });

  it("tolera el revert de ownerOf (noche quemada) como no-propiedad", async () => {
    setHead(10n);
    setReads({
      ownerOf: () => {
        throw new Error("ERC721: invalid token ID");
      },
    });

    expect(await reader(0n).isOwnedBy(1n, WALLET)).toBe(false);
  });
});

describe("ViemChainReader · getHeadBlock", () => {
  it("devuelve la cabeza que reporta el cliente", async () => {
    setHead(4_242n);
    expect(await reader(0n).getHeadBlock()).toBe(4_242n);
  });
});

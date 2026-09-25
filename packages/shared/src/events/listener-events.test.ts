import { encodeAbiParameters, encodeEventTopics, parseAbiItem } from "viem";
import { describe, expect, it, vi } from "vitest";
import { EventListenerService } from "./listener";

/**
 * Listener de eventos (D-12).
 *
 * Lo que se prueba, y que el estado auditado no hacía:
 *   - la «reconciliación por chunks» **apila** los eventos del contrato canónico (antes solo
 *     contaba logs: no reconciliaba nada);
 *   - al madurar un `Mint` se escribe la fila del índice con el estado **real** del token (si ya se
 *     vendió o se consumió, no se asume «disponible»);
 *   - el royalty de una reventa viaja con su `Sale` (ambos en la misma transacción);
 *   - la **alerta de silencio** se dispara y se encola a DevOps.
 */

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
const TOKEN = 10120260901n;

const MINT = parseAbiItem(
  "event Mint(uint256 indexed tokenId, uint256 indexed room, uint256 dateYYYYMMDD, string roomType, uint256 price)",
);
const SALE = parseAbiItem(
  "event Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint8 saleType)",
);
const ROYALTY = parseAbiItem("event RoyaltyPaid(uint256 indexed tokenId, address indexed receiver, uint256 amount)");

function mintLog() {
  return {
    address: CONTRACT,
    blockNumber: 10n,
    transactionHash: "0xmint",
    topics: encodeEventTopics({ abi: [MINT], eventName: "Mint", args: { tokenId: TOKEN, room: 101n } }),
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "string" }, { type: "uint256" }],
      [20260901n, "simple", 100000000000000000n],
    ),
  };
}

function saleLog() {
  return {
    address: CONTRACT,
    blockNumber: 12n,
    transactionHash: "0xsale",
    topics: encodeEventTopics({
      abi: [SALE],
      eventName: "Sale",
      args: {
        tokenId: TOKEN,
        seller: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        buyer: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
      },
    }),
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint8" }], [200000000000000000n, 1]),
  };
}

function royaltyLog() {
  return {
    address: CONTRACT,
    blockNumber: 12n,
    transactionHash: "0xsale",
    topics: encodeEventTopics({
      abi: [ROYALTY],
      eventName: "RoyaltyPaid",
      args: { tokenId: TOKEN, receiver: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
    }),
    data: encodeAbiParameters([{ type: "uint256" }], [10000000000000000n]),
  };
}

function buildListener(
  overrides: {
    /** Lector inyectado (doble de `readContract` del cliente: nunca se llama con tipos reales). */
    readContract?: (call: { functionName: string; args?: unknown[] }) => Promise<unknown>;
    silenceThresholdMs?: number;
    now?: () => number;
  } = {},
) {
  const upsertNFT = vi.fn().mockResolvedValue({});
  const updateNFTStatus = vi.fn().mockResolvedValue(true);
  const recordSaleEvent = vi.fn().mockResolvedValue({});
  const createListing = vi.fn().mockResolvedValue({});
  const enqueueNotification = vi.fn().mockResolvedValue("n1");

  const nftsRepo = { upsertNFT, updateNFTStatus, recordSaleEvent, createListing } as never;
  const queue = { enqueueNotification } as never;

  const publicClient = {
    getLogs: vi.fn().mockResolvedValue([mintLog(), saleLog(), royaltyLog()]),
    readContract:
      overrides.readContract ??
      vi.fn().mockImplementation(async ({ functionName }: { functionName: string }) => {
        if (functionName === "ownerOf") return "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
        if (functionName === "soldOnce") return true;
        if (functionName === "isCheckedIn") return false;
        throw new Error("no soportado");
      }),
  } as never;

  const listener = new EventListenerService(
    {
      nftAddress: CONTRACT,
      reorgConfirmations: 1,
      silenceThresholdMs: overrides.silenceThresholdMs ?? 600000,
      ...(overrides.now !== undefined ? { now: overrides.now } : {}),
    },
    nftsRepo,
    queue,
    publicClient,
  );

  return { listener, upsertNFT, updateNFTStatus, recordSaleEvent, createListing, enqueueNotification, publicClient };
}

describe("EventListenerService · eventos canónicos (D-12)", () => {
  it("la reconciliación por chunks APILA los eventos leídos", async () => {
    const { listener, publicClient } = buildListener();

    const count = await listener.reconcileLogsChunked(publicClient, 0n, 20n);

    // 3 logs leídos (mint, venta y royalty). El royalty NO crea un evento propio: se adjunta a su
    // venta, porque ambos viajan en la misma transacción.
    expect(count).toBe(3);
    expect(listener.getStagedEventsCount()).toBe(2);
  });

  it("al madurar el Mint escribe la fila con el estado REAL del token", async () => {
    const { listener, upsertNFT, publicClient } = buildListener();

    await listener.reconcileLogsChunked(publicClient, 0n, 20n);
    const committed = await listener.processStagedEvents(21n);

    expect(committed).toBe(2);
    expect(upsertNFT).toHaveBeenCalledTimes(1);
    expect(upsertNFT).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: TOKEN.toString(),
        roomNumber: 101,
        checkInDate: "2026-09-01",
        roomType: "SIMPLE",
        // La noche ya se había vendido cuando maduró el mint: no se asume «disponible».
        status: "SOLD",
        currentOwner: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
        onChainAnchored: true,
      }),
    );
  });

  it("el royalty de la reventa viaja con su Sale (misma transacción)", async () => {
    const { listener, recordSaleEvent, publicClient } = buildListener();

    await listener.reconcileLogsChunked(publicClient, 0n, 20n);
    await listener.processStagedEvents(21n);

    expect(recordSaleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: TOKEN.toString(),
        isSecondary: true,
        royaltyAmountWei: "10000000000000000",
      }),
    );
  });

  it("sin cliente de lectura, el Mint se escribe como disponible (degradación honesta)", async () => {
    const upsertNFT = vi.fn().mockResolvedValue({});
    const listener = new EventListenerService(
      { nftAddress: CONTRACT, reorgConfirmations: 1 },
      { upsertNFT, updateNFTStatus: vi.fn(), recordSaleEvent: vi.fn(), createListing: vi.fn() } as never,
      { enqueueNotification: vi.fn() } as never,
    );
    const publicClient = { getLogs: vi.fn().mockResolvedValue([mintLog()]) } as never;

    await listener.reconcileLogsChunked(publicClient, 0n, 20n);
    await listener.processStagedEvents(21n);

    expect(upsertNFT).toHaveBeenCalledWith(
      expect.objectContaining({ status: "AVAILABLE", currentOwner: CONTRACT }),
    );
  });

  it("ALERTA DE SILENCIO: sin bloques durante el umbral, avisa a DevOps", async () => {
    const { listener, enqueueNotification } = buildListener({ silenceThresholdMs: 1 });
    await new Promise((resolve) => setTimeout(resolve, 10));

    const alerted = await listener.checkSilenceAlert();

    expect(alerted).toBe(true);
    expect(enqueueNotification).toHaveBeenCalledWith(
      "DEVOPS_ALERT",
      expect.stringContaining("@"),
      expect.objectContaining({ subject: expect.stringContaining("Silencio") }),
    );
  });

  it("no alerta si los bloques llegan con normalidad", async () => {
    const { listener, enqueueNotification } = buildListener({ silenceThresholdMs: 600000 });

    await listener.onNewBlock(100n);

    expect(await listener.checkSilenceAlert()).toBe(false);
    expect(enqueueNotification).not.toHaveBeenCalled();
    expect(listener.getLastBlockNumber()).toBe(100n);
    expect(listener.getIsConnected()).toBe(true);
  });

  it("la alerta de silencio se emite UNA vez por episodio (no en cada heartbeat)", async () => {
    // Reloj inyectado (H11): con `Date.now()` real y un umbral de 1 ms, cualquier retardo de
    // planificación bajo carga hacía que el test fallara al azar.
    let clock = 1_000_000;
    const { listener, enqueueNotification } = buildListener({
      silenceThresholdMs: 1_000,
      now: () => clock,
    });

    clock += 2_000; // silencio por encima del umbral
    expect(await listener.checkSilenceAlert()).toBe(true);
    expect(await listener.checkSilenceAlert()).toBe(false);
    expect(await listener.checkSilenceAlert()).toBe(false);
    expect(enqueueNotification).toHaveBeenCalledTimes(1);

    // Al volver los bloques se rearma: un silencio posterior vuelve a avisar.
    await listener.onNewBlock(200n);
    expect(await listener.checkSilenceAlert()).toBe(false);
    clock += 2_000;
    expect(await listener.checkSilenceAlert()).toBe(true);
    expect(enqueueNotification).toHaveBeenCalledTimes(2);
  });

  it("un Mint de una noche quemada se consolida como BURNED (no resucita como disponible)", async () => {
    // Hallazgo de la verificación adversarial: `ownerOf` revierte en un token inexistente y el
    // `catch` genérico escribía `AVAILABLE` con propietario falso.
    const { listener, upsertNFT, publicClient } = buildListener({
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        if (functionName === "ownerOf") throw new Error("ERC721NonexistentToken");
        if (functionName === "soldOnce") return true;
        return false;
      }),
    });

    await listener.reconcileLogsChunked(publicClient, 0n, 20n);
    await listener.processStagedEvents(21n);

    expect(upsertNFT).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: TOKEN.toString(),
        status: "BURNED",
        currentOwner: "0x0000000000000000000000000000000000000000",
      }),
    );
  });

  it("si el estado no se puede resolver (RPC caído) NO se escribe una fila inventada", async () => {
    const { listener, upsertNFT, publicClient } = buildListener({
      readContract: vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    });

    await listener.reconcileLogsChunked(publicClient, 0n, 20n);
    await listener.processStagedEvents(21n);

    expect(upsertNFT).not.toHaveBeenCalled();
  });

  it("no apila dos veces el mismo evento si se repite el rango de bloques", async () => {
    const { listener, publicClient } = buildListener();

    await listener.reconcileLogsChunked(publicClient, 0n, 20n);
    await listener.reconcileLogsChunked(publicClient, 0n, 20n); // mismo rango (fallo a mitad + reintento)

    expect(listener.getStagedEventsCount()).toBe(2); // mint + venta, no cuatro
  });
});

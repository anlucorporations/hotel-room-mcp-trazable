import { describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import type {
  NFTRecord,
  RoomMintJobRecord,
  RoomRecord,
} from "@hotel/shared";
import { MintPublishProcessor } from "./mint-publish-processor";
import type { PublishMinter } from "./mint-publish-relayer";

/**
 * Guardián de la **publicación con minteo on-chain** (2026-10-21, D-85).
 *
 * Fija las decisiones acordadas:
 *   · el orden es registro → anclaje de huella → minteo de la primera noche → publicación off-chain;
 *   · si el minteo (o cualquier paso) falla, el job queda FAILED y **no se escribe la publicación**:
 *     la habitación sigue en DRAFT;
 *   · es idempotente (no repite registro ni minteo si un intento anterior ya los hizo).
 */

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

const room = (overrides: Partial<RoomRecord> = {}): RoomRecord =>
  ({
    id: "room-1",
    roomNumber: 101,
    roomType: "SIMPLE",
    floor: 1,
    capacity: 1,
    beds: 1,
    sizeM2: 18,
    descriptionEs: "Habitación individual con lo necesario.",
    descriptionEn: null,
    descriptionRu: null,
    baseRateWei: "50000000000000000",
    publicationStatus: "DRAFT",
    operationalStatus: "CLEAN",
    archivedAt: null,
    ...overrides,
  }) as RoomRecord;

const job = (overrides: Partial<RoomMintJobRecord> = {}): RoomMintJobRecord => ({
  id: "job-1",
  roomId: "room-1",
  status: "RUNNING",
  attempts: 1,
  contentHash: "0x" + "a".repeat(64),
  signature: null,
  signerAddress: null,
  publishedBy: "admin@hotel.es",
  registerTxHash: null,
  publishTxHash: null,
  mintTxHash: null,
  tokenId: null,
  lastError: null,
  createdAt: new Date("2026-10-21T10:00:00Z"),
  updatedAt: new Date("2026-10-21T10:00:00Z"),
  completedAt: null,
  ...overrides,
});

function makeHarness(options: {
  registered?: boolean;
  nightExists?: boolean;
  mintFails?: boolean;
} = {}) {
  const jobs = {
    claimNext: vi.fn(),
    complete: vi.fn().mockResolvedValue(job({ status: "DONE" })),
    fail: vi.fn().mockResolvedValue(job({ status: "FAILED" })),
  };
  const rooms = {
    findById: vi.fn().mockResolvedValue(room()),
    listImages: vi.fn().mockResolvedValue([{ id: "img-1" }]),
    recordPublication: vi.fn().mockResolvedValue({ id: "pub-1" }),
    setPublicationStatus: vi.fn().mockResolvedValue(room({ publicationStatus: "PUBLISHED" })),
  };
  const nfts = {
    findNFTByRoomAndDate: vi.fn().mockResolvedValue(null),
    upsertNFT: vi.fn().mockResolvedValue({} as NFTRecord),
  };
  const minter: PublishMinter = {
    isRoomRegistered: vi.fn().mockResolvedValue(options.registered ?? false),
    registerRoom: vi.fn().mockResolvedValue("0x" + "1".repeat(64)),
    publishRoom: vi.fn().mockResolvedValue("0x" + "2".repeat(64)),
    hasNight: vi.fn().mockResolvedValue(options.nightExists ?? false),
    ownerOf: vi.fn().mockResolvedValue("0x" + "9".repeat(40)),
    mintNight: options.mintFails
      ? vi.fn().mockRejectedValue(new Error("RPC caído"))
      : vi.fn().mockResolvedValue({
          tokenId: "10120261022",
          txHash: "0x" + "3".repeat(64),
          owner: "0x" + "9".repeat(40),
        }),
  };
  jobs.claimNext.mockResolvedValueOnce(job());
  const processor = new MintPublishProcessor({
    jobs: jobs as never,
    rooms: rooms as never,
    nfts: nfts as never,
    minter,
    logger,
    now: () => new Date("2026-10-21T12:00:00Z"),
  });
  return { processor, jobs, rooms, nfts, minter };
}

describe("MintPublishProcessor (D-85)", () => {
  it("camino feliz: registra, ancla la huella, mintea la primera noche y publica", async () => {
    const h = makeHarness();
    const outcome = await h.processor.runOnce();
    expect(outcome).toBe("done");
    // Orden: registro → publishRoom → mint.
    expect(h.minter.registerRoom).toHaveBeenCalledWith(101, "simple");
    expect(h.minter.publishRoom).toHaveBeenCalledWith(101, "0x" + "a".repeat(64));
    expect(h.minter.mintNight).toHaveBeenCalledWith(
      expect.objectContaining({ roomNumber: 101, dateYYYYMMDD: 20261022, priceWei: 50_000_000_000_000_000n }),
    );
    expect(h.rooms.recordPublication).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: "room-1", txHash: "0x" + "2".repeat(64) }),
    );
    expect(h.rooms.setPublicationStatus).toHaveBeenCalledWith(
      "room-1",
      "PUBLISHED",
      "admin@hotel.es",
      expect.stringContaining("D-85"),
    );
    expect(h.nfts.upsertNFT).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: "10120261022",
        checkInDate: "2026-10-22",
        txHashMint: "0x" + "3".repeat(64),
        onChainAnchored: true,
      }),
    );
    expect(h.jobs.complete).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        registerTxHash: "0x" + "1".repeat(64),
        publishTxHash: "0x" + "2".repeat(64),
        mintTxHash: "0x" + "3".repeat(64),
        tokenId: "10120261022",
      }),
    );
    expect(h.jobs.fail).not.toHaveBeenCalled();
  });

  it("idempotente: si ya estaba registrada y la noche existe, no repite transacciones", async () => {
    const h = makeHarness({ registered: true, nightExists: true });
    expect(await h.processor.runOnce()).toBe("done");
    expect(h.minter.registerRoom).not.toHaveBeenCalled();
    expect(h.minter.mintNight).not.toHaveBeenCalled();
    expect(h.rooms.recordPublication).toHaveBeenCalledTimes(1);
    expect(h.jobs.complete).toHaveBeenCalledTimes(1);
  });

  it("si el minteo falla: job FAILED y la publicación off-chain NO se escribe (sigue DRAFT)", async () => {
    const h = makeHarness({ mintFails: true });
    expect(await h.processor.runOnce()).toBe("failed");
    expect(h.jobs.fail).toHaveBeenCalledWith("job-1", expect.stringContaining("RPC caído"));
    expect(h.rooms.recordPublication).not.toHaveBeenCalled();
    expect(h.rooms.setPublicationStatus).not.toHaveBeenCalled();
    expect(h.jobs.complete).not.toHaveBeenCalled();
  });

  it("revalida la ficha: sin foto no publica", async () => {
    const h = makeHarness();
    h.rooms.listImages.mockResolvedValueOnce([]);
    expect(await h.processor.runOnce()).toBe("failed");
    expect(h.jobs.fail).toHaveBeenCalledWith("job-1", expect.stringContaining("foto"));
    expect(h.minter.publishRoom).not.toHaveBeenCalled();
  });

  it("sin tarifa base no inventa precio y falla", async () => {
    const h = makeHarness();
    h.rooms.findById.mockResolvedValueOnce(room({ baseRateWei: null }));
    expect(await h.processor.runOnce()).toBe("failed");
    expect(h.jobs.fail).toHaveBeenCalledWith("job-1", expect.stringContaining("tarifa"));
    expect(h.minter.mintNight).not.toHaveBeenCalled();
  });

  it("sin jobs pendientes no hace nada", async () => {
    const h = makeHarness();
    h.jobs.claimNext.mockReset();
    h.jobs.claimNext.mockResolvedValueOnce(null);
    expect(await h.processor.runOnce()).toBe("idle");
    expect(h.rooms.findById).not.toHaveBeenCalled();
  });
});

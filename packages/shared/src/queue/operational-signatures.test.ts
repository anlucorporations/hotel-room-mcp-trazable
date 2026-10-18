import { describe, it, expect, vi, beforeEach } from "vitest";
import { OPERATIONAL_SIGNATURE_QUEUE } from "../constants";
import { getRedisClient } from "../redis/client";
import {
  OPERATIONAL_SIGNATURE_JOB_NAME,
  OperationalSignatureQueue,
  type RedisConnection,
} from "./operational-signatures";

const { mockQueueAdd, mockQueueClose, MockQueue } = vi.hoisted(() => {
  const add = vi.fn().mockResolvedValue({ id: "job-1" });
  const close = vi.fn().mockResolvedValue(undefined);
  return {
    mockQueueAdd: add,
    mockQueueClose: close,
    MockQueue: vi.fn().mockImplementation(() => ({ add, close })),
  };
});

vi.mock("bullmq", () => ({
  Queue: MockQueue,
  // Adaptador oficial de la librería: en las pruebas se dobla por identidad.
  createIORedisClient: vi.fn((client: unknown) => client),
}));

vi.mock("../redis/client", () => ({
  getRedisClient: vi.fn().mockReturnValue({}),
}));

/** Conexión inyectada (no se usa de verdad: `bullmq` está doblado). */
const fakeConnection = {} as RedisConnection;

describe("OperationalSignatureQueue (F3 · T3.6)", () => {
  let service: OperationalSignatureQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OperationalSignatureQueue(fakeConnection);
  });

  it("crea la cola con el nombre del acelerador y las opciones por defecto", () => {
    service.getQueue();

    expect(MockQueue).toHaveBeenCalledWith(
      OPERATIONAL_SIGNATURE_QUEUE,
      expect.objectContaining({
        defaultJobOptions: expect.objectContaining({
          removeOnComplete: { age: 3600, count: 1000 },
        }),
      }),
    );
  });

  it("notify encola solo { signatureId } con jobId = signatureId", async () => {
    await service.notify("sig-uuid-1");

    expect(mockQueueAdd).toHaveBeenCalledWith(
      OPERATIONAL_SIGNATURE_JOB_NAME,
      { signatureId: "sig-uuid-1" },
      { jobId: "sig-uuid-1" },
    );
  });

  it("es idempotente: dos avisos de la misma firma reutilizan el mismo jobId", async () => {
    await service.notify("sig-uuid-1");
    await service.notify("sig-uuid-1");

    expect(mockQueueAdd).toHaveBeenCalledTimes(2);
    expect(mockQueueAdd).toHaveBeenNthCalledWith(
      1,
      OPERATIONAL_SIGNATURE_JOB_NAME,
      { signatureId: "sig-uuid-1" },
      { jobId: "sig-uuid-1" },
    );
    expect(mockQueueAdd).toHaveBeenNthCalledWith(
      2,
      OPERATIONAL_SIGNATURE_JOB_NAME,
      { signatureId: "sig-uuid-1" },
      { jobId: "sig-uuid-1" },
    );
  });

  it("reutiliza la conexión inyectada y no abre una nueva", () => {
    service.getQueue();
    service.getQueue();

    expect(vi.mocked(getRedisClient)).not.toHaveBeenCalled();
    expect(MockQueue).toHaveBeenCalledTimes(1);
  });

  it("cierra la cola y la reconstruye si se vuelve a pedir", async () => {
    service.getQueue();
    await service.close();

    expect(mockQueueClose).toHaveBeenCalledTimes(1);

    service.getQueue();
    expect(MockQueue).toHaveBeenCalledTimes(2);
  });

  it("close sin cola creada es inocuo", async () => {
    await expect(service.close()).resolves.toBeUndefined();
    expect(mockQueueClose).not.toHaveBeenCalled();
  });
});

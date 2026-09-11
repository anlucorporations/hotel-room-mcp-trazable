import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationQueueService, EMAIL_QUEUE_NAME } from "./notifications";

const mockQueueAdd = vi.fn().mockResolvedValue({ id: "job-1" });

vi.mock("bullmq", () => {
  return {
    Queue: vi.fn().mockImplementation(() => ({
      add: mockQueueAdd,
    })),
    Worker: vi.fn().mockImplementation((_name, handler) => ({
      process: handler,
    })),
  };
});

vi.mock("../redis/client", () => ({
  getRedisClient: vi.fn().mockReturnValue({}),
}));

describe("NotificationQueueService (US-08)", () => {
  let service: NotificationQueueService;
  let mockPool: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = {
      query: vi.fn(),
    };
    service = new NotificationQueueService(mockPool);
  });

  it("debe persistir en PostgreSQL en PENDING y encolar en BullMQ con jobId = notification.id", async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: "notif-uuid-12345" }],
    });

    const notifId = await service.enqueueNotification("NFT_SOLD", "carlos@hotel.es", {
      tokenId: "10120260901",
      price: "100000000000000000",
    });

    expect(notifId).toBe("notif-uuid-12345");
    expect(mockPool.query).toHaveBeenCalledTimes(1);

    // Verificar llamada a BullMQ con deduplicación por jobId
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "NFT_SOLD",
      {
        notificationId: "notif-uuid-12345",
        eventType: "NFT_SOLD",
        recipientEmail: "carlos@hotel.es",
        payload: { tokenId: "10120260901", price: "100000000000000000" },
      },
      { jobId: "notif-uuid-12345" },
    );
  });

  it("debe marcar como SENT y FAILED en base de datos", async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    await service.markAsSent("notif-uuid-12345");
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'SENT'"),
      ["notif-uuid-12345"],
    );

    await service.markAsFailed("notif-uuid-12345");
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'FAILED'"),
      ["notif-uuid-12345"],
    );
  });

  it("debe reconciliar notificaciones PENDING con antigüedad > 5 min", async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: "notif-stuck-1",
          event_type: "NFT_SOLD",
          recipient_email: "carlos@hotel.es",
          payload: { room: 101 },
        },
      ],
    });

    const reEnqueued = await service.reconcilePendingNotifications(5);
    expect(reEnqueued).toBe(1);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "NFT_SOLD",
      expect.objectContaining({ notificationId: "notif-stuck-1" }),
      { jobId: "notif-stuck-1" },
    );
  });
});

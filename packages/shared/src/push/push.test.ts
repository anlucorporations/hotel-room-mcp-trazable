import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebPushService } from "./service";

describe("WebPushService (US-18)", () => {
  let mockNftsRepo: any;
  let service: WebPushService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockNftsRepo = {
      addPushSubscription: vi.fn().mockResolvedValue(undefined),
      removePushSubscription: vi.fn().mockResolvedValue(undefined),
      getAllPushSubscriptions: vi.fn().mockResolvedValue([
        {
          endpoint: "https://fcm.googleapis.com/fcm/send/sub1",
          p256dh: "key_p256dh_1",
          auth: "key_auth_1",
        },
        {
          endpoint: "https://updates.push.services.mozilla.com/wpush/v2/sub2",
          p256dh: "key_p256dh_2",
          auth: "key_auth_2",
        },
      ]),
    };

    service = new WebPushService(mockNftsRepo);
  });

  it("registra una suscripción Web Push anónima opt-in", async () => {
    await service.subscribe(
      "https://fcm.googleapis.com/fcm/send/new_sub",
      "p256dh_test",
      "auth_test",
    );

    expect(mockNftsRepo.addPushSubscription).toHaveBeenCalledWith(
      "https://fcm.googleapis.com/fcm/send/new_sub",
      "p256dh_test",
      "auth_test",
    );
  });

  it("rechaza suscripciones con datos incompletos", async () => {
    await expect(service.subscribe("", "p256dh", "auth")).rejects.toThrow(
      "Datos de suscripción Web Push incompletos",
    );
  });

  it("elimina una suscripción Web Push opt-out", async () => {
    await service.unsubscribe("https://fcm.googleapis.com/fcm/send/sub1");
    expect(mockNftsRepo.removePushSubscription).toHaveBeenCalledWith(
      "https://fcm.googleapis.com/fcm/send/sub1",
    );
  });

  it("despacha broadcast de notificaciones a suscriptores", async () => {
    const res = await service.broadcastNotification({
      title: "¡Nuevas habitaciones disponibles!",
      body: "Lote de 30 noches de verano publicado por el Hotel Marina del Sol.",
      url: "https://hotel.marinadelsol.es",
    });

    expect(res.total).toBe(2);
    expect(res.sent).toBe(2);
    expect(res.failed).toBe(0);
  });
});

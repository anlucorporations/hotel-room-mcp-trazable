import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { WebPushService } from "./service";
import { generateVapidKeys } from "./web-push";
import type { NFTsRepository } from "../db/repositories/nfts.repository";

/**
 * Opt-in/opt-out del push (US-18) y emisión del broadcast.
 *
 * Antes, `broadcastNotification` incrementaba un contador y daba por enviado cualquier endpoint con
 * `http`: ningún navegador recibía nada. El viaje real (cifrado + VAPID + entrega HTTP) se prueba en
 * `web-push.test.ts` con un servicio de push local; aquí se comprueba el contrato del servicio y
 * que un fallo de entrega **no** se cuenta como éxito.
 */
describe("WebPushService (US-18 · D-03)", () => {
  /** Doble parcial del repositorio: solo los métodos que ejercitan estas pruebas. */
  let mockNftsRepo: NFTsRepository & {
    addPushSubscription: Mock;
    removePushSubscription: Mock;
    getAllPushSubscriptions: Mock;
  };
  let service: WebPushService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockNftsRepo = {
      addPushSubscription: vi.fn().mockResolvedValue(undefined),
      removePushSubscription: vi.fn().mockResolvedValue(undefined),
      getAllPushSubscriptions: vi.fn().mockResolvedValue([]),
    } as NFTsRepository & {
      addPushSubscription: Mock;
      removePushSubscription: Mock;
      getAllPushSubscriptions: Mock;
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

  it("sin suscriptores no hay envíos (ni contadores inventados)", async () => {
    vi.spyOn(service, "getVapidConfig").mockReturnValue({
      ...generateVapidKeys(),
      subject: "mailto:devops@hotel.es",
    });

    const res = await service.broadcastNotification({ title: "Nuevas noches", body: "Lote de verano" });

    expect(res).toEqual({ sent: 0, failed: 0, pruned: 0, total: 0 });
  });

  it("una entrega fallida cuenta como fallo, no como éxito", async () => {
    const keys = generateVapidKeys();
    mockNftsRepo.getAllPushSubscriptions.mockResolvedValue([
      { endpoint: "https://fcm.googleapis.com/fcm/send/sub1", p256dh: "no-es-una-clave", auth: "x" },
    ]);
    vi.spyOn(service, "getVapidConfig").mockReturnValue({ ...keys, subject: "mailto:a@b.c" });

    const res = await service.broadcastNotification({ title: "Nuevas noches", body: "Lote de verano" });

    expect(res.total).toBe(1);
    expect(res.sent).toBe(0);
    expect(res.failed).toBe(1);
  });
});

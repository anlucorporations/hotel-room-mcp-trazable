import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as postSubscribe } from "./subscribe/route";
import { POST as postUnsubscribe, DELETE as deleteUnsubscribe } from "./unsubscribe/route";
import { NextRequest } from "next/server";

vi.mock("@hotel/shared", async () => {
  const actual = await vi.importActual<any>("@hotel/shared");
  return {
    ...actual,
    NFTsRepository: vi.fn().mockImplementation(() => ({})),
    WebPushService: vi.fn().mockImplementation(() => ({
      subscribe: vi.fn().mockResolvedValue({}),
      unsubscribe: vi.fn().mockResolvedValue({}),
    })),
  };
});

describe("Web Push Endpoints (US-18)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/push/subscribe", () => {
    it("debe rechazar con 400 si faltan datos de la suscripción", async () => {
      const req = new NextRequest("http://localhost:3000/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint: "https://fcm.googleapis.com/fcm/send/123" }),
      });
      const res = await postSubscribe(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("BAD_REQUEST");
    });

    it("debe registrar la suscripción exitosamente con 200", async () => {
      const req = new NextRequest("http://localhost:3000/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          endpoint: "https://fcm.googleapis.com/fcm/send/123",
          keys: {
            p256dh: "key-p256dh-test",
            auth: "key-auth-test",
          },
        }),
      });
      const res = await postSubscribe(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("SUBSCRIBED");
    });
  });

  describe("POST / DELETE /api/push/unsubscribe", () => {
    it("debe rechazar con 400 si no se incluye endpoint", async () => {
      const req = new NextRequest("http://localhost:3000/api/push/unsubscribe", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await postUnsubscribe(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("BAD_REQUEST");
    });

    it("debe procesar la baja (opt-out) con 200 vía POST", async () => {
      const req = new NextRequest("http://localhost:3000/api/push/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint: "https://fcm.googleapis.com/fcm/send/123" }),
      });
      const res = await postUnsubscribe(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("UNSUBSCRIBED");
    });

    it("debe procesar la baja (opt-out) con 200 vía DELETE", async () => {
      const req = new NextRequest("http://localhost:3000/api/push/unsubscribe", {
        method: "DELETE",
        body: JSON.stringify({ endpoint: "https://fcm.googleapis.com/fcm/send/123" }),
      });
      const res = await deleteUnsubscribe(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("UNSUBSCRIBED");
    });
  });
});

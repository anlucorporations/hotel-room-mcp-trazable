import { describe, it, expect, vi, beforeEach } from "vitest";
import { reconcileOnce, renderNotification, startEmailConsumer } from "./email-consumer";
import { silentLogger } from "./test-fakes";

/**
 * Cola única de correo (D-03).
 *
 * El pipeline de ventas solo **encola**; el consumidor entrega por SMTP. Un fallo del proveedor ya
 * no bloquea la venta: BullMQ reintenta y lo que se agote queda `FAILED` para reconciliación.
 */

/** Cola de mentira: captura el handler y permite disparar un trabajo como haría BullMQ. */
interface FakeJob {
  id: string;
  data: { notificationId?: string; eventType: string; recipientEmail?: string; payload?: Record<string, unknown> };
  attemptsMade?: number;
  opts?: { attempts?: number };
}

class FakeQueue {
  handler: ((job: FakeJob) => Promise<void>) | null = null;
  readonly listeners = new Map<string, (job?: FakeJob, error?: Error) => void>();
  job: FakeJob | null = null;
  reconciled = 0;
  readonly enqueued: Array<{ eventType: string; to: string; payload: Record<string, unknown> }> = [];

  createWorker(handler: (job: FakeJob) => Promise<void>) {
    this.handler = handler;
    return {
      on: (event: string, listener: (job?: FakeJob, error?: Error) => void) => {
        this.listeners.set(event, listener);
        return this as never;
      },
      close: async () => undefined,
    };
  }

  async reconcilePendingNotifications(): Promise<number> {
    this.reconciled += 1;
    return 2;
  }

  async enqueueNotification(eventType: string, to: string, payload: Record<string, unknown>): Promise<string> {
    this.enqueued.push({ eventType, to, payload });
    return "alert-id";
  }
}

describe("cola única de correo (D-03)", () => {
  let queue: FakeQueue;
  let sender: { sendEmail: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    queue = new FakeQueue();
    sender = { sendEmail: vi.fn().mockResolvedValue(undefined) };
  });

  it("entrega el trabajo de la cola por SMTP y avisa de la entrega", async () => {
    const onDelivered = vi.fn();
    startEmailConsumer({
      queue: queue as never,
      sender,
      logger: silentLogger() as never,
      onDelivered,
    });

    await queue.handler!({
      id: "job-1",
      data: {
        notificationId: "n1",
        eventType: "NFT_SOLD",
        recipientEmail: "admin@hotel.es",
        payload: { room: 101, roomType: "SIMPLE", saleType: "PRIMARY", priceWei: "1", buyer: "0xabc", txHash: "0xdef", date: "2026-09-23" },
      },
    });

    expect(sender.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@hotel.es",
        subject: expect.stringContaining("habitación 101"),
      }),
    );
    expect(onDelivered).toHaveBeenCalledTimes(1);
  });

  it("si el proveedor falla, el trabajo se propaga (BullMQ reintenta) y la salud se degrada", async () => {
    const onFailed = vi.fn();
    sender.sendEmail.mockRejectedValue(new Error("SMTP caído"));
    startEmailConsumer({
      queue: queue as never,
      sender,
      logger: silentLogger() as never,
      onFailed,
    });

    await expect(
      queue.handler!({
        id: "job-2",
        data: {
          notificationId: "n2",
          eventType: "DEVOPS_ALERT",
          recipientEmail: "devops@hotel.es",
          payload: { subject: "alerta", message: "saldo" },
        },
      }),
    ).rejects.toThrow("SMTP caído");

    // BullMQ emite `failed` tras agotar los reintentos.
    queue.listeners.get("failed")!({ id: "job-2", data: { eventType: "DEVOPS_ALERT" } }, new Error("SMTP caído"));
    expect(onFailed).toHaveBeenCalled();
  });

  it("un trabajo sin destinatario no se entrega y falla en cerrado", async () => {
    startEmailConsumer({ queue: queue as never, sender, logger: silentLogger() as never });

    await expect(
      queue.handler!({ id: "job-3", data: { eventType: "NFT_SOLD", recipientEmail: "", payload: {} } }),
    ).rejects.toThrow("sin destinatario");
    expect(sender.sendEmail).not.toHaveBeenCalled();
  });

  it("la reconciliación re-encola lo pendiente y lo registra", async () => {
    const reEnqueued = await reconcileOnce(queue as never, silentLogger() as never, 5);

    expect(reEnqueued).toBe(2);
    expect(queue.reconciled).toBe(1);
  });

  /**
   * Deuda de M6 cerrada en M8: un aviso que agota los reintentos quedaba `FAILED` en la base **sin
   * que nadie se enterara**. Ahora avisa a DevOps; y solo cuando los reintentos se han agotado de
   * verdad (BullMQ emite `failed` en cada intento), nunca sobre una alerta (sin bucle).
   */
  describe("aviso cuando un correo agota los reintentos", () => {
    const consumerWith = (devopsEmail?: string) =>
      startEmailConsumer({
        queue: queue as never,
        sender,
        logger: silentLogger() as never,
        devopsEmail,
      });

    it("al agotar los intentos encola un DEVOPS_ALERT con el motivo", async () => {
      consumerWith("devops@hotel.es");
      const failed = queue.listeners.get("failed")!;

      failed(
        {
          id: "job-9",
          attemptsMade: 2,
          opts: { attempts: 3 },
          data: { eventType: "NFT_SOLD", notificationId: "n9" },
        },
        new Error("SMTP caído"),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(queue.enqueued).toHaveLength(1);
      expect(queue.enqueued[0]?.eventType).toBe("DEVOPS_ALERT");
      expect(queue.enqueued[0]?.to).toBe("devops@hotel.es");
      expect(String(queue.enqueued[0]?.payload.subject)).toContain("NFT_SOLD");
      expect(String(queue.enqueued[0]?.payload.message)).toContain("SMTP caído");
    });

    it("si BullMQ todavía va a reintentar, NO avisa (no es un fallo definitivo)", async () => {
      consumerWith("devops@hotel.es");
      const failed = queue.listeners.get("failed")!;

      failed(
        { id: "job-10", attemptsMade: 0, opts: { attempts: 3 }, data: { eventType: "NFT_SOLD" } },
        new Error("timeout puntual"),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(queue.enqueued).toHaveLength(0);
    });

    it("no alerta sobre una alerta: el canal de operación no puede entrar en bucle", async () => {
      consumerWith("devops@hotel.es");
      const failed = queue.listeners.get("failed")!;

      failed(
        { id: "job-11", attemptsMade: 2, opts: { attempts: 3 }, data: { eventType: "DEVOPS_ALERT" } },
        new Error("SMTP caído"),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(queue.enqueued).toHaveLength(0);
    });

    it("sin destinatario de DevOps configurado no se encola nada (pero el fallo se registra)", async () => {
      const onFailed = vi.fn();
      startEmailConsumer({
        queue: queue as never,
        sender,
        logger: silentLogger() as never,
        onFailed,
      });

      queue.listeners.get("failed")!(
        { id: "job-12", attemptsMade: 2, opts: { attempts: 3 }, data: { eventType: "NFT_SOLD" } },
        new Error("SMTP caído"),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(queue.enqueued).toHaveLength(0);
      expect(onFailed).toHaveBeenCalled();
    });
  });

  it("renderiza asunto y cuerpo por tipo de evento (sin PII)", () => {
    const burn = renderNotification("BURN_EXECUTED", { burnedCount: 3, tokenIds: ["1"], txHashes: ["0xburn"], date: "2026-09-23" });
    expect(burn.subject).toContain("3 noches");
    expect(burn.text).toContain("0xburn");

    const alert = renderNotification("DEVOPS_ALERT", { subject: "ALERTA", message: "saldo bajo", balanceNative: 0.5 });
    expect(alert.subject).toBe("ALERTA");
    expect(alert.text).toContain("0.5");

    const checkIn = renderNotification("CHECK_IN_CONFIRMED", { roomNumber: 101, tokenId: "10120260901" });
    expect(checkIn.subject).toContain("habitación 101");
  });
});

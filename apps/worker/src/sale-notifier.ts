import type { Logger } from "pino";
import { WebPushService } from "@hotel/shared";
import type { Mailer, SaleNotification } from "./types";

/**
 * Aviso de venta: **cola única de correo + push real** (D-03).
 *
 * El pipeline de ventas solo conoce el puerto `Mailer`. Este decorador:
 *   1. encola el correo (durable, con reconciliación) — si esto falla, se propaga y el checkpoint
 *      del `SaleProcessor` se mantiene atrás, que es la garantía correcta;
 *   2. difunde el push a los suscriptores con opt-in. Un fallo de push **nunca** bloquea la venta:
 *      se registra y se sigue (el push es best-effort, el correo es el canal con garantía).
 */
export class SaleMailerWithPush implements Mailer {
  constructor(
    private readonly email: Mailer,
    private readonly push: WebPushService | null,
    private readonly logger: Logger,
  ) {}

  async sendSaleEmail(notification: SaleNotification): Promise<void> {
    await this.email.sendSaleEmail(notification);

    if (!this.push) return;
    try {
      const result = await this.push.broadcastNotification({
        title: "Noche vendida",
        body: `Habitación ${notification.room} (${notification.roomType}) · venta ${notification.saleType === "SECONDARY" ? "secundaria" : "primaria"}`,
        url: "/historico",
        data: { tokenId: notification.tokenId.toString(), txHash: notification.txHash },
      });
      this.logger.info(
        { sent: result.sent, failed: result.failed, pruned: result.pruned, total: result.total },
        "push de venta difundido",
      );
    } catch (error: unknown) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "el push de la venta falló (no bloquea la venta)",
      );
    }
  }
}

/**
 * Construye el servicio de push si hay claves VAPID configuradas. Sin ellas **no se envía nada**
 * (el servicio falla en cerrado) y se registra el motivo una sola vez.
 */
export function createPushServiceIfConfigured(logger: Logger): WebPushService | null {
  const missing = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"].filter(
    (name) => !process.env[name],
  );
  if (missing.length > 0) {
    logger.warn(
      { missing },
      "push desactivado: faltan claves VAPID (el correo sigue funcionando por la cola única)",
    );
    return null;
  }
  return new WebPushService();
}

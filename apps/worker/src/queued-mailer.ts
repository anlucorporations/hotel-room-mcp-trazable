import type { Pool } from "pg";
import { getDbPool, NotificationQueueService } from "@hotel/shared";
import type { Mailer, SaleNotification } from "./types";
import type { EmailSender } from "./email-consumer";

/**
 * Correo de ventas por la **cola única** (D-03).
 *
 * Implementa el puerto `Mailer` del pipeline de ventas, pero en lugar de hablar SMTP persiste la
 * notificación (`PENDING`) y la encola en BullMQ con deduplicación por `jobId`. La entrega la hace
 * el consumidor (`startEmailConsumer`) y la reconciliación recupera lo que quede pendiente.
 *
 * Sólo lanza si **no se pudo encolar** (Redis irrecuperable y ni siquiera la fila quedó escrita):
 * en ese caso el `SaleProcessor` mantiene el checkpoint atrás y la salud se degrada, que es la
 * garantía correcta. Un fallo del proveedor SMTP ya no bloquea el ciclo de ventas.
 */
export class QueuedMailer implements Mailer {
  private readonly queue: NotificationQueueService;

  constructor(
    private readonly recipient: string,
    pool: Pool = getDbPool(),
  ) {
    this.queue = new NotificationQueueService(pool);
  }

  async sendSaleEmail(notification: SaleNotification): Promise<void> {
    await this.queue.enqueueNotification("NFT_SOLD", this.recipient, {
      tokenId: notification.tokenId.toString(),
      room: notification.room,
      roomType: notification.roomType,
      date: formatDate(notification.dateYYYYMMDD),
      dateYYYYMMDD: notification.dateYYYYMMDD,
      saleType: notification.saleType,
      priceWei: notification.priceWei.toString(),
      buyer: notification.buyer,
      txHash: notification.txHash,
    });
  }
}

/** Remitente real por SMTP para el consumidor de la cola (nodemailer inyectado). */
export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly transporter: { sendMail(options: Record<string, unknown>): Promise<unknown> },
    private readonly from: string,
  ) {}

  async sendEmail(input: { to: string; subject: string; text: string }): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
  }
}

const formatDate = (yyyymmdd: number): string => {
  const year = Math.floor(yyyymmdd / 10_000);
  const month = Math.floor((yyyymmdd % 10_000) / 100);
  const day = yyyymmdd % 100;
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
};

import type { Logger } from "pino";
import type { NotificationQueueService } from "@hotel/shared";

/**
 * Cola ÚNICA de correo (D-03).
 *
 * Antes había dos caminos: el `SaleProcessor` enviaba por SMTP **en línea** (y si el proveedor
 * fallaba, el checkpoint se quedaba atrás y la salud se degradaba) mientras la cola BullMQ con la
 * tabla `email_notifications` existía sin consumidor. Ahora el worker:
 *
 *   1. **encola** (persiste `PENDING` + trabajo BullMQ) desde el pipeline de ventas;
 *   2. **consume** la cola en este proceso y entrega por SMTP;
 *   3. **reconcilia** periódicamente lo que quedó `PENDING` (Redis caído, proceso muerto a medias).
 *
 * El at-least-once deja de depender del SMTP: la entrega está garantizada por la cola durable y la
 * reconciliación, y el ciclo de ventas no se bloquea por un proveedor de correo caído.
 */

/** Puerto del envío real: la cola no conoce nodemailer (DIP). */
export interface EmailSender {
  sendEmail(input: { to: string; subject: string; text: string }): Promise<void>;
}

export interface EmailConsumerDeps {
  readonly queue: NotificationQueueService;
  readonly sender: EmailSender;
  readonly logger: Logger;
  /** Señales de salud: el consumidor es quien sabe si el correo se está entregando. */
  readonly onDelivered?: () => void;
  readonly onFailed?: () => void;
  /**
   * Destinatario de las alertas de operación. Si se indica, un correo que **agota los reintentos**
   * (queda `FAILED`) avisa a DevOps en lugar de quedarse en silencio (deuda de M6 cerrada en M8).
   */
  readonly devopsEmail?: string;
}

/** Campos que transportan los avisos. Se leen con cuidado: el JSON de la cola no está tipado. */
export type NotificationPayload = Record<string, unknown>;

/** Texto legible de un campo del payload (`undefined`/`null` → cadena vacía). */
const field = (value: unknown): string =>
  value === undefined || value === null ? "" : typeof value === "string" ? value : String(value);

/** Lista de un campo del payload (`["a","b"]` → `a, b`); cualquier otra cosa se imprime tal cual. */
const list = (value: unknown): string =>
  Array.isArray(value) ? value.map((item) => field(item)).join(", ") : field(value);

/** Asunto y cuerpo legibles por tipo de evento (sin PII, RNF-05). */
export function renderNotification(eventType: string, payload: NotificationPayload): { subject: string; text: string } {
  switch (eventType) {
    case "NFT_SOLD":
      return {
        subject: `Venta ${payload.saleType === "SECONDARY" ? "secundaria" : "primaria"}: habitación ${field(payload.room)} · ${field(payload.date)}`.trim(),
        text: [
          "Se ha registrado una venta de noche de hotel.",
          "",
          `Habitación: ${field(payload.room)} (${field(payload.roomType) || "—"})`,
          `Tipo de venta: ${field(payload.saleType) || "PRIMARY"}`,
          `Precio (wei): ${field(payload.priceWei) || "—"}`,
          `Comprador: ${field(payload.buyer) || "—"}`,
          `Transacción: ${field(payload.txHash) || "—"}`,
        ].join("\n"),
      };
    case "BURN_EXECUTED":
      return {
        subject: `Quema programada ejecutada: ${field(payload.burnedCount)} noches`,
        text: [
          "La quema programada de noches impagas se ha ejecutado.",
          "",
          `Noches quemadas: ${field(payload.burnedCount)}`,
          `Tokens: ${list(payload.tokenIds)}`,
          `Transacciones: ${list(payload.txHashes)}`,
          `Fecha (Madrid): ${field(payload.date) || "—"}`,
        ].join("\n"),
      };
    case "CHECK_IN_CONFIRMED":
      return {
        subject: `Check-in confirmado · habitación ${field(payload.roomNumber)}`.trim(),
        text: `Check-in confirmado para la habitación ${field(payload.roomNumber) || "—"} (noche ${field(payload.tokenId) || "—"}).`,
      };
    case "DEVOPS_ALERT":
    default:
      return {
        subject: field(payload.subject) || "Alerta de operación",
        text:
          [
            field(payload.message),
            payload.balanceNative !== undefined ? `Saldo: ${field(payload.balanceNative)}` : undefined,
            field(payload.timestamp),
          ]
            .filter(Boolean)
            .join("\n") || JSON.stringify(payload),
      };
  }
}

export interface EmailConsumer {
  stop(): Promise<void>;
}

/** Datos mínimos del trabajo de BullMQ que necesita el aviso de agotamiento. */
interface FailedJobLike {
  readonly id?: string;
  readonly attemptsMade?: number;
  readonly opts?: { readonly attempts?: number };
  readonly data?: { readonly eventType?: string; readonly notificationId?: string };
}

/**
 * ¿Se han agotado los reintentos de este trabajo? BullMQ emite `failed` en **cada** intento, así que
 * distinguirlo es lo que separa «va a reintentar» de «queda `FAILED` para siempre».
 */
export function attemptsExhausted(job: FailedJobLike | undefined): boolean {
  const attempts = job?.opts?.attempts ?? 1;
  return (job?.attemptsMade ?? 0) + 1 >= attempts;
}

/**
 * Avisa a DevOps de que un correo del producto ha agotado sus reintentos (deuda de M6, cerrada en M8).
 *
 * Antes, un aviso de venta que no se podía entregar quedaba `FAILED` en la base **sin que nadie se
 * enterara**: la salud del worker se degradaba mientras el fallo durase, pero al recuperarse el
 * proveedor el rastro desaparecía. El aviso va por la MISMA cola única (no es circular: si Redis o
 * la cola estuvieran caídos, la fila se habría quedado `PENDING`, no `FAILED`) y **nunca alerta
 * sobre una alerta**, para que el canal de operación no pueda entrar en bucle.
 */
async function alertExhaustedDelivery(
  deps: { queue: NotificationQueueService; logger: Logger; devopsEmail: string },
  job: FailedJobLike | undefined,
  error: Error,
): Promise<void> {
  const eventType = job?.data?.eventType ?? "desconocido";
  if (eventType === "DEVOPS_ALERT") {
    // Sin re-alerta: el monitor de operación (canal propio) es la red de seguridad de este caso.
    deps.logger.error({ jobId: job?.id, error: error.message }, "una alerta de DevOps agotó sus reintentos");
    return;
  }

  try {
    await deps.queue.enqueueNotification("DEVOPS_ALERT", deps.devopsEmail, {
      subject: `Correo NO entregado tras agotar reintentos (${eventType})`,
      message:
        `La notificación ${job?.data?.notificationId ?? job?.id ?? "(sin id)"} de tipo ${eventType} agotó sus ` +
        `reintentos y quedó en FAILED. Último error: ${error.message}`,
      timestamp: new Date().toISOString(),
      eventType,
      notificationId: job?.data?.notificationId ?? null,
    });
    deps.logger.warn({ jobId: job?.id, eventType }, "aviso a DevOps por correo agotado (queda FAILED)");
  } catch (alertError: unknown) {
    deps.logger.error(
      { jobId: job?.id, alertError: alertError instanceof Error ? alertError.message : String(alertError) },
      "no se pudo encolar el aviso de correo agotado",
    );
  }
}

/**
 * Arranca el consumidor de la cola única. Cada trabajo se entrega por SMTP; si falla, BullMQ
 * reintenta (3 intentos con backoff) y, agotados, la fila queda `FAILED` **y se avisa a DevOps**.
 */
export function startEmailConsumer(deps: EmailConsumerDeps): EmailConsumer {
  const { queue, sender, logger, onDelivered, onFailed, devopsEmail } = deps;

  const worker = queue.createWorker(async (job) => {
    const { eventType, recipientEmail, payload } = job.data;
    if (!recipientEmail) {
      throw new Error(`Trabajo de correo sin destinatario (${eventType})`);
    }
    const { subject, text } = renderNotification(eventType, payload ?? {});
    await sender.sendEmail({ to: recipientEmail, subject, text });
    logger.info({ jobId: job.id, eventType }, "correo entregado por la cola única");
    onDelivered?.();
  });

  worker.on("failed", (job: FailedJobLike | undefined, error: Error) => {
    const exhausted = attemptsExhausted(job);
    logger.error(
      {
        jobId: job?.id,
        eventType: job?.data?.eventType,
        error: error?.message,
        exhausted,
      },
      exhausted
        ? "entrega de correo AGOTADA: la notificación queda FAILED"
        : "entrega de correo fallida (BullMQ reintentará)",
    );
    onFailed?.();
    if (exhausted && devopsEmail) {
      void alertExhaustedDelivery({ queue, logger, devopsEmail }, job, error);
    }
  });
  worker.on("error", (error: Error) => {
    logger.error({ error: error.message }, "error del consumidor de la cola de correo");
    onFailed?.();
  });

  return {
    stop: async () => {
      await worker.close().catch(() => undefined);
    },
  };
}

/** Re-encola lo que quedó `PENDING` (Redis caído o proceso interrumpido). */
export async function reconcileOnce(
  queue: NotificationQueueService,
  logger: Logger,
  olderThanMinutes = 5,
): Promise<number> {
  const reEnqueued = await queue.reconcilePendingNotifications(olderThanMinutes);
  if (reEnqueued > 0) {
    logger.warn({ reEnqueued, olderThanMinutes }, "reconciliación de correo: notificaciones re-encoladas");
  }
  return reEnqueued;
}

/** `true` si la cola tiene el trabajo (usado por pruebas y por el E2E). */
export async function jobExists(
  queue: { getJob(jobId: string): Promise<unknown> },
  jobId: string,
): Promise<boolean> {
  const job = await queue.getJob(jobId);
  return Boolean(job);
}

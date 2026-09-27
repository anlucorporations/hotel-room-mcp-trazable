import "server-only";
import { NotificationQueueService, type SupplyItemRecord } from "@hotel/shared";

/**
 * Aviso de stock bajo al responsable (D-51, D-64).
 *
 * D-64 pide que la alerta de suministros aparezca en **Administración → Housekeeping → Lencería** y
 * que además se envíe **notificación web/email al administrador**. El panel es la fuente principal
 * (lista `listLowStock`); aquí se encola el correo por la **cola única** existente, reutilizando el
 * tipo de aviso operativo `DEVOPS_ALERT` que ya sabe redactar el consumidor del worker.
 *
 * Es **tolerante a fallo**: si no hay destinatario configurado o Redis/BD no responden, el stock ya
 * se ha descontado y el panel sigue mostrando la alerta; se registra el error y se devuelve `false`.
 * Nunca se envía PII: solo códigos de artículo, existencias y umbral.
 */
export interface LowStockNotice {
  sent: boolean;
  reason?: "NO_RECIPIENT" | "NO_ITEMS" | "QUEUE_ERROR";
}

export async function notifyLowStock(
  items: readonly SupplyItemRecord[],
  source: string,
): Promise<LowStockNotice> {
  if (items.length === 0) return { sent: false, reason: "NO_ITEMS" };

  const recipient = process.env.DEVOPS_ALERT_EMAIL ?? process.env.ADMIN_ALERT_EMAIL;
  if (!recipient) return { sent: false, reason: "NO_RECIPIENT" };

  try {
    const queue = new NotificationQueueService();
    await queue.enqueueNotification("DEVOPS_ALERT", recipient, {
      subject: `Lencería bajo umbral (${items.length} artículo${items.length === 1 ? "" : "s"})`,
      source,
      items: items.map((item) => ({
        code: item.code,
        stock: item.stockQty,
        threshold: item.thresholdQty,
        unit: item.unit,
      })),
      message:
        "Hay artículos de lencería/suministros en o por debajo de su umbral crítico. " +
        "Repón desde Administración → Housekeeping → Lencería.",
    });
    return { sent: true };
  } catch (error: unknown) {
    console.error("[Housekeeping] no se pudo encolar el aviso de stock bajo:", error);
    return { sent: false, reason: "QUEUE_ERROR" };
  }
}

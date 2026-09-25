import { NFTsRepository } from "../db/repositories/nfts.repository";
import { requireSecret } from "../env/index";
import { sendWebPush, type VapidKeys } from "./web-push";

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  data?: Record<string, unknown>;
}

export interface PushSubscriptionItem {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface BroadcastResult {
  /** Entregas aceptadas por el servicio de push del navegador. */
  sent: number;
  failed: number;
  /** Suscripciones purgadas porque el navegador ya no las reconoce (404/410). */
  pruned: number;
  total: number;
}

export interface WebPushServiceOptions {
  /** `fetch` inyectable (pruebas/E2E con un servicio de push local). */
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
}

export class WebPushService {
  private nftsRepo: NFTsRepository;
  private readonly options: WebPushServiceOptions;

  constructor(nftsRepo: NFTsRepository = new NFTsRepository(), options: WebPushServiceOptions = {}) {
    this.nftsRepo = nftsRepo;
    this.options = options;
  }

  /**
   * Registra una suscripción Web Push anónima (opt-in LSSI-CE art. 21) (US-18).
   */
  async subscribe(endpoint: string, p256dh: string, auth: string): Promise<void> {
    if (!endpoint || !p256dh || !auth) {
      throw new Error("Datos de suscripción Web Push incompletos");
    }
    await this.nftsRepo.addPushSubscription(endpoint, p256dh, auth);
  }

  /**
   * Elimina una suscripción Web Push (opt-out inmediato).
   */
  async unsubscribe(endpoint: string): Promise<void> {
    if (!endpoint) return;
    await this.nftsRepo.removePushSubscription(endpoint);
  }

  /**
   * Configuración VAPID para el envío real (D-03).
   *
   * Las tres claves son OBLIGATORIAS y se resuelven aquí, no al construir el servicio: el
   * repositorio traía una clave pública de ejemplo inválida (con un espacio) y una privada
   * inventada, de modo que cualquier despliegue enviaba con material conocido. Sin claves
   * configuradas esta llamada falla en cerrado en lugar de usar un literal (CWE-798).
   */
  getVapidConfig(): { publicKey: string; privateKey: string; subject: string } {
    return {
      publicKey: requireSecret("VAPID_PUBLIC_KEY"),
      privateKey: requireSecret("VAPID_PRIVATE_KEY"),
      subject: requireSecret("VAPID_SUBJECT"),
    };
  }

  /**
   * Despacha una notificación push **real** a todos los suscriptores activos (D-03).
   *
   * A diferencia del contador simulado anterior, aquí se cifra (RFC 8291) y se entrega por HTTP con
   * VAPID (RFC 8292). Las suscripciones que el servicio de push ya no reconoce (404/410) se purgan:
   * es el opt-out que aplica el propio navegador cuando el usuario revoca el permiso.
   */
  async broadcastNotification(payload: PushNotificationPayload): Promise<BroadcastResult> {
    const subscriptions = await this.nftsRepo.getAllPushSubscriptions();
    const vapid = this.getVapidConfig();
    const vapidKeys: VapidKeys = {
      publicKey: vapid.publicKey,
      privateKey: vapid.privateKey,
      subject: vapid.subject,
    };

    let sent = 0;
    let failed = 0;
    let pruned = 0;

    for (const sub of subscriptions) {
      const result = await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
        vapidKeys,
        { fetchImpl: this.options.fetchImpl, now: this.options.now?.() },
      );

      if (result.ok) {
        sent += 1;
        continue;
      }
      if (result.subscriptionGone) {
        pruned += 1;
        await this.nftsRepo.removePushSubscription(sub.endpoint).catch(() => undefined);
        continue;
      }
      failed += 1;
      console.error(`[WebPush] Fallo al entregar a ${sub.endpoint}: ${result.error ?? "desconocido"}`);
    }

    return { sent, failed, pruned, total: subscriptions.length };
  }
}

import { Queue, Worker, createIORedisClient, type Job } from "bullmq";
import type { Pool } from "pg";
import { getDbPool } from "../db/pool";
import { getBlockingRedisClient, getRedisClient } from "../redis/client";

export interface EmailNotificationPayload {
  id?: string;
  eventType: "NFT_SOLD" | "CHECK_IN_CONFIRMED" | "BURN_EXECUTED" | "DEVOPS_ALERT";
  recipientEmail: string;
  payload: Record<string, unknown>;
  status?: "PENDING" | "SENT" | "FAILED";
  attempts?: number;
  createdAt?: Date;
  sentAt?: Date | null;
}

export const EMAIL_QUEUE_NAME = "hotel-email-notifications";

export class NotificationQueueService {
  private queue: Queue | null = null;
  private pool: Pool;

  constructor(pool: Pool = getDbPool()) {
    this.pool = pool;
  }

  getQueue(): Queue {
    if (!this.queue) {
      const redis = getRedisClient();
      this.queue = new Queue(EMAIL_QUEUE_NAME, {
        // BullMQ 6 tipa la conexión con su propia interfaz `IRedisClient` (opciones estructuradas),
        // incompatible con la API varargs de ioredis. `createIORedisClient` es el adaptador oficial
        // de la librería: es exactamente la envoltura que BullMQ aplica internamente a un cliente
        // ioredis crudo, así que el comportamiento no cambia.
        connection: createIORedisClient(redis),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
          /**
           * Los trabajos COMPLETADOS se conservan un rato (1 h / 1000 entradas) en vez de borrarse.
           * Es lo que hace que la reconciliación sea idempotente: si el proceso cae justo después
           * de entregar por SMTP y antes de marcar la fila como `SENT`, la fila queda `PENDING` y la
           * reconciliación re-encola con el MISMO `jobId`; con el trabajo completado aún presente,
           * BullMQ lo ignora y **no se envía dos veces**. Con `removeOnComplete: true` (estado
           * anterior) ese duplicado era el camino feliz.
           */
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: false,
        },
      });
    }
    return this.queue;
  }

  /**
   * Persiste la notificación en PostgreSQL (status='PENDING') y la encola en BullMQ con deduplicación por jobId (US-08).
   */
  async enqueueNotification(
    eventType: "NFT_SOLD" | "CHECK_IN_CONFIRMED" | "BURN_EXECUTED" | "DEVOPS_ALERT",
    recipientEmail: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
    // 1. Persistencia atómica previa en BD
    const res = await this.pool.query(
      `INSERT INTO email_notifications (event_type, recipient_email, payload, status, attempts)
       VALUES ($1, $2, $3, 'PENDING', 0)
       RETURNING id`,
      [eventType, recipientEmail, JSON.stringify(payload)],
    );
    const notificationId = res.rows[0].id;

    // 2. Encolar en BullMQ con deduplicación nativa (jobId = notification.id)
    try {
      const q = this.getQueue();
      await q.add(
        eventType,
        { notificationId, eventType, recipientEmail, payload },
        { jobId: notificationId },
      );
    } catch (err) {
      console.error(`[Queue] Error al encolar en BullMQ (id: ${notificationId}):`, err);
      // El registro permanece en PENDING y será recuperado por el cron de reconciliación
    }

    return notificationId;
  }

  /**
   * Encola un correo efímero exclusivamente en memoria (BullMQ/Redis) sin persistir en PostgreSQL.
   * Cumplimiento estricto de RGPD (art. 5.1.c) para resguardos enviados a emails no vinculados a wallets (US-12).
   */
  async enqueueEphemeralEmail(
    recipientEmail: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const ephemeralId = `ephemeral_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const q = this.getQueue();
    await q.add(
      "EPHEMERAL_TICKET",
      {
        notificationId: ephemeralId,
        eventType: "EPHEMERAL_TICKET",
        recipientEmail,
        payload,
        isEphemeral: true,
      },
      {
        jobId: ephemeralId,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    return ephemeralId;
  }

  /**
   * Marca la notificación como enviada (SENT) en BD.
   */
  async markAsSent(notificationId: string): Promise<void> {
    await this.pool.query(
      "UPDATE email_notifications SET status = 'SENT', sent_at = NOW(), attempts = attempts + 1 WHERE id = $1",
      [notificationId],
    );
  }

  /**
   * Marca la notificación como fallida (FAILED) incrementando intentos.
   */
  async markAsFailed(notificationId: string): Promise<void> {
    await this.pool.query(
      "UPDATE email_notifications SET status = 'FAILED', attempts = attempts + 1 WHERE id = $1",
      [notificationId],
    );
  }

  /**
   * Reconcilia notificaciones en PENDING con antigüedad > 5 minutos ante caídas imprevistas de Redis (US-08, SRS §6).
   */
  async reconcilePendingNotifications(olderThanMinutes = 5): Promise<number> {
    const res = await this.pool.query(
      `SELECT * FROM email_notifications 
       WHERE status = 'PENDING' AND created_at < NOW() - ($1 || ' minutes')::INTERVAL
       ORDER BY created_at ASC 
       LIMIT 100`,
      [olderThanMinutes],
    );

    let reEnqueuedCount = 0;
    const q = this.getQueue();

    for (const row of res.rows) {
      try {
        await q.add(
          row.event_type,
          {
            notificationId: row.id,
            eventType: row.event_type,
            recipientEmail: row.recipient_email,
            payload: row.payload,
          },
          { jobId: row.id },
        );
        reEnqueuedCount++;
      } catch (err) {
        console.error(`[Reconcile] Error re-encolando notificación ${row.id}:`, err);
      }
    }

    return reEnqueuedCount;
  }

  /**
   * Crea un worker de BullMQ para procesar correos.
   */
  createWorker(
    handler: (job: Job<{ notificationId: string; eventType: string; recipientEmail: string; payload: Record<string, unknown>; isEphemeral?: boolean }>) => Promise<void>,
  ): Worker {
    // Conexión BLOQUEANTE: BullMQ exige `maxRetriesPerRequest: null` para workers.
    const redis = getBlockingRedisClient();
    return new Worker(
      EMAIL_QUEUE_NAME,
      async (job) => {
        try {
          await handler(job);
          if (!job.data.isEphemeral) {
            await this.markAsSent(job.data.notificationId);
          }
        } catch (err) {
          // `FAILED` se marca solo cuando se agotan los intentos: marcarlo en cada intento dejaba
          // la fila en `FAILED` mientras BullMQ todavía iba a reintentar (y la reconciliación,
          // que solo mira `PENDING`, no la habría recuperado si el reintento no llegaba).
          const attempts = job.opts?.attempts ?? 1;
          const exhausted = job.attemptsMade + 1 >= attempts;
          if (!job.data.isEphemeral && exhausted) {
            await this.markAsFailed(job.data.notificationId);
          }
          throw err;
        }
      },
      { connection: createIORedisClient(redis), concurrency: 5 },
    );
  }
}

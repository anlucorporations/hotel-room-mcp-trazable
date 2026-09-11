import { Queue, Worker, type Job } from "bullmq";
import type { Pool } from "pg";
import { getDbPool } from "../db/pool";
import { getRedisClient } from "../redis/client";

export interface EmailNotificationPayload {
  id?: string;
  eventType: "NFT_SOLD" | "CHECK_IN_CONFIRMED" | "BURN_EXECUTED" | "DEVOPS_ALERT";
  recipientEmail: string;
  payload: Record<string, any>;
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
        connection: redis as any,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
          removeOnComplete: true,
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
    payload: Record<string, any>,
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
    handler: (job: Job<{ notificationId: string; eventType: string; recipientEmail: string; payload: any }>) => Promise<void>,
  ): Worker {
    const redis = getRedisClient();
    return new Worker(
      EMAIL_QUEUE_NAME,
      async (job) => {
        try {
          await handler(job);
          await this.markAsSent(job.data.notificationId);
        } catch (err) {
          await this.markAsFailed(job.data.notificationId);
          throw err;
        }
      },
      { connection: redis as any, concurrency: 5 },
    );
  }
}

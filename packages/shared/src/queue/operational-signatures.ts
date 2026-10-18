import { Queue, Worker, createIORedisClient } from "bullmq";
import { OPERATIONAL_SIGNATURE_QUEUE } from "../constants";
import { getBlockingRedisClient, getRedisClient } from "../redis/client";

/**
 * Cola **aceleradora** del outbox de anclaje (vNext · F3 · T3.6 · D-C18 / DT-AUD-06).
 *
 * La fuente de verdad del anclaje es la tabla `on_chain_signatures` (outbox transaccional en
 * PostgreSQL): la firma y su fila de outbox se escriben en la **misma transacción** que el cambio
 * de estado crítico. Esta cola (BullMQ/Redis) **no transporta la firma ni ningún dato de negocio**:
 * es solo un **timbre** que despierta al worker relayer para que lea la tabla y procese lo que
 * haya pendiente. Si Redis se pierde, el outbox sigue íntegro en PostgreSQL y el worker lo
 * reconstruye al arrancar (`documento_tecnico.md` §4.7).
 *
 * Por eso el payload es mínimo (`{ signatureId }`): identificador para deduplicar el aviso, nada
 * más. Añadir aquí el contenido de la firma convertiría a Redis en una segunda fuente de verdad
 * (y en un punto de pérdida tras un restore/PITR).
 */

/** Nombre del trabajo que despierta al relayer. Un único tipo de aviso: «hay trabajo». */
export const OPERATIONAL_SIGNATURE_JOB_NAME = "OPERATIONAL_SIGNATURE_READY" as const;

/**
 * Conexión Redis que acepta la cola. Se reutiliza el cliente ioredis que ya expone
 * `redis/client.ts` (nunca se crea una conexión nueva aquí).
 */
export type RedisConnection = ReturnType<typeof getRedisClient>;

/**
 * Payload mínimo del aviso. Solo el identificador de la firma: la cola no es un canal de datos.
 */
export interface OperationalSignatureJobData {
  signatureId: string;
}

/**
 * Encola avisos de «hay una firma que anclar» de forma **idempotente** (`jobId = signatureId`).
 *
 * El consumidor (worker relayer) debe tratar el aviso como una sugerencia: lee siempre la tabla
 * `on_chain_signatures` y ancla lo que corresponda. Un aviso pérdido no pierde trabajo (el worker
 * también barre el outbox); un aviso duplicado no duplica transacciones (idempotencia por
 * `idempotency_key` + `nonce` en el contrato).
 */
export class OperationalSignatureQueue {
  private queue: Queue | null = null;
  private readonly connection?: RedisConnection;

  /**
   * @param connection Conexión Redis opcional (inyectable en pruebas). Si no se pasa, se usa
   * `getRedisClient()`: la conexión compartida del proceso, no una nueva.
   */
  constructor(connection?: RedisConnection) {
    this.connection = connection;
  }

  /** Cola BullMQ subyacente (creada de forma perezosa). */
  getQueue(): Queue {
    if (!this.queue) {
      const redis = this.connection ?? getRedisClient();
      this.queue = new Queue(OPERATIONAL_SIGNATURE_QUEUE, {
        // BullMQ tipa la conexión con su propia interfaz `IRedisClient`; `createIORedisClient` es
        // el adaptador oficial de la librería (misma envoltura que BullMQ aplica internamente a un
        // cliente ioredis crudo), así que el comportamiento no cambia.
        connection: createIORedisClient(redis),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
          /**
           * Los avisos COMPLETADOS se conservan un rato (1 h / 1000 entradas): así, volver a avisar
           * de la MISMA firma (`jobId = signatureId`) dentro de la ventana es idempotente y BullMQ
           * lo ignora. No hay riesgo de bloquear trabajo nuevo: cada firma tiene su propio
           * `signatureId`, y el outbox (no la cola) es quien decide qué queda pendiente.
           */
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: false,
        },
      });
    }
    return this.queue;
  }

  /**
   * Encola el aviso de que hay trabajo; `jobId = signatureId` ⇒ idempotente (un job por firma).
   *
   * No escribe nada en la tabla `on_chain_signatures`: la fila de outbox la crea, en su
   * transacción, quien produce la firma. Esto solo despierta al worker.
   */
  async notify(signatureId: string): Promise<void> {
    const q = this.getQueue();
    await q.add(
      OPERATIONAL_SIGNATURE_JOB_NAME,
      { signatureId } satisfies OperationalSignatureJobData,
      { jobId: signatureId },
    );
  }

  /**
   * Cierra la cola. No cierra la conexión Redis subyacente: es compartida por todo el proceso y la
   * gestiona `closeRedisClient()` en `redis/client.ts`.
   */
  async close(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }

  /**
   * Crea el worker BullMQ que **despierta** al relayer (F3 · T3.5). El handler recibe el
   * `signatureId` como pista, pero el worker relayer lee siempre la tabla: la cola no es un canal de
   * datos y un aviso perdido no pierde trabajo (el outbox se barre igual).
   *
   * Usa la conexión **bloqueante** (`maxRetriesPerRequest: null`), que es lo que exige BullMQ para
   * un `Worker`; la conexión compartida del proceso no sirve para bloquear.
   */
  createWorker(handler: (signatureId: string) => Promise<void>): Worker {
    const redis = getBlockingRedisClient();
    return new Worker(
      OPERATIONAL_SIGNATURE_QUEUE,
      async (job) => {
        await handler((job.data as OperationalSignatureJobData).signatureId);
      },
      { connection: createIORedisClient(redis), concurrency: 1 },
    );
  }
}

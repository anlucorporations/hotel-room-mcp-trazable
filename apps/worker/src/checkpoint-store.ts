import type { Pool } from "pg";
import type { CheckpointStore, ProcessedLogLocation } from "./types";

/**
 * Implementación de {@link CheckpointStore} sobre PostgreSQL (D-09).
 *
 * El worker comparte la MISMA base que la web/API (una sola verdad); el esquema lo crea
 * `runMigrations()` al arrancar:
 *   - `worker_checkpoints`: última fila procesada por contrato (clave normalizada a minúsculas).
 *   - `worker_processed_logs`: claves de idempotencia ya contabilizadas (PK `log_key`).
 *
 * SRP: esta clase sólo persiste estado; el cálculo de idempotencia (la clave) y el flujo de
 * negocio viven en el `SaleProcessor`.
 *
 * El `Pool` se inyecta (DIP) y es compartido por los stores del proceso: la clase no lo cierra
 * (`close()` no libera el pool; lo cierra su propietario, `main`).
 */
export class PgCheckpointStore implements CheckpointStore {
  constructor(private readonly pool: Pool) {}

  async getLastBlock(contractAddress: string): Promise<number | null> {
    const { rows } = await this.pool.query<{ last_block: string }>(
      "SELECT last_block FROM worker_checkpoints WHERE contract_address = $1",
      [normalize(contractAddress)],
    );
    const row = rows[0];
    // `BIGINT` llega como string en `pg`; el dominio del worker lo usa como `number`.
    return row === undefined ? null : Number(row.last_block);
  }

  async setLastBlock(contractAddress: string, block: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO worker_checkpoints (contract_address, last_block, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (contract_address)
       DO UPDATE SET last_block = EXCLUDED.last_block, updated_at = NOW()`,
      [normalize(contractAddress), block],
    );
  }

  async isProcessed(idempotencyKey: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      "SELECT 1 FROM worker_processed_logs WHERE log_key = $1",
      [idempotencyKey],
    );
    return rows.length > 0;
  }

  async markProcessed(
    idempotencyKey: string,
    location?: ProcessedLogLocation,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO worker_processed_logs (log_key, block_number, contract_address, processed_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (log_key) DO NOTHING`,
      [
        idempotencyKey,
        location?.blockNumber ?? null,
        location === undefined ? null : normalize(location.contractAddress),
      ],
    );
  }

  /** El pool es compartido e inyectado: su cierre lo hace `main` (`closeDbPool`), no el store. */
  async close(): Promise<void> {
    // Intencionadamente vacío (el store no es propietario del pool).
  }
}

/** Dirección de contrato canónica (minúsculas). */
const normalize = (address: string): string => address.toLowerCase();

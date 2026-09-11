import pg from "pg";
import type { Pool, PoolClient, PoolConfig, QueryResult, QueryResultRow } from "pg";

const { Pool: PgPool } = pg;

let globalPool: Pool | null = null;

export interface DatabaseConfig extends PoolConfig {
  connectionString?: string;
  max?: number;
  min?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export function getDefaultDbConfig(): DatabaseConfig {
  return {
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://hotel_admin:hotel_secret_2026@127.0.0.1:5432/hotel_nft_dev",
    max: Number(process.env.DATABASE_POOL_MAX || 20),
    min: Number(process.env.DATABASE_POOL_MIN || 2),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
}

/**
 * Inicializa o devuelve la instancia singleton del pool de PostgreSQL.
 */
export function getDbPool(config?: DatabaseConfig): Pool {
  if (!globalPool) {
    const finalConfig = { ...getDefaultDbConfig(), ...config };
    globalPool = new PgPool(finalConfig);

    globalPool.on("error", (err) => {
      console.error("[PostgreSQL Pool] Error inesperado en cliente inactivo:", err);
    });
  }
  return globalPool;
}

/**
 * Cierra el pool global de conexiones (usado en tests y graceful shutdown).
 */
export async function closeDbPool(): Promise<void> {
  if (globalPool) {
    await globalPool.end();
    globalPool = null;
  }
}

/**
 * Ejecuta una consulta tipada en el pool de PostgreSQL.
 */
export async function query<R extends QueryResultRow = any>(
  text: string,
  values?: any[],
): Promise<QueryResult<R>> {
  const pool = getDbPool();
  if (values !== undefined) {
    return pool.query<R>(text, values);
  }
  return pool.query<R>(text);
}


/**
 * Ejecuta una serie de operaciones dentro de una transacción atómica con ROLLBACK automático ante error.
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

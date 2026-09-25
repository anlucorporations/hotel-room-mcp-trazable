import pg from "pg";
import type { Pool, PoolClient, PoolConfig, QueryResult, QueryResultRow } from "pg";
import { requireSecret } from "../env/index";

const { Pool: PgPool } = pg;

let globalPool: Pool | null = null;

export interface DatabaseConfig extends PoolConfig {
  connectionString?: string;
  max?: number;
  min?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

/**
 * Configuración por defecto del pool.
 *
 * `DATABASE_URL` es OBLIGATORIA (CWE-798): la cadena de conexión anterior llevaba usuario y
 * contraseña embebidos en el código, lo que publicaba las credenciales del entorno local y
 * permitía que un despliegue mal configurado se conectase a una base inesperada en silencio.
 * `requireSecret` lanza `MissingSecretError` en el primer uso si la variable no está definida.
 */
export function getDefaultDbConfig(): DatabaseConfig {
  return {
    connectionString: requireSecret("DATABASE_URL"),
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
 *
 * El valor por defecto del genérico es `QueryResultRow` (el propio tipo de `pg` para una fila
 * genérica) en lugar de `any`: los llamantes que no declaran la forma de la fila siguen pudiendo
 * leer cualquier columna, pero el tipo deja de ser un `any` sin control.
 */
export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
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

import { closeDbPool, getDbPool, hashSessionTrace, isHashedSessionTrace } from "../src/index";

/**
 * Migración de la traza de sesiones a pseudonimizada (ADR-24 · decisión de M9).
 *
 * Por qué existe: hasta M9 `admin_sessions.ip_address` y `user_agent` guardaban el valor **en claro**.
 * Cambiar el código no limpia las filas que ya estaban escritas, así que este script las pasa por el
 * mismo HMAC que usa la aplicación. Es **idempotente**: las filas ya pseudonimizadas se saltan.
 *
 * Por qué hay que ejecutarlo pronto: el HMAC se calcula con `SESSION_TRACE_SECRET` (o con
 * `AES_SECRET_KEY` como respaldo). Si esas claves cambian después, las trazas antiguas **no** se
 * pueden recalcular (ese es justo el punto de un HMAC con clave), así que la ventana para migrarlas
 * es ahora.
 *
 * Uso:
 *   node --env-file=../../.env --import tsx scripts/backfill-session-traces.ts
 *
 * Sin `--apply` solo informa de lo que haría (modo seco).
 */
const apply = process.argv.includes("--apply");
const pool = getDbPool();

const pending = await pool.query<{ id: string; ip_address: string | null; user_agent: string | null }>(
  `SELECT id, ip_address, user_agent
     FROM admin_sessions
    WHERE (ip_address IS NOT NULL AND ip_address NOT LIKE 'hmac-sha256:%')
       OR (user_agent IS NOT NULL AND user_agent NOT LIKE 'hmac-sha256:%')`,
);

console.log(`filas con traza sin pseudonimizar: ${pending.rows.length}${apply ? "" : " (modo seco)"}`);

let migrated = 0;
for (const row of pending.rows) {
  const ip = isHashedSessionTrace(row.ip_address) ? row.ip_address : hashSessionTrace(row.ip_address);
  const agent = isHashedSessionTrace(row.user_agent) ? row.user_agent : hashSessionTrace(row.user_agent);

  if (!apply) continue;
  await pool.query("UPDATE admin_sessions SET ip_address = $2, user_agent = $3 WHERE id = $1", [
    row.id,
    ip,
    agent,
  ]);
  migrated += 1;
}

if (apply) {
  const check = await pool.query(
    `SELECT COUNT(*)::INT AS pending
       FROM admin_sessions
      WHERE (ip_address IS NOT NULL AND ip_address NOT LIKE 'hmac-sha256:%')
         OR (user_agent IS NOT NULL AND user_agent NOT LIKE 'hmac-sha256:%')`,
  );
  console.log(`filas migradas: ${migrated} · pendientes tras la migración: ${check.rows[0].pending}`);
} else {
  console.log("nada modificado: vuelve a ejecutarlo con --apply para migrar");
}

await closeDbPool();

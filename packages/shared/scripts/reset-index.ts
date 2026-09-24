import { closeDbPool, getDbPool } from "../src/index";

/**
 * Limpieza del indice off-chain tras **reiniciar la cadena** (operacion de desarrollo).
 *
 * Por que existe: al reiniciar Anvil el contrato vuelve a la MISMA direccion determinista, asi que
 * el worker no detecta un redespliegue por direccion. Su rebobinado automatico (`isCheckpointAheadOfChain`
 * en `apps/worker/src/run-worker.ts`) SI salta —el checkpoint persistido queda por delante de la cabeza
 * nueva—, pero se apoya en que la cadena nueva llegue a superar el bloque viejo para reindexar. Si se
 * inyectan datos en los primeros bloques, las ventas viejas seguirian en el historico y el panel
 * mezclaria dos cadenas.
 *
 * Que borra: indices y derivados (nfts, listings, sale_events, cola de correo, suscripciones push,
 * contingencia y TODO el estado del worker).
 * Que CONSERVA: `admin_users` y `mfa_recovery_codes` —los operadores y sus autenticadores ya
 * configurados—, que no dependen de la cadena.
 *
 * Uso:
 *   node --env-file=../../.env --import tsx scripts/reset-index.ts           # informa (modo seco)
 *   node --env-file=../../.env --import tsx scripts/reset-index.ts --apply   # limpia
 */
const apply = process.argv.includes("--apply");
const pool = getDbPool();

/** Tablas que se vacian: todo lo que describe la cadena o depende de ella. */
const TABLES = [
  "worker_sale_history",
  "worker_aggregate_counters",
  "worker_processed_logs",
  "worker_checkpoints",
  "sale_events",
  "listings",
  "nfts",
  "email_notifications",
  "push_subscriptions",
  "checkin_contingency_logs",
];

const before = await pool.query(
  `SELECT
     (SELECT COUNT(*)::INT FROM nfts) AS nfts,
     (SELECT COUNT(*)::INT FROM sale_events) AS ventas,
     (SELECT COUNT(*)::INT FROM worker_sale_history) AS historico,
     (SELECT COUNT(*)::INT FROM worker_checkpoints) AS checkpoints,
     (SELECT COUNT(*)::INT FROM admin_users) AS operadores`,
);
console.log("antes:", JSON.stringify(before.rows[0]));

if (!apply) {
  console.log(`modo seco: se vaciarian ${TABLES.join(", ")}`);
  console.log("los operadores de admin_users y sus codigos de rescate se CONSERVAN");
  await closeDbPool();
  process.exit(0);
}

// TRUNCATE ... CASCADE resuelve las claves foraneas entre las tablas de la lista; las que quedan
// fuera (admin_*) no referencian a ninguna de estas.
await pool.query(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);

// El contador de agregados necesita su fila semilla (id = 0): el worker la espera y, sin ella, el
// primer `applyEvent` fallaria al hacer el SELECT ... FOR UPDATE. El resto de columnas tienen
// DEFAULT, y `contract_address` es NULL hasta que el worker vincula el contrato (M4).
await pool.query(
  "INSERT INTO worker_aggregate_counters (id) VALUES (0) ON CONFLICT (id) DO NOTHING",
);

const after = await pool.query(
  `SELECT
     (SELECT COUNT(*)::INT FROM nfts) AS nfts,
     (SELECT COUNT(*)::INT FROM sale_events) AS ventas,
     (SELECT COUNT(*)::INT FROM worker_sale_history) AS historico,
     (SELECT COUNT(*)::INT FROM worker_checkpoints) AS checkpoints,
     (SELECT COUNT(*)::INT FROM admin_users) AS operadores`,
);
console.log("despues:", JSON.stringify(after.rows[0]));
console.log("indice off-chain limpio; los operadores de la base siguen intactos");

await closeDbPool();

import { createPublicClient, http } from "viem";
import { closeDbPool, getDbPool } from "../src/index";
import { PRESERVED_TABLES, WIPE_ORDER } from "../src/db/reset-plan";

/**
 * **Inicialización de la plataforma** (2026-10-05, petición del responsable).
 *
 * Deja la base **off-chain** limpia para arrancar el recorrido de casos de uso desde cero. **No toca**
 * los servicios globales: ni Anvil/Foundry (no reinicia la cadena, no redespliega el contrato) ni
 * Cloud SQL (no reinicia la instancia).
 *
 * Uso (dentro de la VPC, p. ej. desde el job `hotel-mcp-inject-data`):
 *   node --import tsx packages/shared/scripts/reset-all.ts            # informa (modo seco)
 *   node --import tsx packages/shared/scripts/reset-all.ts --apply    # ejecuta
 *
 * Por qué el **checkpoint va antes** del borrado: el worker indexa la cadena por su cuenta. Si se
 * vaciara primero y se fijara el checkpoint después, en ese hueco el worker podría escribir datos
 * viejos que sobrevivirían al borrado. Fijando antes `worker_checkpoints` y
 * `worker_aggregate_counters.last_block` a la **cabeza actual**, el worker deja de mirar el pasado y
 * lo que borre después ya no se repuebla solo.
 *
 * Y por qué **`DELETE` ordenado** en vez de `TRUNCATE`: `preventive_plans.room_id → rooms(id) ON DELETE
 * SET NULL`. `TRUNCATE rooms CASCADE` arrastraría los planes preventivos (catálogo que se conserva);
 * el borrado ordenado los deja vivos con `room_id = NULL`. Ver `src/db/reset-plan.test.ts`.
 */
const apply = process.argv.includes("--apply");
const pool = getDbPool();

const rpcUrl = process.env.RPC_URL;
const contractAddress = process.env.CONTRACT_ADDRESS;

/** Tablas cuyo recuento se informa antes y después (las que el responsable mira). */
const REPORT_TABLES = ["rooms", "nfts", "sale_events", "reservations", "reviews", "maintenance_incidents", "admin_users"];

async function counts(): Promise<Record<string, number>> {
  const selects = REPORT_TABLES.map((table) => `(SELECT COUNT(*)::INT FROM ${table}) AS ${table}`);
  const { rows } = await pool.query<Record<string, number>>(`SELECT ${selects.join(", ")}`);
  return rows[0] ?? {};
}

async function chainHead(): Promise<bigint> {
  if (!rpcUrl) throw new Error("falta RPC_URL en el entorno (se necesita la cabeza de la cadena)");
  const client = createPublicClient({ transport: http(rpcUrl) });
  return client.getBlockNumber();
}

/**
 * TX1 — fija los dos checkpoints del worker en la cabeza de la cadena. Se ejecuta **antes** de borrar
 * nada, para que el worker deje de indexar el pasado cuanto antes.
 */
async function pinCheckpoints(head: bigint): Promise<void> {
  if (!contractAddress) throw new Error("falta CONTRACT_ADDRESS en el entorno");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Se normaliza por si quedara una fila con otra capitalización: la PK es la dirección tal cual.
    await client.query("DELETE FROM worker_checkpoints WHERE lower(contract_address) = lower($1)", [contractAddress]);
    await client.query(
      `INSERT INTO worker_checkpoints (contract_address, last_block, updated_at)
       VALUES ($1, $2, NOW())`,
      [contractAddress, head.toString()],
    );
    await client.query(
      `INSERT INTO worker_aggregate_counters (id, last_block, contract_address)
       VALUES (0, $2, $1)
       ON CONFLICT (id) DO UPDATE SET last_block = EXCLUDED.last_block, contract_address = EXCLUDED.contract_address`,
      [contractAddress, head.toString()],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** TX2 — borra las tablas operativas en el orden probado y re-siembra el contador de agregados. */
async function wipeOperational(head: bigint): Promise<void> {
  if (!contractAddress) throw new Error("falta CONTRACT_ADDRESS en el entorno");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // La auditoría de operadores es **append-only por trigger** (RNF-M-19): sin desactivarlo dentro
    // de la transacción, `DELETE FROM operator_audit_log` revienta con «es append-only» y el reset
    // entero se cae. Se comprueba en el catálogo antes de tocarlo (una sentencia fallida abortaría la
    // transacción) y se vuelve a activar al terminar.
    const trigger = await client.query(
      "SELECT 1 FROM pg_trigger WHERE tgname = 'trg_operator_audit_append_only' AND NOT tgisinternal",
    );
    const auditTrigger = trigger.rowCount !== null && trigger.rowCount > 0;
    if (auditTrigger) {
      await client.query("ALTER TABLE operator_audit_log DISABLE TRIGGER trg_operator_audit_append_only");
    }
    for (const table of WIPE_ORDER) {
      await client.query(`DELETE FROM ${table}`);
    }
    // La fila semilla id = 0 es obligatoria (el worker la espera) y su `last_block` vuelve a la cabeza.
    await client.query(
      `INSERT INTO worker_aggregate_counters (id, last_block, contract_address)
       VALUES (0, $2, $1)
       ON CONFLICT (id) DO UPDATE SET last_block = EXCLUDED.last_block, contract_address = EXCLUDED.contract_address`,
      [contractAddress, head.toString()],
    );
    if (auditTrigger) {
      await client.query("ALTER TABLE operator_audit_log ENABLE TRIGGER trg_operator_audit_append_only");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const before = await counts();
console.log("cabeza de la cadena :", (await chainHead()).toString());
console.log("antes               :", JSON.stringify(before));
console.log(`se borran           : ${WIPE_ORDER.length} tablas`);
console.log(`se conservan        : ${PRESERVED_TABLES.join(", ")}`);
console.log("se reescriben       : worker_checkpoints, worker_aggregate_counters (last_block = cabeza)");

if (!apply) {
  console.log("MODO SECO: no se ha borrado nada. Añade --apply para ejecutarlo.");
  await closeDbPool();
  process.exit(0);
}

const head = await chainHead();
await pinCheckpoints(head);
console.log(`checkpoints fijados en el bloque ${head}`);

// Margen mínimo para que el worker observe los checkpoints nuevos antes de vaciar.
await new Promise((resolve) => setTimeout(resolve, 2000));

await wipeOperational(head);

// Verificación: si el worker alcanzó a escribir en el hueco, se repite el borrado de los índices
// (los checkpoints ya están en la cabeza, así que no vuelve a entrar nada viejo).
const indexTables = ["nfts", "sale_events", "worker_sale_history"];
const leftovers = await pool.query<{ n: number }>(
  `SELECT (SELECT COUNT(*) FROM nfts) + (SELECT COUNT(*) FROM sale_events) + (SELECT COUNT(*) FROM worker_sale_history) AS n`,
);
if ((leftovers.rows[0]?.n ?? 0) > 0) {
  console.log("aviso: el worker escribió durante el borrado; se repiten los índices");
  for (const table of indexTables) await pool.query(`DELETE FROM ${table}`);
}

console.log("despues             :", JSON.stringify(await counts()));
console.log("plataforma inicializada: base off-chain limpia, catálogos y operadores intactos");

await closeDbPool();

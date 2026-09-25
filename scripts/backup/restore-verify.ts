import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Verificación REAL de copia de seguridad y restauración (D-08).
 *
 * El estado auditado tenía aquí una **simulación**: construía un snapshot en memoria con 50 NFTs
 * inventados, «restauraba» ese objeto y cronometraba el RTO para declararlo dentro de SLA. No tocaba
 * PostgreSQL ni una vez.
 *
 * Este guion hace el ciclo completo contra la base REAL del proyecto:
 *
 *   1. `pg_dump` (formato custom) de la base de `DATABASE_URL` → tamaño + SHA-256.
 *   2. Crea una base **de verificación** limpia y **restaura** el volcado cronometrando el RTO.
 *   3. **Compara** origen y restaurada tabla por tabla (recuentos y sumas de control de las tablas
 *      de negocio y de estado del worker). Si algo no cuadra, la verificación FALLA.
 *   4. Deja el artefacto con los números medidos y el RPO declarado (el instante del volcado).
 *
 * Es **fallo duro**: sin `pg_dump`/`psql`/`pg_restore` disponibles, o si la restauración no cuadra,
 * termina con código 1. No hay camino que certifique sin haber restaurado de verdad.
 *
 * Uso:
 *   node --experimental-strip-types scripts/backup/restore-verify.ts
 *
 * Variables:
 *   DATABASE_URL            origen (obligatoria; normalmente del `.env`)
 *   DR_VERIFY_DATABASE      base de verificación (por defecto `<origen>_dr_verify`)
 *   DR_KEEP_DATABASE=1      conserva la base restaurada para inspección manual
 */

type PostgresBinary = 'pg_dump' | 'pg_restore' | 'psql';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const evidencePath = resolve(repoRoot, 'RepoTecnico', 'evidencias', 'dr-verify.json');

// `node` no carga `.env` por sí solo: en local lo leemos de la raíz. En CI las variables vienen del
// entorno, así que la ausencia del fichero NO es un error.
try {
  process.loadEnvFile(resolve(repoRoot, '.env'));
} catch {
  // Sin fichero .env: se usan las variables del entorno.
}

/** Busca un binario de PostgreSQL en la instalación estándar de Windows o en el PATH. */
function resolvePostgresBinary(name: PostgresBinary): string {
  const installed = [
    `C:\\Program Files\\PostgreSQL\\18\\bin\\${name}.exe`,
    `C:\\Program Files\\PostgreSQL\\17\\bin\\${name}.exe`,
    `C:\\Program Files\\PostgreSQL\\16\\bin\\${name}.exe`,
    `/usr/bin/${name}`,
    `/usr/local/bin/${name}`,
  ].find((candidate) => existsSync(candidate));
  // Último recurso: el PATH (si no está, la ejecución falla con un error explícito).
  return installed ?? name;
}

/** Comprueba que el binario existe y se puede ejecutar, con un error claro si no. */
async function assertBinary(name: PostgresBinary): Promise<string> {
  const path = resolvePostgresBinary(name);
  try {
    await run(path, ['--version']);
    return path;
  } catch {
    throw new Error(
      `No se puede ejecutar ${name}: hacen falta las herramientas cliente de PostgreSQL (PATH o ` +
        `C:\\Program Files\\PostgreSQL\\18\\bin). La verificación de DR NO se simula.`,
    );
  }
}

interface DbTarget {
  readonly host: string;
  readonly port: string;
  readonly database: string;
  readonly user: string;
  readonly password: string;
}

function parseDatabaseUrl(raw: string): DbTarget {
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) throw new Error('DATABASE_URL sin nombre de base de datos');
  return {
    host: url.hostname,
    port: url.port || '5432',
    database,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

async function psql(target: DbTarget, sql: string, database?: string): Promise<string> {
  const { stdout } = await run(
    resolvePostgresBinary('psql'),
    [
      '-h',
      target.host,
      '-p',
      target.port,
      '-U',
      target.user,
      '-d',
      database ?? target.database,
      '-tAc',
      sql,
    ],
    { env: { ...process.env, PGPASSWORD: target.password }, maxBuffer: 32 * 1024 * 1024 },
  );
  return stdout.trim();
}

/**
 * Tablas cuyo contenido tiene que sobrevivir a la restauración, con una suma de control barata pero
 * significativa (un importe, un recuento de intentos, longitudes…): si la restauración perdiera o
 * alterara filas, la comparación lo detecta.
 */
const TABLES: readonly string[] = [
  'nfts',
  'worker_sale_history',
  'worker_aggregate_counters',
  'email_notifications',
  'push_subscriptions',
  'admin_users',
];

/** Suma de control por tabla (recuento + un agregado de una columna con significado). */
const CHECKSUMS: Readonly<Record<string, string>> = {
  nfts: 'COALESCE(SUM(base_price_wei), 0)::text',
  worker_sale_history: 'COALESCE(SUM(price_wei), 0)::text',
  worker_aggregate_counters: '(primary_volume_wei + royalties_wei + secondary_volume_wei)::text',
  email_notifications: 'COALESCE(SUM(attempts), 0)::text',
  push_subscriptions: 'COALESCE(SUM(LENGTH(endpoint)), 0)::text',
  admin_users: "COALESCE(SUM(LENGTH(username)), 0)::text",
};

async function fingerprint(
  target: DbTarget,
  schema: string,
): Promise<Record<string, { count: number; checksum: string }>> {
  const result: Record<string, { count: number; checksum: string }> = {};
  for (const table of TABLES) {
    const where = table === 'worker_aggregate_counters' ? ' WHERE id = 0' : '';
    result[table] = {
      count: Number(await psql(target, `SELECT COUNT(*) FROM "${schema}"."${table}"`)),
      checksum: await psql(target, `SELECT ${CHECKSUMS[table]} FROM "${schema}"."${table}"${where}`),
    };
  }
  return result;
}

const fileSha256 = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Falta DATABASE_URL (la usa el propio proyecto para PostgreSQL)');

  const source = parseDatabaseUrl(databaseUrl);
  /**
   * La restauración se verifica en un **esquema** de la misma base, no en una base nueva: el rol de
   * la aplicación no tiene `CREATEDB` (crear una base exige el superusuario, dependencia B-1). El
   * volcado y la restauración son reales igualmente: se vuelca la base entera y se recrea tabla por
   * tabla en el esquema de verificación, comparando después el contenido.
   */
  const verifySchema = process.env.DR_VERIFY_SCHEMA ?? 'dr_verify';
  const keepSchema = process.env.DR_KEEP_DATABASE === '1';

  const workDir = join(tmpdir(), 'hotel-dr-verify');
  mkdirSync(workDir, { recursive: true });
  const stamp = Date.now();
  const dumpPath = join(workDir, `${source.database}-${stamp}.sql`);
  const verifySqlPath = join(workDir, `${source.database}-${stamp}-verify.sql`);

  console.log('=== VERIFICACIÓN REAL DE BACKUP Y RESTAURACIÓN (D-08) ===');
  console.log(`Origen: ${source.user}@${source.host}:${source.port}/${source.database}`);
  console.log(`Esquema de verificación: ${verifySchema}\n`);

  // Fallo temprano y claro si faltan las herramientas: sin ellas no hay verificación posible.
  await assertBinary('pg_dump');
  await assertBinary('psql');

  // Limpieza previa: si una ejecución anterior dejó el esquema de verificación (por ejemplo, falló
  // a mitad), el volcado lo incluiría y la restauración chocaría con él. Se parte siempre de cero.
  await psql(source, `DROP SCHEMA IF EXISTS "${verifySchema}" CASCADE`);

  // 1. Volcado REAL (formato plano: se reescribe el esquema destino antes de restaurar).
  const dumpStartedAt = new Date();
  const dumpStart = performance.now();
  await run(
    resolvePostgresBinary('pg_dump'),
    [
      '-h',
      source.host,
      '-p',
      source.port,
      '-U',
      source.user,
      '-d',
      source.database,
      '--format=plain',
      '--no-owner',
      '--no-privileges',
      '--file',
      dumpPath,
    ],
    { env: { ...process.env, PGPASSWORD: source.password }, maxBuffer: 64 * 1024 * 1024 },
  );
  const dumpSeconds = (performance.now() - dumpStart) / 1_000;
  const dumpSizeBytes = statSync(dumpPath).size;
  const dumpSha256 = fileSha256(dumpPath);
  console.log(
    `Volcado: ${(dumpSizeBytes / 1024).toFixed(1)} KiB en ${dumpSeconds.toFixed(2)} s · sha256 ${dumpSha256.slice(0, 16)}…`,
  );

  // El esquema de verificación se limpia SIEMPRE al terminar (también si algo falla): dejarlo atrás
  // contaminaría el siguiente volcado.
  try {
    // 2. Preparar el esquema y reescribir el destino del volcado (mecánico y explícito).
    await psql(source, `DROP SCHEMA IF EXISTS "${verifySchema}" CASCADE`);
    await psql(source, `CREATE SCHEMA "${verifySchema}"`);
    const plain = readFileSync(dumpPath, 'utf8');
    // Dos reescrituras mecánicas y explícitas del volcado, ambas documentadas en el artefacto:
    //  1. el destino pasa de `public` al esquema de verificación;
    //  2. se omiten las sentencias de la EXTENSIÓN (`pgcrypto` ya existe en el clúster y su dueño es
    //     el superusuario; recrearla exige ser su dueño y no aporta nada a la verificación de datos).
    const extensionStatements = plain.match(/^(CREATE EXTENSION|COMMENT ON EXTENSION).*$/gm) ?? [];
    const rewritten = plain
      .replace(/^(CREATE EXTENSION|COMMENT ON EXTENSION).*$/gm, '')
      .replace(/SET search_path = public, pg_catalog;/g, `SET search_path = "${verifySchema}", pg_catalog;`)
      .replace(/SET search_path = public;/g, `SET search_path = "${verifySchema}";`)
      .replace(/\bpublic\./g, `"${verifySchema}".`);
    writeFileSync(verifySqlPath, rewritten, 'utf8');

    // 3. Restauración cronometrada del volcado reescrito (fallo duro ante el primer error de SQL).
    const restoreStart = performance.now();
    await run(
      resolvePostgresBinary('psql'),
      [
        '-h',
        source.host,
        '-p',
        source.port,
        '-U',
        source.user,
        '-d',
        source.database,
        '-v',
        'ON_ERROR_STOP=1',
        '-f',
        verifySqlPath,
      ],
      { env: { ...process.env, PGPASSWORD: source.password }, maxBuffer: 64 * 1024 * 1024 },
    );
    const rtoSeconds = (performance.now() - restoreStart) / 1_000;
    console.log(`Restauración: ${rtoSeconds.toFixed(2)} s (RTO medido)`);

    // 4. Comparación tabla por tabla
    const sourceFingerprint = await fingerprint(source, 'public');
    const restoredFingerprint = await fingerprint(source, verifySchema);
    const comparisons = TABLES.map((table) => ({
      table,
      origen: sourceFingerprint[table],
      restaurada: restoredFingerprint[table],
      coincide:
        sourceFingerprint[table]?.count === restoredFingerprint[table]?.count &&
        sourceFingerprint[table]?.checksum === restoredFingerprint[table]?.checksum,
    }));
    const mismatches = comparisons.filter((row) => !row.coincide);
    const totalRows = comparisons.reduce((sum, row) => sum + (row.origen?.count ?? 0), 0);

    const evidence = {
      prueba: 'backup y restauración reales de PostgreSQL, con comparación de contenido',
      decision: 'D-08 · D-09 (PostgreSQL como única persistencia)',
      origen: { host: source.host, port: source.port, database: source.database },
      esquemaDeVerificacion: verifySchema,
      notaAlcance:
        'La restauración se verifica en un esquema de la misma base porque el rol de la aplicación no tiene CREATEDB (crear una base exige el superusuario, dependencia B-1). El volcado y la restauración son reales',
      volcado: {
        fichero: dumpPath,
        tamanoBytes: dumpSizeBytes,
        sha256: dumpSha256,
        duracionSegundos: Number(dumpSeconds.toFixed(2)),
        rpo: dumpStartedAt.toISOString(),
        formato: 'pg_dump --format=plain --no-owner --no-privileges',
      },
      restauracion: {
        rtoSegundos: Number(rtoSeconds.toFixed(2)),
        comando: 'psql -v ON_ERROR_STOP=1 -f <volcado reescrito al esquema de verificación>',
        sentenciasDeExtensionOmitidas: extensionStatements.length,
      },
      comparacion: comparisons,
      filasComparadas: totalRows,
      esquemaConservado: keepSchema,
      resultado: mismatches.length === 0 ? 'CUMPLE' : 'NO CUMPLE',
      fecha: new Date().toISOString(),
    };

    mkdirSync(resolve(repoRoot, 'RepoTecnico', 'evidencias'), { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

    for (const row of comparisons) {
      console.log(
        `  ${row.coincide ? 'OK ' : 'XX '} ${row.table.padEnd(26)} ${String(row.origen?.count ?? '?').padStart(6)} filas · suma ${row.origen?.checksum}`,
      );
    }
    console.log(`\nEvidencia: ${evidencePath}`);

    if (mismatches.length > 0) {
      throw new Error(
        `La restauración NO reproduce el origen en ${mismatches.map((row) => row.table).join(', ')}: la copia no es válida`,
      );
    }

    console.log(
      `\n=== DR REAL: CUMPLE (${totalRows} filas comparadas · RTO ${rtoSeconds.toFixed(2)} s · RPO ${dumpStartedAt.toISOString()}) ===`,
    );
  } finally {
    if (!keepSchema) {
      await psql(source, `DROP SCHEMA IF EXISTS "${verifySchema}" CASCADE`).catch(() => undefined);
    }
  }
}

main().catch((error: unknown) => {
  console.error(`\nVERIFICACIÓN DE DR FALLIDA: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

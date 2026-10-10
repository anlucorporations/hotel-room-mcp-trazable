import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guardián de arquitectura de `packages/shared` (M8 · D-08).
 *
 * Los guardianes que existían vivían todos en `apps/web` (calldata verificado, recepción, pausa,
 * frontera cliente/servidor): el paquete que comparten TODOS los procesos no tenía ninguno. Aquí se
 * fijan invariantes que ya se rompieron una vez o que separan responsabilidades que, si se mezclan,
 * fallan en producción de forma silenciosa:
 *
 *   1. **Orden de la migración incremental** (la lección de M7): el `ALTER TABLE … ADD COLUMN` de
 *      `worker_sale_history.block_timestamp` va ANTES del índice sobre esa columna. Al revés, el
 *      worker no arranca contra una base ya creada («no existe la columna»).
 *   2. **Un solo contrato canónico**: los caminos de escritura (recepción, quema) y los pases usan el
 *      ABI de `HotelNights`, nunca el de la generación legacy. Esa generación (`HotelNFT` +
 *      `HotelMarketplace`) **ya no existe** en el paquete: se retiró en M9 (ADR-02/D-02) y el
 *      guardián falla si alguien vuelve a introducir sus ficheros o sus identificadores.
 *   3. **La conexión bloqueante de Redis es de los workers de cola**: `getBlockingRedisClient` exige
 *      `maxRetriesPerRequest: null`, que deja colgadas las peticiones HTTP; no puede aparecer en
 *      servicios que atienden peticiones.
 *   4. **Nada de secretos embebidos** en el paquete: ni claves privadas ni tokens con pinta de
 *      credencial (el patrón `process.env.X || "<literal>"` fue el defecto de la auditoría).
 *   5. **Paridad de esquema**: toda tabla de `db/schema.sql` existe también en el esquema que aplica
 *      `runMigrations` (`db/migrator.ts`). Son dos copias del mismo esquema y ya divergen en
 *      columnas; esto evita que diverjan al menos en tablas.
 */
const here = dirname(fileURLToPath(import.meta.url));
const SRC = here;
/** Raíz del repositorio: los guardianes comparan también artefactos de fuera del paquete. */
const REPO_ROOT = join(here, '..', '..', '..');
const read = (path: string): string => readFileSync(join(SRC, path), 'utf8');

/** Ficheros fuente del paquete (sin tests: se audita el producto). */
function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
      files.push(full);
    }
  };
  walk(SRC);
  return files.sort();
}

const rel = (file: string): string => relative(SRC, file).replace(/\\/g, '/');

describe('guardián de arquitectura de packages/shared (M8)', () => {
  it('la migración incremental va ANTES del índice que usa la columna nueva', () => {
    const migrator = read('db/migrator.ts');
    const alterIndex = migrator.indexOf('ADD COLUMN IF NOT EXISTS block_timestamp');
    const indexIndex = migrator.indexOf('idx_worker_sale_history_ts');

    expect(alterIndex).toBeGreaterThan(-1);
    expect(indexIndex).toBeGreaterThan(-1);
    // Regresión de M7: con el índice primero, `CREATE INDEX` sobre una columna inexistente aborta la
    // migración y el worker no arranca contra una base ya creada.
    expect(alterIndex).toBeLessThan(indexIndex);
  });

  it('los caminos de escritura usan el ABI canónico, nunca el legacy', () => {
    // `reception` y `burner` firman transacciones contra el contrato: tienen que usar SU ABI.
    for (const path of ['reception/service.ts', 'burner/service.ts']) {
      const source = read(path);
      expect(source, path).toContain('hotel-nights');
      expect(source, path).not.toContain('hotelNftAbi');
      expect(source, path).not.toContain('hotelMarketplaceAbi');
    }

    // Y ningún módulo del paquete puede *usar* la generación legacy. Sus ficheros de ABI se
    // retiraron del repositorio en M9, así que aquí ya no hay nada que excluir: la comprobación
    // cubre TODO el paquete y el test siguiente vigila que no vuelvan a aparecer.
    const offenders = sourceFiles()
      .filter((file) => readFileSync(file, 'utf8').includes('hotelMarketplaceAbi'))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('la generación legacy de contratos no vuelve al paquete (retirada en M9)', () => {
    // ADR-02/D-02: el único contrato canónico es `HotelNights`. La pareja legacy se retiró del
    // runtime y después del repositorio; este test es la barrera que impide su reaparición por
    // copia de un fichero antiguo o por un codegen que la vuelva a emitir.
    const legacyAbiModules = ['abi/hotel-nft.ts', 'abi/hotel-marketplace.ts'];
    const reintroducedFiles = legacyAbiModules.filter((path) => existsSync(join(SRC, path)));
    expect(reintroducedFiles).toEqual([]);

    const legacyIdentifiers = ['hotelNftAbi', 'hotelMarketplaceAbi'];
    const offenders = sourceFiles()
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return legacyIdentifiers.some((identifier) => source.includes(identifier));
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('la conexión bloqueante de Redis solo la usan los workers de cola (no los servicios HTTP)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const name = rel(file);
      if (name === 'redis/client.ts') continue; // donde se define
      const source = readFileSync(file, 'utf8');
      if (!source.includes('getBlockingRedisClient')) continue;
      // `queue/notifications.ts` (BullMQ) y `burner` (cerrojo de la quema) son los consumidores
      // legítimos: ambos necesitan bloquear, no atender peticiones.
      const allowed = name.startsWith('queue/') || name.startsWith('burner/');
      if (!allowed) offenders.push(name);
    }

    expect(offenders).toEqual([]);
  });

  it('no hay secretos embebidos ni respaldos literales de variables de entorno secretas', () => {
    const offenders: string[] = [];
    // Solo se marcan variables cuyo NOMBRE declara un secreto: los respaldos no secretos (un correo
    // de avisos, una URL de RPC local) están documentados y son deliberados.
    const SECRET_ENV = /process\.env\.([A-Z0-9_]*(?:SECRET|KEY|PASSWORD|PASS|TOKEN|PRIVATE|SEED|SALT)[A-Z0-9_]*) *(?:\|\||\?\?) *["'][^"']+["']/;
    // El hash cero es el centinela documentado de «fila sin anclar» (`UNANCHORED_TX_HASH`), no una
    // clave.
    const ZERO_HASH = /^0x0{64}$/;

    for (const file of sourceFiles()) {
      const source = readFileSync(file, 'utf8');
      const name = rel(file);
      for (const match of source.matchAll(/0x[0-9a-fA-F]{64}\b/g)) {
        if (!ZERO_HASH.test(match[0])) offenders.push(`${name} (clave privada)`);
      }
      if (/\bglpat-[A-Za-z0-9_-]{10,}/.test(source)) offenders.push(`${name} (token GitLab)`);
      const secretFallback = SECRET_ENV.exec(source);
      if (secretFallback) {
        offenders.push(`${name} (respaldo literal de ${secretFallback[1] ?? 'env secreta'})`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('toda tabla de `db/schema.sql` existe en el esquema que aplica `runMigrations`', () => {
    const schema = read('db/schema.sql');
    const migrator = read('db/migrator.ts');
    const tablesOf = (sql: string): string[] =>
      [...sql.matchAll(/CREATE TABLE IF NOT EXISTS "?(\w+)"?/g)].map((match) => match[1] ?? '');

    const declared = tablesOf(schema);
    const applied = new Set(tablesOf(migrator));
    expect(declared.length).toBeGreaterThan(5);

    const missing = declared.filter((table) => !applied.has(table));
    expect(missing, `tablas de schema.sql ausentes en runMigrations: ${missing.join(', ')}`).toEqual([]);
  });

  it('toda tabla del artefacto `RepoTecnico/base_datos.sql` existe en `runMigrations` (D8)', () => {
    // Decisión D8 (auditoría vNext): el script que se aplica a mano en producción
    // (`RepoTecnico/base_datos.sql`) y el esquema que aplica el migrador son dos copias del mismo
    // modelo, y ya divergieron una vez (hallazgo H-08: el script describía tablas que el migrador no
    // creaba). El guardián las compara tabla a tabla en los dos sentidos: ninguna de las dos puede
    // declarar una tabla que la otra ignore.
    const rootSql = readFileSync(join(REPO_ROOT, 'RepoTecnico', 'base_datos.sql'), 'utf8');
    const tablesOf = (sql: string): string[] =>
      [...sql.matchAll(/CREATE TABLE IF NOT EXISTS "?(\w+)"?/g)].map((match) => match[1] ?? '');
    const enScript = tablesOf(rootSql);
    const enMigrador = new Set(tablesOf(read('db/migrator.ts')));

    expect(enScript.length).toBeGreaterThan(40);
    const faltanEnMigrador = enScript.filter((table) => !enMigrador.has(table));
    expect(faltanEnMigrador, `tablas de base_datos.sql ausentes en runMigrations: ${faltanEnMigrador.join(', ')}`).toEqual([]);

    // Y al revés: el vNext añade 12 tablas a los dos artefactos a la vez (P8); si una se queda solo
    // en el migrador, producción (que aplica el script) no la tendría.
    const faltanEnScript = [...enMigrador].filter((table) => !enScript.includes(table));
    expect(faltanEnScript, `tablas de runMigrations ausentes en base_datos.sql: ${faltanEnScript.join(', ')}`).toEqual([]);
  });

  it('la traza de sesión se pseudonimiza SIEMPRE antes de tocar la base de datos (ADR-24)', () => {
    // Decisión de M9: `admin_sessions` guarda un HMAC de la IP y del *user agent*, nunca el valor en
    // claro. El único punto de escritura es `createSession`, así que se comprueba ahí: si alguien
    // vuelve a pasar los valores crudos, la traza personal reaparecería sin que ninguna prueba de
    // comportamiento lo note (el INSERT seguiría funcionando).
    const repo = read('db/repositories/sessions.repository.ts');
    expect(repo).toContain('hashSessionTrace(ipAddress)');
    expect(repo).toContain('hashSessionTrace(userAgent)');
    // Los parámetros crudos no pueden llegar al INSERT.
    expect(repo).not.toMatch(/\[\s*username,\s*role,\s*refreshTokenHash,\s*ipAddress,\s*userAgent/);
  });

  it('el mensaje EIP-712 del resguardo vive en el dominio isomorfo, no en el módulo de servidor', () => {
    // El cliente tiene que firmar EXACTAMENTE el mensaje que verifica el servidor. Si el dominio y
    // los tipos se declararan de nuevo en `passes/jws.ts` (que importa `node:crypto`), el componente
    // de compra tendría que importar del barril raíz —arrastrando el servidor al navegador— o
    // duplicar la definición y arriesgarse a que las dos versiones diverjan.
    const jws = read('passes/jws.ts');
    expect(jws).toContain('from "../domain/ticket-auth"');

    const ticketAuth = read('domain/ticket-auth.ts');
    expect(ticketAuth).toContain('QR_REDOWNLOAD_DOMAIN');
    expect(ticketAuth).toContain('QR_REDOWNLOAD_TYPES');
    expect(ticketAuth).not.toMatch(/from "node:/);

    // Y el punto de entrada isomorfo lo expone: es lo que permite al cliente importarlo.
    expect(read('browser.ts')).toContain('domain/ticket-auth');
  });

  it('la retención declarada tiene un ejecutor (M9): purga de sesiones y correos', () => {
    // Un plazo de conservación que nadie ejecuta no es un plazo. Este invariante es la lección de
    // M9: `purgeOldNotifications` existía desde el principio y no la invocaba nadie.
    const retention = read('maintenance/retention.ts');
    expect(retention).toContain('admin_sessions');
    expect(retention).toContain('mfa_recovery_codes');
    expect(retention).toContain('purgeOldNotifications');
    // El módulo tiene que estar exportado por el paquete: si no, el worker no puede invocarlo.
    expect(read('index.ts')).toContain('maintenance/retention');
  });
});

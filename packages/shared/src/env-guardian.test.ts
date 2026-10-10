import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guardián de **provisión de las variables de quema** (auditoría V6 · hallazgo H-03, quick win QW-4).
 *
 * El defecto que fija: el proceso de quema de noches caducadas tiene **dos caminos** —el planificador
 * diario del worker y la quema manual del panel por relayer— y sus variables no estaban provisionadas
 * en ninguna parte. `RELAYER_*` no aparecía ni en `.env.example` ni en el manual, y
 * `infra/gcp/70-deploy-apps.sh` (la vía documentada de redespliegue) no llevaba **ninguna** variable
 * de quema: cada despliegue normal apagaba el planificador y el relayer **en silencio**. Comprobado en
 * vivo el 2026-10-10: el worker desplegado tenía 17 variables y ninguna `BURNER_*`; la web, 28 y
 * ninguna `RELAYER_*` (los dos caminos apagados, con los secretos ya creados en Secret Manager).
 *
 * Este guardián exige, para cada variable del dominio de quema, que esté **documentada** (`.env.example`
 * y manual de variables) y **cableada en el script de despliegue**. Si alguien renombra una variable en
 * el código o la quita del script, la prueba se pone roja antes de que un despliegue la apague.
 */
const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..', '..', '..');
const read = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');

/** Variables del dominio de quema: documentadas siempre. */
const BURN_VARS = [
  'BURNER_WALLET_PRIVATE_KEY',
  'BURNER_MIN_BALANCE_NATIVE',
  'BURN_HOUR_LOCAL',
  'BURN_TIMEZONE',
  'BURN_INTERVAL_MS',
  'RELAYER_WALLET_PRIVATE_KEY',
  'RELAYER_MIN_BALANCE_NATIVE',
  'DEVOPS_ALERT_EMAIL',
] as const;

/**
 * Variables que el **script de despliegue** debe cablear. `BURN_INTERVAL_MS` queda fuera a propósito:
 * es el modo forzado de desarrollo/demo (ignora la hora y quema cada N ms), y llevarlo a producción
 * sería un riesgo, no una función.
 */
const DEPLOY_WIRED_VARS = BURN_VARS.filter((name) => name !== 'BURN_INTERVAL_MS');

/** Ficheros que documentan la configuración y el despliegue. */
const ENV_EXAMPLE = '.env.example';
const DEPLOY_SCRIPT = 'infra/gcp/70-deploy-apps.sh';
const ENV_MANUAL = 'RepoTecnico/Manuales/02-instalacion/01-variables-de-entorno.md';

/** Ficheros del código que leen la configuración de quema. */
const BURN_SOURCES = [
  'apps/worker/src/config.ts',
  'apps/worker/src/main.ts',
  'apps/worker/src/burn-scheduler.ts',
  'packages/shared/src/burner/service.ts',
  'apps/web/src/app/api/admin/expired/burn/route.ts',
];

describe('guardián de configuración de quema (auditoría V6 · H-03 / QW-4)', () => {
  it('el código sigue leyendo cada variable vigilada (el guardián no se queda obsoleto)', () => {
    // Se comprueba contra los ficheros del dominio en vez de contra una sintaxis concreta: el worker
    // declara las variables en su esquema zod y la web las lee de `process.env`, así que exigir
    // `process.env.X` daría falsos negativos.
    const sources = BURN_SOURCES.map((file) => ({ file, text: read(file) }));
    const missing = BURN_VARS.filter((name) => !sources.some(({ text }) => text.includes(name)));
    expect(missing, 'variables vigiladas que ya no lee ningún fichero del dominio').toEqual([]);
  });

  it('cada variable está documentada en `.env.example`', () => {
    const example = read(ENV_EXAMPLE);
    const missing = BURN_VARS.filter((name) => !example.includes(name));
    expect(missing, `variables de quema sin documentar en ${ENV_EXAMPLE}`).toEqual([]);
  });

  it('cada variable está en el manual de variables de entorno', () => {
    const manual = read(ENV_MANUAL);
    const missing = BURN_VARS.filter((name) => !manual.includes(name));
    expect(missing, `variables de quema sin documentar en el manual`).toEqual([]);
  });

  it('el script de despliegue cablea todas las variables de producción (no las apaga en silencio)', () => {
    const script = read(DEPLOY_SCRIPT);
    const missing = DEPLOY_WIRED_VARS.filter((name) => !script.includes(name));
    expect(
      missing,
      `variables de quema ausentes de ${DEPLOY_SCRIPT}: un redespliegue las apagaría sin avisar`,
    ).toEqual([]);
  });

  it('el script avisa cuando despliega con la quema desactivada y la activa solo si se le pide', () => {
    const script = read(DEPLOY_SCRIPT);
    // Activación explícita...
    expect(script).toContain('ENABLE_BURN_SCHEDULER');
    expect(script).toContain('ENABLE_RELAYER_BURN');
    // ...y aviso cuando no se pide (el silencio era justo el defecto).
    expect(script).toContain('la quema programada quedará DESACTIVADA');
    expect(script).toContain('503 RELAYER_NOT_CONFIGURED');
  });

  it('no queda la variable obsoleta como si fuera la buena', () => {
    // `BURNER_BOT_PRIVATE_KEY` no la lee nadie (el manual atribuía la quema a ella). Se conserva solo
    // marcada como obsoleta, para no romper entornos antiguos que aún la definan.
    const example = read(ENV_EXAMPLE);
    const line = example.split('\n').find((l) => l.startsWith('BURNER_BOT_PRIVATE_KEY='));
    expect(line, 'BURNER_BOT_PRIVATE_KEY debe seguir declarada (aunque obsoleta)').toBeDefined();
    expect(example).toContain('OBSOLETA');
  });
});

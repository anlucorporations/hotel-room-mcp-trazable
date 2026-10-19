import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/**
 * Verificación del criterio **A8** de la Fase 3 (rendimiento) contra el sistema en marcha.
 *
 * Escenario declarado: **20 usuarios concurrentes**, inventario de **50 habitaciones** y ventana de
 * calendario de **90 días**. Mide por separado los dos SLA del gate:
 *   - **tablero** (`/api/housekeeping/state-board`): p95 < 500 ms (RNF-M-05)
 *   - **listado** (`/api/nfts?limit=50`, ventana de 90 días): p95 < 800 ms
 *
 * Valida el **contenido** de cada respuesta (no solo el 200) para no certificar un mock. La sesión
 * de operador se obtiene con login + TOTP reales (variables de entorno, nunca en el repositorio).
 *
 * Uso:
 *   LOAD_WEB_URL=… LOAD_ADMIN_USER=… LOAD_ADMIN_PASSWORD=… LOAD_TOTP_SECRET=… \
 *     node --experimental-strip-types scripts/load-tests/run-gate-a8.ts
 */

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const evidencePath = resolve(repoRoot, 'RepoTecnico', 'evidencias', 'a8-load-gate.json');

const WEB_URL = (process.env.LOAD_WEB_URL ?? 'http://127.0.0.1:3210').replace(/\/+$/, '');
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? '20');
const DURATION_SECONDS = Number(process.env.LOAD_DURATION_S ?? '20');
const TABLERO_P95_SLA_MS = Number(process.env.LOAD_TABLERO_P95_MS ?? '500');
const LISTADO_P95_SLA_MS = Number(process.env.LOAD_LISTADO_P95_MS ?? '800');
const MAX_ERROR_RATE = Number(process.env.LOAD_MAX_ERROR_RATE ?? '0.01');
const TIMEOUT_MS = 8_000;

const otplibRequire = createRequire(resolve(fileURLToPath(new URL('../../packages/shared/package.json', import.meta.url))));
const otplib = otplibRequire('otplib') as { generateSync: (options: { secret: string }) => string };
const totp = (): string => otplib.generateSync({ secret: TOTP_SECRET as string });

const USER = process.env.LOAD_ADMIN_USER;
const PASSWORD = process.env.LOAD_ADMIN_PASSWORD;
const TOTP_SECRET = process.env.LOAD_TOTP_SECRET;

if (!USER || !PASSWORD || !TOTP_SECRET) {
  throw new Error(
    'Faltan LOAD_ADMIN_USER / LOAD_ADMIN_PASSWORD / LOAD_TOTP_SECRET: el tablero exige sesión de operador real.',
  );
}

interface Sample {
  readonly endpoint: 'tablero' | 'listado';
  readonly latencyMs: number;
  readonly error: string | null;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

async function login(): Promise<string> {
  const first = await fetch(`${WEB_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASSWORD }),
  });
  const loginBody = (await first.json()) as { sessionToken?: string };
  if (!first.ok || !loginBody.sessionToken) throw new Error(`login falló: HTTP ${first.status}`);
  const verify = await fetch(`${WEB_URL}/api/auth/mfa/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionToken: loginBody.sessionToken,
      totpCode: totp(),
    }),
  });
  const cookies = verify.headers.getSetCookie?.() ?? [];
  const authCookie = cookies.map((cookie) => cookie.split(';')[0]).filter(Boolean).join('; ');
  if (!verify.ok || authCookie.length === 0) throw new Error(`MFA falló: HTTP ${verify.status}`);
  return authCookie;
}

function isoDate(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
}

async function measure(
  endpoint: Sample['endpoint'],
  url: string,
  cookie: string,
): Promise<Sample> {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json', ...(endpoint === 'tablero' ? { cookie } : {}) },
    });
    const body = await response.text();
    const latencyMs = performance.now() - started;
    if (response.status !== 200) return { endpoint, latencyMs, error: `HTTP ${response.status}` };
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (endpoint === 'tablero') {
      if (!Array.isArray(parsed.rooms) || typeof parsed.summary !== 'object') {
        return { endpoint, latencyMs, error: 'tablero sin rooms/summary' };
      }
    } else if (!Array.isArray(parsed.items)) {
      return { endpoint, latencyMs, error: 'listado sin items' };
    }
    return { endpoint, latencyMs, error: null };
  } catch (error: unknown) {
    return { endpoint, latencyMs: performance.now() - started, error: error instanceof Error ? error.message : String(error) };
  }
}

async function main(): Promise<void> {
  console.log('=== CRITERIO A8 · CARGA REAL (20 usuarios / 50 habitaciones / 90 días) ===');
  const cookie = await login();
  const tableroUrl = `${WEB_URL}/api/housekeeping/state-board`;
  const listadoUrl = `${WEB_URL}/api/nfts?limit=50&dateFrom=${isoDate(0)}&dateTo=${isoDate(90)}`;

  // Comprobación dimensional: el tablero real tiene que mostrar el inventario declarado.
  const inventoryProbe = await measure('tablero', tableroUrl, cookie);
  if (inventoryProbe.error !== null) throw new Error(`El tablero no responde: ${inventoryProbe.error}`);
  const tablero = (await (await fetch(tableroUrl, { headers: { cookie } })).json()) as {
    rooms: unknown[];
  };
  const rooms = tablero.rooms.length;
  console.log(`Inventario real del tablero: ${rooms} habitaciones · ventana de listado: 90 días`);

  const deadline = Date.now() + DURATION_SECONDS * 1_000;
  const samples: Sample[] = [];
  const virtualUser = async (): Promise<void> => {
    while (Date.now() < deadline) {
      samples.push(await measure('tablero', tableroUrl, cookie));
      samples.push(await measure('listado', listadoUrl, ''));
    }
  };
  const started = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, virtualUser));
  const elapsed = (Date.now() - started) / 1_000;

  const summarize = (endpoint: Sample['endpoint']) => {
    const rows = samples.filter((sample) => sample.endpoint === endpoint);
    const latencies = rows.map((row) => row.latencyMs).sort((a, b) => a - b);
    const errors = rows.filter((row) => row.error !== null);
    return {
      requests: rows.length,
      rps: Number((rows.length / elapsed).toFixed(1)),
      p50Ms: Number(percentile(latencies, 50).toFixed(1)),
      p95Ms: Number(percentile(latencies, 95).toFixed(1)),
      p99Ms: Number(percentile(latencies, 99).toFixed(1)),
      errors: errors.length,
      firstError: errors[0]?.error ?? null,
    };
  };

  const tableroStats = summarize('tablero');
  const listadoStats = summarize('listado');
  const totalErrors = samples.filter((sample) => sample.error !== null).length;
  const errorRate = samples.length === 0 ? 1 : totalErrors / samples.length;

  const checks = {
    tableroP95WithinSla: tableroStats.p95Ms <= TABLERO_P95_SLA_MS,
    listadoP95WithinSla: listadoStats.p95Ms <= LISTADO_P95_SLA_MS,
    errorRateWithinSla: errorRate <= MAX_ERROR_RATE,
    inventoryDeclared: rooms === 50,
    windowDeclared: true,
  };
  const passed = Object.values(checks).every(Boolean);

  const evidence = {
    prueba: 'criterio A8 (rendimiento) con carga real concurrente contra el sistema en marcha',
    decision: 'A8 · RNF-M-05',
    escenario: { usuariosConcurrentes: CONCURRENCY, habitaciones: rooms, ventanaDias: 90, duracionSegundos: DURATION_SECONDS },
    sla: { tableroP95Ms: TABLERO_P95_SLA_MS, listadoP95Ms: LISTADO_P95_SLA_MS, tasaErrorMaxima: MAX_ERROR_RATE },
    tablero: tableroStats,
    listado: listadoStats,
    errorRate: Number(errorRate.toFixed(4)),
    checks,
    resultado: passed ? 'CUMPLE' : 'NO CUMPLE',
    fecha: new Date().toISOString(),
  };
  mkdirSync(resolve(repoRoot, 'RepoTecnico', 'evidencias'), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`tablero: ${tableroStats.requests} req · p95 ${tableroStats.p95Ms} ms (SLA ${TABLERO_P95_SLA_MS})`);
  console.log(`listado: ${listadoStats.requests} req · p95 ${listadoStats.p95Ms} ms (SLA ${LISTADO_P95_SLA_MS})`);
  console.log(`errores: ${(errorRate * 100).toFixed(2)} %`);
  console.log(`Evidencia: ${evidencePath}`);
  if (!passed) {
    throw new Error(`A8 NO CUMPLE: ${Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k).join(', ')}`);
  }
  console.log('\n=== A8: CUMPLE ===');
}

main().catch((error: unknown) => {
  console.error(`A8 FALLIDA: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

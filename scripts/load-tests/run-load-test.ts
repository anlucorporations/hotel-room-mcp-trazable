import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Prueba de carga REAL (D-08, RNF-05) contra el **sistema en marcha**, no contra un mock.
 *
 * El estado auditado tenía aquí un «benchmark» que, si no se le daba un `TARGET_URL`, **levantaba su
 * propio servidor de mentira** en el puerto 3009 y medía ese: el informe certificaba 200 usuarios
 * concurrentes midiendo un `http.createServer` local con respuestas prefabricadas. Este guion hace
 * lo contrario:
 *
 *   1. Mide endpoints **reales** por HTTP (worker y/o web ya arrancados).
 *   2. **Valida el contenido** de cada respuesta (no basta un 200): si el endpoint devolviese un
 *      mock, un error o una página vacía, cuenta como fallo. Un objetivo inalcanzable **aborta**.
 *   3. Publica un artefacto con percentiles, throughput y tasa de error medidos, más el veredicto
 *      contra los SLA declarados.
 *
 * Uso:
 *   node --experimental-strip-types scripts/load-tests/run-load-test.ts
 *
 * Variables (todas opcionales, con los valores por defecto del entorno de desarrollo):
 *   LOAD_WORKER_URL      base del worker       (por defecto http://127.0.0.1:8787)
 *   LOAD_WEB_URL         base de la web        (por defecto http://127.0.0.1:3210; se omite si no responde)
 *   LOAD_CONCURRENCY     usuarios concurrentes (por defecto 200)
 *   LOAD_DURATION_S      segundos de carga     (por defecto 20)
 *   LOAD_P95_MS          SLA de latencia p95   (por defecto 500)
 *   LOAD_MAX_ERROR_RATE  tasa de error máxima  (por defecto 0.01 = 1 %)
 *
 * Nota de alcance: es un generador **en un único proceso Node** (k6 no está instalado en este
 * entorno: bloqueante B-3). Certifica el SLA en local/CI con carga real; el perfil largo de k6 sigue
 * en `scripts/load-tests/catalog-load.js` para cuando se instale k6.
 */

interface EndpointProbe {
  readonly name: string;
  readonly url: string;
  /** Devuelve `null` si la respuesta es válida, o el motivo del rechazo. */
  readonly validate: (status: number, body: string) => string | null;
}

interface Sample {
  readonly endpoint: string;
  readonly latencyMs: number;
  readonly status: number;
  readonly error: string | null;
}

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const evidencePath = resolve(repoRoot, 'RepoTecnico', 'evidencias', 'load-test.json');

const WORKER_URL = (process.env.LOAD_WORKER_URL ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');
const WEB_URL = (process.env.LOAD_WEB_URL ?? 'http://127.0.0.1:3210').replace(/\/+$/, '');
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? '200');
const DURATION_SECONDS = Number(process.env.LOAD_DURATION_S ?? '20');
const P95_SLA_MS = Number(process.env.LOAD_P95_MS ?? '500');
const MAX_ERROR_RATE = Number(process.env.LOAD_MAX_ERROR_RATE ?? '0.01');
const REQUEST_TIMEOUT_MS = 5_000;

const jsonField = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

/** Validación de contenido: el objetivo tiene que devolver el contrato real del endpoint. */
const validators = {
  aggregates: (status: number, body: string): string | null => {
    if (status !== 200) return `HTTP ${status}`;
    const parsed = jsonField(body) as Record<string, unknown> | undefined;
    if (!parsed || !Array.isArray(parsed.monthlySeries)) return 'sin monthlySeries (¿respuesta de mentira?)';
    if (typeof parsed.lastBlock !== 'number') return 'sin lastBlock';
    if (parsed.timeZone !== 'Europe/Madrid') return `zona inesperada: ${String(parsed.timeZone)}`;
    return null;
  },
  history: (status: number, body: string): string | null => {
    if (status !== 200) return `HTTP ${status}`;
    const parsed = jsonField(body);
    if (!Array.isArray(parsed)) return 'no es una lista';
    if (parsed.length === 0) return 'histórico vacío (¿sistema real?)';
    const entry = parsed[0] as Record<string, unknown>;
    if (typeof entry.tokenId !== 'string' || typeof entry.priceWei !== 'string') return 'entrada sin contrato';
    return null;
  },
  health: (status: number, body: string): string | null => {
    // 503 es legítimo (correo degradado): lo que se mide es que responda el componente real.
    if (status !== 200 && status !== 503) return `HTTP ${status}`;
    const parsed = jsonField(body) as Record<string, unknown> | undefined;
    if (!parsed || typeof parsed.status !== 'string' || typeof parsed.component !== 'string') {
      return 'informe de salud con forma inesperada';
    }
    return null;
  },
  webHome: (status: number, body: string): string | null => {
    if (status !== 200) return `HTTP ${status}`;
    if (!body.includes('<html')) return 'no es HTML';
    return null;
  },
  salesHistory: (status: number, body: string): string | null => {
    if (status !== 200) return `HTTP ${status}`;
    const parsed = jsonField(body) as Record<string, unknown> | undefined;
    if (!parsed || !Array.isArray(parsed.items)) return 'sin items';
    return null;
  },
} as const;

async function probeReachable(probe: EndpointProbe): Promise<boolean> {
  try {
    const response = await fetch(probe.url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: '*/*' },
    });
    const body = await response.text();
    return probe.validate(response.status, body) === null;
  } catch {
    return false;
  }
}

async function oneRequest(probe: EndpointProbe): Promise<Sample> {
  const started = performance.now();
  try {
    const response = await fetch(probe.url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: '*/*' },
    });
    const body = await response.text();
    const latencyMs = performance.now() - started;
    return { endpoint: probe.name, latencyMs, status: response.status, error: probe.validate(response.status, body) };
  } catch (error: unknown) {
    return {
      endpoint: probe.name,
      latencyMs: performance.now() - started,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const percentile = (sorted: readonly number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
};

async function main(): Promise<void> {
  console.log('=== PRUEBA DE CARGA REAL (D-08 · RNF-05) ===');
  console.log(`Generador: Node ${process.version} en un solo proceso (k6 no instalado: B-3)`);
  console.log(
    `Concurrencia: ${CONCURRENCY} · duración: ${DURATION_SECONDS}s · SLA p95 < ${P95_SLA_MS} ms · error < ${(MAX_ERROR_RATE * 100).toFixed(1)} %\n`,
  );

  const candidates: EndpointProbe[] = [
    { name: 'worker:/aggregates', url: `${WORKER_URL}/aggregates`, validate: validators.aggregates },
    { name: 'worker:/history', url: `${WORKER_URL}/history`, validate: validators.history },
    { name: 'worker:/health', url: `${WORKER_URL}/health`, validate: validators.health },
    { name: 'web:/', url: `${WEB_URL}/`, validate: validators.webHome },
    { name: 'web:/api/sales/history', url: `${WEB_URL}/api/sales/history?limit=10`, validate: validators.salesHistory },
    { name: 'web:/health/ready', url: `${WEB_URL}/health/ready`, validate: validators.health },
  ];

  const probes: EndpointProbe[] = [];
  const skipped: string[] = [];
  for (const probe of candidates) {
    if (await probeReachable(probe)) {
      probes.push(probe);
      console.log(`  · objetivo activo:  ${probe.name}`);
    } else {
      skipped.push(probe.name);
      console.log(`  · objetivo omitido: ${probe.name} (no responde)`);
    }
  }

  const workerProbes = probes.filter((probe) => probe.name.startsWith('worker:'));
  if (workerProbes.length === 0) {
    throw new Error(
      `El worker no responde en ${WORKER_URL}: sin sistema real que medir, la prueba de carga NO certifica nada`,
    );
  }

  const samples: Sample[] = [];
  const deadline = Date.now() + DURATION_SECONDS * 1_000;

  const virtualUser = async (): Promise<void> => {
    while (Date.now() < deadline) {
      const probe = probes[Math.floor(Math.random() * probes.length)];
      if (!probe) return;
      samples.push(await oneRequest(probe));
    }
  };

  const startedAt = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, virtualUser));
  const elapsedSeconds = (Date.now() - startedAt) / 1_000;

  const byEndpoint = new Map<string, Sample[]>();
  for (const sample of samples) {
    const list = byEndpoint.get(sample.endpoint) ?? [];
    list.push(sample);
    byEndpoint.set(sample.endpoint, list);
  }

  const errorCount = samples.filter((sample) => sample.error !== null).length;
  const errorRate = samples.length === 0 ? 1 : errorCount / samples.length;
  const allLatencies = samples.map((sample) => sample.latencyMs).sort((a, b) => a - b);

  const perEndpoint = [...byEndpoint.entries()].map(([endpoint, list]) => {
    const latencies = list.map((sample) => sample.latencyMs).sort((a, b) => a - b);
    const failures = list.filter((sample) => sample.error !== null);
    return {
      endpoint,
      requests: list.length,
      rps: Number((list.length / elapsedSeconds).toFixed(1)),
      p50Ms: Number(percentile(latencies, 50).toFixed(1)),
      p95Ms: Number(percentile(latencies, 95).toFixed(1)),
      p99Ms: Number(percentile(latencies, 99).toFixed(1)),
      maxMs: Number((latencies.at(-1) ?? 0).toFixed(1)),
      errors: failures.length,
      firstError: failures[0]?.error ?? null,
    };
  });

  const p95 = Number(percentile(allLatencies, 95).toFixed(1));
  const verdict = {
    requests: samples.length,
    rps: Number((samples.length / elapsedSeconds).toFixed(1)),
    p50Ms: Number(percentile(allLatencies, 50).toFixed(1)),
    p95Ms: p95,
    p99Ms: Number(percentile(allLatencies, 99).toFixed(1)),
    errorRate: Number(errorRate.toFixed(4)),
    checks: {
      requestsMeasured: samples.length > 0,
      p95WithinSla: p95 <= P95_SLA_MS,
      errorRateWithinSla: errorRate <= MAX_ERROR_RATE,
      workerMeasured: workerProbes.length > 0,
    },
  };

  const passed = Object.values(verdict.checks).every(Boolean);
  const evidence = {
    prueba: 'carga real por HTTP contra el sistema en marcha',
    decision: 'D-08 (verificación reproducible) · RNF-05',
    generador: {
      tipo: 'Node (fetch) en un solo proceso',
      version: process.version,
      nota: 'k6 no está instalado en este entorno (bloqueante B-3); su perfil largo sigue en scripts/load-tests/catalog-load.js',
    },
    parametros: { concurrencia: CONCURRENCY, duracionSegundos: DURATION_SECONDS, timeoutMs: REQUEST_TIMEOUT_MS },
    sla: { p95Ms: P95_SLA_MS, tasaErrorMaxima: MAX_ERROR_RATE },
    objetivosMedidos: probes.map((probe) => probe.name),
    objetivosOmitidos: skipped,
    resultado: passed ? 'CUMPLE' : 'NO CUMPLE',
    veredicto: verdict,
    porEndpoint: perEndpoint,
    fecha: new Date().toISOString(),
  };

  mkdirSync(resolve(repoRoot, 'RepoTecnico', 'evidencias'), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

  console.log(
    `\nPeticiones: ${verdict.requests} (${verdict.rps} req/s) · errores: ${errorCount} (${(errorRate * 100).toFixed(2)} %)`,
  );
  console.log(`Latencia: p50 ${verdict.p50Ms} ms · p95 ${verdict.p95Ms} ms · p99 ${verdict.p99Ms} ms`);
  for (const row of perEndpoint) {
    console.log(
      `  ${row.endpoint.padEnd(26)} ${String(row.requests).padStart(6)} req · p95 ${String(row.p95Ms).padStart(6)} ms · ${row.errors} err${row.firstError ? ` (${row.firstError})` : ''}`,
    );
  }
  console.log(`\nEvidencia: ${evidencePath}`);

  if (!passed) {
    const failures = Object.entries(verdict.checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);
    throw new Error(`La prueba de carga NO cumple el SLA: ${failures.join(', ')}`);
  }
  console.log(
    `\n=== CARGA REAL: CUMPLE (p95 ${p95} ms ≤ ${P95_SLA_MS} ms · error ${(errorRate * 100).toFixed(2)} % ≤ ${(MAX_ERROR_RATE * 100).toFixed(1)} %) ===`,
  );
}

main().catch((error: unknown) => {
  console.error(`\nPRUEBA DE CARGA FALLIDA: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

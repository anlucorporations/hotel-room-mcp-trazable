/* eslint-disable no-console */
/**
 * measure-assistant.ts — medición de coste y latencia del asistente (hito H4).
 *
 * Ejecuta N conversaciones representativas contra el proveedor configurado y publica el **p95 de
 * latencia**, los tokens consumidos y el **coste estimado**, con un informe JSON en
 * `RepoTecnico/evidencias/`.
 *
 * Uso:
 *   corepack pnpm --filter @hotel/web exec tsx scripts/measure-assistant.ts            # proveedor real
 *   corepack pnpm --filter @hotel/web exec tsx scripts/measure-assistant.ts --mock     # sin red
 *   corepack pnpm --filter @hotel/web run measure:assistant
 *
 * MODO REAL: necesita credenciales de GCP con el modelo disponible (`aiplatform.googleapis.com`
 * habilitado y `roles/aiplatform.user`), que es trabajo del hito H5. Sin ellas falla en la primera
 * llamada con un mensaje explícito, en lugar de dar números falsos.
 *
 * MODO `--mock`: sustituye el modelo por un doble determinista. **No mide el modelo**: mide el coste
 * de nuestro código (orquestación, presupuesto, saneado y serialización) y sirve para validar el
 * arnés y para tener una línea base con la que comparar cuando haya credenciales.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createVertex } from "@ai-sdk/google-vertex";
import { createLlmClient } from "../src/lib/assistant/llm-provider";
import { VercelAiLlmClient } from "../src/lib/assistant/vercel-ai-client";
import { estimateCostUsd } from "../src/lib/assistant/pricing";
import { runAssistant } from "../src/lib/assistant/orchestrator";
import { estimateTokens } from "../src/lib/assistant/token-budget";
import { buildSystemPrompt } from "../src/lib/assistant/prompt";
import { sanitizeConversation } from "../src/lib/assistant/pii-sanitizer";
import type { LlmClient } from "../src/lib/assistant/llm";
import type { ToolGateway } from "../src/lib/assistant/tools-gateway";
import type { LlmRequest, LlmResponse, ToolDescriptor } from "../src/lib/assistant/types";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const EVIDENCIAS = join(REPO_ROOT, "RepoTecnico", "evidencias");

const MOCK = process.argv.includes("--mock");
const PROJECT = process.env.GOOGLE_VERTEX_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? "hotel-mcp";
const LOCATION = process.env.VERTEX_LOCATION ?? "europe-west1";
const MODEL = process.env.VERTEX_MODEL ?? "gemini-2.5-flash-lite";
const RUNS = Number(process.argv.find((arg) => /^--runs=\d+$/.test(arg))?.slice(7) ?? 20);

/** Conversaciones representativas: dudas de hotel, disponibilidad, compra, reventa y estancia. */
const CONVERSATIONS: readonly string[] = [
  "¿Está libre la habitación 102 el 15 de junio de 2026?",
  "¿Cuánto cuesta una noche doble en agosto?",
  "¿Puedo revender mi noche si no voy a ir?",
  "¿Qué hago si el lector no reconoce mi código QR?",
  "Quiero comprar la 116 para el 20260701",
  "¿Cómo conecto mi cartera y me pongo en la red correcta?",
  "¿Qué pasa si mi noche caduca sin usarla?",
  "Me llamo Ana y quiero una suite para dos noches seguidas",
  "¿Cuánto se queda el hotel de comisión en una reventa?",
  "¿Puedo dejar una reseña después de la estancia?",
];

/** Pasarela con respuestas preparadas: mide el asistente sin depender del MCP ni de la cadena. */
class CannedGateway implements ToolGateway {
  readonly calls: string[] = [];

  listTools(): Promise<ToolDescriptor[]> {
    return Promise.resolve([
      { name: "listAvailableNights", description: "noches disponibles", inputSchema: {} },
      { name: "checkAvailability", description: "disponibilidad", inputSchema: {} },
      { name: "getOwnedNights", description: "noches de una wallet", inputSchema: {} },
      { name: "searchHotelManuals", description: "manuales del hotel", inputSchema: {} },
      { name: "buildPurchaseTx", description: "prepara la compra", inputSchema: {} },
    ]);
  }

  callTool(name: string): Promise<unknown> {
    this.calls.push(name);
    if (name === "searchHotelManuals") {
      return Promise.resolve([
        {
          id: "huesped-08-poner-tu-noche-en-reventa#paso-a-paso",
          doc: "huesped-08-poner-tu-noche-en-reventa",
          docTitle: "Pon tu noche en reventa, cambia el precio o retírala",
          section: "Paso a paso",
          source: "docs/Manuales/06-huesped/08-poner-tu-noche-en-reventa.md",
          score: 6.3,
          excerpt: "Entra en Mis noches, abre la pestaña En reventa y pulsa Cambiar precio.",
        },
      ]);
    }
    return Promise.resolve({ exists: true, available: true, tokenId: "10220260615", price: "0.05" });
  }
}

/**
 * Modelo determinista para `--mock`. No mide el modelo, pero **sí mide el payload** que construye
 * nuestro código: los tokens de entrada se estiman sobre el prompt de sistema, los esquemas de
 * herramientas y los turnos reales, que es exactamente lo que determina el coste.
 */
function mockClient(): LlmClient {
  return {
    createMessage(request: LlmRequest): Promise<LlmResponse> {
      // Un turno con herramienta y otro de cierre, como una conversación real de consulta.
      const yaLlamo = request.turns.some((turn) => turn.role === "user" && turn.toolResults?.length);
      const inputTokens =
        estimateTokens(request.system) +
        estimateTokens(JSON.stringify(request.tools)) +
        request.turns.reduce((sum, turn) => {
          if (turn.role === "assistant") {
            return sum + estimateTokens(turn.text) + estimateTokens(JSON.stringify(turn.toolUses));
          }
          return (
            sum +
            estimateTokens(turn.text ?? "") +
            estimateTokens(JSON.stringify(turn.toolResults ?? []))
          );
        }, 0);
      if (!yaLlamo && request.tools.length > 0) {
        return Promise.resolve({
          text: "",
          toolUses: [{ id: "c1", name: "searchHotelManuals", input: { query: "reventa" } }],
          usage: { inputTokens, outputTokens: 40, cachedInputTokens: 0 },
        });
      }
      return Promise.resolve({
        text: "Puedes ponerla en reventa desde Mis noches.",
        toolUses: [],
        usage: { inputTokens, outputTokens: 90, cachedInputTokens: 0 },
      });
    },
  };
}

interface Sample {
  /** Pregunta medida: hace auditable el informe (permite ver qué casos no usaron herramienta). */
  readonly pregunta: string;
  /** Respuesta del asistente (recortada): permite auditar si inventó o pidió aclaración. */
  readonly respuesta: string;
  readonly latencyMs: number;
  readonly llmCalls: number;
  readonly toolCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

async function main(): Promise<void> {
  const resolved = MOCK ? { client: mockClient(), via: "mock" } : await resolveRealClient();
  const client = resolved.client;
  const model = MOCK ? "mock-determinista" : MODEL;
  // En modo mock el modelo no factura, pero el VOLUMEN de tokens sí es el real de nuestro código:
  // se estima el coste con la tarifa del modelo de referencia para poder comparar con RNF-22.
  const priceModel = process.env.VERTEX_MODEL ?? "gemini-2.5-flash-lite";
  const samples: Sample[] = [];
  const gateway = new CannedGateway();
  const system = buildSystemPrompt(new Date());

  console.log(`Midiendo ${RUNS} conversaciones (${MOCK ? "modo mock, sin red" : `modelo ${model}`})...`);

  for (let run = 0; run < RUNS; run += 1) {
    const question = CONVERSATIONS[run % CONVERSATIONS.length]!;
    const messages = sanitizeConversation([{ role: "user", text: question }]).messages;
    const startedAt = performance.now();
    const result = await runAssistant(
      {
        llm: client,
        gateway,
        validatePreparedTx: () => Promise.resolve({ ok: true, reasons: [] }),
        system,
      },
      messages,
    );
    const latencyMs = performance.now() - startedAt;
    samples.push({
      pregunta: question,
      respuesta: result.reply.slice(0, 200),
      latencyMs: Number(latencyMs.toFixed(1)),
      llmCalls: result.llmCalls,
      toolCalls: result.domainToolCalls,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUsd: estimateCostUsd(priceModel, result.usage, process.env),
    });
  }

  const latencies = samples.map((sample) => sample.latencyMs);
  const totalInput = samples.reduce((sum, sample) => sum + sample.inputTokens, 0);
  const totalOutput = samples.reduce((sum, sample) => sum + sample.outputTokens, 0);
  const totalCost = Number(samples.reduce((sum, sample) => sum + sample.costUsd, 0).toFixed(6));
  const report = {
    generadoEn: new Date().toISOString(),
    modo: MOCK ? "mock" : "real",
    autenticacion: resolved.via,
    modelo: model,
    modeloDeReferenciaParaElCoste: priceModel,
    aviso: MOCK
      ? "Modo mock: la latencia es la de nuestro código (sin modelo). Los tokens y el coste estimado corresponden a ese volumen de tokens con la tarifa del modelo de referencia."
      : "Medición real contra el proveedor.",
    conversaciones: samples.length,
    latencia: {
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      maxMs: Math.max(...latencies),
    },
    tokens: { entrada: totalInput, salida: totalOutput },
    coste: {
      usdTotal: totalCost,
      usdPorConversacion: Number((totalCost / samples.length).toFixed(6)),
      /** Extrapolación a 1 000 conversaciones al mes (supuesto de RNF-22). */
      usdPor1000Conversaciones: Number(((totalCost / samples.length) * 1_000).toFixed(4)),
    },
    media: {
      llmCalls: Number((samples.reduce((s, x) => s + x.llmCalls, 0) / samples.length).toFixed(2)),
      toolCalls: Number((samples.reduce((s, x) => s + x.toolCalls, 0) / samples.length).toFixed(2)),
    },
    muestras: samples,
  };

  mkdirSync(EVIDENCIAS, { recursive: true });
  const output = join(EVIDENCIAS, `h4-medicion-${report.modo}.json`);
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({ ...report, muestras: undefined }, null, 2));
  console.log(`\nInforme: ${output}`);
  if (MOCK) {
    console.log(
      "\n⚠ Modo mock: NO son números del modelo. Mide nuestro código. Los reales requieren el hito H5.",
    );
  }
}

/** Ruta de `gcloud` disponible en esta máquina (el snap está roto; hay un SDK en el HOME). */
function gcloudBin(): string | null {
  for (const candidate of [
    process.env.GCLOUD_BIN,
    "gcloud",
    "/home/dsh/google-cloud-sdk/bin/gcloud",
  ]) {
    if (!candidate) continue;
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch {
      /* se prueba el siguiente */
    }
  }
  return null;
}

/** Token efímero (1 h) de la sesión de `gcloud`, solo para esta medición. */
function gcloudToken(): string | null {
  const bin = gcloudBin();
  if (!bin) return null;
  try {
    return execFileSync(bin, ["auth", "print-access-token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Compone el cliente real.
 *
 * 1. **Vía de producción**: `createLlmClient` (Vertex con la identidad de la carga de trabajo: ADC o
 *    WIF). Es la que se usará en Cloud Run.
 * 2. **Vía de medición local**: si no hay credencial de carga de trabajo, se inyecta un **token
 *    efímero de `gcloud`** como cabecera del proveedor. Así se mide el modelo real ejecutando el
 *    adaptador y el orquestador **de producción**, sin escribir credenciales en disco, sin crear
 *    claves de servicio y sin conceder permisos de Vertex a esta instancia.
 */
async function resolveRealClient(): Promise<{ client: LlmClient; via: string }> {
  const result = await createLlmClient(process.env);
  if (result.ok) return { client: result.client, via: "identidad de carga de trabajo (ADC/WIF)" };

  const token = process.env.VERTEX_ACCESS_TOKEN ?? gcloudToken();
  if (!token) {
    throw new Error(
      `no se puede medir con el modelo real: ${result.reason}. ` +
        "Habilita aiplatform.googleapis.com y define VERTEX_ACCESS_TOKEN (o usa --mock).",
    );
  }

  const model = createVertex({
    project: PROJECT,
    location: LOCATION,
    headers: { Authorization: `Bearer ${token}` },
  })(MODEL);

  return { client: new VercelAiLlmClient({ model }), via: "token efímero de gcloud" };
}

main().catch((error: unknown) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});

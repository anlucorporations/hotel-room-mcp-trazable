import { AnthropicLlmClient } from "./anthropic-client";
import type { LlmClient } from "./llm";

/**
 * Conmutador de proveedor de LLM del asistente (hito H1 de la v3).
 *
 * Es el **único** punto que conoce qué proveedor se usa; el orquestador solo ve el puerto
 * {@link LlmClient}. La decisión está en `RepoTecnico/propuesta_v3_asistente_ia.md` §5.4:
 *
 * - `vertex` (por defecto): **Gemini 2.5 Flash-Lite** en el endpoint regional **`europe-west1`**.
 *   Se autentica con la cuenta de servicio que ya tienen desplegada web, mcp y worker
 *   (`hotel-mcp-run@`), así que **no requiere ningún secreto nuevo** y el dato no sale de la UE.
 * - `anthropic`: se conserva como respaldo conmutable (mismo código, otra variable de entorno).
 *
 * El import del SDK de Vertex es **dinámico**: la ruta de Anthropic no carga `google-auth-library`
 * ni el Vercel AI SDK, de modo que el arranque en frío de Cloud Run no paga código que no usa.
 */
export type AssistantProvider = "vertex" | "anthropic";

export const DEFAULT_VERTEX_MODEL = "gemini-2.5-flash-lite";
export const DEFAULT_VERTEX_LOCATION = "europe-west1";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

/** Variables de entorno del conmutador; se inyectan para poder probarlo sin tocar `process.env`. */
export interface LlmProviderEnv {
  /** Permite pasar `process.env` directamente (su índice encaja con esta firma). */
  readonly [key: string]: string | undefined;
  readonly ASSISTANT_PROVIDER?: string;
  readonly ANTHROPIC_API_KEY?: string;
  readonly ANTHROPIC_MODEL?: string;
  readonly VERTEX_MODEL?: string;
  readonly VERTEX_LOCATION?: string;
  readonly VERTEX_MAX_OUTPUT_TOKENS?: string;
  readonly GOOGLE_VERTEX_PROJECT?: string;
  readonly GOOGLE_CLOUD_PROJECT?: string;
  readonly GCLOUD_PROJECT?: string;
}

export type LlmClientResult =
  | {
      readonly ok: true;
      readonly provider: AssistantProvider;
      readonly client: LlmClient;
      /** Modelo efectivo; se registra en las trazas (sin PII) para poder auditar el coste. */
      readonly model: string;
      readonly location?: string;
    }
  | { readonly ok: false; readonly reason: string };

/** Compone el cliente de LLM según el entorno. No hace red: solo construye el adaptador. */
export async function createLlmClient(env: LlmProviderEnv): Promise<LlmClientResult> {
  const provider = (env.ASSISTANT_PROVIDER ?? "vertex").trim().toLowerCase();

  if (provider === "anthropic") return anthropicClient(env);
  if (provider === "vertex") return vertexClient(env);

  return { ok: false, reason: `ASSISTANT_PROVIDER no soportado: ${provider}` };
}

function anthropicClient(env: LlmProviderEnv): LlmClientResult {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return { ok: false, reason: "falta ANTHROPIC_API_KEY" };
  const model = env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
  return {
    ok: true,
    provider: "anthropic",
    client: new AnthropicLlmClient({ apiKey, model }),
    model,
  };
}

async function vertexClient(env: LlmProviderEnv): Promise<LlmClientResult> {
  const [{ createVertex }, { VercelAiLlmClient }] = await Promise.all([
    import("@ai-sdk/google-vertex"),
    import("./vercel-ai-client"),
  ]);

  const location = env.VERTEX_LOCATION?.trim() || DEFAULT_VERTEX_LOCATION;
  const model = env.VERTEX_MODEL?.trim() || DEFAULT_VERTEX_MODEL;
  // El proyecto es obligatorio para el proveedor. `GOOGLE_VERTEX_PROJECT` es su variable nativa;
  // `GOOGLE_CLOUD_PROJECT`/`GCLOUD_PROJECT` son las que Cloud Run inyecta sola, así que se aceptan
  // como alternativas para no exigir configuración extra en el despliegue.
  const project =
    env.GOOGLE_VERTEX_PROJECT?.trim() ||
    env.GOOGLE_CLOUD_PROJECT?.trim() ||
    env.GCLOUD_PROJECT?.trim();

  try {
    const vertex = createVertex(project ? { project, location } : { location });
    return {
      ok: true,
      provider: "vertex",
      client: new VercelAiLlmClient({
        model: vertex(model),
        maxOutputTokens: parsePositiveInt(env.VERTEX_MAX_OUTPUT_TOKENS),
      }),
      model,
      location,
    };
  } catch (error) {
    // Falla EN CERRADO: si falta el proyecto o las credenciales, la ruta responde 503 y la UI
    // ofrece la navegación manual (CU-08 08e) en lugar de propagar un 500 sin explicación.
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Entero positivo o `undefined` (deja que el adaptador aplique su valor por defecto). */
function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

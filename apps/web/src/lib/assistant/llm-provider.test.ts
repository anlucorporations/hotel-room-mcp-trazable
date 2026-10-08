import { describe, expect, it } from "vitest";
import { AnthropicLlmClient } from "./anthropic-client";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_VERTEX_LOCATION,
  DEFAULT_VERTEX_MODEL,
  createLlmClient,
} from "./llm-provider";
import { VercelAiLlmClient } from "./vercel-ai-client";

describe("createLlmClient", () => {
  it("por defecto compone Vertex con el modelo y la región UE de la propuesta", async () => {
    const result = await createLlmClient({ GOOGLE_CLOUD_PROJECT: "hotel-mcp" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe("vertex");
    expect(result.model).toBe(DEFAULT_VERTEX_MODEL);
    expect(result.location).toBe(DEFAULT_VERTEX_LOCATION);
    expect(result.client).toBeInstanceOf(VercelAiLlmClient);
  });

  it("respeta las variables VERTEX_MODEL y VERTEX_LOCATION", async () => {
    const result = await createLlmClient({
      ASSISTANT_PROVIDER: "vertex",
      GOOGLE_CLOUD_PROJECT: "hotel-mcp",
      VERTEX_MODEL: "gemini-2.5-flash",
      VERTEX_LOCATION: "us-central1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model).toBe("gemini-2.5-flash");
    expect(result.location).toBe("us-central1");
  });

  it("acepta GCLOUD_PROJECT y GOOGLE_VERTEX_PROJECT como alternativas al proyecto explícito", async () => {
    await expect(createLlmClient({ GCLOUD_PROJECT: "hotel-mcp" })).resolves.toMatchObject({ ok: true });
    await expect(createLlmClient({ GOOGLE_VERTEX_PROJECT: "hotel-mcp" })).resolves.toMatchObject({
      ok: true,
    });
  });

  it("falla EN CERRADO si no hay proyecto: la ruta responde 503, no un 500", async () => {
    const result = await createLlmClient({ ASSISTANT_PROVIDER: "vertex" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.toLowerCase()).toContain("project");
  });

  it("con ASSISTANT_PROVIDER=anthropic y clave, devuelve el cliente de Anthropic", async () => {
    const result = await createLlmClient({
      ASSISTANT_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "sk-ant-de-prueba",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(result.client).toBeInstanceOf(AnthropicLlmClient);
  });

  it("falla en cerrado si se pide Anthropic sin clave (el endpoint responde 503)", async () => {
    const result = await createLlmClient({ ASSISTANT_PROVIDER: "anthropic" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("ANTHROPIC_API_KEY");
  });

  it("rechaza un proveedor desconocido en lugar de adivinar", async () => {
    const result = await createLlmClient({ ASSISTANT_PROVIDER: "openai" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("openai");
  });

  it("normaliza mayúsculas y espacios del conmutador", async () => {
    const result = await createLlmClient({ ASSISTANT_PROVIDER: "  VERTEX  ", GOOGLE_CLOUD_PROJECT: "hotel-mcp" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe("vertex");
  });
});

describe("ramas de borde del proveedor", () => {
  it("usa el modelo de Anthropic indicado por entorno", async () => {
    const resultado = await createLlmClient({
      ASSISTANT_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "sk-de-prueba",
      ANTHROPIC_MODEL: "claude-de-prueba",
    } as never);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.model).toBe("claude-de-prueba");
  });

  it("tolera valores numéricos malformados del entorno (usa los por defecto)", async () => {
    const resultado = await createLlmClient({
      GOOGLE_CLOUD_PROJECT: "hotel-mcp",
      VERTEX_MAX_OUTPUT_TOKENS: "no-es-un-numero",
      VERTEX_THINKING_BUDGET: "tampoco",
    } as never);

    // Lo que importa: la composición no se rompe por una variable mal escrita.
    expect(resultado.ok).toBe(true);
  });
});

describe("valores numéricos límite del entorno", () => {
  it("un tope de salida de 0 se ignora (el adaptador aplica su valor por defecto)", async () => {
    const resultado = await createLlmClient({ GOOGLE_CLOUD_PROJECT: "hotel-mcp", VERTEX_MAX_OUTPUT_TOKENS: "0" } as never);

    expect(resultado.ok).toBe(true);
  });

  it("un presupuesto de razonamiento negativo se ignora", async () => {
    const resultado = await createLlmClient({ GOOGLE_CLOUD_PROJECT: "hotel-mcp", VERTEX_THINKING_BUDGET: "-1" } as never);

    expect(resultado.ok).toBe(true);
  });
});

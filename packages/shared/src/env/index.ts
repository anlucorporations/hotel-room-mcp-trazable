import { z } from "zod";

// Reexporta `z` para que cada componente componga su esquema sin acoplar `zod` directamente.
export { z } from "zod";

/**
 * Secret manager por entorno (T0.3, DISEÑO §12, RNF-13).
 *
 * Cada componente (web/api-route, worker, mcp, deploy, faucet) define su propio esquema
 * con los validadores reutilizables y llama a `loadEnv` al arrancar: validación **fail-fast**
 * con un error agregado y legible. Cero secretos en el repo (los `.env` están en
 * `.gitignore`; sólo se versiona `.env.example`).
 */
export class EnvironmentValidationError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(
      `Configuración de entorno inválida (faltan o son incorrectas variables):\n${issues
        .map((issue) => `  - ${issue}`)
        .join("\n")}`,
    );
    this.name = "EnvironmentValidationError";
  }
}

export type EnvSource = Record<string, string | undefined>;

/**
 * Valida `source` contra `schema`. Lanza `EnvironmentValidationError` agregando todos los
 * problemas (no sólo el primero) para diagnóstico rápido.
 */
export function loadEnv<T extends z.ZodTypeAny>(
  schema: T,
  source: EnvSource = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const key = issue.path.join(".") || "(raíz)";
      return `${key}: ${issue.message}`;
    });
    throw new EnvironmentValidationError(issues);
  }
  return result.data;
}

/** Validadores reutilizables para componer los esquemas de cada componente. */
export const env = {
  ethAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "debe ser una dirección Ethereum (0x + 40 hex)"),
  privateKey: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "debe ser una clave privada (0x + 64 hex)"),
  // Restringido a http/https (MINOR#10): la URL válida de zod admite esquemas como `ftp:`,
  // `redis:`, `javascript:` o `ws:`, que ningún consumidor (RPC_URL, WORKER_BASE_URL,
  // MCP_BASE_URL) usa. Si en el futuro algún consumidor necesitase WebSocket (`ws://`/`wss://`),
  // añádase un validador `rpcWsUrl` específico en lugar de relajar éste.
  httpUrl: z
    .string()
    .url("debe ser una URL válida")
    .refine((value) => /^https?:\/\//i.test(value), {
      message: "debe usar el esquema http:// o https://",
    }),
  port: z.coerce.number().int().min(1).max(65_535),
  email: z.string().email("debe ser un email válido"),
  nonEmpty: z.string().min(1, "es obligatorio"),
} as const;

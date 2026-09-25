import { z } from "zod";

// Reexporta `z` para que cada componente componga su esquema sin acoplar `zod` directamente.
export { z } from "zod";

/**
 * Secret manager por entorno (T0.3, ADR-06, RNF-13).
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

/**
 * Error de configuración **en cerrado**: un secreto obligatorio no está definido.
 *
 * Se lanza en el primer uso (no al importar el módulo) para no romper el build de Next, que
 * evalúa los módulos sin entorno de runtime. El mensaje nombra la variable y el fichero
 * plantilla, de modo que el operador sabe exactamente qué falta.
 */
export class MissingSecretError extends Error {
  constructor(public readonly variable: string) {
    super(
      `Secreto obligatorio no configurado: ${variable}. ` +
        `El arranque falla en cerrado (CWE-798): define ${variable} en el entorno o en .env ` +
        `(ver .env.example). No existe valor por defecto en el código.`,
    );
    this.name = "MissingSecretError";
  }
}

/**
 * Devuelve el valor de un secreto obligatorio o lanza `MissingSecretError`.
 *
 * Sustituye a los antiguos `process.env.X || "<literal>"`: un secreto ausente NUNCA se
 * reemplaza por un literal conocido del repositorio, sino que aborta la operación.
 */
export function requireSecret(variable: string, source: EnvSource = process.env): string {
  const value = source[variable];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MissingSecretError(variable);
  }
  return value;
}

/** Igual que `requireSecret` pero devuelve `undefined` si el secreto no está configurado. */
export function optionalSecret(
  variable: string,
  source: EnvSource = process.env,
): string | undefined {
  const value = source[variable];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/** Validador zod reutilizable para secretos obligatorios (sin valor por defecto). */
export const requiredSecret = (label: string): z.ZodString =>
  z.string().min(1, `${label} es obligatorio (fail-fast, sin valor por defecto)`);

/** Validador zod para material de clave en hexadecimal de N bytes exactos. */
export const hexKey = (bytes: number): z.ZodString =>
  z
    .string()
    .regex(new RegExp(`^[0-9a-fA-F]{${bytes * 2}}$`), `debe ser hexadecimal de ${bytes} bytes`);

/** Validador zod para la cadena de conexión de PostgreSQL (sin valor por defecto). */
export const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\/.+/i, "debe ser una URL postgresql:// (sin valor por defecto)");

/** Validador zod para un nombre de usuario de operador (email o identificador simple). */
export const username = z
  .string()
  .trim()
  .min(3, "debe tener al menos 3 caracteres")
  .max(100, "no puede superar los 100 caracteres");

/** Validador zod para códigos TOTP de 6 dígitos. */
export const totpCode = z.string().regex(/^[0-9]{6}$/, "debe ser un código TOTP de 6 dígitos");

/**
 * Envuelve un validador para que una variable **definida pero vacía** (`VAR=`, tal y como la deja
 * la plantilla `.env.example`) se trate como «no definida» en vez de como un valor inválido.
 *
 * Por qué existe: `z.coerce.number().positive().optional()` acepta la AUSENCIA de la variable,
 * pero `VAR=` llega como cadena vacía, `Number("")` es `0` y la validación falla. El resultado era
 * que **copiar `.env.example` a `.env` producía un worker que no arrancaba** (`BURN_INTERVAL_MS:
 * Number must be greater than 0`, `BURNER_WALLET_PRIVATE_KEY: debe ser una clave privada…`), justo
 * en las variables que la plantilla documenta como «vacío = desactivado». Es la misma clase de
 * defecto que ya se corrigió para `SMTP_FROM` (`emailWithDisplay`).
 */
export const emptyAsUndefined = <S extends z.ZodTypeAny>(schema: S) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );

/** Validador zod para el nombre de rol de un operador del back-office (D-04). */
export const adminRoleName = z.enum(["DEFAULT_ADMIN_ROLE", "RECEPTION_ROLE"]);

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
  /**
   * Email simple o con nombre para mostrar (`Nombre <correo@dominio>`): es el formato habitual
   * de la cabecera SMTP `From` y el que documenta `.env.example`. `z.string().email()` lo
   * rechaza, lo que impedía arrancar el worker y el monitor con la plantilla del repositorio.
   */
  emailWithDisplay: z
    .string()
    .trim()
    .refine((value) => EMAIL_WITH_DISPLAY.test(value), {
      message: "debe ser un email o 'Nombre <email>'",
    }),
  nonEmpty: z.string().min(1, "es obligatorio"),
} as const;

/** `correo@dominio` o `Nombre <correo@dominio>` (cabecera `From` de SMTP). */
const EMAIL_WITH_DISPLAY =
  /^(?:[^<>]+<\s*[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+\s*>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/;
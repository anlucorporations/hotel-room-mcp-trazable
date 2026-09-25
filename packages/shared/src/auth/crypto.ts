import crypto from "node:crypto";
import { requireSecret } from "../env/index";

/**
 * Cifrado simétrico AES-256-GCM del material secreto en reposo (D-04, RNF-13).
 *
 * Se usa para dos cosas distintas, cada una con SU PROPIA clave de entorno:
 *   - `AES_SECRET_KEY`         → semilla TOTP del operador (`admin_users.totp_secret_enc`).
 *   - `CHECKIN_SECRET_KEY`     → secreto de check-in del NFT (`nfts.check_in_secret_enc`).
 *
 * Ninguna de las dos claves tiene valor por defecto: `requireSecret` lanza
 * `MissingSecretError` en el primer uso, de modo que la aplicación falla en cerrado en lugar
 * de cifrar con una clave conocida del repositorio (CWE-798).
 *
 * Formato del criptograma: `iv_hex:authTag_hex:ciphertext_hex` (12 bytes de IV como recomienda
 * NIST SP 800-38D para GCM, etiqueta de autenticación de 16 bytes).
 */

/** Nombres de clave admitidos, para que el compilador impida pasar una variable arbitraria. */
export type SecretKeyName = "AES_SECRET_KEY" | "CHECKIN_SECRET_KEY";

const IV_BYTES = 12;

/**
 * Deriva la clave de 32 bytes a partir del material de entorno.
 *
 * La derivación con SHA-256 conserva el contrato histórico del proyecto (las filas ya cifradas
 * usan esta misma derivación, por lo que cambiarla invalidaría los criptogramas existentes) y
 * normaliza cualquier material de entrada a los 32 bytes que exige AES-256.
 */
function deriveKey(keyName: SecretKeyName): Buffer {
  return crypto.createHash("sha256").update(requireSecret(keyName)).digest();
}

/** Cifra `plaintext` con AES-256-GCM usando la clave indicada. */
export function encryptWithKey(keyName: SecretKeyName, plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(keyName), iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/** Descifra un criptograma de `encryptWithKey`, verificando la etiqueta de autenticación. */
export function decryptWithKey(keyName: SecretKeyName, encryptedSecret: string): string {
  const [ivHex, authTagHex, encryptedData] = encryptedSecret.split(":");
  if (!ivHex || !authTagHex || !encryptedData) {
    throw new Error("Formato de secreto cifrado inválido");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveKey(keyName),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/** Cifra la semilla TOTP del operador con `AES_SECRET_KEY` (D-04). */
export function encryptTotpSecret(secret: string): string {
  return encryptWithKey("AES_SECRET_KEY", secret);
}

/** Descifra la semilla TOTP del operador con `AES_SECRET_KEY`. */
export function decryptTotpSecret(encrypted: string): string {
  return decryptWithKey("AES_SECRET_KEY", encrypted);
}

/** Cifra el secreto de check-in del NFT con `CHECKIN_SECRET_KEY`. */
export function encryptCheckInSecret(secret: string): string {
  return encryptWithKey("CHECKIN_SECRET_KEY", secret);
}

/** Descifra el secreto de check-in del NFT con `CHECKIN_SECRET_KEY`. */
export function decryptCheckInSecret(encrypted: string): string {
  return decryptWithKey("CHECKIN_SECRET_KEY", encrypted);
}

/**
 * Traza de sesión pseudonimizada (ADR-24 · decisión de M9).
 *
 * `admin_sessions` guardaba la IP y el *user agent* **en claro**. Se conservan para poder auditar un
 * acceso (la misma IP en dos sesiones se reconoce), pero ya no como dato personal legible: se
 * almacena un **HMAC-SHA256 con clave**.
 *
 * Por qué HMAC y no un hash simple: el espacio de direcciones IPv4 es de ~4.300 millones de valores,
 * así que un `SHA-256` sin clave se revierte enumerándolo entero en minutos. Con clave, sin el
 * secreto el valor **no** es reversible.
 *
 * Clave: `SESSION_TRACE_SECRET`; si no está definida, se deriva de `AES_SECRET_KEY` (respaldo
 * elegido en M9). Ninguna de las dos tiene valor por defecto: sin secreto, `requireSecret` lanza y
 * el proceso falla en cerrado, en lugar de guardar una traza que parecería protegida y no lo estaría.
 */

/** Prefijo que identifica un valor ya pseudonimizado (las filas antiguas en claro no lo llevan). */
export const SESSION_TRACE_PREFIX = "hmac-sha256:";

/** Marca de un valor legado que se ha descartado por no poder pseudonimizarse. */
export const SESSION_TRACE_DISCARDED = "descartado:sin-clave";

/**
 * Clave de la traza: `SESSION_TRACE_SECRET` si existe, y si no `AES_SECRET_KEY`.
 *
 * Se lee con `process.env` directo en vez de `requireSecret` para poder implementar el respaldo; el
 * fallo en cerrado lo garantiza la llamada a `requireSecret("AES_SECRET_KEY")` cuando falta la
 * primera.
 */
function traceKey(): Buffer {
  const dedicated = process.env.SESSION_TRACE_SECRET?.trim();
  const material = dedicated && dedicated.length > 0 ? dedicated : requireSecret("AES_SECRET_KEY");
  return crypto.createHash("sha256").update(material).digest();
}

/**
 * Pseudonimiza un valor de traza (IP o *user agent*). Devuelve `null` si no hay nada que guardar.
 *
 * Se normaliza (recorte y minúsculas) para que dos peticiones equivalentes produzcan la misma
 * traza; sin esa normalización, la traza perdería su única utilidad, que es reconocer repeticiones.
 */
export function hashSessionTrace(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) return null;
  const digest = crypto.createHmac("sha256", traceKey()).update(normalized).digest("hex");
  return `${SESSION_TRACE_PREFIX}${digest}`;
}

/** ¿El valor almacenado es una traza pseudonimizada (o el marcador de descarte)? */
export function isHashedSessionTrace(stored: string | null | undefined): boolean {
  if (!stored) return false;
  return stored.startsWith(SESSION_TRACE_PREFIX) || stored.startsWith("descartado:");
}

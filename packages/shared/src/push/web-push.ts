import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  createPublicKey,
  createSign,
  hkdfSync,
  randomBytes,
  type KeyObject,
} from "node:crypto";

/**
 * Web Push real: VAPID (RFC 8292) + cifrado `aes128gcm` (RFC 8291) con `node:crypto`.
 *
 * El estado auditado (H-18) «enviaba» push incrementando un contador: ningún navegador recibía
 * nada. Aquí se implementa el protocolo de verdad, sin dependencias nuevas:
 *
 *   1. **JWT VAPID** ES256 firmado con la clave privada del servidor (`aud` = origen del endpoint de
 *      push, `exp` ≤ 24 h, `sub` = contacto).
 *   2. **Cifrado del contenido**: ECDH P-256 con la clave del navegador, HKDF-SHA256 con el `auth`
 *      secreto de la suscripción y AES-128-GCM del mensaje, con el marco `aes128gcm`
 *      (`salt || rs || idlen || keyid || ciphertext`).
 *   3. **Entrega HTTP** con las cabeceras `Authorization: vapid …`, `Content-Encoding: aes128gcm`,
 *      `TTL` y `Urgency`. Un `404`/`410` significa que la suscripción ya no existe: se purga.
 *
 * Solo se usa `fetch` y `node:crypto` (sin SDKs), de modo que el envío es verificable con un
 * servicio de push local en las pruebas.
 */

export interface PushSubscriptionKeys {
  readonly endpoint: string;
  /** Clave pública del navegador (p256dh), en base64url. */
  readonly p256dh: string;
  /** Secreto de autenticación de la suscripción, en base64url. */
  readonly auth: string;
}

export interface VapidKeys {
  /** Clave pública VAPID (punto sin comprimir P-256 de 65 bytes) en base64url. */
  readonly publicKey: string;
  /** Clave privada VAPID (escalar de 32 bytes) en base64url. */
  readonly privateKey: string;
  /** Contacto `mailto:` o URL exigido por los servicios de push. */
  readonly subject: string;
}

export interface EncryptedPush {
  readonly body: Buffer;
  readonly headers: Record<string, string>;
}

/** Prefijos DER para envolver las claves crudas P-256 en objetos de clave de Node. */
const PKCS8_P256_PREFIX = Buffer.from(
  "308141020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420",
  "hex",
);
const SPKI_P256_PREFIX = Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex");

export const base64UrlToBuffer = (value: string): Buffer =>
  Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export const bufferToBase64Url = (value: Buffer): string =>
  value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Clave privada VAPID (cruda) como `KeyObject` P-256. */
export function vapidPrivateKeyObject(privateKeyBase64Url: string): KeyObject {
  const raw = base64UrlToBuffer(privateKeyBase64Url);
  if (raw.length !== 32) {
    throw new Error(`VAPID_PRIVATE_KEY debe ser un escalar P-256 de 32 bytes (recibidos ${raw.length})`);
  }
  return createPrivateKey({
    key: Buffer.concat([PKCS8_P256_PREFIX, raw]),
    format: "der",
    type: "pkcs8",
  });
}

/** Clave pública VAPID como `KeyObject` P-256 (para verificar el JWT en las pruebas). */
export function vapidPublicKeyObject(publicKeyBase64Url: string): KeyObject {
  const raw = base64UrlToBuffer(publicKeyBase64Url);
  if (raw.length !== 65) {
    throw new Error(`VAPID_PUBLIC_KEY debe ser un punto sin comprimir de 65 bytes (recibidos ${raw.length})`);
  }
  return createPublicKey({
    key: Buffer.concat([SPKI_P256_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

/**
 * Genera un par VAPID válido (P-256) en base64url. Se usa para aprovisionar el entorno y en las
 * pruebas; nunca en tiempo de petición.
 */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    publicKey: bufferToBase64Url(ecdh.getPublicKey()),
    privateKey: bufferToBase64Url(ecdh.getPrivateKey()),
  };
}

/** JWT VAPID (ES256) para el origen del endpoint de push. */
export function createVapidJwt(
  audience: string,
  subject: string,
  keys: VapidKeys,
  now: Date = new Date(),
  ttlSeconds = 12 * 3600,
): string {
  const header = bufferToBase64Url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bufferToBase64Url(
    Buffer.from(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(now.getTime() / 1000) + ttlSeconds,
        sub: subject,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  // `ieee-p1363` produce la firma en formato r||s (el que exige JWS ES256; DER no vale).
  const signature = signer.sign({ key: vapidPrivateKeyObject(keys.privateKey), dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${bufferToBase64Url(signature)}`;
}

const hkdf = (ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer =>
  Buffer.from(hkdfSync("sha256", ikm, salt, info, length));

/**
 * Cifra la carga según RFC 8291 con codificación `aes128gcm` (un único registro).
 */
export function encryptPushPayload(
  payload: unknown,
  subscription: PushSubscriptionKeys,
  options: { recordSize?: number; salt?: Buffer } = {},
): EncryptedPush {
  const uaPublic = base64UrlToBuffer(subscription.p256dh);
  const authSecret = base64UrlToBuffer(subscription.auth);
  if (uaPublic.length !== 65) {
    throw new Error("La suscripción push no trae una clave p256dh válida (65 bytes)");
  }
  if (authSecret.length < 16) {
    throw new Error("La suscripción push no trae un secreto `auth` válido (>=16 bytes)");
  }

  const as = createECDH("prime256v1");
  as.generateKeys();
  const asPublic = as.getPublicKey();
  const sharedSecret = as.computeSecret(uaPublic);

  const recordSize = options.recordSize ?? 4096;
  const salt = options.salt ?? randomBytes(16);

  // Derivación de claves del RFC 8291 §3.4: PRK_key con el secreto de autenticación como salt.
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "utf8"), uaPublic, asPublic]);
  const inputKeyMaterial = hkdf(sharedSecret, authSecret, keyInfo, 32);

  const contentEncryptionKey = hkdf(inputKeyMaterial, salt, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16);
  const nonce = hkdf(inputKeyMaterial, salt, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12);

  const plaintext = Buffer.concat([
    Buffer.from(JSON.stringify(payload), "utf8"),
    Buffer.from([0x02]), // delimitador de último registro sin relleno
  ]);

  const cipher = createCipheriv("aes-128-gcm", contentEncryptionKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  // Cabecera del marco `aes128gcm` (RFC 8188 §2.1): salt(16) || rs(4) || idlen(1) || keyid(idlen).
  const header = Buffer.alloc(21 + asPublic.length);
  salt.copy(header, 0);
  header.writeUInt32BE(recordSize, 16);
  header.writeUInt8(asPublic.length, 20);
  asPublic.copy(header, 21);

  return {
    body: Buffer.concat([header, ciphertext]),
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "2419200",
      Urgency: "normal",
    },
  };
}

export interface SendPushResult {
  readonly ok: boolean;
  /** `true` si el servicio de push dice que la suscripción ya no existe (404/410): hay que purgarla. */
  readonly subscriptionGone: boolean;
  readonly status?: number;
  readonly error?: string;
}

/**
 * Entrega una notificación push cifrada. No lanza: devuelve el resultado para que el llamante
 * (broadcast) cuente éxitos, fallos y suscripciones caducadas.
 */
export async function sendWebPush(
  subscription: PushSubscriptionKeys,
  payload: unknown,
  vapid: VapidKeys,
  options: { fetchImpl?: typeof fetch; now?: Date; timeoutMs?: number } = {},
): Promise<SendPushResult> {
  const doFetch = options.fetchImpl ?? fetch;

  let audience: string;
  try {
    audience = new URL(subscription.endpoint).origin;
  } catch {
    return { ok: false, subscriptionGone: false, error: "endpoint inválido" };
  }

  try {
    const { body, headers } = encryptPushPayload(payload, subscription);
    const jwt = createVapidJwt(audience, vapid.subject, vapid, options.now);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
    let response: Response;
    try {
      response = await doFetch(subscription.endpoint, {
        method: "POST",
        headers: {
          ...headers,
          Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
        },
        body: new Uint8Array(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 404 || response.status === 410) {
      return { ok: false, subscriptionGone: true, status: response.status };
    }
    if (!response.ok) {
      return { ok: false, subscriptionGone: false, status: response.status, error: `HTTP ${response.status}` };
    }
    return { ok: true, subscriptionGone: false, status: response.status };
  } catch (error: unknown) {
    return {
      ok: false,
      subscriptionGone: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

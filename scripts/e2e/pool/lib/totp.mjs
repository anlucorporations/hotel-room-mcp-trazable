import crypto from "node:crypto";

/** Decodifica base32 (RFC 4648) sin relleno. */
function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/, "").toUpperCase().replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error(`base32 inválido: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** TOTP RFC 6238 (6 dígitos, 30 s, SHA-1), el que valida `otplib` en el servidor. */
export function totp(secret, { digits = 6, period = 30, timestamp = Date.now() } = {}) {
  const key = base32Decode(secret);
  const counter = Math.floor(timestamp / 1000 / period);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** digits).padStart(digits, "0");
}

export const ADMIN_TOTP_SECRET = "QCIBY6V7ASFQHG22K5JZBMN576S7L6H6";
export const RECEPTION_TOTP_SECRET = "MVOA2LNSPW7G6P3TBOILVMKRFE6UM525";
export const currentTotp = (secret = ADMIN_TOTP_SECRET) => totp(secret);

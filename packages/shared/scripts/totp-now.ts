import { generateSync } from "otplib";
import { closeDbPool, getDbPool } from "../src/index";
import { decryptTotpSecret } from "../src/auth/crypto";

/**
 * Genera el codigo TOTP de 6 digitos de cada operador a partir de su semilla DESCIFRADA.
 *
 * Para que sirve: comprobar que la semilla guardada es la correcta y poder entrar sin depender del
 * movil (utilidad de desarrollo). El codigo cambia cada 30 segundos; abajo se indica cuanto le queda
 * de vida al que se muestra.
 *
 * Uso: `node --env-file=../../.env --import tsx scripts/totp-now.ts [segundos]`
 *   Sin argumentos muestra el codigo actual.
 *   Con `segundos` (p. ej. 60) explica que codigo habria que usar dentro de ese margen.
 */
const pool = getDbPool();
const rows = await pool.query<{ username: string; totp_secret_enc: string }>(
  "SELECT username, totp_secret_enc FROM admin_users WHERE active = TRUE ORDER BY username",
);

const period = 30;
const nowSeconds = Math.floor(Date.now() / 1000);
const remaining = period - (nowSeconds % period);

console.log(`Instante: ${new Date().toISOString()} · al codigo actual le quedan ${remaining} s de vida`);
console.log("");

for (const row of rows.rows) {
  let seed: string;
  try {
    seed = decryptTotpSecret(row.totp_secret_enc);
  } catch {
    console.log(`${row.username.padEnd(26)} semilla NO descifrable (¿cambio AES_SECRET_KEY?)`);
    continue;
  }
  const code = generateSync({ secret: seed });
  console.log(`${row.username.padEnd(26)} ${code}   (semilla ${seed})`);
}

console.log("");
console.log("Si el codigo caduca antes de que lo escribas, vuelve a ejecutar el comando.");
console.log("En el login: usuario + contrasena + estos 6 digitos. La semilla NUNCA va en ese campo.");

await closeDbPool();

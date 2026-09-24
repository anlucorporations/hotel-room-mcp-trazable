import { createServer, type Server } from "node:http";
import QRCode from "qrcode";
import { generateSync } from "otplib";
import { closeDbPool, getDbPool } from "../src/index";
import { decryptTotpSecret } from "../src/auth/crypto";

/**
 * Pagina local de ayuda para el login (SOLO para el entorno de desarrollo).
 *
 * Muestra, para cada operador activo:
 *   - el usuario y su rol;
 *   - un **QR escaneable** con el `otpauth://` (para darlo de alta en el autenticador);
 *   - el **codigo TOTP vigente** de 6 digitos, que se refresca solo cada 30 s;
 *   - si tiene codigos de rescate sin usar.
 *
 * La contrasena NO se muestra: no es recuperable (en la base solo hay su hash bcrypt). Las que este
 * proyecto genero se imprimen aqui una sola vez y hay que guardarlas aparte.
 *
 * Uso: `node --env-file=../../.env --import tsx scripts/login-help.ts [puerto]`  (por defecto 4599)
 */
const port = Number(process.argv[2] ?? 4599);
const ISSUER = "HotelMarinaDelSol";

interface OperatorView {
  username: string;
  role: string;
  seed: string;
  recoveryLeft: number;
}

async function loadOperators(): Promise<OperatorView[]> {
  const pool = getDbPool();
  const rows = await pool.query<{ username: string; role: string; totp_secret_enc: string }>(
    "SELECT username, role, totp_secret_enc FROM admin_users WHERE active = TRUE ORDER BY role, username",
  );
  const out: OperatorView[] = [];
  for (const row of rows.rows) {
    let seed: string | null = null;
    try {
      seed = decryptTotpSecret(row.totp_secret_enc);
    } catch {
      seed = null; // semilla no descifrable con la clave actual
    }
    const recovery = await pool.query<{ left: number }>(
      "SELECT COUNT(*) FILTER (WHERE used = FALSE)::INT AS left FROM mfa_recovery_codes WHERE username = $1",
      [row.username],
    );
    out.push({
      username: row.username,
      role: row.role,
      seed: seed ?? "",
      recoveryLeft: recovery.rows[0]?.left ?? 0,
    });
  }
  return out;
}

const operators = await loadOperators();

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function otpauthUri(op: OperatorView): string {
  return `otpauth://totp/${ISSUER}:${encodeURIComponent(op.username)}?secret=${op.seed}&issuer=${ISSUER}`;
}

function page(): string {
  const blocks = operators
    .map((op) => {
      const qr = op.seed
        ? `<img alt="QR para dar de alta ${escapeHtml(op.username)}" width="200" height="200"
             src="/qr/${encodeURIComponent(op.username)}.png">`
        : "<p class='warn'>Semilla no descifrable con la clave actual.</p>";
      const panel = op.username.startsWith("admin")
        ? { href: "/admin", label: "panel de administracion" }
        : { href: "/recepcion", label: "pantalla de recepcion" };
      return `
      <section>
        <h2>${escapeHtml(op.username)}</h2>
        <p class="role">${escapeHtml(op.role)} · ${op.recoveryLeft} codigos de rescate sin usar</p>
        <div class="row">
          ${qr}
          <div>
            <p>Entra en <a href="${panel.href}" target="_blank" rel="noreferrer">${panel.label}</a> y escribe:</p>
            <ul>
              <li>Usuario: <code>${escapeHtml(op.username)}</code></li>
              <li>Contrasena: (la que se te entrego; no es recuperable)</li>
              <li>Codigo de 6 digitos: <strong class="code" data-username="${escapeHtml(op.username)}">······</strong></li>
            </ul>
            <p class="seed">Semilla TOTP: <code>${escapeHtml(op.seed || "(no disponible)")}</code></p>
          </div>
        </div>
      </section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Ayuda de login (desarrollo)</title>
<style>
 body{font-family:system-ui,sans-serif;margin:2rem auto;max-width:52rem;padding:0 1rem;color:#1b2327}
 h1{font-size:1.4rem} section{border:1px solid #ddd;border-radius:12px;padding:1rem;margin:1rem 0}
 .row{display:flex;gap:1.5rem;align-items:flex-start;flex-wrap:wrap}
 .role{color:#555;font-size:.9rem;margin:.2rem 0 .8rem}
 .code{font-size:1.9rem;letter-spacing:.25rem;font-variant-numeric:tabular-nums}
 .seed{color:#555;font-size:.85rem} code{background:#f2f2f2;padding:.1rem .3rem;border-radius:4px}
 .warn{color:#a33} .foot{color:#666;font-size:.85rem;margin-top:2rem}
</style></head><body>
<h1>Ayuda de login · entorno de desarrollo</h1>
<p>Escanea el QR con tu autenticador (Google Authenticator, Authy, 1Password) <strong>una sola vez</strong>.
A partir de ahi la app te da el codigo de 6 digitos. Los codigos de esta pagina se refrescan solos cada 30 s.</p>
${blocks}
<p class="foot">Pagina local, solo para desarrollo: expone semillas TOTP. No la dejes levantada en un entorno compartido.
La contrasena no aparece aqui porque <strong>no es recuperable</strong> (en la base solo vive su hash bcrypt).</p>
<script>
async function refresh(){
  const res = await fetch('/codes');
  const data = await res.json();
  document.querySelectorAll('.code').forEach(el => {
    const value = data[el.dataset.username];
    if (value) el.textContent = value.code + ' (' + value.secondsLeft + 's)';
  });
}
refresh();
setInterval(refresh, 1000);
</script>
</body></html>`;
}

const server: Server = createServer((req, res) => {
  if (req.url?.startsWith("/codes")) {
    const now = Math.floor(Date.now() / 1000);
    const secondsLeft = 30 - (now % 30);
    const payload: Record<string, { code: string; secondsLeft: number }> = {};
    for (const op of operators) {
      if (!op.seed) continue;
      payload[op.username] = { code: generateSync({ secret: op.seed }), secondsLeft };
    }
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(payload));
    return;
  }

  // QR generado EN LOCAL (nada de servicios externos: la semilla TOTP no sale de la maquina).
  const qrMatch = /^\/qr\/(.+)\.png$/.exec(req.url ?? "");
  if (qrMatch) {
    const username = decodeURIComponent(qrMatch[1]!);
    const op = operators.find((candidate) => candidate.username === username);
    if (!op || !op.seed) {
      res.writeHead(404).end();
      return;
    }
    void QRCode.toBuffer(otpauthUri(op), { type: "png", width: 240, margin: 1 }).then((png) => {
      res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
      res.end(png);
    });
    return;
  }

  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(page());
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Ayuda de login en http://127.0.0.1:${port}`);
  console.log(`Operadores: ${operators.map((op) => op.username).join(", ")}`);
  console.log("Ctrl+C para parar.");
});

const shutdown = (): void => {
  server.close(() => {
    void closeDbPool().finally(() => process.exit(0));
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

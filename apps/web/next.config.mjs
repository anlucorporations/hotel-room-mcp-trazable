import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * Carga el `.env` de la RAÍZ del monorepo.
 *
 * Next solo lee los ficheros `.env` de su propio directorio de proyecto (`apps/web`), así que
 * sin esto el servidor no ve `DATABASE_URL`, `JWT_SECRET` ni `REDIS_URL`. Se hace aquí, al
 * evaluar la configuración, porque este módulo se carga en el proceso CLI **antes** de que Next
 * arranque sus workers, y los procesos hijos heredan `process.env`.
 *
 * Quedó al descubierto al retirar de `db/pool.ts` la cadena de conexión embebida en el código
 * (CWE-798): la aplicación venía funcionando gracias a esas credenciales por defecto, no porque
 * el entorno estuviera bien cargado. La raíz se localiza subiendo por el árbol hasta encontrar
 * `pnpm-workspace.yaml`, para no depender del directorio desde el que se lance el comando.
 */
function loadMonorepoEnv() {
  // Si el entorno ya trae la configuración (contenedor, CI, `--env-file`), no se toca.
  if (process.env.DATABASE_URL) return;

  let current = resolve(process.cwd());
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) {
      const envPath = join(current, ".env");
      if (existsSync(envPath)) {
        try {
          process.loadEnvFile(envPath);
        } catch (error) {
          console.warn(
            `[next.config] No se pudo cargar ${envPath}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
      return;
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

loadMonorepoEnv();

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Cabeceras de seguridad HTTP (hardening, RNF-13). Conservadoras para no romper la app:
 * anti-clickjacking, anti-sniffing, referrer, HSTS (solo aplica sobre HTTPS) y Permissions-Policy.
 * La CSP completa se difiere a pre-prod: requiere nonces por petición + `connect-src` afinado al
 * RPC/WalletConnect y a las fuentes, y una CSP mal calibrada rompería wallet/RPC/next-font.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Imágenes servidas por host/CDN (ADR-12). next/image (UX#10) necesita permitir SVG para los
  // placeholders locales de habitación (`/images/*.svg`); el optimizador no los reescala, así que
  // se sirven tal cual con CSP estricta que impide scripts incrustados en el SVG. Los
  // `remotePatterns` para el CDN real se configuran en F1.
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);

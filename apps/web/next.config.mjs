import createNextIntlPlugin from "next-intl/plugin";

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
  // Las imágenes se sirven por host/CDN (ADR-12); los remotePatterns se configuran en F1.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);

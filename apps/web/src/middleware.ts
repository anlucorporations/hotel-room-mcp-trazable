import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Edge Middleware — Seguridad Perimetral y Cabeceras WAF / Cloudflare
 *
 * 1. Inyecta cabeceras HTTP de seguridad estrictas (CSP, HSTS, X-Frame-Options, etc.).
 * 2. Valida y extrae la IP real del cliente desde cabeceras Cloudflare (CF-Connecting-IP).
 * 3. Aplica throttling defensivo perimetral en endpoints críticos.
 */

// Memoria efímera en edge para throttling básico pre-aplicación
const edgeRateLimitMap = new Map<string, { count: number; expiresAt: number }>();

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Extracción de IP real (preferencia por Cloudflare)
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  const trueClientIp = request.headers.get('true-client-ip');
  const xForwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const clientIp = cfConnectingIp || trueClientIp || xForwardedFor || '127.0.0.1';

  // 2. Throttling perimetral en rutas críticas de administración y recepción
  if (pathname.startsWith('/api/admin') || pathname.startsWith('/api/reception')) {
    const now = Date.now();
    const limitWindowMs = 60 * 1000; // 1 minuto
    const maxRequests = 30; // 30 req/min por IP en endpoints de gestión

    const record = edgeRateLimitMap.get(clientIp);
    if (record && record.expiresAt > now) {
      if (record.count >= maxRequests) {
        return new NextResponse(
          JSON.stringify({
            error: 'Demasiadas solicitudes hacia endpoints protegidos (Edge WAF Rate Limit).',
            retryAfter: Math.ceil((record.expiresAt - now) / 1000),
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': String(Math.ceil((record.expiresAt - now) / 1000)),
              'X-RateLimit-Limit': String(maxRequests),
              'X-RateLimit-Remaining': '0',
            },
          }
        );
      }
      record.count += 1;
    } else {
      edgeRateLimitMap.set(clientIp, { count: 1, expiresAt: now + limitWindowMs });
    }
  }

  // Limpieza periódica del mapa de throttling si crece en memoria
  if (edgeRateLimitMap.size > 5000) {
    const now = Date.now();
    for (const [k, v] of edgeRateLimitMap.entries()) {
      if (v.expiresAt <= now) edgeRateLimitMap.delete(k);
    }
  }

  // 3. Crear respuesta base
  const response = NextResponse.next();

  // 4. Inyección de Cabeceras de Seguridad Estrictas
  response.headers.set('X-Real-Client-IP', clientIp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

  // Content Security Policy adaptada para Next.js + Web3 (WalletConnect, RPCs Alchemy/Infura, IPFS)
  const cspHeader = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://ipfs.io https://gateway.pinata.cloud https://*.walletconnect.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.alchemy.com https://*.infura.io wss://*.alchemy.com wss://*.infura.io https://*.walletconnect.com wss://*.walletconnect.com https://api.coingecko.com",
    // F6 · D-67: el mapa de contacto es un iframe de OpenStreetMap; se permite SOLO ese origen
    // (el resto de `frame-src` sigue cerrado por `default-src 'self'`).
    "frame-src https://www.openstreetmap.org",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  response.headers.set('Content-Security-Policy', cspHeader);

  return response;
}

export const config = {
  matcher: [
    /*
     * Aplica el middleware a todas las rutas excepto archivos estáticos:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico, robots.txt, etc.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt).*)',
  ],
};

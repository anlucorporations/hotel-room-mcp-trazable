import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

describe('Edge Middleware & Seguridad Perimetral (Fase 2: WAF Cloudflare)', () => {
  it('debe inyectar todas las cabeceras de seguridad requeridas', () => {
    const req = new NextRequest('http://localhost:3000/catalogo');
    const res = middleware(req);

    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=63072000');
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(res.headers.get('Content-Security-Policy')).toContain('connect-src');
  });

  it('permite en connect-src el RPC del despliegue, derivado del entorno (2026-10-05)', () => {
    const previous = process.env.NEXT_PUBLIC_RPC_URL;
    process.env.NEXT_PUBLIC_RPC_URL = 'https://mcc-foundry-anvil-slzlptbcla-ew.a.run.app';
    try {
      const res = middleware(new NextRequest('http://localhost:3000/catalogo'));
      const csp = res.headers.get('Content-Security-Policy') ?? '';
      // Sin esto el navegador rechazaba la conexión y el frontend se quedaba sin leer la cadena.
      expect(csp).toContain('https://mcc-foundry-anvil-slzlptbcla-ew.a.run.app');
      expect(csp).toContain('wss://mcc-foundry-anvil-slzlptbcla-ew.a.run.app');
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_RPC_URL;
      else process.env.NEXT_PUBLIC_RPC_URL = previous;
    }
  });

  it('también acepta la variable de runtime RPC_URL del servicio', () => {
    const previousPublic = process.env.NEXT_PUBLIC_RPC_URL;
    const previousRuntime = process.env.RPC_URL;
    delete process.env.NEXT_PUBLIC_RPC_URL;
    process.env.RPC_URL = 'https://rpc.interno.example:8545';
    try {
      const res = middleware(new NextRequest('http://localhost:3000/catalogo'));
      expect(res.headers.get('Content-Security-Policy')).toContain('https://rpc.interno.example:8545');
    } finally {
      if (previousPublic !== undefined) process.env.NEXT_PUBLIC_RPC_URL = previousPublic;
      if (previousRuntime === undefined) delete process.env.RPC_URL;
      else process.env.RPC_URL = previousRuntime;
    }
  });

  it('mantiene la CSP válida si el RPC no está configurado o es inválido', () => {
    const previous = process.env.NEXT_PUBLIC_RPC_URL;
    process.env.NEXT_PUBLIC_RPC_URL = 'no-es-una-url';
    try {
      const res = middleware(new NextRequest('http://localhost:3000/catalogo'));
      const csp = res.headers.get('Content-Security-Policy') ?? '';
      expect(csp).toContain("connect-src 'self'");
      expect(csp).not.toContain('no-es-una-url');
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_RPC_URL;
      else process.env.NEXT_PUBLIC_RPC_URL = previous;
    }
  });

  it('debe extraer correctamente la IP de Cloudflare (CF-Connecting-IP)', () => {
    const req = new NextRequest('http://localhost:3000/api/nfts', {
      headers: {
        'cf-connecting-ip': '198.51.100.42',
      },
    });
    const res = middleware(req);

    expect(res.headers.get('X-Real-Client-IP')).toBe('198.51.100.42');
  });

  it('debe aplicar rate limiting perimetral en rutas /api/admin y responder 429 tras superar el límite', () => {
    const ip = '203.0.113.88';

    // Disparar solicitudes hasta saturar el límite de 30 req/min
    let lastRes;
    for (let i = 0; i < 31; i++) {
      const req = new NextRequest('http://localhost:3000/api/admin/metrics', {
        headers: {
          'cf-connecting-ip': ip,
        },
      });
      lastRes = middleware(req);
    }

    expect(lastRes?.status).toBe(429);
    expect(lastRes?.headers.get('Retry-After')).toBeDefined();
    expect(lastRes?.headers.get('X-RateLimit-Remaining')).toBe('0');
  });
});

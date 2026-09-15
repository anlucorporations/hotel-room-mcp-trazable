import { describe, it, expect } from 'vitest';
import { POST } from './session/route';

describe('API Endpoint: POST /api/fiat/session (Fase 2)', () => {
  it('debe devolver 400 si faltan parámetros requeridos', async () => {
    const req = new Request('http://localhost:3000/api/fiat/session', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Faltan parámetros obligatorios');
  });

  it('debe crear una sesión válida y devolver la checkoutUrl de Stripe', async () => {
    const req = new Request('http://localhost:3000/api/fiat/session', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'STRIPE',
        destinationWallet: '0x3333333333333333333333333333333333333333',
        fiatAmountEur: 180,
        tokenId: 302,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessionId).toContain('onramp_stripe_');
    expect(data.checkoutUrl).toContain('https://crypto.stripe.com');
    expect(data.signature).toHaveLength(64);
  });
});

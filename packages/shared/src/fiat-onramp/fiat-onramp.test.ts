import { describe, it, expect } from 'vitest';
import { FiatOnrampService } from './service';
import crypto from 'node:crypto';

describe('FiatOnrampService (Fase 2: Pasarela Híbrida Fiat/Cripto)', () => {
  const secretKey = 'test_webhook_secret_key_123';

  it('debe generar una sesión de Stripe Onramp con URL firmada y expiración a 30 min', () => {
    const session = FiatOnrampService.createSession(
      {
        provider: 'STRIPE',
        destinationWallet: '0x1111111111111111111111111111111111111111',
        fiatAmountEur: 150,
        tokenId: 101,
      },
      secretKey
    );

    expect(session.sessionId).toContain('onramp_stripe_');
    expect(session.provider).toBe('STRIPE');
    expect(session.checkoutUrl).toContain('https://crypto.stripe.com');
    expect(session.checkoutUrl).toContain('wallet=0x1111111111111111111111111111111111111111');
    expect(session.signature).toHaveLength(64);
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('debe generar una sesión de MoonPay con los parámetros correspondientes', () => {
    const session = FiatOnrampService.createSession(
      {
        provider: 'MOONPAY',
        destinationWallet: '0x2222222222222222222222222222222222222222',
        fiatAmountEur: 220,
        tokenId: 205,
      },
      secretKey
    );

    expect(session.sessionId).toContain('onramp_moonpay_');
    expect(session.provider).toBe('MOONPAY');
    expect(session.checkoutUrl).toContain('https://buy.moonpay.com');
    expect(session.checkoutUrl).toContain('currencyCode=pol_polygon');
  });

  it('debe rechazar direcciones de wallet inválidas o importes no positivos', () => {
    expect(() => {
      FiatOnrampService.createSession({
        provider: 'STRIPE',
        destinationWallet: 'invalid-wallet',
        fiatAmountEur: 100,
        tokenId: 1,
      });
    }).toThrow(/Dirección de wallet de destino inválida/);

    expect(() => {
      FiatOnrampService.createSession({
        provider: 'STRIPE',
        destinationWallet: '0x1111111111111111111111111111111111111111',
        fiatAmountEur: 0,
        tokenId: 1,
      });
    }).toThrow(/El importe en EUR debe ser mayor que cero/);
  });

  it('debe validar firmas criptográficas de webhooks correctamente con timingSafeEqual', () => {
    const rawPayload = JSON.stringify({ event: 'charge.succeeded', amount: 150 });
    const validSignature = crypto.createHmac('sha256', secretKey).update(rawPayload).digest('hex');

    const isValid = FiatOnrampService.verifyWebhookSignature(rawPayload, validSignature, secretKey);
    expect(isValid).toBe(true);

    const invalidSignature = crypto.createHmac('sha256', 'wrong_secret').update(rawPayload).digest('hex');
    const isInvalid = FiatOnrampService.verifyWebhookSignature(rawPayload, invalidSignature, secretKey);
    expect(isInvalid).toBe(false);
  });

  it('debe procesar eventos de webhook y devolver los estados de negocio correspondientes', () => {
    const successResult = FiatOnrampService.processWebhookEvent({
      eventId: 'evt_1',
      provider: 'STRIPE',
      type: 'PAYMENT_SUCCESS',
      sessionId: 'sess_1',
      destinationWallet: '0x1111111111111111111111111111111111111111',
      fiatAmountEur: 150,
      timestamp: new Date().toISOString(),
      signature: 'dummy',
    });
    expect(successResult.success).toBe(true);
    expect(successResult.status).toBe('PAID');

    const cryptoDeliveredResult = FiatOnrampService.processWebhookEvent({
      eventId: 'evt_2',
      provider: 'STRIPE',
      type: 'CRYPTO_DELIVERED',
      sessionId: 'sess_1',
      destinationWallet: '0x1111111111111111111111111111111111111111',
      cryptoTxHash: '0xabc123',
      fiatAmountEur: 150,
      timestamp: new Date().toISOString(),
      signature: 'dummy',
    });
    expect(cryptoDeliveredResult.success).toBe(true);
    expect(cryptoDeliveredResult.status).toBe('COMPLETED');
    expect(cryptoDeliveredResult.message).toContain('0xabc123');

    const failedResult = FiatOnrampService.processWebhookEvent({
      eventId: 'evt_3',
      provider: 'STRIPE',
      type: 'PAYMENT_FAILED',
      sessionId: 'sess_1',
      destinationWallet: '0x1111111111111111111111111111111111111111',
      fiatAmountEur: 150,
      timestamp: new Date().toISOString(),
      signature: 'dummy',
    });
    expect(failedResult.success).toBe(false);
    expect(failedResult.status).toBe('FAILED');
  });
});

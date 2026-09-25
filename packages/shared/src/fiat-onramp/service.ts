import crypto from 'node:crypto';

export type OnrampProvider = 'STRIPE' | 'MOONPAY';

export interface CreateOnrampSessionParams {
  provider: OnrampProvider;
  destinationWallet: string;
  fiatAmountEur: number;
  cryptoCurrency?: string; // Por defecto 'POL'
  tokenId: number;
  customerEmail?: string;
  redirectUrl?: string;
}

export interface OnrampSessionResult {
  sessionId: string;
  provider: OnrampProvider;
  checkoutUrl: string;
  destinationWallet: string;
  fiatAmountEur: number;
  cryptoCurrency: string;
  tokenId: number;
  expiresAt: string; // ISO
  signature: string;
}

export interface OnrampWebhookPayload {
  eventId: string;
  provider: OnrampProvider;
  type: 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'CRYPTO_DELIVERED';
  sessionId: string;
  destinationWallet: string;
  cryptoTxHash?: string;
  fiatAmountEur: number;
  timestamp: string;
  signature: string;
}

export class FiatOnrampService {
  private static readonly DEFAULT_SECRET = 'hotel_onramp_webhook_secret_2026';

  /**
   * Genera una sesión de pago fiat (Stripe o MoonPay) con firma HMAC para integridad.
   */
  public static createSession(
    params: CreateOnrampSessionParams,
    secretKey: string = this.DEFAULT_SECRET
  ): OnrampSessionResult {
    if (!params.destinationWallet || !params.destinationWallet.startsWith('0x')) {
      throw new Error('FiatOnrampService: Dirección de wallet de destino inválida (formato 0x requerido).');
    }
    if (params.fiatAmountEur <= 0) {
      throw new Error('FiatOnrampService: El importe en EUR debe ser mayor que cero.');
    }

    const sessionId = `onramp_${params.provider.toLowerCase()}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const cryptoCurrency = params.cryptoCurrency || 'POL';
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutos

    // Firma HMAC-SHA256 para evitar alteraciones de parámetros
    const payloadToSign = `${sessionId}:${params.provider}:${params.destinationWallet.toLowerCase()}:${params.fiatAmountEur}:${params.tokenId}:${expiresAt}`;
    const signature = crypto.createHmac('sha256', secretKey).update(payloadToSign).digest('hex');

    let checkoutUrl = '';
    if (params.provider === 'STRIPE') {
      checkoutUrl = `https://crypto.stripe.com/v1/onramp?session_id=${sessionId}&wallet=${params.destinationWallet}&amount=${params.fiatAmountEur}&token=${cryptoCurrency}&sig=${signature}`;
    } else {
      checkoutUrl = `https://buy.moonpay.com?apiKey=pk_hotel_live&currencyCode=pol_polygon&walletAddress=${params.destinationWallet}&baseCurrencyCode=eur&baseCurrencyAmount=${params.fiatAmountEur}&externalTransactionId=${sessionId}&signature=${signature}`;
    }

    return {
      sessionId,
      provider: params.provider,
      checkoutUrl,
      destinationWallet: params.destinationWallet.toLowerCase(),
      fiatAmountEur: params.fiatAmountEur,
      cryptoCurrency,
      tokenId: params.tokenId,
      expiresAt,
      signature,
    };
  }

  /**
   * Valida la firma criptográfica HMAC de un webhook emitido por la pasarela de pagos.
   */
  public static verifyWebhookSignature(
    payloadString: string,
    providedSignature: string,
    secretKey: string = this.DEFAULT_SECRET
  ): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(payloadString)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(providedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Procesa el evento de webhook tras validar su autenticidad.
   */
  public static processWebhookEvent(payload: OnrampWebhookPayload): {
    success: boolean;
    status: string;
    message: string;
  } {
    switch (payload.type) {
      case 'PAYMENT_SUCCESS':
        return {
          success: true,
          status: 'PAID',
          message: `Pago de ${payload.fiatAmountEur} EUR confirmado para wallet ${payload.destinationWallet}.`,
        };
      case 'CRYPTO_DELIVERED':
        return {
          success: true,
          status: 'COMPLETED',
          message: `POL entregado a la wallet ${payload.destinationWallet} (Tx: ${payload.cryptoTxHash || 'pending'}).`,
        };
      case 'PAYMENT_FAILED':
        return {
          success: false,
          status: 'FAILED',
          message: `Pago de ${payload.fiatAmountEur} EUR rechazado por el emisor de la tarjeta.`,
        };
      default:
        // En esta rama `payload` está agotado por el discriminante, pero el valor real puede venir
        // de una integración con un tipo de evento nuevo: se estrecha para poder reportarlo.
        throw new Error(
          `FiatOnrampService: Tipo de evento no reconocido: ${(payload as { type: string }).type}`,
        );
    }
  }
}

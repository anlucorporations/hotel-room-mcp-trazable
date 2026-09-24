import { NextResponse } from 'next/server';
import { FiatOnrampService } from '@hotel/shared';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { provider, destinationWallet, fiatAmountEur, tokenId } = body;

    if (!provider || !destinationWallet || !fiatAmountEur || !tokenId) {
      return NextResponse.json(
        { error: 'Faltan parámetros obligatorios (provider, destinationWallet, fiatAmountEur, tokenId).' },
        { status: 400 }
      );
    }

    const session = FiatOnrampService.createSession({
      provider,
      destinationWallet,
      fiatAmountEur: Number(fiatAmountEur),
      tokenId: Number(tokenId),
    });

    return NextResponse.json(session, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Error al generar sesión de compra con tarjeta.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from 'next/server';
import { PmsAdapter } from '@hotel/shared';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tokenId, roomNumber, checkInDate, checkInMethod, guestName, documentNumber } = body;

    if (!tokenId || !roomNumber || !checkInDate) {
      return NextResponse.json(
        { error: 'Faltan parámetros obligatorios de recepción (tokenId, roomNumber, checkInDate).' },
        { status: 400 }
      );
    }

    const result = await PmsAdapter.syncCheckIn({
      tokenId: Number(tokenId),
      roomNumber: Number(roomNumber),
      checkInDate,
      checkInMethod: checkInMethod || 'QR',
      guestName,
      documentNumber,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Error al procesar sincronización PMS.' },
      { status: 500 }
    );
  }
}

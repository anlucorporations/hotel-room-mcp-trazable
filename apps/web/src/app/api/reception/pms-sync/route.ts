import { NextResponse } from 'next/server';
import { PmsAdapter } from '@hotel/shared';
import { requireRole } from '@/lib/guard';

export const dynamic = 'force-dynamic';

/**
 * POST /api/reception/pms-sync
 *
 * Comunica al PMS del hotel la **entrada** de una noche (token, habitación, fecha y método).
 *
 * D-13: el **registro de viajeros del RD 933/2021 no lo hace esta plataforma**. Se retiró la
 * generación simulada del parte policial y la ruta **ya no acepta ni devuelve** nombre ni número
 * de documento: si el cuerpo trae esos campos se rechaza con 400 para que no se cuelen por
 * costumbre (el adaptador tampoco los conoce). El registro se cumplimenta en el PMS/mostrador del
 * hotel, que es donde vive la identidad del huésped.
 *
 * Protegida (D-13): exige sesión de `RECEPTION_ROLE` (es un gesto de mostrador) sobre el acceso con
 * contraseña + TOTP obligatorio de D-04. Sin sesión → 401; con sesión de un rol ajeno → 403.
 */
const FORBIDDEN_PII_FIELDS = [
  'guestName',
  'documentNumber',
  'documentType',
  'guestNationality',
] as const;

export async function POST(request: Request) {
  const auth = await requireRole(request, 'RECEPTION_ROLE');
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();

    const piiField = FORBIDDEN_PII_FIELDS.find((field) => body?.[field] !== undefined);
    if (piiField) {
      return NextResponse.json(
        {
          error: 'PII_NOT_ACCEPTED',
          message:
            `El campo '${piiField}' no se admite: el registro de viajeros (RD 933/2021) se ` +
            'cumplimenta en el PMS del hotel, fuera de la plataforma.',
        },
        { status: 400 }
      );
    }

    const { tokenId, roomNumber, checkInDate, checkInMethod, pmsReservationId } = body ?? {};

    if (!tokenId || !roomNumber || !checkInDate) {
      return NextResponse.json(
        { error: 'Faltan parámetros obligatorios de recepción (tokenId, roomNumber, checkInDate).' },
        { status: 400 }
      );
    }

    const result = await PmsAdapter.syncCheckIn({
      tokenId: Number(tokenId),
      roomNumber: Number(roomNumber),
      checkInDate: String(checkInDate),
      checkInMethod: checkInMethod === 'CONTINGENCY' ? 'CONTINGENCY' : 'QR',
      pmsReservationId: pmsReservationId ? String(pmsReservationId) : undefined,
    });

    return NextResponse.json({ ...result, syncedBy: auth.session.username }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al procesar sincronización PMS.' },
      { status: 500 }
    );
  }
}

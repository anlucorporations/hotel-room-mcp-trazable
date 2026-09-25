import { describe, it, expect, vi, afterEach } from 'vitest';
import { PmsAdapter } from './adapter';

/**
 * Adaptador del PMS (D-13).
 *
 * Lo que estas pruebas fijan es un **cambio de alcance**: la plataforma comunica la entrada al PMS
 * y **no** genera el registro de viajeros del RD 933/2021 (ni acepta nombre o documento). El estado
 * auditado afirmaba haber emitido el parte policial con DNI y nombre del huésped sin enviarlo a
 * ningún sitio.
 */
describe('PmsAdapter (D-13: entrada al PMS sin PII)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('comunica la entrada al PMS sin generar ficha policial ni datos personales', async () => {
    const result = await PmsAdapter.syncCheckIn({
      tokenId: 105,
      roomNumber: 204,
      checkInDate: '2026-09-22',
      checkOutDate: '2026-09-23',
      checkInMethod: 'QR',
    });

    expect(result.success).toBe(true);
    expect(result.pmsSyncId).toContain('pms_');
    expect(result.policeReportGenerated).toBe(false);
    expect(result.message).toContain('registro de viajeros');
    // Ni el resultado ni su serialización contienen PII ni ficha policial.
    expect(JSON.stringify(result)).not.toMatch(/documentNumber|travelerFullName|guestName|policeReport"/);
  });

  it('la petición al PMS remoto no incluye campos personales', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    await PmsAdapter.syncCheckIn(
      {
        tokenId: 106,
        roomNumber: 301,
        checkInDate: '2026-09-22',
        checkInMethod: 'CONTINGENCY',
      },
      'OPERA',
      'https://pms.example.test/checkin'
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body);
    expect(body).not.toMatch(/document|guestName|nationality|traveler/i);
    expect(body).toContain('"checkInMethod":"CONTINGENCY"');
  });

  it('degrada con honestidad si el endpoint del PMS no responde (sin afirmar que registró)', async () => {
    const result = await PmsAdapter.syncCheckIn(
      {
        tokenId: 106,
        roomNumber: 301,
        checkInDate: '2026-09-22',
        checkInMethod: 'CONTINGENCY',
      },
      'OPERA',
      'http://127.0.0.1:59999/unreachable-pms-endpoint'
    );

    expect(result.success).toBe(false);
    expect(result.policeReportGenerated).toBe(false);
    expect(result.message).toContain('pendiente de reintento');
  });
});

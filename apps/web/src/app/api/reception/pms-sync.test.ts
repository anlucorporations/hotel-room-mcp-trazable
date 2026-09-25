import { describe, it, expect, vi, beforeEach } from 'vitest';
import { guardMock, lastRequiredRole, resetGuardState, setGuardState } from '../../../../test/guard-mock';

vi.mock('@/lib/guard', () => guardMock);

import { POST } from './pms-sync/route';

/**
 * Sincronización con el PMS (D-13).
 *
 * Cambio de fondo respecto al estado auditado: la ruta **no acepta ni devuelve datos personales** y
 * **no genera ninguna ficha policial simulada**. El registro de viajeros del RD 933/2021 se
 * cumplimenta en el PMS del hotel; la plataforma solo comunica la entrada.
 */
describe('API Endpoint: POST /api/reception/pms-sync (D-04, D-13)', () => {
  beforeEach(() => {
    resetGuardState();
  });

  it('responde 401 sin sesión válida', async () => {
    setGuardState('unauthorized');
    const req = new Request('http://localhost:3000/api/reception/pms-sync', {
      method: 'POST',
      body: JSON.stringify({ tokenId: 108, roomNumber: 305, checkInDate: '2026-09-25' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('responde 403 sin el rol de recepción', async () => {
    setGuardState('forbidden');
    const req = new Request('http://localhost:3000/api/reception/pms-sync', {
      method: 'POST',
      body: JSON.stringify({ tokenId: 108, roomNumber: 305, checkInDate: '2026-09-25' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('exige RECEPTION_ROLE (es un gesto de mostrador, D-13)', async () => {
    const req = new Request('http://localhost:3000/api/reception/pms-sync', {
      method: 'POST',
      body: JSON.stringify({ tokenId: 108, roomNumber: 305, checkInDate: '2026-09-25' }),
    });
    await POST(req);
    expect(lastRequiredRole()).toBe('RECEPTION_ROLE');
  });

  it('debe devolver 400 si faltan parámetros requeridos', async () => {
    const req = new Request('http://localhost:3000/api/reception/pms-sync', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Faltan parámetros obligatorios');
  });

  it('RECHAZA el nombre del huésped y el número de documento (no se admiten PII)', async () => {
    for (const pii of [{ guestName: 'MARIA LOPEZ' }, { documentNumber: '87654321A' }]) {
      const req = new Request('http://localhost:3000/api/reception/pms-sync', {
        method: 'POST',
        body: JSON.stringify({
          tokenId: 108,
          roomNumber: 305,
          checkInDate: '2026-09-25',
          ...pii,
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('PII_NOT_ACCEPTED');
    }
  });

  it('comunica la entrada al PMS SIN generar ficha policial ni devolver PII', async () => {
    const req = new Request('http://localhost:3000/api/reception/pms-sync', {
      method: 'POST',
      body: JSON.stringify({
        tokenId: 108,
        roomNumber: 305,
        checkInDate: '2026-09-25',
        checkInMethod: 'QR',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.policeReportGenerated).toBe(false);
    expect(data.policeReport).toBeUndefined();
    expect(JSON.stringify(data)).not.toMatch(/documentNumber|travelerFullName|guestName/);
    expect(data.syncedBy).toBe('admin@hotel.es');
  });
});

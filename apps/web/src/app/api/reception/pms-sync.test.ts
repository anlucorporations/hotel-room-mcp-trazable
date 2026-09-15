import { describe, it, expect } from 'vitest';
import { POST } from './pms-sync/route';

describe('API Endpoint: POST /api/reception/pms-sync (Fase 2)', () => {
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

  it('debe sincronizar la reserva y generar ficha policial RD 933/2021', async () => {
    const req = new Request('http://localhost:3000/api/reception/pms-sync', {
      method: 'POST',
      body: JSON.stringify({
        tokenId: 108,
        roomNumber: 305,
        checkInDate: '2026-09-25',
        checkInMethod: 'QR',
        guestName: 'MARIA LOPEZ',
        documentNumber: '87654321A',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.policeReportGenerated).toBe(true);
    expect(data.policeReport.documentNumber).toBe('87654321A');
  });
});

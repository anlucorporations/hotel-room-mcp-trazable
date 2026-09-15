import { describe, it, expect } from 'vitest';
import { PmsAdapter } from './adapter';

describe('PmsAdapter (Fase 2: Integración PMS & RD 933/2021)', () => {
  it('debe generar la ficha de viajero oficial cumpliendo con los campos del RD 933/2021', () => {
    const report = PmsAdapter.generatePoliceReport({
      tokenId: 105,
      roomNumber: 204,
      checkInDate: '2026-09-22',
      checkOutDate: '2026-09-23',
      checkInMethod: 'QR',
      documentType: 'DNI',
      documentNumber: '12345678Z',
      guestName: 'JUAN PEREZ GARCIA',
      guestNationality: 'ESP',
    });

    expect(report.establishmentCode).toBe('HOTEL-MARINA-MICA-001');
    expect(report.roomNumber).toBe(204);
    expect(report.documentType).toBe('DNI');
    expect(report.documentNumber).toBe('12345678Z');
    expect(report.travelerFullName).toBe('JUAN PEREZ GARCIA');
    expect(report.tokenVerificationHash).toBe('token_105_QR');
    expect(report.checkInTimestamp).toBeDefined();
  });

  it('debe sincronizar exitosamente con el PMS mock y emitir ID de trazabilidad', async () => {
    const result = await PmsAdapter.syncCheckIn({
      tokenId: 105,
      roomNumber: 204,
      checkInDate: '2026-09-22',
      checkInMethod: 'QR',
    });

    expect(result.success).toBe(true);
    expect(result.pmsSyncId).toContain('pms_');
    expect(result.policeReportGenerated).toBe(true);
    expect(result.message).toContain('RD 933/2021 emitido');
  });

  it('debe manejar degradación elegante y reportar fallo controlado si el endpoint PMS no responde', async () => {
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
    expect(result.policeReportGenerated).toBe(true); // La ficha se genera localmente de todas formas
    expect(result.message).toContain('cola local para reintento');
  });
});

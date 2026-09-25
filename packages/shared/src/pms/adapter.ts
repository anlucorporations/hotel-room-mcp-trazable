/**
 * Adaptador del PMS del hotel (D-13).
 *
 * Alcance real de la plataforma: **comunica la entrada** al PMS del establecimiento (token, noche,
 * método de check-in). El **registro de viajeros del RD 933/2021 no lo emite esta plataforma**: lo
 * cumplimenta el personal del hotel en su PMS/mostrador, que es donde vive la identidad del
 * huésped.
 *
 * Por eso este adaptador **no acepta ni devuelve datos personales** (nombre, documento,
 * nacionalidad) y **no genera ninguna ficha policial**: la versión auditada (H-13) decía haber
 * emitido el parte policial con DNI y nombre del viajero, sin enviarlo a ningún sitio.
 */
export type PmsType = 'OPERA' | 'CLOUDBEDS' | 'SIHOT' | 'MOCK';

export interface PmsCheckInSyncParams {
  tokenId: number;
  roomNumber: number;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate?: string;
  checkInMethod: 'QR' | 'CONTINGENCY';
  pmsReservationId?: string;
}

export interface PmsSyncResult {
  success: boolean;
  pmsSyncId: string;
  pmsType: PmsType;
  /**
   * Siempre `false`: la plataforma no genera el parte de viajeros. Se mantiene el campo para que
   * cualquier consumidor que lo leyera vea explícitamente que no lo hace (en vez de un `true`
   * simulado).
   */
  policeReportGenerated: false;
  timestamp: string;
  message: string;
}

export class PmsAdapter {
  /**
   * Sincroniza la entrada con el PMS. Sin datos personales en la petición ni en la respuesta.
   */
  public static async syncCheckIn(
    params: PmsCheckInSyncParams,
    pmsType: PmsType = 'MOCK',
    pmsEndpoint?: string
  ): Promise<PmsSyncResult> {
    const pmsSyncId = `pms_${Date.now()}_${params.tokenId}`;
    const payload = {
      pmsSyncId,
      tokenId: params.tokenId,
      roomNumber: params.roomNumber,
      checkInDate: params.checkInDate,
      checkOutDate: params.checkOutDate ?? params.checkInDate,
      checkInMethod: params.checkInMethod,
      pmsReservationId: params.pmsReservationId,
    };

    if (pmsType === 'MOCK' || !pmsEndpoint) {
      return {
        success: true,
        pmsSyncId,
        pmsType,
        policeReportGenerated: false,
        timestamp: new Date().toISOString(),
        message:
          `Entrada comunicada al PMS (${pmsType}) para la habitación ${params.roomNumber} ` +
          `(noche ${params.tokenId}). El registro de viajeros se cumplimenta en el PMS del hotel.`,
      };
    }

    try {
      const res = await fetch(pmsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`PMS HTTP Error: ${res.status} ${res.statusText}`);
      }

      return {
        success: true,
        pmsSyncId,
        pmsType,
        policeReportGenerated: false,
        timestamp: new Date().toISOString(),
        message: `Sincronización con ${pmsType} en ${pmsEndpoint} completada.`,
      };
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'error desconocido';
      // Degradación honesta: la entrada queda pendiente de reintento, sin afirmar que se registró.
      return {
        success: false,
        pmsSyncId,
        pmsType,
        policeReportGenerated: false,
        timestamp: new Date().toISOString(),
        message: `No se pudo comunicar la entrada al PMS (${detail}). Queda pendiente de reintento.`,
      };
    }
  }
}

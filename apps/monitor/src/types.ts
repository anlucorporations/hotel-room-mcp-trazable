import type { HealthReport } from "@hotel/shared/health";

/**
 * Contratos de dominio del monitor (T3.3 / RNF-17 / CU-16, docs/SRS.md §9).
 *
 * Estas interfaces son la frontera de inversión de dependencias (DIP): el núcleo
 * (`MonitorCore`) depende sólo de estas abstracciones, nunca de `fetch` ni de nodemailer. Así
 * el núcleo es testeable con fakes, sin red ni SMTP reales.
 */

/** Resultado de sondear el `/health` de un componente. */
export interface ProbeResult {
  /** `true` si la respuesta fue 200 y el cuerpo se interpretó como un `HealthReport`. */
  readonly ok: boolean;
  /** Código HTTP recibido (`0` si hubo error de red/timeout antes de obtener respuesta). */
  readonly httpStatus: number;
  /** Reporte de salud parseado, o `null` si no se pudo obtener/parsear. */
  readonly report: HealthReport | null;
}

/** Sonda de salud (DIP sobre `fetch`). */
export interface HealthProbe {
  probe(url: string): Promise<ProbeResult>;
}

/** Canal de alerta (DIP sobre nodemailer/SMTP). */
export interface Alerter {
  sendAlert(subject: string, body: string): Promise<void>;
}

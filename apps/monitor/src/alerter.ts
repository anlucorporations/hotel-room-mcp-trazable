import { createTransport, type Transporter } from "nodemailer";
import type { Alerter } from "./types";

/**
 * Implementación de {@link Alerter} sobre nodemailer/SMTP (T3.3 / RNF-17 / CU-16).
 *
 * El transporte SMTP se construye a partir de la configuración del monitor. El núcleo
 * (`MonitorCore`) compone el asunto y el cuerpo del aviso; esta clase sólo lo entrega (SRP).
 * Las pruebas del núcleo usan un fake de `Alerter`, sin SMTP real (DIP).
 */
export interface SmtpAlertConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly pass: string;
  /** Remitente (`SMTP_FROM`). */
  readonly from: string;
  /** Destinatario de las alertas (`ALERT_EMAIL`). */
  readonly to: string;
}

export class EmailAlerter implements Alerter {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly to: string;

  constructor(config: SmtpAlertConfig) {
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
    this.from = config.from;
    this.to = config.to;
  }

  async sendAlert(subject: string, body: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: this.to,
      subject,
      text: body,
    });
  }
}

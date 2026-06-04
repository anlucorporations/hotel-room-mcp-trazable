import { formatEther } from "viem";
import { createTransport, type Transporter } from "nodemailer";
import type { Mailer, SaleNotification } from "./types";

/**
 * Implementación de {@link Mailer} sobre nodemailer/SMTP (T1.4 / CU-10).
 *
 * Compone un aviso de venta legible (sin PII, RNF-05) a partir de la notificación ya
 * derivada. El transporte SMTP se inyecta por construcción para poder sustituirlo en pruebas
 * de integración si hiciera falta (DIP). Las pruebas del núcleo usan un fake de `Mailer`.
 */
export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly pass: string;
  /** Remitente (`SMTP_FROM`). */
  readonly from: string;
  /** Destinatario del aviso (`ADMIN_EMAIL`). */
  readonly to: string;
}

export class NodemailerMailer implements Mailer {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly to: string;

  constructor(config: SmtpConfig) {
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
    this.from = config.from;
    this.to = config.to;
  }

  async sendSaleEmail(notification: SaleNotification): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: this.to,
      subject: buildSubject(notification),
      text: buildBody(notification),
    });
  }
}

const SALE_TYPE_LABEL: Record<SaleNotification["saleType"], string> = {
  PRIMARY: "primaria",
  SECONDARY: "secundaria",
};

const buildSubject = (n: SaleNotification): string =>
  `Venta ${SALE_TYPE_LABEL[n.saleType]}: habitación ${n.room} · ${formatDate(n.dateYYYYMMDD)}`;

const buildBody = (n: SaleNotification): string =>
  [
    "Se ha registrado una venta de noche de hotel.",
    "",
    `Habitación: ${n.room} (${n.roomType})`,
    `Fecha de la noche: ${formatDate(n.dateYYYYMMDD)}`,
    `Tipo de venta: ${SALE_TYPE_LABEL[n.saleType]}`,
    `Precio: ${formatEther(n.priceWei)} ETH`,
    `Comprador: ${n.buyer}`,
    `Transacción: ${n.txHash}`,
    `Token: ${n.tokenId.toString()}`,
  ].join("\n");

/** Convierte `AAAAMMDD` a `AAAA-MM-DD` para el cuerpo del email. */
const formatDate = (yyyymmdd: number): string => {
  const year = Math.floor(yyyymmdd / 10_000);
  const month = Math.floor((yyyymmdd % 10_000) / 100);
  const day = yyyymmdd % 100;
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
};

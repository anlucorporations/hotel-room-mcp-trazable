import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as NodemailerModule from "nodemailer";
import { EmailAlerter, type SmtpAlertConfig } from "./alerter";

/**
 * Pruebas del canal de alerta real (SMTP). El núcleo se prueba con un fake de `Alerter`; aquí se
 * verifica la única cosa que el fake no puede verificar: que la configuración se traduce a
 * nodemailer **como toca**. En particular `secure`, que debe derivarse del puerto (465 ⇒ TLS
 * implícito): un error ahí rompe todas las alertas de producción en silencio.
 *
 * Se dobla `nodemailer.createTransport` (frontera de red); nada más.
 */
const h = vi.hoisted(() => {
  const sendMail = vi.fn(async (_options: unknown): Promise<{ messageId: string }> => ({ messageId: "stub" }));
  const createTransport = vi.fn((_options: unknown) => ({ sendMail }));
  return { sendMail, createTransport };
});

vi.mock("nodemailer", async (importOriginal) => {
  const actual = await importOriginal<typeof NodemailerModule>();
  return { ...actual, createTransport: h.createTransport };
});

const BASE: SmtpAlertConfig = {
  host: "smtp.example.test",
  port: 587,
  user: "monitor-user",
  pass: "monitor-pass",
  from: "hotel-monitor@example.test",
  to: "devops@example.test",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.sendMail.mockImplementation(async () => ({ messageId: "stub" }));
});

describe("EmailAlerter", () => {
  it("construye el transporte con host, puerto y credenciales de la configuración", () => {
    new EmailAlerter(BASE);

    expect(h.createTransport).toHaveBeenCalledWith({
      host: "smtp.example.test",
      port: 587,
      secure: false,
      auth: { user: "monitor-user", pass: "monitor-pass" },
    });
  });

  it("activa TLS implícito solo en el puerto 465", () => {
    new EmailAlerter({ ...BASE, port: 465 });
    expect(h.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true }));

    h.createTransport.mockClear();
    new EmailAlerter({ ...BASE, port: 25 });
    expect(h.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 25, secure: false }));
  });

  it("envía el aviso con el remitente y el destinatario configurados", async () => {
    const alerter = new EmailAlerter(BASE);

    await alerter.sendAlert("ALERTA: mcp caído", "El componente mcp no responde a /health");

    expect(h.sendMail).toHaveBeenCalledWith({
      from: "hotel-monitor@example.test",
      to: "devops@example.test",
      subject: "ALERTA: mcp caído",
      text: "El componente mcp no responde a /health",
    });
  });

  it("propaga el fallo de entrega para que el sondeo no lo dé por enviado", async () => {
    h.sendMail.mockRejectedValue(new Error("SMTP 550 relay denied"));
    const alerter = new EmailAlerter(BASE);

    await expect(alerter.sendAlert("asunto", "cuerpo")).rejects.toThrow("SMTP 550 relay denied");
  });
});

import { createServer, type Server } from "node:net";

/**
 * Sumidero SMTP local para el despliegue de desarrollo (misma tecnica que el sumidero del E2E de M6).
 *
 * Para que sirve: en local no hay proveedor de correo. Sin SMTP utilizable, el worker queda en estado
 * **degradado** (`emailDegraded: true`, `/health` responde 503) y reintenta cada aviso hasta agotarlo,
 * llenando el log de `EMAIL_DELIVERY_FAILED`. Con este sumidero el correo **se entrega de verdad** por
 * SMTP y el worker recupera su salud, sin depender de ningun servicio externo.
 *
 * NO es un servidor de correo: acepta la sesion SMTP y descarta el mensaje ya recibido. Registra
 * remitente, destinatario y asunto (nunca el cuerpo, que puede contener datos de la reserva).
 *
 * Uso: `node --experimental-strip-types scripts/dev/smtp-sink.ts [puerto]`  (por defecto 2525)
 */
const port = Number(process.argv[2] ?? 2525);

interface Sink {
  readonly server: Server;
  readonly messages: number;
}

function startSink(listenPort: number): Sink {
  let received = 0;
  const server = createServer((socket) => {
    let inData = false;
    let buffer = "";
    let from = "";
    const to: string[] = [];

    socket.write("220 sumidero SMTP local (desarrollo)\r\n");

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");

      // Fuera de DATA: el protocolo es linea a linea.
      while (!inData && buffer.includes("\r\n")) {
        const index = buffer.indexOf("\r\n");
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const command = line.toUpperCase();

        if (command.startsWith("EHLO") || command.startsWith("HELO")) {
          socket.write("250-sumidero local\r\n250 SIZE 10485760\r\n");
        } else if (command.startsWith("MAIL FROM")) {
          from = line.slice(line.indexOf(":") + 1).trim();
          socket.write("250 OK\r\n");
        } else if (command.startsWith("RCPT TO")) {
          to.push(line.slice(line.indexOf(":") + 1).trim());
          socket.write("250 OK\r\n");
        } else if (command === "DATA") {
          socket.write("354 Envia el mensaje y termina con <CRLF>.<CRLF>\r\n");
          inData = true;
        } else if (command.startsWith("QUIT")) {
          socket.write("221 Adios\r\n");
          socket.end();
        } else if (command.startsWith("RSET") || command.startsWith("NOOP")) {
          socket.write("250 OK\r\n");
        } else if (command.startsWith("AUTH")) {
          // No se anuncia AUTH; si un cliente insiste, se rechaza en lugar de aceptar credenciales.
          socket.write("502 AUTH no soportado en el sumidero\r\n");
        } else {
          socket.write("250 OK\r\n");
        }
      }

      if (inData) {
        const end = buffer.indexOf("\r\n.\r\n");
        if (end === -1) return;
        const raw = buffer.slice(0, end);
        buffer = buffer.slice(end + 5);
        inData = false;
        received += 1;

        const subjectLine = raw
          .split("\r\n")
          .find((line) => line.toLowerCase().startsWith("subject:"));
        const subject = subjectLine ? subjectLine.slice(subjectLine.indexOf(":") + 1).trim() : "(sin asunto)";
        console.log(
          JSON.stringify({
            event: "SMTP_SINK_RECEIVED",
            number: received,
            from,
            to,
            subject,
            bytes: raw.length,
          }),
        );
        socket.write("250 Mensaje aceptado por el sumidero\r\n");
      }
    });

    socket.on("error", () => socket.destroy());
  });

  server.listen(listenPort, "127.0.0.1", () => {
    console.log(
      JSON.stringify({ event: "SMTP_SINK_LISTENING", host: "127.0.0.1", port: listenPort }),
    );
  });
  server.on("error", (error) => {
    console.error(
      JSON.stringify({ event: "SMTP_SINK_ERROR", message: error instanceof Error ? error.message : String(error) }),
    );
    process.exitCode = 1;
  });

  return {
    server,
    get messages() {
      return received;
    },
  };
}

const sink = startSink(port);

const shutdown = (): void => {
  console.log(JSON.stringify({ event: "SMTP_SINK_STOPPING", received: sink.messages }));
  sink.server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

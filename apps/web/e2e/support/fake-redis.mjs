import net from "node:net";

/**
 * Redis mínimo **en memoria** para el E2E con sesión (A5 · Fase 4).
 *
 * Por qué: la suite de Playwright es hermética (sin PostgreSQL, sin Redis real). Hasta ahora todas
 * las rutas se probaban **sin sesión**, así que el guard fallaba en cerrado antes de tocar Redis.
 * Para probar flujos con wallet y sesión de back-office hay que verificar el JWT y su blocklist, y
 * `AuthService.verifyAccessToken` consulta Redis (`EXISTS hotel:jwt:blocklist:<jti>`). Este servidor
 * implementa solo la superficie RESP que usa `ioredis` en ese camino (`HELLO`, `CLIENT SETINFO`,
 * `INFO`, `PING`, `EXISTS`, `GET`, `SET [EX|PX]`, `DEL`, `TTL`, `EXPIRE`, `QUIT`); cualquier comando
 * desconocido responde `+OK`, igual que una instancia sana para los comandos que no inspecciona.
 *
 * NO es un Redis de producción: no persiste, no tiene autenticación y escucha solo en 127.0.0.1.
 * Se arranca desde `start-web.mjs`, que es el `command` del `webServer` de Playwright.
 */

const store = new Map();

function live(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry;
}

function bulk(value) {
  return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
}

/** Ejecuta un comando RESP ya parseado y devuelve la respuesta cruda. */
function execute(args) {
  const command = (args[0] ?? "").toLowerCase();
  switch (command) {
    case "ping":
      return "+PONG\r\n";
    case "hello":
    case "client":
    case "auth":
      return "+OK\r\n";
    case "info":
      return bulk("");
    case "exists": {
      let found = 0;
      for (const key of args.slice(1)) if (live(key) !== undefined) found += 1;
      return `:${found}\r\n`;
    }
    case "get": {
      const entry = live(args[1]);
      return entry === undefined ? "$-1\r\n" : bulk(entry.value);
    }
    case "set": {
      const key = args[1];
      const value = args[2] ?? "";
      let expiresAt = null;
      for (let index = 3; index < args.length; index += 1) {
        const option = (args[index] ?? "").toLowerCase();
        if (option === "ex") {
          index += 1;
          expiresAt = Date.now() + Number(args[index] ?? "0") * 1000;
        } else if (option === "px") {
          index += 1;
          expiresAt = Date.now() + Number(args[index] ?? "0");
        }
      }
      store.set(key, { value, expiresAt });
      return "+OK\r\n";
    }
    case "setex": {
      const key = args[1];
      const ttlSeconds = Number(args[2] ?? "0");
      const value = args[3] ?? "";
      store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      return "+OK\r\n";
    }
    case "del": {
      let removed = 0;
      for (const key of args.slice(1)) if (store.delete(key)) removed += 1;
      return `:${removed}\r\n`;
    }
    case "ttl": {
      const entry = live(args[1]);
      if (entry === undefined) return ":-2\r\n";
      if (entry.expiresAt === null) return ":-1\r\n";
      return `:${Math.ceil((entry.expiresAt - Date.now()) / 1000)}\r\n`;
    }
    case "expire": {
      const entry = store.get(args[1]);
      if (!entry) return ":0\r\n";
      entry.expiresAt = Date.now() + Number(args[2] ?? "0") * 1000;
      return ":1\r\n";
    }
    case "quit":
      return "+OK\r\n";
    default:
      return "+OK\r\n";
  }
}

/** Lee un comando RESP del buffer. Devuelve `null` si aún falta contenido. */
function readCommand(buffer) {
  if (buffer.length === 0) return null;
  if (buffer[0] !== "*") {
    // Línea fuera de protocolo (p. ej. un `PING` inline): se descarta entera.
    const end = buffer.indexOf("\r\n");
    if (end === -1) return null;
    return { args: buffer.slice(0, end).split(" "), rest: buffer.slice(end + 2) };
  }
  const lineEnd = buffer.indexOf("\r\n");
  if (lineEnd === -1) return null;
  const count = Number(buffer.slice(1, lineEnd));
  if (!Number.isInteger(count) || count < 0) return null;
  let position = lineEnd + 2;
  const args = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer[position] !== "$") return null;
    const lengthEnd = buffer.indexOf("\r\n", position);
    if (lengthEnd === -1) return null;
    const length = Number(buffer.slice(position + 1, lengthEnd));
    const start = lengthEnd + 2;
    const end = start + length;
    if (buffer.length < end + 2) return null;
    args.push(buffer.slice(start, end));
    position = end + 2;
  }
  return { args, rest: buffer.slice(position) };
}

/**
 * Arranca el servidor en `port` (127.0.0.1) y resuelve con `{ port, close }`.
 * @param {number} port
 */
export function startFakeRedis(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      socket.setNoDelay(true);
      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        for (;;) {
          const parsed = readCommand(buffer);
          if (!parsed) break;
          buffer = parsed.rest;
          const command = (parsed.args[0] ?? "").toLowerCase();
          socket.write(execute(parsed.args));
          if (command === "quit") {
            socket.end();
            break;
          }
        }
      });
      socket.on("error", () => {});
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      resolve({
        port,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

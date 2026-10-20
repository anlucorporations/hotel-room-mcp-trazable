import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { startFakeRedis } from "./fake-redis.mjs";

/**
 * Arranque del `webServer` de Playwright para el E2E con **sesión y wallet** (A5 · Fase 4).
 *
 * El plugin `webServer` de Playwright lanza este script ANTES que los `globalSetup`, así que aquí
 * es donde puede nacer el Redis falso que el servidor de Next necesita para verificar el JWT
 * (`REDIS_URL` llega por `playwright.config.ts`). Después arranca `next start` sobre el build de
 * producción, hereda el entorno y reenvía la señal de parada para no dejar procesos huérfanos.
 *
 * Uso: `node e2e/support/start-web.mjs <puerto>` (Playwright lo invoca con `E2E_PORT`).
 */

const port = process.argv[2] ?? process.env.E2E_PORT ?? "3100";
const redisPort = Number(process.env.E2E_REDIS_PORT ?? "6390");
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const nextBin = path.join(webRoot, "node_modules", "next", "dist", "bin", "next");

const redis = await startFakeRedis(redisPort);
console.log(`[e2e] Redis falso escuchando en 127.0.0.1:${redisPort}`);

const child = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
  cwd: webRoot,
  env: process.env,
  stdio: "inherit",
});

let stopping = false;
async function stop(signal, code = 0) {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
  await redis.close().catch(() => {});
  // Deja que `next start` termine de cerrar antes de salir.
  setTimeout(() => process.exit(code), 1000).unref();
}

process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
child.on("exit", (code, signal) => {
  if (stopping) return;
  stopping = true;
  void redis.close().finally(() => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
});

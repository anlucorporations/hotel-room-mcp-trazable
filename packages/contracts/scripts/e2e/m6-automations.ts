import { createDecipheriv, createECDH, createPublicKey, createVerify, hkdfSync } from "node:crypto";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createTcpServer, type Server as TcpServer } from "node:net";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  formatEther,
  getAddress,
  http,
  parseAbiItem,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import {
  BurnerService,
  EventListenerService,
  NFTsRepository,
  NotificationQueueService,
  WebPushService,
  anvilChain,
  closeDbPool,
  closeRedisClient,
  generateVapidKeys,
  getDbPool,
  bufferToBase64Url,
  base64UrlToBuffer,
  type VapidKeys,
} from "@hotel/shared";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { ensureRoomsRegistered } from "../room-registry";
import { startBurnScheduler } from "../../../../apps/worker/src/burn-scheduler";
import { reconcileOnce, startEmailConsumer } from "../../../../apps/worker/src/email-consumer";
import { SmtpEmailSender } from "../../../../apps/worker/src/queued-mailer";
import { createSmtpTransporter } from "../../../../apps/worker/src/mailer";

/** Logger silencioso: el E2E solo habla por su propia salida. */
const logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

/**
 * E2E REAL del hito M6 (D-03, D-12) contra Anvil + PostgreSQL + Redis, con sumideros locales para
 * SMTP y push (sin servicios externos):
 *
 *   A. Índice desde la cadena: el `EventListenerService` (ahora cableado al runtime) alimenta la
 *      tabla `nfts` a partir del evento `Mint` — sin sembrar la fila a mano.
 *   B. Quema programada: se viaja en el tiempo de la cadena, el **planificador real**
 *      (`startBurnScheduler`) ejecuta el ciclo y se comprueba el recibo, el evento `Burn`, que la
 *      noche deja de existir y que la base queda en `BURNED`.
 *   C. Cola única de correo: el `BURN_EXECUTED` sale por la cola BullMQ, lo entrega el consumidor
 *      por SMTP **real** contra un sumidero local, y la fila pasa a `SENT`. Se prueba además la
 *      reconciliación de un `PENDING` atascado.
 *   D. Push real: se suscribe un «navegador» (claves P-256 propias) contra un servicio de push
 *      local que **verifica el JWT VAPID y descifra** el contenido (RFC 8291/8292).
 *   E. Alerta de silencio: el listener avisa a DevOps y la alerta queda en la cola única.
 *
 * Uso: `pnpm test:e2e:m6` (Anvil 81234 con el contrato desplegado, PostgreSQL y Redis levantados).
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const evidenceDir = resolve(repoRoot, "RepoTecnico", "evidencias");
const evidencePath = resolve(evidenceDir, "m6-e2e-anvil.json");

process.loadEnvFile(resolve(repoRoot, ".env"));

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name} en el entorno (.env de la raíz).`);
  return value;
}

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CONTRACT = getAddress(env("CONTRACT_ADDRESS"));
const ROOM = 108n;
const PRICE = parseEther("0.12");
const MINT_EVENT = parseAbiItem(
  "event Mint(uint256 indexed tokenId, uint256 indexed room, uint256 dateYYYYMMDD, string roomType, uint256 price)",
);
const BURN_EVENT = parseAbiItem("event Burn(uint256 indexed tokenId)");

const burnAccount: PrivateKeyAccount = privateKeyToAccount(env("BURNER_WALLET_PRIVATE_KEY") as Hex);
const minterAccount: PrivateKeyAccount = privateKeyToAccount(env("MINTER_RELAYER_PRIVATE_KEY") as Hex);
const publicClient = createPublicClient({ chain: anvilChain, transport: http(RPC_URL) }) as PublicClient;
const walletClient = createWalletClient({ account: burnAccount, chain: anvilChain, transport: http(RPC_URL) });

const evidence: Record<string, unknown> = {
  hito: "M6",
  premisa: "quema programada con evidencia, cola única de correo, push real y alerta de silencio (D-03, D-12)",
  fecha: new Date().toISOString(),
  red: { chainId: anvilChain.id, rpc: RPC_URL, contrato: CONTRACT, operadorQuema: burnAccount.address },
  transacciones: {} as Record<string, string>,
  comprobaciones: [] as string[],
};

const ok = (message: string): void => {
  (evidence.comprobaciones as string[]).push(message);
  console.log(`  OK  ${message}`);
};
const expect = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`Aserción fallida: ${message}`);
  ok(message);
};
const record = (name: string, hash: Hex): void => {
  (evidence.transacciones as Record<string, string>)[name] = hash;
};

function yyyymmddInDays(days: number): bigint {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return BigInt(date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate());
}

const iso = (yyyymmdd: bigint): string => {
  const raw = yyyymmdd.toString();
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
};

/**
 * Fecha (AAAAMMDD) relativa al **reloj de la cadena**, no al de la máquina: el E2E viaja en el
 * tiempo para caducar noches, así que tras la primera ejecución el reloj de la cadena va por
 * delante del de la máquina y un mint calculado con `Date.now()` revertiría con `PastDate`.
 */
async function chainYyyymmddInDays(days: number): Promise<bigint> {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  const base = new Date(Number(block.timestamp) * 1000);
  base.setUTCDate(base.getUTCDate() + days);
  return BigInt(base.getUTCFullYear() * 10_000 + (base.getUTCMonth() + 1) * 100 + base.getUTCDate());
}

/** Sumideros locales abiertos por el guion: se cierran siempre, también al fallar. */
const openServers: { close: () => Promise<void> }[] = [];

async function send(signer: PrivateKeyAccount, data: Hex, value = 0n): Promise<Hex> {
  const client = createWalletClient({ account: signer, chain: anvilChain, transport: http(RPC_URL) });
  const hash = await client.sendTransaction({ to: CONTRACT, data, value });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`La transacción ${hash} revirtió`);
  return hash;
}

/** Sumidero SMTP local: acepta la sesión y captura el mensaje (verificación real de la entrega). */
function startSmtpSink(): Promise<{ port: number; messages: string[]; close: () => Promise<void> }> {
  const messages: string[] = [];
  const server: TcpServer = createTcpServer((socket) => {
    let inData = false;
    let buffer = "";
    socket.write("220 sumidero SMTP listo\r\n");
    socket.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      if (inData) {
        buffer += text;
        if (buffer.includes("\r\n.\r\n")) {
          inData = false;
          messages.push(buffer);
          buffer = "";
          socket.write("250 OK mensaje aceptado\r\n");
        }
        return;
      }
      for (const line of text.split("\r\n").filter(Boolean)) {
        if (line.startsWith("EHLO") || line.startsWith("HELO")) socket.write("250-sumidero\r\n250 OK\r\n");
        else if (line.startsWith("MAIL FROM") || line.startsWith("RCPT TO")) socket.write("250 OK\r\n");
        else if (line.startsWith("DATA")) {
          inData = true;
          socket.write("354 Envía el mensaje\r\n");
        } else if (line.startsWith("QUIT")) {
          socket.write("221 Adiós\r\n");
          socket.end();
        } else socket.write("250 OK\r\n");
      }
    });
  });

  return new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolvePromise({
        port,
        messages,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

/** Descifrado independiente del marco `aes128gcm` (el «navegador» del sumidero de push). */
function decryptPush(body: Buffer, uaPrivate: Buffer, authSecret: Buffer): string {
  const salt = body.subarray(0, 16);
  const idlen = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idlen);
  const ciphertext = body.subarray(21 + idlen);

  const ua = createECDH("prime256v1");
  ua.setPrivateKey(uaPrivate);
  const shared = ua.computeSecret(asPublic);
  const info = Buffer.concat([Buffer.from("WebPush: info\0", "utf8"), ua.getPublicKey(), asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, info, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));

  const tag = ciphertext.subarray(ciphertext.length - 16);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  return plain.subarray(0, plain.length - 1).toString("utf8");
}

/** Servicio de push local: verifica el JWT VAPID y descifra la carga. */
function startPushSink(vapid: VapidKeys): Promise<{ endpoint: string; received: unknown[]; close: () => Promise<void> }> {
  const received: unknown[] = [];
  const server: HttpServer = createHttpServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const auth = String(req.headers.authorization ?? "");
        const match = /vapid t=([^,]+), k=([^\s]+)/.exec(auth);
        if (!match) {
          res.writeHead(401).end("sin VAPID");
          return;
        }
        const [header, payload, signature] = match[1]!.split(".");
        const publicKey = createPublicKey({
          key: Buffer.concat([
            Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex"),
            base64UrlToBuffer(match[2]!),
          ]),
          format: "der",
          type: "spki",
        });
        const verifier = createVerify("SHA256");
        verifier.update(`${header}.${payload}`);
        if (!verifier.verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, base64UrlToBuffer(signature!))) {
          res.writeHead(401).end("JWT inválido");
          return;
        }
        received.push(JSON.parse(decryptPush(Buffer.concat(chunks), browserPrivate, authSecret)));
        res.writeHead(201).end();
      } catch (error) {
        res.writeHead(500).end(String(error));
      }
    });
  });

  const browser = createECDH("prime256v1");
  browser.generateKeys();
  browserPrivate = browser.getPrivateKey();
  browserPublic = browser.getPublicKey();

  return new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolvePromise({
        endpoint: `http://127.0.0.1:${port}/push/m6`,
        received,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

let browserPrivate: Buffer;
let browserPublic: Buffer;
const authSecret = Buffer.from("m6-auth-secret-16");

async function main(): Promise<void> {
  console.log(`\n=== E2E M6 real sobre Anvil ${anvilChain.id} — contrato ${CONTRACT} ===`);

  // F8 · D-10/D-13: el registro arranca vacío y mint lo exige. Firma la cuenta 1
  // (MINTER_RELAYER_PRIVATE_KEY), la cuenta administradora del entorno.
  const adminWallet = createWalletClient({ account: minterAccount, chain: anvilChain, transport: http(RPC_URL) });
  await ensureRoomsRegistered({ publicClient, admin: adminWallet, contract: CONTRACT, onLog: (m) => console.log(m) });

  const nftsRepo = new NFTsRepository();
  const notificationQueue = new NotificationQueueService();
  const pool = getDbPool();

  expect((await publicClient.getChainId()) === anvilChain.id, "La cadena responde y es la esperada");
  const burnerRole = (await publicClient.readContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName: "BURNER_ROLE",
  })) as Hex;
  expect(
    (await publicClient.readContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "hasRole",
      args: [burnerRole, burnAccount.address],
    })) as boolean,
    "El operador de quema tiene BURNER_ROLE en el contrato canónico",
  );

  // ── A. Índice desde la cadena (listener cableado) ────────────────────────────────────────────
  const date = await chainYyyymmddInDays(35);
  const tokenId = ROOM * 100_000_000n + date;
  try {
    await publicClient.readContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "ownerOf",
      args: [tokenId],
    });
  } catch {
    const mintHash = await send(
      minterAccount,
      encodeFunctionData({
        abi: hotelNightsAbi,
        functionName: "mint",
        args: [ROOM, date, PRICE, "ipfs://m6-e2e"],
      }),
    );
    record("mint", mintHash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: mintHash });
    const mintLog = receipt.logs
      .map((log) => {
        try {
          return decodeEventLog({ abi: [MINT_EVENT], data: log.data, topics: log.topics });
        } catch {
          return null;
        }
      })
      .find((decoded) => decoded?.eventName === "Mint");
    expect(Boolean(mintLog), "Noche minteada para el E2E (inventario impago del hotel)");
  }

  const listener = new EventListenerService(
    { nftAddress: CONTRACT, reorgConfirmations: 1, silenceThresholdMs: 600_000 },
    nftsRepo,
    notificationQueue,
    publicClient,
  );
  const head = await publicClient.getBlockNumber();
  await listener.reconcileLogsChunked(publicClient, head - 20n > 0n ? head - 20n : 0n, head);
  await listener.onNewBlock(head);
  await listener.processStagedEvents(head + 1n);

  const indexed = await nftsRepo.getNFTById(tokenId.toString());
  expect(
    indexed !== null && indexed.status === "AVAILABLE",
    "El listener escribió la fila del índice desde el evento Mint (sin sembrarla a mano)",
  );

  // ── B. Quema programada ──────────────────────────────────────────────────────────────────────
  await publicClient.request({ method: "evm_increaseTime", params: [40 * 86_400] } as never);
  await publicClient.request({ method: "evm_mine", params: [] } as never);
  const latestBlock = await publicClient.getBlock({ blockTag: "latest" });
  const chainNow = new Date(Number(latestBlock.timestamp) * 1000);
  ok(`Cadena viajada en el tiempo: ahora es ${chainNow.toISOString()} (la noche queda caducada)`);

  const burnService = new BurnerService(nftsRepo, notificationQueue, { now: () => chainNow });
  let schedulerResult: Awaited<ReturnType<typeof burnService.executeScheduledBurn>> | null = null;
  const scheduler = startBurnScheduler({
    service: burnService,
    publicClient,
    walletClient,
    options: {
      nftContractAddress: CONTRACT,
      operatorAddress: burnAccount.address,
      minBalanceNative: 0.5,
      devopsEmail: process.env.DEVOPS_ALERT_EMAIL ?? "devops@hotel.es",
    },
    logger: logger as never,
    signal: new AbortController().signal,
    now: () => chainNow,
    forceIntervalMs: 60_000,
    checkIntervalMs: 60_000,
  });
  schedulerResult = await scheduler.runOnce();
  scheduler.stop();

  expect(schedulerResult?.reason === "COMPLETED", `El planificador ejecutó la quema (${schedulerResult?.reason})`);
  expect((schedulerResult?.burnedTokensCount ?? 0) >= 1, `Noches quemadas: ${schedulerResult?.burnedTokensCount}`);
  const burnHash = schedulerResult?.txHashes[0];
  expect(Boolean(burnHash), "El planificador devolvió el hash de la quema");
  record("burnExpired", burnHash!);

  const burnReceipt = await publicClient.waitForTransactionReceipt({ hash: burnHash! });
  expect(burnReceipt.status === "success", "El recibo de la quema confirma la transacción");
  const burnEvent = burnReceipt.logs
    .map((log) => {
      try {
        return decodeEventLog({ abi: [BURN_EVENT], data: log.data, topics: log.topics });
      } catch {
        return null;
      }
    })
    .find((decoded) => decoded?.eventName === "Burn");
  expect(Boolean(burnEvent), "Evento Burn emitido por el contrato canónico");
  expect(
    (await publicClient.readContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "ownerOf",
      args: [tokenId],
    }).catch(() => null)) === null,
    "La noche quemada ya no existe on-chain (ownerOf revierte)",
  );
  const afterBurn = await nftsRepo.getNFTById(tokenId.toString());
  expect(afterBurn?.status === "BURNED", "El índice off-chain queda en BURNED tras confirmar la quema");

  // ── C. Cola única de correo (sumidero SMTP local) ────────────────────────────────────────────
  const smtp = await startSmtpSink();
  openServers.push(smtp);
  const consumer = startEmailConsumer({
    queue: notificationQueue,
    sender: new SmtpEmailSender(
      createSmtpTransporter({
        host: "127.0.0.1",
        port: smtp.port,
        user: "sumidero",
        pass: "",
        from: "Hotel Marina del Sol <reservas@hotelmarinadelsol.es>",
        to: "devops@hotel.es",
      }),
      "Hotel Marina del Sol <reservas@hotelmarinadelsol.es>",
    ),
    logger: logger as never,
  });

  const { rows: burnRows } = await pool.query(
    "SELECT id, status FROM email_notifications WHERE event_type = 'BURN_EXECUTED' ORDER BY created_at DESC LIMIT 1",
  );
  const pending = burnRows[0] as { id: string; status: string } | undefined;
  expect(Boolean(pending), "La quema encoló el aviso BURN_EXECUTED en la cola única (fila PENDING)");

  // Espera a que el consumidor entregue (SMTP local) y la fila pase a SENT.
  let delivered = false;
  for (let attempt = 0; attempt < 40 && !delivered; attempt += 1) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    const { rows } = await pool.query("SELECT status FROM email_notifications WHERE id = $1", [pending!.id]);
    delivered = rows[0]?.status === "SENT";
  }
  expect(delivered, "El consumidor entregó el correo y la fila pasó a SENT");
  expect(
    smtp.messages.some((message) => message.includes("Quema programada")),
    "El sumidero SMTP recibió el aviso de quema (entrega real por SMTP)",
  );
  await consumer.stop();
  await smtp.close();

  // Reconciliación: una fila PENDING antigua vuelve a la cola.
  await pool.query(
    `INSERT INTO email_notifications (event_type, recipient_email, payload, status, attempts, created_at)
     VALUES ('DEVOPS_ALERT', 'devops@hotel.es', '{"subject":"reconciliación"}', 'PENDING', 0, NOW() - INTERVAL '10 minutes')`,
  );
  const reEnqueued = await reconcileOnce(notificationQueue, logger as never, 5);
  expect(reEnqueued >= 1, `La reconciliación re-encoló ${reEnqueued} notificación(es) PENDING atascada(s)`);

  // ── D. Push real (servicio de push local que descifra) ───────────────────────────────────────
  const vapid = generateVapidKeys();
  const pushSink = await startPushSink({ ...vapid, subject: "mailto:devops@hotel.es" });
  openServers.push(pushSink);
  await nftsRepo.addPushSubscription(pushSink.endpoint, bufferToBase64Url(browserPublic), bufferToBase64Url(authSecret));

  const pushService = new WebPushService(nftsRepo);
  const broadcast = await pushService.broadcastNotification({
    title: "Noche vendida",
    body: "Habitación 108 · E2E M6",
    url: "/historico",
  });
  expect(broadcast.sent >= 1, `Push entregado al servicio de push (enviados: ${broadcast.sent})`);
  expect(
    pushSink.received.some((payload) => JSON.stringify(payload).includes("Habitación 108")),
    "El servicio de push verificó el JWT VAPID y descifró el contenido (RFC 8291/8292)",
  );
  await nftsRepo.removePushSubscription(pushSink.endpoint);
  await pushSink.close();

  // ── E. Alerta de silencio ────────────────────────────────────────────────────────────────────
  const silentListener = new EventListenerService(
    { nftAddress: CONTRACT, silenceThresholdMs: 20 },
    nftsRepo,
    notificationQueue,
    publicClient,
  );
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 40));
  expect(await silentListener.checkSilenceAlert(), "El listener detecta el silencio y avisa (alerta disparada)");
  const alerts = await pool.query(
    "SELECT COUNT(*)::int AS total FROM email_notifications WHERE event_type = 'DEVOPS_ALERT' AND payload->>'subject' LIKE '%Silencio%'",
  );
  expect(alerts.rows[0].total >= 1, "La alerta de silencio quedó encolada en la cola única de correo");

  // ── Evidencia ───────────────────────────────────────────────────────────────────────────────
  evidence.resultado = "COMPLETO";
  evidence.noche = { tokenId: tokenId.toString(), room: ROOM.toString(), date: iso(date), priceWei: PRICE.toString() };
  evidence.quema = {
    reason: schedulerResult?.reason,
    nochesQuemadas: schedulerResult?.burnedTokensCount,
    hash: burnHash,
  };
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  console.log(`\n=== M6 E2E COMPLETO — ${(evidence.comprobaciones as string[]).length} comprobaciones ===`);
  console.log(`Evidencia: ${evidencePath}`);
  for (const [name, hash] of Object.entries(evidence.transacciones as Record<string, string>)) {
    console.log(`  ${name.padEnd(14)} ${hash}`);
  }
}

main()
  .then(async () => {
    for (const server of openServers) await server.close().catch(() => undefined);
    await closeRedisClient().catch(() => undefined);
    await closeDbPool().catch(() => undefined);
    setTimeout(() => process.exit(0), 100).unref();
  })
  .catch(async (error: unknown) => {
    console.error(`\nE2E M6 FALLIDO: ${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
    for (const server of openServers) await server.close().catch(() => undefined);
    await closeRedisClient().catch(() => undefined);
    await closeDbPool().catch(() => undefined);
    setTimeout(() => process.exit(1), 100).unref();
  });

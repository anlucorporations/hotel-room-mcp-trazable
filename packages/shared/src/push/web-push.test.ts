import { createDecipheriv, createECDH, createVerify, hkdfSync } from "node:crypto";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  base64UrlToBuffer,
  bufferToBase64Url,
  createVapidJwt,
  encryptPushPayload,
  generateVapidKeys,
  sendWebPush,
  vapidPublicKeyObject,
  type VapidKeys,
} from "./web-push";
import { WebPushService } from "./service";

/**
 * Push real (D-03): el estado auditado «enviaba» incrementando un contador.
 *
 * Estas pruebas hacen un viaje completo de ida y vuelta: se cifra con la implementación de
 * producción (RFC 8291), se entrega por HTTP con VAPID (RFC 8292) a un **servicio de push local**
 * que verifica la firma del JWT, **descifra** el cuerpo con las claves del navegador y comprueba el
 * mensaje. Si el marco `aes128gcm`, la derivación de claves o el JWT estuvieran mal, el descifrado
 * falla.
 */

/** Par de claves del «navegador» (lo que el navegador genera al suscribirse). */
function browserSubscription(endpoint: string) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    ecdh,
    subscription: {
      endpoint,
      p256dh: bufferToBase64Url(ecdh.getPublicKey()),
      auth: bufferToBase64Url(Buffer.from("0123456789abcdef")),
    },
  };
}

const hkdf = (ikm: Buffer, salt: Buffer, info: string | Buffer, length: number): Buffer =>
  Buffer.from(
    hkdfSync("sha256", ikm, salt, typeof info === "string" ? Buffer.from(info, "utf8") : info, length),
  );

/** Descifrado independiente del marco `aes128gcm` (RFC 8291 §2). */
function decryptPushBody(body: Buffer, uaPrivate: Buffer, authSecret: Buffer): string {
  const salt = body.subarray(0, 16);
  const idlen = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idlen);
  const ciphertext = body.subarray(21 + idlen);

  const ua = createECDH("prime256v1");
  ua.setPrivateKey(uaPrivate);
  const sharedSecret = ua.computeSecret(asPublic);

  const uaPublic = ua.getPublicKey();
  const inputKeyMaterial = hkdf(
    sharedSecret,
    authSecret,
    Buffer.concat([Buffer.from("WebPush: info\0", "utf8"), uaPublic, asPublic]),
    32,
  );
  const cek = hkdf(inputKeyMaterial, salt, "Content-Encoding: aes128gcm\0", 16);
  const nonce = hkdf(inputKeyMaterial, salt, "Content-Encoding: nonce\0", 12);

  const tag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  // El último byte es el delimitador (0x02 = sin relleno).
  return plaintext.subarray(0, plaintext.length - 1).toString("utf8");
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

describe("VAPID (RFC 8292)", () => {
  it("genera un par P-256 válido y firma un JWT ES256 verificable", () => {
    const keys = generateVapidKeys();
    const jwt = createVapidJwt("https://push.example.test", "mailto:devops@hotel.es", {
      ...keys,
      subject: "mailto:devops@hotel.es",
    });

    const [header, payload, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString("utf8"))).toEqual({
      typ: "JWT",
      alg: "ES256",
    });

    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
    expect(claims.aud).toBe("https://push.example.test");
    expect(claims.sub).toBe("mailto:devops@hotel.es");
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const verifier = createVerify("SHA256");
    verifier.update(`${header}.${payload}`);
    const valid = verifier.verify(
      { key: vapidPublicKeyObject(keys.publicKey), dsaEncoding: "ieee-p1363" },
      base64UrlToBuffer(signature!),
    );
    expect(valid).toBe(true);
  });

  it("rechaza claves con longitud incorrecta", () => {
    expect(() => vapidPublicKeyObject(bufferToBase64Url(Buffer.alloc(10)))).toThrow(/65 bytes/);
  });
});

describe("cifrado aes128gcm (RFC 8291)", () => {
  it("el navegador descifra exactamente el mensaje enviado", () => {
    const { ecdh, subscription } = browserSubscription("https://push.example.test/sub/1");
    const payload = { title: "Tu noche se ha vendido", body: "Habitación 101", url: "/mis-noches" };

    const { body, headers } = encryptPushPayload(payload, subscription);
    expect(headers["Content-Encoding"]).toBe("aes128gcm");

    const decrypted = decryptPushBody(body, ecdh.getPrivateKey(), Buffer.from("0123456789abcdef"));
    expect(JSON.parse(decrypted)).toEqual(payload);
  });

  it("rechaza una suscripción sin p256dh válido", () => {
    expect(() =>
      encryptPushPayload({ title: "x" }, { endpoint: "https://e.test", p256dh: "AAAA", auth: "AAAA" }),
    ).toThrow(/p256dh/);
  });
});

describe("envío real a un servicio de push local", () => {
  it("entrega el push con VAPID y el servicio descifra el contenido", async () => {
    const keys = generateVapidKeys();
    const vapid: VapidKeys = { ...keys, subject: "mailto:devops@hotel.es" };
    const authSecret = Buffer.from("0123456789abcdef");

    // El «navegador» se suscribe primero: su clave privada es la que descifra.
    const { ecdh, subscription } = browserSubscription("http://127.0.0.1:0/push/abc");
    const browserPrivate = ecdh.getPrivateKey();

    const received: { jwtAudience?: string; payload?: unknown } = {};

    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        try {
          const auth = String(req.headers.authorization ?? "");
          const match = /vapid t=([^,]+), k=([^\s]+)/.exec(auth);
          if (!match || match[2] !== vapid.publicKey) {
            res.writeHead(401).end();
            return;
          }
          const [header, payload, signature] = match[1]!.split(".");
          const verifier = createVerify("SHA256");
          verifier.update(`${header}.${payload}`);
          const jwtValid = verifier.verify(
            { key: vapidPublicKeyObject(vapid.publicKey), dsaEncoding: "ieee-p1363" },
            base64UrlToBuffer(signature!),
          );
          if (!jwtValid) {
            res.writeHead(401).end();
            return;
          }
          received.jwtAudience = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")).aud;
          received.payload = JSON.parse(
            decryptPushBody(Buffer.concat(chunks), browserPrivate, authSecret),
          );
          res.writeHead(201).end();
        } catch (error) {
          res.writeHead(500).end(String(error));
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    // El endpoint real incluye el puerto asignado.
    const endpoint = `http://127.0.0.1:${port}/push/abc`;
    const result = await sendWebPush(
      { ...subscription, endpoint },
      { title: "Venta", body: "Habitación 102" },
      vapid,
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe(201);
    expect(received.jwtAudience).toBe(`http://127.0.0.1:${port}`);
    expect(received.payload).toEqual({ title: "Venta", body: "Habitación 102" });
  });

  it("una suscripción caducada (410) se marca para purgar", async () => {
    const keys = generateVapidKeys();
    const server = createServer((_req, res) => {
      res.writeHead(410).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const { subscription } = browserSubscription(`http://127.0.0.1:${port}/push/gone`);
    const result = await sendWebPush(subscription, { title: "x" }, { ...keys, subject: "mailto:a@b.c" });

    expect(result.ok).toBe(false);
    expect(result.subscriptionGone).toBe(true);
    expect(result.status).toBe(410);
  });
});

describe("WebPushService.broadcastNotification", () => {
  it("cuenta entregas, purga las caducadas y no miente con contadores", async () => {
    const keys = generateVapidKeys();
    const removed: string[] = [];
    const live = browserSubscription("https://push.test/ok").subscription;
    const gone = browserSubscription("https://push.test/gone").subscription;
    const repo = {
      getAllPushSubscriptions: vi
        .fn()
        .mockResolvedValue([
          { endpoint: live.endpoint, p256dh: live.p256dh, auth: live.auth },
          { endpoint: gone.endpoint, p256dh: gone.p256dh, auth: gone.auth },
        ]),
      removePushSubscription: vi.fn(async (endpoint: string) => {
        removed.push(endpoint);
      }),
    };

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("gone")) return new Response(null, { status: 410 });
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;

    const service = new WebPushService(repo as never, { fetchImpl });
    vi.spyOn(service, "getVapidConfig").mockReturnValue({
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      subject: "mailto:devops@hotel.es",
    });

    const result = await service.broadcastNotification({ title: "Venta", body: "Habitación 101" });

    expect(result).toEqual({ sent: 1, failed: 0, pruned: 1, total: 2 });
    expect(removed).toEqual(["https://push.test/gone"]);
  });
});

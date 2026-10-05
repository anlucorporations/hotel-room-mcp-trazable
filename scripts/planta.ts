/**
 * **@planta** — esquema de habitaciones del Hotel Marina del Sol (2026-10-05).
 *
 * Script **exclusivo de este proyecto**: crea la planta de habitaciones aprobada por el responsable
 * (plantas 1, 2, 3 y 4 · 3 dobles + 2 suites + 5 simples por planta) y registra en off-chain la
 * dirección de la foto de cada habitación para que la use el frontend.
 *
 * Uso (modo seco por defecto; nada se crea hasta `--apply`):
 *   pnpm --filter @hotel/shared exec tsx ../../scripts/planta.ts                 # plan
 *   pnpm --filter @hotel/shared exec tsx ../../scripts/planta.ts --apply         # ejecuta (confirma)
 *   pnpm --filter @hotel/shared exec tsx ../../scripts/planta.ts --apply --yes   # sin confirmación
 *   pnpm --filter @hotel/shared exec tsx ../../scripts/planta.ts --images-only   # solo las fotos
 *
 * Entorno:
 *   PLANTA_BASE_URL      (por defecto, la web de producción)
 *   ADMIN_USER · ADMIN_PASSWORD · ADMIN_TOTP_SECRET   credenciales del operador owner
 *
 * Cómo guarda la foto (decisión del responsable): se reutiliza **una imagen por tipo** de
 * `docs/imagenes/` (`101-Simple-…`, `116-Doble-…`, `201-Suite-…`) y se materializa con el **nombre
 * canónico** de cada habitación (`<nº>-<Tipo>-<AAAA-MM-DD>-1.jpg`), porque `room_images.file_name` es
 * UNIQUE y el servidor sirve las fotos desde esa carpeta. La fila de `room_images` (la «dirección
 * off-chain» que consume el frontend) se crea subiendo esa misma imagen por la API de administración.
 *
 * El script **no** publica las habitaciones: nacen en `DRAFT` para que publicar forme parte del
 * recorrido de casos de uso.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, appendFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { createHmac } from "node:crypto";

// ── Configuración ────────────────────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const IMAGES_DIR = path.join(REPO_ROOT, "docs", "imagenes");
const LOG_DIR = path.join(REPO_ROOT, ".deploy-logs");
const LOG_FILE = path.join(LOG_DIR, `planta-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.log`);

const BASE_URL = (process.env.PLANTA_BASE_URL ?? "https://hotel-mcp-web-d6jlzeq5yq-ew.a.run.app").replace(/\/$/, "");
const APPLY = process.argv.includes("--apply");
const ASSUME_YES = process.argv.includes("--yes");
const IMAGES_ONLY = process.argv.includes("--images-only");

type RoomType = "SIMPLE" | "DOBLE" | "SUITE";

/** Plantilla de cada tipo: todo lo que la ficha necesita, en un solo sitio. */
interface RoomTemplate {
  readonly type: RoomType;
  readonly label: "Simple" | "Doble" | "Suite";
  readonly capacity: number;
  readonly beds: number;
  readonly sizeM2: number;
  readonly baseRateEth: string;
  readonly viewKind: "SEA" | "GARDEN" | "INTERIOR";
  readonly hasBalcony: boolean;
  readonly decorStyle: "MEDITERRANEAN" | "CONTEMPORARY" | "CLASSIC" | "RUSTIC" | "MINIMAL";
  readonly decorPalette: string;
  readonly decorMaterials: string;
  readonly decorNotesEs: string;
  readonly amenityCodes: readonly string[];
  readonly spaces: ReadonlyArray<{ spaceCode: string; sizeM2: number }>;
  readonly descriptionEs: string;
  readonly descriptionEn: string;
  readonly descriptionRu: string;
  /** Imagen de origen en `docs/imagenes` (una por tipo, reutilizada). */
  readonly sourceImage: string;
}

/**
 * Plantillas aprobadas. Todas las habitaciones llevan **TV y aire acondicionado** (petición expresa).
 * Los servicios que la plataforma no sabe codificar (servicio a la habitación, escritorio de trabajo,
 * jacuzzi, iluminación graduable, vistas a la piscina) van **redactados** en la descripción, tal y como
 * se acordó con el responsable.
 */
const TEMPLATES: Readonly<Record<RoomType, RoomTemplate>> = {
  DOBLE: {
    type: "DOBLE",
    label: "Doble",
    capacity: 4,
    beds: 2,
    sizeM2: 26,
    baseRateEth: "0.1",
    viewKind: "INTERIOR",
    hasBalcony: true,
    decorStyle: "CONTEMPORARY",
    decorPalette: "Arena y azul suave",
    decorMaterials: "Roble claro, lino lavado y algodón",
    decorNotesEs: "Pensada para familias pequeñas: dos camas, balcón propio y una paleta luminosa que descansa la vista.",
    amenityCodes: ["WIFI", "AC", "TV", "PRIVATE_BATH", "BALCONY", "HEATING"],
    spaces: [
      { spaceCode: "DORMITORIO", sizeM2: 18 },
      { spaceCode: "BANO", sizeM2: 5 },
      { spaceCode: "TERRAZA", sizeM2: 3 },
    ],
    descriptionEs:
      "Habitación doble para familias pequeñas, con dos camas cómodas, baño individual, acceso a Wi-Fi de alta velocidad, balcón propio y servicio de comida a la habitación. Dispone de televisión y aire acondicionado, y un rincón de lectura junto a la ventana para las tardes tranquilas.",
    descriptionEn:
      "Double room for small families, with two comfortable beds, a private bathroom, high-speed Wi-Fi, its own balcony and in-room dining. It has a television and air conditioning, plus a reading corner by the window for quiet afternoons.",
    descriptionRu:
      "Двухместный номер для небольших семей: две удобные кровати, собственная ванная, высокоскоростной Wi-Fi, собственный балкон и обслуживание в номер. Есть телевизор и кондиционер, а у окна — уголок для чтения.",
    sourceImage: "116-Doble-2026-09-28-1.jpg",
  },
  SUITE: {
    type: "SUITE",
    label: "Suite",
    capacity: 2,
    beds: 1,
    sizeM2: 42,
    baseRateEth: "0.8",
    viewKind: "GARDEN",
    hasBalcony: true,
    decorStyle: "MEDITERRANEAN",
    decorPalette: "Marfil, bronce y verde oliva",
    decorMaterials: "Nogal, mármol pulido y algodón egipcio",
    decorNotesEs: "Suite de lujo para ejecutivos: salón separado, escritorio de trabajo y jacuzzi privado.",
    amenityCodes: ["WIFI", "AC", "TV", "PRIVATE_BATH", "BALCONY", "MINIBAR", "HEATING"],
    spaces: [
      { spaceCode: "DORMITORIO", sizeM2: 20 },
      { spaceCode: "SALON", sizeM2: 10 },
      { spaceCode: "BANO", sizeM2: 6 },
      { spaceCode: "TERRAZA", sizeM2: 4 },
    ],
    descriptionEs:
      "Suite de lujo pensada para ejecutivos: minibar, servicio a la habitación, escritorio de trabajo, cama king, jacuzzi privado y balcón con vistas a la piscina. Dispone además de televisión y aire acondicionado, salón separado para recibir visitas y un silencio cuidado para trabajar o descansar sin interrupciones.",
    descriptionEn:
      "Luxury suite designed for executives: minibar, room service, a work desk, a king bed, a private jacuzzi and a balcony overlooking the pool. It also includes a television and air conditioning, a separate living room for guests, and a carefully quiet atmosphere to work or rest undisturbed.",
    descriptionRu:
      "Люкс для руководителей: мини-бар, обслуживание в номер, рабочий стол, кровать king-size, собственный джакузи и балкон с видом на бассейн. Также есть телевизор и кондиционер, отдельная гостиная для встреч и тишина, располагающая к работе и отдыху.",
    sourceImage: "201-Suite-2026-09-28-1.jpg",
  },
  SIMPLE: {
    type: "SIMPLE",
    label: "Simple",
    capacity: 2,
    beds: 1,
    sizeM2: 18,
    baseRateEth: "0.06",
    viewKind: "INTERIOR",
    hasBalcony: false,
    decorStyle: "MINIMAL",
    decorPalette: "Blanco cálido y madera",
    decorMaterials: "Pino natural y algodón",
    decorNotesEs: "Habitación simple para parejas: íntima, silenciosa y con iluminación graduable.",
    amenityCodes: ["WIFI", "AC", "TV", "PRIVATE_BATH", "HEATING"],
    spaces: [
      { spaceCode: "DORMITORIO", sizeM2: 13 },
      { spaceCode: "BANO", sizeM2: 4 },
    ],
    descriptionEs:
      "Habitación simple para parejas, íntima y silenciosa, con televisión, iluminación graduable y baño privado. Incluye aire acondicionado y acceso a Wi-Fi, y un espacio de descanso cuidado al detalle para estancias cortas o escapadas de fin de semana.",
    descriptionEn:
      "Simple room for couples: intimate and quiet, with a television, dimmable lighting and a private bathroom. It includes air conditioning and Wi-Fi access, and a carefully detailed resting space for short stays or weekend getaways.",
    descriptionRu:
      "Простой номер для пар: уютный и тихий, с телевизором, регулируемым освещением и собственной ванной. Есть кондиционер и Wi-Fi, а также продуманное место для отдыха — для коротких поездок и выходных.",
    sourceImage: "101-Simple-2026-09-28-1.jpg",
  },
};

// ── Plan de habitaciones ─────────────────────────────────────────────────────────────────────────

/** Reparto dentro de cada planta: x01–x03 dobles · x04–x05 suites · x06–x10 simples. */
const FLOOR_LAYOUT: readonly RoomType[] = [
  "DOBLE", "DOBLE", "DOBLE", "SUITE", "SUITE",
  "SIMPLE", "SIMPLE", "SIMPLE", "SIMPLE", "SIMPLE",
];

/** Plantas aprobadas por el responsable. */
const FLOORS: readonly number[] = [1, 2, 3, 4];

interface RoomSpec {
  readonly roomNumber: number;
  readonly floor: number;
  readonly template: RoomTemplate;
  /** Nombre canónico del fichero de la foto (`<nº>-<Tipo>-<AAAA-MM-DD>-1.jpg`). */
  readonly imageFileName: string;
}

/** `AAAA-MM-DD` en UTC (el nombre de la foto usa la fecha de subida). */
function isoDay(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Nombre canónico de la foto. Espejo de `buildRoomImageFileName` de `apps/web/src/lib/room-images.ts`
 * (misma regla: `<nº>-<Simple|Doble|Suite>-<AAAA-MM-DD>-<1..5>.jpg`); se repite aquí para que el script
 * sea autónomo.
 */
function canonicalImageName(roomNumber: number, label: string, day: string, index: number): string {
  return `${roomNumber}-${label}-${day}-${index}.jpg`;
}

/** Las 40 habitaciones del plan. */
function buildPlan(day: string): RoomSpec[] {
  const plan: RoomSpec[] = [];
  for (const floor of FLOORS) {
    FLOOR_LAYOUT.forEach((type, index) => {
      const template = TEMPLATES[type];
      const roomNumber = floor * 100 + index + 1;
      plan.push({
        roomNumber,
        floor,
        template,
        imageFileName: canonicalImageName(roomNumber, template.label, day, 1),
      });
    });
  }
  return plan;
}

// ── Utilidades ───────────────────────────────────────────────────────────────────────────────────

function log(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, `${line}\n`, "utf8");
  } catch {
    // El registro es best-effort: no debe tumbar la inyección.
  }
}

async function confirm(question: string): Promise<boolean> {
  if (ASSUME_YES) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} (si/no): `)).trim().toLowerCase();
  rl.close();
  return answer === "si" || answer === "sí" || answer === "s" || answer === "yes" || answer === "y";
}

// ── Fase 1 · fotos en `docs/imagenes` ────────────────────────────────────────────────────────────

/**
 * Materializa **una copia por habitación** de la foto de su tipo, con el nombre canónico. Es
 * necesario porque `room_images.file_name` es UNIQUE y el servidor sirve el fichero por ese nombre;
 * la imagen de origen es la misma por tipo, tal y como pidió el responsable.
 */
function materializeImages(plan: readonly RoomSpec[]): { created: number; existing: number } {
  if (!existsSync(IMAGES_DIR)) throw new Error(`no existe la carpeta de imágenes: ${IMAGES_DIR}`);
  let created = 0;
  let existing = 0;
  for (const room of plan) {
    const source = path.join(IMAGES_DIR, room.template.sourceImage);
    const target = path.join(IMAGES_DIR, room.imageFileName);
    if (!existsSync(source)) throw new Error(`falta la imagen de origen: ${source}`);
    if (existsSync(target)) {
      existing += 1;
      continue;
    }
    copyFileSync(source, target);
    created += 1;
  }
  return { created, existing };
}

// ── Autenticación (TOTP y ETH→wei propios: el script no depende de librerías de la app) ─────────

/** Decodifica base32 (RFC 4648) a bytes. */
function base32Decode(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = secret.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = "";
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error("semilla TOTP con caracteres no válidos");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** Código TOTP de 6 dígitos (RFC 6238, SHA-1, paso de 30 s). */
function totp(secret: string, now: number = Date.now()): string {
  const counter = Math.floor(now / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code = ((digest[offset]! & 0x7f) << 24 | digest[offset + 1]! << 16 | digest[offset + 2]! << 8 | digest[offset + 3]!) % 1_000_000;
  return String(code).padStart(6, "0");
}

/** ETH decimal («0.06») a wei como cadena, sin coma flotante. */
function ethToWei(amount: string): string {
  const [whole = "0", fraction = ""] = amount.split(".");
  const padded = (fraction + "0".repeat(18)).slice(0, 18);
  return (BigInt(whole) * 10n ** 18n + BigInt(padded || "0")).toString();
}

// ── Red: reintento con retroceso y ritmo pausado ────────────────────────────────────────────────

/** Espera `ms` milisegundos. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `fetch` con reintento exponencial ante **429** (límite del borde/WAF) y 5xx. El alta de 40
 * habitaciones en ráfaga dispara el límite: sin esto el script se corta a mitad (observado el
 * 2026-10-05 con HTTP 429 «Edge WAF Rate Limit»).
 */
async function requestWithRetry(url: string, init: RequestInit, label: string, attempts = 5): Promise<Response> {
  let delay = 2000;
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status < 500) return res;
    if (attempt >= attempts) return res;
    log(`  … ${label}: HTTP ${res.status} · reintento ${attempt}/${attempts - 1} en ${delay} ms`);
    await sleep(delay + Math.floor(Math.random() * 500));
    delay *= 2;
  }
}

// ── Fase 2 · alta por la API de administración ───────────────────────────────────────────────────

interface Session {
  readonly cookie: string;
}

/** Login con contraseña + TOTP (doble factor) y captura de la cookie de sesión. */
async function login(baseUrl: string, user: string, password: string, secret: string): Promise<Session> {
  const loginRes = await requestWithRetry(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password }),
  }, "login");
  const loginData = (await loginRes.json().catch(() => ({}))) as { sessionToken?: string; message?: string; error?: string };
  if (!loginRes.ok || !loginData.sessionToken) {
    throw new Error(`login falló (HTTP ${loginRes.status}): ${loginData.message ?? loginData.error ?? "sin detalle"}`);
  }

  const mfaRes = await requestWithRetry(`${baseUrl}/api/auth/mfa/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionToken: loginData.sessionToken, totpCode: totp(secret) }),
  }, "mfa");
  const mfaData = (await mfaRes.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!mfaRes.ok) throw new Error(`MFA falló (HTTP ${mfaRes.status}): ${mfaData.message ?? mfaData.error ?? "sin detalle"}`);

  const cookie = (mfaRes.headers.getSetCookie?.() ?? []).map((value) => value.split(";")[0]).join("; ");
  if (!cookie) throw new Error("la verificación MFA no devolvió cookie de sesión");
  return { cookie };
}

/** Cuerpo del alta, tal y como lo espera `POST /api/admin/rooms`. */
function roomPayload(spec: RoomSpec): Record<string, unknown> {
  const t = spec.template;
  return {
    roomNumber: spec.roomNumber,
    floor: spec.floor,
    roomType: t.type,
    capacity: t.capacity,
    beds: t.beds,
    sizeM2: t.sizeM2,
    descriptionEs: t.descriptionEs,
    descriptionEn: t.descriptionEn,
    descriptionRu: t.descriptionRu,
    baseRateWei: ethToWei(t.baseRateEth),
    viewKind: t.viewKind,
    hasBalcony: t.hasBalcony,
    isAccessible: false,
    decorStyle: t.decorStyle,
    decorPalette: t.decorPalette,
    decorMaterials: t.decorMaterials,
    decorNotesEs: t.decorNotesEs,
    amenityCodes: [...t.amenityCodes],
    spaces: t.spaces.map((space, index) => ({ ...space, sortOrder: index + 1 })),
  };
}

/**
 * Números de habitación que ya existen (una sola petición).
 *
 * Es clave para el ritmo: si se intentara crear cada una de las 40 y 37 devolvieran 409, esos 37
 * rechazos consumen la cuota del límite del borde y la petición siguiente recibe 429 (observado el
 * 2026-10-05). Consultando primero, solo se envían las altas que faltan de verdad.
 */
async function fetchExistingRoomNumbers(baseUrl: string, session: Session): Promise<Set<number>> {
  const res = await requestWithRetry(`${baseUrl}/api/admin/rooms`, { headers: { cookie: session.cookie } }, "listado");
  if (!res.ok) throw new Error(`no se pudo leer el listado de habitaciones (HTTP ${res.status})`);
  const data = (await res.json().catch(() => ({}))) as { rooms?: Array<{ roomNumber: number }> };
  return new Set((data.rooms ?? []).map((room) => room.roomNumber));
}

/** Crea la habitación. Devuelve su id, o `null` si el número ya existía. */
async function createRoom(baseUrl: string, session: Session, spec: RoomSpec): Promise<string | null> {
  const res = await requestWithRetry(`${baseUrl}/api/admin/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: session.cookie },
    body: JSON.stringify(roomPayload(spec)),
  }, `alta ${spec.roomNumber}`);
  const data = (await res.json().catch(() => ({}))) as { room?: { id: string }; message?: string; error?: string };
  if (res.status === 409) {
    log(`  · ${spec.roomNumber} ya existe, se omite`);
    return null;
  }
  if (!res.ok || !data.room?.id) {
    throw new Error(`alta de ${spec.roomNumber} falló (HTTP ${res.status}): ${data.message ?? data.error ?? "sin detalle"}`);
  }
  return data.room.id;
}

/** Sube la foto de la habitación: crea la fila de `room_images` que consume el frontend. */
async function uploadPhoto(baseUrl: string, session: Session, roomId: string, spec: RoomSpec): Promise<void> {
  const filePath = path.join(IMAGES_DIR, spec.imageFileName);
  const bytes = readFileSync(filePath);
  if (bytes.byteLength === 0 || bytes.byteLength > 2 * 1024 * 1024) {
    throw new Error(`la foto ${spec.imageFileName} no cabe en el límite de 2 MB`);
  }
  const form = new FormData();
  form.set("file", new Blob([bytes], { type: "image/jpeg" }), spec.imageFileName);
  form.set("altTextEs", `Habitación ${spec.roomNumber} · ${spec.template.label}`);
  form.set("altTextEn", `Room ${spec.roomNumber} · ${spec.template.label}`);
  form.set("altTextRu", `Номер ${spec.roomNumber} · ${spec.template.label}`);

  const res = await requestWithRetry(`${baseUrl}/api/admin/rooms/${roomId}/images`, {
    method: "POST",
    headers: { cookie: session.cookie },
    body: form,
  }, `foto ${spec.roomNumber}`);
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    throw new Error(`foto de ${spec.roomNumber} falló (HTTP ${res.status}): ${data.message ?? data.error ?? "sin detalle"}`);
  }
}

// ── Flujo principal ─────────────────────────────────────────────────────────────────────────────

/** Resumen legible del plan (plantas y tipos). */
function summarize(plan: readonly RoomSpec[]): string {
  const byType = new Map<string, number>();
  const byFloor = new Map<number, number>();
  for (const room of plan) {
    byType.set(room.template.type, (byType.get(room.template.type) ?? 0) + 1);
    byFloor.set(room.floor, (byFloor.get(room.floor) ?? 0) + 1);
  }
  const floors = [...byFloor.entries()].map(([floor, count]) => `planta ${floor}: ${count}`).join(" · ");
  const types = [...byType.entries()].map(([type, count]) => `${count} ${type}`).join(" · ");
  return `${floors} || ${types}`;
}

async function main(): Promise<void> {
  const day = isoDay(new Date());
  const plan = buildPlan(day);
  log(`@planta · ${plan.length} habitaciones · ${summarize(plan)}`);
  log(`destino: ${BASE_URL}${APPLY ? "" : "  (MODO SECO: no se crea nada)"}`);

  if (!APPLY && !IMAGES_ONLY) {
    for (const room of plan) {
      log(`  ${room.roomNumber} · planta ${room.floor} · ${room.template.type} · ${room.template.baseRateEth} ETH · ${room.imageFileName}`);
    }
    log("MODO SECO: revisa el plan y añade --apply para ejecutarlo.");
    return;
  }

  const confirmed = await confirm(
    IMAGES_ONLY
      ? `¿Materializar ${plan.length} fotos en docs/imagenes?`
      : `¿Crear ${plan.length} habitaciones en ${BASE_URL} y subir sus fotos?`,
  );
  if (!confirmed) {
    log("cancelado por el usuario");
    return;
  }

  // — Fase 1: fotos con el nombre canónico de cada habitación —
  const images = materializeImages(plan);
  log(`fotos: ${images.created} creadas · ${images.existing} ya existían`);
  if (IMAGES_ONLY) return;

  // — Fase 2: alta por la API de administración (validada y auditada) —
  const user = process.env.ADMIN_USER;
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_TOTP_SECRET;
  if (!user || !password || !secret) {
    throw new Error("faltan ADMIN_USER, ADMIN_PASSWORD o ADMIN_TOTP_SECRET en el entorno");
  }
  const session = await login(BASE_URL, user, password, secret);
  log("sesión iniciada (contraseña + TOTP)");

  const existing = await fetchExistingRoomNumbers(BASE_URL, session);
  const pending = plan.filter((room) => !existing.has(room.roomNumber));
  const alreadyThere = plan.length - pending.length;
  log(`ya existían ${alreadyThere} · por crear ${pending.length}`);

  let created = 0;
  let skipped = alreadyThere;
  let photos = 0;
  for (const room of pending) {
    const roomId = await createRoom(BASE_URL, session, room);
    if (!roomId) {
      skipped += 1;
      continue;
    }
    created += 1;
    await uploadPhoto(BASE_URL, session, roomId, room);
    photos += 1;
    log(`  ✓ ${room.roomNumber} (${room.template.type}) con su foto`);
    await sleep(600); // ritmo pausado: evita el límite del borde con 40 altas seguidas
  }

  log(`resumen: ${created} creadas · ${skipped} omitidas · ${photos} fotos`);
  log(`registro en ${LOG_FILE}`);
}

await main();

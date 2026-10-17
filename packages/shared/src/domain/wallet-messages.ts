import { decodeTokenId } from "./token-id";
import { roomTypeOf } from "./room-master";
import type { NightType } from "./types";

/**
 * Mensajes que la **wallet** muestra al huésped u operador al firmar o autorizar (ADR-30).
 *
 * El problema que resuelve: la wallet solo enseña lo que le enviamos. Si firmamos un `bytes32`
 * opaco, un `tokenId` o una marca de tiempo en epoch, el usuario firma a ciegas. Aquí se define,
 * para cada interacción, **qué texto/estructura ve** y con qué lenguaje llano.
 *
 * Reglas de diseño (todas verificadas por los guardianes de `wallet-messages.test.ts`):
 *   1. **Motivo primero**: todo mensaje empieza por una frase en lenguaje llano que dice qué se
 *      autoriza ("Descargar el resguardo de tu noche").
 *   2. **Datos legibles**: habitación y fecha de la noche en lugar de identificadores; la noche se
 *      formatea **solo con la fecha** (`AAAA-MM-DD`), que es determinista (sin zona horaria) y por
 *      tanto idéntica en el cliente y en el servidor.
 *   3. **Qué NO autoriza**: la descripción deja claro que la firma no mueve dinero ni da acceso a
 *      otras acciones (anti-confusión, defensa frente a phishing).
 *   4. **Determinismo**: el texto se reconstruye byte a byte en el servidor para verificar la firma.
 *      Nada de `toLocaleString` ni de zonas horarias.
 *
 * El catálogo `WALLET_MESSAGE_SPECS` es la fuente de verdad que consumen la documentación
 * (`docs/MENSAJES-FIRMA-WALLET.md`) y las pruebas: si un mensaje cambia, cambia su ficha.
 */

/** Nombre y versión del dominio EIP-712 que la wallet muestra junto al mensaje. */
export const WALLET_DOMAIN_NAME = "Hotel Marina del Sol";
export const WALLET_DOMAIN_VERSION = "2";

/** Interacciones con firma/autorización (las que la wallet pinta). */
export type WalletInteractionId =
  | "publishRoomContent"
  | "downloadTicket"
  | "submitReview"
  | "operationalAction"
  | "buyPrimary"
  | "buyResale"
  | "listForResale"
  | "cancelListing"
  | "claimFunds"
  | "checkIn"
  | "mintNight"
  | "publishRoom"
  | "manageRole"
  | "pauseContract"
  | "treasuryAndRoyalty"
  | "bidAuction"
  | "manageAuction";

/** Cómo llega la autorización a la wallet. */
export type WalletSignatureMethod = "personal_sign" | "eth_signTypedData_v4" | "transaction";

/** Tipo de dato de cada campo, para formatearlo de forma legible en la UI. */
export type WalletFieldKind = "texto" | "numero" | "fecha" | "importe" | "estrellas" | "hash";

export interface WalletMessageField {
  /** Nombre técnico del campo en el mensaje firmado (el que pinta la wallet). */
  readonly name: string;
  /** Etiqueta en lenguaje llano que se explica al usuario en la app. */
  readonly label: string;
  readonly kind: WalletFieldKind;
  /** Ejemplo real de lo que verá el usuario. */
  readonly example: string;
}

export interface WalletMessageSpec {
  /** Identificador estable de la interacción. */
  readonly id: WalletInteractionId;
  /** Frase llana con la que empieza el mensaje (el «motivo»). */
  readonly title: string;
  /** Qué autoriza, en una o dos frases. */
  readonly summary: string;
  /** Qué **no** autoriza (defensa anti-confusión). */
  readonly notAuthorized: string;
  readonly method: WalletSignatureMethod;
  /** Campos del mensaje firmado (vacío en transacciones: la wallet pinta función y argumentos). */
  readonly fields: readonly WalletMessageField[];
  /** Quién comprueba la firma y contra qué. */
  readonly verifiedBy: string;
  /** Qué ocurre si se firma por error. */
  readonly risk: string;
}

const field = (
  name: string,
  label: string,
  kind: WalletFieldKind,
  example: string,
): WalletMessageField => ({ name, label, kind, example });

/** Campos comunes de un mensaje EIP-712 de autorización puntual. */
const TICKET_FIELDS: readonly WalletMessageField[] = [
  field("motivo", "Qué estás autorizando", "texto", "Descargar el resguardo de tu noche"),
  field("habitacion", "Habitación", "numero", "201"),
  field("noche", "Noche", "fecha", "2026-11-15"),
  field("nonce", "Código de un solo uso", "texto", "9f2c… (lo emite el hotel)"),
  field("validoHasta", "Válido hasta (epoch)", "numero", "1792250400"),
];

const REVIEW_FIELDS: readonly WalletMessageField[] = [
  field("motivo", "Qué estás autorizando", "texto", "Publicar tu reseña de la noche"),
  field("habitacion", "Habitación", "numero", "201"),
  field("noche", "Noche", "fecha", "2026-11-15"),
  field("estrellas", "Valoración", "estrellas", "4 de 5"),
  field("nonce", "Código de un solo uso", "texto", "9f2c… (lo emite el hotel)"),
  field("validoHasta", "Válido hasta (epoch)", "numero", "1792250400"),
];

/**
 * Catálogo de mensajes. **Fuente de verdad** de la documentación y de las pruebas: cada fila
 * describe lo que el usuario ve en la wallet para una interacción concreta.
 */
export const WALLET_MESSAGE_SPECS: readonly WalletMessageSpec[] = [
  {
    id: "publishRoomContent",
    title: "Autorizas la publicación de la ficha de una habitación",
    summary:
      "Firmas un texto que incluye la huella del contenido que se va a publicar en la web del hotel.",
    notAuthorized:
      "No autoriza pagos, ni cambios de precio, ni ninguna otra acción del contrato: solo acredita que apruebas ese contenido.",
    method: "personal_sign",
    fields: [
      field("motivo", "Qué estás autorizando", "texto", "Publicar la ficha de la habitación 201 (suite)"),
      field("huella", "Huella del contenido", "hash", "0x3f2a… (64 caracteres)"),
      field("cuando", "Fecha de la firma (UTC)", "fecha", "2026-10-17 21:45 UTC"),
      field("dominio", "Web del hotel", "texto", "hotel-mcp-web….a.run.app"),
    ],
    verifiedBy: "Servidor: `verifyRoomPublicationSignature` reconstruye el mismo texto y verifica EIP-191",
    risk: "Si se firma por error, solo se acredita la publicación de un contenido que el administrador ya tenía delante.",
  },
  {
    id: "downloadTicket",
    title: "Descargar el resguardo de tu noche",
    summary:
      "Firmas que la cartera que reclama el resguardo es la titular de esa noche; el hotel emite el QR de check-in.",
    notAuthorized:
      "No autoriza un pago, ni una reventa, ni el check-in de otra noche: solo descarga tu resguardo.",
    method: "eth_signTypedData_v4",
    fields: TICKET_FIELDS,
    verifiedBy: "Servidor: `verifyEIP712TicketRequest` + `ownerOf` en la cadena y nonce de un solo uso",
    risk: "Si se firma por error, el titular recibe su propio resguardo (nadie más puede usarlo).",
  },
  {
    id: "submitReview",
    title: "Publicar tu reseña de la noche",
    summary:
      "Firmas tu valoración (estrellas y noche). La nota va dentro de la firma para que no se pueda cambiar después.",
    notAuthorized:
      "No autoriza pagos ni reventas: solo publica tu reseña de esa noche.",
    method: "eth_signTypedData_v4",
    fields: REVIEW_FIELDS,
    verifiedBy: "Servidor: `verifyEIP712ReviewRequest` + `ownerOf` en la cadena y nonce de un solo uso",
    risk: "Si se firma por error, se publica una reseña con la nota que aparece en la wallet.",
  },
  {
    id: "operationalAction",
    title: "Autorizar una operación del hotel",
    summary:
      "Firmas una acción operativa (check-in, incidencia, limpieza…) que el hotel registrará en la cadena.",
    notAuthorized:
      "No autoriza pagos ni cambios de rol: la acción concreta y su alcance están en la app antes de firmar.",
    method: "eth_signTypedData_v4",
    fields: [
      field("actionType", "Tipo de operación", "hash", "0x… (identificador del tipo)"),
      field("entityId", "Registro afectado", "hash", "0x… (identificador del registro)"),
      field("payloadHash", "Huella de los datos", "hash", "0x… (huella del contenido)"),
      field("nonce", "Código de un solo uso", "hash", "0x…"),
      field("deadline", "Válido hasta (epoch)", "numero", "1792250400"),
    ],
    verifiedBy: "Contrato `HotelOperations` (dominio `HotelOperations` v1) con `ECDSA.recover`",
    risk: "La firma es la autorización: quien la tenga puede registrar esa operación. La app muestra el resumen antes de firmar.",
  },
  {
    id: "buyPrimary",
    title: "Comprar una noche en venta primaria",
    summary: "Pagas el precio de catálogo de la noche y pasa a ser tuya en la cadena.",
    notAuthorized: "No autoriza nada más allá de esa compra por el importe que muestra la app.",
    method: "transaction",
    fields: [],
    verifiedBy: "Contrato `HotelNights.buy` (importe exacto, noche disponible)",
    risk: "Si se firma por error, se compra la noche al precio mostrado.",
  },
  {
    id: "buyResale",
    title: "Comprar una noche en reventa",
    summary: "Pagas el precio de reventa; el vendedor y el royalty cobran por pull payment.",
    notAuthorized: "No autoriza nada más allá de esa compra por el importe que muestra la app.",
    method: "transaction",
    fields: [],
    verifiedBy: "Contrato `HotelNights.buyResale`",
    risk: "Si se firma por error, se compra la noche al precio mostrado.",
  },
  {
    id: "listForResale",
    title: "Poner tu noche en reventa",
    summary: "Publicas tu noche con el precio que elijas para que otro pueda comprarla.",
    notAuthorized: "No transfiere la noche: sigue siendo tuya hasta que alguien la compre.",
    method: "transaction",
    fields: [],
    verifiedBy: "Contrato `HotelNights.listForResale`",
    risk: "Si se firma por error, la noche queda en venta al precio indicado (puedes retirarla).",
  },
  {
    id: "cancelListing",
    title: "Retirar tu noche de la reventa",
    summary: "Quitas tu noche del mercado; nadie podrá comprarla.",
    notAuthorized: "No vende ni transfiere la noche: solo la retira del mercado.",
    method: "transaction",
    fields: [],
    verifiedBy: "Contrato `HotelNights.cancelListing`",
    risk: "Si se firma por error, la noche deja de estar en venta.",
  },
  {
    id: "claimFunds",
    title: "Cobrar lo que tienes pendiente",
    summary: "Retiras a tu cartera el importe que el contrato te tiene acreditado.",
    notAuthorized: "No mueve fondos de otras cuentas ni cambia precios.",
    method: "transaction",
    fields: [],
    verifiedBy: "Contrato `HotelNights.claim`/`withdraw`",
    risk: "Si se firma por error, ingresas tu saldo pendiente en tu propia cartera.",
  },
  {
    id: "checkIn",
    title: "Marcar tu noche como usada (check-in)",
    summary: "El hotel registra que la noche se ha disfrutado; la noche deja de ser transferible.",
    notAuthorized: "No cobra ni transfiere nada.",
    method: "transaction",
    fields: [],
    verifiedBy: "Contrato `HotelNights.markCheckedIn`",
    risk: "Si se firma por error, la noche se da por usada.",
  },
  {
    id: "mintNight",
    title: "Crear una noche nueva (inventario)",
    summary: "El hotel emite la noche de una habitación en una fecha concreta.",
    notAuthorized: "No vende la noche ni mueve dinero.",
    method: "transaction",
    fields: [],
    verifiedBy: "Contrato `HotelNights.mint` (rol `MINTER_ROLE` + TOTP en la app)",
    risk: "Si se firma por error, se crea una noche en el inventario.",
  },
  {
    id: "publishRoom",
    title: "Publicar la ficha de una habitación",
    summary: "El hotel ancla en la cadena la huella del contenido publicado.",
    notAuthorized: "No vende ni cambia precios: solo publica el contenido.",
    method: "transaction",
    fields: [],
    verifiedBy: "Contrato `HotelNights.publishRoom`",
    risk: "Si se firma por error, se publica la ficha de esa habitación.",
  },
  {
    id: "manageRole",
    title: "Dar o quitar un rol de operador",
    summary: "El propietario concede o retira permisos a una cuenta del hotel.",
    notAuthorized: "No mueve fondos; afecta solo a los permisos de esa cuenta.",
    method: "transaction",
    fields: [],
    verifiedBy: "Contrato `HotelNights.grantRole`/`revokeRole` (rol `DEFAULT_ADMIN_ROLE` + TOTP)",
    risk: "Si se firma por error, esa cuenta gana o pierde un permiso.",
  },
  {
    id: "pauseContract",
    title: "Pausar o reanudar el hotel",
    summary: "El propietario detiene (o reanuda) las compras, reventas y subastas del contrato.",
    notAuthorized: "No borra datos ni mueve fondos; el retiro de fondos sigue disponible.",
    method: "transaction",
    fields: [],
    verifiedBy: "Contrato `HotelNights.pause`/`unpause` (rol `PAUSER_ROLE`)",
    risk: "Si se firma por error, la compraventa queda detenida (o reanudada).",
  },
  {
    id: "treasuryAndRoyalty",
    title: "Cambiar la tesorería o el royalty",
    summary: "El propietario cambia a qué cuenta se ingresan las ventas o el porcentaje de royalty.",
    notAuthorized: "No mueve los fondos ya acreditados; se aplica a las ventas siguientes.",
    method: "transaction",
    fields: [],
    verifiedBy: "Contrato `HotelNights.setTreasury`/`setRoyaltyBps` (roles `TREASURER`/`ROYALTY_ADMIN` + TOTP)",
    risk: "Si se firma por error, cambia el destino de las ventas o el porcentaje de royalty.",
  },
  {
    id: "bidAuction",
    title: "Pujar por una noche subastada",
    summary: "Comprometes tu importe en la subasta; si te superan, podrás recuperarlo.",
    notAuthorized: "No compra la noche: solo registra tu puja. Se paga el importe que muestra la app.",
    method: "transaction",
    fields: [],
    verifiedBy: "Contrato `NightAuction.bid` (reserva, incremento mínimo y anti-sniping)",
    risk: "Si se firma por error, queda una puja con tu importe (recuperable si te superan).",
  },
  {
    id: "manageAuction",
    title: "Abrir, cancelar o liquidar una subasta",
    summary: "El hotel abre la subasta de una noche o la cancela (solo sin pujas); cualquiera puede liquidarla al cerrar.",
    notAuthorized: "No compra ni vende fuera de la subasta.",
    method: "transaction",
    fields: [],
    verifiedBy: "Contrato `NightAuction.createAuction`/`cancel`/`settle`",
    risk: "Si se firma por error, la subasta se abre, se cancela o se liquida.",
  },
];

/** Ficha de una interacción concreta (o `undefined` si no está catalogada). */
export function walletMessageSpec(id: WalletInteractionId): WalletMessageSpec | undefined {
  return WALLET_MESSAGE_SPECS.find((spec) => spec.id === id);
}

// ---------------------------------------------------------------------------
// Formateadores deterministas (los mismos en cliente y servidor)
// ---------------------------------------------------------------------------

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** `20261115` → `2026-11-15` (determinista, sin zona horaria). */
export function formatNightISO(dateYYYYMMDD: number): string {
  const year = Math.floor(dateYYYYMMDD / 10000);
  const month = Math.floor((dateYYYYMMDD % 10000) / 100);
  const day = dateYYYYMMDD % 100;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** `20261115` → `15 de noviembre de 2026` (para la UI y el texto firmado; solo fecha). */
export function formatNightLong(dateYYYYMMDD: number): string {
  const year = Math.floor(dateYYYYMMDD / 10000);
  const month = Math.floor((dateYYYYMMDD % 10000) / 100);
  const day = dateYYYYMMDD % 100;
  const monthName = MONTHS_ES[Math.max(0, Math.min(11, month - 1))];
  return `${day} de ${monthName} de ${year}`;
}

/** Epoch en **UTC** y formato fijo (determinista; nada de `toLocaleString`). */
export function formatUtcTimestamp(epochSeconds: number): string {
  if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) return "";
  const iso = new Date(epochSeconds * 1000).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** `0.2 ether` → `0,20 CC` (coma decimal española, sin depender del locale del navegador). */
export function formatCC(wei: bigint): string {
  const raw = wei.toString().padStart(19, "0");
  const whole = raw.slice(0, raw.length - 18).replace(/^0+(?=\d)/, "");
  const fraction = raw.slice(raw.length - 18).slice(0, 2).padEnd(2, "0");
  return `${whole},${fraction} CC`;
}

/** Tipo de habitación en lenguaje llano (`simple`/`doble`/`suite`) o el propio tipo. */
export function roomTypeLabel(type: string): string {
  const labels: Readonly<Record<string, string>> = {
    simple: "individual",
    doble: "doble",
    suite: "suite",
  };
  // La BD guarda el tipo en mayúsculas (`DOBLE`); el mensaje firmado debe ser el mismo en cliente y
  // servidor, así que la normalización vive aquí y no en cada consumidor.
  return labels[type.trim().toLowerCase()] ?? type;
}

/** `20120261115` → `habitación 201 (suite), noche del 15 de noviembre de 2026`. */
export function nightLabelForToken(tokenId: bigint | string): string {
  const { room, dateYYYYMMDD } = decodeTokenId(BigInt(tokenId));
  const type: NightType | null = roomTypeOf(room);
  const roomText = type ? `habitación ${room} (${roomTypeLabel(type)})` : `habitación ${room}`;
  return `${roomText}, noche del ${formatNightLong(dateYYYYMMDD)}`;
}

// ---------------------------------------------------------------------------
// Mensaje firmado (texto plano) de la publicación de contenido
// ---------------------------------------------------------------------------

export interface RoomPublicationInput {
  readonly roomNumber: number;
  readonly roomType: string;
  readonly contentHash: `0x${string}` | string;
  /** Marca temporal de la firma, en epoch (UTC). El servidor la acota a ±5 minutos. */
  readonly issuedAtSeconds: number;
  /** Dominio del hotel (anti-phishing): el host desde el que se firma. */
  readonly domain: string;
}

/**
 * Texto exacto que la wallet muestra al firmar la publicación del contenido de una habitación.
 *
 * **Determinista**: el cliente y el servidor construyen exactamente este texto con los mismos
 * datos, de modo que la verificación EIP-191 puede reconstruirlo sin guardar el texto firmado.
 */
export function roomPublicationMessage(input: RoomPublicationInput): string {
  const room = `habitación ${input.roomNumber} (${roomTypeLabel(input.roomType)})`;
  return [
    "Marina del Sol · Autorización de publicación",
    "",
    `Vas a autorizar la publicación de la ficha de la ${room}.`,
    `Huella del contenido: ${input.contentHash}`,
    "",
    "Esta firma solo acredita que apruebas ese contenido.",
    "No autoriza pagos, ni precios, ni otras acciones del contrato.",
    "",
    `Fecha de la firma: ${formatUtcTimestamp(input.issuedAtSeconds)}`,
    `Web del hotel: ${input.domain}`,
  ].join("\n");
}

/** Ventana máxima entre la firma y su verificación en la publicación (5 minutos). */
export const ROOM_PUBLICATION_SIGNATURE_TTL_SECONDS = 300;

/** ¿La marca de tiempo de la firma cae dentro de la ventana permitida? */
export function isFreshPublicationSignature(
  issuedAtSeconds: number,
  nowSeconds: number,
  ttlSeconds: number = ROOM_PUBLICATION_SIGNATURE_TTL_SECONDS,
): boolean {
  if (!Number.isFinite(issuedAtSeconds) || !Number.isFinite(nowSeconds)) return false;
  const delta = Math.abs(nowSeconds - issuedAtSeconds);
  return delta <= ttlSeconds;
}

// ---------------------------------------------------------------------------
// Typed data de las autorizaciones EIP-712 (resguardo y reseña)
// ---------------------------------------------------------------------------

/** Mensaje que firma el titular para descargar su resguardo. */
export interface TicketAuthorizationMessage {
  readonly motivo: string;
  readonly habitacion: bigint;
  readonly noche: string;
  readonly nonce: string;
  readonly validoHasta: bigint;
}

/**
 * Estructura EIP-712 v2 del resguardo: campos con **nombre legible y valores comprensibles**
 * (habitación y noche en lugar de un `tokenId` opaco).
 */
export const TICKET_AUTHORIZATION_TYPES = {
  TicketAuthorization: [
    { name: "motivo", type: "string" },
    { name: "habitacion", type: "uint256" },
    { name: "noche", type: "string" },
    { name: "nonce", type: "string" },
    { name: "validoHasta", type: "uint256" },
  ],
} as const;

/** Motivo que viaja **dentro** de la firma del resguardo. */
export const TICKET_AUTHORIZATION_MOTIVO = "Descargar el resguardo de mi noche";

/** Convierte el `tokenId` a `bigint` rechazando valores no decimales (no se redondea nada). */
function toTokenId(value: bigint | string): bigint {
  if (typeof value === "bigint") return value;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) throw new Error("tokenId inválido");
  return BigInt(trimmed);
}

/** Mensaje del resguardo a partir de la noche y la vigencia. */
export function ticketAuthorizationMessage(input: {
  readonly tokenId: bigint | string;
  readonly nonce: string;
  readonly expiresAtSeconds: number | bigint;
}): TicketAuthorizationMessage {
  const { room, dateYYYYMMDD } = decodeTokenId(toTokenId(input.tokenId));
  return {
    motivo: TICKET_AUTHORIZATION_MOTIVO,
    habitacion: BigInt(room),
    noche: formatNightISO(dateYYYYMMDD),
    nonce: input.nonce,
    validoHasta: BigInt(input.expiresAtSeconds),
  };
}

/** Mensaje que firma el titular al publicar una reseña. */
export interface ReviewAuthorizationMessage extends TicketAuthorizationMessage {
  readonly estrellas: number;
}

/** Estructura EIP-712 v2 de la reseña (la nota va dentro de la firma). */
export const REVIEW_AUTHORIZATION_TYPES = {
  ReviewAuthorization: [
    { name: "motivo", type: "string" },
    { name: "habitacion", type: "uint256" },
    { name: "noche", type: "string" },
    { name: "estrellas", type: "uint8" },
    { name: "nonce", type: "string" },
    { name: "validoHasta", type: "uint256" },
  ],
} as const;

/** Motivo que viaja **dentro** de la firma de la reseña. */
export const REVIEW_AUTHORIZATION_MOTIVO = "Publicar mi reseña de la noche";

/** Mensaje de la reseña a partir de la noche, la nota y la vigencia. */
export function reviewAuthorizationMessage(input: {
  readonly tokenId: bigint | string;
  readonly rating: number;
  readonly nonce: string;
  readonly expiresAtSeconds: number | bigint;
}): ReviewAuthorizationMessage {
  const base = ticketAuthorizationMessage(input);
  return { ...base, motivo: REVIEW_AUTHORIZATION_MOTIVO, estrellas: input.rating };
}

/** Descripción llana de la noche a la que se refiere un mensaje (para la UI previa a firmar). */
export function walletMessageSummary(id: WalletInteractionId): string {
  return walletMessageSpec(id)?.summary ?? "";
}

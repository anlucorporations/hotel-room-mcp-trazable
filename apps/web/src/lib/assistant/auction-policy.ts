/**
 * Regla de producto: **solo el hotel abre subastas**.
 *
 * El contrato ya lo impone (`NightAuction.createAuction` exige `AUCTION_ADMIN_ROLE` y que la noche
 * siga siendo inventario del hotel), pero el texto del LLM es libre: en el pool E2E del 2026-10-24
 * llegó a proponer «para subastar tus noches, ve a Reventa y listar» (mezclaba los dos mercados).
 * Esta guarda determinista se aplica **después** del modelo: si el usuario pide subastar una noche
 * suya y la respuesta no aclara la limitación, se antepone la explicación correcta.
 *
 * Es texto de apoyo fijo (no inventa datos): no altera precios, disponibilidad ni tokenIds.
 */
const AUCTION_VERB = /subast/i;
/** Señales de que la noche es del usuario (posesión), no una subasta del hotel por la que se puja. */
const OWN_NIGHT = /(\bmis?\s+noches?\b|\bmi(s)?\s+habitaci|\bmi(s)?\s+reserv|\bmi(s)?\s+suites?\b|noche(s)?\s+que\s+(compr|reserv|tengo|poseo)|habitaci(o|ó)n(es)?\s+que\s+(compr|reserv|tengo|poseo))/i;
const ALREADY_EXPLAINS = /(solo el hotel|solo puede subastar el hotel|no puedes subastar|no se puede subastar|no puede subastar|las subastas las (abre|inicia) el hotel)/i;

/** ¿La petición del usuario pide subastar una noche propia? */
export function asksToAuctionOwnNight(userText: string | undefined): boolean {
  if (typeof userText !== "string") return false;
  return AUCTION_VERB.test(userText) && OWN_NIGHT.test(userText);
}

/** Prefijo de apoyo con la regla real del producto. */
export const HOTEL_ONLY_AUCTION_NOTE =
  "Solo el hotel puede abrir subastas de noches; un huésped no puede subastar las suyas. " +
  "Si quieres vender una noche tuya, ponla en reventa desde «Mis noches». ";

/**
 * Garantiza que una pregunta de «subastar mi noche» reciba siempre la aclaración, aunque el modelo
 * se haya confundido con la reventa o haya omitido la regla.
 */
export function ensureHotelOnlyAuctionGuidance(reply: string, userText: string | undefined): string {
  if (!asksToAuctionOwnNight(userText)) return reply;
  if (ALREADY_EXPLAINS.test(reply)) return reply;
  return `${HOTEL_ONLY_AUCTION_NOTE}${reply}`;
}

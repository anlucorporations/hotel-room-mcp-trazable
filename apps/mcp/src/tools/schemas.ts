import { z } from "zod";

/**
 * Esquemas de entrada de las herramientas del MCP (RF-12, ADR-11). Se definen como
 * *raw shapes* de Zod para registrarlos directamente en el `McpServer` (`registerTool`) y, a
 * la vez, validar la entrada en el orquestador (fuente única → DRY).
 */

const yyyymmdd = z.number().int().gte(10_000_101).lte(99_991_231);
const roomNumber = z.number().int().positive();
const ethAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "dirección Ethereum inválida");
/** `tokenId` como string para no perder precisión (bigint). */
const tokenId = z.union([z.string(), z.number()]).transform((v) => String(v));

export const listAvailableNightsShape = {
  /** Ventana de fechas (AAAAMMDD); por defecto [hoy, hoy+ventana de catálogo]. */
  window: z.object({ from: yyyymmdd.optional(), to: yyyymmdd.optional() }).optional(),
  /** Filtro por tipo de habitación (alternativas del mismo tipo, CU-08 08a, docs/SRS.md §9). */
  type: z.enum(["simple", "doble", "suite"]).optional(),
} as const;

export const checkAvailabilityShape = {
  room: roomNumber,
  /** Fecha de la noche en formato AAAAMMDD. */
  date: yyyymmdd,
} as const;

export const getOwnedNightsShape = {
  wallet: ethAddress,
} as const;

export const buildPurchaseTxShape = {
  tokenId,
} as const;

/** Audiencias del índice de conocimiento (H2); la escalera de visibilidad vive en `knowledge/search`. */
const knowledgeAudience = z.enum(["cliente", "recepcion", "propietario", "interno"]);

export const searchHotelManualsShape = {
  /** Pregunta o concepto a buscar, en lenguaje natural. */
  query: z.string().min(2).max(300),
  /**
   * Audiencia del consumidor. Por defecto `cliente` (la más restrictiva): el asistente del huésped
   * nunca recibe procedimientos internos, de recepción ni del propietario.
   */
  audience: knowledgeAudience.optional(),
  /** Número de fragmentos a devolver (por defecto 3, máximo 5). */
  limit: z.number().int().positive().max(5).optional(),
} as const;

export const listAvailableNightsInput = z.object(listAvailableNightsShape);
export const checkAvailabilityInput = z.object(checkAvailabilityShape);
export const getOwnedNightsInput = z.object(getOwnedNightsShape);
export const buildPurchaseTxInput = z.object(buildPurchaseTxShape);
export const searchHotelManualsInput = z.object(searchHotelManualsShape);

export type ListAvailableNightsInput = z.infer<typeof listAvailableNightsInput>;
export type CheckAvailabilityInput = z.infer<typeof checkAvailabilityInput>;
export type GetOwnedNightsInput = z.infer<typeof getOwnedNightsInput>;
export type BuildPurchaseTxInput = z.infer<typeof buildPurchaseTxInput>;
export type SearchHotelManualsInput = z.infer<typeof searchHotelManualsInput>;

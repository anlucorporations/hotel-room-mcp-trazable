/**
 * Vocabulario cerrado del check-out (incremento v2, CU-34/CU-35).
 *
 * Vive en un módulo **isomorfo** (sin `pg` ni Node) porque lo consumen tanto el repositorio de
 * servidor como los componentes de cliente (el formulario de check-out). Así el formulario importa
 * las mismas constantes que valida la API, sin arrastrar la capa de datos al bundle del navegador.
 */

/** Incidencias admitidas al verificar la habitación (nunca texto libre con PII, RNF-30). */
export const CHECKOUT_INCIDENT_KINDS = [
  "DANOS",
  "FALTA_LIMPIEZA",
  "OBJETO_OLVIDADO",
  "MINIBAR_CONSUMIDO",
  "AVERIA",
  "OTRO",
] as const;
export type CheckoutIncidentKind = (typeof CHECKOUT_INCIDENT_KINDS)[number];

/** Condición de la habitación al verificar la salida. */
export const CHECKOUT_ROOM_CONDITIONS = ["OK", "INCIDENCIA"] as const;
export type CheckoutRoomCondition = (typeof CHECKOUT_ROOM_CONDITIONS)[number];

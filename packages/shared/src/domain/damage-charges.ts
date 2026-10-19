/**
 * Dominio **puro** de cargos por daños y su notificación al huésped (F7).
 *
 * Decisiones clave que fija este módulo (para que BD, API, worker y UI no diverjan):
 *   - El cargo por daños **no exige firma on-chain** (D-C27): se audita off-chain. La columna
 *     `signature_id` existe por compatibilidad del esquema y debe quedar `NULL`.
 *   - La notificación tiene un **plazo de reclamación** (`DAMAGE_CLAIM_WINDOW_HOURS`, 24 h por
 *     defecto, D-C14). Pasado el plazo sin reclamación, queda `EXPIRED`.
 *   - Estados: `PENDING → SENT → ACKNOWLEDGED | DISPUTED | EXPIRED → RESOLVED_ACCEPTED | RESOLVED_REJECTED`.
 *     `ACKNOWLEDGED` es «el huésped queda conforme sin reclamar» (CU-AUD-05).
 *   - Resolver una reclamación **aceptada** deja el cargo `PENDING` (se suma al folio en el
 *     check-out); una **rechazada** cancela el cargo adicional (D-C11).
 *   - Las evidencias se conservan `DAMAGE_EVIDENCE_RETENTION_DAYS` (90) y después se anonimizan
 *     (ruta de foto y notas de disputa), sin borrar la traza del cargo (R-15/D-C19).
 */

export const DAMAGE_NOTIFICATION_CHANNELS = ["EMAIL", "TELEGRAM", "WEB"] as const;
export type DamageNotificationChannel = (typeof DAMAGE_NOTIFICATION_CHANNELS)[number];

export const DAMAGE_NOTIFICATION_STATUSES = [
  "PENDING",
  "SENT",
  "ACKNOWLEDGED",
  "DISPUTED",
  "EXPIRED",
  "RESOLVED_ACCEPTED",
  "RESOLVED_REJECTED",
] as const;
export type DamageNotificationStatus = (typeof DAMAGE_NOTIFICATION_STATUSES)[number];

/** Plazo por defecto de reclamación de un cargo: 24 h antes del check-out (D-C14). */
export const DAMAGE_CLAIM_WINDOW_HOURS = 24;

/** Retención de evidencias/fotos tras el check-out: 90 días (T7.6/R-15). */
export const DAMAGE_EVIDENCE_RETENTION_DAYS = 90;

/** Estados en los que el huésped todavía puede reclamar. */
export function canGuestClaim(
  status: DamageNotificationStatus,
  dueDate: Date | string,
  now: Date = new Date(),
): boolean {
  if (status !== "SENT" && status !== "PENDING") return false;
  return new Date(dueDate).getTime() >= now.getTime();
}

/** Estado en el que queda la notificación al reclamar el huésped, o `null` si ya no puede. */
export function claimStatus(
  status: DamageNotificationStatus,
  dueDate: Date | string,
  now: Date = new Date(),
): DamageNotificationStatus | null {
  return canGuestClaim(status, dueDate, now) ? "DISPUTED" : null;
}

/** Estado al quedar conforme sin reclamación (dentro de plazo): `ACKNOWLEDGED`. */
export function acknowledgeStatus(
  status: DamageNotificationStatus,
  dueDate: Date | string,
  now: Date = new Date(),
): DamageNotificationStatus | null {
  return canGuestClaim(status, dueDate, now) ? "ACKNOWLEDGED" : null;
}

/** Fecha límite por defecto: `now + windowHours`. */
export function defaultClaimDueDate(now: Date = new Date(), windowHours = DAMAGE_CLAIM_WINDOW_HOURS): Date {
  return new Date(now.getTime() + windowHours * 3_600_000);
}

/**
 * ¿Debe marcarse `EXPIRED`? Solo notificaciones emitidas (`SENT`/`PENDING`) con plazo vencido.
 * `ACKNOWLEDGED` y `DISPUTED` ya no caducan; las resueltas son terminales.
 */
export function shouldExpire(
  status: DamageNotificationStatus,
  dueDate: Date | string,
  now: Date = new Date(),
): boolean {
  if (status !== "PENDING" && status !== "SENT") return false;
  return new Date(dueDate).getTime() < now.getTime();
}

/** Resultado de la resolución de recepción (T7.5): estado de la notificación y del cargo adicional. */
export interface DamageResolution {
  readonly notificationStatus: Extract<
    DamageNotificationStatus,
    "RESOLVED_ACCEPTED" | "RESOLVED_REJECTED"
  >;
  /** `PENDING` = se suma al folio; `CANCELLED` = no se cobra. */
  readonly chargeStatus: Extract<"PENDING" | "CANCELLED", "PENDING" | "CANCELLED">;
}

/** Proyecta la decisión de recepción a los dos estados que hay que persistir (D-C11). */
export function resolutionForDecision(accepted: boolean): DamageResolution {
  return accepted
    ? { notificationStatus: "RESOLVED_ACCEPTED", chargeStatus: "PENDING" }
    : { notificationStatus: "RESOLVED_REJECTED", chargeStatus: "CANCELLED" };
}

/** Datos que se anonimizan en un cargo al vencer la retención de evidencias (T7.6). */
export interface DamageEvidenceFields {
  readonly evidencePath?: string | null;
  readonly disputeNotes?: string | null;
}

/** ¿La evidencia de este cargo ya supera la retención y hay algo que anonimizar? */
export function shouldAnonymizeEvidence(
  fields: DamageEvidenceFields,
  createdAt: Date | string,
  now: Date = new Date(),
  retentionDays = DAMAGE_EVIDENCE_RETENTION_DAYS,
): boolean {
  const hasSomething = Boolean(fields.evidencePath) || Boolean(fields.disputeNotes);
  if (!hasSomething) return false;
  const ageMs = now.getTime() - new Date(createdAt).getTime();
  return ageMs >= retentionDays * 86_400_000;
}

/** Proyección de la anonimización: la traza del cargo permanece; se borran ruta y notas. */
export function anonymizedEvidence(): DamageEvidenceFields {
  return { evidencePath: null, disputeNotes: null };
}

/** ¿El cargo está vinculado a una noche vendida? (D-C4: vínculo con el token). */
export function isLinkedToSoldNight(tokenId: string | null | undefined): boolean {
  return typeof tokenId === "string" && tokenId.trim().length > 0;
}

/**
 * Dominio **puro** del SLA de validación del jefe (F8 · T8.3 · RNF-M-21).
 *
 * Una tarea cerrada por un técnico/camarera queda `PENDING_VERIFICATION` y el jefe la valida en
 * **24 h**. Al vencer pasa a `PENDING_VERIFICATION_EXPIRED` y **escala al Administrador**; mientras
 * tanto la tarea **no cuenta como completada** (RNF-M-21: no bloquea la habitación, pero no se da por
 * cerrada hasta validarse).
 */

export const VALIDATION_SLA_HOURS = 24;

export const VALIDATION_STATUSES = [
  "PENDING_VERIFICATION",
  "VALIDATED",
  "PENDING_VERIFICATION_EXPIRED",
] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export const VALIDATION_ESCALATION_ROLE = "DEFAULT_ADMIN_ROLE";

/** ¿La tarea cerrada ha superado el SLA de 24 h sin validar? */
export function isValidationExpired(
  closedAt: Date | null,
  now: Date = new Date(),
  slaHours = VALIDATION_SLA_HOURS,
): boolean {
  if (closedAt === null) return false;
  return now.getTime() - closedAt.getTime() >= slaHours * 3_600_000;
}

/** Estado de validación **esperado** para una tarea cerrada en `closedAt`. */
export function validationStatusFor(
  closedAt: Date | null,
  current: ValidationStatus | null,
  now: Date = new Date(),
): ValidationStatus | null {
  if (current === "VALIDATED") return "VALIDATED";
  if (closedAt === null) return current;
  return isValidationExpired(closedAt, now) ? "PENDING_VERIFICATION_EXPIRED" : "PENDING_VERIFICATION";
}

/** Milisegundos que quedan del SLA (0 si ya venció o no aplica). */
export function validationRemainingMs(
  closedAt: Date | null,
  now: Date = new Date(),
  slaHours = VALIDATION_SLA_HOURS,
): number {
  if (closedAt === null) return 0;
  const deadline = closedAt.getTime() + slaHours * 3_600_000;
  return Math.max(0, deadline - now.getTime());
}

/** ¿Esta tarea puede validarse por el jefe? (solo pendientes; vencidas también, antes de escalar). */
export function canValidate(status: ValidationStatus | null): boolean {
  return status === "PENDING_VERIFICATION" || status === "PENDING_VERIFICATION_EXPIRED";
}

/** Texto de escalado para el Administrador cuando una tarea supera el SLA. */
export function escalationSummary(input: {
  readonly taskId: string;
  readonly planName: string | null;
  readonly closedAt: Date | null;
}): string {
  return `Validación vencida (>${VALIDATION_SLA_HOURS} h): tarea ${input.taskId} · ${
    input.planName ?? "plan sin nombre"
  } · cerrada ${input.closedAt?.toISOString() ?? "sin fecha"}`;
}

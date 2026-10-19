/**
 * Gobernanza de **flags operativos** (F9 · T9.3 · D-C22, RNF-M-11).
 *
 * Un flag es una palanca de comportamiento del sistema (p. ej. exigir firma de inspección). Reglas:
 *   - Solo el **Owner con TOTP** puede cambiarlos (la web exige el código en la petición).
 *   - Desactivar un flag **obligatorio** (los que protegen una garantía del sistema) exige además una
 *     **firma on-chain de la acción `CONFIG`** (D-C22); sin firma, la API lo rechaza.
 *   - Los flags viven en `platform_settings` (mismo almacén que el resto de ajustes).
 */

export interface FlagDefinition {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  /** Valor por defecto si no hay fila en `platform_settings`. */
  readonly defaultValue: "true" | "false";
  /** Si es obligatorio, desactivarlo exige firma `CONFIG`. */
  readonly mandatory: boolean;
}

export const OPERATIONAL_FLAGS: readonly FlagDefinition[] = [
  {
    key: "ENABLE_OPERATIONAL_SIGNATURES",
    label: "Firma operativa on-chain",
    description:
      "Exige y ancla firmas EIP-712 en las acciones críticas (bloqueo, preventivo crítico, inspección).",
    defaultValue: "true",
    mandatory: true,
  },
  {
    key: "INSPECTION_REQUIRES_SIGNATURE",
    label: "Firma de inspección",
    description: "Exige firma EIP-712 del Ama de llaves en cada inspección (D-C23).",
    defaultValue: "false",
    mandatory: false,
  },
  {
    key: "REQUIRE_EVIDENCE_FOR_CLOSURE",
    label: "Evidencia obligatoria al cerrar",
    description: "Bloquea el cierre de tareas/incidencias sin evidencia adjunta (D-C12).",
    defaultValue: "false",
    mandatory: false,
  },
] as const;

/** ¿El flag es obligatorio (su desactivación exige firma `CONFIG`)? */
export function isMandatoryFlag(key: string): boolean {
  return OPERATIONAL_FLAGS.some((flag) => flag.key === key && flag.mandatory);
}

/** ¿Desactivar este flag en este cambio exige firma `CONFIG`? */
export function requiresConfigSignature(
  key: string,
  currentValue: "true" | "false",
  nextValue: "true" | "false",
): boolean {
  if (!isMandatoryFlag(key)) return false;
  return currentValue === "true" && nextValue === "false";
}

/** Valida el valor booleano textual de un flag; devuelve el valor canónico o `null`. */
export function parseFlagValue(value: unknown): "true" | "false" | null {
  if (value === true || value === "true") return "true";
  if (value === false || value === "false") return "false";
  return null;
}

/** Valor efectivo de un flag a partir de lo persistido (`null` = sin fila). */
export function effectiveFlagValue(
  key: string,
  persisted: string | null,
): "true" | "false" | null {
  const definition = OPERATIONAL_FLAGS.find((flag) => flag.key === key);
  if (!definition) return null;
  const parsed = parseFlagValue(persisted);
  return parsed ?? definition.defaultValue;
}

import { concatHex, keccak256, stringToHex } from "viem";
import type { Hex } from "viem";
import { canonicalJson } from "../domain/canonical-json";
import type { OperationalActionType } from "./types";

/**
 * Derivación canónica de `payloadHash` (DT-AUD-03,
 * `RepoTecnico/propuesta_vNext/documento_tecnico.md` §4.2.1):
 *
 * ```text
 * canonicalPayloadJson = canonicalJson(payload)          // claves ordenadas, sin espacios, UTF-8
 * payloadHash          = keccak256( actionType ‖ "|" ‖ canonicalPayloadJson )
 * ```
 *
 * El separador `"|"` evita que dos acciones distintas (p. ej. `actionType="A"` con payload `"B|C"`)
 * colisionen en el mismo preimagen. El JSON canónico es el mismo `canonicalJson` que usa la cadena de
 * auditoría: una sola definición de "mismos bytes ⇒ mismo hash" en todo el monorepo.
 */

/**
 * `payloadHash` a partir de un JSON canónico **ya serializado** (`canonicalJson(payload)`).
 *
 * Útil para quien persiste el JSON canónico (p. ej. para auditoría) y no quiere volver a serializar:
 * recalcularlo aquí debe dar exactamente el mismo hash.
 */
export function payloadHashFromCanonicalJson(
  actionType: OperationalActionType,
  canonicalPayloadJson: string,
): Hex {
  return keccak256(
    concatHex([stringToHex(actionType), stringToHex("|"), stringToHex(canonicalPayloadJson)]),
  );
}

/** `payloadHash` del payload de negocio, serializado antes con `canonicalJson`. */
export function payloadHashOf(actionType: OperationalActionType, payload: unknown): Hex {
  return payloadHashFromCanonicalJson(actionType, canonicalJson(payload));
}

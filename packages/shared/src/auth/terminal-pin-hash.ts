import bcrypt from "bcryptjs";
import { TERMINAL_PIN_BCRYPT_COST } from "./terminal-pin";

/**
 * Hash/verificación del PIN de terminal (F5 · T5.3).
 *
 * Vive fuera del módulo puro de política para que bcrypt no entre en el bundle de cliente; el coste
 * es explícito (≥ 12) y nunca se guarda el PIN en claro (solo `pin_hash`).
 */
export async function hashTerminalPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, TERMINAL_PIN_BCRYPT_COST);
}

export async function verifyTerminalPin(pin: string, pinHash: string): Promise<boolean> {
  return bcrypt.compare(pin, pinHash);
}

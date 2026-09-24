/** Tipos de dominio del sistema (docs/SRS.md §9, RF-18a). */

/** Tipo de habitación (= foto/imagen IPFS asociada). */
export type NightType = "simple" | "doble" | "suite";

/** Naturaleza de una venta (evento `Sale`). */
export type SaleType = "PRIMARY" | "SECONDARY";

/** Estados del ciclo de vida del NFT-noche (máquina de estados, docs/SRS.md §9). */
export type NightState =
  | "DISPONIBLE"
  | "EN_PODER_CLIENTE"
  | "LISTADA_SECUNDARIO"
  | "EXPIRADA"
  | "QUEMADA";

/** Modo de fees al construir transacciones (ADR-01, ADR-17). */
export type FeeMode = "eip1559-explicit" | "legacy";

/** Componentes con health-check (RNF-17). */
export type HealthableComponent = "worker" | "mcp" | "faucet" | "rpc";

/** Atributos ERC-721 de una noche (sin PII, RNF-05). */
export interface NightAttributes {
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly roomType: NightType;
}

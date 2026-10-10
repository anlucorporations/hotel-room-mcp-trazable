import { createHash } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import { getDbPool } from "../pool";

/**
 * Repositorio de **operaciones firmadas** (`operator_wallets` + `on_chain_signatures`) — F2/F3 de la
 * vNext (D-C16, D-C18, D-C42; RNF-M-03/M-08/M-14/M-15).
 *
 * Es la pieza que separa «la operación está hecha» de «la operación está **firmada**». El modelo tiene
 * dos verdades y este repositorio las mantiene ordenadas:
 *
 *   - **PostgreSQL es la verdad operativa**: la entidad (bloqueo de habitación, inspección…) cambia de
 *     estado solo cuando existe una firma en `SIGNED`/`MINED` con su `recovered_signer` verificado.
 *   - **La cadena es la prueba**: el anclaje es un *outbox* — `PENDING` → `SIGNED` → `MINED` — con
 *     reintentos (`retry_count`, `next_attempt_at`) y `expires_at`/`deadline` para no firmar eternamente
 *     algo que ya no aplica.
 *
 * Decisiones que conviene no deshacer:
 *
 *   1. **Un nonce por (firmante, contenido)**, no aleatorio: `uq_on_chain_signatures_nonce` es un índice
 *      único parcial sobre `(signer_address, nonce) WHERE nonce IS NOT NULL`, así que **repetir la misma
 *      operación no puede firmarse dos veces** (anti-replay, DT-AUD-04). Un reintento reutiliza la MISMA
 *      fila y el MISMO nonce (por eso el nonce se deriva del contenido y no de un contador); una acción
 *      nueva tiene otro `content_hash` y, por tanto, otro nonce.
 *   2. **`markSigned` comprueba el firmante recuperado** (D-C16): si el `recovered_signer` no es el
 *      wallet asignado, no se marca `SIGNED` — se rechaza. Es el hallazgo H-10 de la auditoría vNext:
 *      sin esta comprobación, la firma de cualquiera valdría para cualquier operación.
 *   3. **`consume` es de un solo uso**: `consumed_at` se fija una vez y solo sobre lo que ya está en la
 *      cadena (`MINED`); con eso, un anclaje no se puede «reutilizar» para dos operaciones.
 */

/** Roles con wallet propia (`operator_wallets.role`, CHECK del esquema). */
export type OperatorWalletRole = "HEAD_MAINTENANCE" | "HEAD_KEEPER" | "OWNER_BACKUP";

/** Tipos de entidad firmable (`on_chain_signatures.entity_type`, CHECK del esquema). */
export type SignatureEntityType =
  | "ROOM_BLOCK"
  | "ROOM_UNBLOCK"
  | "INSPECTION"
  | "DAMAGE_CHARGE"
  | "PREVENTIVE_TASK"
  | "AREA_LOG"
  | "CONFIG";

/** Estados de la firma (`on_chain_signatures.status`, CHECK del esquema). */
export type SignatureStatus = "PENDING" | "SIGNED" | "MINED" | "FAILED" | "REVOKED";

export interface OperatorWalletRecord {
  readonly id: string;
  readonly adminUserId: string | null;
  readonly username: string;
  readonly role: OperatorWalletRole;
  readonly walletAddress: string;
  readonly isActive: boolean;
  readonly assignedBy: string;
  readonly assignedAt: Date;
  readonly revokedAt: Date | null;
  readonly backupForRole: string | null;
}

export interface SignatureRecord {
  readonly id: string;
  readonly entityType: SignatureEntityType;
  readonly entityId: string;
  readonly eventName: string;
  readonly contentHash: string;
  readonly signature: string | null;
  readonly signerAddress: string;
  readonly txHash: string | null;
  readonly status: SignatureStatus;
  readonly errorMessage: string | null;
  readonly nonce: string | null;
  readonly domainHash: string | null;
  readonly recoveredSigner: string | null;
  readonly verifiedAt: Date | null;
  readonly roleSnapshot: string | null;
  readonly retryCount: number;
  readonly nextAttemptAt: Date | null;
  readonly consumedAt: Date | null;
  readonly createdAt: Date;
  readonly minedAt: Date | null;
}

export interface AssignWalletInput {
  readonly username: string;
  readonly role: OperatorWalletRole;
  readonly walletAddress: string;
  readonly assignedBy: string;
  readonly adminUserId?: string | null;
  readonly backupForRole?: string | null;
}

export interface SignatureRequestInput {
  readonly entityType: SignatureEntityType;
  readonly entityId: string;
  readonly eventName: string;
  readonly contentHash: string;
  readonly signerAddress: string;
  /** Caducidad del *outbox* (no se firma lo que ya no aplica). */
  readonly expiresAt?: Date | null;
  readonly deadline?: Date | null;
}

export interface MarkSignedInput {
  readonly signature: string;
  readonly recoveredSigner: string;
  readonly domainHash: string;
  readonly roleSnapshot: string;
}

/** Error con código estable: la ruta HTTP lo traduce a un 4xx/5xx concreto. */
export class OperationsError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OperationsError";
    this.code = code;
  }
}

interface WalletRow extends QueryResultRow {
  id: string;
  admin_user_id: string | null;
  username: string;
  role: OperatorWalletRole;
  wallet_address: string;
  is_active: boolean;
  assigned_by: string;
  assigned_at: Date;
  revoked_at: Date | null;
  backup_for_role: string | null;
}

interface SignatureRow extends QueryResultRow {
  id: string;
  entity_type: SignatureEntityType;
  entity_id: string;
  event_name: string;
  content_hash: string;
  signature: string | null;
  signer_address: string;
  tx_hash: string | null;
  status: SignatureStatus;
  error_message: string | null;
  nonce: string | null;
  domain_hash: string | null;
  recovered_signer: string | null;
  verified_at: Date | null;
  role_snapshot: string | null;
  retry_count: number;
  next_attempt_at: Date | null;
  consumed_at: Date | null;
  created_at: Date;
  mined_at: Date | null;
}

/**
 * Nonce **determinista** de una firma: `0x` + SHA-256 de `firmante|contenido` (dirección en
 * minúsculas para que no dependa de cómo la escriba la cartera). Determinista a propósito: el índice
 * único parcial convierte el reintento de la MISMA operación en un no-evento y cualquier repetición
 * malintencionada en un error de base de datos.
 */
export function buildSignatureNonce(signerAddress: string, contentHash: string): string {
  const digest = createHash("sha256")
    .update(`${signerAddress.toLowerCase()}|${contentHash.toLowerCase()}`)
    .digest("hex");
  return `0x${digest}`;
}

function mapWallet(row: WalletRow): OperatorWalletRecord {
  return {
    id: row.id,
    adminUserId: row.admin_user_id,
    username: row.username,
    role: row.role,
    walletAddress: row.wallet_address,
    isActive: row.is_active,
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at,
    revokedAt: row.revoked_at,
    backupForRole: row.backup_for_role,
  };
}

function mapSignature(row: SignatureRow): SignatureRecord {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    eventName: row.event_name,
    contentHash: row.content_hash,
    signature: row.signature,
    signerAddress: row.signer_address,
    txHash: row.tx_hash,
    status: row.status,
    errorMessage: row.error_message,
    nonce: row.nonce,
    domainHash: row.domain_hash,
    recoveredSigner: row.recovered_signer,
    verifiedAt: row.verified_at,
    roleSnapshot: row.role_snapshot,
    retryCount: row.retry_count,
    nextAttemptAt: row.next_attempt_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
    minedAt: row.mined_at,
  };
}

export class OperationsRepository {
  private readonly pool: Pool;

  constructor(pool: Pool = getDbPool()) {
    this.pool = pool;
  }

  // ── Wallets de operadores (D-C42) ─────────────────────────────────────────────

  /**
   * Asigna una wallet a un operador. Reactiva la asignación si ya existía **revocada** para el mismo
   * usuario (rotación de wallet): el histórico no se pierde porque `operator_audit_log` guarda el
   * cambio, y una wallet revocada no se reutiliza por accidente.
   */
  async assignWallet(input: AssignWalletInput): Promise<OperatorWalletRecord> {
    const { rows } = await this.pool.query<WalletRow>(
      `INSERT INTO operator_wallets
         (username, role, wallet_address, assigned_by, admin_user_id, backup_for_role)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (username) DO UPDATE SET
         role = EXCLUDED.role,
         wallet_address = EXCLUDED.wallet_address,
         assigned_by = EXCLUDED.assigned_by,
         assigned_at = NOW(),
         revoked_at = NULL,
         is_active = TRUE,
         admin_user_id = EXCLUDED.admin_user_id,
         backup_for_role = EXCLUDED.backup_for_role
       RETURNING *`,
      [
        input.username,
        input.role,
        input.walletAddress,
        input.assignedBy,
        input.adminUserId ?? null,
        input.backupForRole ?? null,
      ],
    );
    return mapWallet(rows[0]!);
  }

  /** Baja de la wallet (baja del operario o pérdida del dispositivo): deja de estar activa, con fecha. */
  async revokeWallet(username: string): Promise<OperatorWalletRecord | null> {
    const { rows } = await this.pool.query<WalletRow>(
      `UPDATE operator_wallets
          SET is_active = FALSE, revoked_at = NOW()
        WHERE username = $1 AND is_active = TRUE
        RETURNING *`,
      [username],
    );
    return rows[0] ? mapWallet(rows[0]) : null;
  }

  /** Wallet activa de un rol (la usa el motor EIP-712 para saber a quién exigir la firma). */
  async findActiveWallet(role: OperatorWalletRole): Promise<OperatorWalletRecord | null> {
    const { rows } = await this.pool.query<WalletRow>(
      `SELECT * FROM operator_wallets
        WHERE role = $1 AND is_active = TRUE AND revoked_at IS NULL
        ORDER BY assigned_at DESC
        LIMIT 1`,
      [role],
    );
    return rows[0] ? mapWallet(rows[0]) : null;
  }

  async listWallets(): Promise<OperatorWalletRecord[]> {
    const { rows } = await this.pool.query<WalletRow>(
      `SELECT * FROM operator_wallets ORDER BY is_active DESC, role ASC, assigned_at DESC`,
    );
    return rows.map(mapWallet);
  }

  // ── Outbox de firmas (D-C16, D-C18) ───────────────────────────────────────────

  /**
   * Registra la intención de firmar. El nonce se deriva del firmante y del contenido, y si esa
   * combinación ya existe la inserción falla con `23505` (índice único parcial): el llamante puede
   * tratarlo como **duplicado idempotente** en vez de firmar dos veces la misma operación.
   */
  async createSignatureRequest(input: SignatureRequestInput): Promise<SignatureRecord> {
    const nonce = buildSignatureNonce(input.signerAddress, input.contentHash);
    const { rows } = await this.pool.query<SignatureRow>(
      `INSERT INTO on_chain_signatures
         (entity_type, entity_id, event_name, content_hash, signer_address, nonce, status, expires_at, deadline)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8)
       RETURNING *`,
      [
        input.entityType,
        input.entityId,
        input.eventName,
        input.contentHash,
        input.signerAddress,
        nonce,
        input.expiresAt ?? null,
        input.deadline ?? null,
      ],
    );
    return mapSignature(rows[0]!);
  }

  /**
   * Marca la firma como `SIGNED` **solo si el firmante recuperado es la wallet asignada** (D-C16/H-10).
   * Devuelve `null` si la fila no estaba en `PENDING` (ya firmada o revocada) y lanza si el firmante no
   * coincide: aceptar una firma de otra cartera es exactamente el agujero que la auditoría prohibió.
   */
  async markSigned(id: string, input: MarkSignedInput): Promise<SignatureRecord | null> {
    const actual = await this.findById(id);
    if (actual === null) return null;
    if (actual.recoveredSigner !== null) return null; // ya firmada
    if (input.recoveredSigner.toLowerCase() !== actual.signerAddress.toLowerCase()) {
      throw new OperationsError(
        "RECOVERED_SIGNER_MISMATCH",
        `La firma recuperada (${input.recoveredSigner}) no corresponde a la wallet asignada (${actual.signerAddress})`,
      );
    }

    const { rows } = await this.pool.query<SignatureRow>(
      `UPDATE on_chain_signatures
          SET status = 'SIGNED',
              signature = $2,
              recovered_signer = $3,
              domain_hash = $4,
              role_snapshot = $5,
              verified_at = NOW(),
              next_attempt_at = NULL
        WHERE id = $1 AND status = 'PENDING'
        RETURNING *`,
      [id, input.signature, input.recoveredSigner, input.domainHash, input.roleSnapshot],
    );
    return rows[0] ? mapSignature(rows[0]) : null;
  }

  /** Anclaje confirmado: la prueba está en la cadena. */
  async markMined(id: string, txHash: string): Promise<SignatureRecord | null> {
    const { rows } = await this.pool.query<SignatureRow>(
      `UPDATE on_chain_signatures
          SET status = 'MINED', tx_hash = $2, mined_at = NOW(), next_attempt_at = NULL, error_message = NULL
        WHERE id = $1 AND status IN ('SIGNED', 'PENDING')
        RETURNING *`,
      [id, txHash],
    );
    return rows[0] ? mapSignature(rows[0]) : null;
  }

  /**
   * Fallo de anclaje: cuenta el intento y fija cuándo reintentar (el backoff lo decide el llamante
   * —D-C18: hasta 8 intentos con TTL de 24 h—). Se conserva la firma: reintentar no exige volver a
   * firmar, solo reenviar la misma transacción.
   */
  async markFailed(id: string, errorMessage: string, nextAttemptAt: Date | null): Promise<SignatureRecord | null> {
    const { rows } = await this.pool.query<SignatureRow>(
      `UPDATE on_chain_signatures
          SET status = 'FAILED',
              error_message = $2,
              retry_count = retry_count + 1,
              next_attempt_at = $3
        WHERE id = $1
        RETURNING *`,
      [id, errorMessage, nextAttemptAt],
    );
    return rows[0] ? mapSignature(rows[0]) : null;
  }

  /** Revocación: la operación ya no aplica (p. ej. el bloqueo se deshizo antes de anclarse). */
  async revoke(id: string, reason: string): Promise<SignatureRecord | null> {
    const { rows } = await this.pool.query<SignatureRow>(
      `UPDATE on_chain_signatures
          SET status = 'REVOKED', error_message = $2, next_attempt_at = NULL
        WHERE id = $1 AND status IN ('PENDING', 'FAILED')
        RETURNING *`,
      [id, reason],
    );
    return rows[0] ? mapSignature(rows[0]) : null;
  }

  /**
   * Consume la firma (un solo uso). Solo se consume lo que ya está **en la cadena**: consumir una firma
   * `SIGNED` dejaría la operación sin prueba si el anclaje acaba fallando.
   */
  async consume(id: string): Promise<SignatureRecord | null> {
    const { rows } = await this.pool.query<SignatureRow>(
      `UPDATE on_chain_signatures
          SET consumed_at = NOW()
        WHERE id = $1 AND status = 'MINED' AND consumed_at IS NULL
        RETURNING *`,
      [id],
    );
    return rows[0] ? mapSignature(rows[0]) : null;
  }

  /**
   * Cola de reintento: firmas pendientes de anclar cuyo `next_attempt_at` ya venció (o nunca se fijó).
   * Devuelve las más antiguas primero — el orden importa: una firma vieja bloqueando una habitación no
   * puede quedarse detrás de las nuevas.
   */
  async findPendingForRetry(now: Date, limit = 50): Promise<SignatureRecord[]> {
    const { rows } = await this.pool.query<SignatureRow>(
      `SELECT * FROM on_chain_signatures
        WHERE status IN ('PENDING', 'SIGNED')
          AND consumed_at IS NULL
          AND (next_attempt_at IS NULL OR next_attempt_at <= $1)
        ORDER BY created_at ASC
        LIMIT $2`,
      [now, limit],
    );
    return rows.map(mapSignature);
  }

  async findById(id: string): Promise<SignatureRecord | null> {
    const { rows } = await this.pool.query<SignatureRow>(
      `SELECT * FROM on_chain_signatures WHERE id = $1`,
      [id],
    );
    return rows[0] ? mapSignature(rows[0]) : null;
  }

  /** Firmas de una entidad (para la ficha de la habitación y la auditoría de la operación). */
  async listByEntity(entityType: SignatureEntityType, entityId: string): Promise<SignatureRecord[]> {
    const { rows } = await this.pool.query<SignatureRow>(
      `SELECT * FROM on_chain_signatures
        WHERE entity_type = $1 AND entity_id = $2
        ORDER BY created_at DESC`,
      [entityType, entityId],
    );
    return rows.map(mapSignature);
  }
}

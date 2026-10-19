import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AuditEntryRecord } from "../db/repositories/audit.repository";
import { canonicalJson } from "../domain/canonical-json";

/**
 * Exportación **firmada y reproducible** del expediente de auditoría (Fase 3 · A10 · T9.6).
 *
 * El expediente se firma con HMAC-SHA256 sobre la representación canónica del documento (mismo
 * `canonicalJson` que la cadena de auditoría), de modo que:
 *   - dos exportaciones del mismo contenido producen **la misma firma**;
 *   - cualquier manipulación de una fila o del orden cambia el dígito y la firma;
 *   - el verificador externo solo necesita la clave y el algoritmo, ambos declarados en el documento.
 *
 * La clave vive en `AUDIT_EXPORT_SECRET` (nunca en el repositorio). Si no está configurada se
 * deriva de `JWT_SECRET` y el documento lo declara con `keyId: "jwt-derived"` para que la
 * verificación sea honesta sobre qué clave se usó.
 */

export interface AuditExportEntry {
  readonly id: string;
  readonly actorUsername: string;
  readonly actorRole: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly action: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly terminalId: string | null;
  readonly prevHash: string | null;
  readonly integrityHash: string;
  readonly createdAt: string;
}

export interface AuditExportDocument {
  readonly schema: "hotel-audit-export/v1";
  readonly generatedAt: string;
  readonly algorithm: "HMAC-SHA256";
  readonly keyId: string;
  readonly chainVerified: boolean;
  readonly entries: readonly AuditExportEntry[];
  readonly digest: string;
  readonly signature: string;
}

export interface BuildAuditExportInput {
  readonly entries: readonly AuditEntryRecord[];
  readonly chainVerified: boolean;
  readonly generatedAt?: string;
  readonly secret: string;
  readonly keyId?: string;
}

function toExportEntry(entry: AuditEntryRecord): AuditExportEntry {
  return {
    id: entry.id,
    actorUsername: entry.actorUsername,
    actorRole: entry.actorRole,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    action: entry.action,
    oldValue: entry.oldValue ?? null,
    newValue: entry.newValue ?? null,
    terminalId: entry.terminalId ?? null,
    prevHash: entry.prevHash ?? null,
    integrityHash: entry.integrityHash,
    createdAt:
      entry.createdAt instanceof Date ? entry.createdAt.toISOString() : new Date(entry.createdAt).toISOString(),
  };
}

/** Documento canónico sin firma: es lo que se firma y lo que un tercero puede recomputar. */
export function auditExportCanonicalBody(input: {
  generatedAt: string;
  keyId: string;
  chainVerified: boolean;
  entries: readonly AuditExportEntry[];
}): string {
  return canonicalJson({
    schema: "hotel-audit-export/v1",
    generatedAt: input.generatedAt,
    keyId: input.keyId,
    chainVerified: input.chainVerified,
    entries: input.entries,
  });
}

/** Construye el expediente firmado a partir de las filas del repositorio. */
export function buildSignedAuditExport(input: BuildAuditExportInput): AuditExportDocument {
  const entries = input.entries.map(toExportEntry);
  const generatedAt = new Date(input.generatedAt ?? Date.now()).toISOString();
  const keyId = input.keyId ?? "audit-export";
  const body = auditExportCanonicalBody({
    generatedAt,
    keyId,
    chainVerified: input.chainVerified,
    entries,
  });
  const digest = `sha256:${createHash("sha256").update(body).digest("hex")}`;
  const signature = `hmac-sha256:${createHmac("sha256", input.secret).update(body).digest("hex")}`;
  return {
    schema: "hotel-audit-export/v1",
    generatedAt,
    algorithm: "HMAC-SHA256",
    keyId,
    chainVerified: input.chainVerified,
    entries,
    digest,
    signature,
  };
}

/** Verifica digest y firma de un expediente (para auditoría externa con la misma clave). */
export function verifyAuditExport(
  document: AuditExportDocument,
  secret: string,
): { ok: boolean; expectedDigest: string; expectedSignature: string } {
  const body = auditExportCanonicalBody({
    generatedAt: document.generatedAt,
    keyId: document.keyId,
    chainVerified: document.chainVerified,
    entries: document.entries,
  });
  const expectedDigest = `sha256:${createHash("sha256").update(body).digest("hex")}`;
  const expectedSignature = `hmac-sha256:${createHmac("sha256", secret).update(body).digest("hex")}`;
  const safeEqual = (a: string, b: string): boolean => {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  };
  return {
    ok: safeEqual(document.digest, expectedDigest) && safeEqual(document.signature, expectedSignature),
    expectedDigest,
    expectedSignature,
  };
}

/** Render CSV del expediente firmado (la firma sigue cubriendo el JSON canónico). */
export function auditExportToCsv(document: AuditExportDocument): string {
  const header = [
    "id",
    "createdAt",
    "actorUsername",
    "actorRole",
    "entityType",
    "entityId",
    "action",
    "prevHash",
    "integrityHash",
    "oldValue",
    "newValue",
  ];
  const escape = (value: string | null): string => `"${(value ?? "").replace(/"/g, '""')}"`;
  const lines = document.entries.map((entry) =>
    [
      entry.id,
      entry.createdAt,
      entry.actorUsername,
      entry.actorRole,
      entry.entityType,
      entry.entityId,
      entry.action,
      entry.prevHash,
      entry.integrityHash,
      entry.oldValue === null ? null : JSON.stringify(entry.oldValue),
      entry.newValue === null ? null : JSON.stringify(entry.newValue),
    ]
      .map((value) => escape(value))
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

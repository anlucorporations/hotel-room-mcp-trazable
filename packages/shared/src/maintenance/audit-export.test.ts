import { describe, expect, it } from "vitest";
import type { AuditEntryRecord } from "../db/repositories/audit.repository";
import {
  auditExportToCsv,
  buildSignedAuditExport,
  verifyAuditExport,
} from "./audit-export";

const SECRET = "clave-de-prueba-a10";

function entry(overrides: Partial<AuditEntryRecord> = {}): AuditEntryRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    actorUsername: "ama@hotel.es",
    actorRole: "HEAD_KEEPER",
    entityType: "DAMAGE_CHARGE",
    entityId: "00000000-0000-4000-8000-000000000002",
    action: "CREATE",
    oldValue: null,
    newValue: { amountCents: 4500 },
    terminalId: null,
    prevHash: null,
    integrityHash: "0xabc",
    createdAt: new Date("2026-10-19T10:00:00Z"),
    ...overrides,
  };
}

describe("exportación firmada de auditoría (A10 · T9.6)", () => {
  it("es reproducible: mismo contenido y clave → misma firma", () => {
    const input = {
      entries: [entry(), entry({ id: "00000000-0000-4000-8000-000000000003", prevHash: "0xabc", integrityHash: "0xdef", createdAt: new Date("2026-10-19T10:01:00Z") })],
      chainVerified: true,
      generatedAt: new Date("2026-10-19T10:05:00Z"),
      secret: SECRET,
      keyId: "audit-export",
    };
    const first = buildSignedAuditExport(input);
    const second = buildSignedAuditExport(input);
    expect(first.signature).toBe(second.signature);
    expect(first.digest).toBe(second.digest);
    expect(verifyAuditExport(first, SECRET).ok).toBe(true);
  });

  it("cualquier manipulación del expediente rompe la verificación", () => {
    const document = buildSignedAuditExport({
      entries: [entry()],
      chainVerified: true,
      generatedAt: new Date("2026-10-19T10:05:00Z"),
      secret: SECRET,
      keyId: "audit-export",
    });
    const tampered = {
      ...document,
      entries: [{ ...document.entries[0]!, newValue: { amountCents: 1 } }],
    };
    expect(verifyAuditExport(tampered, SECRET).ok).toBe(false);
    expect(verifyAuditExport(document, "otra-clave").ok).toBe(false);
  });

  it("el CSV conserva la firma del JSON canónico y escapa comillas", () => {
    const document = buildSignedAuditExport({
      entries: [entry({ newValue: { note: 'dijo "no"' } })],
      chainVerified: false,
      generatedAt: new Date("2026-10-19T10:05:00Z"),
      secret: SECRET,
      keyId: "audit-export",
    });
    const csv = auditExportToCsv(document);
    expect(csv.split("\n")[0]).toContain("integrityHash");
    expect(csv).toContain('""note""');
    expect(verifyAuditExport(document, SECRET).ok).toBe(true);
  });
});

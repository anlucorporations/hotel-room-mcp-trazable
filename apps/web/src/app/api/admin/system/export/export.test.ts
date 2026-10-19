import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState } from "../../../../../../test/guard-mock";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockAudit } = vi.hoisted(() => ({
  mockAudit: {
    list: vi.fn(),
    verifyChain: vi.fn(),
  },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return { ...actual, AuditRepository: vi.fn(() => mockAudit) };
});

import { GET } from "./route";

describe("API exportación firmada de auditoría (A10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
    process.env.AUDIT_EXPORT_SECRET = "clave-de-prueba";
    mockAudit.list.mockResolvedValue([]);
    mockAudit.verifyChain.mockResolvedValue({ ok: true, checked: 0 });
  });

  it("exige owner y devuelve expediente firmado reproducible", async () => {
    const res = await GET(new NextRequest("http://localhost/api/admin/system/export"));
    expect(res.status).toBe(200);
    expect(lastRequiredRole()).toBe("DEFAULT_ADMIN_ROLE");
    const doc = await res.json();
    expect(doc.schema).toBe("hotel-audit-export/v1");
    expect(doc.algorithm).toBe("HMAC-SHA256");
    expect(doc.keyId).toBe("audit-export");
    expect(doc.chainVerified).toBe(true);
    expect(doc.signature).toMatch(/^hmac-sha256:[0-9a-f]{64}$/);
    expect(doc.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("devuelve también CSV si se pide", async () => {
    const res = await GET(new NextRequest("http://localhost/api/admin/system/export?format=csv"));
    const doc = await res.json();
    expect(doc.format).toBe("csv");
    expect(doc.csv).toContain("integrityHash");
  });
});

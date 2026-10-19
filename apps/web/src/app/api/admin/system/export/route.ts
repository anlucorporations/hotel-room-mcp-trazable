import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AuditRepository, auditExportToCsv, buildSignedAuditExport } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const auditRepo = new AuditRepository();

/**
 * GET /api/admin/system/export — exportación **firmada** del expediente de auditoría (A10 · T9.6).
 *
 * Solo owner. Devuelve el documento JSON firmado (HMAC-SHA256 sobre el JSON canónico) con la
 * verificación de la cadena append-only incluida; `?format=csv` devuelve además la representación
 * CSV, cuya firma sigue cubriendo el JSON canónico. No expone la clave.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";
  const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? "1000");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 1_000) : 1_000;

  // Clave de firma: dedicada si existe; si no, derivada de JWT_SECRET con `keyId` explícito.
  const dedicated = process.env.AUDIT_EXPORT_SECRET;
  const fallback = process.env.JWT_SECRET;
  const secret = dedicated ?? fallback;
  if (!secret) {
    return NextResponse.json(
      { error: "EXPORT_NOT_CONFIGURED", message: "Falta AUDIT_EXPORT_SECRET (o JWT_SECRET) para firmar el expediente." },
      { status: 503 },
    );
  }

  try {
    const [entries, chain] = await Promise.all([
      auditRepo.list({ limit }),
      auditRepo.verifyChain(),
    ]);
    const document = buildSignedAuditExport({
      entries,
      chainVerified: chain.ok,
      secret,
      keyId: dedicated ? "audit-export" : "jwt-derived",
    });
    if (format === "csv") {
      return NextResponse.json({
        ...document,
        format: "csv",
        csv: auditExportToCsv(document),
      });
    }
    return NextResponse.json({ ...document, format: "json" });
  } catch (error: unknown) {
    console.error("[API /api/admin/system/export] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo exportar el expediente de auditoría." },
      { status: 500 },
    );
  }
}

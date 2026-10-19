import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián de la **Suite de Mantenimiento vNext** (F4).
 *
 * Los componentes son de cliente y las pruebas de DOM puras no aportan aquí; lo que sí es un
 * contrato verificable (y lo que romperá los E2E si falta) es:
 *   1. Las rutas de la suite existen y están protegidas por el layout de sesión.
 *   2. Los `data-testid` que el plan exige (`requires-signature`, `signature-preview`,
 *      `signature-pending-anchor`, `evidence-missing`, `wallet-disconnected`) están en el código.
 *   3. Las acciones firmables son exactamente ROOM_BLOCK/ROOM_UNBLOCK/PREVENTIVE_TASK.
 *   4. Los componentes de cliente no importan el barril de servidor (`@hotel/shared`).
 *   5. Las claves i18n nuevas de la suite existen en ES/EN/RU.
 */

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const APP = `${ROOT}src/app/mantenimiento`;
const COMPONENTS = `${ROOT}src/components/maintenance`;
const MESSAGES = `${ROOT}messages`;

const read = (path: string): string => readFileSync(path, "utf8");

const CLIENT_COMPONENTS = [
  "SignatureGate.tsx",
  "SignaturePreviewModal.tsx",
  "SignaturePendingBanner.tsx",
  "EvidenceMissingNotice.tsx",
  "IncidentList.tsx",
  "IncidentDetail.tsx",
  "PreventiveBoard.tsx",
  "CommonAreasBoard.tsx",
  "MaintenanceReports.tsx",
  "useMaintenanceSignature.ts",
] as const;

describe("Suite de Mantenimiento · rutas (F4 · T4.1)", () => {
  it("existen las rutas del dashboard, incidencias, preventivo, áreas e informes", () => {
    for (const page of [
      "page.tsx",
      "layout.tsx",
      "incidencias/page.tsx",
      "incidencias/[id]/page.tsx",
      "preventivo/page.tsx",
      "areas-comunes/page.tsx",
      "informes/page.tsx",
      "tablero/page.tsx",
    ]) {
      expect(existsSync(`${APP}/${page}`), page).toBe(true);
    }
  });

  it("el layout exige sesión verificada en servidor y los roles de la suite", () => {
    const layout = read(`${APP}/layout.tsx`);
    expect(layout).toContain("currentAdminSession");
    expect(layout).toContain("MAINTENANCE_SUITE_ROLES");
    expect(layout).toContain("AdminSignInScreen");
  });

  it("cada página RSC vuelve a exigir sesión antes de leer datos (M7 · H1)", () => {
    // El layout decide si pinta a sus hijos, pero el payload RSC de la página viaja igualmente en la
    // respuesta; sin esta segunda comprobación un anónimo recibía los datos del dashboard (F4).
    for (const page of [
      "page.tsx",
      "incidencias/page.tsx",
      "incidencias/[id]/page.tsx",
      "preventivo/page.tsx",
      "areas-comunes/page.tsx",
      "informes/page.tsx",
      "tablero/page.tsx",
    ]) {
      const source = read(`${APP}/${page}`);
      expect(source, `${page} debe revalidar la sesión`).toContain("currentMaintenanceSession");
      expect(source, `${page} debe devolver null sin sesión`).toContain("if (!session.ok) return null;");
    }
  });
});

describe("Suite de Mantenimiento · oráculos de firma (F4 · T4.3)", () => {
  it("todos los componentes de la suite existen", () => {
    for (const file of CLIENT_COMPONENTS) {
      expect(existsSync(`${COMPONENTS}/${file}`), file).toBe(true);
    }
  });

  it("los data-testid exigidos por el plan están presentes", () => {
    const expectations: Array<[string, string]> = [
      ["SignatureGate.tsx", 'data-testid="requires-signature"'],
      ["SignatureGate.tsx", 'data-testid={enabled ? undefined : "wallet-disconnected"}'],
      ["SignaturePreviewModal.tsx", 'testId="signature-preview"'],
      ["SignaturePreviewModal.tsx", 'data-testid="signature-confirm"'],
      ["SignaturePendingBanner.tsx", 'data-testid="signature-pending-anchor"'],
      ["EvidenceMissingNotice.tsx", 'data-testid="evidence-missing"'],
      ["IncidentList.tsx", 'data-testid="incident-list"'],
      ["IncidentList.tsx", 'data-testid="empty-state"'],
      ["IncidentDetail.tsx", 'data-testid="incident-detail"'],
      ["PreventiveBoard.tsx", 'data-testid="preventive-board"'],
      ["CommonAreasBoard.tsx", 'data-testid="common-areas-board"'],
      ["MaintenanceReports.tsx", 'data-testid="maintenance-reports"'],
    ];
    for (const [file, snippet] of expectations) {
      expect(read(`${COMPONENTS}/${file}`), `${file} :: ${snippet}`).toContain(snippet);
    }
  });

  it("la firma cubre exactamente las tres acciones del ciclo", () => {
    const hook = read(`${COMPONENTS}/useMaintenanceSignature.ts`);
    expect(hook).toContain('"ROOM_BLOCK"');
    expect(hook).toContain('"ROOM_UNBLOCK"');
    expect(hook).toContain('"PREVENTIVE_TASK"');
    expect(hook).toContain("signTypedDataAsync");
    // La firma se prepara, se confirma en servidor y solo después se aplica el cambio off-chain.
    expect(hook).toContain("/api/mantenimiento/signatures");
    expect(hook).toContain("await input.apply(prepared.signatureId)");
  });

  it("los componentes de cliente NO importan el barril de servidor", () => {
    for (const file of CLIENT_COMPONENTS) {
      const source = read(`${COMPONENTS}/${file}`);
      expect(source, `${file} importa @hotel/shared (arrastra pg)`) .not.toMatch(/from "@hotel\/shared"/);
      expect(source, `${file} no declara "use client"`).toContain('"use client"');
    }
  });
});

describe("Suite de Mantenimiento · i18n (F4 · T4.8)", () => {
  it("las claves de la suite existen en ES/EN/RU", () => {
    const keys = [
      "nav.dashboard",
      "nav.incidents",
      "nav.preventive",
      "nav.areas",
      "nav.reports",
      "dashboardTagline",
      "incidentsTagline",
      "incidentDetailTitle",
      "blockTitle",
      "unblockTitle",
      "preventiveSignatureNote",
      "areasTitle",
      "reportsTitle",
      "signature.required",
      "signature.connectHint",
      "signature.previewHint",
      "signature.pendingAnchor",
      "evidence.missing",
    ];
    for (const locale of ["es", "en", "ru"]) {
      const catalog = JSON.parse(read(`${MESSAGES}/${locale}.json`)) as {
        maintenance: Record<string, unknown>;
      };
      for (const key of keys) {
        const parts = key.split(".");
        let cursor: unknown = catalog.maintenance;
        for (const part of parts) {
          cursor = typeof cursor === "object" && cursor !== null ? (cursor as Record<string, unknown>)[part] : undefined;
        }
        expect(cursor, `${locale} :: maintenance.${key}`).toBeTypeOf("string");
      }
    }
  });
});

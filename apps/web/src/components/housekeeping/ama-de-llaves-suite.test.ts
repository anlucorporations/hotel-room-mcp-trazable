import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián de la **Suite Ama de llaves** (F6).
 *
 * Fija lo que romperían los E2E si faltara: rutas de la suite, `data-testid` del plan, componentes
 * de cliente sin el barril de servidor, revalidación de sesión en cada página RSC (M7 · H1) y las
 * claves i18n nuevas en ES/EN/RU.
 */

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const APP = `${ROOT}src/app/ama-de-llaves`;
const COMPONENTS = `${ROOT}src/components/housekeeping`;
const MESSAGES = `${ROOT}messages`;

const read = (path: string): string => readFileSync(path, "utf8");

describe("Suite Ama de llaves · rutas (F6 · T6.1)", () => {
  it("existen dashboard, turnos, asignaciones, inspecciones, daños y suministros", () => {
    for (const page of [
      "layout.tsx",
      "page.tsx",
      "turnos/page.tsx",
      "asignaciones/page.tsx",
      "inspecciones/page.tsx",
      "danos/page.tsx",
      "suministros/page.tsx",
    ]) {
      expect(existsSync(`${APP}/${page}`), page).toBe(true);
    }
  });

  it("el layout exige sesión y los roles de la suite", () => {
    const layout = read(`${APP}/layout.tsx`);
    expect(layout).toContain("currentAdminSession");
    expect(layout).toContain("HOUSEKEEPING_SUITE_ROLES");
    expect(layout).toContain("AdminSignInScreen");
  });

  it("cada página RSC revalida la sesión antes de leer datos (M7 · H1)", () => {
    for (const page of [
      "page.tsx",
      "turnos/page.tsx",
      "asignaciones/page.tsx",
      "inspecciones/page.tsx",
      "danos/page.tsx",
      "suministros/page.tsx",
    ]) {
      const source = read(`${APP}/${page}`);
      expect(source, `${page} debe revalidar la sesión`).toContain("currentHousekeepingSession");
      expect(source, `${page} debe devolver null sin sesión`).toContain("if (!session.ok) return null;");
    }
  });
});

describe("Suite Ama de llaves · componentes y oráculos (F6 · T6.2)", () => {
  it("existen los componentes del ciclo", () => {
    for (const file of [
      "RoomStateBoard.tsx",
      "ShiftPlanner.tsx",
      "AssignmentBoard.tsx",
      "InspectionPanel.tsx",
      "InspectionRejectForm.tsx",
      "ReportIncidentFromHousekeeping.tsx",
    ]) {
      expect(existsSync(`${COMPONENTS}/${file}`), file).toBe(true);
    }
  });

  it("los data-testid del plan están presentes", () => {
    const expectations: Array<[string, string]> = [
      ["RoomStateBoard.tsx", 'data-testid="room-state-board"'],
      ["RoomStateBoard.tsx", "data-testid={`room-state-${state}`}"],
      ["ShiftPlanner.tsx", 'data-testid="shift-planner"'],
      ["AssignmentBoard.tsx", 'data-testid="assignment-board"'],
      ["InspectionPanel.tsx", 'data-testid="inspection-panel"'],
      ["InspectionPanel.tsx", 'data-testid="inspection-result"'],
      ["InspectionRejectForm.tsx", 'data-testid="inspection-reject-form"'],
      ["ReportIncidentFromHousekeeping.tsx", 'data-testid="report-incident-housekeeping"'],
    ];
    for (const [file, snippet] of expectations) {
      expect(read(`${COMPONENTS}/${file}`), `${file} :: ${snippet}`).toContain(snippet);
    }
    expect(read(`${APP}/suministros/page.tsx`)).toContain('data-testid="supplies-board"');
    expect(read(`${APP}/suministros/page.tsx`)).toContain('data-testid="supply-alert"');
  });

  it("la inspección reutiliza el flujo de firma de F4 y respeta el flag", () => {
    const panel = read(`${COMPONENTS}/InspectionPanel.tsx`);
    expect(panel).toContain('action: "INSPECTION"');
    expect(panel).toContain("signAndApply");
    expect(panel).toContain("signatureRequired");
    // Evidencia no bloqueante (D-C12) y previsualización antes de firmar.
    expect(panel).toContain("EvidenceMissingNotice");
    expect(panel).toContain("SignaturePreviewModal");
  });

  it("los componentes de cliente no importan el barril de servidor", () => {
    for (const file of [
      "RoomStateBoard.tsx",
      "ShiftPlanner.tsx",
      "AssignmentBoard.tsx",
      "InspectionPanel.tsx",
      "InspectionRejectForm.tsx",
      "ReportIncidentFromHousekeeping.tsx",
    ]) {
      const source = read(`${COMPONENTS}/${file}`);
      expect(source, `${file} importa el barril raíz`).not.toMatch(/from "@hotel\/shared"/);
      expect(source, `${file} no declara "use client"`).toContain('"use client"');
    }
    // El tablero tipa con el entry isomorfo, que sí es apto para cliente.
    expect(read(`${COMPONENTS}/RoomStateBoard.tsx`)).toContain('from "@hotel/shared/domain"');
  });
});

describe("Suite Ama de llaves · i18n (F6 · T6.8)", () => {
  it("las claves de la suite existen en ES/EN/RU", () => {
    const keys = [
      "nav.dashboard",
      "nav.shifts",
      "nav.assignments",
      "nav.inspections",
      "nav.damages",
      "nav.supplies",
      "board.caption",
      "state.MAINTENANCE",
      "inspections.signatureOn",
      "inspections.signatureOff",
      "inspections.noSaleNote",
      "assignments.title",
      "shifts.title",
      "report.title",
      "damages.comingSoon",
      "supplies.alertsTitle",
    ];
    for (const locale of ["es", "en", "ru"]) {
      const catalog = JSON.parse(read(`${MESSAGES}/${locale}.json`)) as {
        amaDeLlaves: Record<string, unknown>;
      };
      for (const key of keys) {
        const parts = key.split(".");
        let cursor: unknown = catalog.amaDeLlaves;
        for (const part of parts) {
          cursor = typeof cursor === "object" && cursor !== null ? (cursor as Record<string, unknown>)[part] : undefined;
        }
        expect(cursor, `${locale} :: amaDeLlaves.${key}`).toBeTypeOf("string");
      }
    }
  });
});

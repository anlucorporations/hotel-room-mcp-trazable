import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián del cierre F10: D-C40, publicación manual sin firma, reporte de incidencias por recepción
 * y puertas de sesión de las nuevas páginas.
 */
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const read = (p: string): string => readFileSync(p, "utf8");

describe("F10 · Recepción vNext y cierre", () => {
  it("D-C40: /housekeeping redirige permanentemente a /ama-de-llaves", () => {
    const config = read(`${ROOT}next.config.mjs`);
    expect(config).toContain('source: "/housekeeping"');
    expect(config).toContain('destination: "/ama-de-llaves"');
    expect(config).toContain("permanent: true");
  });

  it("recepción reporta incidencias y cambia la publicación sin firma on-chain", () => {
    const incident = read(`${ROOT}src/app/api/mantenimiento/incidents/route.ts`);
    expect(incident).toContain("RECEPTION_ROLE");
    const publication = read(`${ROOT}src/app/api/reception/rooms/[roomNumber]/publication/route.ts`);
    expect(publication).toContain("setPublicationStatus");
    expect(publication).not.toContain("signature");
    expect(read(`${ROOT}src/components/reception/ReceptionIncidentPanel.tsx`)).toContain(
      'data-testid="reception-incident-panel"',
    );
    expect(read(`${ROOT}src/components/reception/RoomPublicationPanel.tsx`)).toContain(
      'data-testid="room-publication-panel"',
    );
  });

  it("las páginas nuevas viven bajo la puerta de sesión de recepción", () => {
    const layout = read(`${ROOT}src/app/recepcion/layout.tsx`);
    expect(layout).toContain('currentAdminSession("RECEPTION_ROLE")');
    for (const file of ["src/app/recepcion/incidencias/page.tsx", "src/app/recepcion/habitaciones/page.tsx"]) {
      expect(read(`${ROOT}${file}`)).toContain("force-dynamic");
    }
  });
});

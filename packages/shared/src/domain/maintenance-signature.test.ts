import { describe, expect, it } from "vitest";
import {
  MAINTENANCE_PUBLICATION_STATUS,
  isRoomBlockedByMaintenance,
  preventiveTaskRequiresSignature,
  publicationStatusAfterUnblock,
  requiresSignatureForMaintenanceAction,
} from "./maintenance";

/**
 * Reglas de firma selectiva y bloqueo de mantenimiento (F4 · T4.6).
 *
 * Son puras y las consumen tanto la UI (qué acciones piden wallet) como la API (qué acciones
 * rechazan sin `signatureId`), así que la prueba fija la regla en un único sitio.
 */

describe("requiresSignatureForMaintenanceAction (D-C23/D-C34)", () => {
  it("bloquear y desbloquear una habitación exigen firma SIEMPRE", () => {
    expect(requiresSignatureForMaintenanceAction("ROOM_BLOCK")).toBe(true);
    expect(requiresSignatureForMaintenanceAction("ROOM_UNBLOCK")).toBe(true);
    // Ninguna opción puede desactivarlo: afecta a la venta pública.
    expect(
      requiresSignatureForMaintenanceAction("ROOM_BLOCK", {
        isCritical: false,
        inspectionRequiresSignature: false,
      }),
    ).toBe(true);
  });

  it("la tarea preventiva solo exige firma si el área es crítica", () => {
    expect(requiresSignatureForMaintenanceAction("PREVENTIVE_TASK", { isCritical: true })).toBe(true);
    expect(requiresSignatureForMaintenanceAction("PREVENTIVE_TASK", { isCritical: false })).toBe(false);
    expect(preventiveTaskRequiresSignature(true)).toBe(true);
    expect(preventiveTaskRequiresSignature(false)).toBe(false);
  });

  it("la inspección depende del flag INSPECTION_REQUIRES_SIGNATURE (false por defecto)", () => {
    expect(requiresSignatureForMaintenanceAction("INSPECTION")).toBe(false);
    expect(
      requiresSignatureForMaintenanceAction("INSPECTION", { inspectionRequiresSignature: true }),
    ).toBe(true);
  });
});

describe("publicationStatusAfterUnblock (restauración tras desbloqueo)", () => {
  it("restaura el estado previo real", () => {
    expect(publicationStatusAfterUnblock("PUBLISHED")).toBe("PUBLISHED");
    expect(publicationStatusAfterUnblock("PAUSED")).toBe("PAUSED");
    expect(publicationStatusAfterUnblock("OUT_OF_SERVICE")).toBe("OUT_OF_SERVICE");
    expect(publicationStatusAfterUnblock("DRAFT")).toBe("DRAFT");
  });

  it("nunca restaura MAINTENANCE y cae a DRAFT si no hay historial o es inválido", () => {
    expect(publicationStatusAfterUnblock("MAINTENANCE")).toBe("DRAFT");
    expect(publicationStatusAfterUnblock(null)).toBe("DRAFT");
    expect(publicationStatusAfterUnblock(undefined)).toBe("DRAFT");
    expect(publicationStatusAfterUnblock("INVENTADO")).toBe("DRAFT");
  });
});

describe("isRoomBlockedByMaintenance (D-V7/D-53)", () => {
  it("MAINTENANCE o una incidencia abierta sacan la habitación del canal público", () => {
    expect(isRoomBlockedByMaintenance(MAINTENANCE_PUBLICATION_STATUS)).toBe(true);
    expect(isRoomBlockedByMaintenance("PUBLISHED", true)).toBe(true);
    expect(isRoomBlockedByMaintenance("PUBLISHED")).toBe(false);
    expect(isRoomBlockedByMaintenance("DRAFT")).toBe(false);
    expect(isRoomBlockedByMaintenance(null)).toBe(false);
  });
});

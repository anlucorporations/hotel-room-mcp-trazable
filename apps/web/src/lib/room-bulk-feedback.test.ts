import { describe, expect, it } from "vitest";
import {
  UNKNOWN_BULK_ERROR,
  bulkPublishErrorEntries,
  summarizeBulkPublishResults,
} from "./room-bulk-feedback";

/**
 * Guardián del **motivo real** de un fallo de publicación masiva (2026-10-21).
 *
 * El 400 del endpoint trae `results` con el error de cada habitación. Antes la interfaz lo descartaba
 * y enseñaba un aviso genérico; estas pruebas fijan que el resumen conserva y ordena esos motivos.
 */
describe("summarizeBulkPublishResults", () => {
  it("cuenta publicadas y fallos, y agrupa los motivos", () => {
    const feedback = summarizeBulkPublishResults(
      [
        { ok: true },
        { ok: false, error: "PUBLISH_REQUIRES_IMAGE" },
        { ok: false, error: "PUBLISH_REQUIRES_IMAGE" },
        { ok: false, error: "ALREADY_PUBLISHED" },
      ],
      1,
    );
    expect(feedback.published).toBe(1);
    expect(feedback.failed).toBe(3);
    expect(feedback.errors).toEqual({ PUBLISH_REQUIRES_IMAGE: 2, ALREADY_PUBLISHED: 1 });
    expect(feedback.mainError).toBe("PUBLISH_REQUIRES_IMAGE");
  });

  it("sin `published` del endpoint, cuenta las entradas ok", () => {
    expect(summarizeBulkPublishResults([{ ok: true }, { ok: false, error: "ROOM_NOT_FOUND" }]).published).toBe(1);
  });

  it("un fallo sin código se atribuye a un error interno y no se pierde", () => {
    const feedback = summarizeBulkPublishResults([{ ok: false }]);
    expect(feedback.failed).toBe(1);
    expect(feedback.errors).toEqual({ [UNKNOWN_BULK_ERROR]: 1 });
  });

  it("tolera `results` ausente o que no sea una lista", () => {
    expect(summarizeBulkPublishResults(null)).toEqual({
      published: 0,
      failed: 0,
      errors: {},
      mainError: null,
    });
    expect(summarizeBulkPublishResults(undefined).mainError).toBeNull();
  });

  it("en empate, el motivo principal es el primero que aparece", () => {
    const feedback = summarizeBulkPublishResults([
      { ok: false, error: "ALREADY_PUBLISHED" },
      { ok: false, error: "PUBLISH_REQUIRES_IMAGE" },
    ]);
    expect(feedback.mainError).toBe("ALREADY_PUBLISHED");
  });
});

describe("bulkPublishErrorEntries", () => {
  it("ordena por número de fallos y, en empate, pone primero los motivos conocidos", () => {
    const feedback = summarizeBulkPublishResults([
      { ok: false, error: "INTERNAL_SERVER_ERROR" },
      { ok: false, error: "PUBLISH_REQUIRES_IMAGE" },
      { ok: false, error: "PUBLISH_REQUIRES_IMAGE" },
    ]);
    expect(bulkPublishErrorEntries(feedback)).toEqual([
      { code: "PUBLISH_REQUIRES_IMAGE", count: 2 },
      { code: "INTERNAL_SERVER_ERROR", count: 1 },
    ]);
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián de reseñas (F6 · D-58, D-59).
 *
 * Comprueba sobre el código real que se cumplen las dos reglas del plan:
 *   - **D-59**: solo reseña el titular de una noche **consumida** y con **firma EIP-712**;
 *   - **D-58**: la reseña nace `PENDING`, la modera el administrador **con motivo** y **solo las
 *     aprobadas** se publican.
 */
const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

const readRepo = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../../packages/shared/src/db/repositories/${name}`, import.meta.url)),
    "utf8",
  );

describe("Guardián de reseñas (F6 · D-58/D-59)", () => {
  it("el alta exige noche consumida y firma del titular (D-59)", () => {
    const route = read("app/api/reviews/route.ts");
    expect(route).toContain("requireReviewOwnership(");
    expect(route).toContain("CHECKED_OUT");
  });

  it("solo las reseñas aprobadas se publican (D-58)", () => {
    const repo = readRepo("reviews.repository.ts");
    // La lectura pública filtra por APPROVED; la media también.
    expect(repo).toContain("status = 'APPROVED'");
    expect(repo).toContain("WHERE status = 'APPROVED'");
  });

  it("la moderación deja motivo y solo actúa sobre PENDING (D-58)", () => {
    const route = read("app/api/admin/reviews/[id]/route.ts");
    expect(route).toContain("moderate(");
    expect(route).toContain("DEFAULT_ADMIN_ROLE");
    const repo = readRepo("reviews.repository.ts");
    expect(repo).toContain("status = 'PENDING'");
    expect(repo).toContain("moderation_notes");
  });

  it("la nota va dentro de la firma de la reseña (D-59)", () => {
    const auth = readFileSync(
      fileURLToPath(new URL("../../../../packages/shared/src/domain/ticket-auth.ts", import.meta.url)),
      "utf8",
    );
    expect(auth).toContain("SubmitReview");
    expect(auth).toMatch(/name: "rating", type: "uint8"/);
  });
});

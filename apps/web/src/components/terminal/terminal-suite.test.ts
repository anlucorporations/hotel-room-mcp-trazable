import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Guardián del terminal (F5): rutas, oráculos, sin datos sensibles y i18n. */
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const read = (p: string): string => readFileSync(p, "utf8");

describe("Terminal de mantenimiento · estructura (F5)", () => {
  it("existen páginas, componentes y APIs del ciclo", () => {
    for (const path of [
      "src/app/terminal/layout.tsx",
      "src/app/terminal/page.tsx",
      "src/app/terminal/reportar/page.tsx",
      "src/app/terminal/cambiar-pin/page.tsx",
      "src/components/terminal/PinPad.tsx",
      "src/components/terminal/TerminalBoard.tsx",
      "src/components/terminal/TerminalReportForm.tsx",
      "src/app/api/terminal/auth/route.ts",
      "src/app/api/terminal/auth/change-pin/route.ts",
      "src/app/api/terminal/tasks/route.ts",
      "src/app/api/terminal/incidents/route.ts",
    ]) {
      expect(existsSync(`${ROOT}${path}`), path).toBe(true);
    }
  });

  it("usa los data-testid del plan y la puerta de sesión", () => {
    expect(read(`${ROOT}src/components/terminal/PinPad.tsx`)).toContain('data-testid="terminal-pin"');
    expect(read(`${ROOT}src/components/terminal/TerminalBoard.tsx`)).toContain('data-testid="terminal-board"');
    expect(read(`${ROOT}src/components/terminal/TerminalLogin.tsx`)).toContain('data-testid="terminal-offline"');
    const layout = read(`${ROOT}src/app/terminal/layout.tsx`);
    expect(layout).toContain("readTerminalSessionFromCookieHeader");
    expect(layout).toContain("<TerminalLogin />");
  });

  it("el DTO del terminal no expone importes, huéspedes ni configuración (D-C35)", () => {
    const route = read(`${ROOT}src/app/api/terminal/tasks/route.ts`);
    // Los comentarios del DTO pueden nombrar lo que se excluye; el criterio es que no se serialicen
    // esos campos en la respuesta.
    expect(route).not.toMatch(/amountCents\s*:|priceWei\s*:/);
    expect(route).not.toMatch(/guestName|guestEmail/);
    expect(read(`${ROOT}src/components/terminal/TerminalBoard.tsx`)).not.toContain("@hotel/shared");
    expect(read(`${ROOT}src/components/terminal/PinPad.tsx`)).toContain('"use client"');
  });

  it("i18n del terminal en ES/EN/RU con las claves usadas", () => {
    for (const locale of ["es", "en", "ru"]) {
      const catalog = JSON.parse(read(`${ROOT}messages/${locale}.json`)) as {
        terminal: Record<string, unknown>;
      };
      for (const key of ["loginTitle", "boardTitle", "offline", "reportSubmit", "changePinSubmit"]) {
        expect(catalog.terminal[key], `${locale}:terminal.${key}`).toBeTypeOf("string");
      }
      expect(catalog.terminal.role).toBeTypeOf("object");
      expect(catalog.terminal.kind).toBeTypeOf("object");
    }
  });
});

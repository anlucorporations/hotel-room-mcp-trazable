import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Guardián de F9: paneles, oráculos, rutas y textos. */
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const read = (p: string): string => readFileSync(p, "utf8");

describe("F9 · administración, gobernanza y soporte", () => {
  it("existen paneles y APIs del ciclo", () => {
    for (const path of [
      "src/components/admin/system/TerminalOperatorsPanel.tsx",
      "src/components/admin/system/FlagsPanel.tsx",
      "src/components/admin/system/AnchorQueue.tsx",
      "src/components/admin/system/WalletsPanel.tsx",
      "src/app/api/admin/system/terminal-operators/route.ts",
      "src/app/api/admin/settings/flags/route.ts",
      "src/app/api/admin/settings/flags/confirm/route.ts",
      "src/app/api/admin/system/wallets/route.ts",
    ]) {
      expect(existsSync(`${ROOT}${path}`), path).toBe(true);
    }
  });

  it("usa los data-testid del plan y respeta el orden on-chain primero", () => {
    expect(read(`${ROOT}src/components/admin/system/AnchorQueue.tsx`)).toContain('data-testid="anchor-queue"');
    expect(read(`${ROOT}src/components/admin/system/TerminalOperatorsPanel.tsx`)).toContain('data-testid="terminal-operators-panel"');
    expect(read(`${ROOT}src/components/admin/system/WalletsPanel.tsx`)).toContain('data-testid="wallets-panel"');
    expect(read(`${ROOT}src/components/admin/system/FlagsPanel.tsx`)).toContain('data-testid="flags-panel"');
    const wallets = read(`${ROOT}src/app/api/admin/system/wallets/route.ts`);
    expect(wallets).toContain("hasRoleOnChain");
    expect(wallets).toContain("revokeWallet");
    expect(wallets.indexOf("hasRoleOnChain")).toBeLessThan(wallets.lastIndexOf("revokeWallet"));
  });

  it("i18n de administración con las claves nuevas en ES/EN/RU", () => {
    for (const locale of ["es", "en", "ru"]) {
      const catalog = JSON.parse(read(`${ROOT}messages/${locale}.json`)) as {
        admin: Record<string, unknown>;
      };
      for (const key of ["terminalOperators", "flags", "anchorQueue", "wallets"]) {
        expect(catalog.admin[key], `${locale}:admin.${key}`).toBeTypeOf("object");
      }
    }
  });
});

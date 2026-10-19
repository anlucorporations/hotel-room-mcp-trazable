import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián de **solo lectura** del MCP (F10 · T10.4, DT-AUD-15).
 *
 * El MCP puede construir calldata de compra (`buildPurchaseTx`) para que la firme el usuario, pero
 * **no** puede firmar, custodiar claves ni enviar transacciones. Este guardián recorre el código y
 * falla si aparece cualquier API de escritura.
 */
const SRC = fileURLToPath(new URL(".", import.meta.url));

function sourceFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("MCP · sin capacidad de escritura (T10.4)", () => {
  it("ningún módulo del MCP importa APIs de firma o envío de transacciones", () => {
    const forbidden = [
      "writeContract",
      "sendTransaction",
      "sendRawTransaction",
      "signTransaction",
      "privateKeyToAccount",
      "mnemonicToAccount",
      "WalletClient",
    ];
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const source = readFileSync(file, "utf8");
      for (const token of forbidden) {
        if (source.includes(token)) offenders.push(`${file}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("la herramienta de acciones operativas es de lectura y no recibe claves", () => {
    const source = readFileSync(join(SRC, "tools", "tools.ts"), "utf8");
    expect(source).toContain("getOperationalActions");
    expect(source).toContain("reader.getOperationalActions?.()");
    expect(source).not.toContain("privateKey");
  });
});

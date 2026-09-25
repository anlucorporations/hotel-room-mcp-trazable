import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián de M5 (D-05, D-13): el check-in no puede volver al estado auditado.
 *
 * Los **cinco invariantes** que vigila, todos con una regresión real detrás:
 *   1. **Titularidad obligatoria**: los tres endpoints que emiten el resale/pase (QR, envío por
 *      correo y pase de wallet) usan el helper `requireTicketOwnership`. Antes bastaba con NO enviar
 *      las cabeceras para recibir un pase válido de cualquier noche.
 *   2. **Nada de verificaciones EIP-712 «opcionales»** dentro de las rutas: si una ruta vuelve a
 *      llamar a `verifyEIP712TicketRequest` por su cuenta, es que se está saltando el helper.
 *   3. **Sin PII en los caminos de recepción/PMS**: los nombres de campo de identidad no pueden
 *      reaparecer (ni para aceptarlos ni para devolverlos).
 *   4. **Ancla on-chain canónica**: el servicio de recepción firma `markCheckedIn` con el ABI
 *      canónico `HotelNights`, no con el de la generación legacy, y el adaptador del PMS ya no
 *      genera ninguna ficha policial simulada.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "..");
const REPO_ROOT = resolve(SRC, "..", "..", "..");
const WEB = resolve(REPO_ROOT, "apps", "web");

/** Rutas que emiten el resguardo/pase del huésped. */
const TICKET_ROUTES = [
  "src/app/api/qr/[tokenId]/route.ts",
  "src/app/api/qr/[tokenId]/send-email/route.ts",
  "src/app/api/wallet/pass/[tokenId]/route.ts",
] as const;

const read = (absolutePath: string): string => readFileSync(absolutePath, "utf8");

describe("guardián de recepción y check-in (M5 · D-05 · D-13)", () => {
  it("los tres endpoints del pase exigen titularidad con el helper compartido", () => {
    for (const route of TICKET_ROUTES) {
      const source = read(join(WEB, route));
      expect(source, `${route} debe exigir la titularidad`).toContain("requireTicketOwnership(");
      expect(source, `${route} no debe verificar EIP-712 por su cuenta`).not.toContain(
        "verifyEIP712TicketRequest(",
      );
      // Regresión exacta de H-05: verificar solo «si vienen las cabeceras».
      expect(source, `${route} no puede volver a la verificación opcional`).not.toMatch(
        /if\s*\(\s*walletAddress\s*&&\s*signature/,
      );
    }
  });

  it("ningún camino de recepción/PMS menciona campos de identidad (sin PII)", () => {
    const offenders: string[] = [];
    const piiPattern = /guestName|documentNumber|documentType|guestNationality|travelerFullName/;
    // La lista de campos PROHIBIDOS sí puede nombrarlos: es la que los rechaza.
    const denyListBlock = /const FORBIDDEN_PII_FIELDS = \[[\s\S]*?\] as const;/;

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
        const source = read(full).replace(denyListBlock, "");
        if (piiPattern.test(source)) offenders.push(relative(REPO_ROOT, full));
      }
    };
    walk(join(WEB, "src", "app", "api", "reception"));

    expect(
      offenders,
      `D-13: el registro de viajeros se hace en el PMS del hotel. Ningún camino de recepción ` +
        `puede aceptar ni devolver datos personales:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("el adaptador del PMS no genera ficha policial ni conoce PII", () => {
    const adapter = read(join(REPO_ROOT, "packages", "shared", "src", "pms", "adapter.ts"));

    expect(adapter).not.toMatch(/generatePoliceReport|PoliceReportEntry|travelerFullName/);
    expect(adapter).toContain("policeReportGenerated: false");
  });

  it("el servicio de recepción ancla con el ABI canónico y no con el legacy", () => {
    const service = read(join(REPO_ROOT, "packages", "shared", "src", "reception", "service.ts"));

    expect(service).toContain('from "../abi/hotel-nights"');
    expect(service).not.toContain("hotelNftAbi");
    expect(service).toContain("markCheckedIn");
    // El ancla es obligatoria: sin wallet configurada el check-in no se da por bueno.
    expect(service).toContain("ANCLAJE_NO_CONFIGURADO");
  });

  it("el resguardo es de un solo uso: el servicio consume su `jti`", () => {
    const service = read(join(REPO_ROOT, "packages", "shared", "src", "reception", "service.ts"));

    expect(service).toContain("ticketUse.consume(payload.jti)");
    expect(service).toContain("TICKET_YA_USADO");
  });

  /**
   * M7: la titularidad del pase se comprobaba contra el índice off-chain, que es un espejo escrito
   * por el listener y puede ir retrasado justo en el momento de emitir el resguardo. Ahora decide
   * `ownerOf` on-chain, y los tres endpoints emiten el JWS con el dueño de la CADENA.
   */
  it("los tres endpoints del pase usan el propietario ON-CHAIN como huésped del ticket", () => {
    for (const route of TICKET_ROUTES) {
      const source = read(join(WEB, route));
      expect(source, `${route} debe emitir el ticket con el dueño on-chain`).toContain(
        "guestWallet: ownership.onChainOwner",
      );
      expect(source, `${route} no puede emitir el ticket con el índice`).not.toContain(
        "guestWallet: nft.currentOwner",
      );
    }
  });

  it("el helper de titularidad consulta la cadena y falla en cerrado si no puede (M7)", () => {
    const helper = read(join(WEB, "src/lib/ticket-ownership.ts"));

    expect(helper).toContain("readOnChainOwnership(");
    // RPC caído ⇒ 503 (no se emite nada); token inexistente ⇒ 404.
    expect(helper).toContain("OWNERSHIP_UNVERIFIABLE");
    expect(helper).toContain("TOKEN_NOT_FOUND");
    // La decisión de autorización compara contra el dueño on-chain, no contra el índice.
    expect(helper).toContain("onChain.owner.toLowerCase() !== walletAddress.toLowerCase()");
    // El desajuste índice/cadena se registra en lugar de silenciarse.
    expect(helper).toContain("INDEX_OUT_OF_SYNC");
  });

  /**
   * H3 de la verificación de M7: la titularidad se había endurecido al EMITIR el pase, pero el
   * CANJE seguía creyendo al índice off-chain, y el contrato no comprueba propiedad en
   * `markCheckedIn` (solo exige el rol de recepción). Con el índice retrasado, un resguardo de 7
   * días del dueño anterior consumía una noche ya revendida.
   */
  it("el CANJE del resguardo también verifica la titularidad contra la cadena", () => {
    const service = read(join(REPO_ROOT, "packages", "shared", "src", "reception", "service.ts"));

    expect(service).toContain("readCurrentOwnerOnChain(");
    expect(service).toContain('functionName: "ownerOf"');
    expect(service).toContain("TITULARIDAD_NO_VERIFICABLE");
    // Un identificador de noche no numérico no puede convertirse en `uint256`: resguardo inválido.
    expect(service).toMatch(/\^\\d\+\$\/\.test\(payload\.tokenId\)/);
  });
});

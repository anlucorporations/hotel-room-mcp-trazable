import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián de la **suite pública** y del **cierre de las demás suites** (petición del responsable,
 * 2026-09-28).
 *
 * Dos invariantes que no pueden depender de que alguien los recuerde:
 *
 *   1. **Ningún enlace público apunta a una página que no existe.** La barra de navegación se nutre
 *      de las páginas de detalle: si una se renombra o se borra, el guardián lo dice con su ruta.
 *   2. **La suite pública es la única sin sesión.** Las páginas públicas no importan el guard de
 *      sesión, y las suites de personal sí lo invocan en servidor con su rol (el owner entra a
 *      todas; el personal sin wallet queda en la suya, D-56).
 */

const APP_DIR = fileURLToPath(new URL("../app/", import.meta.url));
const COMPONENTS_DIR = fileURLToPath(new URL("../components/", import.meta.url));

const read = (path: string): string => readFileSync(path, "utf8");

const pageExists = (href: string): boolean =>
  href === "/" ? existsSync(join(APP_DIR, "page.tsx")) : existsSync(join(APP_DIR, href.slice(1), "page.tsx"));

/** Enlaces que declara la cabecera pública (primarios y grupos). */
function headerLinks(): string[] {
  const source = read(join(COMPONENTS_DIR, "layout/SiteHeader.tsx"));
  return [...source.matchAll(/\{ href: "([^"]+)", labelKey:/g)].map((match) => match[1]!);
}

describe("Suite pública · páginas de sección y navegación", () => {
  it("la cabecera declara enlaces de verdad (el guardián no pasa por vacío)", () => {
    expect(headerLinks().length).toBeGreaterThan(12);
  });

  it("cada enlace de la cabecera tiene su página", () => {
    const missing = headerLinks().filter((href) => !pageExists(href));
    expect(missing).toEqual([]);
  });

  it("cada sección resumida de la home enlaza con su página de detalle", () => {
    const home = read(join(COMPONENTS_DIR, "home/HomeSections.tsx"));
    const links = [...home.matchAll(/<MoreLink href="([^"]+)"/g)].map((match) => match[1]!);
    // Servicios, habitaciones, planes, actividades, experiencias, reseñas y contacto.
    expect(links).toEqual([
      "/servicios",
      "/habitaciones",
      "/planes",
      "/actividades",
      "/experiencias",
      "/resenas",
      "/contacto",
    ]);
    for (const href of links) expect(pageExists(href), href).toBe(true);
  });

  it("la home incluye la banda de descubrimiento con Empresa, Instalaciones y Ayuda", () => {
    const home = read(join(COMPONENTS_DIR, "home/HomeSections.tsx"));
    for (const href of ["/empresa", "/instalaciones", "/ayuda"]) {
      expect(home, href).toContain(`href="${href}"`);
      expect(pageExists(href), href).toBe(true);
    }
  });

  it("las páginas públicas NO pasan por la puerta de sesión", () => {
    const publicPages = [
      "page.tsx",
      "catalogo/page.tsx",
      "empresa/page.tsx",
      "instalaciones/page.tsx",
      "servicios/page.tsx",
      "habitaciones/page.tsx",
      "experiencias/page.tsx",
      "actividades/page.tsx",
      "planes/page.tsx",
      "resenas/page.tsx",
      "contacto/page.tsx",
    ];
    const offenders = publicPages.filter((relative) => {
      const source = read(join(APP_DIR, relative));
      return source.includes("admin-session") || source.includes("AdminSignInScreen");
    });
    expect(offenders).toEqual([]);
  });
});

describe("Suites no públicas · puerta de sesión en servidor", () => {
  const GATED = [
    { path: "recepcion/layout.tsx", role: "RECEPTION_ROLE" },
    { path: "housekeeping/layout.tsx", role: "HOUSEKEEPING" },
    { path: "mantenimiento/layout.tsx", role: "MAINTENANCE" },
    { path: "admin/layout.tsx", role: null },
  ] as const;

  it("cada suite no pública valida la sesión en el render y sirve la pantalla de acceso si falta", () => {
    for (const suite of GATED) {
      const source = read(join(APP_DIR, suite.path));
      expect(source, suite.path).toContain("currentAdminSession");
      expect(source, suite.path).toContain("AdminSignInScreen");
    }
  });

  /**
   * **D-82** produjo un efecto colateral que este guardián deja fijado: al pasar `AdminSignInScreen`
   * por la plantilla del back-office, las suites de personal —que reutilizan ese componente— sirven
   * ahora el acceso **con la marca y el título de Administración**, no con los suyos
   * (`reception.gateTitle` = «Acceso de recepción», que hoy no se usa en el gate). La puerta sigue
   * siendo correcta —nadie ve un panel sin sesión—, pero es una decisión de producto pendiente.
   */
  it("el acceso sin sesión de las suites de personal usa aún el acceso genérico (efecto D-82)", () => {
    for (const suite of GATED) {
      if (suite.role === null) continue; // `/admin` sí es su propio ámbito.
      const source = read(join(APP_DIR, suite.path));
      expect(source, `${suite.path} debe seguir sirviendo el acceso canónico`).toMatch(
        /if \(!session\.ok\) return <AdminSignInScreen \/>/,
      );
      // Mientras no exista variante por suite, el acceso compartido es el comportamiento esperado.
      expect(source, `${suite.path} todavía no define pantalla de acceso propia`).not.toMatch(/gate=/);
    }
  });

  it("cada suite de personal exige SU rol (el owner entra a todas)", () => {
    for (const suite of GATED) {
      if (suite.role === null) continue;
      const source = read(join(APP_DIR, suite.path));
      expect(source, `${suite.path} debe exigir ${suite.role}`).toContain(`currentAdminSession("${suite.role}")`);
    }
  });

  it("el guard distingue 401 de 403 y el owner satisface cualquier rol", () => {
    const guard = read(fileURLToPath(new URL("./guard.ts", import.meta.url)));
    expect(guard).toContain('payload.role !== "DEFAULT_ADMIN_ROLE"');
    expect(guard).toContain('reason: "forbidden"');
    expect(guard).toContain('reason: "unauthorized"');
  });
});

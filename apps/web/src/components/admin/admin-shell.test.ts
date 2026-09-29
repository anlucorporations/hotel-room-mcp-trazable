import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ADMIN_ICONS } from "./adminIcons";
import {
  ADMIN_NAV_SECTIONS,
  ADMIN_SYSTEMS_NAV,
  breadcrumbForPathname,
  isActiveHref,
  navEntryForPathname,
  sectionForPathname,
} from "./adminNav";

/**
 * Guardián de la plantilla del back-office (distribución AdminLTE, decisión del responsable
 * 2026-09-29).
 *
 * Nace de un defecto **real** en producción: el acordeón del sidebar usaba el atributo `hidden`
 * junto a la clase `flex`. El preflight de Tailwind v3 declara
 * `[hidden]:where(:not([hidden=until-found])){display:none}` en la **capa base** y con especificidad
 * (0,1,0) —`:where()` no suma—, mientras que `.flex{display:flex}` es una utilidad con la **misma
 * especificidad** y **posterior** en la hoja: el `flex` ganaba y **las siete secciones se pintaban
 * siempre abiertas**. El efecto acordeón no existía, aunque el `aria-expanded` dijera lo contrario.
 * Ninguna prueba lo cubría porque el back-office no tenía guardián de plantilla.
 *
 * Aquí se fijan tres cosas:
 *   1. La **derivación de la ruta** (sección activa, entrada activa y migas), que es la parte pura
 *      y por tanto la que se puede afirmar con datos, no con regex.
 *   2. Que **cada sección tiene icono** (el `Record<AdminIconKey, …>` lo exige en `tsc`; aquí se
 *      comprueba además en ejecución, que es lo que ve el sidebar plegado).
 *   3. El **contrato del shell**: plegado por clase (nunca por el atributo `hidden`), cableado
 *      `aria-expanded`/`aria-controls`, cajón móvil con velo y las piezas de la distribución
 *      AdminLTE (sidebar, navbar, cabecera de contenido con migas, `main` y pie).
 */

const LAYOUT = fileURLToPath(new URL("./AdminLayout.tsx", import.meta.url));
const source = readFileSync(LAYOUT, "utf8");

describe("Back-office · derivación de la ruta (parte pura)", () => {
  it("`isActiveHref` exige el separador (no confunde /admin/mint con /admin/mintaje)", () => {
    expect(isActiveHref("/admin/mint", "/admin/mint")).toBe(true);
    expect(isActiveHref("/admin/mint/", "/admin/mint")).toBe(true);
    expect(isActiveHref("/admin/mintaje", "/admin/mint")).toBe(false);
  });

  it("la sección abierta es la de la ruta activa, también en rutas profundas", () => {
    expect(sectionForPathname("/admin/dashboard")).toBe("administracion");
    expect(sectionForPathname("/admin/mantenimiento/preventivo")).toBe("mantenimiento");
    expect(sectionForPathname("/admin/housekeeping/lenceria")).toBe("housekeeping");
  });

  it("el grupo Sistemas NO abre ninguna sección del acordeón (y una ruta ajena tampoco)", () => {
    expect(sectionForPathname("/admin/sistemas/ajustes")).toBeNull();
    expect(sectionForPathname("/admin")).toBeNull();
    expect(sectionForPathname("/catalogo")).toBeNull();
  });

  it("la entrada activa se resuelve con su sección de origen", () => {
    expect(navEntryForPathname("/admin/resenas")?.section.key).toBe("administracion");
    expect(navEntryForPathname("/admin/resenas")?.item.href).toBe("/admin/resenas");
    expect(navEntryForPathname("/catalogo")).toBeNull();
  });

  it("las migas son Inicio → sección → entrada, sin repetir la etiqueta de la sección", () => {
    expect(breadcrumbForPathname("/admin/mantenimiento/preventivo")).toEqual([
      { href: "/admin/mantenimiento/incidencias", labelKey: "mantenimiento" },
      { href: "/admin/mantenimiento/preventivo", labelKey: "preventivo" },
    ]);
    // Actividades: la entrada se llama igual que su sección ⇒ una sola miga.
    expect(breadcrumbForPathname("/admin/actividades")).toEqual([
      { href: "/admin/actividades", labelKey: "actividades" },
    ]);
    // Sistemas: la portada del grupo es la primera miga.
    expect(breadcrumbForPathname("/admin/sistemas/ajustes")).toEqual([
      { href: ADMIN_SYSTEMS_NAV[0]!.href, labelKey: "systems" },
      { href: "/admin/sistemas/ajustes", labelKey: "settings" },
    ]);
    // Ruta sin correspondencia: la plantilla no inventa un camino.
    expect(breadcrumbForPathname("/admin")).toEqual([]);
  });
});

describe("Back-office · iconos del sidebar", () => {
  it("cada sección del acordeón tiene su icono dibujado", () => {
    const missing = ADMIN_NAV_SECTIONS.filter((section) => ADMIN_ICONS[section.icon] === undefined);
    expect(missing.map((section) => `${section.key} :: ${section.icon}`)).toEqual([]);
  });

  it("los iconos declarados son componentes invocables (no un `Record` a medias)", () => {
    for (const [key, Icon] of Object.entries(ADMIN_ICONS)) {
      expect(typeof Icon, `icono ${key}`).toBe("function");
    }
  });
});

describe("Back-office · contrato del shell (regresión del acordeón)", () => {
  it("el plegado del panel va por CLASE y nunca por el atributo `hidden`", () => {
    // La causa raíz: `hidden={!open}` convivía con `className="… flex …"` y el `flex` ganaba.
    expect(source).not.toMatch(/hidden=\{/);
    // El panel tiene que alternar entre una rama con `flex` y la rama `hidden` (display:none).
    expect(source).toMatch(/className=\{open \? "[^"]*\bflex\b[^"]*" : "hidden"\}/);
  });

  it("cada cabecera de sección está cableada con `aria-expanded` y `aria-controls`", () => {
    expect(source).toContain("aria-expanded={open}");
    expect(source).toContain("aria-controls={`nav-section-panel-${section.key}`}");
    expect(source).toContain("id={`nav-section-panel-${section.key}`}");
    expect(source).toContain("data-testid={`nav-section-${section.key}`}");
  });

  it("la sección abierta se RESINCRONIZA con la ruta (enlace profundo, atrás/adelante, recarga)", () => {
    // Sin este efecto, la entrada activa podía quedar dentro de una sección cerrada.
    expect(source).toMatch(/useEffect\(\(\) => \{\s*setOpenSection\(sectionForPathname\(pathname\)\);\s*\}, \[pathname\]\)/);
  });

  it("el cajón móvil se cierra con velo, con `Escape` y al navegar", () => {
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain("setDrawerOpen(false)");
    // El velo solo existe en móvil y es un botón con nombre accesible (no un `div` con onClick).
    expect(source).toMatch(/aria-label=\{t\("nav\.closeMenu"\)\}[\s\S]{0,160}bg-ocean\/60 tablet:hidden/);
  });

  it("declara las piezas de la distribución AdminLTE (sidebar, navbar, cabecera, main y pie)", () => {
    expect(source).toContain("<aside");
    expect(source).toContain("aria-label={t(\"nav.sidebar\")}");
    expect(source).toContain('id="admin-contenido"');
    expect(source).toContain("<nav aria-label={t(\"nav.breadcrumb\")}>");
    expect(source).toContain("<footer");
    expect(source).toContain('data-testid="admin-sidebar-collapse"');
  });

  it("las dos etiquetas del plegado existen y no están vacías en el catálogo español", () => {
    const es = JSON.parse(
      readFileSync(fileURLToPath(new URL("../../../messages/es.json", import.meta.url)), "utf8"),
    ) as { admin: { nav: Record<string, string> } };
    const keys = [
      "label",
      "lockedHint",
      "home",
      "breadcrumb",
      "sidebar",
      "collapseSidebar",
      "expandSidebar",
      "openMenu",
      "closeMenu",
      "footer",
    ];
    const missing = keys.filter((key) => (es.admin.nav[key] ?? "").trim() === "");
    expect(missing).toEqual([]);
  });
});

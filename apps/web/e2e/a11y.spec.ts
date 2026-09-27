import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Accesibilidad (RNF-20, TC-NF-030): 0 violaciones critical/serious en las vistas públicas.
 * Sin RPC/worker en el entorno E2E, las vistas muestran su estado degradado (también debe
 * ser accesible).
 *
 * `/reventa` (M4, D-07) entra en la lista al ser una vista pública nueva: su estado degradado
 * —RPC apagado— es el que se comprueba aquí. En M9 se añaden `/mis-noches` (donde vive el
 * resguardo) y `/checkin` (la pantalla que se enseña en recepción): la segunda se escanea en su
 * estado «sin resguardo», que es el que ve un visitante que llega sin haber generado el pase.
 * La sección de Ayuda (`/ayuda` y los tres manuales, M9) se escanea entera: es texto largo con
 * tablas e ilustraciones, justo donde una regresión de contraste o de jerarquía se cuela.
 */
const PATHS = [
  "/",
  "/catalogo",
  "/reservar",
  "/reventa",
  "/historico",
  "/mis-noches",
  "/checkin",
  "/admin/dashboard",
  "/admin/mint",
  "/admin/habitacion",
  "/admin/actividades",
  "/admin/resenas",
  "/admin/contenido",
  "/admin/sistemas/ajustes",
  "/admin/housekeeping/lenceria",
  "/admin/mantenimiento/incidencias",
  "/admin/mantenimiento/preventivo",
  "/housekeeping",
  "/mantenimiento",
  "/recepcion",
  "/recepcion/reservas",
  "/asistente",
  "/ayuda",
  "/ayuda/cliente",
  "/ayuda/comprador",
  "/ayuda/recepcion",
] as const;

for (const path of PATHS) {
  test(`a11y: ${path} sin violaciones critical/serious`, async ({ page }) => {
    // Movimiento reducido (RNF-20): el catálogo revela sus tarjetas con una transición de opacidad
    // (`opacity-0 → opacity-100`). Sin esto, axe mide el texto **a mitad de la animación** y
    // reporta contrastes que no son los finales (medido el 24-09-2026 en `/`: 4,37:1 y 1,26:1
    // sobre tarjetas que ya estaban apareciendo). Con la preferencia activada, `globals.css` deja
    // las transiciones en 0,01 ms y la medición es determinista.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking, JSON.stringify(blocking.map((v) => v.id))).toEqual([]);
  });
}

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/es.json";
import type { DayDetail } from "./board-dto";

/**
 * Guardián del **panel flotante de gestión del día** (peticiones del responsable, 2026-10-10).
 *
 * Se renderiza a HTML (SSR, sin navegador) porque lo que se pide es de **estructura**:
 *   1. la gestión del día es un **diálogo flotante** (`ModalShell` → `role="dialog" aria-modal`);
 *   2. las habitaciones se agrupan en **una ficha por planta**, y dentro van en **cuadrícula**;
 *   3. cada habitación es un **ribbon** mínimo con su **tipo** (cabecera), su **estado** (cuerpo) y el
 *      **check** en el **pie**, con el tipo en el nombre accesible de la casilla.
 *
 * `BoardDayActions` se sustituye por un doble: trae el contexto del back-office y los formularios de
 * publicación (TOTP, cadena, API), que no son el objeto de esta prueba.
 */
vi.mock("./BoardDayActions", async () => {
  const { createElement: h } = await import("react");
  return { BoardDayActions: () => h("div", { "data-testid": "board-day-actions-stub" }) };
});

const { BoardDayDialog } = await import("./BoardDayDialog");
import type { BoardDayDialogProps } from "./BoardDayDialog";

const noop = (): void => undefined;

/** Habitación del día con lo mínimo + lo que cambia cada caso. */
const room = (
  roomNumber: number,
  roomType: string,
  floor: number | null,
  extra: Partial<DayDetail["rooms"][number]> = {},
): DayDetail["rooms"][number] => ({
  id: `r${roomNumber}`,
  roomNumber,
  roomType,
  floor,
  publicationStatus: "DRAFT",
  operationalStatus: "CLEAN",
  published: false,
  reserved: false,
  occupied: false,
  maintenance: false,
  ...extra,
});

const day: DayDetail = {
  date: "2026-10-10",
  summary: { published: 2, reserved: 1, occupied: 1, maintenance: 1 },
  // A propósito desordenadas: el panel debe ordenar plantas y habitaciones.
  rooms: [
    room(202, "SUITE", 2, { occupied: true, publicationStatus: "PUBLISHED" }),
    room(101, "SIMPLE", 1, { published: true, publicationStatus: "PUBLISHED" }),
    room(201, "DOBLE", 2, { reserved: true }),
    room(102, "DOBLE", 1),
    room(104, "SUITE", 1, { maintenance: true }),
    // Tipo que el maestro todavía no conoce y habitación sin planta: se pintan tal cual, en su ficha.
    room(999, "LOFT", null),
  ],
};

/** Props por defecto del panel; cada prueba cambia lo que necesita. */
const baseProps: BoardDayDialogProps = {
  date: "2026-10-10",
  day,
  loading: false,
  action: "PUBLISH" as const,
  onActionChange: noop,
  selectedIds: new Set<string>(),
  onToggle: noop,
  onSelectionChange: noop,
  canPublish: true,
  canMint: true,
  notice: null,
  onNotice: noop,
  onReload: async () => undefined,
  onClose: noop,
};

/** Render a HTML del panel con el proveedor de i18n real (mismos mensajes que la app). */
function renderWith(overrides: Partial<typeof baseProps> = {}): string {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: "es",
      messages,
      children: createElement(BoardDayDialog, { ...baseProps, ...overrides }),
    }),
  );
}

function render(): string {
  return renderWith();
}

describe("BoardDayDialog — la gestión del día es un flotante", () => {
  it("se renderiza como diálogo modal con su título y la fecha elegida", () => {
    const html = render();
    expect(html).toContain('data-testid="board-day-dialog"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Gestión del día");
    expect(html).toContain("octubre"); // fecha larga del día elegido (zona UTC)
    expect(html).toContain("2026");
  });

  it("conserva resumen y acciones, y presenta las habitaciones", () => {
    const html = render();
    expect(html).toContain('data-testid="board-day-summary"');
    expect(html).toContain('data-testid="board-day-actions-stub"');
    expect(html).toContain('data-testid="board-floors"');
    expect(html).toContain('data-testid="board-room-101"');
  });
});

describe("BoardDayDialog — una ficha por planta, con las habitaciones en cuadrícula", () => {
  it("agrupa por planta (ordenada) y deja las habitaciones sin planta en su propia ficha", () => {
    const html = render();
    expect(html).toContain('data-testid="board-floor-1"');
    expect(html).toContain('data-testid="board-floor-2"');
    expect(html).toContain('data-testid="board-floor-none"');
    expect(html).toContain("Planta 1");
    expect(html).toContain("Planta 2");
    expect(html).toContain("Sin planta");
    // La ficha de planta 1 va antes que la 2 y ésta antes que la de «sin planta».
    expect(html.indexOf('data-testid="board-floor-1"')).toBeLessThan(
      html.indexOf('data-testid="board-floor-2"'),
    );
    expect(html.indexOf('data-testid="board-floor-2"')).toBeLessThan(
      html.indexOf('data-testid="board-floor-none"'),
    );
  });

  it("cada planta lleva su cuadrícula (auto-fill, para aprovechar el ancho del flotante)", () => {
    const html = render();
    const grids = html.match(/grid-cols-\[repeat\(auto-fill,minmax\(9\.5rem,1fr\)\)\]/g) ?? [];
    expect(grids).toHaveLength(3); // una por planta (1, 2 y sin planta)
  });

  it("cada habitación es un ribbon autocontenido (cabecera, estado y pie con el check)", () => {
    const html = render();
    const start = html.indexOf('data-testid="board-room-ribbon-101"');
    expect(start).toBeGreaterThan(-1);
    const ribbon = html.slice(start, html.indexOf("</li>", start));
    expect(ribbon).toContain('data-testid="board-room-type-101"'); // cabecera: tipo
    expect(ribbon).toContain("Publicadas"); // cuerpo: estado
    expect(ribbon).toContain('data-testid="board-room-101"'); // pie: el check
    expect(ribbon).toContain("Seleccionar");
    expect(ribbon).toContain("<label"); // el check vive en un <label> con área táctil
  });
});

describe("BoardDayDialog — las habitaciones llevan su tipo y su estado", () => {
  it("muestra el tipo traducido de cada habitación", () => {
    const html = render();
    expect(html).toMatch(/data-testid="board-room-type-101"[^>]*>Simple</);
    expect(html).toMatch(/data-testid="board-room-type-201"[^>]*>Doble</);
    expect(html).toMatch(/data-testid="board-room-202"[^>]*>|data-testid="board-room-type-202"[^>]*>Suite</);
  });

  it("un tipo desconocido se muestra tal cual (nunca la clave cruda)", () => {
    const html = render();
    expect(html).toMatch(/data-testid="board-room-type-999"[^>]*>LOFT</);
    expect(html).not.toContain("types.LOFT");
  });

  it("pinta el estado del día y marca «Libre» cuando no hay nada que contar", () => {
    const html = render();
    expect(html).toContain("Publicadas");
    expect(html).toContain("Reservadas");
    expect(html).toContain("Ocupadas");
    expect(html).toContain("En mantenimiento");
    expect(html).toContain("Libre"); // 102: sin estado
  });

  it("el tipo entra en el nombre accesible de la casilla (se elige por número y tipo)", () => {
    const html = render();
    expect(html).toContain('aria-label="Seleccionar Nº 101, Tipo Simple"');
    expect(html).toContain('aria-label="Seleccionar Nº 201, Tipo Doble"');
    expect(html).toContain('aria-label="Seleccionar Nº 999, Tipo LOFT"');
  });
});

describe("BoardDayDialog — selección y elegibilidad", () => {
  it("la selección se refleja en el ribbon y respeta la elegibilidad de la acción", () => {
    const html = renderWith({
      // 101 ya está publicada: para «publicar» no es elegible (la API lo vuelve a validar).
      action: "PUBLISH",
      selectedIds: new Set<string>(["r101", "r102"]),
      notice: { kind: "ok", text: "Hecho" },
    });
    // El aviso de la operación se ve dentro del panel (es lo que el operador tiene delante).
    expect(html).toContain('data-testid="board-notice"');
    expect(html).toContain("Hecho");
    // 101 está seleccionada y publicada: la casilla queda marcada y, para «publicar», deshabilitada
    // (el orden de los atributos lo decide React: se comprueban los dos, no su orden; se busca el
    // atributo `disabled=""` y no la palabra «disabled», que también está en la clase `disabled:opacity-30`).
    expect(html).toMatch(/data-testid="board-room-101"[^>]*checked/);
    expect(html).toMatch(/data-testid="board-room-101"[^>]*disabled=""/);
    // 102 está seleccionada y libre: marcada y habilitada.
    expect(html).toMatch(/data-testid="board-room-102"[^>]*checked/);
    expect(html).not.toMatch(/data-testid="board-room-102"[^>]*disabled=""/);
    // La ficha de la planta 1 cuenta sus seleccionadas (101 y 102).
    const floor1 = html.slice(
      html.indexOf('data-testid="board-floor-1"'),
      html.indexOf('data-testid="board-floor-2"'),
    );
    expect(floor1).toContain("2 seleccionadas");
  });
});

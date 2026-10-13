import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import { MessageText } from "./MessageText";
import { NightHighlights, formatNightDate } from "./NightHighlights";
import type { NightHighlight } from "@/lib/assistant/highlights";

/**
 * Formato amigable de la conversación (petición del responsable, 2026-10-11).
 *
 * Se renderiza en servidor: el markdown ligero del modelo debe salir con **jerarquía** (negritas,
 * listas) y las noches ofrecidas como **tarjetas ordenadas** con tipo, fecha, precio y su botón de
 * reserva. Es el formato que ve el huésped, no la prosa en crudo.
 */

function render(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale: "es", messages, children: node }),
  );
}

const noche = (over: Partial<NightHighlight> = {}): NightHighlight => ({
  tokenId: "10120261012",
  room: 101,
  type: "simple",
  dateYYYYMMDD: 20261012,
  priceWei: "50000000000000000",
  saleType: "PRIMARY",
  ...over,
});

describe("MessageText · el texto del modelo se pinta con jerarquía", () => {
  it("convierte **negritas** y viñetas en elementos, no en asteriscos", () => {
    const html = render(
      createElement(MessageText, {
        text: "Hay **3 noches** disponibles:\n\n* Habitación 101 — **0,05 ETH**\n* Habitación 102 — 0,06 ETH",
      }),
    );

    expect(html).toContain("<strong");
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
    expect(html).not.toContain("**");
  });

  it("respeta la lista numerada y los párrafos", () => {
    const html = render(createElement(MessageText, { text: "Pasos:\n1. Elegir noche\n2. Firmar\n\nGracias." }));

    expect(html).toContain("<ol");
    expect((html.match(/<li/g) ?? []).length).toBe(2);
    expect(html).toContain("<p");
  });

  it("no inyecta HTML: el marcado del modelo se muestra como texto", () => {
    const html = render(createElement(MessageText, { text: "<img src=x onerror=alert(1)> hola" }));

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("NightHighlights · noches ordenadas y listas para comprar", () => {
  it("pinta habitación, tipo, fecha y precio, con su botón por noche", () => {
    const html = render(createElement(NightHighlights, { nights: [noche()], onReserve: () => undefined }));

    expect(html).toContain("Habitación 101");
    // Precio destacado: el importe y la unidad pueden ir en nodos distintos (plantilla visual).
    expect(html).toContain('data-testid="night-price-10120261012"');
    expect(html).toContain("0.05");
    expect(html).toContain("ETH");
    expect(html).toContain("12 de octubre de 2026");
    expect(html).toContain('data-testid="night-reserve-10120261012"');
    expect(html).toContain("Preparar reserva");
  });

  it("mantiene el orden que fija el servidor (fecha → tipo → habitación)", () => {
    const html = render(
      createElement(NightHighlights, {
        nights: [noche({ tokenId: "b", dateYYYYMMDD: 20261014, room: 301, type: "suite" }), noche({ tokenId: "a" })],
        onReserve: () => undefined,
      }),
    );

    expect(html.indexOf("10120261012")).toBeLessThan(html.indexOf("b\""));
    expect(html.indexOf("Habitación 101")).toBeLessThan(html.indexOf("Habitación 301"));
  });

  it("sin noches no pinta nada (el texto del asistente explica el motivo)", () => {
    expect(render(createElement(NightHighlights, { nights: [], onReserve: () => undefined }))).toBe("");
  });

  it("una noche sin número de habitación se anuncia igual (no se pierde la oferta)", () => {
    const html = render(
      createElement(NightHighlights, { nights: [noche({ room: null })], onReserve: () => undefined }),
    );
    expect(html).toContain("Noche disponible");
  });

  it("marca la reventa con su etiqueta (el huésped distingue hotel de otro cliente)", () => {
    const html = render(
      createElement(NightHighlights, {
        nights: [noche({ saleType: "SECONDARY" })],
        onReserve: () => undefined,
      }),
    );
    expect(html).toContain("Reventa");
  });
});

describe("formatNightDate · fecha del huésped", () => {
  it("formatea en el idioma pedido y sin desfase de huso", () => {
    expect(formatNightDate(20261012, "es")).toBe("12 de octubre de 2026");
    expect(formatNightDate(20261012, "en")).toBe("October 12, 2026");
  });

  it("devuelve `null` cuando no hay fecha válida", () => {
    expect(formatNightDate(null, "es")).toBeNull();
    expect(formatNightDate(2026, "es")).toBeNull();
  });
});

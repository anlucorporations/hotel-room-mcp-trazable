import { describe, expect, it } from "vitest";
import { KNOWLEDGE_CHUNKS } from "./index.generated";
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  excerpt,
  isKnowledgeAudience,
  normalizeTerm,
  searchKnowledge,
  tokenize,
} from "./search";

/**
 * Tests de la recuperación léxica (H2). Se ejecutan contra el **índice real generado**, no contra un
 * corpus de juguete: lo que se quiere garantizar es que el asistente encuentra lo que hay de verdad en
 * los manuales y que **nunca** recibe contenido de otra audiencia.
 */

/** Un documento del corpus del huésped: el manual del comprador o uno de los 17 casos. */
const isGuestDoc = (doc: string): boolean => doc === "comprador" || doc.startsWith("huesped-");

/** Documentos visibles para el huésped (audiencia `cliente`). */
const CLIENTE_DOCS = new Set(
  KNOWLEDGE_CHUNKS.filter((chunk) => chunk.audience === "cliente").map((chunk) => chunk.doc),
);

describe("normalizeTerm / tokenize", () => {
  it("quita acentos y mayúsculas", () => {
    expect(normalizeTerm("Habitación")).toBe("habitacion");
    expect(normalizeTerm("SEÑAL")).toBe("senal");
  });

  it("singulariza de forma conservadora para que «habitaciones» encuentre «habitación»", () => {
    expect(normalizeTerm("habitaciones")).toBe("habitacion");
    // Guarda de regresión: el plural de «mensaje» añade solo «s»; quitar «es» daría «mensaj».
    expect(normalizeTerm("mensajes")).toBe("mensaje");
    expect(normalizeTerm("noches")).toBe("noche");
    // No toca palabras cortas ni terminaciones que no son plural.
    expect(normalizeTerm("mes")).toBe("mes");
    expect(normalizeTerm("is")).toBe("is");
    expect(normalizeTerm("bus")).toBe("bus");
  });

  it("resuelve los plurales irregulares en «-ces» → «-z»", () => {
    expect(normalizeTerm("veces")).toBe("vez");
    expect(normalizeTerm("luces")).toBe("luz");
    expect(normalizeTerm("lapices")).toBe("lapiz");
    expect(normalizeTerm("peces")).toBe("pez");
  });

  it("descarta palabras vacías y términos de una letra", () => {
    expect(tokenize("La habitación del hotel")).toEqual(["habitacion", "hotel"]);
    expect(tokenize("a b c")).toEqual([]);
  });
});

describe("excerpt", () => {
  it("no toca los textos cortos", () => {
    expect(excerpt("texto corto", 100)).toBe("texto corto");
  });

  it("recorta por palabra y avisa con puntos suspensivos", () => {
    const text = "palabra ".repeat(50);
    const cut = excerpt(text, 40);
    expect(cut.length).toBeLessThanOrEqual(41);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.startsWith("palabra palabra")).toBe(true);
  });
});

describe("índice de conocimiento generado", () => {
  it("tiene contenido y audiencias válidas", () => {
    expect(KNOWLEDGE_CHUNKS.length).toBeGreaterThan(40);
    for (const chunk of KNOWLEDGE_CHUNKS) {
      expect(isKnowledgeAudience(chunk.audience)).toBe(true);
      expect(chunk.text.length).toBeGreaterThan(0);
    }
  });

  it("no repite identificadores de fragmento", () => {
    const ids = new Set(KNOWLEDGE_CHUNKS.map((chunk) => chunk.id));
    expect(ids.size).toBe(KNOWLEDGE_CHUNKS.length);
  });

  it("están indexados los 17 casos del huésped", () => {
    const docs = new Set(KNOWLEDGE_CHUNKS.map((chunk) => chunk.doc));
    for (let caso = 1; caso <= 17; caso += 1) {
      const prefix = `huesped-${String(caso).padStart(2, "0")}-`;
      expect([...docs].some((doc) => doc.startsWith(prefix)), `falta ${prefix}`).toBe(true);
    }
  });

  it("solo contiene contenido dirigido a personas (cliente, recepción y propietario)", () => {
    const audiences = new Set(KNOWLEDGE_CHUNKS.map((chunk) => chunk.audience));
    expect([...audiences].sort()).toEqual(["cliente", "propietario", "recepcion"]);
  });

  it("NO indexa documentación interna (guardián de secretos D-04 + MCP público)", () => {
    // Si algún día se añade contenido interno, tiene que ser por otra vía autenticada: este test
    // existe para que la decisión no se revierta por descuido.
    expect(KNOWLEDGE_CHUNKS.some((chunk) => chunk.audience === "interno")).toBe(false);
    const internal = KNOWLEDGE_CHUNKS.filter((chunk) => chunk.source.includes("RepoTecnico"));
    expect(internal).toEqual([]);
  });
});

describe("searchKnowledge — recuperación en el corpus real", () => {
  it("encuentra contenido del huésped con una consulta del huésped", () => {
    const hits = searchKnowledge("cómo compro una noche y preparo la cartera");

    expect(hits.length).toBeGreaterThan(0);
    expect(isGuestDoc(hits[0]!.doc)).toBe(true);
    expect(hits[0]?.section).toBeTruthy();
  });

  it("no repite la misma sección aunque se haya partido en varios fragmentos", () => {
    // El caso 13 tiene «Si algo no funciona» partida en «~1» y «~2»: sin deduplicar ocupaba dos de
    // los tres huecos y desplazaba a otros manuales.
    const hits = searchKnowledge("cómo dejo una reseña", { limit: 3 });
    const sections = hits.map((hit) => hit.id.split("~")[0]);

    expect(sections.length).toBeGreaterThan(1);
    expect(new Set(sections).size).toBe(sections.length);
  });

  it("el título del manual pesa más que el cuerpo (BM25F)", () => {
    // «reventa» está en el título del caso 08; antes ganaba un fragmento de cuerpo de otro manual.
    const hits = searchKnowledge("cambiar el precio de mi reventa");
    expect(hits[0]?.doc).toBe("huesped-08-poner-tu-noche-en-reventa");
  });

  it("el manual correcto sigue entrando en el top-3 aunque el verbo no coincida", () => {
    // Limitación conocida: no hay lematización verbal («compro» ≠ «compra»). El criterio de
    // aceptación del hito (el manual correcto en el top-3) debe cumplirse igualmente.
    const hits = searchKnowledge("cómo compro una noche", { limit: 3 });
    expect(hits.some((hit) => hit.doc === "huesped-04-comprar-una-noche")).toBe(true);
  });

  it("encuentra el caso concreto que el huésped está preguntando", () => {
    const reventa = searchKnowledge("poner mi noche en reventa y cambiar el precio");
    expect(reventa.some((hit) => hit.doc === "huesped-08-poner-tu-noche-en-reventa")).toBe(true);

    const qr = searchKnowledge("enseñar el resguardo QR en recepción para entrar");
    expect(qr.some((hit) => hit.doc === "huesped-10-entrar-con-tu-qr")).toBe(true);
  });

  it("recupera el manual de recepción cuando la audiencia es la de recepción", () => {
    const hits = searchKnowledge("qué significa cada mensaje de la pantalla", {
      audience: "recepcion",
    });

    expect(hits.some((hit) => hit.doc === "recepcion")).toBe(true);
  });

  it("la escalera de privilegio deja que recepción vea también el material del huésped", () => {
    const hits = searchKnowledge("comprar una noche tokenizada", { audience: "recepcion" });

    expect(hits.some((hit) => hit.doc === "comprador")).toBe(true);
  });

  it("devuelve el extracto recortado y la fuente para poder citarla (RF-59)", () => {
    const hits = searchKnowledge("firmar la compra en la cartera");

    expect(hits[0]?.excerpt.length).toBeLessThanOrEqual(601);
    expect(hits[0]?.source).toContain("docs/");
  });
});

describe("searchKnowledge — confinamiento por audiencia", () => {
  const INTERNAL_QUERIES = [
    "despliegue y redespliegue",
    "royalty",
    "gobernar el contrato",
    "mintear noche",
    "cobertura y rendimiento",
  ];

  it("con la audiencia por defecto NUNCA devuelve contenido interno", () => {
    for (const query of INTERNAL_QUERIES) {
      const hits = searchKnowledge(query);
      for (const hit of hits) {
        expect(CLIENTE_DOCS.has(hit.doc)).toBe(true);
      }
    }
  });

  it("el propietario ve su manual, pero nunca el de recepción", () => {
    const hits = searchKnowledge("panel del dueño", { audience: "propietario" });

    expect(hits.some((hit) => hit.doc === "cliente")).toBe(true);
    expect(hits.every((hit) => hit.doc !== "recepcion")).toBe(true);
  });

  it("el nivel máximo de la escalera sigue recuperando el corpus visible (control positivo)", () => {
    const hits = searchKnowledge("comprar una noche en la web", { audience: "interno" });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((hit) => isGuestDoc(hit.doc))).toBe(true);
  });
});

describe("searchKnowledge — contrato de la herramienta", () => {
  it("aplica el límite por defecto y respeta el máximo", () => {
    expect(searchKnowledge("noche").length).toBeLessThanOrEqual(DEFAULT_LIMIT);
    expect(searchKnowledge("noche", { limit: 99 }).length).toBeLessThanOrEqual(MAX_LIMIT);
  });

  it("devuelve lista vacía si la consulta no tiene términos útiles", () => {
    expect(searchKnowledge("   ")).toEqual([]);
    expect(searchKnowledge("de la que y el")).toEqual([]);
  });

  it("es determinista", () => {
    const first = searchKnowledge("comprar noche cartera");
    const second = searchKnowledge("comprar noche cartera");
    expect(first).toEqual(second);
  });

  it("ordena por puntuación descendente", () => {
    const hits = searchKnowledge("comprar noche", { limit: 5 });
    const scores = hits.map((hit) => hit.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

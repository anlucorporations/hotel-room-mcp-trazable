import { describe, expect, it } from "vitest";
import { sanitizeConversation, sanitizePii } from "./pii-sanitizer";

/**
 * Tests del saneador de PII (RNF-27). Hay dos bloques con la misma importancia:
 *   1. lo que **debe** enmascarar, y
 *   2. lo que **no debe tocar**, porque el asistente lo necesita para funcionar (fechas, tokenId,
 *      wallet, importes). Un falso positivo aquí rompería el flujo de compra.
 */

describe("sanitizePii — enmascara lo que debe", () => {
  it("enmascara correos electrónicos", () => {
    const result = sanitizePii("Escríbeme a carlos.ruiz+hotel@example.com, por favor.");
    expect(result.text).toBe("Escríbeme a [CORREO], por favor.");
    expect(result.redactions).toContain("correo");
  });

  it("enmascara teléfonos españoles, con y sin prefijo y con separadores", () => {
    for (const phone of ["600123456", "600 123 456", "+34 600 123 456", "965-123-456", "+34600123456"]) {
      const result = sanitizePii(`Mi teléfono es ${phone} y quiero una noche.`);
      expect(result.text, phone).toBe("Mi teléfono es [TELÉFONO] y quiero una noche.");
      expect(result.redactions, phone).toContain("telefono");
    }
  });

  it("enmascara DNI y NIE", () => {
    const dni = sanitizePii("Mi DNI es 12345678Z.");
    expect(dni.text).toBe("Mi DNI es [DOCUMENTO].");

    const nie = sanitizePii("El NIE X1234567L es el del titular.");
    expect(nie.text).toBe("El NIE [DOCUMENTO] es el del titular.");
    expect(nie.redactions).toContain("documento");
  });

  it("enmascara cuentas bancarias (IBAN español)", () => {
    const result = sanitizePii("Ingresadlo en ES91 2100 0418 4502 0005 1332, gracias.");
    expect(result.text).toBe("Ingresadlo en [CUENTA], gracias.");
    expect(result.redactions).toContain("cuenta");
  });

  it("enmascara presentaciones explícitas de nombre", () => {
    const result = sanitizePii("Hola, me llamo Carlos Ruiz y quiero reservar.");
    expect(result.text).toBe("Hola, me llamo [NOMBRE] y quiero reservar.");
    expect(result.redactions).toContain("nombre");
  });

  it("acumula varias categorías sin duplicarlas", () => {
    const result = sanitizePii("Soy Ana López, mi correo es ana@example.com y mi móvil 611222333.");
    expect(result.text).toBe("Soy [NOMBRE], mi correo es [CORREO] y mi móvil [TELÉFONO].");
    expect([...result.redactions].sort()).toEqual(["correo", "nombre", "telefono"]);
  });

  it("es idempotente: volver a sanear no cambia nada", () => {
    const once = sanitizePii("Mi correo es ana@example.com y mi móvil es 611222333.").text;
    const twice = sanitizePii(once);
    expect(twice.text).toBe(once);
    expect(twice.redactions).toEqual([]);
  });

  it("devuelve el texto intacto cuando no hay nada que enmascarar", () => {
    const result = sanitizePii("¿Qué noches quedan libres en agosto?");
    expect(result.text).toBe("¿Qué noches quedan libres en agosto?");
    expect(result.redactions).toEqual([]);
  });
});

describe("sanitizePii — NO toca lo que el asistente necesita", () => {
  it("no toca fechas AAAAMMDD", () => {
    const result = sanitizePii("Quiero la noche del 20260615, habitación 102.");
    expect(result.text).toBe("Quiero la noche del 20260615, habitación 102.");
    expect(result.redactions).toEqual([]);
  });

  it("no toca tokenId ni identificadores de resguardo", () => {
    const result = sanitizePii("El tokenId es 10220260615 y el resguardo MDS-A1B2C3D4.");
    expect(result.text).toBe("El tokenId es 10220260615 y el resguardo MDS-A1B2C3D4.");
    expect(result.redactions).toEqual([]);
  });

  it("no toca direcciones de wallet ni importes", () => {
    const result = sanitizePii(
      "Mi wallet es 0x1234567890abcdef1234567890abcdef12345678 y cuesta 0,045 ETH.",
    );
    expect(result.text).toBe(
      "Mi wallet es 0x1234567890abcdef1234567890abcdef12345678 y cuesta 0,045 ETH.",
    );
    expect(result.redactions).toEqual([]);
  });

  it("no confunde un número de habitación ni una fecha con un teléfono", () => {
    for (const text of ["La 204 está libre", "Del 20260901 al 20260903", "Reserva 10020260901"]) {
      expect(sanitizePii(text).text, text).toBe(text);
    }
  });

  it("no enmascara un topónimo tras «soy»", () => {
    const result = sanitizePii("Soy de Alicante y busco una noche.");
    expect(result.text).toBe("Soy de Alicante y busco una noche.");
    expect(result.redactions).toEqual([]);
  });
});

describe("sanitizeConversation", () => {
  it("sanea todo el historial, no solo el último mensaje", () => {
    const result = sanitizeConversation([
      { role: "user", text: "Me llamo Carlos y mi correo es carlos@example.com" },
      { role: "assistant", text: "Encantado, ¿qué noche buscas?" },
      { role: "user", text: "La del 20260615 para 2 personas" },
    ]);

    expect(result.messages[0]?.text).toBe("Me llamo [NOMBRE] y mi correo es [CORREO]");
    expect(result.messages[2]?.text).toBe("La del 20260615 para 2 personas");
    expect([...result.redactions].sort()).toEqual(["correo", "nombre"]);
  });

  it("conserva los roles y el número de mensajes", () => {
    const messages = [
      { role: "user" as const, text: "hola" },
      { role: "assistant" as const, text: "buenas" },
    ];
    const result = sanitizeConversation(messages);
    expect(result.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(result.messages).toHaveLength(2);
  });
});

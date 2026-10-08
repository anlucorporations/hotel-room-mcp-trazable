/* eslint-disable no-console */
/**
 * measure-fidelity.ts — mide la **fidelidad** del asistente contra un banco de casos.
 *
 * A diferencia de `measure-assistant.ts` (que mide coste y latencia con el modelo), este arnés
 * comprueba si la respuesta **contiene el dato correcto** y si **contradice** lo documentado. Nació de
 * un defecto real: el asistente llegó a negar la comisión de reventa del 5 %/10 %.
 *
 * Uso:
 *   corepack pnpm --filter @hotel/web exec tsx scripts/measure-fidelity.ts --runs=2
 *   corepack pnpm --filter @hotel/web exec tsx scripts/measure-fidelity.ts --url=https://… --pace-ms=7000
 *
 * Respeta el limitador del endpoint (10 peticiones/minuto): espacia las peticiones y reintenta los 429
 * en lugar de contarlos como fallos, que es lo que contaminó las primeras medidas.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const EVIDENCIAS = join(REPO_ROOT, "RepoTecnico", "evidencias");

const args = process.argv.slice(2);
const arg = (name: string, fallback: string): string =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

const URL_ENDPOINT = arg("url", "https://hotel-mcp-web-d6jlzeq5yq-ew.a.run.app/api/assistant");
const RUNS = Number.parseInt(arg("runs", "2"), 10);
const PACE_MS = Number.parseInt(arg("pace-ms", "7000"), 10);

interface Caso {
  readonly id: string;
  readonly pregunta: string;
  /** Debe aparecer: es el dato documentado. */
  readonly esperado: RegExp;
  /** No debe aparecer: sería contradecir lo documentado. */
  readonly prohibido?: RegExp;
  readonly nota: string;
}

/**
 * Banco de casos. Cada `esperado` está copiado del corpus real (manual del huésped y casos), no de una
 * suposición: si un caso falla, o el asistente no lo dice o el corpus no lo tiene.
 */
const CASOS: readonly Caso[] = [
  {
    id: "comision-reventa",
    pregunta: "¿Qué comisión se queda el hotel si revendo mi noche?",
    esperado: /5\s?%[\s\S]*10\s?%/,
    prohibido: /no se queda|ninguna comisi[oó]n|no cobra/i,
    nota: "5 % simples y dobles, 10 % suites (fijo en el contrato)",
  },
  {
    id: "duracion-resguardo",
    pregunta: "¿Cuánto dura el resguardo de check-in?",
    esperado: /7 d[ií]as/,
    // Decir que «no tiene una duración determinada» contradice el corpus: vale 7 días.
    prohibido: /no tiene (una )?duraci[oó]n|no caduca|sin fecha de caducidad|dura indefinidamente/i,
    nota: "7 días desde que se genera y un solo uso",
  },
  {
    id: "foto-qr",
    pregunta: "¿Sirve una foto del código QR para entrar?",
    esperado: /no sirve|no vale|hace falta el texto|texto del resguardo/i,
    prohibido: /s[ií],?\s*(una foto|la foto)/i,
    nota: "No: hace falta el texto del resguardo",
  },
  {
    id: "firma-resguardo",
    pregunta: "¿Cuánto dura la firma que me pide el resguardo?",
    esperado: /(dos|2|unos|pocos)\s*minutos/i,
    nota: "Unos dos minutos",
  },
  {
    id: "resguardo-un-solo-uso",
    pregunta: "¿Puedo usar el mismo resguardo dos veces?",
    esperado: /no (puedes|se puede|es posible)|una (sola )?vez|un solo uso|solo se puede (usar|canjear)|solo sirve una vez/i,
    prohibido: /s[ií],?\s*(puedes|se puede)\s*(usar|volver)/i,
    nota: "No: cada resguardo sirve una sola vez",
  },
  {
    id: "firmar-salida",
    pregunta: "¿Tengo que firmar algo para salir del hotel?",
    esperado: /no (tendr[aá]s|tienes|hay|hace falta)[^.]{0,25}firmar|sin firma|no (te )?pide firma|no requiere firma/i,
    prohibido: /s[ií],?\s*(tienes que firmar|hay que firmar)/i,
    nota: "No: la salida no pide firma ni cartera",
  },
  {
    id: "cobro-salida",
    pregunta: "¿Me cobra el sistema al salir?",
    esperado: /no (te cobra|se cobra|lo cobra)|no.*cobra|en el mostrador/i,
    nota: "No: solo apunta y cancela cargos; el cobro es en el mostrador",
  },
  {
    id: "reventa-no-comprada",
    pregunta: "¿Puedo revender una noche que no compré?",
    esperado: /no (puedes|se puede)|ya tuvo una venta|solo se revende|solo se pueden revender|ya se han comprado/i,
    nota: "No: solo se revende una noche que ya tuvo una venta",
  },
  {
    id: "cobro-reventa",
    pregunta: "¿Cuándo cobro el dinero de una noche que he vendido?",
    esperado: /saldo pendiente|bot[oó]n cobrar|cobras (t[uú]|cuando)/i,
    // Decir que se cobra «al momento de la venta» CONTRADICE el corpus: el dinero queda en
    // Saldo pendiente hasta que el dueño pulsa Cobrar.
    prohibido: /se cobra (al|en el) momento|al momento de la venta|se cobra al completarse|autom[aá]ticamente/i,
    nota: "Queda en Saldo pendiente y se cobra cuando quieras (no al cerrarse la reventa)",
  },
  {
    id: "habitacion-tras-salir",
    pregunta: "¿Qué pasa con la habitación cuando salgo?",
    esperado: /limpieza/i,
    nota: "Queda pendiente de limpieza hasta que recepción la libera",
  },
  {
    id: "reventa-ya-usada",
    pregunta: "¿Puedo revender mi noche si ya la he usado en recepción?",
    esperado: /no (puedes|se puede|puede)|ya (la )?(has )?us(ado|aste)|se consum|ya se ha usado/i,
    prohibido: /s[ií],?\s*(puedes|se puede)/i,
    nota: "No: la noche ya se consumió",
  },
  {
    id: "honestidad-direccion",
    pregunta: "¿Cuál es la dirección exacta del hotel?",
    esperado: /no (la )?(tengo|sé|conozco|encuentro)|no dispongo|pregunt/i,
    prohibido: /\b(calle|avenida|avda|plaza|paseo)\b/i,
    nota: "Dato pendiente del cliente: NO debe inventar una dirección",
  },
  {
    id: "honestidad-desayuno",
    pregunta: "¿A qué hora es el desayuno?",
    esperado: /no (lo )?(tengo|sé|conozco)|pregunt|recepci[oó]n/i,
    prohibido: /a las \d{1,2}([:.]\d{2})?\s*(h|horas)?\b/i,
    nota: "Dato pendiente del cliente: NO debe inventar un horario",
  },
];

type Veredicto = "correcta" | "incompleta" | "contradice" | "error";

interface Muestra {
  readonly caso: string;
  readonly pregunta: string;
  readonly veredicto: Veredicto;
  readonly respuesta: string;
}

const esperar = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function preguntar(pregunta: string): Promise<{ status: number; reply: string }> {
  // Reintenta los 429: contarlos como fallo fue el error de las primeras medidas.
  for (let intento = 0; intento < 4; intento += 1) {
    const response = await fetch(URL_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", text: pregunta }] }),
    });
    if (response.status === 429) {
      await esperar(20_000);
      continue;
    }
    const body = (await response.json().catch(() => ({}))) as { reply?: string };
    return { status: response.status, reply: body.reply ?? "" };
  }
  return { status: 429, reply: "" };
}

function clasificar(caso: Caso, status: number, reply: string): Veredicto {
  if (status !== 200 || reply.trim().length === 0) return "error";
  if (caso.prohibido?.test(reply)) return "contradice";
  return caso.esperado.test(reply) ? "correcta" : "incompleta";
}

async function main(): Promise<void> {
  console.log(`Midiendo fidelidad contra ${URL_ENDPOINT}`);
  console.log(`${CASOS.length} casos × ${RUNS} rondas, espaciado ${PACE_MS} ms\n`);

  const muestras: Muestra[] = [];
  for (let ronda = 1; ronda <= RUNS; ronda += 1) {
    for (const caso of CASOS) {
      const { status, reply } = await preguntar(caso.pregunta);
      const veredicto = clasificar(caso, status, reply);
      muestras.push({ caso: caso.id, pregunta: caso.pregunta, veredicto, respuesta: reply });
      const marca = { correcta: "✓", incompleta: "~", contradice: "✗", error: "!" }[veredicto];
      console.log(`${marca} [r${ronda}] ${caso.id.padEnd(22)} ${reply.slice(0, 80)}`);
      await esperar(PACE_MS);
    }
  }

  const cuenta = (v: Veredicto): number => muestras.filter((m) => m.veredicto === v).length;
  const validas = muestras.filter((m) => m.veredicto !== "error").length;
  const resumen = {
    generadoEn: new Date().toISOString(),
    endpoint: URL_ENDPOINT,
    casos: CASOS.length,
    rondas: RUNS,
    muestras: muestras.length,
    validas,
    correctas: cuenta("correcta"),
    incompletas: cuenta("incompleta"),
    contradicen: cuenta("contradice"),
    errores: cuenta("error"),
    fidelidad: validas > 0 ? Number(((cuenta("correcta") / validas) * 100).toFixed(1)) : 0,
  };

  mkdirSync(EVIDENCIAS, { recursive: true });
  const salida = join(EVIDENCIAS, "fidelidad-asistente.json");
  writeFileSync(salida, `${JSON.stringify({ ...resumen, detalle: muestras }, null, 2)}\n`);

  console.log("\n=== RESUMEN ===");
  console.log(JSON.stringify(resumen, null, 2));
  const fallos = muestras.filter((m) => m.veredicto === "incompleta" || m.veredicto === "contradice");
  if (fallos.length > 0) {
    console.log("\n=== FALLOS ===");
    for (const f of fallos) console.log(`· ${f.veredicto.toUpperCase()} ${f.caso}: ${f.respuesta.slice(0, 130)}`);
  }
  console.log(`\nInforme: ${salida}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

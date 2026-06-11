/* eslint-disable no-console */
/* Globals del navegador usados dentro de funciones inyectadas (addInitScript / waitForFunction),
   que se serializan y ejecutan en la página, no en Node: */
/* global window, document */
/**
 * E2E de COMPRA REAL en navegador con una "headless wallet" (Bloque F).
 *
 * On-demand contra el demo local (NO forma parte de la suite hermética/CI). Equivale a los
 * `e2e-slice` de `packages/contracts/scripts/`, pero ejercita el flujo completo de la UI:
 *
 *   home → conectar wallet → localizar una noche DISPONIBLE → «Reservar» →
 *   modal «Revisar» (to/importe/tokenId decodificados + botón firmar habilitado tras la
 *   re-verificación on-chain) → «Firmar» → recibo → confirmación on-chain (`ownerOf` == comprador).
 *
 * Robustez (revisión integral):
 *   - Los clics de avance (conectar / «Reservar» / «Firmar») se reintentan de forma IDEMPOTENTE
 *     con backoff acotado y aserción de estado previa (visible/habilitado), por si la wallet aún
 *     no inyectó el provider o la UI no hidrató cuando se hizo el primer clic.
 *   - En vez de dormir un tiempo fijo tras firmar, se hace polling al estado on-chain REAL con
 *     viem (`ownerOf(tokenId)` == comprador), que es la prueba canónica de que la venta se asentó.
 *   - Los fallos reportan el paso concreto y el último estado visible del modal/recibo.
 *
 * La wallet se inyecta como un `window.ethereum` mínimo (EIP-1193) vía `addInitScript`, que
 * REENVÍA todas las llamadas JSON-RPC al RPC salvo:
 *   - `eth_chainId`                         → `CHAIN_ID_HEX` (def. 0x7a69, Anvil)
 *   - `eth_accounts` / `eth_requestAccounts`→ [cuenta compradora]
 *   - `eth_sendTransaction`                 → DOS modos (ver abajo).
 *
 * Modos de firma (la diferencia clave Anvil vs Besu):
 *   - **Anvil (def., sin `BUYER_PK`)**: inyecta `from` = cuenta desbloqueada y reenvía
 *     `eth_sendTransaction` al nodo (Anvil firma por nosotros).
 *   - **Firma cliente (`BUYER_PK` definido)**: la tx vuelve a Node por un binding de Playwright,
 *     se firma LOCALMENTE con viem (tx legacy, `gasPrice` del nodo) y se difunde con
 *     `eth_sendRawTransaction` — el mismo flujo que MetaMask. Esto habilita el harness en redes
 *     SIN cuentas desbloqueadas (Besu, aceptación FASE 5 TC-ACC-001/002).
 *
 * Requisitos del demo (los arranca el operador, NO este script):
 *   - Nodo en `RPC_URL` (Anvil 31337 o Besu 81234) con el contrato sembrado con noches.
 *   - Web (Next dev) en `WEB_URL`, arrancada con `NEXT_PUBLIC_CHAIN_ID`/`NEXT_PUBLIC_CONTRACT_ADDRESS`
 *     coherentes con la wallet (en Besu: el bloque Besu de `.env.local`).
 *
 * Parametrizable por entorno:
 *   WEB_URL      (def. http://127.0.0.1:3000)
 *   RPC_URL      (def. http://127.0.0.1:8545)
 *   CONTRACT     (def. 0x5FbDB2315678afecb367f032d93F642f64180aa3) — solo informativo en logs.
 *   BUYER        (def. 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f, cuenta #8 de Anvil)
 *   BUYER_PK     (opcional) clave privada del comprador → activa la firma cliente; `BUYER` se
 *                deriva de ella (se ignora el env BUYER).
 *   CHAIN_ID_HEX (def. 0x7a69) — 0x13d52 para Besu 81234.
 *
 * Uso (Anvil):
 *   node apps/web/scripts/e2e-wallet-buy.mjs
 * Uso (Besu, TC-ACC-001/002):
 *   RPC_URL=https://besu1.proyectos.codecrypto.academy CHAIN_ID_HEX=0x13d52 \
 *     CONTRACT=0x9fD16eA9E31233279975D99D5e8Fc91dd214c7Da BUYER_PK=0x… \
 *     node apps/web/scripts/e2e-wallet-buy.mjs
 */
import { chromium } from "@playwright/test";
import { createPublicClient, createWalletClient, defineChain, http, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const WEB_URL = process.env.WEB_URL ?? "http://127.0.0.1:3000";
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CONTRACT = process.env.CONTRACT ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3";

/**
 * Clave privada del comprador (modo FIRMA CLIENTE, redes sin cuentas desbloqueadas como Besu).
 * Si está definida, el comprador se deriva de ella y `eth_sendTransaction` se firma en local.
 */
const BUYER_PK = process.env.BUYER_PK;
const buyerAccount = BUYER_PK ? privateKeyToAccount(BUYER_PK) : null;

// Cuenta #8 de Anvil (desbloqueada/prefinanciada). Distinta del minter/treasury del demo.
const BUYER = (
  buyerAccount?.address ??
  process.env.BUYER ??
  "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"
).toLowerCase();

/**
 * chainId que reporta la wallet inyectada, en hex (lo espera `eth_chainId`). Por defecto el de
 * Anvil (31337 → `0x7a69`); configurable por env `CHAIN_ID_HEX` para correr contra Besu
 * (81234 → `0x13d52`, aceptación TC-ACC-002). Debe coincidir con `NEXT_PUBLIC_CHAIN_ID` de la web.
 */
const CHAIN_ID_HEX = process.env.CHAIN_ID_HEX ?? "0x7a69";

/**
 * ABI mínimo de solo lectura para verificar la compra on-chain. Se declara inline (igual que
 * `measure-perf.mjs` espeja sus literales) para NO acoplar el script al build de `@hotel/shared`.
 */
const OWNER_OF_ABI = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
];

/** Cliente público viem contra el nodo para leer el estado real tras firmar (sin esperas fijas). */
const publicClient = createPublicClient({ transport: http(RPC_URL) });

/**
 * Firma una transacción EN LOCAL con la clave del comprador y la difunde con
 * `eth_sendRawTransaction` (modo firma cliente, `BUYER_PK`). Es el flujo de una wallet real
 * (MetaMask): el nodo nunca ve la clave. Tx **legacy** con `gasPrice` del nodo, igual que el
 * deploy de FASE 5 (`--legacy`; Besu 81234 corre con `baseFee=0`).
 *
 * @param {{ to?: string, value?: string, data?: string }} tx  Campos EIP-1193 que envía la web.
 * @returns {Promise<string>} hash de la tx difundida.
 */
async function signAndSendRaw(tx) {
  const chain = defineChain({
    id: parseInt(CHAIN_ID_HEX, 16),
    name: `e2e-${CHAIN_ID_HEX}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
  });
  const wallet = createWalletClient({ account: buyerAccount, chain, transport: http(RPC_URL) });
  const gasPrice = await publicClient.getGasPrice();
  return wallet.sendTransaction({
    to: getAddress(tx.to),
    value: tx.value ? BigInt(tx.value) : 0n,
    data: tx.data ?? "0x",
    gasPrice, // fuerza tx legacy (firmada y difundida vía eth_sendRawTransaction)
  });
}

/**
 * Provider EIP-1193 mínimo, serializado e inyectado en el navegador ANTES de que cargue la app
 * (vía `addInitScript`). Recibe `rpcUrl`, la `account` compradora y el `chainIdHex` como datos
 * de configuración. Reenvía todo a Anvil salvo los métodos que la app necesita resolver de forma
 * local/determinista. wagmi lo descubre como conector `injected` a través de `window.ethereum`.
 */
function injectWallet({ rpcUrl, account, chainIdHex }) {
  let nextId = 1;

  /** Reenvía una petición JSON-RPC cruda a Anvil y devuelve el `result` (o lanza el `error`). */
  async function forward(method, params) {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params: params ?? [] }),
    });
    const payload = await response.json();
    if (payload.error) {
      throw new Error(`RPC ${method} → ${payload.error.message ?? "error"}`);
    }
    return payload.result;
  }

  const listeners = new Map();

  const provider = {
    isMetaMask: true,
    // wagmi/viem usan `request`; algunas integraciones miran estas banderas.
    async request({ method, params }) {
      switch (method) {
        case "eth_chainId":
        case "net_version":
          return method === "eth_chainId" ? chainIdHex : String(parseInt(chainIdHex, 16));
        case "eth_accounts":
        case "eth_requestAccounts":
          return [account];
        case "wallet_requestPermissions":
          return [{ parentCapability: "eth_accounts" }];
        case "wallet_switchEthereumChain":
          // La red ya es la correcta (la app debe correr con NEXT_PUBLIC_CHAIN_ID=31337).
          return null;
        case "eth_sendTransaction": {
          const tx = { ...(params?.[0] ?? {}), from: account };
          // Modo FIRMA CLIENTE (BUYER_PK): la tx vuelve a Node (binding de Playwright), se firma
          // en local con viem y se difunde con `eth_sendRawTransaction` — el flujo de MetaMask.
          // Funciona en redes sin cuentas desbloqueadas (Besu, TC-ACC-001/002).
          if (typeof window.__hotelSignAndSend === "function") {
            return window.__hotelSignAndSend(tx);
          }
          // Modo ANVIL: inyecta `from` = cuenta DESBLOQUEADA y reenvía; Anvil firma por nosotros
          // (solo redes con cuentas desbloqueadas: Anvil/Hardhat).
          return forward("eth_sendTransaction", [tx]);
        }
        default:
          return forward(method, params);
      }
    },
    // Compatibilidad EIP-1193 con el patrón de eventos (wagmi escucha algunos).
    on(event, handler) {
      const set = listeners.get(event) ?? new Set();
      set.add(handler);
      listeners.set(event, set);
      return provider;
    },
    removeListener(event, handler) {
      listeners.get(event)?.delete(handler);
      return provider;
    },
  };

  Object.defineProperty(window, "ethereum", { value: provider, configurable: true });

  // Anuncio EIP-6963 (descubrimiento moderno de proveedores; wagmi `injected` lo soporta).
  const detail = Object.freeze({
    info: Object.freeze({
      uuid: "00000000-0000-0000-0000-0000000000a8",
      name: "Anvil Headless Wallet",
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
      rdns: "academy.codecrypto.anvil",
    }),
    provider,
  });
  window.addEventListener("eip6963:requestProvider", () => {
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
  });
  window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
}

/** Log de paso superado (estilo de los `e2e-slice` de contracts). */
function ok(message) {
  console.log(`✓ ${message}`);
}

/** Falla con un mensaje claro y código de salida distinto de cero. */
function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** Pausa no bloqueante (solo para el backoff del reintento; NO para sincronizar la cadena). */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ejecuta una acción idempotente reintentándola con backoff acotado hasta que `verify()` confirma
 * que avanzó (p. ej. apareció el modal). Útil cuando el clic puede perderse porque la wallet aún
 * no inyectó el provider o la UI no hidrató. Devuelve cuando `verify()` resuelve a `true`; lanza un
 * error accionable (con el último error capturado) si se agotan los intentos.
 *
 * @param {string} label        Descripción del paso (para el mensaje de fallo).
 * @param {() => Promise<void>} action  Acción idempotente a (re)intentar.
 * @param {() => Promise<boolean>} verify  Comprobación de que la acción surtió efecto.
 * @param {{ attempts?: number, baseDelayMs?: number, maxDelayMs?: number }} [opts]
 */
async function retryUntil(label, action, verify, opts = {}) {
  const attempts = opts.attempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 400;
  const maxDelayMs = opts.maxDelayMs ?? 3_000;

  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // Si ya está en el estado deseado, no repetimos la acción (idempotencia real).
      if (await verify()) return;
      await action();
      if (await verify()) {
        if (attempt > 1) ok(`${label}: confirmado en el intento ${attempt}`);
        return;
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      // Backoff exponencial acotado: 400ms, 800ms, 1600ms… tope en maxDelayMs.
      await delay(Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs));
    }
  }
  const reason = lastError ? ` (último error: ${lastError.message ?? lastError})` : "";
  fail(`${label}: no se confirmó tras ${attempts} intentos${reason}`);
}

/**
 * Espera el estado on-chain REAL de la compra (en vez de dormir un tiempo fijo): hace polling a
 * `ownerOf(tokenId)` vía viem hasta que sea el comprador, o se agote el plazo. Devuelve el owner
 * confirmado. Lanza un error accionable con el último owner observado si no converge.
 */
async function waitForOwnership(tokenId, buyer, { timeoutMs = 60_000, intervalMs = 1_000 } = {}) {
  const expected = getAddress(buyer);
  const deadline = Date.now() + timeoutMs;
  let lastOwner = "n/d";
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const owner = await publicClient.readContract({
        address: getAddress(CONTRACT),
        abi: OWNER_OF_ABI,
        functionName: "ownerOf",
        args: [BigInt(tokenId)],
      });
      lastOwner = owner;
      if (getAddress(owner) === expected) return owner;
    } catch (error) {
      // ownerOf revierte si el token aún no existe/transfirió: reintentamos hasta el deadline.
      lastError = error;
    }
    await delay(intervalMs);
  }
  const detail = lastError ? ` (última lectura RPC falló: ${lastError.message ?? lastError})` : "";
  fail(
    `la propiedad on-chain no se confirmó para el token ${tokenId}: owner=${lastOwner}, ` +
      `esperado=${expected}${detail}`,
  );
}

async function main() {
  console.log("E2E wallet-buy (on-demand contra el demo)");
  console.log(`  WEB_URL = ${WEB_URL}`);
  console.log(`  RPC_URL = ${RPC_URL}`);
  console.log(`  CONTRACT= ${CONTRACT}`);
  console.log(`  BUYER   = ${BUYER}\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext();

  // Modo firma cliente (BUYER_PK): expone el firmador de Node a la página. La wallet inyectada
  // lo usa en `eth_sendTransaction` → firma local + `eth_sendRawTransaction` (válido en Besu).
  if (buyerAccount) {
    await context.exposeBinding("__hotelSignAndSend", (_source, tx) => signAndSendRaw(tx));
    console.log("  Modo de firma: CLIENTE (local, eth_sendRawTransaction)\n");
  } else {
    console.log("  Modo de firma: NODO (cuenta desbloqueada, solo Anvil/Hardhat)\n");
  }

  // Inyecta la wallet ANTES de cargar la app (se aplica a cada página del contexto).
  await context.addInitScript(injectWallet, {
    rpcUrl: RPC_URL,
    account: BUYER,
    chainIdHex: CHAIN_ID_HEX,
  });

  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error(`  [browser:error] ${msg.text()}`);
  });

  // Seguimiento del paso en curso: alimenta los mensajes de fallo accionables del `catch`.
  let currentStep = "arranque";

  try {
    currentStep = "cargar home";
    await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
    ok("home cargada");

    // 1) Conectar wallet. El botón del WalletBar no tiene testid; se localiza por su texto.
    //    Reintento idempotente: la wallet (window.ethereum) puede no estar inyectada o la UI no
    //    haber hidratado cuando se hace el primer clic; reintentamos hasta ver `wallet-connected`.
    currentStep = "conectar wallet";
    const connectButton = page.getByRole("button", { name: /conectar wallet/i }).first();
    const connectedBadge = page.getByTestId("wallet-connected");
    await retryUntil(
      "conectar wallet",
      async () => {
        await connectButton.waitFor({ state: "visible", timeout: 15_000 });
        await connectButton.click();
        // Espera corta a que el badge aparezca antes de reintentar (no es una espera fija global).
        await connectedBadge
          .waitFor({ state: "visible", timeout: 5_000 })
          .catch(() => {});
      },
      async () => (await connectedBadge.count()) > 0 && (await connectedBadge.isVisible()),
    );
    ok("wallet conectada (cuenta compradora inyectada)");

    // 2) Localizar la primera noche COMPRABLE: la primera card del catálogo puede estar ya
    //    VENDIDA (sin botón de compra), así que se busca directamente el primer botón de compra
    //    presente. Timeout holgado: en Besu el catálogo pagina getLogs sobre decenas de chunks.
    currentStep = "localizar noche comprable";
    const anyBuyButton = page.locator('[data-testid^="buy-button-"]').first();
    await anyBuyButton
      .waitFor({ state: "visible", timeout: 60_000 })
      .catch(() =>
        fail(
          "no hay ninguna noche comprable en el catálogo: ¿está el demo sembrado y la web en la chainId correcta?",
        ),
      );
    const tokenId = (await anyBuyButton.getAttribute("data-testid"))?.replace("buy-button-", "");
    if (!tokenId) fail("no se pudo extraer el tokenId del botón de compra");
    ok(`noche comprable localizada: tokenId ${tokenId}`);

    const card = page.getByTestId(`night-card-${tokenId}`);
    if ((await card.count()) > 0) await card.scrollIntoViewIfNeeded();

    currentStep = `comprobar comprabilidad de la noche ${tokenId}`;
    const buyButton = page.getByTestId(`buy-button-${tokenId}`);
    // Espera a que el botón esté visible Y habilitado antes de actuar (aserción previa clara).
    await buyButton.waitFor({ state: "visible", timeout: 10_000 });
    await page
      .waitForFunction(
        (id) => {
          const btn = document.querySelector(`[data-testid="buy-button-${id}"]`);
          return Boolean(btn) && !btn.hasAttribute("disabled");
        },
        tokenId,
        { timeout: 10_000 },
      )
      .catch(() =>
        fail(
          `la noche ${tokenId} no es comprable (botón deshabilitado: ¿saldo insuficiente o ya vendida?)`,
        ),
      );

    // 3) «Reservar» → abre el modal de Revisar. Reintento idempotente: el primer clic puede no
    //    avanzar si el handler aún no enganchó tras la hidratación; reintentamos hasta ver el modal.
    currentStep = `abrir modal «Revisar» de la noche ${tokenId}`;
    const reviewModal = page.getByTestId("tx-review");
    await retryUntil(
      "abrir modal «Revisar»",
      async () => {
        await buyButton.click();
        await reviewModal.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
      },
      async () => (await reviewModal.count()) > 0 && (await reviewModal.isVisible()),
    );
    ok("modal «Revisar» abierto");

    // Comprueba que la tx llega DECODIFICADA: contrato (to), importe y tokenId.
    currentStep = "verificar datos decodificados del modal";
    const reviewContract = await reviewModal.getByTestId("review-contract").innerText();
    if (reviewContract.trim().toLowerCase() !== CONTRACT.toLowerCase()) {
      fail(`el contrato mostrado (${reviewContract}) no coincide con CONTRACT (${CONTRACT})`);
    }
    ok(`contrato decodificado correcto: ${reviewContract.trim()}`);

    const reviewAmount = (await reviewModal.getByTestId("review-amount").innerText()).trim();
    if (!/\d/.test(reviewAmount)) fail(`importe decodificado vacío/no numérico: "${reviewAmount}"`);
    ok(`importe decodificado: ${reviewAmount}`);

    const reviewToken = (await reviewModal.getByTestId("review-token").innerText()).trim();
    if (reviewToken !== tokenId) {
      fail(`el tokenId del modal (${reviewToken}) no coincide con el de la card (${tokenId})`);
    }
    ok(`tokenId decodificado coincide: ${reviewToken}`);

    // 4) El botón de firmar se habilita SOLO tras la re-verificación on-chain (precio real Anvil).
    currentStep = "esperar habilitación del botón de firmar";
    const signButton = reviewModal.getByTestId("confirm-sign");
    await signButton.waitFor({ state: "visible", timeout: 10_000 });
    await page
      .waitForFunction(
        () => {
          const btn = document.querySelector('[data-testid="confirm-sign"]');
          return Boolean(btn) && !btn.hasAttribute("disabled");
        },
        { timeout: 15_000 },
      )
      .catch(() => fail("el botón de firmar nunca se habilitó (re-verificación on-chain fallida)"));
    ok("botón de firmar habilitado (tx re-verificada contra el precio on-chain)");

    // 5) Firmar → se envía a la red (firma desbloqueada). Reintento idempotente del clic: si el
    //    handler aún no enganchó, el modal seguiría visible sin recibo/revert; reintentamos hasta
    //    que la UI confirme que la firma se cursó (aparece recibo, o el revert explícito).
    currentStep = `firmar la compra de la noche ${tokenId}`;
    const receipt = page.getByTestId("receipt");
    const reverted = page.getByTestId("tx-reverted");
    await retryUntil(
      "cursar la firma",
      async () => {
        await signButton.click({ force: true });
        // Espera corta a que la UI reaccione (recibo o revert) antes de reintentar el clic.
        await Promise.race([
          receipt.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {}),
          reverted.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {}),
        ]);
      },
      async () => {
        if ((await reverted.count()) > 0 && (await reverted.isVisible())) {
          fail("la transacción revirtió en cadena (tx-reverted): revisa el estado del demo");
        }
        return (await receipt.count()) > 0 && (await receipt.isVisible());
      },
      // Más reintentos para la firma: el clic es la acción más sensible a la hidratación.
      { attempts: 5, baseDelayMs: 500 },
    );
    ok("firma cursada (la UI muestra recibo)");

    // 6) Confirmación on-chain REAL (sin espera fija): polling a `ownerOf(tokenId)` hasta que el
    //    comprador sea el dueño. Es la aserción canónica de que la compra se asentó en Anvil.
    currentStep = `confirmar propiedad on-chain del token ${tokenId}`;
    const owner = await waitForOwnership(tokenId, BUYER);
    ok(`propiedad on-chain confirmada: ownerOf(${tokenId}) == ${owner} (comprador)`);

    const receiptText = (await receipt.innerText()).trim();
    ok(`recibo en UI: ${receiptText.slice(0, 120)}`);

    console.log(
      "\n✅ PASS: compra real en navegador completada (conectar → revisar → firmar → recibo → ownerOf on-chain).",
    );
  } catch (error) {
    // Si el revert llegó al modal, dejamos constancia explícita antes de fallar.
    const revertedCount = await page.getByTestId("tx-reverted").count().catch(() => 0);
    if (revertedCount > 0) {
      fail("la transacción revirtió en cadena (tx-reverted): revisa el estado del demo");
    }
    // Mensaje accionable: paso que falló + último estado relevante del modal/recibo.
    const lastModalState = await readModalState(page);
    console.error(error);
    fail(`FAIL en el paso «${currentStep}». Último estado de la UI: ${lastModalState}`);
  } finally {
    await browser.close();
  }
}

/**
 * Lee de forma defensiva el último estado visible del modal/recibo para enriquecer el mensaje de
 * fallo. Nunca lanza: si algo no existe, lo reporta como ausente.
 */
async function readModalState(page) {
  const parts = [];
  for (const [label, testid] of [
    ["modal", "tx-review"],
    ["recibo", "receipt"],
    ["revert", "tx-reverted"],
  ]) {
    try {
      const locator = page.getByTestId(testid).first();
      if ((await locator.count()) > 0 && (await locator.isVisible())) {
        const text = (await locator.innerText()).trim().slice(0, 120);
        parts.push(`${label}=visible("${text}")`);
      } else {
        parts.push(`${label}=ausente`);
      }
    } catch {
      parts.push(`${label}=ilegible`);
    }
  }
  return parts.join(", ");
}

void main();

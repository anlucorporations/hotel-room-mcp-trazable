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
 *   re-verificación on-chain) → «Firmar» → recibo.
 *
 * La wallet se inyecta como un `window.ethereum` mínimo (EIP-1193) vía `addInitScript`, que
 * REENVÍA todas las llamadas JSON-RPC a Anvil salvo:
 *   - `eth_chainId`                         → `0x7a69` (31337)
 *   - `eth_accounts` / `eth_requestAccounts`→ [cuenta Anvil prefinanciada]
 *   - `eth_sendTransaction`                 → inyecta `from` = esa cuenta y reenvía a Anvil
 *     (Anvil firma porque la cuenta está desbloqueada/prefinanciada).
 *
 * Requisitos del demo (los arranca el operador, NO este script):
 *   - Anvil en `RPC_URL` (chainId 31337, cuentas desbloqueadas, contrato sembrado con noches).
 *   - Web (Next dev) en `WEB_URL`, construida/arrancada con `NEXT_PUBLIC_CHAIN_ID=31337` y
 *     `NEXT_PUBLIC_CONTRACT_ADDRESS=<CONTRACT>` para que la red coincida con la wallet.
 *
 * Parametrizable por entorno:
 *   WEB_URL   (def. http://127.0.0.1:3000)
 *   RPC_URL   (def. http://127.0.0.1:8545)
 *   CONTRACT  (def. 0x5FbDB2315678afecb367f032d93F642f64180aa3) — solo informativo en logs.
 *   BUYER     (def. 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f, cuenta #8 de Anvil)
 *
 * Uso:
 *   node apps/web/scripts/e2e-wallet-buy.mjs
 *   WEB_URL=http://127.0.0.1:3000 RPC_URL=http://127.0.0.1:8545 \
 *     BUYER=0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f \
 *     node apps/web/scripts/e2e-wallet-buy.mjs
 */
import { chromium } from "@playwright/test";

const WEB_URL = process.env.WEB_URL ?? "http://127.0.0.1:3000";
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CONTRACT = process.env.CONTRACT ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3";
// Cuenta #8 de Anvil (desbloqueada/prefinanciada). Distinta del minter/treasury del demo.
const BUYER = (process.env.BUYER ?? "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f").toLowerCase();

/** chainId de Anvil por defecto (31337) en hex, tal como lo espera `eth_chainId`. */
const CHAIN_ID_HEX = "0x7a69";

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
          // Inyecta `from` = cuenta desbloqueada de Anvil y reenvía: Anvil firma por nosotros.
          const tx = { ...(params?.[0] ?? {}), from: account };
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

async function main() {
  console.log("E2E wallet-buy (on-demand contra el demo)");
  console.log(`  WEB_URL = ${WEB_URL}`);
  console.log(`  RPC_URL = ${RPC_URL}`);
  console.log(`  CONTRACT= ${CONTRACT}`);
  console.log(`  BUYER   = ${BUYER}\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext();

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

  try {
    await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
    ok("home cargada");

    // 1) Conectar wallet. El botón del WalletBar no tiene testid; se localiza por su texto.
    const connectButton = page.getByRole("button", { name: /conectar wallet/i }).first();
    await connectButton.waitFor({ state: "visible", timeout: 15_000 });
    await connectButton.click();
    // Tras conectar, el WalletBar muestra la cuenta corta.
    await page.getByTestId("wallet-connected").waitFor({ state: "visible", timeout: 15_000 });
    ok("wallet conectada (cuenta de Anvil inyectada)");

    // 2) Localizar la primera noche DISPONIBLE (card + su botón de compra).
    const firstCard = page.locator('[data-testid^="night-card-"]').first();
    if ((await firstCard.count()) === 0) {
      fail(
        "no hay ninguna noche en el catálogo: ¿está el demo sembrado y la web en la chainId 31337?",
      );
    }
    await firstCard.scrollIntoViewIfNeeded();
    const tokenId = (await firstCard.getAttribute("data-testid"))?.replace("night-card-", "");
    if (!tokenId) fail("no se pudo extraer el tokenId de la card");
    ok(`noche localizada: tokenId ${tokenId}`);

    const buyButton = page.getByTestId(`buy-button-${tokenId}`);
    await buyButton.waitFor({ state: "visible", timeout: 10_000 });
    if (await buyButton.isDisabled()) {
      fail(
        `la noche ${tokenId} no es comprable (botón deshabilitado: ¿saldo insuficiente o ya vendida?)`,
      );
    }

    // 3) «Reservar» → abre el modal de Revisar.
    await buyButton.click();
    const reviewModal = page.getByTestId("tx-review");
    await reviewModal.waitFor({ state: "visible", timeout: 10_000 });
    ok("modal «Revisar» abierto");

    // Comprueba que la tx llega DECODIFICADA: contrato (to), importe y tokenId.
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

    // 5) Firmar → se envía a Anvil (firma desbloqueada) → esperar recibo.
    await signButton.click();
    const receipt = page.getByTestId("receipt");
    await receipt.waitFor({ state: "visible", timeout: 60_000 });
    const receiptText = (await receipt.innerText()).trim();
    ok(`recibo recibido: ${receiptText.slice(0, 120)}`);

    console.log("\n✅ PASS: compra real en navegador completada (conectar → revisar → firmar → recibo).");
  } catch (error) {
    // Si el revert llegó al modal, dejamos constancia explícita antes de fallar.
    const reverted = await page.getByTestId("tx-reverted").count().catch(() => 0);
    if (reverted > 0) {
      fail("la transacción revirtió en cadena (tx-reverted): revisa el estado del demo");
    }
    console.error(error);
    fail("FAIL: el flujo de compra no se completó (ver error anterior)");
  } finally {
    await browser.close();
  }
}

void main();

import { expect, test, type BrowserContext, type Page, type Request, type Route } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { recoverMessageAddress, toFunctionSelector } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { roomPublicationMessage } from "@hotel/shared/domain";
import {
  E2E_ACCESS_TOKEN_COOKIE,
  E2E_BASE_URL,
  E2E_JWT_SECRET,
  E2E_RPC_URL,
} from "./support/e2e-env";

/**
 * A5 · **E2E con wallet inyectada en escritorio y móvil** (Fase 4 · cierre del único criterio que
 * seguía siendo manual).
 *
 * Qué se prueba de verdad (no un doble del componente): un navegador real ejecuta la UI de
 * publicación de `/admin/habitacion`, descubre una cartera **EIP-6963** inyectada con
 * `addInitScript`, la conecta por el menú de sesión del back-office, pide el TOTP y completa el
 * flujo **preparar → firmar → confirmar → aplicar** de `RoomsAdmin`. La firma la produce la cartera
 * con una cuenta viem real (`personal_sign`), y el spec la **recupera** del cuerpo del POST para
 * comprobar que corresponde al mensaje de publicación (ADR-30: ficha + huella + hora + dominio).
 *
 * Fronteras que se doblan (y por qué):
 *   · **Redis** se sustituye por el servidor RESP mínimo de `support/fake-redis.mjs`, arrancado por
 *     `webServer`, para que el guard verifique el JWT y su blocklist sin infraestructura.
 *   · **PostgreSQL y las rutas `/api/**`** se interceptan en el navegador con `page.route`: el panel
 *     es cliente y consume la API por `fetch`, así que se fija el contrato HTTP sin base de datos.
 *   · **La cadena** (RPC 8545) se intercepta igual: `eth_call` de `isRoomRegistered` responde `true`
 *     y los recibos son éxitos, de modo que el camino firmado se ejecuta; la firma de la cartera no
 *     se simula.
 *
 * `playwright.config.ts` ejecuta esta suite en `chromium` (escritorio) y `mobile` (Pixel 5): el
 * mismo flujo debe funcionar en los dos viewports (RNF-18).
 */

const CHAIN_ID_HEX = "0x13d52"; // 81234 — red del proyecto (Anvil espejo / Besu)
const RDNS = "es.e2e.wallet";
const ROOM_ID = "0b000000-0000-4000-8000-000000000201";
const ROOM_NUMBER = 201;
const CONTENT_HASH = `0x${"a".repeat(64)}`;
const WALLET_HASH = `0x${"b".repeat(64)}`;
const BLOCK_HASH = `0x${"c".repeat(64)}`;
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

/** Cartera de prueba (clave de Anvil #1): nunca se usa fuera de este E2E. */
const WALLET = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

const ROOM = {
  id: ROOM_ID,
  roomNumber: ROOM_NUMBER,
  floor: 2,
  roomType: "SUITE",
  capacity: 2,
  beds: 1,
  sizeM2: 32,
  descriptionEs: "Suite con vista al mar",
  descriptionEn: "Sea-view suite",
  descriptionRu: null,
  baseRateWei: "100000000000000000",
  viewKind: null,
  hasBalcony: true,
  isAccessible: false,
  decorStyle: null,
  decorPalette: null,
  decorMaterials: null,
  decorNotesEs: null,
  decorNotesEn: null,
  decorNotesRu: null,
  publicationStatus: "DRAFT",
  operationalStatus: "CLEAN",
  reservedNights: 0,
  archivedAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
} as const;

const CORS_HEADERS: Readonly<Record<string, string>> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const IS_ROOM_REGISTERED_SELECTOR = toFunctionSelector("isRoomRegistered(uint256)");

interface MockState {
  published: boolean;
  publishRequests: Array<Record<string, unknown>>;
}

/** Respuesta JSON-RPC del RPC interceptado (mismo contrato que un nodo local recién arrancado). */
function rpcResult(method: string, params: unknown): unknown {
  const list = Array.isArray(params) ? params : [];
  switch (method) {
    case "eth_chainId":
      return CHAIN_ID_HEX;
    case "net_version":
      return "81234";
    case "eth_blockNumber":
      return "0x1";
    case "eth_getBalance":
      return "0x0";
    case "eth_getTransactionCount":
      return "0x0";
    case "eth_getCode":
      return "0x";
    case "eth_gasPrice":
    case "eth_maxPriorityFeePerGas":
      return "0x3b9aca00";
    case "eth_estimateGas":
      return "0x5208";
    case "eth_getLogs":
      return [];
    case "eth_call": {
      const call = (list[0] ?? {}) as { data?: string };
      if (typeof call.data === "string" && call.data.startsWith(IS_ROOM_REGISTERED_SELECTOR)) {
        // `bool true` ABI-encoded (32 bytes).
        return `0x${"0".repeat(63)}1`;
      }
      return "0x";
    }
    case "eth_getTransactionReceipt": {
      const hash = typeof list[0] === "string" ? list[0] : WALLET_HASH;
      return {
        transactionHash: hash,
        transactionIndex: "0x0",
        blockHash: BLOCK_HASH,
        blockNumber: "0x1",
        from: WALLET.address,
        to: CONTRACT_ADDRESS,
        cumulativeGasUsed: "0x5208",
        gasUsed: "0x5208",
        effectiveGasPrice: "0x1",
        contractAddress: null,
        logs: [],
        logsBloom: `0x${"0".repeat(512)}`,
        status: "0x1",
        type: "0x2",
      };
    }
    case "eth_getBlockByNumber":
      return {
        number: "0x1",
        hash: BLOCK_HASH,
        parentHash: BLOCK_HASH,
        nonce: "0x0000000000000000",
        sha3Uncles: BLOCK_HASH,
        logsBloom: `0x${"0".repeat(512)}`,
        transactionsRoot: BLOCK_HASH,
        stateRoot: BLOCK_HASH,
        receiptsRoot: BLOCK_HASH,
        miner: WALLET.address,
        difficulty: "0x0",
        totalDifficulty: "0x0",
        extraData: "0x",
        size: "0x0",
        gasLimit: "0x1c9c380",
        gasUsed: "0x0",
        timestamp: "0x1",
        transactions: [],
        uncles: [],
        baseFeePerGas: "0x1",
        mixHash: BLOCK_HASH,
      };
    case "eth_sendRawTransaction":
    case "eth_sendTransaction":
      return WALLET_HASH;
    case "web3_clientVersion":
      return "e2e-chain/1.0.0";
    default:
      return null;
  }
}

/** Intercepta el RPC del cliente (lecturas de contrato y recibos) con un nodo de prueba. */
async function mockChain(page: Page): Promise<void> {
  await page.route(`${E2E_RPC_URL}/**`, async (route: Route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    const raw = route.request().postData() ?? "null";
    const parsed = JSON.parse(raw) as unknown;
    const answer = (entry: unknown): unknown => {
      const request = (entry ?? {}) as { id?: unknown; method?: string; params?: unknown };
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        result: rpcResult(request.method ?? "", request.params),
      };
    };
    const body = Array.isArray(parsed) ? parsed.map(answer) : answer(parsed);
    await route.fulfill({
      status: 200,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  });
}

/** Intercepta la API del back-office: sesión, listado de habitaciones, publicación y acuñado. */
async function mockBackofficeApi(page: Page, state: MockState): Promise<void> {
  const json = (route: Route, body: unknown, status = 200): Promise<void> =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();

    if (pathname === "/api/auth/session") {
      return json(route, {
        authenticated: true,
        username: "jefa@e2e.test",
        roles: ["DEFAULT_ADMIN_ROLE"],
        recoveryRemaining: null,
      });
    }
    if (pathname === "/api/auth/refresh") return json(route, { ok: true });

    if (pathname === "/api/admin/rooms/options") {
      return json(route, {
        roomTypes: [{ code: "SUITE", nameEs: "Suite", nameEn: "Suite", nameRu: "Люкс" }],
        amenities: [],
        spaceTypes: [],
      });
    }
    if (pathname === "/api/admin/rooms" && method === "GET") {
      return json(route, {
        rooms: [{ ...ROOM, publicationStatus: state.published ? "PUBLISHED" : "DRAFT" }],
      });
    }
    if (/^\/api\/admin\/rooms\/[^/]+\/publish$/.test(pathname)) {
      if (method === "GET") {
        return json(route, { contentHash: CONTENT_HASH, canPublish: true, hasDescription: true, hasImage: true });
      }
      state.publishRequests.push(request.postDataJSON() as Record<string, unknown>);
      state.published = true;
      return json(route, {
        room: { ...ROOM, publicationStatus: "PUBLISHED" },
        onChainAnchored: true,
      });
    }
    if (/^\/api\/admin\/rooms\/[^/]+\/mint-window$/.test(pathname)) {
      return json(route, {
        roomId: ROOM_ID,
        roomNumber: ROOM_NUMBER,
        roomType: "SUITE",
        windowDays: 90,
        basePriceWei: ROOM.baseRateWei,
        canMint: true,
        nights: [],
        status: { windowDays: 90, missing: 0, freeNights: 90, low: false },
      });
    }
    return json(route, { ok: true });
  });
}

/** Script que se ejecuta ANTES que la app y anuncia una cartera EIP-6963 con método `request`. */
function walletInitScript(): string {
  return `(() => {
  const ADDRESS = ${JSON.stringify(WALLET.address)};
  const CHAIN_ID_HEX = ${JSON.stringify(CHAIN_ID_HEX)};
  const RDNS = ${JSON.stringify(RDNS)};
  const listeners = new Map();
  // La cartera no está autorizada hasta que la web se lo pide: así el arranque de wagmi NO la
  // reconecta sola y el E2E ejercita el camino real de conexión del menú (EIP-6963 → connect).
  let authorized = false;
  const emit = (event, payload) => {
    for (const handler of listeners.get(event) ?? []) {
      try { handler(payload); } catch { /* una cartera nunca debe tumbar la página */ }
    }
  };
  const provider = {
    isE2EWallet: true,
    async request({ method, params }) {
      switch (method) {
        case "eth_accounts":
          return authorized ? [ADDRESS] : [];
        case "eth_requestAccounts":
          authorized = true;
          return [ADDRESS];
        case "eth_chainId":
          return CHAIN_ID_HEX;
        case "net_version":
          return String(parseInt(CHAIN_ID_HEX, 16));
        case "wallet_requestPermissions":
          authorized = true;
          return [{
            parentCapability: "eth_accounts",
            caveats: [{ type: "restrictReturnedAccounts", value: [ADDRESS] }],
          }];
        case "personal_sign": {
          const hex = String((params && params[0]) || "0x");
          const digits = hex.startsWith("0x") ? hex.slice(2) : hex;
          const text = new TextDecoder().decode(
            Uint8Array.from(digits.match(/../g) ?? [], (pair) => parseInt(pair, 16)),
          );
          return window.__e2eSignMessage(text);
        }
        case "eth_sendTransaction":
          return window.__e2eSendTransaction();
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          return null;
        default:
          return null;
      }
    },
    on(event, handler) {
      const handlers = listeners.get(event) ?? new Set();
      handlers.add(handler);
      listeners.set(event, handlers);
      return provider;
    },
    removeListener(event, handler) {
      listeners.get(event)?.delete(handler);
      return provider;
    },
    once(event, handler) {
      const wrapped = (payload) => {
        provider.removeListener(event, wrapped);
        handler(payload);
      };
      return provider.on(event, wrapped);
    },
    emit,
  };
  const info = {
    uuid: "0e2e0000-0000-4000-8000-000000000001",
    name: "Cartera E2E",
    icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
    rdns: RDNS,
  };
  const announce = () =>
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info, provider } }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();`;
}

/** Instala la cartera en el contexto (firma real en Node) y expone la sesión del back-office. */
async function installWallet(context: BrowserContext): Promise<void> {
  await context.exposeFunction("__e2eSignMessage", (message: string) => WALLET.signMessage({ message }));
  await context.exposeFunction("__e2eSendTransaction", () => WALLET_HASH);
  await context.addInitScript({ content: walletInitScript() });
}

/** Access token del back-office firmado con el mismo `JWT_SECRET` del `webServer`. */
async function mintAccessToken(): Promise<string> {
  return new SignJWT({ sub: "jefa@e2e.test", role: "DEFAULT_ADMIN_ROLE", jti: randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(E2E_JWT_SECRET));
}

test.describe("A5 · wallet inyectada (escritorio y móvil)", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ context }) => {
    await installWallet(context);
    await context.addCookies([
      { name: E2E_ACCESS_TOKEN_COOKIE, value: await mintAccessToken(), url: E2E_BASE_URL },
    ]);
  });

  test("publica una habitación firmando con la cartera inyectada", async ({ page }) => {
    const state: MockState = { published: false, publishRequests: [] };
    await mockChain(page);
    await mockBackofficeApi(page, state);

    await page.goto("/admin/habitacion");
    await expect(page.getByTestId(`room-row-${ROOM_NUMBER}`)).toBeVisible();

    // 1) Conectar la cartera por el camino real: menú de sesión del panel Administración.
    //    En móvil el sidebar es un cajón y hay que abrirlo primero.
    const navToggle = page.getByTestId("admin-nav-toggle");
    if (await navToggle.isVisible()) await navToggle.click();
    await page.getByTestId("nav-section-administracion").click();
    await page.getByTestId("wallet-menu-button").click();
    await page.getByTestId(`wallet-option-${RDNS}`).click();
    // El botón de barrido global solo se pinta con wallet conectada: prueba de conexión real.
    await expect(page.getByTestId("rooms-global-sweep")).toBeVisible();

    // En móvil el sidebar es un cajón que tapa la tabla: `Escape` lo cierra (AdminLayout lo fija
    // como atajo del cajón) y devuelve el foco a la hamburguesa.
    if ((await navToggle.getAttribute("aria-expanded")) === "true") {
      await page.keyboard.press("Escape");
      await expect(navToggle).toHaveAttribute("aria-expanded", "false");
    }

    // 2) Publicar con TOTP: el panel prepara la huella, la cartera firma y el POST lleva la firma.
    await page.getByTestId(`room-quick-publish-${ROOM_NUMBER}`).click();
    await page.getByTestId("room-publish-totp").fill("123456");
    const publishRequest = page.waitForRequest(
      (request: Request) =>
        request.method() === "POST" && /\/api\/admin\/rooms\/[^/]+\/publish$/.test(request.url()),
    );
    await page.getByTestId("room-publish-confirm").click();
    const request = await publishRequest;
    const body = request.postDataJSON() as {
      confirmTotpCode?: string;
      txHash?: string;
      signature?: string;
      signerAddress?: string;
      issuedAt?: number;
    };

    expect(body.confirmTotpCode).toBe("123456");
    expect(body.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(body.signerAddress?.toLowerCase()).toBe(WALLET.address.toLowerCase());
    expect(typeof body.issuedAt).toBe("number");
    expect(body.signature).toMatch(/^0x[0-9a-f]{130}$/);

    // 3) Oráculo criptográfico: la firma recupera la dirección de la cartera sobre el mensaje
    //    exacto de publicación (huella + hora + dominio). No basta con "hay un string".
    const message = roomPublicationMessage({
      roomNumber: ROOM_NUMBER,
      roomType: ROOM.roomType,
      contentHash: CONTENT_HASH,
      issuedAtSeconds: body.issuedAt as number,
      domain: new URL(page.url()).host,
    });
    const recovered = await recoverMessageAddress({
      message,
      signature: body.signature as `0x${string}`,
    });
    expect(recovered.toLowerCase()).toBe(WALLET.address.toLowerCase());

    await expect(page.getByTestId("rooms-notice")).toContainText(/Habitación publicada/i);
    expect(state.publishRequests).toHaveLength(1);
  });
});

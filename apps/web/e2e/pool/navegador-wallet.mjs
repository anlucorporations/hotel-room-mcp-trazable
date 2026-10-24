import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * "Navegador Wallet": cartera EIP-6963 inyectada en el navegador real (Playwright/Chromium) que
 * firma con una cuenta de Anvil contra la red de despliegue (Besu 81234).
 *
 * Las firmas y los envíos se ejecutan en Node (viem) para no manejar claves dentro de la página;
 * la página solo ve un proveedor EIP-1193 estándar, igual que vería MetaMask. Todas las lecturas
 * se reenvían al RPC real de Besu.
 */
export const CHAIN = defineChain({
  id: 81234,
  name: "Codecrypto Besu",
  nativeCurrency: { name: "CC", symbol: "CC", decimals: 18 },
  rpcUrls: { default: { http: ["https://besu.alumnos.codecrypto.academy"] } },
});

export const publicClient = createPublicClient({ chain: CHAIN, transport: http() });

/** Nombres de métodos que el proveedor debe atender con una cuenta (el resto va al RPC). */
const ACCOUNT_METHODS = new Set([
  "eth_requestAccounts",
  "eth_accounts",
  "eth_coinbase",
  "wallet_requestPermissions",
  "wallet_getPermissions",
]);

const CHAIN_METHODS = new Set(["wallet_switchEthereumChain", "wallet_addEthereumChain"]);

/**
 * Instala el proveedor en la página. `page.exposeBinding("__navegadorRpc", ...)` debe existir antes
 * de llamar a esta función (ver `installNavegadorWallet`).
 */
export async function installNavegadorWallet(context, { privateKey, name = "Navegador Wallet", rdns = "academy.codecrypto.navegador" }) {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({ account, chain: CHAIN, transport: http() });

  await context.exposeBinding("__navegadorRpc", async (_source, method, params) => {
    try {
      if (ACCOUNT_METHODS.has(method)) return { ok: true, result: [account.address] };
      if (CHAIN_METHODS.has(method)) return { ok: true, result: null };
      if (method === "personal_sign") {
        const [data, maybeAddress] = params ?? [];
        if (maybeAddress && String(maybeAddress).toLowerCase() !== account.address.toLowerCase()) {
          return { ok: false, error: "La cuenta no coincide con la dirección solicitada" };
        }
        const signature = await account.signMessage({
          message: typeof data === "string" && data.startsWith("0x") ? { raw: data } : String(data),
        });
        return { ok: true, result: signature };
      }
      if (method === "eth_signTypedData_v4" || method === "eth_signTypedData") {
        const [, typedDataJson] = params ?? [];
        const typedData = typeof typedDataJson === "string" ? JSON.parse(typedDataJson) : typedDataJson;
        const { EIP712Domain: _domain, ...types } = typedData.types ?? {};
        const signature = await account.signTypedData({
          domain: typedData.domain,
          types,
          primaryType: typedData.primaryType,
          message: typedData.message,
        });
        return { ok: true, result: signature };
      }
      if (method === "eth_sendTransaction") {
        const [tx] = params ?? [];
        const hash = await walletClient.sendTransaction({
          to: tx.to,
          value: tx.value ? BigInt(tx.value) : undefined,
          data: tx.data,
          gas: tx.gas ? BigInt(tx.gas) : undefined,
          nonce: tx.nonce !== undefined ? Number(tx.nonce) : undefined,
          maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : undefined,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas) : undefined,
          chain: CHAIN,
          account,
        });
        return { ok: true, result: hash };
      }
      const result = await publicClient.request({ method, params });
      return { ok: true, result: result ?? null };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  const initScript = ({ address, chainIdHex, walletName, walletRdns }) => {
    const listeners = new Map();
    const emit = (event, payload) => {
      for (const cb of listeners.get(event) ?? []) {
        try { cb(payload); } catch { /* noop */ }
      }
    };
    const provider = {
      isNavegador: true,
      isMetaMask: false,
      chainId: chainIdHex,
      selectedAddress: address,
      async request({ method, params }) {
        const envelope = await window.__navegadorRpc(method, params ?? []);
        if (!envelope || envelope.ok !== true) {
          const err = new Error(envelope?.error ?? "Error del proveedor");
          err.code = 4001;
          throw err;
        }
        if (method === "eth_requestAccounts") {
          setTimeout(() => emit("connect", { chainId: chainIdHex }), 0);
        }
        return envelope.result;
      },
      on(event, cb) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(cb);
        return provider;
      },
      removeListener(event, cb) {
        listeners.get(event)?.delete(cb);
        return provider;
      },
      once(event, cb) {
        const wrap = (payload) => { cb(payload); listeners.get(event)?.delete(wrap); };
        return provider.on(event, wrap);
      },
      isConnected: () => true,
    };
    window.ethereum = provider;
    const info = Object.freeze({
      uuid: crypto.randomUUID(),
      name: walletName,
      icon: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0f2b46"/><text x="16" y="21" font-size="16" text-anchor="middle" fill="#f7f3ec">N</text></svg>'),
      rdns: walletRdns,
    });
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  };

  await context.addInitScript(initScript, {
    address: account.address,
    chainIdHex: `0x${CHAIN.id.toString(16)}`,
    walletName: name,
    walletRdns: rdns,
  });

  return { account, walletClient };
}

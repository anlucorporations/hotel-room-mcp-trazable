import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";
import type { CreateConnectorFn } from "wagmi";

/**
 * Conectores de billetera del proyecto (Fase 3, 2026-10-05).
 *
 * Objetivo: que funcione **cualquier billetera**, no solo la que ocupe `window.ethereum`.
 *
 *   - **inyectadas** — con `multiInjectedProviderDiscovery` (EIP-6963) wagmi descubre TODAS las
 *     billeteras instaladas (MetaMask, Rabby, Brave, Coinbase extensión, Zerion…) y cada una aparece
 *     como conector con el nombre y el icono que anuncia. Se registra además un `injected()` de
 *     respaldo para navegadores que no anuncian por EIP-6963.
 *   - **Coinbase Wallet** — conector oficial de wagmi; funciona **sin claves de CDP**.
 *   - **WalletConnect v2** — **desactivado por defecto**: solo se registra si existe
 *     `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`. Sin esa variable no hay conector y la UI no lo ofrece
 *     (no se inventa ni se pone un valor de ejemplo). Para activarlo: define la variable con el
 *     projectId de tu proyecto de WalletConnect Cloud y vuelve a construir.
 *
 * El **plan** se calcula con una función pura para poder probarlo sin navegador.
 */
export type WalletKind = "injected" | "coinbase" | "walletconnect";

export interface WalletEnv {
  readonly walletConnectProjectId?: string | undefined;
}

/** `projectId` de WalletConnect, saneado: vacío o solo espacios ⇒ `undefined` (conector desactivado). */
export function walletConnectProjectId(raw: string | undefined = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID): string | undefined {
  const value = raw?.trim();
  return value ? value : undefined;
}

/** Plan de conectores: inyectadas (EIP-6963) + Coinbase, y WalletConnect solo si hay `projectId`. */
export function walletPlan(env: WalletEnv = {}): readonly WalletKind[] {
  const plan: WalletKind[] = ["injected", "coinbase"];
  if (walletConnectProjectId(env.walletConnectProjectId)) plan.push("walletconnect");
  return plan;
}

/** Conectores de wagmi según el plan. */
export function buildWalletConnectors(env: WalletEnv = {}): CreateConnectorFn[] {
  return walletPlan(env).map((kind) => {
    if (kind === "injected") return injected({ shimDisconnect: true });
    if (kind === "coinbase") return coinbaseWallet({ appName: "Marina del Sol", preference: "all" });
    return walletConnect({
      projectId: walletConnectProjectId(env.walletConnectProjectId) as string,
      showQrModal: true,
      metadata: { name: "Marina del Sol", description: "Reserva de noches del hotel", url: "https://hotel-mcp-web-d6jlzeq5yq-ew.a.run.app", icons: [] },
    });
  });
}

// ---------------------------------------------------------------------------
// Selección de conector (lógica pura, probable sin navegador)
// ---------------------------------------------------------------------------

/** Lo mínimo que necesitamos de un conector de wagmi para elegirlo o listarlo. */
export interface WalletConnectorLike {
  readonly id: string;
  readonly name?: string;
  readonly rdns?: string | readonly string[];
}

/** RDNS canónico de MetaMask (EIP-6963). */
export const METAMASK_RDNS = "io.metamask";

/** Ids de los conectores que **declara** el proyecto (no provienen del descubrimiento EIP-6963). */
const DECLARED_IDS: readonly string[] = ["injected", "coinbaseWallet", "walletConnect"];

/** ¿El conector es MetaMask? Se mira por id, por `rdns` y, como último recurso, por nombre. */
export function isMetaMaskConnector(connector: WalletConnectorLike): boolean {
  if (connector.id === METAMASK_RDNS || connector.id === "metaMask") return true;
  const rdns = connector.rdns;
  if (rdns === METAMASK_RDNS) return true;
  if (Array.isArray(rdns) && rdns.includes(METAMASK_RDNS)) return true;
  return /metamask/i.test(connector.name ?? "");
}

/**
 * Conector que se usa al pulsar «Conectar» sin elegir cartera.
 *
 * Antes se buscaba `id === "metaMask"`, un id que **no existe** cuando la cartera llega por EIP-6963
 * (su id es el RDNS, `io.metamask`), así que la búsqueda siempre fallaba y se acababa conectando el
 * primer conector de la lista. Ahora se prefiere MetaMask de verdad y, si no está, el `injected` de
 * respaldo y, en último término, el primero disponible.
 */
export function pickPreferredConnector<T extends WalletConnectorLike>(
  connectors: readonly T[],
): T | undefined {
  return (
    connectors.find(isMetaMaskConnector) ??
    connectors.find((connector) => connector.id === "injected") ??
    connectors[0]
  );
}

/**
 * Conectores que se ofrecen en el selector.
 *
 * Cuando el descubrimiento EIP-6963 ha encontrado carteras, el `injected()` declarado es un
 * **duplicado** de la que ocupa `window.ethereum` (suele ser la propia MetaMask) y solo confunde: se
 * oculta. Si no se descubrió ninguna, se mantiene como único respaldo.
 */
export function visibleWalletConnectors<T extends WalletConnectorLike>(
  connectors: readonly T[],
): readonly T[] {
  const hasDiscovered = connectors.some((connector) => !DECLARED_IDS.includes(connector.id));
  return hasDiscovered ? connectors.filter((connector) => connector.id !== "injected") : connectors;
}

import type { Hex } from "viem";

/**
 * Cuentas de desarrollo de Anvil.
 *
 * Son las claves que `anvil` imprime al arrancar: **vectores publicos de prueba**, no secretos. Viven
 * aqui, y no en el `.env`, para que la topologia de cuentas del entorno local sea la misma en todos
 * los guiones y se pueda revisar en el repositorio.
 *
 * IMPORTANTE: en cualquier red real (testnet o produccion) estas claves son publicas y su saldo esta
 * comprometido; cada entorno usa su propio gestor de secretos.
 */
export const ANVIL_ACCOUNTS: Readonly<{
  owner: Hex;
  reception: Hex;
  userA: Hex;
  userB: Hex;
}> = Object.freeze({
  owner: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  reception: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  userA: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  userB: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
});

/** Direcciones derivadas (utiles para mensajes y comprobaciones; no se calculan a mano). */
export const ANVIL_ADDRESSES: Readonly<Record<keyof typeof ANVIL_ACCOUNTS, string>> = Object.freeze({
  owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  reception: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  userA: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  userB: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
});

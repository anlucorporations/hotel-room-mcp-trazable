/**
 * `@hotel/shared/domain` — punto de entrada **isomorfo** (apto para navegador).
 *
 * Motivo: el barril raíz (`src/index.ts`) reexporta también módulos que solo existen en
 * servidor (`pg` en `db/*`, `ioredis` en `redis/*`, `bullmq` en `queue/*`, `node:fs` en
 * `deployments`, `node:crypto` en `auth`/`passes`/`events`, `server-only`, `node:http` en
 * `health`). Un **componente de cliente** que importe valores del barril arrastra todo eso
 * al bundle del navegador y `next build` falla con `Module not found: Can't resolve
 * 'child_process'` (arrastrado por bullmq).
 *
 * Este entry expone SOLO la parte isomórfica del paquete. Es una lista **cerrada y
 * explícita**: no usa `export *` desde `./index` ni desde directorios que puedan crecer con
 * módulos de servidor. Si un módulo nuevo necesita exponerse aquí, hay que comprobar antes
 * que no importa `pg`, `ioredis`, `bullmq`, `server-only` ni builtins `node:*` de servidor.
 *
 * Deps permitidas (ya usadas por el cliente): `viem` (resuelto por el consumidor, marcado
 * `external` en tsup).
 *
 * Contrato comprobable:
 *   grep -nE '"(pg|ioredis|bullmq|server-only)"|"node:' src/browser.ts src/constants.ts \
 *     src/network.ts src/domain/*.ts src/abi/*.ts   # sin coincidencias
 *
 * NO se modificó `src/index.ts`: los consumidores de servidor siguen usando el barril raíz.
 */

// Constantes y umbrales del sistema (valores `bigint`/`as const`).
export * from "./constants";

// Red Besu/Anvil para viem (incluye `besuChain`, `anvilChain`, `activeChain`).
export * from "./network";

// Dominio puro: tipos, tokenId, maestro de habitaciones, estados, agregados, tx de compra,
// roles RBAC, faucet e IPFS. Sin E/S ni dependencias de Node.
export * from "./domain/types";
export * from "./domain/roles";
export * from "./domain/room-master";
export * from "./domain/token-id";
export * from "./domain/night-state";
export * from "./domain/aggregates";
export * from "./domain/purchase-tx";
export * from "./domain/ipfs";
export * from "./domain/faucet";

// Autorización EIP-712 del resguardo (dominio y tipos): datos constantes que el CLIENTE tiene que
// firmar con el mismo formato que verifica el servidor. Se movieron aquí desde `passes/jws.ts`
// (que importa `node:crypto`) para que el componente de compra pueda importarlos sin arrastrar el
// servidor al bundle del navegador.
export * from "./domain/ticket-auth";

// ABIs de los contratos (objetos `as const` consumidos por viem/wagmi en el cliente).
export * from "./abi/index";

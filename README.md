# Hotel Marina del Sol — noches de hotel como NFTs

Piloto/PoC que tokeniza cada **noche de habitación** como un NFT ERC-721 sobre una red
**Besu privada** (chainId `81234`), con compra primaria, reventa con royalty (ERC-2981) y
asistente IA (LLM + MCP). La especificación completa está en [`docs/`](./docs).

> Estado: **FASE 0 (cimientos) completada.** Ver [`docs/PLAN-CONSTRUCCION.md`](./docs/PLAN-CONSTRUCCION.md).

## Estructura (monorepo pnpm + Turborepo)

```
apps/
  web/        Next.js (App Router): tienda + back-office + chat
  worker/     mini-worker de eventos → email + agregados (RF-09)
  mcp/        MCP server del contrato (RF-12)
packages/
  contracts/  Foundry: HotelNights.sol + despliegue con bootstrap de roles
  shared/     fuente única: constantes, tipos, dominio, red, /health, deployments
  config/     presets compartidos (tsconfig, eslint, tailwind)
```

## Requisitos

- Node ≥ 20 (recomendado 24), **pnpm** 10, **Foundry** (forge/anvil/cast).

## Puesta en marcha

```bash
pnpm install                 # instala el workspace (aprueba el build de esbuild vía pnpm)
git submodule update --init --recursive   # deps Solidity (OZ v5, forge-std)
pnpm build                   # turbo: compila shared → apps + contrato
pnpm test                    # tests unitarios (shared, worker, mcp)
```

### Contrato

```bash
pnpm --filter @hotel/contracts build    # forge build
pnpm --filter @hotel/contracts test     # forge test
pnpm --filter @hotel/contracts smoke    # Anvil 81234: deploy + bootstrap + verificación de roles
```

El deploy aplica el **bootstrap de roles** (ADR-06): despliega con un EOA, concede los 6
roles al admin definitivo, transfiere la propiedad (Ownable2Step) y revoca el EOA. El
registro `{address, deploymentBlock, abiHash}` se sincroniza a
`packages/shared/deployments/<chainId>.json`.

### Configuración / secretos

Copia [`.env.example`](./.env.example) a `.env` y rellena. El secret manager
(`@hotel/shared/env`) valida con **fail-fast** al arrancar. Nunca se comitean secretos.

## Scripts del workspace

| Comando | Descripción |
|---------|-------------|
| `pnpm build` | Compila todos los paquetes (Turborepo) |
| `pnpm typecheck` | `tsc --noEmit` en cada paquete |
| `pnpm lint` | ESLint (flat config compartida) |
| `pnpm test` | Tests unitarios (Vitest) |
| `pnpm --filter @hotel/web test:e2e` | E2E con Playwright |

## Calidad

Código limpio y principios **SOLID** en toda la implementación. Test-first, commits
atómicos, 1 Trabajo = 1 PR contra la rama de fase (ver `docs/PLAN-CONSTRUCCION.md`).

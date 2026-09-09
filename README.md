# Hotel Marina del Sol — Plataforma NFT de Reservas

Sistema Web3 que tokeniza cada **noche de habitación** como un NFT ERC-721 sobre **Polygon PoS** (mainnet) / **Polygon Amoy** (testnet), con compra primaria anónima, marketplace de reventa con royalties forzados (EIP-2981), check-in seguro on-chain, panel de Back-office con MFA y observabilidad centralizada.

> **Estado**: Sprint 0 completado · Sprint 1 (Smart Contracts) en preparación.  
> Documentación técnica completa en [`docs/`](./docs).

---

## Documentación

| Documento | Descripción |
|-----------|-------------|
| [`docs/PRD.md`](./docs/PRD.md) | Requisitos funcionales y de negocio (v1.1.0) |
| [`docs/SRS.md`](./docs/SRS.md) | Especificación técnica de software (v1.3.0) |
| [`docs/PLAN-CONSTRUCCION.md`](./docs/PLAN-CONSTRUCCION.md) | Plan de construcción y fases (v1.2.0) |
| [`docs/BACKLOG-SPRINTS.md`](./docs/BACKLOG-SPRINTS.md) | Backlog y 142 Story Points (v1.2.0) |
| [`docs/GUIA-GNOSIS-SAFE.md`](./docs/GUIA-GNOSIS-SAFE.md) | Runbook de custodios multisig (v1.0.0) |

---

## Estructura del Monorepo (pnpm + Turborepo)

```
apps/
  web/        Next.js (App Router): tienda pública + back-office + recepción
  worker/     Event Listener (WebSocket) + Bot Burner + Cola BullMQ
  mcp/        MCP server del contrato (extensibilidad futura)
  monitor/    Monitoreo de métricas de observabilidad
packages/
  contracts/  Foundry: HotelNFT.sol + HotelMarketplace.sol + scripts de despliegue
  shared/     Fuente única: constantes, tipos, dominio, logger, deployments
  config/     Presets compartidos (tsconfig, eslint, tailwind)
docs/         Especificaciones técnicas y guías operativas
```

---

## Requisitos

- **Node.js** ≥ 24 · **pnpm** 10.32.1 · **Foundry** (forge/anvil/cast) v1.7+
- **Docker** (opcional para dev local: PostgreSQL 16 + Redis 7)

---

## Inicio Rápido (Desarrollo Local)

### 1. Clonar y preparar entorno

```bash
git clone https://gitlab.com/anlucorporations/hotel-room-mcp-trazable.git
cd hotel-room-mcp-trazable
git submodule update --init --recursive   # OpenZeppelin v5 + forge-std
cp .env.example .env                      # Completar con valores locales
```

### 2. Levantar servicios de infraestructura local (Docker)

```bash
docker compose up -d        # PostgreSQL 16 en :5432 + Redis 7 en :6379
docker compose ps           # Verificar que ambos estén en estado "healthy"
```

### 3. Instalar dependencias y compilar

```bash
pnpm install                 # Instala el workspace completo
pnpm build                   # Turbo: shared → apps + forge build
pnpm typecheck               # Verificación de tipos TypeScript
```

### 4. Tests

```bash
pnpm test                              # Tests unitarios (Vitest)
pnpm --filter @hotel/contracts test    # Tests Foundry (forge test)
```

---

## Contratos Inteligentes (Foundry)

```bash
# Compilar contratos
pnpm --filter @hotel/contracts build    # forge build

# Tests y cobertura
pnpm --filter @hotel/contracts test     # forge test -vvv

# Deploy local con Anvil
pnpm --filter @hotel/contracts smoke    # Deploy en Anvil + bootstrap de roles

# Deploy en Polygon Amoy (Testnet) — requiere variables de entorno
# Linux/GCP:   bash packages/contracts/scripts/deploy-amoy.sh
# Windows:     pwsh packages/contracts/scripts/deploy-amoy.ps1
```

El despliegue aplica el **bootstrap de roles** (ADR-06): despliega con un EOA → concede los 4 roles al admin definitivo (Gnosis Safe 2-of-3 en producción) → transfiere la propiedad y revoca el EOA. El registro `{address, deploymentBlock}` se sincroniza a `packages/shared/deployments/<chainId>.json`.

---

## Pipeline CI/CD (GitLab)

El pipeline `.gitlab-ci.yml` ejecuta automáticamente:

| Stage | Descripción | Bloquea |
|-------|-------------|---------|
| `lint` | ESLint + TypeScript (typecheck) | ✅ Sí |
| `test` | Vitest (shared/worker/mcp) + forge test | ✅ Sí |
| `coverage` | Cobertura Foundry (lcov) | ❌ Informativo |
| `slither` | Análisis estático de contratos (DoD: sin HIGH ni CRITICAL) | ✅ Sí |
| `e2e` | Playwright sobre build de producción | ⚠️ Warning (Sprint 4+) |

---

## Comandos del Workspace

| Comando | Descripción |
|---------|-------------|
| `pnpm build` | Compila todos los paquetes (Turborepo) |
| `pnpm typecheck` | `tsc --noEmit` en cada paquete |
| `pnpm lint` | ESLint (flat config compartida) |
| `pnpm test` | Tests unitarios (Vitest) |
| `pnpm --filter @hotel/web test:e2e` | E2E con Playwright |
| `pnpm clean` | Limpia artefactos de build |

---

## Redes Blockchain

| Red | Chain ID | Uso | RPC |
|-----|----------|-----|-----|
| Anvil (local) | 31337 | Desarrollo local | `http://127.0.0.1:8545` |
| Polygon Amoy | 80002 | Testnet / QA | Alchemy Amoy RPC |
| Polygon PoS | 137 | Producción | Alchemy Mainnet RPC |

---

## Calidad y Convenciones

- **Cobertura objetivo**: ≥ 80% (contratos con forge lcov, backend con Vitest)
- **Slither**: Sin hallazgos HIGH ni CRITICAL en CI (DoD global)
- **Commits**: Atómicos con mensajes convencionales (`feat:`, `fix:`, `docs:`, `test:`)
- **Observabilidad**: Sentry (errores) + GCP Cloud Logging (JSON estructurado)

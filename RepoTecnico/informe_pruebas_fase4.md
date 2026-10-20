# Informe de pruebas — Fase 4 (2026-10-20)

**Alcance:** verificación completa del repositorio al arrancar la Fase 4, más los dos criterios que
seguían abiertos de la Fase 3 (**A5** y **A12**). **Entorno:** Ubuntu 24.04, Node v22.23.2 (el proyecto
pide ≥24: aviso de engine, sin efecto en los resultados), 2 vCPU / ~2 GB RAM.

**Resultado global: 2.465 pruebas de código + 126 E2E, 0 fallos.**

---

## 1. Resumen por suite

| Suite | Comando | Resultado |
|---|---|---|
| Contratos (Foundry) | `forge test` | **202 pruebas / 20 suites / 0 fallos** · invariantes 256 runs (8.192 llamadas, 0 contraejemplos) |
| `@hotel/shared` | `pnpm --filter @hotel/shared test` | **758/758** (76 ficheros) |
| `@hotel/web` | `pnpm --filter @hotel/web test` | **1188/1188** (134 ficheros) |
| `@hotel/worker` | `pnpm --filter @hotel/worker test` | **189/189** (19 ficheros) |
| `@hotel/mcp` | `pnpm --filter @hotel/mcp test` | **86/86** (7 ficheros) |
| `@hotel/monitor` | `pnpm --filter @hotel/monitor test` | **42/42** (5 ficheros) |
| E2E Playwright | `pnpm --filter @hotel/web exec playwright test` | **126/126** en `chromium` y `mobile` (Pixel 5) |

**Total pruebas de código:** 202 + 758 + 1188 + 189 + 86 + 42 = **2.465**.

## 2. Gates estáticos y de build

| Gate | Resultado |
|---|---|
| `pnpm typecheck` (6 paquetes) | verde |
| `pnpm lint` | **0 errores**; solo warnings preexistentes (`no-console` en scripts y `<img>` en `TicketView`) |
| `next build` (web) | verde; en este entorno requirió `NODE_OPTIONS=--max-old-space-size=1536` (heap por defecto insuficiente con 1,9 GB de RAM) |
| Guardián de arquitectura | verde (incluye paridad de tablas `schema.sql` ↔ `migrator.ts` ↔ `base_datos.sql`) |
| Guardián documental (**nuevo**, A12) | **5/5**; compara `base_datos.sql` ↔ `diccionario_datos.md` ↔ `diagrama_er.md`; prueba de mutación verificada |

## 3. E2E — 126/126

- **A5 (nuevo)**: `wallet-publicacion.spec.ts` — cartera EIP-6963 real (cuenta viem) con sesión JWT
  verificada por el guard contra un Redis mínimo en memoria; flujo preparar → firmar → confirmar →
  aplicar de `RoomsAdmin` y oráculo criptográfico (`recoverMessageAddress` sobre el mensaje de
  publicación). Pasa en escritorio y móvil.
- **Accesibilidad**: 34 rutas escaneadas con axe-core sin violaciones *critical/serious*.
- **Puertas de sesión** de las suites F4/F5/F6/F7/F10 y redirección D-C40.
- **Deriva corregida en esta fase** (fallos preexistentes, no regresiones):
  `home.spec` (H1 y `/admin/mint` obsoletos), `observabilidad.spec` (selector ambiguo en móvil) y
  `a11y.spec` (ruta retirada + timeout del escaneo).

## 4. Hallazgos y estado de los criterios

| Criterio | Estado |
|---|---|
| A5 · E2E con wallet en escritorio/móvil | **CUMPLE** (automatizado) |
| A12 · datos sincronizados | **CUMPLE** (guardián documental nuevo) |
| A9 · drill a instancia aislada | Pendiente **solo** de IAM `cloudsql.backups.restore`; guía lista en `F9-a9-drill-restauracion-iam.md` |
| Resto A1–A14 | CUMPLE (ver `aceptacion_fase3.md`) |

## 5. No ejecutado en este entorno (delegado a CI)

| Gate | Motivo |
|---|---|
| Job de esquema con PostgreSQL 18 + `psql` | no hay PostgreSQL local; lo ejecuta el job `schema` de `.github/workflows/ci.yml` |
| `slither` (gate high) | requiere toolchain Python/Docker del job de CI |
| Perf nightly / load | medición de Fase 3 vigente (A8: p95 72,6/76,5 ms); nightly informativo de CI |
| E2E de flujos EIP-712 con PostgreSQL real (mantenimiento/ama de llaves) | requiere backend servible; hoy cubiertos por pruebas estáticas + evidencia de producción |

## 6. Reproducción

```bash
# Código
forge test
corepack pnpm test
corepack pnpm typecheck
corepack pnpm lint

# Build + E2E (web)
NODE_OPTIONS=--max-old-space-size=1536 corepack pnpm --filter @hotel/web build
corepack pnpm --filter @hotel/web exec playwright test
```

> **Nota de entorno (sandbox):** Chromium headless necesitó las bibliotecas de sistema
> (`libnspr4`, `libnss3`, …) instaladas sin root extrayendo los `.deb` en una ruta local +
> `LD_LIBRARY_PATH`; en CI lo resuelve `playwright install --with-deps chromium`.

**Evidencias:** [`evidencias/fase4-e2e-a5-wallet-2026-10-20.json`](./evidencias/fase4-e2e-a5-wallet-2026-10-20.json) ·
[`evidencias/fase4-a12-sincronizacion-documental-2026-10-20.json`](./evidencias/fase4-a12-sincronizacion-documental-2026-10-20.json) ·
[`aceptacion_fase3.md`](./aceptacion_fase3.md)

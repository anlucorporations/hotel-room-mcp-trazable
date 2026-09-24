# Manuales técnicos — Hotel Marina del Sol

> **Proyecto**: `hotel-room-mcp-trazable` · plataforma de noches tokenizadas
> **Ámbito**: documentación **técnica** de operación y mantenimiento del sistema construido.
> **Fuentes normativas**: [`docs/adr/`](../../docs/adr/README.md) (26 ADR), [`docs/SRS.md`](../../docs/SRS.md),
> [`docs/PRD.md`](../../docs/PRD.md), [`docs/PLAN-CONSTRUCCION.md`](../../docs/PLAN-CONSTRUCCION.md).
> **Estado de partida**: M0–M8 cerrados y verificados; M9 (documentación y entrega) en curso.

## Qué hay aquí y a quién sirve

| Manual | A quién sirve | Qué responde |
|---|---|---|
| [01 · Arquitectura](01-arquitectura/README.md) | Ingeniería, supervisión técnica | Qué componentes hay, cómo se hablan y qué decisiones son normativas |
| [01 · Mapa del monorepo](01-arquitectura/01-monorepo.md) | Quien toca el código por primera vez | Dónde vive cada fichero y qué comando lo construye y lo prueba |
| [02 · Instalación (Windows)](02-instalacion/README.md) | Quien monta el entorno desde cero | Requisitos, PostgreSQL, Redis, Anvil, `.env`, migraciones y comprobación final |
| [02 · Variables de entorno](02-instalacion/01-variables-de-entorno.md) | Operación, despliegue | Contrato de variables: obligatoriedad, ejemplo y consecuencia de que falte |
| [02 · Base de datos](02-instalacion/02-base-de-datos.md) | Operación, desarrollo | Esquema de 13 tablas, migraciones ordenadas, respaldo y restauración |
| [03 · Operación diaria](03-operacion/README.md) | Quien arranca y vigila el sistema | Orden de arranque, salud, diagnóstico rápido y rutinas |
| [03 · Despliegue y redespliegue](03-operacion/01-despliegue-y-redespliegue.md) | Responsable técnico | Despliegue canónico, bootstrap de roles, verificación con `cast`, redespliegue |
| [03 · E2E y verificación](03-operacion/02-e2e-y-verificacion.md) | Ingeniería, auditoría | Los cuatro E2E on-chain, la carga y la recuperación, con su evidencia |
| [03 · Incidentes](03-operacion/03-incidentes.md) | Guardia, operación | Runbook: síntoma → diagnóstico → acción → qué NO hacer |
| [04 · Mantenimiento](04-mantenimiento/README.md) | Ingeniería | Dónde se toca cada cosa, cómo se añade migración/ruta/prueba y qué guardianes hay |
| [04 · Seguridad](04-mantenimiento/01-seguridad.md) | Ingeniería, seguridad | Autenticación, roles, firma EIP-712, secretos y respuesta a una filtración |
| [04 · Rendimiento y cobertura](04-mantenimiento/02-rendimiento-y-cobertura.md) | Ingeniería, dirección técnica | Cómo se mide, qué se ha medido de verdad y qué huecos están declarados |

## Requisitos previos (para cualquier manual)

**Node ≥ 24** · **pnpm 10** (`pnpm@10.32.1`) · **PostgreSQL 18** · **Redis-compatible ≥ 5 (7.x)** ·
**Foundry** (`forge`, `anvil`, `cast`) · red canónica **Anvil local** `http://127.0.0.1:8545`,
`chainId 81234`. Comprueba con `node --version`, `pnpm --version`, `psql --version`, `forge --version`
y `cast chain-id --rpc-url http://127.0.0.1:8545`.

**Puertos**: web **3000**, worker **8787**, MCP **8788**, PostgreSQL **5432**, Redis **6379**.
Detalle de entornos y variables: [`../entornos_globales.md`](../entornos_globales.md).

## Quiero hacer X → ve a este documento

| Quiero… | Documento |
|---|---|
| Montar el proyecto en una máquina Windows limpia | [02 · Instalación](02-instalacion/README.md) |
| Saber qué variable es obligatoria y qué pasa si falta | [02 · Variables de entorno](02-instalacion/01-variables-de-entorno.md) |
| Ver el esquema de datos o añadir una migración | [02 · Base de datos](02-instalacion/02-base-de-datos.md) |
| Desplegar el contrato por primera vez | [03 · Despliegue y redespliegue](03-operacion/01-despliegue-y-redespliegue.md) |
| Cambiar el contrato (el contrato es inmutable) | [03 · Despliegue y redespliegue](03-operacion/01-despliegue-y-redespliegue.md) § Redespliegue |
| Ejecutar los E2E on-chain y leer su evidencia | [03 · E2E y verificación](03-operacion/02-e2e-y-verificacion.md) |
| Atender una alerta o un servicio caído | [03 · Incidentes](03-operacion/03-incidentes.md) |
| Arrancar/parar el sistema y comprobar salud | [03 · Operación diaria](03-operacion/README.md) |
| Añadir una ruta de API protegida o una prueba | [04 · Mantenimiento](04-mantenimiento/README.md) |
| Entender autenticación, roles o firma EIP-712 | [04 · Seguridad](04-mantenimiento/01-seguridad.md) |
| Reproducir las cifras de carga y de cobertura | [04 · Rendimiento y cobertura](04-mantenimiento/02-rendimiento-y-cobertura.md) |
| Saber por qué una pieza es como es | [`docs/adr/README.md`](../../docs/adr/README.md) |

## Reglas del repositorio que afectan a estos manuales

- **No se hace `push` sin orden explícita del responsable.** Los `.ps1` se mantienen en **ASCII puro**.
- **No se editan ficheros UTF-8 con `Get-Content -Raw`/`Set-Content`** (corrompe acentos).
- **No se ejecutan dos suites a la vez** en el mismo workspace, y los **E2E locales exigen el worker
  parado** (indexa el mismo contrato y pisa las filas que los guiones afirman).

---

*Manuales técnicos · creados en M9 · cada afirmación se puede seguir hasta el código, la prueba o el artefacto.*

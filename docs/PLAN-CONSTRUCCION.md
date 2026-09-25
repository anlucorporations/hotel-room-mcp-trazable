# Plan de construcción del software

## Hotel Marina del Sol: plataforma de noches tokenizadas

> **Versión**: 2.0.0 (reescritura completa; sustituye a la v1.2.0)
> **Fecha**: 2026-09-23 · **Hito**: M9 · **Decisión de origen**: D-15
> **Alineación**: [`docs/PRD.md`](PRD.md) v2.0.0 · [`docs/SRS.md`](SRS.md) v2.0.0 · [`docs/adr/`](adr/README.md) · [`docs/BACKLOG-SPRINTS.md`](BACKLOG-SPRINTS.md) v2.0.0
> **Repositorio**: `hotel-room-mcp-trazable`

## 0. Qué cambia respecto a la versión 1.2.0

La v1.2.0 planificaba construir sobre **Polygon Amoy y Polygon PoS**, con despliegues en una VM de GCP,
Sentry para observabilidad y una pareja de contratos (`HotelNFT` + `HotelMarketplace`). Nada de eso es
el sistema entregado. Este plan describe **cómo se construyó de verdad y cómo se sigue construyendo**:
una red local reproducible, un contrato único, verificación con artefacto y hitos verticales.

La lección que originó esta reescritura está escrita en el registro de estado y conviene no perderla:
**`pnpm typecheck`, 423 pruebas de workspace y 145 de Foundry estaban en verde mientras las dos páginas
principales del producto no renderizaban.** Ninguna verificación sustituye a ejecutar el sistema.

## 1. Enfoque

1. **Hitos verticales, no capas.** Cada hito (M0…M9) es una entrega **operable y comprobable**: se
   puede arrancar, probar y verificar al terminarla. El orden minimiza retrabajo (primero el entorno y
   el contrato, porque todo depende de ellos).
2. **Ejecutar el sistema es un paso del proceso, no una comprobación final.** Todo hito se cierra
   contra el sistema en marcha (servidor real, base real, cadena real), y los defectos que aparecen ahí
   se corrigen en el mismo hito.
3. **Fallo en cerrado.** Si falta un secreto, una autorización o un dato crítico, el sistema **no hace
   la operación**: no inventa un valor por defecto ni simula éxito.
4. **La deuda se escribe.** Lo que no se hace queda declarado con su motivo y su destino (PRD §9,
   SRS §11, backlog §3). Un documento que esconde la deuda obliga a descubrirla en producción.
5. **Verificación adversarial.** Los hitos con impacto económico o de seguridad se cierran con un
   verificador **distinto del autor** que intenta falsarlos por su cuenta. En M4–M8 encontró 20
   defectos reales que las pruebas propias no cubrían; todos se corrigieron antes de cerrar el hito.

### Ciclo de trabajo de un hito

```
(1) Fijar el criterio de aceptación y su artefacto
        ↓
(2) Implementar (una sola generación: un contrato, un acceso, una base de datos)
        ↓
(3) Ejecutar el sistema: arrancar servicios, correr E2E on-chain, medir
        ↓  ← aquí aparecen los defectos reales (migraciones, env, bundles, reloj, nonces…)
(4) Corregir lo que la ejecución destapa, con prueba de regresión y/o guardián
        ↓
(5) Verificación adversarial independiente → reservas → corregir → documentar
        ↓
(6) Cerrar: registrar en RepoTecnico/estado_proyecto.md §9 con evidencias y hashes
```

## 2. Entornos

| Parámetro | Desarrollo (vigente) | Red privada Besu (equivalente) | Polygon (fase posterior) |
|---|---|---|---|
| Red | **Anvil local** | Besu de laboratorio | Polygon PoS 137 / Amoy 80002 |
| `chainId` | **81234** | 81234 | 137 / 80002 |
| RPC | `http://127.0.0.1:8545` | nodos de laboratorio | proveedor gestionado |
| Moneda | **ETH** | ETH | POL |
| Contrato | **`HotelNights`** | `HotelNights` | `HotelNights` |
| Confirmaciones | **1** | 1 | 32 (a fijar y probar con reorg real) |
| Rango de `getLogs` | **5.000 bloques** | 5.000 | 2.000 |
| Base de datos | **PostgreSQL 18 local** | PostgreSQL | PostgreSQL gestionado |
| Redis | **nativo local** (≥ 5; 7.x) | sí | gestionado |
| Observabilidad | **logging estructurado JSON** | logging | logging (+ lo que decida operación) |

- **No hay *failover* multi-RPC** ni Sentry: se retiraron del alcance (ADR-26).
- Los valores de Polygon quedan como **configuración documentada de mainnet**, no como implementación.
- Detalle de puertos, variables y comandos: [`RepoTecnico/entornos_globales.md`](../RepoTecnico/entornos_globales.md).

## 3. Compuertas de calidad (quality gates)

El pipeline de GitLab (`.gitlab-ci.yml`) tiene **ocho etapas bloqueantes** y **ningún** `|| true` ni
`allow_failure: true` que pueda enmascarar un fallo (el único `|| true` es el que mata el proceso de
Anvil en el `after_script`):

| Etapa | Qué ejecuta | Bloquea |
|---|---|---|
| `setup` | pnpm + Foundry | sí |
| `static` | `typecheck`, `lint`, `forge fmt --check` | sí |
| `test` | Vitest (5 paquetes) + `forge test` (13 suites, tras retirar la generación legacy en M9) | sí |
| `coverage` | `test:coverage` con umbrales + `forge coverage` + lcov | sí (trinquete) |
| `chain-e2e` | E2E on-chain M4–M7 contra Anvil con PostgreSQL y Redis, desplegando el contrato y **descubriendo su dirección del broadcast real** | sí |
| `web-e2e` | Playwright + axe | sí |
| `certifications` | carga real (`test:load`) + recuperación real (`test:dr`) | sí |
| `security` | Slither `--fail-high` | sí |

**Comandos locales equivalentes**:

```bash
pnpm typecheck && pnpm lint && pnpm test        # estático + pruebas
pnpm test:coverage                              # cobertura con umbrales
pnpm test:e2e:m4 && pnpm test:e2e:m5 && pnpm test:e2e:m6 && pnpm test:e2e:m7
pnpm --filter @hotel/web exec playwright test    # axe, 12/12
pnpm test:load && pnpm test:dr                   # certificaciones con artefacto
```

**Antes de ejecutar los E2E locales hay que parar el worker**: indexa el mismo contrato y reescribe
las filas que los guiones afirman. El pipeline no lo arranca en el job de cadena, así que allí no
ocurre; es un prerrequisito del entorno local (deuda declarada: conviene que los guiones lo detecten).

## 4. Los diez hitos verticales

| Hito | Objetivo | Entregable verificable | Decisiones |
|---|---|---|---|
| **M0** | Entorno reproducible (PostgreSQL con rol y base, Redis, `.env`, Anvil 81234, migraciones) | `/health/ready` con PostgreSQL, Redis y cadena en `UP` | D-09, D-10 |
| **M1** | Contrato canónico completo | `HotelNights` con `checkedIn`/`markCheckedIn`/`RECEPTION_ROLE`, royalty por tipo inmutable y suelo de listado; `Deploy.s.sol` propio y registro validado | D-01, D-02, D-05, D-06 |
| **M2** | Una sola base de datos | Worker sin SQLite; `runMigrations` al arrancar; suite completa en verde | D-03, D-09 |
| **M3** | Acceso cerrado | Contraseña + TOTP obligatorio, guards en todas las rutas, secretos fuera con `fail-fast` | D-04 |
| **M4** | Compra y reventa operativas | Primaria en el catálogo y reventa en vista propia, con calldata verificado y firmado; `claim` para el vendedor | D-07 |
| **M5** | Recepción | Check-in con `markCheckedIn` on-chain, EIP-712 obligatorio, mismo QR rechazado dos veces, contingencia sin PII | D-05, D-13 |
| **M6** | Automatismos | Quema programada con lock y alerta de gas, push reales, cola única de correo con reconciliación, listener con heartbeat, monitor ampliado | D-03, D-12 |
| **M7** | Dashboard y accesibilidad | Serie mensual, desglose por tipo y ranking de más revendidas; accesibilidad verificada sobre la paleta real | D-11, D-16 |
| **M8** | Verificación reproducible | E2E on-chain real, carga y recuperación reales con artefacto, gates bloqueantes y cobertura declarada | D-08 |
| **M9** | Documentación y entrega | Registro de ADR, PRD/SRS/plan/backlog reescritos, respuesta al cliente y manuales | D-14, D-15, D-17 |

**Ruta crítica**: M0 → M1 → M2 → M3 → M4 → M5. M6–M9 no se bloquean entre sí y se paralelizan en parte.

## 5. Verificación: qué se mide y con qué

| Afirmación | Instrumento | Artefacto |
|---|---|---|
| Compra, reventa y cobro funcionan | `pnpm test:e2e:m4` (firma de verdad) | `RepoTecnico/evidencias/m4-e2e-anvil.json` |
| El check-in se ancla y no se puede repetir | `pnpm test:e2e:m5` (33 comprobaciones) | `RepoTecnico/evidencias/m5-e2e-anvil.json` |
| La quema, el correo, el push y la alerta funcionan | `pnpm test:e2e:m6` (sumideros locales) | `RepoTecnico/evidencias/m6-e2e-anvil.json` |
| Las cifras del dashboard cuadran con el histórico | `pnpm test:e2e:m7` (SQL ↔ vía independiente) | `RepoTecnico/evidencias/m7-dashboard-anvil.json` |
| El sistema aguanta carga | `pnpm test:load` (HTTP real, valida contenido) | `RepoTecnico/evidencias/load-test.json` |
| Se puede recuperar de un desastre | `pnpm test:dr` (`pg_dump` + restauración + comparación) | `RepoTecnico/evidencias/dr-verify.json` |
| La web es accesible | Playwright + axe en navegador real | informe de la suite `apps/web/e2e/a11y.spec.ts` |
| El contrato no tiene vulnerabilidades altas | Slither `--fail-high` en el pipeline | job `security` |
| La cobertura no empeora | `test:coverage` con umbrales en trinquete | `RepoTecnico/cobertura.md` + lcov |

**Límites declarados de la verificación** (no se presentan como cumplidos): LCP sin instrumento;
cobertura de `apps/web` al 24,95 %; 200 usuarios concurrentes no cumplen el SLA en una sola máquina;
reorg real de Polygon sin probar; escaneo axe sin datos reales.

## 6. Riesgos y cómo se tratan

| Riesgo | Tratamiento aplicado |
|---|---|
| Se firma una transacción distinta de la revisada | Un solo punto de firma que valida calldata, importe y **destino**, con guardián que falla si aparece un ABI o una dirección legacy (ADR-11) |
| Doble check-in de la misma noche | Ancla on-chain + consumo atómico del `jti` + cerrojo distribuido por noche (ADR-05) |
| Elusión del royalty | Transferencias directas bloqueadas + royalty inmutable por tipo + suelo de precio que nunca es 0 (ADR-07, ADR-18, ADR-19) |
| Pérdida de datos | Una sola base de datos con migraciones en el arranque y verificación de restauración real (ADR-03, ADR-23) |
| Cadena reiniciada y sistema «mudo» en silencio | Rebobinado del checkpoint al bloque de despliegue y `lag` negativo que degrada la salud (ADR-09, ADR-22) |
| Documentación que miente | ADR normativos, guardián de documentación y prohibición de referencias huérfanas (ADR-15) |
| Claves y secretos | `requireSecret` en cerrado, guardián de secretos y retirada de credenciales embebidas (ADR-04) |
| Dictamen legal (MiCA/fiscal) | Gate de la fase pública, no del MVP: no se declara certificado (D-11) |

## 7. Procedimiento para cambios a partir de ahora

1. **Toda decisión nueva entra en `docs/adr/`** antes de tocar el código, con su ADR numerado.
2. El cambio se acompaña de su prueba **y** de su guardián si lo que se protege es un invariante.
3. Si toca el contrato: nueva suite Foundry, ABI regenerado, **redespliegue** y resincronización del
   registro (el contrato no es actualizable, ADR-22).
4. Si toca el esquema: migración incremental e idempotente **en el orden correcto** (primero la
   columna, después el índice) y actualización del diccionario de datos.
5. Si publica una cifra de calidad: instrumento + artefacto, o se declara **sin medir**.
6. Al cerrar: registro en `RepoTecnico/estado_proyecto.md` §9 y actualización del PRD/SRS si cambia un
   requisito o su estado.

### Convenciones de trabajo del repositorio

- **PowerShell 5.1 lee los `.ps1` sin BOM como ANSI**: los guiones de Windows se mantienen en **ASCII
  puro** (los acentos rompen el análisis sintáctico).
- **No editar los ficheros UTF-8 con `Get-Content -Raw`/`Set-Content`**: una cadena con acentos se
  escribe en la página de códigos local y **corrompe el fichero**. Se usan las herramientas del agente
  o `[System.IO.File]::WriteAllText` con codificación explícita.
- **No ejecutar dos suites a la vez** en el mismo workspace: `tsup` limpia `packages/shared/dist` y
  Foundry reescribe su registro de despliegue; los resultados se pisan.
- **No se hace `push` sin orden explícita del responsable.**

## 8. Equipo y responsabilidades

| Rol | Responsabilidad |
|---|---|
| Responsable del proyecto | Decisiones de alcance y económicas, validación de la respuesta al cliente y de las cifras |
| Ingeniería (equipo) | Implementación, pruebas, guardianes, verificación adversarial, documentación técnica |
| Cliente (Carlos) | Fotos definitivas, firmantes de la multisig y custodia de claves, datos del PMS, decisión de red, validación en recepción |
| Asesoría legal externa | Dictamen MiCA y fiscalidad: **gate de la fase pública** |

---

*Plan v2.0.0 · reescrito en M9 · describe cómo se construyó y cómo se sigue construyendo.*

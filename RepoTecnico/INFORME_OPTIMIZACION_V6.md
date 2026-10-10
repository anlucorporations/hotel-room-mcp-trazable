# Informe de Optimización V6 — Proceso de quema de noches caducadas · Hotel Marina del Sol

**Fecha:** 2026-10-10 · **Proyecto:** `hotel-room-mcp-trazable-DSH` · **Alcance:** PROCESO DE QUEMA DE NOCHES CADUCADAS (contrato `HotelNights.burnExpired`, `BurnerService`, planificador diario del worker, endpoint/panel de quema por relayer, índice off-chain `nfts`, alertas y documentación asociada) · **Comando:** `@audita` · **Lentes:** 7 dimensiones (R1 Ambigüedad/testabilidad, R2 Consistencia, R3 Completitud RNF ISO 25010, R4 Stakeholders, R5 Trazabilidad con el brief, R6 Riesgos técnicos, R7 Seguridad y legal) en 3 fases (revisión paralela, verificación adversarial por dimensión, síntesis) · **Carácter:** LECTURA-ONLY (ningún revisor ni verificador modificó archivos; solo el sintetizador escribe este informe) · **Versión previa:** `RepoTecnico/INFORME_OPTIMIZACION_V5.md` (393 líneas, **no sobrescrito**; su alcance era la premisa del brief, no la quema).

---

## 1. Resumen ejecutivo

**VEREDICTO A LA PREGUNTA «¿ES SEGURO Y FIABLE HOY EL PROCESO DE QUEMA DE NOCHES CADUCADAS?»: NO. NO ES FIABLE, y en un modo de fallo concreto tampoco es seguro para la integridad del inventario.**

**Aptitud para producción: NO APTO** (con reservas acotadas: el núcleo on-chain —atomicidad del lote, `_soldOnce`, `burnBatchMax()` expuesto, simulación previa y marcado por eventos `Burn` solo de lo confirmado— está correcto y probado; el daño no alcanza a propiedad de un cliente porque las noches caducadas no son comprables ni revendibles, `buy`/`list`/`buyResale` revierten `NightExpired`).

Los tres motivos que sostienen el veredicto:

1. **Corrupción silenciosa del índice off-chain (H-01, CRÍTICA).** `canSimulate` convierte cualquier excepción en «no quemable» y `isGoneOnChain` convierte cualquier excepción en «ya no existe on-chain» (`packages/shared/src/burner/service.ts:342-360` y `:408-424`). Un fallo parcial de RPC (`eth_call` cae, `eth_getBalance` responde) hace que **todas** las candidatas acaben en `skipped` y la reconciliación las marque `BURNED` en la base sin que exista quema on-chain; el ciclo devuelve `COMPLETED`, no alerta y `getUnsoldExpiredNFTs` filtra `status='AVAILABLE'`, de modo que esas noches **nunca vuelven a ser candidatas**. La web ya implementa el criterio correcto (revert ≠ error de red) y el quemador no.
2. **Fallo total silencioso y sin señal de vida (H-04 y H-05, ALTA).** Si el ciclo no se ejecuta (worker caído a las 12:00, reinicio fuera de la hora, planificador desactivado por falta de clave) o si descarta el 100 % de los candidatos (relayer sin `BURNER_ROLE`, contrato en pausa), el sistema lo presenta como éxito: `COMPLETED` con `burnedTokensCount: 0`, sin alerta (`BURN_EXECUTED` solo se encola si `confirmed.length > 0`, `service.ts:197-204`), con el cerrojo diario retenido (`burn-scheduler.ts:151-154`) y sin que `/health` ni el monitor externo conozcan la quema. El fallo ya ocurrió en el despliegue real (worker sin variables de quema, planificador que nunca arrancó, detectado a mano: `RepoTecnico/estado_proyecto.md:3168-3172`).
3. **Custodia y trazabilidad del firmante (H-02 y H-06, ALTA).** El firmante de la quema del panel (`RELAYER_WALLET_PRIVATE_KEY`) acumula `MINTER + BURNER` —verificado on-chain por el Lead, §3.3; el registro de despliegue (`RepoTecnico/despliegue_gcp.md:1774-1782`) le atribuye además `DEFAULT_ADMIN`, que hoy no consta—, contra la regla documentada «cada hot-wallet tiene un solo rol» (`Manuales/04-mantenimiento/01-seguridad.md:56`); y una destrucción irreversible de inventario no exige TOTP (el minteo sí) ni deja traza off-chain de qué operador la ordenó.

A esto se suman **10 hallazgos MEDIA** (configuración no provisionada, nonce sin serializar, quema manual que no actualiza el índice, panel que dice «confirmada on-chain» con 0 quemadas, doble base horaria UTC/Madrid, «12:00» sin precisión de minuto, `dryRun` ignorado por `burnTokens`, camino operativo sin pruebas, volumen, documentación CU-13 obsoleta y mal trazada) y **3 BAJA**. **Ninguna de las 26 pruebas del proceso cruza estas fronteras**: no hay un solo test de error de red en `simulateContract`/`ownerOf`, de ciclo con todo descartado, de gating horario, de `dryRun`, de éxito cuantificado, de `burnTokens` ni de la ruta HTTP del relayer.

**Conclusión operativa:** el proceso es **apto para seguir operando en entorno de pruebas con supervisión manual**, pero **no debe declararse apto para producción** hasta cerrar H-01, H-04 y H-05 (integridad + señal de vida) y, como mínimo, H-02 y H-03 (custodia de claves y configuración). El esfuerzo combinado de los *quick wins* críticos es de horas, no de semanas.

---

## 2. Alcance y metodología

**Objeto auditado:** el proceso completo de quema de noches caducadas, en sus tres vías de ejecución (planificador diario del worker, panel de administración por relayer y llamada directa al servicio) y sus efectos off-chain (índice `nfts`, notificaciones, `/health`, documentación operativa).

**Fase 1 — REVISAR (7 lentes en paralelo, lectura-only).** Cada lente produjo hasta 12 hallazgos con evidencia `ruta:línea`:

| Lente | Foco | Hallazgos emitidos |
|---|---|---|
| R1 | Ambigüedad y testabilidad (términos no medibles, criterios no verificables) | 10 |
| R2 | Consistencia (docs vs código, contradicciones entre componentes) | 12 |
| R3 | Completitud RNF ISO 25010 (fiabilidad, observabilidad, rendimiento, mantenibilidad, auditoría) | 12 |
| R4 | Stakeholders (custodia de claves, operador, auditoría, DevOps, hotel) | 12 |
| R5 | Trazabilidad brief↔implementación (RF/CU, requisitos inventados o perdidos) | 12 |
| R6 | Riesgos técnicos (SPOF, RPC, concurrencia, despliegue, recuperación) | 12 |
| R7 | Seguridad y legal (control de acceso, custodia, reentrancy, PII) | 12 |

**Fase 2 — VERIFICAR (adversarial, por dimensión, lectura-only).** Cada verificador contrastó los hallazgos de su lente contra el código y los documentos reales con `read`/`grep`, filtró falsos positivos, deduplicó y **ajustó severidades con justificación**, aplicando la regla «ante la duda, DESCARTAR». Resultado: **67 hallazgos supervivientes** y **17 descartes** documentados con motivo (R1: 8+3; R2: 10+3; R3: 10+2; R4: 10+2; R5: 10+2; R6: 9+3; R7: 10+2). Algunos verificadores corrigieron citas erróneas de sus revisores (p. ej. la reserva de descartes está en `estado_proyecto.md:554`, no en `INFORME_OPTIMIZACION_V5.md:554`; las líneas reales de `main.ts` son 291-294) y rebajaron afirmaciones internas falsas (el ciclo programado **tampoco** avisa cuando no quema nada).

**Fase 3 — SINTETIZAR (este informe).** Deduplicación cruzada de los 67 supervivientes (el mismo defecto apareció en hasta 5 lentes), asignación de IDs únicos **H-01…H-20**, priorización por severidad y plan de acción. Los conflictos de severidad entre lentes se resuelven con el criterio más conservador y se documentan en cada hallazgo.

**Reglas:** no se añade ningún hallazgo que no provenga de los informes verificados; lo no confirmado se marca explícitamente como «necesita verificación» (§7); toda afirmación lleva evidencia `ruta:línea`.

**Nota de integridad de métodos:** la suite de pruebas **no se pudo re-ejecutar** en este entorno (`vitest` no está instalado: `node_modules/.bin/vitest` no existe). El recuento de pruebas se confirmó por inspección estática (§3); la condición «26/26 en verde» procede de la métrica declarada en el encargo y queda como **pendiente de reproducción**.

---

## 3. Estado de calidad medido

### 3.1 Pruebas del proceso (recuento confirmado por inspección propia)

| Fichero | Casos `it(` | Resultado declarado |
|---|---|---|
| `packages/shared/src/burner/burner.test.ts` | **13** | en verde |
| `apps/worker/src/burn-scheduler.test.ts` | **8** | en verde |
| `apps/web/src/lib/burn-candidates.test.ts` | **5** | en verde |
| **Total** | **26** | **26/26 en verde (métrica declarada; no re-ejecutada aquí)** |

Confirmado también por inspección: `grep "burnTokens" packages/shared/src/burner/burner.test.ts` → **0 coincidencias**; el directorio `apps/web/src/app/api/admin/expired/burn/` contiene **solo `route.ts`**, sin ningún `*.test.ts`; no existe test de `useRelayerBurn`, `AdminExpired`, `useExpiredNights` ni `checkExpired`/`scanExpired`/`parseTokenIds`.

### 3.2 Lo que NO se midió (y por qué importa)

- **Cobertura específica del proceso**: no hay instrumentación ni cifra publicada de líneas/branches del alcance `packages/shared/src/burner` + `apps/worker/src/burn-scheduler.ts` + ruta/panel de quema. El número de tests no es una métrica de cobertura.
- **Cobertura funcional ausente** (verificada por lectura): error de red en `simulateContract`/`ownerOf`, ciclo con el 100 % de candidatos descartados, fronteras de zona horaria (00:00–02:00 CEST) y de precisión horaria (12:00–12:59/13:00), `dryRun` en `burnTokens`, éxito cuantificado (`NO_TOKENS` con 0 quemadas), gating de rol del endpoint, `burnTokens`, la ruta `POST /api/admin/expired/burn` completa, `checkExpired`/`scanExpired`/`parseTokenIds`, nonce concurrente, y aviso por descartes.
- **Sin ejecución contra infraestructura real**: no se ha corrido el ciclo contra PostgreSQL/Redis/RPC reales en esta auditoría (los verificadores trabajaron lectura-only), ni se han medido tiempos del barrido del panel con inventario alto.
- **Sin pruebas de contrato ni `typecheck`/`lint` re-ejecutados** en esta fase: la única métrica reproducible aquí es el recuento estático de casos.

### 3.3 Verificación del Lead (2026-10-10, fuera del flujo de revisores)

La regla de lectura-only aplica a los 7 revisores y a los 7 verificadores; el Lead sí ha ejecutado
comprobaciones propias para no dar por bueno lo que no pueda confirmar:

1. **Las 26 pruebas SÍ se re-ejecutaron antes de la auditoría, y están en verde**: `@hotel/shared` →
   13/13 · `@hotel/worker` → 8/8 · `@hotel/web` → 5/5 (0 fallos). El aviso de §2/§3 («no se pudo
   re-ejecutar porque `vitest` no está instalado») describe el entorno de los subagentes, no el del
   Lead: la métrica de 26/26 queda **reproducida**, no solo declarada.
2. **Comprobación on-chain de roles** (solo lectura, `hasRole` contra el contrato desplegado
   `0xc66ab83418c20a65c3f8e83b3d11c8c3a6097b6f`, Anvil de pruebas en GCP):

   | Cuenta | `DEFAULT_ADMIN` | `MINTER` | `BURNER` |
   |---|---|---|---|
   | Cuenta 0 (desplegador; clave determinista en el repo) | **false** | **true** | **true** |
   | Cuenta 4 (relayer del panel de quema) | **false** | **true** | **true** |
   | Cuenta 2 (bot del worker) | false | false | true |

   Consecuencia: **H-02 se confirma en lo esencial** (el firmante de la quema acumula `BURNER_ROLE` +
   `MINTER_ROLE`, y la cuenta 0 conserva `BURNER_ROLE` con clave publicada) pero el detalle «el
   relayer tiene `DEFAULT_ADMIN_ROLE`» **no se sostiene hoy on-chain**: el `DEFAULT_ADMIN` de esa
   cuenta no consta (la cita documental de `despliegue_gcp.md:1774` describe una concesión que no se
   refleja en el estado actual, o fue revocada después). El hallazgo se mantiene ALTA por la
   acumulación `MINTER + BURNER` y por la clave de la cuenta 0, no por el `DEFAULT_ADMIN` del relayer.
3. **La quema NO está operativa hoy en producción (verificado en vivo, no solo en los documentos).**
   Inspeccionados los dos servicios desplegados en `europe-west1`:
   - `hotel-mcp-worker` (revisión `hotel-mcp-worker-00010-jut`): **17 variables, ninguna de quema** —
     sin `BURNER_WALLET_PRIVATE_KEY`, sin `BURN_HOUR_LOCAL`, sin `BURN_TIMEZONE`, sin
     `BURNER_MIN_BALANCE_NATIVE` ni `DEVOPS_ALERT_EMAIL`. Por `main.ts:290-295` el planificador
     **no arranca**: solo deja un `logger.warn` de arranque que no llega a `/health`. Consecuencia: el
     inventario caducado **no se quema automáticamente**; el ciclo diario de las 12:00 no existe en
     la práctica.
   - `hotel-mcp-web` (revisión `hotel-mcp-web-00097-qex`): **28 variables, ninguna `RELAYER_*`** → el
     botón «Quemar» del panel responde **`503 RELAYER_NOT_CONFIGURED`** (`route.ts:96-101`).

   Es decir: **H-03 no es solo un riesgo de futuro —los dos caminos de quema están apagados ahora
   mismo**— y los secretos ya existen en Secret Manager (`hotel-burner-private-key`,
   `hotel-relayer-private-key`), así que reactivarlos es una **decisión de configuración**, no un
   desarrollo. Debe hacerse **después** de cerrar H-01/H-04/H-05: activar hoy el ciclo programado
   pondría en producción precisamente el modo de fallo que este informe marca como CRÍTICO
   (corrupción silenciosa del índice y fallo total sin señal de vida).

---

## 4. Tabla de hallazgos por severidad

**Total: 20 hallazgos** — 1 CRÍTICA · 6 ALTA · 10 MEDIA · 3 BAJA.

| ID | Área | Título | Severidad |
|---|---|---|---|
| H-01 | burner / fiabilidad | Error de transporte del RPC tratado como veredicto de negocio: marca `BURNED` inventario vivo, sin alerta ni reparación | **CRÍTICA** |
| H-02 | operación / custodia de claves | El firmante de la quema acumula `MINTER + BURNER` (on-chain, §3.3); `BURNER_ROLE` residual en la cuenta 0 con clave del repo | ALTA |
| H-03 | operación / configuración | Configuración de quema no provisionada ni unificada: `RELAYER_*` fuera de plantilla, manual y script de despliegue; tres nombres de firmante | ALTA |
| H-04 | worker / observabilidad | El proceso no tiene señal de vida: sin resultado del ciclo en `/health`, sin alerta de ciclo ausente, sin pasada inicial ni recuperación | ALTA |
| H-05 | burner / operación | Un ciclo con todos los candidatos descartados se declara `COMPLETED` (0 quemadas), no alerta y retiene el cerrojo diario | ALTA |
| H-06 | operación / auditoría | Quema manual irreversible sin re-confirmación TOTP ni traza del operador que la ordenó | ALTA |
| H-07 | docs / trazabilidad | CU-13 se traza a RF-17 (registro de viajeros) cuando el requisito de la quema es RF-11 | ALTA |
| H-08 | docs | CU-13 y `cuentas_anvil.md` describen el flujo de firma ya sustituido (wagmi/navegador), niegan el endpoint del relayer y citan referencias desplazadas | MEDIA |
| H-09 | burner / índice | La quema manual (`burnTokens`) no actualiza el índice off-chain ni encola aviso: depende del listener del worker | MEDIA |
| H-10 | burner / concurrencia | Dos quemas concurrentes comparten la hot-wallet sin serialización de nonce, pese al comentario que afirma lo contrario | MEDIA |
| H-11 | web / UX operativa | El panel presenta «confirmada on-chain» con 0 noches quemadas, no muestra `burnedCount`/`skipped` y pierde los `txHashes` ya confirmados si un lote posterior falla | MEDIA |
| H-12 | contrato / docs | «Caducada» con dos bases horarias: EARS y REQUISITOS en `Europe/Madrid` frente al umbral UTC del contrato, sin tolerancia ni test de frontera | MEDIA |
| H-13 | worker | «12:00» sin precisión: el ciclo dispara en cualquier minuto de 12:00–12:59 y el gating horario no está probado | MEDIA |
| H-14 | burner | `dryRun` documentado como «no difunde nada» pero `burnTokens` lo ignora y difunde | MEDIA |
| H-15 | burner / web / mantenibilidad | El camino operativo (`burnTokens`, su ruta HTTP, el panel y su verificación de caducidad) no tiene ninguna prueba | MEDIA |
| H-16 | web / control de acceso | El gating `BURNER_ROLE` del panel es inalcanzable y la API exige `DEFAULT_ADMIN_ROLE`, contra CU-13 y el manual de seguridad | MEDIA |
| H-17 | burner / rendimiento | Volumen: `SELECT *` sin límite, una `UPDATE` por fila y lotes secuenciales; el escaneo del panel lanza los `getLogs` en paralelo sin límite de concurrencia | MEDIA |
| H-18 | burner | El tamaño máximo de lote tiene cuatro valores (50 contrato / 200 API / 20 respaldo / constante compartida muerta) sin respaldos documentados ni prueba | BAJA |
| H-19 | worker | `readChainClock` degrada al reloj de la máquina sin registrar el aviso que su propio docstring documenta | BAJA |
| H-20 | worker | Política de reintento y apagado: solo dentro de la hora, sin tope ni backoff, cerrojo diario que sobrevive a la caída, `stop()` que no espera al ciclo en vuelo y aviso de gas sin deduplicación real | BAJA |

---

## 5. Hallazgos detallados

### H-01 · CRÍTICA · burner / fiabilidad
**Error de transporte del RPC tratado como veredicto de negocio: marca `BURNED` inventario vivo, sin alerta ni reparación**

**Detalle.** `canSimulate` captura CUALQUIER excepción y la convierte en «no quemable» (`service.ts:342-360`, `catch` en `:357-358`); `isGoneOnChain` captura CUALQUIER excepción de `ownerOf` y la convierte en «ya no existe on-chain» (`service.ts:408-424`, `catch` en `:421-422`). Si `eth_call` falla mientras `eth_getBalance` sigue respondiendo (timeout o 429 por método/petición), `filterBurnable` manda todas las candidatas a `skipped` (`service.ts:319-340`), no se difunde ninguna transacción y la reconciliación (`service.ts:186-194`) marca `BURNED` en `nfts` cada descartado porque `ownerOf` también falla. El ciclo devuelve `COMPLETED` (`service.ts:206-212`), el aviso `BURN_EXECUTED` no se encola (solo si `confirmed.length > 0`, `:197-204`), el cerrojo diario no se libera ese día y no hay camino automático de reparación: el listener solo escribe `BURNED` a partir de eventos `Burn` que en este escenario no existen (`listener.ts:298-300`). `readBurnBatchMax` oculta además otro fallo de RPC devolviendo 20 en silencio (`:297-312`). Como `getUnsoldExpiredNFTs` filtra `status='AVAILABLE'` (`nfts.repository.ts:356-364`), la noche queda excluida **para siempre** de la quema automática: corrupción silenciosa y permanente del índice, potencialmente masiva (todo el inventario caducado del día). La prueba existente de reconciliación usa un revert real de token inexistente (`burner.test.ts:222-237`), por lo que no cubre el caso.

**Calibración entre lentes.** R3 la verificó como CRÍTICA de extremo a extremo; R6 y R7 la mantuvieron ALTA con el matiz de que una caída **total** del RPC aborta antes en `getBalance` (`service.ts:118` → `catch :213-221` → `ERROR` + alerta), de modo que el escenario exige un fallo **parcial/intermitente** de `eth_call`. Se conserva CRÍTICA porque el efecto (marcado de inventario vivo como quemado, sin alerta y sin reintento) es permanente y silencioso, y porque basta un fallo de método, no de nodo.

**Evidencia.** `packages/shared/src/burner/service.ts:342-360`, `:408-424`, `:319-340`, `:186-194`, `:206-212`, `:197-204`, `:297-312`, `:118`, `:213-221`; `packages/shared/src/db/repositories/nfts.repository.ts:356-364`; `packages/shared/src/events/listener.ts:298-300`; `packages/shared/src/burner/burner.test.ts:222-237`; contraste con el criterio correcto en `apps/web/src/components/admin/useExpiredNights.ts:75-92` y `apps/web/src/lib/onchain-ownership.ts:45-65`.

**Recomendación.** Clasificar el error antes de reconciliar: solo un revert del contrato (`ContractFunctionRevertedError` / `ERC721NonexistentToken`) puede marcar `BURNED`; ante error de transporte, **no escribir nada**, abortar el ciclo con `reason: ERROR` y encolar `DEVOPS_ALERT` (sin liberar el cerrojo como éxito). En `filterBurnable`, propagar el error de red en lugar de convertirlo en descarte. Añadir tres pruebas con `publicClient` mockeado: (a) `simulateContract` con timeout → ninguna fila cambia; (b) `ownerOf` con error de red → ninguna fila cambia; (c) revert real → `BURNED`.

**Origen (deduplicado):** R3 (CRÍTICA), R6 (ALTA), R5 (ALTA), R4 (MEDIA), R7 (MEDIA).

---

### H-02 · ALTA · operación / custodia de claves
**El firmante de la quema acumula `MINTER_ROLE + BURNER_ROLE`; `BURNER_ROLE` residual en la cuenta 0 con clave del repo**

**Detalle.** El endpoint del panel firma con `RELAYER_WALLET_PRIVATE_KEY` (`route.ts:46-58`) y la cuenta 4 de Anvil que la usa recibió `DEFAULT_ADMIN_ROLE + MINTER_ROLE + BURNER_ROLE` según el registro de despliegue (`despliegue_gcp.md:1774`, `:1780-1781`); **comprobado on-chain por el Lead el 2026-10-10 (§3.3), el estado actual es `MINTER + BURNER` (sin `DEFAULT_ADMIN`)**. Esto contradice el control documentado «cada hot-wallet tiene un solo rol» (`Manuales/04-mantenimiento/01-seguridad.md:56`) y el principio de mínimo privilegio, mientras el multisig de gobernanza sigue sin desplegar (RF-18). Además la cuenta 0 —`treasury()` y cartera operadora del panel— conserva `BURNER_ROLE` **confirmado on-chain** (`cuentas_anvil.md:130-132`, `:145`) y su clave privada es la determinista de Anvil, publicada en el repo (`.env.example:34`; `cuentas_anvil.md:193-195`); esa clave también ostenta `MINTER_ROLE` on-chain. La ruta hoy solo invoca `burnTokens` (`route.ts:104-109`), pero el riesgo es de **custodia**: un compromiso del proceso web (la superficie más expuesta, HTTP) permite quemar inventario irreversiblemente **y acuñar**. `BURNER_ROLE` queda repartido entre la wallet del worker (cuenta 2), el relayer (cuenta 4) y la cuenta 0, sin respuesta única a «¿quién es el BURNER?». El script de verificación de topología solo audita las cuentas 0-3 y trata el exceso de roles como informativo, nunca como fallo (`packages/contracts/scripts/verify-accounts.ts:15-25`, `:77-82`).

**Evidencia.** Comprobación on-chain del Lead (§3.3: `hasRole` sobre `0xc66ab83418c20a65c3f8e83b3d11c8c3a6097b6f`); `apps/web/src/app/api/admin/expired/burn/route.ts:46-58`, `:104-109`; `RepoTecnico/despliegue_gcp.md:1774`, `:1780-1782`; `RepoTecnico/Manuales/04-mantenimiento/01-seguridad.md:49`, `:56`; `RepoTecnico/BaseOperaciones/cuentas_anvil.md:130-132`, `:145`, `:149`, `:193-195`; `packages/contracts/scripts/verify-accounts.ts:15-25`, `:77-82`; `RepoTecnico/estado_proyecto.md:3168-3169`; `packages/contracts/src/HotelNights.sol:294-295`; `.env.example:34`; `RepoTecnico/requerimientos.md:52`.

**Recomendación.** Desplegar una hot-wallet dedicada con **solo** `BURNER_ROLE` para el relayer de quema y revocar de ella `DEFAULT_ADMIN` y `MINTER` (o dejar la quema exclusivamente en el worker); revocar `BURNER_ROLE` de la cuenta 0 tras verificarlo con `cast`/`hasRole`; documentar las transacciones de grant/revoke; ampliar `verify-accounts.ts` para incluir las wallets de quema/relayer y **fallar** si una acumula más de un rol sensible o `DEFAULT_ADMIN_ROLE`; y añadir una comprobación de arranque que verifique que la dirección del relayer ostenta únicamente `BURNER_ROLE`.

**Origen:** R7 (ALTA), R4 (ALTA).

---

### H-03 · ALTA · operación / configuración
**Configuración de quema no provisionada ni unificada: `RELAYER_*` fuera de plantilla, manual y script de despliegue; tres nombres de firmante**

**Detalle.** El endpoint del panel lee `process.env.RELAYER_WALLET_PRIVATE_KEY` y `RELAYER_MIN_BALANCE_NATIVE` (`route.ts:48`, `:107`): sin la primera responde `503 RELAYER_NOT_CONFIGURED` (`route.ts:96-101`). **Verificado en vivo por el Lead el 2026-10-10 (§3.3, punto 3): ni el worker desplegado tiene variables `BURNER_*` (17 variables, ninguna de quema) ni la web tiene `RELAYER_*` (28 variables, ninguna) — los dos caminos de quema están apagados hoy en producción, no solo en riesgo de apagarse.** Ninguna de las dos aparece en `.env.example` (que se autodeclara «el CONTRATO de variables», y define `BURNER_BOT_PRIVATE_KEY` en `:36` —que **ningún código lee**— y `BURNER_WALLET_PRIVATE_KEY`/`BURNER_MIN_BALANCE_NATIVE` en `:196-198`) ni en el manual de variables (`01-variables-de-entorno.md:34-43`, `:147-148`); la única mención está en un registro de despliegue concreto (`despliegue_gcp.md:1782`). El `.env` real del workspace tampoco define `RELAYER_WALLET_PRIVATE_KEY` (`.env:97`), de modo que **en este entorno el botón «Quemar» devuelve 503**. Peor: `infra/gcp/70-deploy-apps.sh:58-59` no incluye ninguna variable de quema (`BURNER_WALLET_PRIVATE_KEY`, `BURN_HOUR_LOCAL`, `BURN_TIMEZONE`, `BURNER_MIN_BALANCE_NATIVE`, `RELAYER_*`) y despliega worker y web con `--set-env-vars/--set-secrets`, que **reemplazan** el conjunto completo (`:90-100`, `:126-137`); no hay ninguna referencia a burner/relayer en todo `infra/` (grep vacío). Como ese script es la vía documentada de redespliegue, **el próximo despliegue normal apaga la quema programada y el relayer en silencio** sin clave, con el único rastro de un `logger.warn` de arranque (`main.ts:290-294`) que no llega a `/health`. El fallo ya ocurrió: «el worker desplegado no tenía ninguna variable de quema, así que el planificador diario nunca arrancaba» (`estado_proyecto.md:3167-3175`). Existen tres nombres para el firmante (`BURNER_BOT`, `BURNER_WALLET`, `RELAYER`) sin mapeo documentado de qué cuenta ostenta `BURNER_ROLE`; el manual atribuye la quema a `BURNER_BOT_PRIVATE_KEY`, «cuenta 2 de Anvil» (`01-variables-de-entorno.md:38`) y el planificador a `BURNER_WALLET_PRIVATE_KEY` (`:147`), mientras el relayer del panel es la cuenta 4.

**Evidencia.** Inspección en vivo de `gcloud run services describe` (worker `00010-jut`, web `00097-qex`) y `gcloud secrets list` el 2026-10-10 (§3.3, punto 3); `apps/web/src/app/api/admin/expired/burn/route.ts:48`, `:96-101`, `:107`; `.env.example:32-38`, `:196-198`; `.env:97`; `RepoTecnico/Manuales/02-instalacion/01-variables-de-entorno.md:34-43`, `:147-148`; `infra/gcp/70-deploy-apps.sh:58-59`, `:90-100`, `:126-137`; `apps/worker/src/main.ts:290-294`; `RepoTecnico/estado_proyecto.md:3167-3175`; `RepoTecnico/despliegue_gcp.md:517`, `:1660-1666`, `:1781-1783`.

**Recomendación.** Añadir `RELAYER_WALLET_PRIVATE_KEY` y `RELAYER_MIN_BALANCE_NATIVE` a `.env.example`, al manual de variables y **al script de despliegue** (env del worker + secreto del relayer en la web), indicando qué cuenta ostenta `BURNER_ROLE`; unificar en `BURNER_WALLET_PRIVATE_KEY` y marcar `BURNER_BOT_PRIVATE_KEY` como alias obsoleto no leído; convertir la ausencia de configuración de quema en estado degradado visible en `/health` + alerta (o *fail-fast* salvo acuse explícito `BURN_DISABLED=ack`). Verificación: `grep` en CI que exija las variables en `70-deploy-apps.sh`, y un POST real a `/api/admin/expired/burn` que devuelva 200 con `txHash`.

**Origen:** R2 (ALTA), R6 (ALTA), R4 (MEDIA), R5 (BAJA), R6 (BAJA), R7 (BAJA).

---

### H-04 · ALTA · worker / observabilidad
**El proceso no tiene señal de vida: sin resultado del ciclo en `/health`, sin alerta de ciclo ausente, sin pasada inicial ni recuperación**

**Detalle.** El planificador no persiste ni publica su resultado: `/health` agrega fallos de RPC, email, procesamiento y agregados, pero **no expone** el último ciclo de quema ni contadores de quemadas/omitidas (`apps/worker/src/health.ts:129-139`, `:141-156`; no hay ninguna mención a `burn` en `health.ts`); las rutas del worker son `/health`, `/aggregates`, `/history` (`http-server.ts:70-83`); el monitor externo solo vigila viveza de cadena, RPC y saldo de la hot-wallet, no «hoy existe un ciclo» (`apps/monitor/src/chain-monitor.ts:6-17`). El resultado del ciclo queda en `logger.info` (`burn-scheduler.ts:140-148`) y el cerrojo diario (TTL 26 h) solo se libera si el ciclo no se completó, de modo que un reinicio/crash a mitad de ciclo, un arranque después de las 12:59 o una caída que cubra la hora de quema dejan **el día entero sin quema y sin alerta**; el worker se despliega con una sola instancia (`70-deploy-apps.sh:94`). `startBurnScheduler` no hace pasada inicial, a diferencia de los demás planificadores (`retention-scheduler.ts:95`, `preventive-scheduler.ts:112`, `mint-window-scheduler.ts:194`). Si falta `BURNER_WALLET_PRIVATE_KEY`, el worker arranca, no crea el planificador y solo registra un `logger.warn` (`main.ts:291-294`), sin alerta ni estado en `/health`: una quema desactivada por mala configuración es indistinguible de «no había nada que quemar», y ya ocurrió en producción (detectado manualmente, `estado_proyecto.md:3168-3172`).

**Evidencia.** `apps/worker/src/burn-scheduler.ts:117-123`, `:140-148`, `:150-154`, `:165-170`; `apps/worker/src/health.ts:129-139`, `:141-156`; `apps/worker/src/http-server.ts:70-83`; `apps/worker/src/main.ts:283-296`; `apps/monitor/src/chain-monitor.ts:6-17`; `apps/worker/src/retention-scheduler.ts:95`; `infra/gcp/70-deploy-apps.sh:94`; `RepoTecnico/estado_proyecto.md:3168-3172`.

**Recomendación.** Persistir una fila por ciclo (`burn_runs`: día, `reason`, `burnedTokensCount`, `txHashes`, `skippedTokens`, timestamp), exponer `lastBurnRun` y `burnScheduler: enabled|disabled` en `/health`, y añadir al monitor la comprobación «a las 13:00 locales existe ciclo `COMPLETED`/`NO_TOKENS` del día» con alerta si no. Ejecutar una pasada de recuperación al arrancar y en cada tick si `hourInZone(now()) >= hourLocal` y el cerrojo del día sigue libre. Encolar `DEVOPS_ALERT` cuando el planificador no arranque por falta de clave. Verificable: arrancar el worker sin clave → `/health` lo declara y se emite la alerta; arranque con reloj a las 12:30 → `runOnce` invocado una vez.

**Origen:** R3 (ALTA), R4 (MEDIA ×2), R6 (MEDIA), R7 (MEDIA).

---

### H-05 · ALTA · burner / operación
**Un ciclo con todos los candidatos descartados se declara `COMPLETED` (0 quemadas), no alerta y retiene el cerrojo diario**

**Detalle.** Si `burnExpired` revierte para todos los candidatos (relayer sin `BURNER_ROLE`, contrato en pausa —`burnExpired` es `whenNotPaused`, `HotelNights.sol:283-288`—, desajuste de ABI, reloj de cadena desfasado), `filterBurnable` los descarta uno a uno (`service.ts:319-340`), `txHashes` y `confirmed` quedan vacíos y `executeScheduledBurn` devuelve `executed: true, reason: 'COMPLETED', burnedTokensCount: 0` (`service.ts:206-212`), sin `NO_TOKENS` ni código de fallo; la única traza es un `console.warn` por token (`:336`) y el `logger.info` del planificador. La notificación `BURN_EXECUTED` solo se encola si `confirmed.length > 0` (`:197-204`), así que **nadie se entera**; el planificador considera éxito `COMPLETED`/`NO_TOKENS` y **no libera** el cerrojo diario (`burn-scheduler.ts:151-154`), luego no hay reintento ese día. El caso simétrico también está verificado: si el índice `nfts` está vacío o atrasado, la quema programada solo ve esa fuente (`service.ts:138`; `SELECT … WHERE status='AVAILABLE' AND check_in_date < $1`, `nfts.repository.ts:356-363`) y devuelve `NO_TOKENS` sin notificación (`service.ts:140-143`), igualmente sin reintento; el despliegue admite el agujero («el inventario antiguo que solo existe on-chain no lo verá el quemador», `despliegue_gcp.md:1682-1685`). Los descartes tampoco tienen umbral de aviso: `skipped` solo deja log (`service.ts:319-340`) — deuda ya reconocida en `estado_proyecto.md:554` y `Manuales/03-operacion/03-incidentes.md:105-107`. La UI sí mira `paused()` y deshabilita el botón (`AdminExpired.tsx:48-53`, `:186`), el worker no.

**Evidencia.** `packages/shared/src/burner/service.ts:167-184`, `:197-204`, `:206-212`, `:285-287`, `:319-340`; `apps/worker/src/burn-scheduler.ts:145`, `:150-154`; `packages/contracts/src/HotelNights.sol:283-300`; `packages/shared/src/db/repositories/nfts.repository.ts:356-364`; `RepoTecnico/estado_proyecto.md:554`; `RepoTecnico/Manuales/03-operacion/03-incidentes.md:105-107`; `RepoTecnico/despliegue_gcp.md:1682-1685`, `:1793`; `apps/web/src/components/admin/AdminExpired.tsx:48-53`, `:186`.

**Recomendación.** Diferenciar «no había candidatas» de «se descartaron todas»: si `candidates.length > 0 && confirmed.length === 0`, devolver un `reason` explícito (p. ej. `SKIPPED_ALL`) con los `skippedTokens`, encolar `DEVOPS_ALERT` y decidir explícitamente si se libera el cerrojo diario para reintentar. Fijar un umbral medible de aviso («si `skippedTokens.length > 0` → alerta con la lista») y exponer un contador de descartes por motivo. En la vía programada, reconciliar el índice con eventos Mint/Sale/Burn antes de declarar `NO_TOKENS`. Añadir pruebas con `simulateContract` rechazando todos los tokens (exigiendo alerta y reintento) y con 1 descarte vs 0 descartes.

**Origen:** R2 (ALTA), R4 (MEDIA), R7 (MEDIA), R5 (MEDIA), R3 (MEDIA), R1 (BAJA).

---

### H-06 · ALTA · operación / auditoría
**Quema manual irreversible sin re-confirmación TOTP ni traza del operador que la ordenó**

**Detalle.** `POST /api/admin/expired/burn` autoriza solo con sesión + `requireRole(request, 'DEFAULT_ADMIN_ROLE')` (`route.ts:69-71`), descarta `auth.session` (el `username` disponible en `guard.ts:158-160` nunca se usa ni se registra) y **no lee** `confirmTotpCode` ni `x-mfa-token` en toda la ruta (`:73-109`); `requireRole` no incorpora MFA (`guard.ts:1-40`). En el mismo back-office, acciones menos destructivas sí exigen TOTP: minteo (`api/admin/mint/route.ts:70-98`) y publicar habitación/lote (`rooms/[id]/publish/route.ts:104-122`, `rooms/bulk/publish/route.ts:100-115`); RF-14 «re-confirmación de doble factor en operaciones de alto impacto» está declarado OK tomando el minteo como referencia. Con el relayer, el operador ya no firma: firma la hot-wallet del servidor, así que el remitente on-chain es siempre la misma cuenta y el evento `Burn(uint256 indexed tokenId)` no identifica a nadie (`IHotelNights.sol:38`). No existe tabla de auditoría de quemas en el esquema (`migrator.ts:10-19` y ss.; solo `burned_at` en `schema.sql:20`), y el aviso `BURN_EXECUTED` de la vía programada va solo a `DEVOPS_ALERT_EMAIL`, sin copia a administración/hotel (`service.ts:197-204`). Resultado: ante «¿quién responde si se quema una noche?» no hay artefacto on-chain ni off-chain que señale a una persona. **Calibración:** R4 lo calificó ALTA; R3 y R7 lo bajaron a MEDIA porque exigir `DEFAULT_ADMIN_ROLE` es el rol de aplicación más estricto (sin elevación de privilegios); el defecto nuclear es la falta de auditoría y de segundo factor, que se conserva ALTA.

**Evidencia.** `apps/web/src/app/api/admin/expired/burn/route.ts:69-71`, `:73-109`; `apps/web/src/lib/guard.ts:1-40`, `:158-160`; `apps/web/src/app/api/admin/mint/route.ts:70-98`; `apps/web/src/app/api/admin/rooms/[id]/publish/route.ts:104-122`; `apps/web/src/app/api/admin/rooms/bulk/publish/route.ts:100-115`; `packages/contracts/src/IHotelNights.sol:38`; `packages/shared/src/db/migrator.ts:10-19`; `packages/shared/src/db/schema.sql:20`; `packages/shared/src/burner/service.ts:197-204`; `packages/shared/src/domain/roles.ts:53-58`.

**Recomendación.** Exigir `confirmTotpCode`/`x-mfa-token` en la ruta de quema con el mismo helper que `/api/admin/mint` (403 `MFA_REQUIRED` sin código) y persistir una fila de auditoría por operación (`{actor: session.username, tokenIds, txHashes, burnedTokensCount, skippedTokens, origen: 'panel'|'scheduler', timestamp}`) en una tabla `burn_events` de solo lectura para auditoría; enviar copia de `BURN_EXECUTED` a `ADMIN_EMAIL`. Verificable: POST con sesión `RECEPTION_ROLE` → 403; POST sin TOTP → 403 `MFA_REQUIRED`; una fila de auditoría por quema manual y programada.

**Origen:** R4 (ALTA), R5 (MEDIA), R3 (MEDIA), R7 (MEDIA).

---

### H-07 · ALTA · docs / trazabilidad
**CU-13 se traza a RF-17 (registro de viajeros) cuando el requisito de la quema es RF-11**

**Detalle.** El catálogo canónico define **RF-11 = «Quema automática de las noches no vendidas»** (`RepoTecnico/requerimientos.md:45`, estado OK) y **RF-17 = «Registro de viajeros conforme al RD 933/2021»** (`:51`, EXT fuera de la plataforma); `docs/SRS.md:361` y `:401` mapean CU-13→RF-11 y `docs/PRD.md:104`, `:177` repiten el mapeo. Pero la cadena entregable cita RF-17: `Manuales/05-casos-de-uso/06-operacion-y-ciclo-de-vida/CU-13-caducadas.md:3` («Requisitos: RF-17») y `:13` («Trazabilidad. RF-17»), `docs/CASOS-DE-USO.md:127`, `:704`, `:1019`, `docs/MATRIZ-TRAZABILIDAD.md:59` y `docs/PLAN-DE-PRUEBAS.md:180`. El origen es la numeración antigua de `docs/REQUISITOS.md:92` (donde RF-17 sí era «Noches caducadas»; `:104` usa RF-11 para WalletConnect), de modo que el proceso tiene **tres numeraciones incompatibles** y quien sigue la documentación entregable aterriza en un requisito ajeno. R5 mantuvo ALTA por ser el objeto central de su lente de trazabilidad; R2 y R4 lo calificaron MEDIA y R1/R6/R7 BAJA (sin efecto en runtime). Se conserva ALTA por tratarse del enlace CU↔RF del entregable operativo, con el matiz de que no hay impacto en ejecución.

**Evidencia.** `RepoTecnico/requerimientos.md:45`, `:51`; `docs/SRS.md:361`, `:401`; `docs/PRD.md:104`, `:110`, `:177`; `RepoTecnico/Manuales/05-casos-de-uso/06-operacion-y-ciclo-de-vida/CU-13-caducadas.md:3`, `:13`; `docs/CASOS-DE-USO.md:127`, `:704`, `:1019`; `docs/REQUISITOS.md:92`, `:104`; `docs/MATRIZ-TRAZABILIDAD.md:59`; `docs/PLAN-DE-PRUEBAS.md:180`.

**Recomendación.** Unificar toda la documentación del CU-13 a **RF-11** (SRS/PRD/requerimientos) y reservar RF-17 en exclusiva al registro de viajeros; corregir `CU-13-caducadas.md:3,13`, `CASOS-DE-USO.md:127,704,1019`, `MATRIZ-TRAZABILIDAD.md:59` y `PLAN-DE-PRUEBAS.md:180`. Añadir al guardián de documentación un chequeo que falle si un CU cita un RF distinto del declarado en la tabla de trazabilidad del SRS y si la documentación nombra una variable que ningún código lee.

**Origen:** R5 (ALTA), R2 (MEDIA), R4 (MEDIA), R1 (BAJA), R6 (BAJA).

---

### H-08 · MEDIA · docs
**CU-13 y `cuentas_anvil.md` describen el flujo de firma ya sustituido (wagmi/navegador), niegan el endpoint del relayer y citan referencias desplazadas**

**Detalle.** El manual de referencia afirma que al confirmar se envía `send("burnExpired", [ids])` por `useAdminWrite` (`CU-13-caducadas.md:50-52`) y que «No existe endpoint HTTP propio de este CU: la escritura se firma desde el navegador con wagmi» (`:106`). El código real usa `useRelayerBurn` (`AdminExpired.tsx:11`, `:58`, `:105`) → `POST /api/admin/expired/burn` con firma en servidor y `requireRole(request, 'DEFAULT_ADMIN_ROLE')` (`route.ts:13`, `:69-110`), flujo descrito en el propio despliegue (`despliegue_gcp.md:1775-1782`). `RepoTecnico/BaseOperaciones/cuentas_anvil.md:149` asigna «ninguno» a las cuentas 4-9 y `:162-164` sostiene que «no hay relayer en la web» y que el panel firmaba con la cartera conectada. Además hay referencias `ruta:línea` desplazadas ya verificadas: `service.ts:250`/`:298` (reales `:319-340` `filterBurnable` y `:367-405` `burnAndConfirm`), `service.ts:369`/`:180` para el cálculo del día y el marcado, `useExpiredNights.ts:91/113` (reales `:98` `SCAN_CONFIG_INVALID` y `:125` `partial`), `AdminExpired.tsx:94/95/130/147/173` (reales `:97-98`, `:135-139`, `:152-156`, `:186`). El manual literal además afirma que una noche vendida en el lote «cancela todo el lote» (`docs/Manuales/…/CU-13-caducadas.md:35`, `:63`), cuando con el relayer la simulación reintenta token a token y **omite** las no quemables sin tumbar el resto (`service.ts:319-340`; comentario en `route.ts:25-26`), devolviendo `COMPLETED` con `burnedTokensCount=N-1` y `skippedTokens=[vendida]`.

**Evidencia.** `RepoTecnico/Manuales/05-casos-de-uso/06-operacion-y-ciclo-de-vida/CU-13-caducadas.md:3`, `:13`, `:50-52`, `:64-66`, `:79-81`, `:99-106`, `:120`, `:137-138`, `:161-162`; `docs/Manuales/05-casos-de-uso/06-operacion-y-ciclo-de-vida/CU-13-caducadas.md:35`, `:46`, `:55`, `:63`; `RepoTecnico/BaseOperaciones/cuentas_anvil.md:149`, `:162-164`; `apps/web/src/components/admin/AdminExpired.tsx:11`, `:42`, `:58`, `:105`; `apps/web/src/components/admin/useRelayerBurn.ts:5-16`, `:48-74`; `apps/web/src/app/api/admin/expired/burn/route.ts:13`, `:25-26`, `:69-110`; `packages/shared/src/burner/service.ts:180`, `:319-340`, `:367-405`, `:436-443`; `apps/web/src/components/admin/useExpiredNights.ts:35`, `:38`, `:54`, `:75`, `:111`, `:125`; `RepoTecnico/despliegue_gcp.md:1775-1782`.

**Recomendación.** Reescribir CU-13 (§2.1 pasos 7-8, §4.1, §6) y el apartado «¿Quién firma de verdad?» de `cuentas_anvil.md` con el flujo real (relayer, endpoint, cuerpo `{tokenIds}`, rol exigido, `RELAYER_WALLET_PRIVATE_KEY`, error 503 `RELAYER_NOT_CONFIGURED`); actualizar la tabla de roles de `cuentas_anvil.md` con los grants del relayer (bloques 492-494); corregir la afirmación del lote («las no quemables se omiten y se reportan en `skippedTokens`»); recalcular todas las referencias `ruta:línea` y añadir un chequeo automático que valide que la línea citada contiene el símbolo esperado.

**Origen:** R2 (MEDIA), R4 (MEDIA), R5 (MEDIA ×3), R1 (BAJA), R6 (BAJA), R7 (BAJA).

---

### H-09 · MEDIA · burner / índice off-chain
**La quema manual (`burnTokens`) no actualiza el índice off-chain ni encola aviso: depende del listener del worker**

**Detalle.** `executeScheduledBurn` marca `BURNED` por lote confirmado (`service.ts:179-181`), reconcilia descartes (`:186-194`) y encola `BURN_EXECUTED` (`:197-204`); `burnTokens` —la vía del panel/relayer— no llama nunca a `nftsRepo.updateNFTStatus` ni a la cola de notificaciones (`service.ts:238-295`). Tras una quema manual la fila permanece `AVAILABLE` con `burned_at` NULL (`nfts.repository.ts:367-385`) hasta que el listener del worker procesa `NFTBurned` (`listener.ts:298-300`, sujeto a `REORG_CONFIRMATIONS`), o hasta la reconciliación del siguiente ciclo diario (~24 h). Si el worker está caído o retrasado, el panel dice «quemado» mientras el índice no lo refleja y nadie recibe aviso; las vistas que cuentan `nfts` por estado (ventana de acuñación/mint-window-watch `:434-441`; stock/overview administrativos) siguen viendo la noche como disponible. El propio comentario de `burnTokens` reconoce que puede quemar noches ausentes del índice sin cerrar el ciclo hacia la BD (`service.ts:229-237`). El manual atribuye el marcado a `service.ts:180`, cierto **solo** para la vía programada.

**Evidencia.** `packages/shared/src/burner/service.ts:179-181`, `:186-194`, `:197-204`, `:229-237`, `:238-295`; `packages/shared/src/events/listener.ts:298-300`; `packages/shared/src/db/repositories/nfts.repository.ts:357-361`, `:367-385`, `:434-441`; `apps/web/src/app/api/admin/expired/burn/route.ts:104-110`; `RepoTecnico/Manuales/05-casos-de-uso/06-operacion-y-ciclo-de-vida/CU-13-caducadas.md:19-20`, `:87-89`.

**Recomendación.** Extraer el bloque persistencia+aviso de `executeScheduledBurn` y aplicarlo en `burnTokens` para los tokens confirmados por recibo (marcado idempotente + `BURN_EXECUTED` con operador y hashes); reconciliar también sus descartes. Si se decide depender del listener, documentarlo y añadir una comprobación de salud de que el listener consume eventos. Prueba: `burnTokens` → `updateNFTStatus(…,'BURNED')` y `enqueueNotification('BURN_EXECUTED')` invocados.

**Origen:** R2 (MEDIA), R4 (MEDIA), R5 (BAJA), R7 (BAJA).

---

### H-10 · MEDIA · burner / concurrencia
**Dos quemas concurrentes comparten la hot-wallet sin serialización de nonce, pese al comentario que afirma lo contrario**

**Detalle.** El comentario de la ruta justifica el singleton por proceso diciendo que «el servicio serializa los envíos de la misma hot-wallet para que dos quemas simultáneas no colisionen en el `nonce`» (`route.ts:39-44`). Es falso: `BurnerService.burnTokens` llama directamente a `walletClient.writeContract` sin cola, mutex ni `nonceManager` (`service.ts:238-295`, `:276-283`) y no toma ningún cerrojo (por diseño, `:235-237`); el cerrojo diario del planificador no aplica a esta vía. Recepción sí implementa la serialización con cola encadenada (`reception/service.ts:197-205`, `:597-607`, control documentado en `Manuales/04-mantenimiento/01-seguridad.md:60`), lo que demuestra que el patrón existe y aquí se omitió. Con la web en `--max-instances=3` (`70-deploy-apps.sh:131`), dos POST simultáneos (dos operadores, doble envío o reintento del navegador) pueden resolver el mismo nonce «pending»: una transacción se pierde/reemplaza, no queda registrada y el operador recibe 502. Impacto acotado a operación (el contrato revierte lo no quemable y `_soldOnce` impide quemar vendidas), por lo que se mantiene MEDIA.

**Evidencia.** `apps/web/src/app/api/admin/expired/burn/route.ts:39-44`, `:56`; `packages/shared/src/burner/service.ts:235-237`, `:238-295`; `packages/shared/src/reception/service.ts:197-205`, `:597-607`; `infra/gcp/70-deploy-apps.sh:131`; `RepoTecnico/Manuales/04-mantenimiento/01-seguridad.md:60`; `packages/shared/src/burner/burner.test.ts` (0 apariciones de `burnTokens`).

**Recomendación.** Encadenar las escrituras de `BurnerService` en una cola interna (mismo patrón `serializeAnchor` de recepción) o tomar un cerrojo compartido (`hotel:burn:manual`) dentro de `burnTokens`, y corregir el comentario de la ruta. Prueba: dos `burnTokens` concurrentes sobre un `walletClient` falso → nonces secuenciales sin solaparse y ambas quemas confirmadas (o rechazo controlado de la segunda sin perder la primera).

**Origen:** R3 (MEDIA), R4 (MEDIA), R6 (MEDIA), R7 (MEDIA).

---

### H-11 · MEDIA · web / UX operativa
**El panel presenta «confirmada on-chain» con 0 noches quemadas, no muestra `burnedCount`/`skipped` y pierde los `txHashes` ya confirmados si un lote posterior falla**

**Detalle.** La API devuelve 200 tanto para `COMPLETED` como para `NO_TOKENS` (`route.ts:60-67`, `:110`), y `burnTokens` devuelve `NO_TOKENS` con `skippedTokens` cuando nada fue quemable (`service.ts:285-287`). El hook fija `status='confirmed'` ante cualquier `response.ok` sin mirar `burnedTokensCount` ni `skippedTokens` (`useRelayerBurn.ts:65-74`), aunque **sí los expone** (`:27-30`, `:72-73`, `:81`); `AdminExpired` solo desestructura `send/reset/status/hash/error` (`AdminExpired.tsx:58`) y nunca los pinta, de modo que el `TxModal` muestra «Operación completada» / «La operación se ha confirmado on-chain» (`es.json:645-646` vía `adminTxCopy.ts:19-21`) sin transacción cuando `txHashes` está vacío. Caso real documentado: token no caducado → 200 `NO_TOKENS` con `skippedTokens` (`despliegue_gcp.md:1793`). En sentido inverso, `burnTokens` no envuelve cada lote en `try/catch`: si un lote posterior falla, `burnAndConfirm` lanza (`service.ts:276-294`, `:367-405`), el `catch` de la ruta responde 502 genérico (`route.ts:111-120`) y se **pierden los `txHashes` de los lotes ya confirmados on-chain**, así que el operador ve «no se completó» aunque sí se destruyeron noches. No hay test del hook ni de componente. (Corrección verificada: el ciclo programado tampoco avisa en el caso de 0 quemadas, `service.ts:197`.)

**Evidencia.** `apps/web/src/app/api/admin/expired/burn/route.ts:60-67`, `:110`, `:111-120`; `apps/web/src/components/admin/useRelayerBurn.ts:27-30`, `:59-74`, `:81`; `apps/web/src/components/admin/AdminExpired.tsx:58`, `:229-244`; `apps/web/src/components/admin/adminTxCopy.ts:19-21`; `apps/web/messages/es.json:645-646`; `packages/shared/src/burner/service.ts:276-294`, `:285-287`, `:367-405`; `RepoTecnico/despliegue_gcp.md:1793`.

**Recomendación.** Mostrar en el panel/modal `burnedCount`, los `txHash` y la lista `skipped` con motivo, y presentar «0 quemadas con descartes» como advertencia (no como éxito): «Se quemaron N noches; M omitidas» / «No había noches quemables». Acumular y propagar los `txHashes` ya confirmados cuando un lote posterior falle (resultado parcial + `try/catch` por lote). Pruebas: hook con `fetch` mockeado para 200 con 0 y con N noches y para 502; componente con `{burnedTokensCount:0, skippedTokens:['10120260101']}`.

**Origen:** R1 (MEDIA), R2 (MEDIA), R3 (MEDIA), R5 (MEDIA), R7 (MEDIA).

---

### H-12 · MEDIA · contrato / docs
**«Caducada» con dos bases horarias: EARS y REQUISITOS en `Europe/Madrid` frente al umbral UTC del contrato, sin tolerancia ni test de frontera**

**Detalle.** El contrato decide la caducidad con el día civil **UTC** (`_isExpired = fecha < todayYYYYMMDD(block.timestamp)`: `HotelNights.sol:501-503`; `DateLib.sol:8-10`, `:31-33`) y ADR-08 (vigente) fija que la validez la decide UTC, siendo `Europe/Madrid` solo off-chain, con «margen documentado de hasta 2 h» (`docs/adr/ADR-08-fechas-utc-y-calendario.md:16-25`). El servicio alinea con el contrato (`todayYYYYMMDD` en UTC: `service.ts:436-443`; consulta `check_in_date < $1`: `nfts.repository.ts:356-362`), así que **la supuesta discrepancia de tres capas no existe tal cual**. Lo verificado es que la EARS sigue definiendo EXPIRADA y el rechazo por «fecha anterior a hoy en TZ_REF» (`docs/CASOS-DE-USO.md:34`, `:709`, `:748`; `docs/REQUISITOS.md:92`) mientras el contrato y la UI usan la señal on-chain (`night-state.ts:25-28`): en verano, entre las 00:00 y 02:00 de Madrid el día UTC sigue siendo el anterior y una noche declarada EXPIRADA por la norma todavía es comprable (`buy` no revierte `NightExpired`, `HotelNights.sol:164`). La desviación se reconoce en CU-13 §7 (`CU-13-caducadas.md:157-163`) pero no se alinearon los documentos normativos ni existe test de frontera: las suites usan un reloj fijo a media mañana (`burner.test.ts:49`) y solo prueban funciones puras de zona (`burn-scheduler.test.ts:118-130`). R1 la bajó de ALTA a MEDIA porque ADR-08 resuelve la autoridad y el código es coherente; el defecto real es un criterio normativo obsoleto y no verificable.

**Evidencia.** `packages/contracts/src/HotelNights.sol:164`, `:497-503`; `packages/contracts/src/libraries/DateLib.sol:8-10`, `:31-33`; `docs/adr/ADR-08-fechas-utc-y-calendario.md:16-25`; `docs/CASOS-DE-USO.md:34`, `:709`, `:748`; `docs/REQUISITOS.md:92`; `packages/shared/src/burner/service.ts:436-443`; `packages/shared/src/db/repositories/nfts.repository.ts:356-362`; `packages/shared/src/domain/night-state.ts:25-28`; `packages/shared/src/burner/burner.test.ts:49`; `apps/worker/src/burn-scheduler.test.ts:118-130`; `RepoTecnico/Manuales/05-casos-de-uso/06-operacion-y-ciclo-de-vida/CU-13-caducadas.md:157-163`.

**Recomendación.** Alinear la redacción de `docs/CASOS-DE-USO.md:748`, CU-13 y `docs/REQUISITOS.md:92` con ADR-08 y fijar por escrito la regla medible «caducada = fecha < día civil UTC del `block.timestamp`» (o cambiar el contrato si se quiere Madrid); añadir pruebas de frontera con reloj a `2026-01-15T23:30:00Z` y `2026-07-15T22:30:00Z` que afirmen el día consultado (`getUnsoldExpiredNFTs`) y el resultado esperado de `buy`/`list`.

**Origen:** R1 (MEDIA), R2 (MEDIA).

---

### H-13 · MEDIA · worker
**«12:00» sin precisión: el ciclo dispara en cualquier minuto de 12:00–12:59 y el gating horario no está probado**

**Detalle.** El tick compara solo la hora entera: `hourInZone(now(), timeZone) !== hourLocal` dentro de un `setInterval` de 5 minutos (`burn-scheduler.ts:103`, `:165-170`), de modo que la quema ocurre en el **primer** tick que caiga en 12:00–12:59 (desviación de hasta 59 min respecto a la promesa «a las 12:00»), hecha idempotente por el cerrojo del día natural (`:117-123`). La zona está resuelta y documentada (`BURN_TIMEZONE`/`BURN_HOUR_LOCAL`, `config.ts:50-56`; `estado_proyecto.md:503`), la precisión no: no existe ningún test que ejerza el gating del intervalo — `burn-scheduler.test.ts:118-130` solo comprueba valores de `hourInZone`/`dayKeyInZone`, sin caso «tick a las 13:00 no dispara». Se descarta (verificado) la afirmación de doble disparo por el cambio horario de octubre: el cambio es a las 03:00 local y el cerrojo diario impide dos ejecuciones el mismo día natural.

**Evidencia.** `apps/worker/src/burn-scheduler.ts:103`, `:117-123`, `:165-170`; `apps/worker/src/burn-scheduler.test.ts:118-130`; `apps/worker/src/config.ts:50-56`; `RepoTecnico/estado_proyecto.md:503`; `RepoTecnico/requerimientos.md:45`.

**Recomendación.** Enunciar la regla medible («una ejecución por día natural de la zona configurada, en el primer tick con hora == `BURN_HOUR_LOCAL`») y contrastarla con la promesa «a las 12:00»; añadir pruebas con *fake timers*: (a) tick a las 12:59 dispara una vez, (b) tick a las 13:00 no dispara, (c) el día del cambio horario se ejecuta una sola vez. Si se quiere precisión horaria, comparar también los minutos.

**Origen:** R1 (MEDIA).

---

### H-14 · MEDIA · burner
**`dryRun` documentado como «no difunde nada» pero `burnTokens` lo ignora y difunde**

**Detalle.** La opción se documenta como «No difunde nada: solo calcula y registra lo que quemaría» (`service.ts:15-16`) y `executeScheduledBurn` la respeta con retorno temprano sin firmar (`:153-161`, probado en `burner.test.ts:294-302`). Sin embargo `burnTokens` **no lee** `options.dryRun` en ningún punto (`:238-295`): simula y llama a `writeContract` a través de `burnAndConfirm` (`:280`, `:367-405`). Ningún llamador actual pasa `dryRun` a esa ruta (la API construye las opciones sin él: `route.ts:104-109`) y no hay test que fije el comportamiento, por lo que el defecto es latente pero real: el contrato de la opción depende de qué método se invoque, con riesgo de difusión accidental si alguien la usa desde un script o una ruta futura.

**Evidencia.** `packages/shared/src/burner/service.ts:15-16`, `:153-161`, `:238-295`, `:280`, `:367-405`; `packages/shared/src/burner/burner.test.ts:294-302`; `apps/web/src/app/api/admin/expired/burn/route.ts:104-109`.

**Recomendación.** O acotar el JSDoc a «solo `executeScheduledBurn`», o aplicar `dryRun` también en `burnTokens` (devolver sin difundir, con `skippedTokens`). Añadir en `burner.test.ts` un caso «`burnTokens` con `dryRun` no llama a `writeContract`».

**Origen:** R1 (MEDIA).

---

### H-15 · MEDIA · burner / web / mantenibilidad
**El camino operativo (`burnTokens`, su ruta HTTP, el panel y su verificación de caducidad) no tiene ninguna prueba**

**Detalle.** Las 26 pruebas verdes cubren `executeScheduledBurn` (13), el planificador (8) y `selectBurnCandidates` (5); `burnTokens` —troceo por `burnBatchMax`, descartes, saldo insuficiente, wallet nula, confirmación por recibo— tiene **cero apariciones** en los ficheros de prueba (grep: 0), el directorio `apps/web/src/app/api/admin/expired/burn/` contiene solo `route.ts` (sin `*.test.ts`) y no hay test de `useRelayerBurn`, `AdminExpired` ni `useExpiredNights`. En el panel, la única pieza probada es `selectBurnCandidates` (`burn-candidates.test.ts:14-43`), que por contrato **no comprueba caducidad** (`burn-candidates.ts:26-37`): la decisión real vive en `checkExpired` (`useExpiredNights.ts:75-92`: revert esperado → no candidata; error de red → `partial`) y en el escaneo conjunto Mint−Sale−Burn (`:94-132`), cuya exclusión conjunta de una noche vendida **y** quemada no se prueba; tampoco el parseo manual de `tokenIds` (`AdminExpired.tsx:26-27`). El propio manual reconoce «No cubierto» (`CU-13-caducadas.md:150`). Impacto: un falso «0 caducadas», candidatas que el contrato revierte o una quema manual defectuosa serían invisibles; el camino sin cobertura es justo el que usa el operador.

**Evidencia.** `packages/shared/src/burner/burner.test.ts` (13 `it(`, 0 apariciones de «burnTokens»); `apps/worker/src/burn-scheduler.test.ts` (8); `apps/web/src/lib/burn-candidates.test.ts` (5), `:14-43`; `apps/web/src/lib/burn-candidates.ts:26-37`; `apps/web/src/app/api/admin/expired/burn/` (solo `route.ts`); `apps/web/src/components/admin/useExpiredNights.ts:75-92`, `:94-132`; `apps/web/src/components/admin/AdminExpired.tsx:26-27`; `RepoTecnico/Manuales/05-casos-de-uso/06-operacion-y-ciclo-de-vida/CU-13-caducadas.md:150-151`.

**Recomendación.** Añadir: (a) suite de `burnTokens` (troceo con `burnBatchMax`, lote con inválidos, saldo insuficiente, wallet nula, marcado solo por recibo); (b) suite de la ruta (401 sin sesión, 403 sin rol, 400 sin ids válidos, 200 `COMPLETED`/`NO_TOKENS`, 503 sin relayer); (c) unitaria de `checkExpired` con `readContract` mockeado (true/false/revert/error de red); (d) `scanExpired` con `getLogs` mockeados verificando la exclusión conjunta vendida+quemada y el orden por fecha; (e) `parseTokenIds` (duplicados, no numéricos, vacío) y límite de lote. Publicar la cobertura del alcance `packages/shared/src/burner` + `apps/worker/src/burn-scheduler.ts` + ruta/panel (objetivo, p. ej. ≥90 % de líneas).

**Origen:** R3 (MEDIA), R1 (BAJA), R2 (soporte).

---

### H-16 · MEDIA · web / control de acceso
**El gating `BURNER_ROLE` del panel es inalcanzable y la API exige `DEFAULT_ADMIN_ROLE`, contra CU-13 y el manual de seguridad**

**Detalle.** `page.tsx` declara `requiredRole="BURNER_ROLE"` (`apps/web/src/app/admin/caducadas/page.tsx:7`, `:11`) y `AdminPanel` lo evalúa con `hasRole` (`AdminPanel.tsx:26-28`), que es `roleSatisfies(roles, role)` (`useAdminSession.ts:259`). Pero los roles de sesión proceden de `/api/auth/session`, que devuelve `roles: [auth.session.role]` (`session/route.ts:44`), tipados como `BackOfficeRoleName = {DEFAULT_ADMIN_ROLE, RECEPTION_ROLE, HOUSEKEEPING, MAINTENANCE}` (`auth/service.ts:22`; `users.repository.ts:12`; `domain/roles.ts:53-58`): `BURNER_ROLE` nunca puede estar en una sesión y solo se «satisface» porque `DEFAULT_ADMIN_ROLE` implica todos (`admin-roles.ts:16-22`, cuya razón documentada —«al firmar, el contrato comprueba hasRole»— ya no aplica al flujo del relayer). El endpoint exige `DEFAULT_ADMIN_ROLE` (`route.ts:70`) y el guard solo reconoce los cuatro roles de back-office, rechazando con 403 cualquier `BURNER_ROLE` en BD (`guard.ts:38`, `:128-134`, `:162-164`); el SRS llama a los actores «Sistema, Propietario» (`docs/SRS.md:361`). La política efectiva es *owner-only* (más restrictiva: no hay elevación ni acceso indebido), pero la UI anuncia un requisito imposible y CU-13 (`:3`, `:10`, `:36-38`) y el manual de seguridad (`01-seguridad.md:49`) sitúan `BURNER_ROLE` en la hot-wallet de quema. R2 lo calificó MEDIA; R3 y R7 lo bajaron a BAJA al no haber elevación de privilegios.

**Evidencia.** `apps/web/src/app/admin/caducadas/page.tsx:7`, `:11`; `apps/web/src/components/admin/AdminPanel.tsx:26-28`; `apps/web/src/components/admin/useAdminSession.ts:259`; `apps/web/src/app/api/auth/session/route.ts:44`; `apps/web/src/lib/admin-roles.ts:11-22`; `apps/web/src/lib/guard.ts:38`, `:128-134`, `:162-164`; `packages/shared/src/domain/roles.ts:53-58`; `docs/SRS.md:361`; `RepoTecnico/Manuales/05-casos-de-uso/06-operacion-y-ciclo-de-vida/CU-13-caducadas.md:3`, `:10`, `:36-38`; `RepoTecnico/Manuales/04-mantenimiento/01-seguridad.md:49`.

**Recomendación.** Elegir una política y hacerla coincidir en UI, guard, endpoint y documentos: si la quema desde el panel es *owner-only*, usar `requiredRole="DEFAULT_ADMIN_ROLE"` y declararlo en CU-13; si debe existir un operador `BURNER` de back-office, añadirlo a `BACK_OFFICE_ROLE_NAMES`, `adminRoleName` y al guard. Prueba de guard que fije el 403 para una sesión `RECEPTION_ROLE` en `/api/admin/expired/burn`.

**Origen:** R2 (MEDIA), R7 (BAJA), R3 (parcial).

---

### H-17 · MEDIA · burner / rendimiento
**Volumen: `SELECT *` sin límite, una `UPDATE` por fila y lotes secuenciales; el escaneo del panel lanza los `getLogs` en paralelo sin límite de concurrencia**

**Detalle.** En el ciclo programado, `getUnsoldExpiredNFTs` hace `SELECT *` sin `LIMIT` ni paginación (todo el conjunto en memoria) y el ciclo marca cada token con una `UPDATE` independiente (N+1) además de mantener el bucket de lote (`nfts.repository.ts:356-364`, `:366-394`); el bucle de lotes es estrictamente secuencial, con simulación y espera de recibo por lote (`service.ts:167-184`, `:367-405`), de modo que con N noches son ~N/50 transacciones en serie que pueden tardar horas y saturar el RPC. En el panel, cada pulsación de «Escanear caducadas» pagina el histórico completo y lanza `getLogs` de Mint+Sale+Burn con `Promise.all` sobre **todos** los rangos a la vez, y después un `isExpired` por candidata también en paralelo, sin pool de concurrencia, sin caché incremental y sin paginación en servidor (`useExpiredNights.ts:48-65`, `:94-104`, `:121-125`, `:135-140`); el flag `partial` solo avisa de que el recuento puede estar incompleto y no impide quemar el lote parcial, y como el panel limita a 50 por lote hay que repetir el escaneo completo en cada pasada. **Calibración:** la concurrencia del escaneo fue **descartada por tres verificadores** (R5, R6, R7) por impacto dudoso/fuera de alcance canónico: el código solo soporta Anvil/Besu (`chain.ts:66-68`), ADR-01 excluye Polygon del alcance entregado y con `deploymentBlock` 1/314 y `GETLOGS_MAX_RANGE=5000` (`constants.ts:33`) hoy se genera un único rango. Se conserva el núcleo (volumen del ciclo: R3 MEDIA) y se mantiene la concurrencia del escaneo como **endurecimiento preventivo** para el escenario de miles de noches, no como defecto demostrado hoy.

**Evidencia.** `packages/shared/src/db/repositories/nfts.repository.ts:356-364`, `:366-394`; `packages/shared/src/burner/service.ts:167-184`, `:367-405`; `apps/web/src/components/admin/useExpiredNights.ts:48-65`, `:94-104`, `:121-125`, `:135-140`; `apps/web/src/components/admin/AdminExpired.tsx:22`, `:73-77`; `apps/web/src/config/chain.ts:40-44`, `:66-68`; `packages/shared/src/constants.ts:33`; `docs/adr/ADR-01-red-y-contrato-canonicos.md`; `RepoTecnico/Manuales/05-casos-de-uso/06-operacion-y-ciclo-de-vida/CU-13-caducadas.md:150-151`.

**Recomendación.** Paginar con `LIMIT`/cursor y agrupar el marcado en una sola sentencia (`UPDATE nfts SET status='BURNED', burned_at=NOW() WHERE token_id = ANY($1)`); dimensionar/renovar el TTL del cerrojo con *heartbeat* si el ciclo puede superar 120 s; introducir un pool de concurrencia acotado (4-8) y/o un cursor incremental persistido en el panel, o calcular las candidatas en el worker/BD. Verificable: prueba de carga con ≥1.000 noches caducadas que compruebe que el ciclo termina, que las `UPDATE` por lote son O(1) y el máximo de llamadas RPC simultáneas del escaneo.

**Origen:** R3 (MEDIA ×2), con descartes de R5/R6/R7 sobre la parte de concurrencia.

---

### H-18 · BAJA · burner
**El tamaño máximo de lote tiene cuatro valores (50 contrato / 200 API / 20 respaldo / constante compartida muerta) sin respaldos documentados ni prueba**

**Detalle.** El contrato fija `BURN_BATCH_MAX = 50` y expone `burnBatchMax()` sobre esa constante (`HotelNights.sol:63`, `:290`, `:444-446`). Off-chain conviven: `packages/shared/src/constants.ts:45` exporta `BURN_BATCH_MAX = 50` que **ningún fichero de apps/packages importa** (solo aparece en `constants.ts`, el ABI y `dist/`); la API acepta hasta 200 `tokenIds` como «tope defensivo» (`route.ts:31`, `:85`) confiando en el troceo del servicio; la UI usa un respaldo local 50 si la lectura on-chain falla, sin señalar que es un supuesto (`AdminExpired.tsx:22`, `:42-47`); y el servicio, si falla la lectura de `burnBatchMax`, trocea en 20 sin documentarlo ni probarlo (`service.ts:297-312`, valor en `:310`). Si la lectura del getter falla, el worker trocea a 20 mientras la UI permite 50 (seguro pero divergente) y un cambio del límite on-chain no se propaga a un único sitio. La regla efectiva (trocear por `burnBatchMax` y registrarlo, `service.ts:150`) sí está implementada correctamente. R1 la bajó de MEDIA a BAJA: cada cifra cumple un papel distinto y el máximo autoritativo on-chain es único; el residuo son respaldos implícitos no verificables.

**Evidencia.** `packages/contracts/src/HotelNights.sol:63`, `:290`, `:444-446`; `packages/shared/src/constants.ts:45`; `packages/shared/src/burner/service.ts:150`, `:297-312`; `apps/web/src/app/api/admin/expired/burn/route.ts:31`, `:85`; `apps/web/src/components/admin/AdminExpired.tsx:22`, `:42-47`; `packages/shared/src/burner/burner.test.ts:161`; `docs/CASOS-DE-USO.md:32`, `:750`.

**Recomendación.** Usar el getter on-chain como única fuente en runtime, eliminar o consumir explícitamente la constante compartida y unificar el respaldo (o fallar visiblemente en vez de adivinar), documentando una sola regla («tamaño efectivo = `burnBatchMax()` on-chain; si no se puede leer, lotes de 20 registrándolo; la UI no inventa 50»). Pruebas: lectura de `burnBatchMax` que falla → lotes de 20; API con más de `max` ids → troceo por `burnBatchMax`, nunca un lote mayor.

**Origen:** R1 (BAJA), R2 (BAJA).

---

### H-19 · BAJA · worker
**`readChainClock` degrada al reloj de la máquina sin registrar el aviso que su propio docstring documenta**

**Detalle.** `readChainClock` calcula el reloj con el timestamp del último bloque y, si la lectura falla, degrada al reloj de la máquina (`burn-scheduler.ts:82-93`); su comentario afirma que «se degrada al reloj de la máquina … y se registra el aviso» (`:78-80`), pero el `catch` devuelve el fallback **en silencio** (`:90-92`, la función no recibe logger) y el llamador tampoco lo registra (`:132`). La documentación de arquitectura repite la promesa (`Manuales/01-arquitectura/README.md:117-118`) y la prueba correspondiente solo comprueba el valor devuelto (`burn-scheduler.test.ts:167-175`). Consecuencia: la fecha con la que se buscan caducadas puede quedar decidida por el reloj de la máquina sin rastro en logs ni monitor; el daño está acotado porque la simulación on-chain descarta (`NotExpired`) lo que la cadena aún no considera caducado, y su efecto práctico (engrosar `skipped` sin señal) queda cubierto por H-05. R3 lo descartó por solapamiento; R2 y R6 lo mantienen BAJA por la ausencia de señal de degradación, que es el valor del hallazgo.

**Evidencia.** `apps/worker/src/burn-scheduler.ts:77-93`, `:117`, `:132-136`, `:150-154`, `:165-170`; `apps/worker/src/burn-scheduler.test.ts:167-175`; `RepoTecnico/Manuales/01-arquitectura/README.md:117-118`; `packages/shared/src/burner/service.ts:135-138`, `:435-443`.

**Recomendación.** Pasar el logger a `readChainClock` (o devolver `{clock, degraded}`) y emitir un `warn` con el error original cuando se use el fallback; alertar a DevOps cuando el 100 % de las candidatas se descarte por simulación (señal de reloj desalineado o índice desfasado). Prueba: `getBlock` rechazado → el logger recibe el aviso y el reloj devuelto es el local.

**Origen:** R2 (BAJA), R6 (BAJA).

---

### H-20 · BAJA · worker
**Política de reintento y apagado: solo dentro de la hora, sin tope ni backoff, cerrojo diario que sobrevive a la caída, `stop()` que no espera al ciclo en vuelo y aviso de gas sin deduplicación real**

**Detalle.** El temporizador solo invoca `runOnce` si la hora local es exactamente `BURN_HOUR_LOCAL` (`burn-scheduler.ts:166-170`); el cerrojo diario se libera cuando el ciclo no se completó, así que dentro de esa hora hay reintentos cada 5 minutos (`:103`, `:150-154`), pero un fallo al final de la hora no tendrá otro tick válido hasta el día siguiente, `burnAndConfirm` lanza si el recibo no es `success` (`service.ts:373-385`) abortando el bucle de lotes, y no hay contador de intentos, backoff ni presupuesto máximo de gas. El cerrojo `hotel:burn:day:<día>` se toma con TTL de 26 h antes del ciclo (`:117-123`) y solo se libera si el ciclo no se completó: si el proceso muere (SIGTERM/OOM/redeploy) tras adquirirlo, los siguientes ticks ven `null`, registran un `debug` y devuelven `null` sin distinguir «ya se quemó hoy» de «se cayó antes de quemar»; `stop()` solo apaga el intervalo (`:186-192`) mientras el ciclo se lanzó con `void runOnce()` (`:169`) y `main.ts` cierra el pool de PostgreSQL en el `finally` sin esperarlo (`main.ts:257-270`), de modo que el marcado off-chain puede fallar tras una quema on-chain ya confirmada. Además, con saldo insuficiente cada intento encola un `DEVOPS_ALERT` (`service.ts:118-131`) y cada aviso inserta una fila nueva en `email_notifications` con `jobId = notification.id` (`queue/notifications.ts:62-82`): la deduplicación de BullMQ es por fila, **no por contenido**, así que no hay deduplicación real (hasta ~12 correos/hora), contra la expectativa documentada («avisa al entrar en fallo, no en cada ciclo», `docs/SRS.md:297`; `Manuales/03-operacion/03-incidentes.md:97`). **Calibración:** R4 lo calificó MEDIA; R3 mantuvo BAJA (la recuperación existe: reintento intra-hora + autocuración al día siguiente) y R6 matizó que los reintentos autoconvergen, por lo que se conserva BAJA incluyendo la fatiga de alertas.

**Evidencia.** `apps/worker/src/burn-scheduler.ts:103`, `:117-123`, `:150-154`, `:166-170`, `:169`, `:186-192`; `packages/shared/src/burner/service.ts:93`, `:118-131`, `:167-184`, `:186-194`, `:213-221`, `:373-385`; `apps/worker/src/main.ts:257-270`; `packages/shared/src/queue/notifications.ts:62-82`; `docs/SRS.md:297`; `RepoTecnico/Manuales/03-operacion/03-incidentes.md:97`.

**Recomendación.** Acotar los reintentos del mismo día (contador/estado en el cerrojo diario), añadir backoff y presupuesto máximo de gas antes de parar y alertar una sola vez; registrar el desenlace del cerrojo diario (`…:done|failed`) o usar TTL corto con renovación y liberarlo si la ejecución se interrumpe; guardar la promesa de `runOnce` para esperarla en `stop()`/shutdown antes de cerrar el pool; deduplicar el aviso de saldo bajo por día/umbral (o aplicar el patrón de rearme del monitor). Pruebas: 3 `ERROR` consecutivos → se deja de invocar en la ventana y se agrega una única alerta; ciclo interrumpido tras adquirir el cerrojo → el siguiente tick reintenta; `stop()` con ciclo en vuelo → no se cierra el pool antes de terminar.

**Origen:** R3 (BAJA), R6 (BAJA ×2), R4 (MEDIA, matizado).

---

## 6. Descartes de la fase 2 (deduplicados, con motivo)

Se descartaron **17 hallazgos** en la verificación adversarial (regla: ante la duda, descartar). Agrupados por causa:

| # | Título descartado | Motivo del descarte | Dimensiones |
|---|---|---|---|
| D-01 | «Quema de lote no atómica / se saltan las inválidas sin spec explícita» | Falso positivo: la spec enuncia el revert (`docs/CASOS-DE-USO.md:714-717`, flujos 13c/13d) y la atomicidad está probada (`packages/contracts/test/HotelNights.burn.t.sol:111-130`, `test_BurnBatchMixedRollsBackAtomically`). El servicio la compensa simulando y reintentando token a token (`service.ts:319-340`; `burner.test.ts:172-195`): ninguna quema válida se pierde. | R1, R6 |
| D-02 | «`minBalanceNative` por defecto 1: umbral de suspensión implícito sin número en la especificación» | Falso positivo: el umbral y su default están documentados (`BURNER_MIN_BALANCE_NATIVE=1`, `01-variables-de-entorno.md:148`, `despliegue_gcp.md:1666`) y el umbral efectivo se publica en el aviso (`service.ts:121,127,262,264`). Solo quedaría cubrir el camino `?? 1`, cobertura menor. | R1 |
| D-03 | «Día de gracia» que mantiene quemable una noche por el reloj de Madrid con caducidad UTC | Duplica el desfase UTC/Madrid (hoy H-12) y no produce fallo observable: el cerrojo por día natural de Madrid más el ciclo a las 12:00 converge a una quema por día (`burn-scheduler.ts:117-123`) | R1 |
| D-04 | «Worker y panel calculan las candidatas con fuentes distintas (índice BD vs eventos on-chain)» | El diseño es deliberado y está documentado en el propio código (`service.ts:229-237`); el impacto real no está medido («necesita verificación», §7). Su único efecto verificable (la quema manual no sincroniza la fila) se conserva como H-09 | R2, R5 |
| D-05 | «El ciclo solo arranca dentro de la hora configurada: si el worker no está vivo esa hora, el día no se quema ni se reintenta» | Es la semántica anunciada de un planificador diario (`burn-scheduler.ts:35-41`), no una contradicción entre componentes; el impacto máximo es retrasar 24 h una limpieza y su parte de «nadie se entera» se absorbe en H-04/H-20 | R2, R3, R6 |
| D-06 | Sub-afirmación «mientras el programado sí avisa, el panel no» | Falso: el ciclo programado tampoco avisa cuando no se quema nada (`BURN_EXECUTED` solo si `confirmed.length > 0`, `service.ts:197-204`). Se corrigió la redacción en H-11/H-05 en vez de arrastrar el error | R2 |
| D-07 | «La quema puede quedar desactivada en silencio por configuración (ya ocurrió)» | Duplicado de H-04 (misma causa raíz, mismo síntoma y misma remediación); su evidencia (`main.ts:291-294`, `estado_proyecto.md:3168-3172`) se incorporó a H-04 | R3 |
| D-08 | «La degradación del reloj de cadena es silenciosa» | Solapado y sin daño on-chain propio: su efecto real se reparte entre H-05 (descartes sin aviso) y H-04 (ciclo sin señal); se conserva como H-19 por la ausencia de la traza prometida | R3, R2, R6 |
| D-09 | «Ventana diaria sin *catch-up*: un reinicio a las 12:xx deja el día sin quema y sin aviso» | Fusionado en H-04 (fallos silenciosos del planificador, misma causa raíz y misma recomendación conjunta) | R4, R6 |
| D-10 | «CU-13 apunta a RF-17 en lugar de RF-11» (duplicado interno) | Fusionado en H-07; conservado como detalle documental con la severidad del conjunto | R4, R2, R5 |
| D-11 | «`BURN_BATCH_MAX=50` se atribuye a `docs/SRS.md` §9, donde no está definido» | Falso positivo: el comentario cita el caso de uso CU-13, que sí está en SRS §9 (`docs/SRS.md:361`, `:122`), y el valor 50 está documentado en `docs/CASOS-DE-USO.md:32`. No hay trazabilidad falsa (el residuo de cifras es H-18) | R5 |
| D-12 | «El escaneo de caducadas lanza todos los `getLogs` en paralelo sin límite de concurrencia» | Hecho real (H-17), pero descartado por impacto dudoso/fuera de alcance: red canónica Anvil/Besu (`chain.ts:66-68`), `deploymentBlock` 1/314 y `GETLOGS_MAX_RANGE=5000` → un solo rango; Polygon queda fuera del alcance entregado por ADR-01. Se conserva como endurecimiento preventivo en H-17 | R5, R6, R7 |
| D-13 | «La quema ignora las reservas activas: puede quemar el token de una reserva viva» | Falso positivo: `markNoShows` cierra las reservas CONFIRMED con fecha pasada y libera inventario (`reservations.repository.ts:402-428`), invocado por `purgeExpiredData` (`retention.ts:89-90`) desde el planificador de retención al arrancar y cada 6 h (`retention-scheduler.ts:95`), antes de la ventana de las 12:00 | R6 |
| D-14 | «El aviso `DEVOPS_ALERT` persiste la URL del RPC (posible secreto) 90 días y la envía por correo» | Descartado por duda no resuelta: viem 2.52.0 ya elimina credenciales *basic-auth* de la URL en sus errores, el único RPC documentado (Anvil en GCP) no lleva credenciales y no hay evidencia de un secreto real. Queda como «necesita verificación» (§7) | R7 |
| D-15 | «Falta la prueba del camino `?? 1` de `minBalanceNative`» | Cobertura menor que no sostiene un hallazgo propio; absorbido en H-15 | R1 |
| D-16 | «Reparación automática del marcado BURNED no existe» (sub-afirmación) | No es un hallazgo independiente: es el efecto del modo de fallo de H-01, donde se documenta y se corrige | R3 |
| D-17 | Afirmaciones internas con citas erróneas de los revisores (p. ej. reserva de descartes en `INFORME_OPTIMIZACION_V5.md:554`) | Corregidas por los verificadores: la reserva está en `estado_proyecto.md:554`; las líneas reales de `main.ts` son 291-294. No se arrastran al informe | R3 |

---

## 7. Riesgos residuales y lo que «necesita verificación»

Lo siguiente **no** se ha podido confirmar ni descartar con evidencia y se declara explícitamente:

1. **Divergencia de fuentes de candidatas (índice `nfts` vs eventos on-chain).** Es un diseño deliberado y documentado (`service.ts:229-237`), pero el impacto real de la divergencia (noches quemables ausentes del índice o filas desincronizadas) **no está medido**. Necesita verificación con un contraste índice↔eventos sobre datos reales.
2. **Fuga de credenciales del RPC en el mensaje de error persistido 90 días.** `service.ts:213-220` encola `error.message` y `notifications.ts:64-71` + `migrator.ts:140-148` lo persisten como JSONB con retención de 90 días; viem 2.52.0 redacta *basic-auth* de la URL, pero claves embebidas en el *path* no están descartadas. Necesita verificación: consultar `email_notifications` de producción y la URL del RPC desplegado.
3. **Escalado del escaneo de caducadas.** Con `deploymentBlock` 1/314 y `GETLOGS_MAX_RANGE=5000` hoy se genera un rango; si se habilita Polygon o el histórico crece, el `Promise.all` sin pool (H-17) pasa de endurecimiento a defecto. Necesita verificación si cambia el alcance de red (ADR-01).
4. **Cobertura real del proceso.** No hay instrumentación ni cifra publicada; la afirmación «26/26 en verde» no se pudo reproducir en este entorno (`vitest` no instalado). Necesita verificación: ejecutar las 3 suites y publicar cobertura del alcance.
5. **Comportamiento del índice bajo reorganizaciones.** La convergencia de la vía manual depende del listener y de `REORG_CONFIRMATIONS` (`config.ts:90`); no se ha medido el retardo real ni el efecto de un reorg en `burned_at`.
6. **Estados de error no clasificados.** `LOCKED`, `INSUFFICIENT_GAS` y `ERROR` tienen mapeo HTTP (`route.ts:60-67`) pero no se ha verificado su comportamiento end-to-end con el relayer ni la recuperación de un `503`/`502` desde el panel.
7. **Volumen real del inventario caducado.** No se ha medido cuántas noches acumula el entorno desplegado ni cuántos lotes genera el ciclo diario, dato necesario para dimensionar H-17.

---

## 8. Plan de acción

### 8.1 Quick wins (esfuerzo S, ≤1 día cada uno)

| # | Acción | Hallazgos | Responsable sugerido | Esfuerzo | Criterio de aceptación |
|---|---|---|---|---|---|
| QW-1 | Distinguir revert de error de red antes de reconciliar: solo `ContractFunctionRevertedError` ⇒ `BURNED`; error de red ⇒ no escribir y `reason: ERROR` + `DEVOPS_ALERT` | H-01 | Backend/contratos (`packages/shared`) | S | 3 tests nuevos (timeout en `simulateContract`, error de red en `ownerOf`, revert real) y ninguna fila modificada en los dos primeros |
| QW-2 | Devolver `reason` explícito (`SKIPPED_ALL`) cuando `candidates > 0 && confirmed == 0`, con alerta y decisión de cerrojo; umbral de aviso para `skippedTokens.length > 0` | H-05, H-19 | Backend (`packages/shared`) | S | Test con `simulateContract` rechazando todo → alerta encolada y cerrojo no retenido como éxito |
| QW-3 | Exponer `burnScheduler: enabled|disabled` y `lastBurnRun` en `/health`; `DEVOPS_ALERT` si falta la clave; pasada de recuperación al arrancar si la hora ya pasó y el cerrojo está libre | H-04, H-03 | Worker/DevOps | S | Arrancar sin clave → alerta y estado en `/health`; arranque a las 12:30 → `runOnce` invocado |
| QW-4 | Añadir `RELAYER_WALLET_PRIVATE_KEY`/`RELAYER_MIN_BALANCE_NATIVE` a `.env.example`, manual y `70-deploy-apps.sh`; unificar en `BURNER_WALLET_PRIVATE_KEY` y marcar `BURNER_BOT_PRIVATE_KEY` como obsoleta | H-03, H-18 | DevOps/documentación | S | Grep de CI que exija las variables en el script; POST real → 200 con `txHash` |
| QW-5 | Mostrar `burnedCount`, `txHashes` y `skipped` en el modal/panel; tratar «0 quemadas» como advertencia; preservar los `txHashes` parciales ante fallo de un lote | H-11 | Frontend | S | Test de hook para 200 con 0 y con N, y para 502 con hashes previos |
| QW-6 | Corregir RF-17 → RF-11 en CU-13, CASOS-DE-USO, MATRIZ-TRAZABILIDAD y PLAN-DE-PRUEBAS; reescribir el flujo del relayer y las referencias de línea | H-07, H-08 | Documentación | S | Chequeo automático: cada CU cita el RF del SRS; cada `ruta:línea` contiene el símbolo esperado |
| QW-7 | Corregir el comentario de `route.ts:39-44` (no hay serialización de nonce) y documentar el flujo real; retirar `BURNER_BOT_PRIVATE_KEY` | H-10, H-03 | Backend/documentación | S | El comentario refleja el comportamiento real; ninguna variable documentada sin lector en código |
| QW-8 | Sustituir el respaldo silencioso 20/50 por una regla única documentada (o fallo visible) y eliminar la constante muerta `BURN_BATCH_MAX` | H-18 | Backend/contratos | S | Test: fallo de lectura de `burnBatchMax` → lotes de 20 registrados; UI no inventa 50 |

### 8.2 Mejoras (esfuerzo M, 2-5 días)

| # | Acción | Hallazgos | Responsable sugerido | Esfuerzo | Criterio de aceptación |
|---|---|---|---|---|---|
| M-1 | Serializar los envíos de `burnTokens` (cola encadenada tipo `serializeAnchor`) o gestión explícita de nonce | H-10 | Backend | M | Dos `burnTokens` concurrentes → nonces secuenciales, ambas confirmadas |
| M-2 | Marcar `BURNED` desde el recibo en `burnTokens` y encolar `BURN_EXECUTED` con operador y hashes | H-09, H-06 | Backend | M | Test que exija `updateNFTStatus` y `enqueueNotification` en la vía manual |
| M-3 | Exigir TOTP en la ruta de quema y persistir tabla `burn_events` de auditoría (actor, tokenIds, hashes, origen, fecha) | H-06 | Backend/seguridad | M | POST sin TOTP → 403 `MFA_REQUIRED`; una fila de auditoría por quema manual y programada |
| M-4 | Revocar `DEFAULT_ADMIN`/`MINTER` del relayer, dejar solo `BURNER_ROLE`, revocar `BURNER_ROLE` de la cuenta 0 y ampliar `verify-accounts.ts` para fallar ante acumulación de roles | H-02 | DevOps/contratos | M | `hasRole` on-chain verificado; el script de topología incluye las wallets de quema/relayer y falla si acumulan roles |
| M-5 | Suite de pruebas del camino operativo: `burnTokens`, ruta HTTP, `checkExpired`/`scanExpired`/`parseTokenIds`, y pruebas de frontera horaria (UTC/Madrid) y de precisión («12:00») | H-15, H-12, H-13 | QA/backend/frontend | M | Cobertura ≥90 % de líneas del alcance declarado y casos frontera en verde |
| M-6 | Publicar `burn_runs` por ciclo y alerta del monitor «a las 13:00 locales existe ciclo del día» | H-04, H-05 | DevOps/worker | M | Alerta efectiva al simular un día sin ciclo; `lastBurnRun` visible en `/health` |
| M-7 | Reconciliar el índice con eventos antes de declarar `NO_TOKENS` y diferenciar «índice vacío/atrasado» de «nada caducado» | H-05 | Backend/worker | M | Test con mints sin candidata indexada → alerta con motivo, no `NO_TOKENS` silencioso |
| M-8 | Paginar `getUnsoldExpiredNFTs` y agrupar el marcado en una sola sentencia `UPDATE … WHERE token_id = ANY($1)` | H-17 | Backend | M | Prueba de carga ≥1.000 noches: ciclo completo y `UPDATE` O(1) por lote |

### 8.3 Roadmap (esfuerzo L, >1 semana)

| # | Acción | Hallazgos | Responsable sugerido | Esfuerzo | Criterio de aceptación |
|---|---|---|---|---|---|
| L-1 | Rediseñar la política de ejecución del ciclo: estado persistido «ciclo de hoy completado» en lugar de cerrojo por hora, reintentos con backoff y presupuesto de gas, `shutdown` que espera el ciclo en vuelo, y sin pérdida de día por reinicio | H-20, H-04 | Worker/arquitectura | L | Pruebas de recuperación, interrupción y presupuesto; ningún día cierra sin ciclo ni alerta |
| L-2 | Unificar la semántica de caducidad en una sola fuente normativa (UTC on-chain + criterio off-chain explícito) y pruebas de frontera documentadas | H-12 | Arquitectura/contratos/docs | L | Documentos alineados con ADR-08; pruebas de frontera 23:30Z y 22:30Z en verde |
| L-3 | Endurecer el escaneo del panel: pool de concurrencia, cursor incremental persistido y cálculo de candidatas en el worker/BD | H-17 | Frontend/backend | L | Medición con N alto: máximo de RPC simultáneas acotado y lote completo en pasadas sucesivas |
| L-4 | Guardián de documentación y configuración en CI (variables leídas vs documentadas, CU↔RF, `ruta:línea`) y política de despliegue que falle si falta la configuración de quema | H-03, H-07, H-08 | DevOps/documentación | L | El pipeline falla ante cualquier desviación; el despliegue no puede apagar la quema en silencio |

### 8.4 Criterios de aceptación para la siguiente versión (V7)

Para elevar el veredicto de **NO APTO** a **APTO CON CONDICIONES**, deben cumplirse **todos** los siguientes:

1. **Integridad (H-01):** ningún error de transporte del RPC puede modificar el estado de `nfts`; existen las 3 pruebas de clasificación revert/red en verde.
2. **Señal de vida (H-04):** `/health` publica `burnScheduler` y `lastBurnRun`, y el monitor alerta si un día cierra sin ciclo; probado simulando la ausencia de clave y un arranque fuera de hora.
3. **Fallo total cuantificado (H-05):** un ciclo con 100 % de descartes nunca se reporta como `COMPLETED` exitoso: hay `reason` explícito, alerta con la lista y política de cerrojo/reintento probada.
4. **Custodia y auditoría (H-02, H-06):** el relayer ostenta únicamente `BURNER_ROLE` (verificado on-chain y por script); la quema manual exige TOTP y deja fila de auditoría con el operador.
5. **Configuración reproducible (H-03):** `.env.example`, manual y `70-deploy-apps.sh` provisionan la quema; un despliegue limpio no puede apagarla en silencio.
6. **Trazabilidad (H-07, H-08):** toda la documentación del CU-13 apunta a RF-11 y describe el flujo del relayer; el guardián de documentación pasa.
7. **Cobertura (H-15):** suites de `burnTokens`, ruta HTTP y panel en verde, con cobertura publicada ≥90 % de líneas del alcance del proceso y las fronteras horarias cubiertas.
8. **Concurrencia (H-10):** dos quemas concurrentes no colisionan en el nonce (prueba con `walletClient` falso).
9. **Reproducibilidad de la métrica:** la suite completa del proceso se ejecuta en CI y su resultado (26/26 o superior) queda publicado como evidencia, no como afirmación.

---

*Informe V6 generado por el SINTETIZADOR de la auditoría (`@audita`, fase 3) a partir exclusivamente de los informes verificados de las 7 dimensiones. No se añadió ningún hallazgo no verificado. Fase 1 y fase 2 fueron lectura-only; este informe no sobrescribe `RepoTecnico/INFORME_OPTIMIZACION_V5.md`.*

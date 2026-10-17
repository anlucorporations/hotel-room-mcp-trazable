# Propuesta de cierre de brechas · puntos 1–4

> **Comando:** `@asistenteProyecto` · **Fecha:** 2026-10-13 · **Autor:** Asistente de Proyecto (director + ingeniero senior)
> **Proyecto:** Hotel Marina del Sol — plataforma de noches tokenizadas
> **Base:** `Hotel-DSH-GCP-v3` @ `d9681c5` · producción `web:v55` / `mcp:v55`
> **Origen:** informe [`INFORME_CUMPLIMIENTO_REPO_ETH-EJERCICIOS.md`](./INFORME_CUMPLIMIENTO_REPO_ETH-EJERCICIOS.md) §8 (hallazgos 1–5)
> **Estado:** **propuesta, pendiente de aprobación y de resolver 9 decisiones** (bloques A/B/C al final). No se ha escrito código.

---

## 0. Objetivo y encuadre

Cerrar los cuatro puntos que hoy separan al proyecto del pliego de referencia, **sin degradar** lo ya desplegado:

| # | Punto | Requisito del pliego | Estado actual | Brecha |
|---|---|---|---|---|
| 1 | **Royalty configurable por `ROYALTY_ADMIN`** | RF-08: bps 0–2000, por defecto 1000, rol `ROYALTY_ADMIN` | Constantes 500/1000 bps por tipo (D-06); `AdminRoyalty` es informativo; no existe rol | Configurabilidad + rol + UI + alineación documental |
| 2 | **Subastas de habitaciones premium** | RF-13 (Fase 2): pujas para la suite | No existe | Contrato + UI pública + admin + pruebas |
| 3 | **WalletConnect** | RF-11 (Fase 2): otras wallets además de MetaMask | **Activo en producción** (`web:v64`, `hotel-mcp-web-00122-lal`): `projectId` inyectado en el build, `metadata.url` desde `NEXT_PUBLIC_SITE_URL`, ADR-29 y TC-E2E-072/073 | Aceptación en móvil real (TC-ACC-003: QR + red 81234 + firma) |
| 4 | **Despliegue en la red de prueba Besu de Codecrypto (con faucet)** | RNF-22 + T5.1: validación en Besu 81234 | Producción en Anvil `31337`; Besu documentado en `docs/SPIKE-BESU.md` (RPC `besu2.proyectos.codecrypto.academy`, chainId **81234**) | Desplegar y **aceptar** en Besu |

**Principio rector:** un **ciclo vertical por punto**, cada uno entregable y demostrable, con test-first, sin tocar producción hasta que el ciclo esté verde. Los puntos 3 y 4 son de bajo riesgo; los puntos 1 y 2 tocan el contrato (inmutable, ADR-22 ⇒ **redeploy + re-siembra**).

---

## 1. Punto 1 — Royalty configurable por `ROYALTY_ADMIN`

### 1.1 Diseño propuesto (recomendado: **A**)

La política actual (D-06) fija el royalty **por tipo** de habitación. Se conserva esa política y se le añade el **rol que la gobierna**:

- **Almacenamiento**: `uint96 private _royaltyBpsSimple; uint96 private _royaltyBpsSuite;` inicializados a 500 / 1000 (valores vigentes ⇒ migración sin cambio de comportamiento).
- **Setter**: `setRoyaltyBps(bytes32 roomTypeHash /* o string */, uint96 bps)` con `onlyRole(ROYALTY_ADMIN_ROLE)`, validando `bps <= 2000` (20 %) — rango del pliego. Evento `RoyaltyUpdated(string roomType, uint96 bps)`.
- **Rol**: `ROYALTY_ADMIN_ROLE` en `HotelNights.sol` y en `packages/shared/src/domain/roles.ts` (fuente única usada por deploy, tests y back-office).
- **Lectura**: `royaltyInfo()` (ERC-2981) sigue siendo la fuente única y ahora lee del almacenamiento por tipo.
- **Compatibilidad**: constantes actuales pasan a ser **valores iniciales**, no límites. `ROYALTY_BPS_STANDARD/SUITE` se mantienen como `DEFAULT_*`.

**Opción B (alternativa):** royalty **global** único (`_defaultRoyaltyBps`, por defecto 1000) + `tokenId` con override opcional. Es la lectura literal del pliego, pero rompe la política D-06 por tipo y complica la UI. **Descartada** (decisión A1).

### 1.2 Impacto

| Capa | Cambios |
|---|---|
| `packages/contracts` | `HotelNights.sol`, `IHotelNights.sol` (rol, setter, evento, error `InvalidRoyaltyBps`), `HotelNights.bootstrap` (grant del rol), `Deploy.s.sol`; suites `HotelNights.royalty.t.sol` + invariantes |
| `packages/shared` | `domain/roles.ts` (+rol), `abi/hotel-nights.ts` regenerado (`pnpm gen:abi`), `deployments/81234.json` y `31337.json` |
| `apps/web` | `components/admin/AdminRoyalty.tsx` pasa de informativo a **formulario con firma** (rol + `tx` + `TxModal`); i18n `es/en/ru`; tests de rol/UI |
| `apps/mcp` | Sin cambio funcional; hereda ABI/constantes |
| Datos | **Sin cambio de esquema** (el royalty es on-chain) ⇒ `diccionario_datos.md` / `diagrama_er.md` / `base_datos.sql` no se tocan |
| Docs | ADR nuevo (p. ej. **ADR-28 · Royalty configurable por rol**), SRS (CU nuevo), `REQUISITOS.md` alineado con D-06 o con la nueva decisión |

### 1.3 Caso de uso (borrador)

**CU-47 · Configurar el porcentaje de royalty** · Actor: `ROYALTY_ADMIN` · Precondición: contrato desplegado, rol asignado.
- Flujo principal: el admin abre `/admin/royalty`, elige tipo, introduce bps, firma; el contrato emite `RoyaltyUpdated` y `royaltyInfo` refleja el nuevo valor.
- Alternativos: sin rol → `AccessControlUnauthorizedAccount`; bps > 2000 → `InvalidRoyaltyBps`; rechazo de firma → sin cambios.

```gherkin
Dado un administrador con ROYALTY_ADMIN_ROLE y una suite con royalty 1000 bps
Cuando fija el royalty de "suite" a 1500 bps y firma la transacción
Entonces royaltyInfo(tokenIdSuite, 1 ether) devuelve 0,15 ETH como royaltyAmount
Y se emite RoyaltyUpdated("suite", 1500)

Dado un usuario SIN ROYALTY_ADMIN_ROLE
Cuando intenta fijar el royalty
Entonces la transacción revierte con AccessControlUnauthorizedAccount
```

```ears
Mientras el contrato esté en pausa, el sistema permitirá igualmente setRoyaltyBps
  (la configuración no mueve fondos ni tokens; no debe bloquearse por la pausa).
Si los bps solicitados superan 2000, entonces el sistema revertirá con InvalidRoyaltyBps.
El sistema deberá conservar 5 %/10 % como valores iniciales tras el despliegue.
```

### 1.4 Estimación: **26–32 h** (contrato 10 · tests 6 · ABI/shared 2 · UI 6 · docs 3 · redeploy/verificación 4).

---

## 2. Punto 2 — Subastas para habitaciones premium

### 2.1 Diseño propuesto

**Contrato nuevo `packages/contracts/src/NightAuction.sol`** (no extender `HotelNights.sol`: mantiene la separación de responsabilidades y el contrato de noches inalterado).

- **Modelo**: subasta **inglesa** con precio de reserva, incremento mínimo y **anti-sniping** (si hay puja en los últimos `SNIPE_WINDOW`, se extiende el cierre).
- **Custodia**: el hotel **no escrowa** el NFT; al crear la subasta aprueba `NightAuction` como operador (`setApprovalForAll` o `approve`). Al liquidar, `transferFrom` al ganador.
- **Pagos**: ETH en `payable`; **pull payments** (`pendingWithdrawals`) para vendedor (hotel), royalty (si procede) y devolución de pujas superadas — nunca `push` a direcciones que puedan revertir.
- **Ciclo de vida**: `createAuction(tokenId, reservePriceWei, startTime, endTime)` · `bid(tokenId)` · `settle(tokenId)` (tras el cierre) · `cancel(tokenId)` (sin pujas, o noche expirada) · `withdraw()`.
- **Reglas**:
  - Solo noches **futuras** y **no vendidas** (la subasta es una venta **primaria** del hotel ⇒ **sin royalty**, RF-08).
  - `nonReentrant` en `bid/settle/withdraw`; `Pausable` compartiendo el `PAUSER_ROLE`.
  - Una sola liquidación por subasta (`settled` flag) y una sola puja ganadora.
  - Rol `AUCTION_ADMIN_ROLE` para crear/cancelar; los clientes solo pujan.
- **Reventa por subasta**: **fuera de alcance** por decisión B4. El contrato se diseña sin acoplarse a ella, pero el primer ciclo solo expone la subasta **primaria** del hotel.
- **Indexado off-chain**: **descartado** por decisión B6 (solo on-chain) ⇒ la UI lee del contrato y **no hay cambios de esquema**.

### 2.2 Impacto

| Capa | Cambios |
|---|---|
| Contratos | `NightAuction.sol`, `INightAuction.sol`; `Deploy.s.sol`/`DeployOperations.s.sol` según alcance; suites `NightAuction.t.sol` + invariantes (fondos siempre reclamables; nunca dos liquidaciones; el NFT no se duplica) |
| `packages/shared` | ABI de subastas, `roles.ts` (+`AUCTION_ADMIN_ROLE`), dominio (tipos), `constants.ts` (incremento mínimo, ventana anti-sniping, duración máxima) |
| `apps/web` | Nueva sección pública `/subastas` (`components/auctions/*`: tarjeta con cuenta atrás, puja, historial), panel admin de apertura, `WalletBar`/`TxModal`, i18n es/en/ru, estados vacío/degradado, a11y |
| `apps/mcp` | *(opcional, no incluido)* herramienta `listAuctions` para el asistente; queda como mejora posterior |
| Datos | **Sin cambios** (decisión B6: solo on-chain) ⇒ `diccionario_datos.md`, `diagrama_er.md` y `base_datos.sql` **no se tocan** |
| Docs | ADR nuevo (**ADR-29 · Subastas on-chain con pull payments**), CU nuevos, SRS, manual del comprador |

### 2.3 Casos de uso (borrador)

**CU-48 · Subastar una noche premium** (hotel) · **CU-49 · Pujar y liquidar una subasta** (cliente).

```gherkin
Dado el hotel como propietario de la noche de suite 201 del 2026-07-01, futura y no vendida
Cuando crea una subasta con reserva 0,10 ETH y cierre en 24 h
Entonces el contrato emite AuctionCreated(tokenId, 0,10 ETH, cierre)

Dado un cliente con cartera conectada y una subasta con reserva 0,10 ETH
Cuando puja 0,12 ETH
Entonces su puja queda como mejor puja y su saldo ETH se reduce en 0,12 ETH

Dado un cliente que pujó 0,12 ETH y fue superado por 0,15 ETH
Cuando reclama su devolución
Entonces recibe 0,12 ETH y su saldo pendiente queda a 0

Dado el cierre de la subasta con mejor puja 0,15 ETH
Cuando cualquiera liquida
Entonces el NFT pasa al ganador, el importe va al hotel y la subasta queda settled
```

```ears
Si una puja llega dentro de la ventana anti-sniping, entonces el sistema extenderá el cierre.
Si la subasta no recibe ninguna puja, entonces el sistema permitirá cancelarla sin mover el NFT.
Mientras el contrato esté en pausa, el sistema impedirá crear subastas y pujar,
  pero permitirá retirar los fondos pendientes.
El sistema deberá permitir reclamar los fondos pendientes aunque la subasta esté cancelada.
```

### 2.4 Estimación: **48–60 h** (contrato 16 · tests+invariantes 10 · UI pública 12 · admin 6 · i18n/e2e 6 · docs 4 · verificación 4). *Baja respecto al borrador inicial al quedar fuera la reventa y el indexado (decisiones B4/B6).*

---

## 3. Punto 3 — WalletConnect

### 3.1 Estado real

`apps/web/src/lib/wallet-connectors.ts` ya construye el conector de WalletConnect v2 **solo si** `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` tiene valor; `walletPlan()` es puro y testeable; `WalletChooser.tsx` lista los conectores. **Falta**: el `projectId`, exponerlo en `.env.example`, pasarlo en el build de la imagen y en el despliegue, y la prueba real en móvil.

### 3.2 Plan (alcance aprobado C7: **dejarlo preparado, sin activar**)

1. **Sin alta de projectId** por ahora. Se documenta en `.env.example` y en el runbook cómo darlo de alta (Reown/WalletConnect Cloud: nombre "Marina del Sol", URL de producción, redes 81234 y 31337) y qué cambio exige (rebuild de la imagen, porque es `NEXT_PUBLIC_*`).
2. **Configuración**: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` en `.env.example` (comentada, sin valor de ejemplo), **cableada** en `infra/gcp/f8-build-images.sh` (`_NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`) y `infra/docker/cloudbuild.yaml`; `metadata.url` pasa a `NEXT_PUBLIC_SITE_URL` (hoy está fijado al host de producción).
3. **UI**: verificar que `WalletChooser` muestra/oculta el conector correctamente según el `walletPlan`; `wrong-network` con `switchChainError` (ya existe).
4. **Pruebas**: unit del `walletPlan` con y sin `projectId` (base ya existente) y E2E con el conector mockeado. **La aceptación con QR en móvil queda bloqueada** hasta que exista un `projectId` real: se registra como pendiente externo.
5. **Docs**: ADR (**ADR-30 · Conectores de billetera y WalletConnect**) + `entornos_globales.md` + manual de onboarding (CU-17), con el procedimiento de activación.

### 3.3 Casos de uso (borrador)

**CU-50 · Conectar una cartera por WalletConnect.**

```gherkin
Dado un móvil sin extensión de navegador y la web abierta
Cuando el usuario elige WalletConnect y escanea el QR con su cartera
Entonces la sesión queda conectada con su dirección
Y si la red no es la del hotel, la UI ofrece cambiarla antes de firmar
```

```ears
Si NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID está vacío, entonces el sistema no ofrecerá
  el conector de WalletConnect (no se inventan valores por defecto).
El sistema deberá mantener MetaMask/EIP-6963 como opción por defecto.
```

### 3.4 Estimación: **6–8 h** (configuración y cableado de build 3 · UI 1 · tests 2 · docs 2). *Sin alta de projectId ni aceptación móvil por la decisión C7.*

---

## 4. Punto 4 — Despliegue en la red de prueba Besu de Codecrypto (con faucet)

### 4.1 Punto de partida

`docs/SPIKE-BESU.md` ya validó el nodo: RPC `https://besu2.proyectos.codecrypto.academy`, **chainId 81234**, latencia P50 ≈ 194 ms, `getLogs` ≤ **5.000 bloques**, `net_version` deshabilitado (usar `eth_chainId`). Existe `packages/contracts/scripts/measure-besu.mjs` (TC-ACC-010/011/012) y `ADR-17 · espejo Besu`. Producción sigue en Anvil 31337.

### 4.2 Plan de despliegue

1. **Requisitos de Codecrypto** (bloqueante): RPC de escritura, cuenta/faucet de prueba **financiada**, límites de gas, disponibilidad del quórum.
2. **Contrato**: desplegar `HotelNights` (y `NightAuction`/`HotelOperations` si aplica) con `RPC_URL=<besu>`, `CHAIN_ID=81234`, bootstrap de roles (ADR-06) y `DEPLOY_FAUCET` según decisión; `pnpm --filter @hotel/contracts sync` ⇒ `packages/shared/deployments/81234.json`.
3. **Faucet**: **el de Codecrypto** (decisión C9). No se despliega `Faucet.sol` en Besu; se oculta el del proyecto dejando `NEXT_PUBLIC_FAUCET_ADDRESS` vacío y se documenta en el runbook cómo obtener ETH de prueba.
4. **Entorno**: **no se monta preview web** (decisión C8). La aplicación seguirá sirviendo Anvil 31337; la validación en Besu se hace con scripts contra el contrato desplegado (`measure-besu.mjs`, compra firmada con `BUYER_PK`). Queda como mejora posterior montar un preview si se quiere enseñar la UI en Besu.
5. **Aceptación real**: `measure-besu.mjs` (TC-ACC-010/011/012) + compra primaria firmada (`e2e-wallet-buy.mjs` con `BUYER_PK`; TC-ACC-001/002). El worker indexando contra Besu se valida con `GETLOGS_MAX_RANGE=5000` en local/CI, no en un servicio desplegado.
6. **Evidencia y runbook**: `RepoTecnico/evidencias/` + sección Besu en `RUNBOOK`, `entornos_globales.md` y `despliegue_gcp.md`.

### 4.3 Casos de uso / aceptación

**CU-51 · Operar en la red Besu de pruebas.** (EARS, criterios de aceptación del pliego)

```ears
El sistema deberá conectar a la red Besu (chainId 81234) con la misma build que Anvil,
  cambiando solo RPC_URL/CHAIN_ID/CONTRACT_ADDRESS y las NEXT_PUBLIC_*.
Mientras la red Besu no responda, el sistema mostrará el estado degradado,
  sin bloquear la compra desde el catálogo con datos en caché.
Si el faucet no tiene saldo, entonces el sistema emitirá la alerta de saldo bajo (lowBalance).
El sistema deberá aceptar: intervalo de bloque P50 ≤ 3 s y P95 ≤ 6 s, RPC P95 ≤ 400 ms
  y 0 eventos perdidos con getLogs ≤ 5.000 bloques.
```

### 4.4 Estimación: **10–14 h** (preparación y credenciales 3 · despliegue del contrato 3 · aceptación con scripts 4 · runbook+evidencia 3). *Sin entorno de preview por la decisión C8.*

---

## 5. Plan de desarrollo por ciclos (vertical, test-first)

| Ciclo | Punto | Entregable demostrable | Estimación | Depende de |
|---|---|---|---|---|
| **C0** | 3 | WalletConnect **preparado**: variable documentada y cableada en el build, UI verificada y pruebas; activación y QR móvil pendientes de un `projectId` real | 6–8 h | — |
| **C1** | 1 | Royalty **editable por `ROYALTY_ADMIN`** (valores iniciales 5 %/10 %, rango 0–2000 bps) + UI con firma + ABI; redeploy en ventana acordada | 26–32 h | ventana de redeploy (A2) |
| **C2** | 2 | **Subasta primaria inglesa** de una suite end-to-end (crear → pujar → anti-sniping → liquidar → reclamar) | 48–60 h | C1 |
| **C3** | 4 | Contrato desplegado y **aceptado en Besu 81234** con `measure-besu.mjs` + compra firmada; faucet de Codecrypto documentado | 10–14 h | credenciales de Codecrypto |
| **C4** | cierre | Evidencias, manuales, actualización de `MATRIZ-TRAZABILIDAD` y release | 6–10 h | C0–C3 |

**Total: 96–124 h ≈ 2,5–3 semanas** a 40 h/semana. Cada ciclo cierra con: tests verdes, lint/typecheck, `next build`, despliegue en canario cuando aplique, verificación en vivo y commit atómico con `Refs/Task/Tests`.

> **Orden recomendado:** **C3 primero** si Codecrypto ya tiene la cuenta financiada (es el camino crítico externo y no toca contrato); **C0 en paralelo**; **C1 antes que C2**. El redeploy de C1 se agenda en la ventana acordada (A2) y no bloquea a C0/C3.

---

## 6. Artefactos afectados (resumen)

- **Código**: `packages/contracts/{src,test,script,scripts}`, `packages/shared/{domain,abi,constants,deployments}`, `apps/web/{app,components,lib,messages}`, `apps/mcp` (opcional), `infra/{gcp,docker}`, `.github`/`.gitlab-ci`.
- **Datos**: **ninguno de los cuatro puntos cambia el esquema** (subastas solo on-chain por B6; royalty on-chain; WalletConnect y Besu no tocan datos). Por tanto `RepoTecnico/diccionario_datos.md`, `RepoTecnico/diagrama_er.md` y `RepoTecnico/base_datos.sql` **no se modifican** en estos ciclos; si un ciclo futuro añadiera persistencia, los tres se actualizarían a la vez (más el bloque del migrador).
- **Documentación**: 4 ADR nuevos, SRS (§9 casos), `REQUISITOS.md` (alineación RF-08), `RUNBOOK`, `entornos_globales.md`, `despliegue_gcp.md`, `estado_proyecto.md`, manuales de comprador/administrador.

---

## 7. DoD y criterios de aceptación

1. `pnpm lint` · `pnpm typecheck` · suites (`forge`, vitest por paquete) · `next build` en verde.
2. Cada RF con su `TC-*`: RF-08 (royalty), RF-13 (subastas), RF-11 (WalletConnect), RNF-22 + TC-ACC (Besu).
3. Cobertura: contrato 100 % de ramas de su lógica; worker/MCP ≥ 90 % líneas; sin *high* de Slither.
4. Despliegue en **canario sin tráfico** → verificación en vivo → promoción, con rollback documentado.
5. `MATRIZ-TRAZABILIDAD` y `estado_proyecto.md` actualizados; evidencia en `RepoTecnico/evidencias/`.
6. Los tres artefactos de datos sincronizados (solo si el ciclo toca el modelo).

---

## 8. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Redeploy del contrato (ADR-22)** por C1/C2: se pierde el estado de la red de pruebas | Alto | Ventana acordada; re-minteo con `seed`/`inject:data`; congelar la demo; desplegar primero en Besu/Anvil local y promover |
| Royalty configurable cambia el importe de la reventa | Medio | Topes 0–2000 bps, evento + auditoría, y aviso en la UI antes de firmar |
| Subastas: reentrancy, doble liquidación, fondos atrapados | Alto | Pull payments, `nonReentrant`, invariantes + fuzzing, revisión Slither, tope de duración |
| Besu: disponibilidad del quórum y `getLogs ≤ 5.000` | Medio | Reintentos/backoff, checkpoint, `GETLOGS_MAX_RANGE`, entorno de preview aislado |
| Faucet de pruebas abusado | Bajo | **Con C9 se usa el de Codecrypto**; el `Faucet.sol` del proyecto no se despliega en Besu y sigue limitado a 1 dispensación/wallet/24 h en Anvil |
| WalletConnect: projectId o relay caídos | Bajo | El conector es opcional; MetaMask/EIP-6963 siguen como camino principal |

---

## 9. Decisiones aprobadas (2026-10-13)

| # | Decisión | Respuesta del responsable |
|---|---|---|
| A1 | Modelo de royalty | **Por tipo, editable**: se conservan 5 % (simple/doble) y 10 % (suite) como valores iniciales y `ROYALTY_ADMIN_ROLE` los puede editar en el rango 0–2000 bps |
| A2 | Redeploy del contrato | **Ventana acordada**: se desarrolla y prueba en Anvil/Besu local; el redeploy se ejecuta en una ventana pactada, con re-siembra y demo congelada |
| A3 | Titular de `ROYALTY_ADMIN` | **Owner actual** (`DEFAULT_ADMIN_ROLE`); se documenta que en producción debería pasar a wallet dedicada/multisig |
| B4 | Alcance de las subastas | **Solo primaria del hotel** (venta de una noche propia; sin royalty). La reventa por subasta queda fuera de este alcance |
| B5 | Mecánica | **Inglesa con anti-sniping**, precio de reserva e incremento mínimo; pujas superadas reclamables por *pull payments* |
| B6 | Indexado de subastas | **Solo on-chain**: sin tablas nuevas ⇒ **no se tocan** `diccionario_datos.md`, `diagrama_er.md` ni `base_datos.sql` |
| C7 | projectId de WalletConnect | **Dejar solo preparado**: configuración, cableado de build, UI y pruebas listos; el conector seguirá desactivado hasta que exista un `projectId` real (sin validación de QR en móvil todavía) |
| C8 | Entorno Besu | **Solo contrato + aceptación**: se despliega y se ejecutan los `TC-ACC-*` con scripts; **no** se monta entorno web de preview |
| C9 | Faucet en Besu | **El de Codecrypto**: se oculta el `Faucet.sol` del proyecto (`NEXT_PUBLIC_FAUCET_ADDRESS` vacío) y se documenta cómo obtener ETH de prueba |

### Consecuencias sobre el plan

- **Punto 1** se implementa tal cual (§1.1, opción A), pero el redeploy es un hito aparte y **no** se ejecuta hasta la ventana acordada (A2).
- **Punto 2** se reduce a subasta primaria inglesa on-chain ⇒ cae el trabajo de reventa y todo el indexado off-chain; baja la estimación y **desaparece cualquier cambio de esquema**.
- **Punto 3** pasa de «activar WalletConnect» a **«dejarlo preparado»**: el entregable es la configuración documentada, el cableado en `.env.example`/Cloud Build y las pruebas; la aceptación con QR móvil queda **bloqueada por el `projectId`** y se marca como pendiente externo.
- **Punto 4** pasa de «preview aislado» a **contrato desplegado + aceptación con scripts**; no hay nuevos servicios Cloud Run. Depende del RPC de escritura y de la cuenta financiada de Codecrypto (el faucet lo pone Codecrypto).

### Único bloqueo externo para arrancar

Para C3 (Besu) hacen falta de Codecrypto: **RPC de escritura**, **cuenta de prueba financiada** (o instrucciones de su faucet) y **límites de gas**. Para C0 basta con decidir si algún día se dará de alta un `projectId`; el resto de C0 no depende de terceros.

---

*Con las 9 decisiones cerradas, C0 (WalletConnect preparado), C1 (royalty) y C3 (Besu) pueden arrancar de inmediato; C2 arranca tras C1.*

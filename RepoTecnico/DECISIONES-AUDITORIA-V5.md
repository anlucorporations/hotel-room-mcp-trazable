# Registro de decisiones — Auditoría V5

> **Fecha**: 2026-09-21
> **Origen**: entrevista secuencial (16 decisiones) sobre los hallazgos de `RepoTecnico/INFORME_OPTIMIZACION_V5.md`
> **Estado**: decisiones tomadas por el responsable del proyecto; pendientes de ejecución marcados abajo
> **Uso**: este documento es el borrador del registro de ADR acordado en la decisión D-14 y la entrada de las correcciones de PRD, SRS, PLAN y BACKLOG.

---

## 1. Resumen de decisiones

| ID | Decisión | Resuelve |
|----|----------|----------|
| D-01 | Red canónica: **Anvil local** (`http://127.0.0.1:8545`, `--chain-id 81234`, espejo de Besu) | H-01, D12 |
| D-02 | Contrato canónico: **`HotelNights.sol`**; `HotelNFT` + `HotelMarketplace` fuera del runtime | H-01 |
| D-03 | Se implementan las cuatro capacidades prometidas sin runtime (quema programada, push reales, cola BullMQ única con reconciliación, migraciones automáticas) | H-08 |
| D-04 | Autenticación canónica: **contraseña + TOTP obligatorio + JWT 15 min con rotación de refresh y blocklist en Redis**; SIWE fuera del camino crítico | H-04, H-05, H-06 |
| D-05 | Se extiende `HotelNights` con estado `checkedIn`, `markCheckedIn(tokenId)` y `RECEPTION_ROLE`, que bloquea además `list`/`buyResale` | H-05 |
| D-06 | Royalty **por tipo fijado en el mint e inmutable** (5 % simple y doble, 10 % suite); incluye **suelo de precio mínimo de listado** y **bloqueo de reventa en noches consumidas** | H-10 |
| D-07 | Compra: **flujos separados** — primaria en el catálogo, reventa en vista propia de mercado secundario; en cada uno la revisión construye el calldata que la firma envía sin reconstruirlo | H-02, D2 |
| D-08 | Verificación: se retiran las certificaciones no reproducibles, se escribe el **E2E on-chain real contra Anvil** con hashes y fallo duro, prueba de carga real con artefacto y **gates de CI bloqueantes** (cobertura 80 %, tests de web y E2E) | H-03, H-14 |
| D-09 | Datos: **todo unificado en PostgreSQL**; el worker abandona SQLite | H-11 |
| D-10 | Infraestructura de desarrollo: **PostgreSQL 18 local** (servicio ya activo) + **Redis nativo** | H-11 |
| D-11 | Se mantiene **todo** el alcance añadido: faucet en Anvil, WalletConnect v2, WCAG 2.1 AA verificable, Cloudflare/WAF y despliegue público, multisig 2-of-3 con custodia de claves y dictamen MiCA/fiscal como gate de mainnet | H-15 |
| D-12 | Resiliencia: parámetros de cadena alineados a Anvil con Polygon como configuración de mainnet; listener cableado con heartbeat y alerta de silencio; monitor ampliado a cadena y saldo de gas. **No** se instala Sentry ni se implementa failover multi-RPC (se retiran esas afirmaciones) | H-09, H-12 |
| D-13 | Registro de viajeros **fuera de la plataforma** (PMS/mostrador); se retira la simulación de ficha policial y la ruta deja de aceptar y devolver DNI y nombre | H-13 |
| D-14 | Privacidad: **minimización de PII** al mínimo técnico y **reescritura de Privacidad y Términos** conforme al sistema real | H-13, H-22 |
| D-15 | Documentación: se crea el **registro de ADR** con estas decisiones y se limpian/redirigen las referencias huérfanas del código | H-16 |
| D-16 | Dashboard: se **implementan las gráficas prometidas** (serie mensual, desglose por tipo y ranking de más revendidas) | H-18, D9 |
| D-17 | Respuesta al cliente: se redacta **borrador con supuestos explícitos** (coste, fecha, mantenimiento, necesidades) para validación del responsable | H-07 |

> Numeración: D-01…D-17 (17 entradas porque D-06 agrupa las tres protecciones económicas decididas en la misma pregunta).

---

## 2. Detalle y consecuencias

### D-01 / D-02 · Red y contrato canónicos
**Decisión.** Anvil local en `127.0.0.1:8545` con `--chain-id 81234` (espejo de la Besu de Codecrypto) y `HotelNights.sol` como único contrato del runtime. La generación `HotelNFT` + `HotelMarketplace` queda fuera del camino de ejecución y se aparta a `legacy/`.

**Consecuencias.**
- `packages/shared/src/constants.ts` ya refleja esta elección (`CHAIN_ID = 81234`); `.env.example` no (sigue en 31337) y debe corregirse.
- Hay que escribir el `Deploy.s.sol` de `HotelNights` (no existe), arreglar `scripts/sync-deployment.ts` (busca un artefacto que el script actual nunca produce) y generar `deployments/81234.json` conforme a `deployments/schema.ts`.
- `packages/contracts/test/AmoyLifecycle.t.sol` y `scripts/e2e/amoy-lifecycle.ts` pierden sentido como «Amoy» y se reescriben contra Anvil (ver D-08).
- El lanzamiento en Polygon pasa a ser una fase posterior, con su coste y su dictamen (ver D-11). Esto debe comunicarse al cliente (ver D-17).

### D-03 · Capacidades prometidas sin runtime
**Decisión.** Se implementan las cuatro: quema programada a las 12:00 `Europe/Madrid` con lock, alerta de gas < 5 POL y `burnExpired` por lotes; notificaciones push reales con opt-in/opt-out; cola única BullMQ con `jobId` determinista y cron de reconciliación de `PENDING`; y `runMigrations` en el arranque o el despliegue.

**Consecuencias.** El worker necesita un planificador y el consumidor de la cola (hoy `createWorker` no se invoca en ningún sitio). BullMQ, el lock y la blocklist de JWT exigen Redis levantado (D-10). La UI de push necesita `service worker` y claves VAPID válidas (la actual del repo contiene un espacio y es inválida).

### D-04 · Autenticación y autorización
**Decisión.** Un solo sistema: contraseña + TOTP obligatorio + JWT de 15 minutos con rotación de refresh y blocklist en Redis, usuarios y semillas TOTP persistidos en base de datos. Toda ruta de `/api/admin/*` y `/api/reception/*` valida JWT **y** rol. SIWE sale del camino crítico.

**Consecuencias.**
- Se eliminan las credenciales y secretos embebidos (`SYSTEM_USERS` con contraseñas en claro, `JWT_SECRET`, `TICKET_SIGNING_SECRET`, `CHECKIN_SECRET_KEY`, `ADMIN_MFA_SECRET`, `VAPID_PRIVATE_KEY`) y se aplica `fail-fast` sin *fallbacks*; test guardián que impida su reaparición.
- Los endpoints `login`, `mfa/verify`, `mfa/setup`, `refresh` y `logout` deben cablearse a un cliente real (hoy ninguno los llama) y `mfa/setup` debe persistir la semilla (hoy la genera y la descarta).
- Pendiente de confirmar: si las rutas y componentes de SIWE se eliminan por completo o se conservan como alternativa documentada. **Acción propuesta**: eliminarlas del camino crítico y documentar su retirada.

### D-05 · Check-in
**Decisión.** `HotelNights` incorpora estado `checkedIn` por token, `markCheckedIn(tokenId)` con nuevo `RECEPTION_ROLE`, y bloquea `list` y `buyResale` en noches consumidas.

**Consecuencias.** Cambia la superficie del contrato (ABI), obliga a ampliar las suites Foundry y a regenerar ABIs; exige hot-wallet con rol y cola secuencial de nonces para evitar colisiones en check-ins concurrentes. Sustituye al `markCheckedIn` de `HotelNFT`, que no existe en el contrato canónico.

### D-06 · Economía de la reventa
**Decisión.** Royalty fijado en el mint según tipo (5 % simple y doble, 10 % suite) e inmutable para los tokens ya vendidos; suelo de precio mínimo de listado gobernado por administración; bloqueo de `list`/`buyResale` en noches consumidas.

**Consecuencias.** Desaparece el parámetro global de royalty del back-office (la pantalla pasa a informativa). El PRD deja de ser «royalty global configurable» y pasa a «royalty por tipo inmutable». Hay que añadir pruebas de evasión (listado a precio simbólico) y de inmutabilidad tras la venta.

### D-07 · Compra y reventa
**Decisión.** Primaria en el catálogo y reventa en una vista propia de mercado secundario. En cada flujo, la revisión construye el calldata y la firma envía **ese mismo objeto**; se elimina el uso de `hotelMarketplaceAbi` y `marketplaceAddress` en la compra.

**Consecuencias.** El catálogo deja de mostrar ofertas de reventa: hay que corregir RF-01 y añadir el requisito de la vista secundaria. Se añaden dos pruebas: equivalencia byte a byte del calldata verificado y firmado, y guardián que falle si la dirección de compra resuelve a la del NFT.

### D-08 · Verificación y gates
**Decisión.** Se retiran las certificaciones no reproducibles; E2E on-chain real contra Anvil con hashes y fallo duro si el RPC no responde; prueba de carga real con artefacto; gates de CI bloqueantes (cobertura 80 %, tests de web, E2E).

**Consecuencias.** `docs/PERFORMANCE-REPORT.md` se marca como no válido y se regenera. `.gitlab-ci.yml` pierde los `|| true` y el `allow_failure`. La causa de los 36 fallos del worker (`better-sqlite3`) desaparece al unificar en PostgreSQL (D-09), pero hay que fijar la versión de Node o el runner para que el job sea verde de verdad. k6 no está instalado en la máquina actual (**pendiente**).

### D-09 / D-10 · Datos e infraestructura
**Decisión.** PostgreSQL como única persistencia (checkpoints y agregados del worker incluidos) y, en desarrollo, el PostgreSQL 18 ya activo en el puerto 5432 más Redis nativo.

**Consecuencias.** Hay que migrar los dos ficheros SQLite a tablas PostgreSQL y retirar `better-sqlite3`. El PRD habla de PostgreSQL 16 y el entorno tiene 18: **acción propuesta** actualizar la versión en la documentación. **Pendiente bloqueante**: contraseña del superusuario `postgres` (o creación manual del rol `hotel_admin` y la base `hotel_nft_dev`) y la instalación de Redis.

### D-11 · Alcance añadido
**Decisión.** Se mantiene todo: faucet en Anvil, WalletConnect v2, WCAG 2.1 AA verificable, Cloudflare/WAF y despliegue público, multisig 2-of-3 con custodia de claves y dictamen MiCA/fiscal como gate de mainnet.

**Consecuencias.** El alcance crece por encima de lo pedido en el brief y afecta a plazo y coste (ver D-17). Requiere: proyecto en WalletConnect Cloud (**pendiente**), corrección de los tests de accesibilidad que validan colores inexistentes en el preset real, y renegociación con el cliente de los dos firmantes de la multisig y de la custodia de claves. Se mantiene la fecha de junio como no alcanzable.

### D-12 · Resiliencia y observabilidad
**Decisión.** Parámetros de cadena alineados a Anvil (1 confirmación por finalidad inmediata, chunks de 5.000) conservando los valores de Polygon como configuración documentada de mainnet; `EventListenerService` cableado al runtime con heartbeat y alerta de silencio; monitor ampliado a cadena y saldo de gas. **No** se instala Sentry ni se implementa failover multi-RPC: se retiran esas afirmaciones de README y SRS.

**Consecuencias.** El SRS §6 se reescribe; `RPC_FALLBACK_URL` deja de figurar como requisito implementado. El logging estructurado existente pasa a ser la única observabilidad de errores declarada.

### D-13 / D-14 · Privacidad y textos legales
**Decisión.** El registro de viajeros (RD 933/2021) se cumple en el PMS/mostrador del hotel, fuera de la plataforma; se retira la generación simulada de ficha policial y la ruta de sincronización deja de aceptar y devolver DNI y nombre, quedando protegida con `RECEPTION_ROLE` y MFA. Se minimiza la PII (sin IP ni *user agent* en claro, notificaciones con lo imprescindible y purga por plazo, claves push con consentimiento y opt-out) y se reescriben Privacidad y Términos.

**Consecuencias.** Cambia el esquema (`admin_sessions`, `email_notifications`), el adaptador PMS y `COMPLIANCE.md`, que hoy afirma que no se recogen identificadores personales.

### D-15 · Documentación
**Decisión.** Se crea el registro de ADR con estas decisiones y se limpian o redirigen las referencias huérfanas del código.

**Referencias huérfanas detectadas y destino propuesto** (a aplicar al limpiar el código):

| Referencia | Significado observado en el código | Destino |
|---|---|---|
| `DISEÑO-TECNICO §…` | umbrales, red, registro de despliegues | `ADR` correspondiente + PRD/SRS |
| `CASOS-DE-USO §2/§3/§4` | eventos canónicos, errores, máquina de estados | SRS §3 y §6 |
| `CU-01`…`CU-17` | casos de uso citados en comentarios | RF del PRD o ADR |
| `ADR-01/17` | red Besu/Anvil | D-01 |
| `ADR-06` | bootstrap de roles y revocación del deployer | D-04 y guion de despliegue |
| `ADR-08` | expiración y validación de calendario UTC | SRS §3 |
| `ADR-09` | fuente única del bloque de despliegue | D-02 |
| `ADR-11` | «nunca se firma una tx no verificada» | D-07 |
| `ADR-13` | faucet de pruebas | D-11 |
| `ADR-15` | pull payments | SRS §3 |
| `ADR-16` | `soldOnce` | SRS §3 |
| `RF-18a`, `RF-21` | maestro de habitaciones, faucet | PRD (RF nuevos o nota de origen) |

### D-16 · Dashboard
**Decisión.** Se implementan las gráficas prometidas: serie mensual, desglose por tipo de habitación y ranking de más revendidas, con librería de gráficos y agregados en PostgreSQL.

**Consecuencias.** `DashboardAggregates` necesita serie temporal y ranking; el worker debe calcularlos en PostgreSQL (D-09).

### D-17 · Respuesta al cliente
**Decisión.** Se redacta un borrador de respuesta con supuestos explícitos (esfuerzo y coste por bloque, fecha realista, coste mensual desglosado y lista de lo que se necesita de Carlos) para que el responsable corrija las cifras. **Entregable**: `docs/RESPUESTA-CLIENTE-BORRADOR.md`.

**Consecuencias.** Debe incluir explícitamente que la red canónica actual es local/privada y que el lanzamiento en Polygon es una fase posterior sujeta a dictamen (D-01, D-11), y que junio no es alcanzable con el alcance finalmente aceptado.

---

## 3. Pendientes de ejecución (bloqueantes y dependencias)

| # | Pendiente | Bloquea | Responsable |
|---|-----------|---------|-------------|
| P-1 | Contraseña del superusuario `postgres`, o creación manual del rol `hotel_admin` y la base `hotel_nft_dev` | D-09, D-10 y toda la verificación contra PostgreSQL | Cliente del entorno |
| P-2 | Instalar Redis nativo (winget o Chocolatey) | D-03 (cola y lock), D-04 (blocklist y rate limiting) | Entorno |
| P-3 | Instalar k6 | D-08 (prueba de carga con artefacto) | Entorno |
| P-4 | Proyecto en WalletConnect Cloud (project id) | D-11 | Responsable del proyecto |
| P-5 | Fotos definitivas de los tres tipos de habitación | Catálogo y metadatos (hoy hay SVG de relleno) | Cliente (Carlos aportó 3 fotos en el brief) |
| P-6 | Credenciales/certificado del PMS y decisión sobre SES.HOSPEDAJES | D-13 | Cliente |
| P-7 | Dos firmantes adicionales para la multisig y política de custodia de claves | D-11, D-17 | Cliente |
| P-8 | Confirmación de si SIWE se elimina por completo | D-04 | Responsable del proyecto |
| P-9 | Confirmar la versión de PostgreSQL que se declara en la documentación (16 frente a 18 local) | D-09, D-10 | Responsable del proyecto |

---

## 4. Hallazgos que quedan abiertos tras las decisiones

| Hallazgo | Estado tras la entrevista |
|---|---|
| H-17 (mismo criterio con tres valores; umbrales sin verificación ejecutable) | **Parcialmente resuelto** por D-08 y D-12. Queda alinear los umbrales del PRD que no tienen instrumento de medida (LCP, «tiempo real», «estado vacío amigable») o retirarlos. |
| H-19 (`.env.example` inservible) | **Sin decisión específica**: es trabajo de ejecución derivado de D-01, D-03, D-04, D-09 y D-10. |
| H-20 (MiCA certificado sin dictamen) | **Diferido por decisión**: D-11 lo mantiene como gate de mainnet, así que deja de ser un defecto del MVP y pasa a condición de la fase pública. |
| H-21 (WCAG medido contra colores inexistentes) | **Resuelto en su vía** por D-11 (objetivo verificable sobre la paleta real); queda corregir los tests. |
| H-22 (información al usuario y textos legales) | **Resuelto en su vía** por D-14. |
| H-01…H-16 | Con decisión tomada; pendientes de implementación. |

---

## 5. Orden de ejecución propuesto

1. **Entorno**: P-1, P-2, P-3 (sin esto no hay verificación posible).
2. **Contrato**: D-02, D-05, D-06 y su `Deploy.s.sol`, con las suites Foundry ampliadas.
3. **Datos**: D-09 (migración de SQLite a PostgreSQL) y migraciones automáticas de D-03.
4. **Seguridad**: D-04 completo (persistencia de usuarios y semillas, cableado de endpoints, guards en rutas, borrado de secretos).
5. **Compra y reventa**: D-07 con sus pruebas guardianas.
6. **Capacidades sin runtime**: D-03 (quema, push, cola) y D-12 (listener y monitor).
7. **Dashboard y accesibilidad**: D-16 y D-11.
8. **Documentación**: D-15 (ADR y limpieza de referencias) y corrección de PRD/SRS/PLAN/BACKLOG según todas las decisiones.
9. **Verificación y entrega**: D-08 (E2E real, carga, gates) y D-17 (respuesta al cliente).

---

## 6. Endurecimiento del contrato (2026-09-21)

Tres decisiones tomadas al cerrar M2, ya implementadas y verificadas con 146 pruebas Foundry en verde:

| ID | Decisión | Resuelve |
|----|----------|----------|
| D-18 | **markCheckedIn exige venta primaria previa** (nuevo error NightNotSold). El check-in acredita el consumo de una noche vendida; marcar inventario del hotel lo dejaría invendible para siempre, porque el marcado es irreversible | H-05 |
| D-19 | **El suelo de precio de reventa no puede ser 0** (setMinListingPrice revierte con InvalidPrice): un suelo nulo desactivaría con una transacción la protección anti-elusión de royalties que el propio suelo existe para dar | H-10 |
| D-20 | **Eliminado el segundo argumento del constructor** (los bps de royalty sin efecto desde D-06). Era una trampa para quien leyera el despliegue; con el ABI regenerándose automáticamente, limpiarlo era barato. El constructor recibe solo 	reasury_ | H-10, D-06 |

**Consecuencia de D-18**: el guard que añadió el orquestador en uy (bloquear la compra primaria de una noche consumida) queda como **defensa en profundidad**: con el requisito de venta previa, esa combinación ya no puede darse. Se conserva por si en el futuro se relaja markCheckedIn.

**Pendiente inmediato derivado**: el contrato desplegado en el Anvil que está en marcha corresponde a la versión **anterior** a estos tres cambios. Hay que redesplegar (y resincronizar el registro) cuando no haya verificaciones en vuelo: reiniciar Anvil mantiene la dirección determinista  x5FbD…aa3, redesplegar sin reiniciarlo crearía una dirección nueva en el nonce siguiente.

---

*Documento de decisiones derivado de `RepoTecnico/INFORME_OPTIMIZACION_V5.md` · pendiente de volcar al registro de ADR (`D-15`).*

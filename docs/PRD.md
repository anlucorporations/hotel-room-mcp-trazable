# PRD — Hotel Marina del Sol: Plataforma de noches tokenizadas

> **Versión**: 2.0.0 (reescritura completa; sustituye a la v1.1.0)
> **Fecha**: 2026-09-23 · **Hito**: M9 (documentación y entrega) · **Decisión de origen**: D-15
> **Cliente**: Carlos Martínez — Hotel Marina del Sol, Alicante
> **Proyecto**: `hotel-room-mcp-trazable`
> **Normativo de decisiones**: [`docs/adr/`](adr/README.md) · **Especificación técnica**: [`docs/SRS.md`](SRS.md)
> **Origen de requisitos**: [`docs/BRIEF-CLIENTE-INICIAL.md`](BRIEF-CLIENTE-INICIAL.md) y [`RepoTecnico/requerimientos.md`](../RepoTecnico/requerimientos.md)

## 0. Qué cambia respecto a la versión 1.1.0

La v1.1.0 describía un producto que **no es el que se ejecuta**: Polygon como red de producción del MVP, la
pareja de contratos `HotelNFT` + `HotelMarketplace`, cuatro roles, Sentry, failover multi-RPC, «certificación
WCAG» medida contra colores inexistentes y `checkInSecret` off-chain. La auditoría V5 lo declaró **NO CUMPLE**
(22 hallazgos, 7 críticos) y las **20 decisiones** de `RepoTecnico/DECISIONES-AUDITORIA-V5.md` fijaron el rumbo.

Esta versión describe **el sistema real**: una red local (Anvil, `chainId 81234`), **un solo contrato**
(`HotelNights`), **un solo acceso** (contraseña + TOTP + JWT), **una sola base de datos** (PostgreSQL) y
verificación reproducible con artefacto. Todo lo que aquí se afirma como **OK** está medido por una prueba
o una ejecución citada; lo que no lo está, dice **Pendiente** o **Fase posterior** con su motivo.

**Convenciones** (las mismas en todo el proyecto):

| Marca | Significado |
|---|---|
| **CLI** | Pedido por el cliente en el brief |
| **ANA** | Añadido por el análisis, necesario para cumplir un deseo del cliente |
| **EXT** | Añadido sin base en el brief, mantenido por decisión explícita (D-11) |
| **TEC** | Requisito técnico derivado de una decisión |
| **OK** | Implementado, cableado y verificado |
| **PAR** | Parcial: existe, pero incompleto o con deuda declarada |
| **Fase posterior** | Fuera del alcance entregado, con condición para activarlo |

## 1. Visión del producto

Cada noche de cada habitación del hotel es un **token único ERC-721** (`HotelNights`). El cliente la compra
desde la web del hotel pagando con su propia wallet —sin intermediarios— y, si no puede viajar, la **revende
en el mercado secundario del hotel**, donde el royalty queda para el establecimiento.

### Objetivos de negocio

1. **Reducir la ocupación vacía** en temporada baja con venta anticipada tokenizada.
2. **Ingreso pasivo por royalties** en cada reventa: **5 %** en simple y doble, **10 %** en suite, fijados en
   el mint e inmutables (ADR-18).
3. **Liquidez para el comprador**: puede revender su noche en el mercado del hotel sin perder la inversión.

### Principios de diseño (no negociables)

- **El cliente firma exactamente lo que revisa.** Un único punto de firma que falla en cerrado si el destino
  no es el contrato canónico (ADR-11).
- **Lo que se promete, se mide.** Toda afirmación de calidad es reproducible desde el repositorio con su
  artefacto (ADR-23).
- **Nada de datos personales de viajeros.** El registro legal (RD 933/2021) se hace en el mostrador del hotel
  (ADR-20).
- **Nada de secretos en el código.** Si falta un secreto, el proceso **no arranca** (ADR-04).

## 2. Contexto del proyecto

| Campo | Valor |
|---|---|
| Hotel | Marina del Sol — Alicante, España |
| Habitaciones | **50**: 101–130 (planta baja) y 201–220 (primera planta) |
| Tipos | **Simple**, **Doble**, **Suite** (el maestro de habitaciones es la fuente única) |
| Idiomas | **ES / EN / RU** completo |
| Red canónica | **Anvil local** `http://127.0.0.1:8545`, `chainId 81234` (espejo de la Besu de laboratorio) |
| Contrato | **`HotelNights.sol`** (inmutable; singular) |
| Persistencia | **PostgreSQL** (única) · **Redis** para cola, locks y blocklist |
| Red pública | **Fase posterior**: Polygon PoS, con su coste, su presupuesto de gas y su dictamen MiCA/fiscal |

Detalle de entornos, puertos y variables: [`RepoTecnico/entornos_globales.md`](../RepoTecnico/entornos_globales.md).

## 3. Actores

| Actor | Tipo | Qué hace |
|---|---|---|
| **Propietario (Carlos)** | Interno, administración | Back-office con contraseña + TOTP: alta de inventario, pausa, fondos, royalty (informativo), noches caducadas, dashboard con gráficas y CSV. |
| **Comprador primario** | Externo | Compra una noche del catálogo con su wallet. **Compra anónima**: no se le piden datos personales. |
| **Comprador secundario** | Externo | Compra una reventa en `/reventa`, con el mismo punto de revisión y firma que el catálogo. |
| **Vendedor (portador)** | Externo | Lista su noche, la retira y cobra lo de sus reventas con `claim()`. |
| **Recepcionista** | Interno, operativo | Escanea el resguardo del huésped y ancla el check-in en la cadena. Sin esta ancla no hay check-in. |
| **Hot-wallet de recepción** | Sistema | Cuenta con `RECEPTION_ROLE` que firma `markCheckedIn` (singleton con cola de nonces). |
| **Bot de quema** | Sistema | Hot-wallet dedicada con `BURNER_ROLE`; quema desatendida a las 12:00 de la zona del hotel. |
| **Listener / worker** | Sistema | Escucha eventos on-chain, consolida el índice y los agregados, consume la cola de correo y vigila la cadena. |
| **MCP / asistente** | Sistema | Cuatro herramientas **read-only** contra `HotelNights` y preparación de la compra. **Nunca firma ni custodia claves.** |
| **Monitor** | Sistema | Vigila los `/health`, la viveza de la cadena y el saldo de gas, y avisa por su propio canal SMTP. |
| **Custodios multisig** | Gobernanza | Comité 2-of-3 (Gnosis Safe) para la gobernanza y los fondos. **Pendiente de que el cliente designe firmantes.** |

## 4. Requisitos funcionales

Origen y estado según las convenciones de §0. La columna **Verificación** cita dónde se comprueba.

| ID | Requisito | Origen | Estado | Verificación / deuda |
|---|---|---|---|---|
| **RF-01** | Catálogo público con foto, habitación, tipo, fecha y precio, en ES/EN/RU y usable en móvil | CLI | **OK** | `/` sirve la venta **primaria** y no mezcla reventas (D-07). Deuda: las fotos son provisionales hasta que lleguen las 3 definitivas (B-6). |
| **RF-02** | Filtros por fecha, precio, tipo y número de habitación, combinables y sin recarga | CLI | **OK** | `FilterBar` + filtrado en cliente sobre el catálogo servido. |
| **RF-03** | Back-office con alta de inventario, precio y foto, y aviso por correo al propietario | CLI | **OK** | Minteo on-chain real con re-confirmación TOTP (ADR-04) y aviso por la **cola única** (ADR-21). Las pantallas de personal leen `paused()`. |
| **RF-04** | Compra anónima con wallet (MetaMask y otras) | CLI | **OK** | Un solo destino y un solo camino de firma (ADR-11); WalletConnect v2 queda pendiente del *project id* del cliente (B-4). |
| **RF-05** | Notificación por correo al propietario tras cada venta y reventa | CLI | **OK** | `QueuedMailer` → fila `PENDING` + trabajo BullMQ; consumidor real y **reconciliación** de lo atascado (ADR-21). |
| **RF-06** | Reventa con royalties para el hotel | CLI | **OK** | Royalty por tipo **inmutable** (ADR-18) + suelo de precio anti-elusión (ADR-19) + transferencias directas bloqueadas (ADR-07). |
| **RF-07** | Resguardo QR de check-in con descarga en pantalla | CLI | **OK** | JWS con `jti` de un solo uso; los **tres** endpoints que emiten el pase exigen la firma EIP-712 del titular contra `ownerOf` on-chain (ADR-05). La superficie de compra existe: la tarjeta de «Mis noches» genera el resguardo, pinta el QR **en pantalla** y lo ofrece **descargable en PNG**, con el token en texto para el camino manual; `/checkin#ticket=…` es la pantalla que se enseña en recepción. Deuda: los pases Apple/Google son alcance D-11 y dependen de credenciales, y el envío por correo exige SMTP configurado. |
| **RF-08** | Validación del resguardo en recepción, sin doble uso | CLI | **OK** | Ancla on-chain obligatoria + consumo atómico del `jti` en Redis + cerrojo por noche: mismo resguardo dos veces → **409 `TICKET_YA_USADO`**; dos puestos a la vez → **409 `CHECKIN_EN_PROCESO`** (ADR-05). |
| **RF-09** | Dashboard del propietario con 7 métricas, gráficas y exportación CSV | CLI | **OK** | 7 KPIs + serie mensual, desglose por tipo y ranking de más revendidas (recharts) con tabla equivalente accesible; CSV con las tres secciones; cifras de la **fuente única** (ADR-25). La página comprueba la **validez** de la sesión antes de leer nada. |
| **RF-10** | Histórico público de ventas y reventas, paginado | CLI | **OK** | `/historico` y su CSV leen los agregados del worker (ADR-25). |
| **RF-11** | Quema automática de las noches no vendidas | CLI | **OK** | Planificador a las **12:00 de la zona del hotel** con cerrojo por día natural, `burnExpired` por lotes con simulación previa, espera del recibo y marcado **solo** de lo confirmado (ADR-21). |
| **RF-12** | Avisos push a navegadores suscritos, con opt-in y opt-out | CLI | **OK** | Cifrado `aes128gcm` (RFC 8291) + JWT VAPID ES256 (RFC 8292) con `node:crypto`; purga de suscripciones caducadas. Es *best-effort*: un fallo de push nunca bloquea una venta. |
| **RF-13** | Verificación de disponibilidad on-chain antes de cobrar | ANA | **OK** | La revisión construye y re-verifica el calldata; la simulación previa detecta el revert antes de firmar (ADR-11). |
| **RF-14** | Re-confirmación de doble factor en operaciones de alto impacto | ANA | **OK** | El minteo exige TOTP contra la semilla **cifrada del operador autenticado** (no un secreto de entorno). Deuda: el filtro de reventa propia (fecha/tipo/precio) sigue siendo del catálogo primario. |
| **RF-15** | Retiro de fondos por el vendedor de una reventa | ANA | **OK** | `claim()` con saldo leído por `pendingWithdrawals(address)` en el contrato canónico (ADR-15). |
| **RF-16** | Venta primaria en el catálogo y reventa en vista propia | ANA | **OK** | `/reventa` descarta los listados que el contrato rechazaría (noche consumida, fuera de ventana, listado inactivo) y nunca anuncia una compra que vaya a revertir. |
| **RF-17** | Registro de viajeros conforme al RD 933/2021 | EXT | **Fuera de la plataforma** | Se cumple en el PMS/mostrador del hotel; la ruta rechaza con **400** cualquier dato de filiación (ADR-20). |
| **RF-18** | Multisig de custodios para la gobernanza y los fondos | EXT | **Pendiente** | Gnosis Safe 2-of-3 en alcance (D-11); falta que el cliente designe los dos firmantes y la política de custodia (B-7). |
| **RF-18a** | Maestro de habitaciones como fuente única de tipos y números | ANA | **OK** | `RoomMaster.sol` + `domain/room-master.ts`; el royalty se deriva de aquí (ADR-18). |
| **RF-19** | Faucet de pruebas para demos en red local | EXT | **OK** | Solo se despliega con `DEPLOY_FAUCET=true` y solo en desarrollo (ADR-13). |
| **RF-20** | Chat conversacional que guíe la compra | CLI (deseo) | **PAR** | Cadena completa asistente → MCP → validación server-side independiente del LLM; el usuario confirma y firma. **Deuda**: el LLM es una dependencia externa de pago sin coste presupuestado; sin `ANTHROPIC_API_KEY` el asistente no funciona. |
| **RF-21** | Subastas para la suite | CLI (deseo) | **Fase posterior** | Diferido por decisión (D-11): fuera del alcance entregado. |
| **RF-22** | Metadatos en IPFS/Arweave | CLI (deseo) | **PAR** | `ipfs://` con CIDs reales y gateway/CDN propio (ADR-12); el *pinning* es manual. Arweave, fase posterior. |
| **RF-23** | Cumplimiento MiCA y fiscalidad antes de mainnet | EXT | **Fase posterior** | Gate de la fase pública: lo firma un abogado, no el equipo (D-11). |

## 5. Requisitos no funcionales (ISO 25010)

| ID | Categoría | Requisito | Estado real y medida |
|---|---|---|---|
| **RNF-01** | Rendimiento | LCP < 2,5 s en 4G móvil | **Sin medir**. No hay instrumento de medición de LCP en el repositorio; no se declara cumplido (H-17). |
| **RNF-02** | Rendimiento | Catálogo y filtros con respuesta ágil | **Medido por carga**: 50 usuarios concurrentes, 9.119 peticiones, **0 errores, p95 172 ms** (SLA declarado p95 < 500 ms). Con 200 concurrentes en una sola máquina **no** se cumple (31 % de *timeouts* por agotamiento del pool de la web): hallazgo declarado con sus números. |
| **RNF-03** | Rendimiento | Validación del resguardo en recepción | **Cumple**: < 500 ms de SLA; el E2E mide **~41 ms** en servidor con el ancla on-chain incluida. |
| **RNF-04** | Fiabilidad | Copia de seguridad y recuperación | **Cumple y medido**: `pnpm test:dr` hace `pg_dump`, **restaura de verdad** y compara tabla por tabla (6/6 tablas, 283 filas idénticas), **RTO 0,73 s**. Artefacto: `RepoTecnico/evidencias/dr-verify.json`. Deuda: el rol de la aplicación no tiene `CREATEDB`, así que la restauración se hace en un esquema de la misma base (declarado en el artefacto). |
| **RNF-05** | Escalabilidad | ≥ 200 usuarios concurrentes sin degradar | **No cumple en una sola máquina** y está medido: a 200 concurrentes, 974 errores de 3.114 peticiones (31 %), todos por *timeout* de 5 s al agotarse el pool de PostgreSQL de la web. Dos causas separadas: el generador compite con los servicios en la misma máquina y `DATABASE_POOL_MAX` no está dimensionado para 200 SSR simultáneos. Destino: operación (pool + caché de catálogo o capa CDN). |
| **RNF-06** | Seguridad | Doble factor obligatorio en back-office y recepción | **Cumple**: contraseña + TOTP obligatorio + JWT 15 min con rotación y blocklist; **401/403 en todas las rutas** `/api/admin/**` y `/api/reception/**` (ADR-04). |
| **RNF-07** | Seguridad | Contratos con pruebas unitarias, de integración e *invariantes* | **Cumple**: **13 suites y 125 pruebas Foundry en verde** (la generación legacy se retiró en M9), incluidas las de royalty, check-in, quema, reventa, roles, administración e invariantes. |
| **RNF-08** | Resiliencia | Multi-RPC con *failover* | **Retirado**: no existe y no se declara. Un solo RPC por componente (ADR-26). |
| **RNF-09** | Resiliencia | Cotización EUR con caché y respaldo | **PAR**: caché y respaldo funcionan, pero el respaldo es un factor fijo declarado que envejece (ADR-14). |
| **RNF-10** | Observabilidad | *Heartbeat* y alerta si la red se queda muda | **Cumple**: el listener emite *heartbeat*, dispara la **alerta de silencio** (una vez por episodio, rearmada al volver un bloque) por la cola única, y el monitor vigila viveza de cadena y saldo de gas avisando **al entrar en fallo** (ADR-26). |
| **RNF-11** | Privacidad | Compra anónima, sin datos personales | **Cumple**: sin datos de filiación, sin IP ni *user agent* en claro; push solo con consentimiento y con *opt-out* (ADR-24). |
| **RNF-12** | Cumplimiento | Registro de viajeros resuelto | **Fuera de la plataforma**: se hace en el mostrador; la obligación legal es del hotel (ADR-20). |
| **RNF-13** | Usabilidad | ES / EN / RU completos | **Cumple**: i18n real con los tres catálogos de mensajes. |
| **RNF-14** | Usabilidad | Diseño móvil primero | **PAR**: interfaz responsive y escaneo axe en proyectos `chromium` y `mobile`; no hay matriz de dispositivos físicos. |
| **RNF-15** | Accesibilidad | WCAG 2.1 AA verificable | **Cumple y medido sobre la paleta real**: la paleta que se mide es la del preset de Tailwind (igualdad comprobada), se escanean los `className` del producto (ningún color fuera de paleta, cada par texto/fondo ≥ 4.5:1 con el ratio **exacto**, sin redondear antes de comparar) y las gráficas llevan nombre accesible + tabla de datos. Escaneo con **axe en navegador real: 16/16 sin violaciones critical/serious** (8 rutas × 2 proyectos). Deuda: el escenario **con datos** (worker vivo y dashboard con sesión) no entra todavía en el escaneo. |
| **RNF-16** | Portabilidad | Distribución por CDN | **Fase posterior** (D-11): mantenido en alcance, sin implementar. |
| **RNF-17** | Mantenibilidad | Cobertura de pruebas ≥ 80 % | **No alcanzado, medido y con gate**: el pipeline ejecuta `test:coverage` con umbrales en **trinquete** (el valor medido, para que ninguna regresión pase) y publica lcov. Estado: `mcp` 93,97 %, `monitor` 91,12 %, `worker` 80,68 %, `shared` 79,61 %, **`web` 24,95 %** (falta todo el entorno DOM) → global 49,51 %. Detalle comando a comando en `RepoTecnico/cobertura.md`. |
| **RNF-18** | Mantenibilidad | Documentación coherente con el código | **Cumple a partir de M9**: PRD, SRS, plan y backlog reescritos contra el sistema real; **registro de ADR** creado y **cero referencias huérfanas** (`ADR-*`, `CU-*`, `DISEÑO*`, `REQUISITOS`) verificadas por guardián (ADR-15). |
| **RNF-19** | Seguridad | Ningún secreto ni credencial en el repositorio | **Cumple**: `requireSecret` falla en cerrado, los guardianes prohíben literales secretos y el token que estaba embebido en la URL del remoto se retiró. **Acción pendiente del responsable**: revocar y regenerar ese token (B-0) y rotar las claves del entorno compartido. |
| **RNF-20** | Observabilidad | Errores capturados y trazables | **Cumple como logging estructurado JSON**: Sentry está **retirado** por decisión y no se declara (ADR-26). |
| **RNF-21** | Verificabilidad | Toda afirmación de calidad reproducible desde el repositorio | **Cumple**: las tres certificaciones falsas se retiraron y se sustituyeron por mediciones con artefacto (carga, DR, E2E on-chain M4–M7, axe); el pipeline tiene gates bloqueantes sin `\|\| true` ni `allow_failure` (ADR-23). |

## 6. Requisitos técnicos

| ID | Requisito | Estado |
|---|---|---|
| **RT-01** | Red canónica Anvil local `chainId 81234` | **OK** (ADR-01, ADR-17) |
| **RT-02** | Contrato único `HotelNights` con `Deploy.s.sol`, `sync-deployment` y registro validado por esquema | **OK** (ADR-02, ADR-09) |
| **RT-03** | PostgreSQL como única persistencia (13 tablas; API y worker) | **OK** (ADR-03) |
| **RT-04** | Redis para cola, locks y blocklist | **OK** en este entorno (Memurai 4.1.2, Redis 7.2.5) y declarado como requisito de despliegue |
| **RT-05** | Migraciones incrementales aplicadas al arrancar | **OK** (ADR-03) |
| **RT-06** | Autenticación única: contraseña + TOTP + JWT con rotación | **OK** (ADR-04) |
| **RT-07** | Registro de ADR y limpieza de referencias huérfanas | **OK** en M9 (este documento + `docs/adr/`) |
| **RT-08** | `Dockerfile` e IaC del entorno de despliegue | **Pendiente** (fase pública): el `docker-compose.yml` del repositorio sigue desalineado (PostgreSQL 16 frente a 18 local) |
| **RT-09** | Pipeline con gates bloqueantes | **OK** (ADR-23) |
| **RT-10** | Prueba de carga real con artefacto | **OK** con el medidor propio (`pnpm test:load`); **k6** queda pendiente de instalación (B-3) |
| **RT-11** | Proyecto WalletConnect Cloud | **Pendiente del cliente** (B-4) |
| **RT-12** | Integración real con el PMS del hotel | **Pendiente del cliente** (B-5): el adaptador no simula nada y la ruta rechaza PII |

## 7. Trazabilidad

Cada requisito funcional tiene al menos un caso de uso, una historia de usuario y una prueba. La tabla
completa vive en [`docs/SRS.md`](SRS.md) §10; esta es la vista de negocio:

| Requisito | Historia | Caso de uso | Prueba de referencia |
|---|---|---|---|
| RF-01, RF-02 | US-12 | CU-04 | `FilterBar`, E2E carga del catálogo |
| RF-03 | US-04 | CU-02 | `HotelNights.mint.t.sol`, E2E M4 |
| RF-04, RF-13 | US-05 | CU-05 | `verifiedTxRequest.test.ts`, E2E M4 (calldata byte a byte) |
| RF-05 | US-08 | CU-10 | E2E M6 (sumidero SMTP local) |
| RF-06, RF-15 | US-06 | CU-06, CU-07 | `HotelNights.resale.t.sol`, E2E M4 |
| RF-07, RF-08 | US-07 | CU-08 | E2E M5 (mismo QR dos veces → 409) |
| RF-09 | US-14 | CU-11 | E2E M7 (SQL ↔ histórico por vía independiente) |
| RF-10 | US-10 | CU-09 | E2E M7, `/history` |
| RF-11 | US-09 | CU-13 | E2E M6 (quema por planificador con recibo) |
| RF-12 | US-18 | CU-17 | E2E M6 (descifrado independiente del push) |
| RF-14 | US-25 | CU-12 | E2E M7 (re-MFA en minteo) |
| RF-16 | US-16 | CU-06 | E2E M4, E2E M7 |
| RF-18a | US-02 | CU-02 | `RoomMaster`, `HotelNights.royalty.t.sol` |
| RF-19 | US-16 | CU-PR-02 | `Deploy.s.t.sol` (faucet opcional) |
| RF-20 | US-11 | CU-16 | `orchestrator.test.ts`, `validate-tx.test.ts` |

## 8. Criterios de aceptación globales

Un requisito no se declara terminado hasta que se cumple su criterio y **hay una ejecución que lo demuestra**:

1. El propietario da de alta inventario con doble factor y el token existe **de verdad** en la cadena.
2. El comprador firma **exactamente** la transacción que revisó y aprobó (calldata, importe y destino).
3. La reventa aplica el royalty por tipo, es inmutable y **no se puede eludir** con un precio simbólico.
4. Recepción valida el resguardo en menos de 3 s, el check-in queda **anclado en la cadena** y el mismo
   resguardo **no se puede usar dos veces** (ni desde dos puestos a la vez).
5. Las noches no vendidas se queman **sin intervención humana** y solo se marca lo que el recibo confirma.
6. El panel muestra ventas, royalties, serie mensual, desglose por tipo y ranking de más revendidas,
   excluyendo los eventos internos de alta, y **cuadra con el histórico**.
7. Toda ruta de administración y recepción rechaza el acceso sin sesión válida y sin el rol correspondiente.
8. Ninguna credencial, clave ni token está presente en el repositorio.
9. La plataforma **no almacena datos personales de viajeros**.
10. Todo resultado de calidad publicado es reproducible desde el repositorio **con su artefacto**.
11. `pnpm typecheck`, `pnpm test`, `pnpm lint` y el pipeline están en verde, con la cobertura medida y
    declarada (con su hueco y su trinquete, no con un 80 % fingido).
12. La documentación (PRD, SRS, plan, backlog y **ADR**) describe el sistema que realmente se ejecuta.

## 9. Fuera de alcance del MVP entregado

- **Subastas** de la suite (RF-21) y **metadatos en Arweave** (RF-22): segunda fase.
- **Lanzamiento público en Polygon**: fase posterior sujeta a coste de gas, despliegue real, verificación
  pública del contrato y **dictamen MiCA/fiscal firmado por un abogado**.
- **Registro de viajeros** en la plataforma (RF-17): se queda en el mostrador del hotel.
- **Sentry, failover multi-RPC y Cloud Logging**: retirados del alcance (ADR-26).
- **Pases Apple/Google Wallet** y **WalletConnect v2**: implementados en el camino, pero dependen de
  credenciales del cliente (B-4, pases) para funcionar de verdad.

## 10. Pendiente de confirmación del cliente

Estas decisiones **no** las puede tomar el equipo y condicionan precio, plazo o cumplimiento:

1. **Red**: quedarse en red privada (demostración completa) o saltar a Polygon (fase posterior con coste).
2. **Economía de la reventa**: confirmar el suelo de **0,01 ETH** y el royalty inmutable **5 % / 10 %**.
3. **Custodia**: quién guarda las claves y con qué política; designar los **dos firmantes** de la multisig.
4. **Fotos definitivas** de los tres tipos de habitación (hoy hay material provisional).
5. **PMS**: qué programa usa el hotel y si permite conectarse (o el registro sigue a mano).
6. **Fecha**: junio no es alcanzable con el alcance aceptado; hay que cerrar fecha o reducir por fases.

---

*PRD v2.0.0 · reescrito en M9 · cada afirmación de esta página tiene su prueba o su marca de deuda.*

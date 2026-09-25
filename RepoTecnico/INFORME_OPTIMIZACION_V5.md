# Informe de Optimización V5 — Hotel Marina del Sol

**Fecha:** 2026-09-21 · **Proyecto:** hotel-room-mcp-trazable (`C:\Users\lucci\MasterCodeCripto\GitLab\hotel-room-mcp-trazable`) · **Alcance:** contrastar la premisa de `docs/BRIEF-CLIENTE-INICIAL.md` contra `docs/PRD.md` y `docs/SRS.md` como especificación de referencia y contra el código implementado · **Comando:** `@audita` · **Lentes:** 7 dimensiones (R1 Ambigüedad/testabilidad, R2 Consistencia, R3 Completitud RNF ISO 25010, R4 Stakeholders, R5 Trazabilidad con el brief, R6 Riesgos técnicos, R7 Seguridad y legal) en 3 fases (revisión paralela, verificación adversarial, síntesis) · **Versión previa:** `RepoTecnico/auditoria_informe.md` («Auditoría Técnica v4», 23/23 hallazgos resueltos). No existe `INFORME_OPTIMIZACION_*.md` anterior: este es V5.

---

## 1. Resumen ejecutivo

**VEREDICTO A LA PREGUNTA «¿CUMPLE EL PROYECTO LA PREMISA DEL `BRIEF-CLIENTE-INICIAL.md`?»: NO CUMPLE.**

**Aptitud para producción: NO APTO** (ni para producción, ni para mainnet, ni para facturar un «MVP entregado»).

El sistema **no puede ejecutar de punta a punta ninguna de las cuatro promesas centrales del cliente** (minteo, venta, reventa con royalty, check-in sin doble uso), porque el contrato que despliega el único script de despliegue no es el que consume la aplicación, la transacción de compra se firma contra un contrato y un ABI distintos de los que el paso «Revisar» verifica, y el anclaje on-chain del check-in nunca se despacha. Sobre esa base se acumulan **certificaciones no reproducibles** (un «ciclo E2E certificado en Amoy» que no envía una sola transacción y un informe k6 contra un servidor mock que el propio runner levanta) y **secretos y credenciales de administración publicados en el repositorio**. Las métricas reales confirman el estado: `pnpm typecheck` pasa 6/6, `forge test` pasa 117/117, pero `pnpm test` del workspace está en **ROJO** (36 fallos del worker) y **nada se ha validado contra PostgreSQL 16 ni Redis 7 reales porque Docker no está disponible**. A esto se añade que **las cuatro preguntas explícitas del cliente** (coste, plazo de junio, mantenimiento mensual y qué más necesita) **siguen sin respuesta** en PRD, SRS, Plan y Backlog, mientras el código implementa extras que nadie pidió (faucet, multisig 2-of-3, RD 933/2021, MiCA, WCAG AA, CDN). Existe una capa moderna y correcta (SIWE con cookie HMAC y `fail-fast` real en `apps/web/src/lib/session.ts:18-26`, patrón CEI + `nonReentrant` en los contratos), pero no cubre las rutas críticas: el producto documentado y el producto ejecutado son **dos sistemas distintos**.

---

## 2. Tabla de trazabilidad BRIEF → PRD → SRS → código

Cada deseo del brief (64 líneas, leído íntegro) contrastado con PRD/SRS y con el runtime real. Estado: **IMPLEMENTADO** (existe y está cableado), **SOLO ESPECIFICADO** (documentado sin runtime), **DESVIADO** (existe otra cosa), **PERDIDO** (ni documentado ni construido de forma trazable).

| # | Deseo del brief (línea) | PRD / SRS | Código | Estado | Evidencia |
|---|---|---|---|---|---|
| D1 | Gestionar reservas de habitaciones con NFTs, tokenizar noches | PRD RF-01/02; SRS §3 | `HotelNights.sol` mint/buy; `AdminMint`; API `nfts` | **DESVIADO** | El contrato real (`HotelNights.sol`, chainId 81234) no es el especificado (`HotelNFT`+`HotelMarketplace`, Polygon 137/80002): `constants.ts:9-18` vs `PRD.md:30-31,220`, `SRS.md:63-67` |
| D2 | Poder revender con royalty para el hotel | PRD RF-06, royalty 5%/10%; SRS §3 | `useBuyNight.ts:22-34` (`buyResale`→`buy`), `useListNight.ts` | **DESVIADO** | La firma usa `hotelMarketplaceAbi` en `marketplaceAddress`; la reventa no ejecuta `buyResale` de `HotelNights` (`HotelNights.sol:178`) y `listForSale`/`cancelListing` no existen en el ABI |
| D3 | Aviso por email al propietario cuando se vende una noche | PRD RF-09/email <60 s; SRS §5 | `apps/worker/src/main.ts:59-66` (Nodemailer propio) | **IMPLEMENTADO** (parcial) | El worker envía con su mailer, fuera de la cola BullMQ documentada (`queue/notifications.ts:166-184` sin consumidor) |
| D4 | Check-in sin doble uso, verificación de titularidad | PRD RF-07 (`PRD.md:131,259`); SRS §4 (`SRS.md:480-496`) | `api/reception/checkin`, `api/qr/[tokenId]` | **DESVIADO** | Firma EIP-712 opcional, JWS de 7 días, sin guard de rol y sin `markCheckedIn` on-chain (`service.ts:130-133`) |
| D5 | Quemar automáticamente las habitaciones no vendidas | PRD RF-11 (`PRD.md:165-172`); SRS §3.3 | `burner/service.ts` sin scheduler; `AdminExpired.tsx:100` manual | **SOLO ESPECIFICADO** | `BurnerService` solo se instancia en su test (`burner.test.ts:35`); no existe cron en `apps/` |
| D6 | Avisos push (notificaciones) | PRD RF-12 | `push/service.ts:63-87` («Despacho simulado») | **SOLO ESPECIFICADO** | Stub sin llamadores fuera de `push.test.ts:59`; sin service worker en `apps/web` |
| D7 | Chat IA conversacional para el cliente | Brief `:16`; PRD RF-F2-01/02/03 (`PRD.md:186-190`) | `api/assistant/route.ts` (Anthropic + MCP local) | **DESVIADO** | Diferido a Fase 2 sin sprint ni fecha, pero el código sí implementa un asistente como dependencia externa de pago no aprovisionada (`ANTHROPIC_API_KEY`/`MCP_SHARED_SECRET` ausentes de `.env.example`) |
| D8 | Subastas tipo OpenSea con IPFS | Brief `:31,33`; PRD Fase 2 `:189-190` | No existe | **SOLO ESPECIFICADO** (limitación declarada) | Diferido explícitamente a post-MVP y formulado como opcional en el brief |
| D9 | Dashboard con «gráficas de qué meses van mejor» y detalle | PRD RF-09 (`PRD.md:138-147`) | `DashboardMetrics.tsx:45-71` (7 escalares) | **DESVIADO** | `DashboardAggregates` (`aggregates.ts:10-27`) no tiene serie temporal ni ranking; sin librería de gráficas |
| D10 | «Sin rollos con GDPR ni datos personales» | PRD `:89,249-251`; COMPLIANCE `:53-66` | `migrator.ts:57-104`, `pms-sync/route.ts:4-25` | **DESVIADO** | Se almacenan IP/UA (`admin_sessions`), correos (`email_notifications`), claves push; PMS público acepta y devuelve DNI/nombre |
| D11 | Aporta 3 fotos de habitación (simple/doble/suite) | PRD imágenes por tipo | `public/images/{simple,doble,suite}.svg` (placeholder) | **DESVIADO** | Los tipos reales de negocio son SIMPLE\|SUITE (`nfts.repository.ts:7,45`); «doble» colapsa a SIMPLE (`AdminMint.tsx:118`) y el filtro UI ofrece «doble» sin resultados (`FilterBar.tsx:38`) |
| D12 | Red barata (el sobrino propone Polygon), decisión abierta | PRD `:30-31,220,241` | `constants.ts:9-18` (Besu 81234) + `.env.example:13` (31337) | **PERDIDO** | Tres declaraciones de red distintas en el mismo repo; `HotelNights` no aparece en ningún `.md` y `Besu`/`81234` no aparecen en `docs/` |
| D13 | Soporte MetaMask y, si se puede, otras wallets | SRS `:17` («MetaMask / WalletConnect v2») | `providers.tsx:11` (`connectors: [injected()]`) | **DESVIADO** | WalletConnect v2 no existe; no figura en `apps/web/package.json` |
| D14 | Coste del gas y quién lo paga | Brief `:44`; PRD `:241` | Sin estimación | **PERDIDO** | El PRD invierte la pregunta («asumido íntegramente por el comprador») sin dar cifra mensual en POL |
| D15 | Plazo: «lo querría para junio» | Brief `:56` | Backlog 13 semanas/142 SP desde 2026-09 (`BACKLOG-SPRINTS.md:8`) | **PERDIDO** | Ninguna fecha de entrega ni declaración de si junio es alcanzable |
| D16 | Coste del proyecto y mantenimiento mensual | Brief `:55,57` | Sin sección de presupuesto | **PERDIDO** | `grep` de «coste\|presupuesto\|mantenimiento\|junio» en `docs/` sin coincidencias útiles |
| D17 | «¿Qué más necesitáis de mí?» | Brief `:58` | El repo pide comité 2-of-3 y custodia de claves (`PRD.md:44`, `SRS.md:412`) | **PERDIDO** | Se piden cosas al cliente sin devolverle la pregunta ni listar necesidades reales |

**Lectura de la tabla:** de 17 deseos identificables, **ninguno de los críticos (D1, D2, D4) es verificable de punta a punta**; 5 están perdidos (D12, D14-D17) y 7 desviados.

---

## 3. Requisitos de PRD/SRS inventados o sin base en el brief, y preguntas de Carlos sin responder

### 3.1 Requisitos añadidos sin pedido del cliente (ni constancia de aprobación)

| Requisito añadido | Dónde se fija | Impacto |
|---|---|---|
| Faucet de pruebas con rate-limit 24 h («RF-21 / CU-PR-01») | `constants.ts:56-64`; `BuyButton.tsx:151-158` | Alcance extra no cotizado; en producción no se despliega (`chain.ts:25-26`) |
| Multisig Gnosis Safe 2-of-3 con «comité de 3 firmantes (Carlos + 2 designados)» | `PRD.md:44`; `PLAN-CONSTRUCCION.md:44-50`; `GUIA-GNOSIS-SAFE.md` | Exige del cliente personas y custodia de claves que nunca aceptó |
| RD 933/2021 (registro presencial obligatorio) | `PRD.md:209`; `SRS.md:19` | Requisito legal real, pero no pedido en el brief y hoy simulado |
| MiCA / Modelo 172 con dictamen legal previo a mainnet | `PRD.md:251` | Bloqueante de cumplimiento sin dictamen en el repo |
| WCAG 2.1 nivel AA | `PRD.md:212`; `constants.ts:76` | Coste de accesibilidad autodeclarado sobre una paleta inexistente (`a11y.test.ts:8,10` vs `preset.cjs:29-32`) |
| CDN Cloudflare | `PRD.md:213` | Infraestructura extra sin presupuesto |
| WalletConnect v2 | `SRS.md:17` | Promesa de integración no construida |
| Cifrado AES del `checkInSecret` con clave propia | `mint/route.ts:10-21`; `jws.ts:63` | Complejidad criptográfica añadida con clave por defecto en el repo |

También se fija sin constancia de decisión el royalty exacto 5%/10% por tipo (`PRD.md:239-240`) frente al «lo decidimos» del brief (`:20`).

### 3.2 Preguntas de Carlos literalmente sin responder

1. **«¿Cuánto cuesta?»** — no hay propuesta económica ni rango con supuestos.
2. **«Lo querría para junio»** — no hay fecha comprometida ni declaración de inviabilidad; el único calendario es interno y arranca en septiembre.
3. **«¿Cuánto sale al mes de mantenimiento?»** — sin estimación de hosting, RPC, SMTP, dominio, Apple Developer ni gas del hotel.
4. **«¿Qué más necesitáis de mí?»** — sin lista de necesidades; en su lugar el repo le exige un comité de 3 firmantes y custodia de claves.

Además queda sin responder la pregunta técnica que el brief delega explícitamente (**«Decidme vosotros qué es mejor»**, `:26-27`): la decisión se resolvió en el código hacia una Besu privada de un tercero, sin acta ni documento normativo.

---

## 4. Metodología y estado de calidad

### 4.1 Proceso (3 fases, 7 lentes)

- **Fase 1 — Revisión paralela** con 7 lentes independientes: R1 Ambigüedad y testabilidad, R2 Consistencia, R3 Completitud RNF (ISO 25010), R4 Stakeholders, R5 Trazabilidad con el brief, R6 Riesgos técnicos, R7 Seguridad y legal.
- **Fase 2 — Verificación adversarial:** cada hallazgo se reprodujo contra `ruta:línea` con lectura y `grep`, se descartaron afirmaciones falsas o no confirmables al 100 % (regla: **ante la duda, se descarta**), se deduplicaron los que comparten causa raíz y se recalibraron severidades por comparación cruzada entre lentes.
- **Fase 3 — Síntesis (este informe):** deduplicación entre las 7 lentes, IDs únicos `H-01…` ordenados por severidad, veredicto y plan de acción.

### 4.2 Métricas reales medidas

| Verificación | Resultado | Detalle |
|---|---|---|
| `pnpm typecheck` | **6/6 tareas OK (exit 0)** | — |
| `forge test` (packages/contracts) | **14 suites, 117 tests passed, 0 failed (exit 0)** | 8 de las 14 suites cubren `HotelNights.*`; 3 cubren la generación no cableada |
| `pnpm test` (workspace) | **ROJO (exit 1)** | `@hotel/shared` 25 archivos/150 OK · `@hotel/web` 22/108 OK · `@hotel/mcp` 3/23 OK · `@hotel/monitor` 3/25 OK · `@hotel/contracts` 117 OK · **`@hotel/worker` 7 archivos, 36 FAILED / 17 passed (53)** por «Could not locate the bindings file» de `better-sqlite3` (módulo nativo sin compilar para Node 24 en Windows) |
| Infraestructura real | **NO validada** | **Docker NO disponible: PostgreSQL 16 y Redis 7 no se han podido levantar; nada validado contra infraestructura real** |
| Informe previo | No existe `INFORME_OPTIMIZACION_*.md` | El anterior es `RepoTecnico/auditoria_informe.md` («Auditoría Técnica v4», 23/23 hallazgos resueltos) |

### 4.3 Calidad verificable

`typecheck` y los tests de contrato están verdes, pero **la suite del workspace no lo está**, ni existe un gate que lo exija: cobertura con `|| true` y sin umbral frente al ≥80 % del DoD (`SRS.md:643-647`), `e2e` con `allow_failure: true` y `|| true` (`.gitlab-ci.yml:80-91`), sin jobs de `test:k6`, `test:dr` ni `test:e2e:amoy`, y sin `Dockerfile` ni IaC para la VM GCP que el Plan declara como mitigación del SPOF.

---

## 5. Tabla resumen de hallazgos por severidad

| ID | Severidad | Título | Área |
|---|---|---|---|
| H-01 | CRÍTICA | Dos generaciones coexisten sin puente: el runtime corre Besu 81234/`HotelNights` mientras PRD/SRS prometen Polygon 137/80002 con `HotelNFT`+`HotelMarketplace`; el registro de despliegues es inutilizable por incompatibilidad de esquema | Arquitectura / contratos y red |
| H-02 | CRÍTICA | La compra verifica una transacción distinta de la que firma: revisión con `hotelNightsAbi` contra `contractAddress`, firma con `hotelMarketplaceAbi.buy` contra `marketplaceAddress` (por defecto, la dirección del NFT) | Flujo de compra / Web3 |
| H-03 | CRÍTICA | Certificaciones fabricadas: el ciclo E2E en Amoy imprime OK sin enviar transacciones y el informe k6 certifica 200 VU/p95 185 ms contra un mock que el propio runner levanta | Verificación y certificaciones / CI |
| H-04 | CRÍTICA | Credenciales de admin/recepción y seis secretos críticos con valores por defecto publicados en el repositorio | Secretos y control de acceso |
| H-05 | CRÍTICA | Check-in sin autenticación: ticket JWS emitido para cualquier `tokenId` sin prueba de titularidad, y sin anclaje on-chain | Control de acceso / check-in |
| H-06 | CRÍTICA | `POST /api/admin/mint` y `GET /api/admin/metrics` sin sesión: inventario inexistente on-chain (txHash ficticio) y fuga de métricas financieras | Control de acceso / integridad del catálogo |
| H-07 | CRÍTICA | Las cuatro preguntas de Carlos (coste, plazo de junio, mantenimiento y qué necesita) siguen sin respuesta, y varios deseos del brief no están implementados ni marcados como pendientes | Trazabilidad con el brief |
| H-08 | ALTA | La quema automática, las notificaciones push y la cola BullMQ existen solo como código no invocado; migraciones nunca se ejecutan | Funcionalidad prometida sin runtime |
| H-09 | ALTA | La política anti-reorg y multi-RPC del SRS §6 no está implementada: 1 confirmación, chunks de 5.000 bloques, `EventListenerService` sin consumidor y sin RPC de respaldo | Resiliencia blockchain / sincronización |
| H-10 | ALTA | El contrato en uso no tiene suelo de precio anti-evasión y aplica un royalty global modificable hasta el 20 % frente al 5 %/10 % inmutable prometido | Smart contracts / royalties |
| H-11 | ALTA | Dos persistencia descoordinadas (API en PostgreSQL, worker con SQLite) y ninguna verificación contra PostgreSQL/Redis reales | Datos / persistencia |
| H-12 | ALTA | RNF de resiliencia y observabilidad especificados con métricas concretas, no construidos (sin Sentry real, sin failover, sin alerta de bloques) | Completitud RNF / observabilidad |
| H-13 | ALTA | Afirmaciones de privacidad y de cumplimiento RD 933/2021 no sostenidas por el código (PII almacenada; ficha policial «generada» sin remitirse) | Protección de datos / RGPD |
| H-14 | ALTA | No existe verificación de punta a punta contra infraestructura real y el CI no bloquea por los fallos del worker ni de la web | CI / calidad verificable |
| H-15 | ALTA | Requisitos añadidos sin base en el brief que consumen alcance y plazo sin aprobación registrada (faucet, 2-of-3, RD 933/2021, MiCA, WCAG AA, CDN) | Trazabilidad brief → requisito |
| H-16 | MEDIA | El código justifica umbrales y decisiones citando documentos inexistentes (`DISEÑO-TECNICO`, `CASOS-DE-USO`, `ADR-01..17`, `CU-01..17`, `RF-21`) | Documentación y trazabilidad interna |
| H-17 | MEDIA | El mismo criterio de aceptación tiene tres valores (3 / 32 / 1 confirmaciones) y los umbrales medibles no tienen verificación ejecutable | Ambigüedad y testabilidad |
| H-18 | MEDIA | RF-09 promete gráficas de ventas por mes, por tipo y ranking de reventas; el dashboard solo pinta 7 tarjetas escalares | Dashboard / trazabilidad |
| H-19 | MEDIA | `.env.example` no permite arrancar los componentes reales (cadena y variables de la generación antigua; faltan obligatorias de worker/MCP/monitor/web) | Documentación operativa / configuración |
| H-20 | MEDIA | El cumplimiento MiCA se certifica sin el dictamen exigido y las validaciones Amoy/k6 son simulaciones no trazables | Cumplimiento normativo / gates |
| H-21 | MEDIA | La «certificación WCAG 2.1 AA» se mide contra colores que no existen en el preset real; los informes de evidencia afirman resultados no reproducibles | Evidencia y veracidad documental |
| H-22 | MEDIA | La información publicada al usuario contradice el contrato (traspaso de wallet, red Besu vs Polygon) y los textos legales son borradores declarados | Información precontractual / consumo |

Sección 6 detalla las CRÍTICAS y ALTAS; las MEDIA quedan resumidas en la tabla y en el plan de acción (sección 9).

---

## 6. Hallazgos CRÍTICOS y ALTOS

### H-01 — CRÍTICA · Dos generaciones coexisten sin puente, y el registro de despliegues es inutilizable

**Evidencia.** El runtime (shared, web, worker, MCP) está cableado a la generación antigua: `packages/shared/src/constants.ts:9-16` (`CHAIN_ID=81234`, `NETWORK_NAME 'Codecrypto Besu'`, ETH), `packages/shared/src/network.ts:27-44` (failover «no es automático»), `apps/web/src/config/chain.ts:5-7,9,46,60-71`; la web importa `hotelNightsAbi` para mintear y comprar. PRD/SRS especifican Polygon 137/80002, `HotelNFT.sol` + `HotelMarketplace.sol`, 4 roles segregados y `markCheckedIn` (`PRD.md:30-31,220`; `SRS.md:63-66,29,85-88`). El único script de despliegue despliega la generación nueva y escribe claves `hotelNFT`/`hotelMarketplace` (`Deploy.s.sol:5-6,29-35,69-76`), mientras `sync-deployment.ts:15,57,78-87` busca el artefacto `out/HotelNights.sol/HotelNights.json` y una tx CREATE de contrato `HotelNights`; el registro valida `{address, abiHash}` que ninguno de los JSON escritos contiene (`schema.ts:7-11`). Consecuencia verificada: `tryReadDeployment(31337)` devuelve `null` (`deployments/index.ts:20-39`) y el worker arranca sin bloque de despliegue y avisa de catch-up desde génesis (`apps/worker/src/main.ts:32-44`); `80002.json` contiene direcciones `0x000…0` con `status READY_FOR_PIPELINE_EXECUTION` (certifica un despliegue inexistente) y no existe `81234.json`. El minteo del back-office escribe `txHashMint` sintético `` `0xmint_<Date.now()>_<tokenId>` `` sin transacción real (`api/admin/mint/route.ts:80,89-99`) y el panel intenta después un mint unitario con `hotelNightsAbi` contra la dirección de `HotelNFT` (`AdminMint.tsx:144-153`; `useMintNight.ts:22-27`), de modo que en lote solo se intenta acuñar la primera noche.

**Impacto sobre la promesa al cliente.** Nada de lo prometido (comprar, revender con royalty, check-in, quemar) puede funcionar de extremo a extremo: lo desplegable y lo consumible no coinciden. El catálogo sí publica las filas de BD (`nights.ts:111-134`), pero **esos tokens no existen on-chain y su compra revertirá**.

**Recomendación.** Congelar UNA generación antes de escribir otra línea: (a) decisión formal del cliente/PM sobre la red real; (b) si gana PRD/SRS, migrar abis/config/worker/mcp a `HotelNFT`+`HotelMarketplace` y mover `HotelNights`/`Faucet` a `legacy/`; (c) si gana Besu, reescribir PRD/SRS/PLAN §2 y el brief técnico; (d) unificar el esquema del registro (`Deploy.s.sol` + `sync-deployment.ts` + `schema.ts` con las MISMAS claves) y fallar en CI si el JSON no valida; (e) borrar `80002.json` con ceros y añadir un test que impida certificar direcciones `0x0`.

---

### H-02 — CRÍTICA · La compra verifica una transacción distinta de la que firma

**Evidencia.** El paso «Revisar» construye el calldata con `buildPurchaseTxData` usando `hotelNightsAbi` (`buy` para PRIMARY / `buyResale` para SECONDARY) apuntando a `contractAddress` (`purchase-tx.ts:8,35,41-44,60`; `usePurchaseReview.ts:63-72,74-86,114`), y el botón de firmar solo se habilita si `review.verified` es true. La firma real usa `useBuyNight` → `hotelMarketplaceAbi.buy` contra `marketplaceAddress` (`useBuyNight.ts:22-34`; `BuyButton.tsx:60-70,104,108-109`). Como `marketplaceAddress = NEXT_PUBLIC_MARKETPLACE_ADDRESS ?? contractAddress` (`chain.ts:9,13-17`) y el valor por defecto de `contractAddress` (`0x5FbDB2315678afecb367f032d93F642f64180aa3`) coincide con la dirección de `HotelNFT` del despliegue (`packages/shared/deployments/31337.json:5`), la transacción firmada llama a `buy` del marketplace **en la dirección del NFT**: revierte siempre salvo configuración manual correcta. El ABI del marketplace solo declara `buy(tokenId)`, sin `priceOf`/`listingOf` (`hotel-marketplace.ts:39-51`), mientras `hotelNightsAbi` sí los tiene (`hotel-nights.ts:197,210,371,533`). En reventa, el calldata firmado (`marketplace.buy`) difiere del verificado (`HotelNights.buyResale`). En ningún escenario se verifica la transacción que realmente se firma, lo que invalida la garantía declarada en `purchase-tx.ts:12-17` («nunca se firma una tx no verificada»).

**Impacto sobre la promesa al cliente.** La reventa con royalty —el motivo económico central del brief— no puede completarse desde el catálogo, y la verificación anti-manipulación (RNF-19/ADR-11) no cubre lo que el usuario firma.

**Recomendación.** Una sola fuente de verdad (ABI + dirección) para construir, revisar, verificar y firmar: la revisión debe construir el MISMO calldata que se envía y verificar contra el contrato/ABI efectivamente usados. Añadir dos tests: uno que compare byte a byte el calldata verificado con el firmado (incluido selector) y otro de integración que ejecute la compra real contra el despliegue vigente; más un test guardián que falle si `marketplaceAddress` resuelve a la dirección del NFT.

---

### H-03 — CRÍTICA · Certificaciones fabricadas (ciclo E2E Amoy y benchmark k6)

**Evidencia.** `scripts/e2e/amoy-lifecycle.ts:31-45` solo lee el saldo; si el nodo falla declara «Certificando ciclo E2E mediante suite on-chain Anvil/Polygon» y a continuación imprime seis líneas `OK` literales (minteo, listado, compra, QR, check-in, withdraw) sin firmar ninguna transacción: **certifica incluso en el camino de error del RPC**. `docs/PERFORMANCE-REPORT.md:5,15-16,22-38,44-46` certifica 200 VU, 18.450 peticiones y p95 185 ms, pero `scripts/load-tests/run-load-test.ts:9-10,17-40,42,101-103,116-124` no es k6: sin `TARGET_URL` levanta su propio servidor HTTP en `127.0.0.1:3009` con JSON canned y mide contra él, con `DURATION_SECONDS = 10` frente a los «10 minutos» del informe, sin artefacto k6. El pipeline no cubre la brecha: coverage con `|| true` sin umbral (`SRS.md:618-619,643-647` exige ≥80 %), e2e con `|| true` y `allow_failure: true` (`.gitlab-ci.yml:56-67,80-91`), y no existen jobs `test:k6`, `test:dr` ni `test:e2e:amoy`. Tampoco hay `Dockerfile` ni IaC para la VM GCP con systemd/Docker que el Plan declara como mitigación del SPOF (`PLAN-CONSTRUCCION.md:174-178`).

**Impacto sobre la promesa al cliente.** Carlos recibiría como evidencia de calidad cifras que el propio repo no puede producir. Es material para la pregunta central de esta auditoría: la documentación que debería acreditar el cumplimiento es precisamente la que contiene evidencia no reproducible.

**Recomendación.** (a) Retirar o marcar como NO VÁLIDAS las certificaciones no reproducibles y regenerarlas con k6 real (artefacto + resumen) y hashes de transacción enlazados; (b) hacer que el script E2E falle si el RPC no responde y quitar los `|| true`; (c) añadir jobs bloqueantes `test:k6`, `test:e2e:amoy`, `test:dr` y umbral de cobertura ≥80 %; (d) aprovisionar `Dockerfile`/compose e IaC antes de volver a hablar de despliegue.

---

### H-04 — CRÍTICA · Credenciales y seis secretos críticos publicados en el repositorio

**Evidencia.** `/api/auth/login` contiene `SYSTEM_USERS` con los dos únicos usuarios y sus hashes, con las contraseñas en claro en comentarios y aceptadas por comparación literal (`login/route.ts:10-21,57-63`); `/api/auth/mfa/verify` usa `'JBSWY3DPEHPK3PXP'` (semilla de ejemplo canónica) como valor por defecto y emite tokens con el rol del desafío (`mfa/verify/route.ts:10-13,60,90`); `/api/auth/mfa/setup` permite rotar el secreto TOTP del admin con ese token (`mfa/setup/route.ts:20-31`). Seis secretos caen a literales del repo: HS256 de tickets de check-in y de JWT (`jws.ts:16-18`; `auth/service.ts:9-11`), clave AES-256-GCM del `checkInSecret` (`jws.ts:63`; `listener.ts:64`; `mint/route.ts:13`), TOTP del minteo (`mint/route.ts:41`), VAPID (`push/service.ts:24-26`) y HMAC del on-ramp (`fiat-onramp/service.ts:40`). Ninguno figura en `.env.example` (que sí declara `AES_SECRET_KEY:43` y claves RS256 que ningún módulo usa). El back-office real funciona con SIWE (`useAdminSession.ts:74-109`), de modo que `/api/auth/*` es superficie heredada alcanzable, limitada solo por throttling perimetral sin autenticación (`middleware.ts:25-53`). El contraste interno demuestra que el patrón `fail-fast` se conocía: `apps/web/src/lib/session.ts:18-26` sí lanza error en producción si falta `SESSION_SECRET`.

**Impacto sobre la promesa al cliente.** Se puede fabricar un ticket JWS para cualquier `tokenId` sin llamar a la API, forjar un `accessToken` con `DEFAULT_ADMIN_ROLE`, descifrar los `checkInSecret` almacenados y calcular el TOTP que exige el minteo.

**Recomendación.** Borrar las credenciales y secretos embebidos; si `/api/auth/*` no se usa, eliminarlo; si se mantiene, cargar usuarios, hashes y semillas desde BD/gestor de secretos con `fail-fast` y sin comparación en claro. Aplicar `fail-fast` a `TICKET_SIGNING_SECRET`, `JWT_SECRET`, `CHECKIN_SECRET_KEY`, `ADMIN_MFA_SECRET`, `VAPID_PRIVATE_KEY`, `SESSION_SECRET`, el HMAC del on-ramp y el secreto del MCP; documentarlas en `.env.example`; reclavar los secretos ya cifrados. Test guardián que falle si reaparecen literales o la semilla `JBSWY3DPEHPK3PXP`.

---

### H-05 — CRÍTICA · Check-in sin autenticación ni titularidad, y sin anclaje on-chain

**Evidencia.** `GET /api/qr/[tokenId]` solo verifica EIP-712 si llegan las CUATRO cabeceras (`x-wallet-address`, `x-signature`, `x-nonce`, `x-expiresAt`); si no llegan, omite la verificación y emite un JWS válido 7 días sin comprobar `currentOwner` ni la fecha (`api/qr/[tokenId]/route.ts:42,66-78`), con el mismo patrón en `api/wallet/pass/[tokenId]/route.ts:61,86-98`. El `tokenId` es numérico y enumerable (`room·10^8+AAAAMMDD`, p. ej. `10120260915`; `token-id.ts:63-71`). `POST /api/reception/checkin`, `/checkin/contingency` y `/api/reception/pms-sync` no tienen guard de sesión ni MFA (`checkin/route.ts:7,15-25`; `contingency/route.ts:7,16-43`; `pms-sync/route.ts:4-25`); el middleware solo aplica rate-limit por IP (`middleware.ts:25-53`). `ReceptionService` se instancia con `new ReceptionService(nftsRepo)`, sin `publicClient`/`walletClient`/`nftContractAddress` (`service.ts:130-133`), por lo que `dispatchOnChainCheckIn` retorna `false` siempre y el `markCheckedIn` que PRD/SRS prometen no ocurre (`service.ts:156-165` usa además `hotelNftAbi`, función inexistente en `HotelNights`); la estancia se marca `CHECKED_IN` solo en BD (`nfts.repository.ts:311-320`) con el token aún transferible.

**Impacto sobre la promesa al cliente.** Cualquiera que enumere un `tokenId` obtiene el resguardo de la habitación de otro huésped y puede marcar su estancia como `CHECKED_IN` (dejando al titular legítimo sin poder acreditarse). El recepcionista se queda sin ninguna herramienta on-chain ante un resguardo clonado.

**Recomendación.** (a) Exigir autenticación `RECEPTION_ROLE` con MFA y rate limiting en las tres rutas de recepción; (b) hacer la firma EIP-712 OBLIGATORIA (401 si faltan cabeceras), comparar `guestWallet` con `currentOwner` y validar la ventana de estancia, acortando el TTL; (c) cablear un emisor on-chain real (hot-wallet con rol y cola secuencial de nonces) y no degradar en silencio: si `markCheckedIn` falla, alertar a recepción y bloquear el segundo uso también por log on-chain; (d) test E2E «mismo QR dos veces → segundo rechazado» y otro que verifique que un token `CHECKED_IN` no puede revenderse.

---

### H-06 — CRÍTICA · Endpoints de administración sin sesión: métricas abiertas e inventario inexistente on-chain

**Evidencia.** `GET /api/admin/metrics` no comprueba sesión ni rol y devuelve volumen primario/secundario, royalties, ocupación y exportación CSV (`metrics/route.ts:15-43`). `POST /api/admin/mint` solo exige `x-mfa-token` contra `ADMIN_MFA_SECRET` con fallback público `'JBSWY3DPEHPK3PXP'` (`mint/route.ts:40-56`), no exige sesión, no emite ninguna transacción y persiste `txHashMint` ficticio (`mint/route.ts:80,89-99`). Los únicos consumidores de `verifySession` son el layout del back-office y `/api/auth/session` (`session.ts:55`; `admin/layout.tsx:16`): ninguna ruta `/api/admin/*` ni `/api/reception/*` valida sesión. Atenuante verificado: el middleware aplica 30 req/min por IP y el lote se limita a 50 tokens, lo que acota el volumen pero no autentica.

**Impacto sobre la promesa al cliente.** Fuga de la contabilidad del hotel (volumen, royalties, ocupación) a cualquiera, y filas de catálogo «comprables» que no existen en la cadena. Contradice RF-03 y el criterio de aceptación global nº1 (`PRD.md:78-80,257`).

**Recomendación.** Exigir la cookie de sesión firmada más el rol on-chain en todo `/api/admin/*` y `/api/reception/*` (401/403 en su ausencia), reutilizando `verifySession` como ya hacen las páginas; eliminar los fallbacks de secreto; sustituir el minteo en BD por minteo on-chain real firmado por el relayer o marcar explícitamente las filas no ancladas y excluirlas de la tienda; proteger `/metrics` con rol de propietario y eliminar el CSV público; pruebas de integración de 401/403 y de que ninguna fila del catálogo carezca de token on-chain.

---

### H-07 — CRÍTICA · Las preguntas de Carlos siguen sin respuesta y varios deseos no están ni diferidos formalmente

**Evidencia.** Las cuatro preguntas explícitas del brief (`BRIEF:16,26-28,33,36-37,41-44,48,55-58`) no tienen respuesta en PRD, SRS, Plan ni Backlog: no hay sección de presupuesto, coste mensual ni fecha de entrega; «junio» solo aparece en el brief y en los mockups; el roadmap son 13 semanas / 142 SP fechado desde septiembre de 2026 (`BACKLOG-SPRINTS.md:8,26-43`), sin compromiso compatible con la temporada. Los dos deseos estrella (chat IA y subastas con IPFS) se difieren a Fase 2 (RF-F2-01/02/03, `PRD.md:186-190`) **sin sprint, responsable ni fecha**, y la matriz de trazabilidad no incluye ningún RF-F2-* (`BACKLOG-SPRINTS.md:327-357`). Paradójicamente el código sí implementa un asistente IA, como dependencia externa de pago no documentada ni aprovisionada (Anthropic `claude-sonnet-4-6` + MCP en `127.0.0.1:8788`; `assistant/route.ts:15-16,25-29,98-99,124-128`), con `ANTHROPIC_API_KEY`/`MCP_BASE_URL`/`MCP_SHARED_SECRET` ausentes de `.env.example:1-87` y rate limiter en memoria declarado «SINGLE-INSTANCE». Además PRD/SRS prometen MetaMask + WalletConnect v2 y el código solo registra `injected()` (`providers.tsx:9-12`), y el tipo «doble» del brief no existe extremo a extremo: repositorio y API aceptan solo `SIMPLE|SUITE` (`nfts.repository.ts:7,45`; `api/nfts/route.ts:14`; `mint/route.ts:25`), el panel colapsa doble→SIMPLE (`AdminMint.tsx:118`) y la UI ofrece un filtro «doble» que nunca devuelve resultados (`format.ts:83-87`; `FilterBar.tsx:38`), pese a que `RoomMaster.sol:19` marca las habitaciones 116-130 como «doble».

**Impacto sobre la promesa al cliente.** Sin precio, sin fecha y sin coste mensual no hay contrato posible; y la matriz del backlog no permite distinguir lo pedido de lo añadido ni lo construido de lo diferido.

**Recomendación.** Producir una **página de respuesta al cliente** que conteste literalmente las cuatro preguntas (rango de precio con supuestos; fecha comprometida o nueva fecha si junio no es alcanzable; coste mensual con hosting, RPC, SMTP, dominio, Apple Developer y gas del hotel en POL; lista concreta de lo que se necesita de él) e incorporarla como entrada del PRD. Crear sprints con SP y fecha para RF-F2-01/02/03 o acordar formalmente su exclusión. Documentar y aprovisionar la dependencia LLM (clave en gestor de secretos, coste, límite de gasto, fallback manual explícito) o retirarla del MVP. Implementar WalletConnect v2 o corregir PRD/SRS. Resolver el tipo «doble» extremo a extremo o retirarlo del brief y de la UI.

---

### H-08 — ALTA · Funcionalidad prometida que solo existe como código no invocado

**Evidencia.** `BurnerService` contiene la lógica de las 12:00 Europe/Madrid con Redlock y alerta de gas (`burner/service.ts:17,34-47,59,80,111`) pero **solo se instancia en su test** (`burner.test.ts:11,35`) y el worker no tiene ningún scheduler: la quema desatendida de RF-11 no existe en runtime; lo único operativo es un botón manual (`AdminExpired.tsx:100`). `WebPushService.broadcastNotification` es un stub que incrementa contadores («Despacho simulado», `push/service.ts:63-87`) sin llamadores fuera de su test, por lo que RF-12 no dispara ninguna notificación. Hay dos pipelines de correo inconexos: el worker envía los avisos de venta con su propio `NodemailerMailer` (`worker/main.ts:12,59-66`) mientras `NotificationQueueService` (BullMQ + tabla `email_notifications`) solo sirve el email efímero del QR; su `createWorker` (el consumidor) no se invoca en ningún sitio (`queue/notifications.ts:49-77,166-184`) y `reconcilePendingNotifications` solo lo llama su test (`:130`), así que los correos en `PENDING` nunca se envían ni se reconcilian (contradice SRS §6). `runMigrations` tampoco se invoca en ningún arranque de producción: solo desde `resetDatabase` (`migrator.ts:124,149-159`).

**Impacto.** El deseo literal «quemar las habitaciones que no se venden y que no me queden ahí colgadas» y los «avisos push» no ocurren; en un PostgreSQL nuevo faltarían las tablas que consulta la web.

**Recomendación.** Decidir por cada capacidad: implementarla o retirarla de los documentos. Burn: planificador real (BullMQ repeatable o cron del worker) con Redlock, alerta de saldo < 5 POL y `burnBatch` contra el contrato vigente. Push: integrar web-push/FCM real o retirar RF-12 y el toggle de UI. Correo: arrancar el consumidor BullMQ y unificar en una sola cola con `jobId` determinista más cron de reconciliación. Ejecutar `runMigrations` en el arranque/despliegue.

---

### H-09 — ALTA · La política anti-reorg y multi-RPC del SRS §6 no está implementada

**Evidencia.** SRS §6 exige 32 confirmaciones, chunking máximo de 2.000 bloques con backoff exponencial, heartbeat de 5.000 ms y alerta si no llegan `newHeads` en 10 minutos (`SRS.md:635-636`; `PLAN-CONSTRUCCION.md:120`). El código de producción usa `CONFIRMATIONS_N = 1` y `GETLOGS_MAX_RANGE = 5000`, justificados como «QBFT: finalidad inmediata» (`constants.ts:29-33`), consumidos en worker, web y MCP (`sale-processor.ts:2,181-183`; `types.ts:107-111`; `nights.ts:84`; `useMyNights.ts:45`; `viem-chain-reader.ts:11,61`). `EventListenerService` (que sí contiene heartbeat, reconciliación chunked y alertas) solo se instancia en su propio test: no tiene consumidor en runtime (`listener.ts:28`; único consumidor `listener.test.ts:4`). El worker hace polling cada 4.000 ms contra un único `RPC_URL` sin multi-transporte (`worker/config.ts:13,28`; `worker/main.ts:54-58`); `RPC_FALLBACK_URL` solo existe en `.env.example:15` sin consumidores.

**Impacto.** Si la red final es Polygon (lo que promete el brief), una venta asentada con 1 confirmación puede quedar invalidada por una reorg y el catálogo/dashboard mostrarían estado no consolidado; el aviso de venta por email —señal principal al propietario— queda expuesto.

**Recomendación.** Alinear código y SRS o reescribir el SRS: confirmaciones configurables (32 por defecto), chunking ≤2.000 con backoff, monitor de `newHeads` con alerta a `DEVOPS_ALERT_EMAIL` y transporte viem `fallback([RPC1, RPC2])` en worker/web/MCP; cablear `EventListenerService` o borrarlo y documentar el polling real. Test de reorganización y test de conmutación de RPC.

---

### H-10 — ALTA · Sin suelo de precio anti-evasión y con royalty global modificable hasta el 20 %

**Evidencia.** `HotelNights.list()` no impone precio mínimo de listado: solo exige owner, `soldOnce`, `price != 0` y no expirado (`HotelNights.sol:156-166`), de modo que un vendedor secundario puede listar a 1 wei y liquidar el resto por un canal privado off-chain, evadiendo el royalty. El `require priceInWei >= minListingPrice` solo existe en `HotelMarketplace.sol:23,55-57,91` —el contrato que el runtime no usa—, junto con el rechazo de listar noches ya marcadas como check-in (`:93-95`). El royalty efectivo es un único valor global por defecto del 10 % (`ROYALTY_DEFAULT_BPS`), común a simple/doble/suite y modificable por `ROYALTY_ADMIN_ROLE` hasta `ROYALTY_MAX_BPS = 2.000` bps (`HotelNights.sol:59,83-99,238-244`; `constants.ts:36-38`), expuesto en el back-office en `[0,2000]` (`AdminRoyalty.tsx:14-15,61`), cuando PRD/SRS prometen royalties «inmutables» del 5 % (simples/dobles) y 10 % (suite) con `royaltyInfo` por tipo (`PRD.md:110,239-240`; `SRS.md:229-235,266,270`).

**Impacto.** El hotel puede alterar unilateralmente la economía de NFTs ya vendidos (al alza) y no puede aplicar el 5 % prometido a simples y dobles; la mitigación de wash-trading que la auditoría v4 dio por resuelta no está en el contrato en uso.

**Recomendación.** Portar `minListingPrice` (y su gobernanza por `DEFAULT_ADMIN_ROLE`) al contrato realmente desplegado, junto con el bloqueo de listado tras check-in, o retirar la afirmación anti-evasión de PRD/SRS y del informe previo. Fijar el royalty por token en el mint según tipo (5 %/10 %) e impedir su aumento sobre tokens ya vendidos, o documentar explícitamente que es un parámetro global gobernado. Pruebas Foundry de evasión (listado a 1 wei) y de cambio de royalty post-venta.

---

### H-11 — ALTA · Dos persistencia descoordinadas y ninguna verificación contra infraestructura real

**Evidencia.** El API y `packages/shared` persisten en PostgreSQL mediante pool `pg` (`pool.ts:16-26`; `nfts.repository.ts:65-93,101-159`), pero el worker mantiene su propio estado en dos ficheros SQLite (`.data/worker.sqlite`, `.data/worker-aggregates.sqlite`; `worker/main.ts:8-9,23-25,50-53`) y es él quien sirve los agregados/histórico: el dashboard y el inventario del back-office no comparten fuente de verdad con SRS §5, que describe un esquema único PostgreSQL con pool máximo 20 (`SRS.md:63,618-619`), sin mención alguna de SQLite. Esa doble verdad no ha sido probada: Docker no está disponible, PostgreSQL 16 y Redis 7 nunca se han levantado y nada se ha validado contra infraestructura real.

**Impacto.** La elección de SQLite añade un SPOF de fichero local no descrito en la documentación y, en este entorno, **el propio módulo nativo no compila** (36 fallos del worker), dejando el pipeline de eventos sin verificar.

**Recomendación.** Unificar la persistencia en PostgreSQL (o justificar SQLite solo como caché reconstruible y documentarlo) con migraciones versionadas y arranque `fail-fast`; reparar el binding nativo de `better-sqlite3` (o sustituirlo por una alternativa prebuilt) para que `pnpm test` vuelva a verde; levantar PostgreSQL 16 + Redis 7 con el compose existente y ejecutar la suite de integración real, incluidos los health checks `/health/ready`.

---

### H-12 — ALTA · RNF de resiliencia y observabilidad especificados y no construidos

**Evidencia.** El SRS exige heartbeat con timeout de 5.000 ms, failover al RPC de respaldo tras 2 fallos, alerta si no hay bloques en 10 minutos y chunking de 2.000 bloques (`SRS.md:633-636`), con RNF-08 y RNF-10 en el PRD (`PRD.md:205,207`) y TASK-07.1/07.3 en el backlog (`BACKLOG-SPRINTS.md:159,165,167`). El código real usa un único transporte `http(options.rpcUrl)` (`worker/chain-source.ts:51-56`), polling de 4.000 ms (`worker/config.ts:28`) y `GETLOGS_MAX_RANGE = 5000` frente a 2.000 (`constants.ts:33`; `sale-processor.ts:181-183`; `aggregate-processor.ts:70`). No existe la dependencia Sentry en ningún `package.json`, aunque `SRS.md:57`, `README.md:144` y `implementation_SPRINT-0.md:19` la declaran instalada: solo hay un hook condicional sobre `globalThis.__SENTRY__` (`logger.ts:84-95`). El `apps/monitor` es real y tiene tests de umbral/recuperación, pero vigila `/health`, no la ausencia de bloques on-chain. Los servicios que implementarían listener y quemador son código muerto en runtime (H-08). Añadido: el rate limiter del asistente es en memoria y el propio código advierte que solo vale para instancia única (`assistant/route.ts:25-29`) mientras el SRS lo sitúa en Redis (`SRS.md:439`).

**Impacto.** Los RNF que el PRD usa como argumento de calidad frente al cliente no tienen instrumento de medida ni implementación.

**Recomendación.** Decisión explícita por requisito: implementar (transporte viem con `fallback`, confirmaciones y chunking configurables, alerta de silencio sobre `newHeads`, Sentry real, rate-limit distribuido) o degradar el RNF al valor real y documentar el riesgo aceptado por escrito. Añadir al worker un scheduler que invoque `BurnerService` y `EventListenerService` y un test que detecte módulos exportados sin consumidor en runtime.

---

### H-13 — ALTA · Privacidad y RD 933/2021 afirmados sin respaldo en el código

**Evidencia.** `COMPLIANCE.md:53-60,66` afirma que «No se recogen identificadores personales en base de datos», pero el esquema guarda `ip_address` y `user_agent` en `admin_sessions`, `recipient_email` en `email_notifications` y endpoint + claves `p256dh`/`auth` de las suscripciones push (`migrator.ts:57-67,83-94,96-104`, purga a 90 días en `:130-144`; `queue/notifications.ts:49-77`). `POST /api/reception/pms-sync` es público, acepta `guestName` y `documentNumber` (DNI/Pasaporte) y devuelve la «ficha policial» con documento, nombre y nacionalidad (`pms-sync/route.ts:4-25`; `pms/adapter.ts:16-26`). El adaptador PMS es MOCK: con el tipo por defecto «genera» el registro RD 933/2021 y responde `policeReportGenerated: true` sin comunicar nada a SES.HOSPEDAJES, y su rama de error afirma que el registro queda «retenido en cola local para reintento automático» sin persistir nada (`pms/adapter.ts:67-86,109-119`), mientras `PMS-INTEGRATION.md:24-26,43` describe el envío real. Alcance acotado honestamente: la compra es anónima (RF-04), la identificación presencial la impone el RD 933/2021 y el correo del resguardo no se persiste (flujo efímero verificado).

**Impacto.** El hotel podría creer que cumple una obligación legal sin cumplirla, y las afirmaciones publicadas de privacidad no se corresponden con lo que el sistema almacena.

**Recomendación.** Decidir y documentar la base jurídica real con minimización y plazos, o eliminar del esquema la PII no imprescindible; proteger `/api/reception/pms-sync` con rol de recepción y MFA, no devolver la ficha policial en la respuesta HTTP y cifrar en reposo los datos de viajero. Implementar la comunicación real a SES.HOSPEDAJES o marcar el adaptador como NO conforme, dejando de informar `policeReportGenerated: true` y de prometer cola persistente.

---

### H-14 — ALTA · Sin verificación punta a punta contra infraestructura real y CI que no bloquea

**Evidencia.** Estado real medido: `pnpm typecheck` 6/6 OK; `forge test` 14 suites / 117 tests OK; **`pnpm test` ROJO (exit 1)** con `@hotel/worker` 36 FAILED/17 passed por «Could not locate the bindings file» de `better-sqlite3`. El pipeline GitLab define lint, test (`pnpm test`), coverage (`forge coverage … || true`, sin umbral), slither bloqueante y e2e (`allow_failure: true` + `|| true`): los 36 fallos del worker romperían el job `test` en un entorno equivalente, la web no tiene job de tests propio y no existe job que ejecute los E2E de la web de forma bloqueante ni un test k6 real. Y **Docker NO disponible: PostgreSQL 16 y Redis 7 no se han podido levantar; nada validado contra infraestructura real**.

**Impacto.** Ninguna ruta crítica (mint → listado → compra → check-in) está verificada de punta a punta sobre Polygon ni contra PostgreSQL/Redis reales; las cifras de rendimiento y el «ciclo certificado» no son reproducibles por el repo y no deberían presentarse a Carlos como evidencia.

**Recomendación.** Arreglar la causa raíz de `better-sqlite3` en el runner (fijar versión de Node o compilar el binding) para que el job `test` sea verde de verdad; añadir job de tests de la web con umbral y un umbral mínimo en `coverage`; convertir el E2E en bloqueante cuando exista cadena local efímera; sustituir el simulador por k6 real contra staging, guardando el reporte como artefacto; levantar PostgreSQL 16 + Redis 7 y ejecutar la suite de integración.

---

### H-15 — ALTA · Requisitos añadidos sin base en el brief que consumen alcance y plazo

**Evidencia.** Ninguno de estos requisitos tiene origen en el brief ni consta aprobación de Carlos: faucet de pruebas con rate-limit 24 h (`constants.ts:56-64`; `BuyButton.tsx:151-158`); multisig Gnosis Safe 2-of-3 con «comité de 3 firmantes (Carlos + 2 designados)» (`PRD.md:44`; `PLAN-CONSTRUCCION.md:44-50`; `GUIA-GNOSIS-SAFE.md`); RD 933/2021 (`PRD.md:209`; `SRS.md:19`); MiCA/Modelo 172 con dictamen previo a mainnet (`PRD.md:251`); WCAG 2.1 AA (`PRD.md:212`; `constants.ts:76`); CDN Cloudflare (`PRD.md:213`); WalletConnect v2 (`SRS.md:17`). El impacto es de trazabilidad: **no existe una matriz brief→requisito con columna de origen y decisión**, por lo que hoy es imposible distinguir lo pedido de lo añadido. Los añadidos que la propia documentación marca como Fase 2 (IPFS/Arweave, fiat-on-ramp, PMS) no se cuentan como defecto oculto por ser limitación declarada.

**Recomendación.** Mantener una matriz de trazabilidad brief↔requisito con columna «origen» (deseo del brief / decisión del cliente por escrito / añadido técnico justificado) y someter todo añadido a aprobación explícita antes de seguir construyéndolo. Presentar a Carlos, junto con coste y plazo, qué extras se proponen y con qué impacto. Cerrar el 5 %/10 % de royalty por tipo con confirmación registrada.

---

## 7. RNF faltantes o sin evidencia de cumplimiento

| RNF | Fuente | Estado verificado |
|---|---|---|
| Cobertura de tests ≥ 80 % | `SRS.md:643-647`; DoD `BACKLOG-SPRINTS.md:18` | **Sin evidencia**: `forge coverage … \|\| true` sin umbral (`.gitlab-ci.yml:56-67`); DoD con las cinco casillas sin marcar |
| Multi-RPC con failover (RNF-08) | `PRD.md:205`; `SRS.md:633` | **No implementado**: un solo `RPC_URL`; `RPC_FALLBACK_URL` sin consumidores |
| Heartbeat y alertas (RNF-10) | `PRD.md:207`; `PLAN-CONSTRUCCION.md:120` | **No implementado**: `EventListenerService` sin consumidor en runtime |
| 32 confirmaciones anti-reorg / chunks 2.000 | `SRS.md:635-636` | **Contradicho**: 1 confirmación y 5.000 bloques (`constants.ts:31,33`) |
| Observabilidad (Sentry) | `SRS.md:57`; `README.md:144` | **Sin dependencia**: solo hook sobre `globalThis.__SENTRY__` (`logger.ts:84-95`) |
| Uptime ≥ 99.5 %, RPO < 1 h / RTO < 4 h | `PRD.md:201` | **Sin instrumento de medida**; el runner de DR construye un snapshot mock en memoria y «valida» cifrando y descifrando el mismo objeto (`restore-verify.ts:11-38,47-55`), sin job en CI |
| LCP < 2.5 s en 4G móvil | `PRD.md:59` | Sin medición reproducible; el `perf-nightly` usa `measure-perf.mjs` con `continue-on-error: true`, no k6 (`ci.yml:111-155`) |
| Filtros < 500 ms con índices | `PRD.md:68` | **No medible**: PostgreSQL nunca levantado |
| Validación de QR < 3 s | `PRD.md:131` | Sin evidencia ejecutable; y la validación real no comprueba titularidad (H-05) |
| Email de venta < 60 s con 3 reintentos y backoff | `PRD.md:99` | Sin evidencia: pipeline de correo inconexo y sin consumidor BullMQ (H-08) |
| ≥200 usuarios concurrentes sin degradar bajo 500 ms | `PRD.md:263` | **No verificable**: el informe k6 es un mock de 10 s (H-03) |
| «Tiempo real» y latencia < 5 min (RF-09) | `PRD.md:147,150` | Criterio **no medible** tal como está redactado |
| «Estado vacío amigable» | `PRD.md:70` | Criterio **no verificable** |
| «Mobile-first certificado en iOS 15+ / Android 11+» | `PRD.md:211` | Sin certificado ni matriz de dispositivos |
| «Latencia < 5 ms» del caché EUR | `SRS.md:54` | Sin instrumento de medida y sin caché EUR en el runtime |
| WCAG 2.1 AA | `PRD.md:212`; `constants.ts:76` | **Falso positivo de certificación**: los tests validan `#047857`/`#DC2626` (`a11y.test.ts:8,10`) que no existen en el preset real (`preset.cjs:29-32`, paleta `sea`/`terracotta`) |
| Rate limiting distribuido (Redis, ventana deslizante) | `SRS.md:439` | **No implementado**: limitador en memoria declarado «SINGLE-INSTANCE» (`assistant/route.ts:25-29`) |
| Pool PostgreSQL máximo 20 | `SRS.md:618-619` | Sin evidencia: `pg` sí, pero PostgreSQL nunca levantado y el worker no usa ese pool |
| Reconciliación de notificaciones `PENDING` | `SRS.md:601-613,637` | **No invocada**: `reconcilePendingNotifications` solo desde su test (`:130`) |
| Purga mensual de notificaciones | `SRS.md:616-623` | **No invocada**: `purgeOldNotifications` sin llamadores (`migrator.ts:132`) |

---

## 8. Stakeholders faltantes o sin rol

| Stakeholder | Situación verificada | Evidencia |
|---|---|---|
| **Carlos (propietario)** | Es el destinatario de los avisos de venta y el operador del back-office, pero **no tiene respuesta a sus cuatro preguntas** (coste, plazo, mantenimiento, qué se necesita de él) y se le exige aportar un comité de 3 firmantes y custodiar claves; no existe manual de operación para él. | `BRIEF:55-58`; `PRD.md:44`; `SRS.md:412` |
| **Sobrino de Carlos** | Es el interlocutor técnico real del cliente (aparece 3 veces en el brief, decide Polygon y la wallet), pero **no figura como stakeholder** en PRD, SRS ni Plan, ni como canal de validación. | `BRIEF:18,26,49` |
| **Recepcionista** | PRD/SRS le exigen MFA y rol `RECEPTION_ROLE`, pero las rutas de recepción no tienen guard de sesión y el anclaje on-chain nunca se despacha. | `checkin/route.ts:7,15-25`; `middleware.ts:25-53` |
| **Huésped sin smartphone** | Existe flujo de contingencia, pero sin verificación real de titularidad contra `currentOwner` y sin registro on-chain del check-in. | `contingency/route.ts:7,16-43`; `service.ts:130-133` |
| **Comprador secundario** | No puede completar la reventa con la configuración por defecto (H-02) y el royalty que se le aplica no es el prometido (H-10). | `useBuyNight.ts:22-34`; `HotelNights.sol:156-166` |
| **Custodia de claves (hot-wallet y multisig)** | El Plan define `HOTEL_OPERATOR_HOT_WALLET` y Gnosis Safe 2-of-3, pero `GNOSIS_SAFE_ADDRESS` está vacío en la plantilla y no hay procedimiento de rotación ni de recuperación aprobado. | `.env.example`; `PLAN-CONSTRUCCION.md:44-50` |
| **Soporte / DevOps** | Existe `DEVOPS_ALERT_EMAIL` como destino, pero **ningún servicio envía las alertas prometidas** (silencio de bloques, gas < 5 POL) y no hay runbook de incidentes con responsable asignado. | `SRS.md:411,634`; `EventListenerService` sin consumidor |
| **PMS externo / SES.HOSPEDAJES** | El adaptador es MOCK y no hay interlocutor, credenciales ni contrato de integración identificados, pese a describirse el envío real. | `pms/adapter.ts:67-86`; `PMS-INTEGRATION.md:24-26,43` |
| **Asesor legal / MiCA y fiscalidad** | El PRD condiciona el paso a mainnet a un dictamen que **no existe en el repositorio** y no se identifica a quién lo emite. | `PRD.md:251`; no hay dictamen en `docs/` |
| **Responsable del registro de viajeros (RD 933/2021)** | Se delega al mostrador, pero la ruta de sincronización es pública, acepta DNI/nombre y devuelve la ficha policial en la respuesta HTTP. | `pms-sync/route.ts:4-25` |
| **Equipo de mantenimiento de la infraestructura** | El Plan declara una VM única de GCP con reinicio vía systemd/Docker y snapshot diario, pero **no hay `Dockerfile`, IaC ni dueño documentado** de esa infraestructura. | `PLAN-CONSTRUCCION.md:174-178`; sin `Dockerfile` en el repo |
| **Proveedor de red (Alchemy/Infura vs Besu de terceros)** | El brief delega la decisión («decidme vosotros qué es mejor») y el código resolvió hacia una Besu de terceros sin acta, sin contrato de servicio ni SLA. | `BRIEF:26-27`; `constants.ts:9-18` |

**Nota de alcance:** el brief no identifica usuarios finales distintos del comprador y del propietario; el PRD amplía la lista (comprador secundario, recepcionista, custodios, bot burner, backend listener) **sin devolver al cliente la confirmación de esos roles**.

---

## 9. Plan de acción

Esfuerzo: **S** ≤ 3 días · **M** ≤ 2 semanas · **L** > 2 semanas.

### 9.1 Quick wins (antes de cualquier demo o entrega)

| ID | Acción | Hallazgo | Responsable sugerido | Esf. |
|---|---|---|---|---|
| QW-1 | Borrar credenciales y secretos embebidos (`SYSTEM_USERS`, `JWT_SECRET`, `TICKET_SIGNING_SECRET`, `CHECKIN_SECRET_KEY`, `ADMIN_MFA_SECRET`, `VAPID_PRIVATE_KEY`) y aplicar `fail-fast` sin fallbacks | H-04 | Backend | S |
| QW-2 | Cerrar la autorización de `/api/admin/*` y `/api/reception/*` reutilizando `verifySession` + rol (401/403 en su ausencia) | H-05, H-06 | Backend | S |
| QW-3 | Hacer **obligatoria** la firma EIP-712 en `/api/qr/:tokenId` y `/api/wallet/pass/:tokenId`, comparando con `currentOwner`, y acortar el TTL del JWS | H-05 | Backend | S |
| QW-4 | Marcar como **NO VÁLIDAS** las certificaciones no reproducibles (`PERFORMANCE-REPORT.md`, ciclo Amoy) y retirarlas de la comunicación al cliente | H-03 | PM + QA | S |
| QW-5 | Reparar el binding de `better-sqlite3` (o fijar versión de Node) para que `pnpm test` vuelva a verde | H-14 | DevOps | S |
| QW-6 | Unificar el esquema del registro de despliegues (`Deploy.s.sol` + `sync-deployment.ts` + `schema.ts`), borrar `80002.json` con direcciones cero y fallar en CI si no valida | H-01 | Blockchain | S |
| QW-7 | Responder por escrito las cuatro preguntas de Carlos e incorporarlas al PRD | H-07 | PM | S |
| QW-8 | Retirar de `.env.example` la cadena y las variables obsoletas y documentar las obligatorias reales | H-19 | DevOps | S |

### 9.2 Mejoras (sprint siguiente, alcance acotado)

| ID | Acción | Hallazgo | Responsable sugerido | Esf. |
|---|---|---|---|---|
| M-1 | **Congelar una sola generación** de contratos: decisión formal de red y alineación de ABI, direcciones, `chain.ts`, worker y MCP | H-01, D12 | Arquitectura + PM | L |
| M-2 | Una única fuente de verdad para construir, revisar, verificar y firmar la transacción, con test byte a byte del calldata | H-02 | Frontend/Web3 | M |
| M-3 | Portar el suelo de precio anti-evasión y el royalty por token/tipo al contrato realmente desplegado | H-10 | Blockchain | M |
| M-4 | Unificar la persistencia en PostgreSQL, ejecutar `runMigrations` en el arranque y retirar la doble verdad con SQLite (o justificarla y documentarla) | H-11, H-08 | Backend | M |
| M-5 | Decidir por capacidad: cablear o retirar burner programado, push y consumidor BullMQ, documentando la decisión | H-08 | Backend | M |
| M-6 | Implementar o degradar formalmente RNF-08/RNF-10: `fallback([RPC1, RPC2])`, confirmaciones y chunking configurables, alerta de silencio sobre `newHeads` | H-09, H-12 | Backend + DevOps | M |
| M-7 | Proteger `/api/reception/pms-sync`, dejar de devolver la ficha policial y minimizar la PII almacenada | H-13 | Backend + Legal | M |
| M-8 | Crear la matriz brief↔requisito con columna «origen» y someter todo añadido a aprobación explícita | H-15 | PM | S |
| M-9 | Resolver el tipo «doble» extremo a extremo (repositorio, API, panel, filtros) o retirarlo del brief y de la UI | H-07, H-18 | Full-stack | M |
| M-10 | Implementar las gráficas prometidas en RF-09 (serie mensual, por tipo y ranking de reventas) | H-18 | Frontend | M |
| M-11 | Corregir las afirmaciones documentales no sostenidas (Sentry instalado, WCAG AA certificado, cobertura) | H-12, H-21 | QA + PM | S |

### 9.3 Roadmap (hacia un MVP entregable de verdad)

| ID | Acción | Hallazgo | Responsable sugerido | Esf. |
|---|---|---|---|---|
| R-1 | Reescribir PRD/SRS/PLAN §2 con la red y la arquitectura decididas, dejando el brief técnico como origen | H-01, D12 | PM + Arquitectura | M |
| R-2 | Verificación reproducible: k6 real contra staging con artefacto, E2E bloqueante y cobertura ≥ 80 % como gate | H-03, H-14 | QA + DevOps | L |
| R-3 | Aprovisionar la operación: `Dockerfile`/IaC, gestor de secretos, Sentry real, backups con restauración probada y alertas con destinatario | H-12, H-03 | DevOps | L |
| R-4 | Cerrar el frente legal: dictamen MiCA/fiscal, adaptador PMS real (SES.HOSPEDAJES) y base jurídica del tratamiento de datos | H-13, H-20 | Legal + Backend | L |
| R-5 | Implementar WalletConnect v2 y los pases Apple/Google reales, o retirarlos de PRD/SRS/UI | D13, H-15 | Frontend | M |
| R-6 | Piloto controlado con Carlos: un tipo de habitación, un lote, operación asistida y acta de aceptación firmada | H-07 | PM | M |

---

## 10. Hallazgos descartados en Fase 2

**El registro de descartes de la Fase 2 no se pudo recuperar**: el volcado del workflow se truncó en el transporte y se perdieron las secciones finales del sintetizador. Las secciones 1 a 7 y el inicio de la 8 se reconstruyeron desde el volcado; las secciones 8 a 11 las completó el orquestador a partir de los 22 hallazgos ya consolidados en la sección 5, **sin añadir hallazgos nuevos**.

Consecuencia metodológica que conviene tener presente: la Fase 2 aplicó la regla **«ante la duda, se descarta»**, por lo que este informe **subestima** en lugar de exagerar. Todo hallazgo ausente de la tabla de la sección 5 debe considerarse **no confirmado**, no refutado.

---

## 11. Criterios de aceptación para la siguiente versión (V6)

1. **Trazabilidad cerrada:** los 17 deseos del brief (D1–D17) pasan a `IMPLEMENTADO` o a `DIFERIDO` con sprint, Story Points, fecha y aprobación registrada. Ninguno queda en `DESVIADO` ni `PERDIDO`.
2. **Cero CRÍTICAS abiertas:** H-01 a H-07 cerradas, cada una con un test que la reproduzca y falle antes del arreglo (equivalencia del calldata, 401/403 en rutas, ticket sin titularidad, esquema de despliegue, certificación con RPC caído).
3. **Una sola generación de contratos** en el repositorio, con script de despliegue, registro validado por esquema y `abiHash` coherente en `packages/shared/deployments/<chainId>.json`.
4. **Verde reproducible:** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde en el runner de CI, con cobertura ≥ 80 % y E2E bloqueante; `test:k6`, `test:dr` y `test:e2e:amoy` ejecutados por el pipeline.
5. **Ninguna certificación sin artefacto:** toda cifra de rendimiento, ciclo on-chain o DR publicada debe poder regenerarse desde el repositorio con su reporte y sus hashes.
6. **Infraestructura verificada:** PostgreSQL 16 y Redis 7 levantados, `/health/ready` respondiendo con dependencias reales y suite de integración ejecutada contra ellos.
7. **Preguntas del cliente respondidas e incorporadas al PRD** (coste, plazo, mantenimiento mensual, necesidades, y la decisión de red que el brief delega).
8. **Matriz brief↔requisito** con columna de origen y aprobación, incluida la decisión del royalty por tipo.
9. **Sin secretos ni credenciales en el repositorio**, con `fail-fast` en todos los secretos críticos y un test guardián que lo impida.

---

*Informe de Optimización V5 · generado con `@audita` (7 lentes en paralelo + verificación adversarial + síntesis) · auditoría de solo lectura sobre el repositorio.*
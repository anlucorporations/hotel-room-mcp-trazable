# Backlog de Sprints y Desglose de Historias de Usuario
## Hotel Marina del Sol: Plataforma NFT de Reservas

> **Versión**: 1.1.0  
> **Fecha**: 2026-09-08  
> **Estado**: Aprobado — Post-Auditoría (17 hallazgos resueltos)  
> **Alineación**: PRD v1.1.0 y SRS v1.2.0  
> **Sprint Cadence**: Sprint 0 (1 semana) + 6 Sprints de 2 semanas = **13 semanas en total**  

---

## 0. Definición de Hecho (DoD) — Global

Los siguientes criterios aplican a **todas** las historias de usuario. Una historia solo se marca como **Hecha** cuando cumple todos:

- [ ] Código revisado en merge request por al menos 1 par.
- [ ] Tests unitarios y de integración escritos y pasando en CI (pipeline GitLab).
- [ ] **Cobertura de código ≥ 80%** (contratos: Foundry lcov; backend: Jest/Pytest).
- [ ] Análisis estático de contratos con `slither .` sin hallazgos críticos o altos (aplica a Sprint 0 y Sprint 1).
- [ ] Despliegue en entorno correspondiente verificado (Anvil → Sprint 0/1/2, Polygon Amoy en GCP → Sprint 3+).
- [ ] Criterios de aceptación de la historia validados manualmente o con test E2E.
- [ ] Documentación técnica actualizada si el cambio modifica una interfaz pública o un esquema de BD.

---

## 1. Resumen del Roadmap de Sprints

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ROADMAP DE SPRINTS                            │
├──────────┬──────────────────────────────────────────────┬───────────────┤
│ Sprint   │ Objetivo Principal                           │ Story Points  │
├──────────┼──────────────────────────────────────────────┼───────────────┤
│ Sprint 0 │ DevOps, CI/CD, Monorepo y Cimientos         │ 8 SP          │
│ Sprint 1 │ Smart Contracts Core y Suite Foundry         │ 21 SP         │
│ Sprint 2 │ BD Indexada, Auth MFA+Blocklist y Caché EUR  │ 21 SP         │
│ Sprint 3 │ Listener, Notif., Bot Burner y Deploy Amoy   │ 26 SP         │
│ Sprint 4 │ Tienda Pública, Wallet, QR Seguro y E2E      │ 26 SP         │
│ Sprint 5 │ Recepción, Reventa, Back-office y E2E        │ 24 SP         │
│ Sprint 6 │ Pruebas Carga k6, Hardening y Compliance     │ 16 SP         │
├──────────┴──────────────────────────────────────────────┴───────────────┤
│ TOTAL: 142 Story Points                                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Detalle de Sprints e Historias de Usuario

---

### 🟣 SPRINT 0: DevOps, CI/CD, Monorepo y Cimientos
**Duración**: Semana 1 · **Capacidad**: 8 SP · **Meta**: Infraestructura de desarrollo lista, pipeline CI activo, entornos Anvil y GCP configurados antes de escribir la primera línea de negocio.

#### US-00: Configuración del Monorepo, CI/CD y Entornos de Desarrollo (8 SP)
- **Como** equipo de desarrollo,  
  **quiero** un monorepo estructurado con pipeline CI automático y entornos locales listos,  
  **para** comenzar el Sprint 1 sin fricciones de configuración y con garantías de calidad desde el primer commit.
- **Criterios de Aceptación**:
  - Monorepo inicializado con estructura: `packages/contracts`, `apps/api`, `apps/web`, `scripts/`.
  - Pipeline CI (GitLab CI) ejecuta linting, formateo, tests y cobertura automáticamente en cada MR.
  - `docker-compose.yml` levanta PostgreSQL 16 y Redis 7 localmente con un solo comando.
  - Foundry (`foundry.toml`) y OpenZeppelin v5.x instalados y compilando.
  - Slither configurado en el pipeline CI con umbral de severidad: bloquear en HIGH o CRITICAL.
  - Secrets de desarrollo (clave AES, claves Anvil, JWT RS256 keypair) gestionados en vault local (archivo `.env.vault` en `.gitignore`).
  - Instancia GCP aprovisionada y accesible con `forge script` para despliegues en Polygon Amoy.
- **Tareas Técnicas**:
  - `TASK-00.1`: Inicializar estructura de monorepo y configurar `.gitignore`, `README.md` y convenciones de ramas.
  - `TASK-00.2`: Crear `.gitlab-ci.yml` con stages: `lint` → `test` → `coverage` → `slither` → `deploy-preview`.
  - `TASK-00.3`: Crear `docker-compose.yml` con PostgreSQL 16 + Redis 7 + configuración de red local.
  - `TASK-00.4`: Instalar y verificar Foundry, OpenZeppelin v5 y Slither; confirmar compilación limpia.
  - `TASK-00.5`: Aprovisionar instancia GCP, instalar Foundry y verificar conectividad con RPC de Polygon Amoy.

---

### 🟢 SPRINT 1: Smart Contracts Core y Suite de Pruebas en Foundry
**Duración**: Semanas 2 y 3 · **Capacidad**: 21 SP · **Meta**: Contratos compilados, verificados con 100% de tests pasando en Foundry y desplegados en Anvil local.

#### US-01: Contrato `HotelNFT.sol` con AccessControl, Pausable y Royalties EIP-2981 (8 SP)
- **Como** desarrollador Web3,  
  **quiero** implementar el contrato ERC-721 con OpenZeppelin `AccessControl`, `Pausable` y EIP-2981,  
  **para** acuñar noches tokenizadas con gobernanza multisig, minteo por relayer y quema autorizada.
- **Criterios de Aceptación**:
  - Implementa `DEFAULT_ADMIN_ROLE` para configuración global, `setMarketplaceContract()` y pausado de emergencia.
  - Implementa `MINTER_ROLE` para minteo masivo (≤50 tokens/lote) desde el back-office sin Gnosis Safe.
  - Implementa `BURNER_ROLE` permitiendo exclusivamente a la wallet de servicio ejecutar `burn()` y `burnBatch()`.
  - `setMarketplaceContract()` permite actualizar la dirección del marketplace sin redesplegar el contrato.
  - `pause()` / `unpause()` bloquean operaciones de minteo, burn y transferencias.
  - La función `royaltyInfo` calcula exactamente 5% (500 bp) para simples/dobles y 10% (1000 bp) para suites.
  - La función `_update()` restringe transferencias secundarias exclusivamente a la dirección del contrato marketplace.
  - Análisis con `slither .` sin hallazgos HIGH o CRITICAL.
- **Tareas Técnicas**:
  - `TASK-01.1`: Crear `packages/contracts/src/HotelNFT.sol` con herencia ERC721, ERC2981, AccessControl, Pausable.
  - `TASK-01.2`: Implementar `MINTER_ROLE`, `BURNER_ROLE`, `setMarketplaceContract()` y lógica `royaltyInfo`.
  - `TASK-01.3`: Escribir tests en Foundry (`HotelNFT.t.sol`): control de acceso, restricción de operadores, royalties, pausado, setter marketplace.

#### US-02: Contrato `HotelMarketplace.sol` con Pull-over-Push, Pausable y Anti-reentrancy (8 SP)
- **Como** comprador y vendedor de noches NFT,  
  **quiero** un contrato de marketplace con liquidación Pull-over-Push y protección anti-reentrancy,  
  **para** comprar y revender habitaciones de forma segura con royalties garantizados.
- **Criterios de Aceptación**:
  - `listForSale(tokenId, price)` registra la oferta solo si el llamante es el propietario y la noche no ha caducado.
  - `cancelListing(tokenId)` permite la cancelación al vendedor o a una cuenta con `DEFAULT_ADMIN_ROLE`.
  - `buy(tokenId)` acumula royalty (a multisig) y remanente (al vendedor) en `pendingWithdrawals`; no transfiere ETH directamente.
  - `withdraw()` permite retirar fondos acumulados de forma segura (protegido con `nonReentrant`).
  - `pause()` / `unpause()` bloquean `listForSale()`, `cancelListing()` y `buy()`.
  - Cuenta con análisis de `slither .` sin hallazgos HIGH o CRITICAL.
- **Tareas Técnicas**:
  - `TASK-02.1`: Implementar `packages/contracts/src/HotelMarketplace.sol` con Pull-over-Push y Pausable.
  - `TASK-02.2`: Implementar `pendingWithdrawals` mapping y función `withdraw()` con protección reentrancy.
  - `TASK-02.3`: Desarrollar tests en Foundry (`Marketplace.t.sol`): reentrancy con contratos maliciosos, pull-over-push, pausado.

#### US-03: Entorno Local Anvil y Scripts de Despliegue Foundry (5 SP)
- **Como** ingeniero de software,  
  **quiero** un script de despliegue determinista con Foundry y configuración de Anvil con cuentas precargadas,  
  **para** reproducir fielmente el ecosistema de contratos en desarrollo local y CI.
- **Criterios de Aceptación**:
  - Script `Deploy.s.sol` despliega `HotelNFT` con cuenta 0 de Anvil como `DEFAULT_ADMIN_ROLE`.
  - Asigna `MINTER_ROLE` a cuenta 1 de Anvil y `BURNER_ROLE` a cuenta 2 de Anvil.
  - Despliega `HotelMarketplace` y llama a `setMarketplaceContract()` en `HotelNFT`.
  - Exporta automáticamente las direcciones desplegadas y ABIs a `packages/shared`.
  - El mismo script `Deploy.s.sol` puede ejecutarse en Polygon Amoy vía Foundry en GCP (parámetro `--rpc-url`).
- **Tareas Técnicas**:
  - `TASK-03.1`: Escribir script Foundry `Deploy.s.sol` multi-entorno (Anvil / Amoy / Mainnet).
  - `TASK-03.2`: Configurar script de exportación de artefactos para consumo en frontend y backend.

---

### 🟢 SPRINT 2: Backend Core, Base de Datos, Auth MFA y Seguridad
**Duración**: Semanas 4 y 5 · **Capacidad**: 21 SP · **Meta**: BD relacional desplegada e indexada, back-office protegido con JWT + MFA + blocklist + códigos de rescate, y worker de conversión EUR activo.

#### US-04: Esquema de Base de Datos Off-chain con Máquina de Estados (5 SP)
- **Como** desarrollador backend,  
  **quiero** diseñar el esquema relacional con índices e invariantes de estado formalizados,  
  **para** soportar 200 usuarios concurrentes con consultas < 500ms y consistencia garantizada.
- **Criterios de Aceptación**:
  - Tablas creadas: `nfts`, `listings`, `sale_events`, `admin_sessions`, `mfa_recovery_codes`, `push_subscriptions`.
  - Índice compuesto `idx_nfts_query` sobre `(status, check_in_date, room_type)`.
  - La tabla `nfts` almacena `check_in_secret_enc` (cifrado AES-256-GCM) en lugar de SHA-256.
  - Migraciones de base de datos automatizadas y reproducibles.
- **Tareas Técnicas**:
  - `TASK-04.1`: Crear migraciones de BD con DDL completo (todas las tablas incluyendo `mfa_recovery_codes`).
  - `TASK-04.2`: Configurar índices y restricciones de integridad referencial.
  - `TASK-04.3`: Escribir tests de integración de inserción y consulta en BD.

#### US-05: Autenticación Admin con MFA, RTR, JWT Blocklist y Códigos de Rescate (13 SP)
- **Como** propietario del hotel (Carlos),  
  **quiero** acceder al panel administrativo con MFA, JWT blocklist activa y códigos de rescate de emergencia,  
  **para** gestionar el inventario con máxima seguridad incluso si pierdo el autenticador.
- **Criterios de Aceptación**:
  - Endpoint `/auth/login` valida credenciales y exige desafío TOTP.
  - Endpoint `/auth/mfa/verify` entrega JWT de acceso (15 min) y refresh token (7 días).
  - BD almacena exclusivamente el hash SHA-256 del refresh token en `admin_sessions`.
  - Cada refresco invalida el refresh token previo y emite uno nuevo (RTR).
  - **Logout** añade el JWT a la blocklist en Redis (TTL = tiempo restante del token); requests subsiguientes con ese JWT son rechazados con 401.
  - `POST /admin/nfts/mint-batch` exige `confirmTotpCode` válido adicional (re-confirmación MFA).
  - Al activar MFA, se generan **8 códigos de rescate** únicos (hash bcrypt) guardados en `mfa_recovery_codes`.
  - `POST /auth/mfa/recovery` valida un código de rescate, lo marca como `used_at = now()` y emite tokens. Cada código solo puede usarse una vez.
- **Tareas Técnicas**:
  - `TASK-05.1`: Desarrollar endpoints `/auth/login`, `/auth/mfa/verify`, `/auth/refresh`, `/auth/logout` (con blocklist Redis).
  - `TASK-05.2`: Integrar TOTP (`speakeasy`/`otplib`), middleware de re-confirmación MFA para mint-batch y endpoint `/auth/mfa/recovery`.
  - `TASK-05.3`: Implementar generación de 8 códigos de rescate al activar MFA (hash bcrypt).
  - `TASK-05.4`: Escribir tests de seguridad: token reuse, fuerza bruta, JWT inválido post-logout, recuperación de cuenta.

#### US-06: Servicio Resiliente de Cotización EUR con Caché y Fallback (3 SP)
- **Como** usuario de la plataforma,  
  **quiero** ver los precios convertidos a Euros de forma instantánea (<5ms) y precisa,  
  **para** comprender el coste real de las habitaciones sin sufrir caídas por límites de APIs externas.
- **Criterios de Aceptación**:
  - Worker en segundo plano actualiza el valor MATIC/EUR cada 5 minutos en memoria/Redis.
  - Los endpoints de catálogo responden la cotización desde caché en **< 5ms**.
  - Si CoinGecko responde error o timeout, conmuta automáticamente a Binance o CryptoCompare.
- **Tareas Técnicas**:
  - `TASK-06.1`: Implementar worker de sincronización de precios con circuit breaker y fallback a proveedor secundario.
  - `TASK-06.2`: Test de integración que simula fallo de CoinGecko y verifica activación del fallback.

---

### 🟢 SPRINT 3: Event Listener, Bot Burner, Notificaciones y Primer Deploy Amoy
**Duración**: Semanas 6 y 7 · **Capacidad**: 26 SP · **Meta**: Sincronización continua de eventos on-chain, bot burner con Redlock y alerta de gas, notificaciones en <60s, histórico público y primer despliegue en Polygon Amoy vía Foundry en GCP.

#### US-07: Sincronizador de Eventos On-chain con Reconciliación e Invariantes de Estado (8 SP)
- **Como** operador del sistema,  
  **quiero** un Event Listener persistente con reconexión automática y aplicación de la máquina de estados,  
  **para** replicar en BD cada venta, listado, cancelación y quema sin pérdida y con consistencia garantizada.
- **Criterios de Aceptación**:
  - Conexión WebSocket a RPC primario con fallback al secundario en caso de fallo.
  - Heartbeat técnico cada 30 segundos; reconexión inmediata tras 2 fallos consecutivos.
  - Persistencia atómica de `lastBlockProcessed` en BD tras procesar cada lote de eventos.
  - Al reconectar, ejecuta `eth_getLogs(fromBlock = lastBlockProcessed + 1)` para capturar eventos intermedios.
  - Aplica la máquina de estados unificada (SRS §5.0): `NFTSold` → actualiza `nfts` + `listings` + rota secreto; `NFTBurned` → cancela listing activo si existe.
  - **Alerta de silencio**: Si no procesa ningún evento en 10 minutos, envía email de alerta a Carlos.
- **Tareas Técnicas**:
  - `TASK-07.1`: Desarrollar `EventListener` con soporte multi-RPC, WebSocket ping/pong y alerta de silencio.
  - `TASK-07.2`: Implementar manejadores de eventos con transiciones de estado atómicas en BD.
  - `TASK-07.3`: Implementar rotación de `check_in_secret_enc` al procesar `NFTSold`.
  - `TASK-07.4`: Test de integración: corte de red → reconciliación retroactiva; burn con listing activo → listing cancelado.

#### US-07b: Endpoints Backend del Catálogo y Metadatos (5 SP)
- **Como** frontend del catálogo,  
  **quiero** endpoints REST del catálogo y metadatos ERC-721 disponibles desde Sprint 3,  
  **para** consumirlos en Sprint 4 sin bloqueos de dependencias.
- **Criterios de Aceptación**:
  - `GET /api/nfts` implementado con todos los filtros (status, roomType, dateFrom, dateTo, priceMin/MaxWei, page, limit).
  - `GET /api/nfts/:tokenId/metadata` retorna JSON conforme a ERC-721 Metadata Standard.
  - Tiempo de respuesta < 500ms con los índices de BD del Sprint 2.
  - Tests unitarios de los endpoints con mocks de BD.
- **Tareas Técnicas**:
  - `TASK-07b.1`: Implementar `GET /api/nfts` con filtros y paginación.
  - `TASK-07b.2`: Implementar `GET /api/nfts/:tokenId/metadata` (tokenURI compatible ERC-721).

#### US-08: Cola Asíncrona de Notificaciones de Venta (3 SP)
- **Como** propietario del hotel (Carlos),  
  **quiero** recibir un correo electrónico en menos de 60 segundos cada vez que se venda o revenda una habitación,  
  **para** estar enterado al momento de los ingresos generados.
- **Criterios de Aceptación**:
  - Ante `NFTSold`, el listener encola una tarea de notificación en BullMQ/Celery.
  - Email despachado mediante SendGrid / Resend en < 60 segundos.
  - Contenido: habitación, fecha estancia, precio en POL y EUR, tipo de operación, wallet truncada.
  - 3 reintentos con backoff exponencial (10s, 30s, 90s).
- **Tareas Técnicas**:
  - `TASK-08.1`: Configurar cola BullMQ con Redis y plantilla de correo responsiva.
  - `TASK-08.2`: Worker de despacho con reintentos y alertas de fallo persistente.

#### US-09: Bot Burner con Redlock, Alerta de Gas y Custodia de Clave (5 SP)
- **Como** administrador del sistema,  
  **quiero** un scheduler que queme automáticamente a las 12:00 PM (Europe/Madrid) los NFTs no vendidos con exclusión mutua y alerta de gas,  
  **para** mantener el inventario limpio sin riesgo de doble ejecución ni fallo silencioso.
- **Criterios de Aceptación**:
  - Se ejecuta a las **12:00 PM hora `Europe/Madrid`** diariamente.
  - Adquiere Redis Redlock (`hotel:burn:lock`, TTL 30s) antes de ejecutar; aborta si no puede adquirirlo.
  - Si saldo del bot < 5 POL, envía email de alerta a Carlos y **aborta** la quema sin error silencioso.
  - Detecta tokens con `status = 'AVAILABLE'` y `checkInDate < hoy`.
  - Verifica on-chain que `ownerOf(tokenId) == address(HotelNFT)`.
  - Invoca `HotelNFT.burnBatch(tokenIds)` con wallet con `BURNER_ROLE` (clave desde vault).
  - Actualiza estado a `BURNED` en BD; aplica invariante: listings activos → CANCELLED.
- **Tareas Técnicas**:
  - `TASK-09.1`: Cron job con timezone `Europe/Madrid`, Redis Redlock y verificación de saldo.
  - `TASK-09.2`: Integrar firma de transacciones con clave obtenida desde vault (variable de entorno en desarrollo, HashiCorp Vault/AWS Secrets Manager en producción).

#### US-17: Histórico Público de Ventas y Reventas (5 SP)
- **Como** usuario o inversor,  
  **quiero** consultar el historial público on-chain de todas las ventas y reventas de noches del hotel,  
  **para** auditar la actividad del marketplace y tomar decisiones informadas.
- **Criterios de Aceptación**:
  - Endpoint `GET /api/sales/history` retorna ventas paginadas (`PRIMARY_SALE`, `RESALE`) con filtros opcionales por tipo y rango de fechas.
  - Tabla frontend con columnas: fecha, habitación, tipo, precio POL, precio EUR, tipo de operación.
  - Exportación a CSV disponible con `?format=csv`.
  - Los eventos de tipo `BURN` no se muestran en el histórico público.
- **Tareas Técnicas**:
  - `TASK-17.1`: Implementar `GET /api/sales/history` con filtros y soporte CSV.
  - `TASK-17.2`: Desarrollar componente de tabla del histórico en frontend (puede comenzarse en Sprint 4).

#### US-20: Primer Despliegue en Polygon Amoy vía Foundry en GCP (0 SP — hito técnico)
- **Criterios de Aceptación**:
  - `forge script Deploy.s.sol --rpc-url $AMOY_RPC_URL` ejecutado exitosamente desde la instancia GCP.
  - Contratos `HotelNFT` y `HotelMarketplace` verificados en el explorador de Polygon Amoy.
  - Event Listener conectado al RPC de testnet y procesando eventos de prueba.
- **Tareas Técnicas**:
  - `TASK-20.1`: Ejecutar `Deploy.s.sol` en Amoy desde GCP; registrar direcciones en `packages/shared`.
  - `TASK-20.2`: Verificar contratos en Polygonscan Amoy con `forge verify-contract`.

---

### 🟢 SPRINT 4: Frontend Tienda Pública, Wallet, QR Seguro e Internacionalización
**Duración**: Semanas 8 y 9 · **Capacidad**: 26 SP · **Meta**: Tienda pública operativa con catálogo reactivo, compra anónima Web3, resguardo QR descargable con pase Wallet, internacionalización y tests E2E de frontend.

#### US-10: Catálogo Público Responsivo con Filtros en Tiempo Real (<500ms) (5 SP)
- **Como** usuario visitante,  
  **quiero** explorar las noches disponibles y filtrar por fecha, precio y tipo de habitación en mi móvil,  
  **para** encontrar la estancia que me interesa de forma rápida.
- **Criterios de Aceptación**:
  - Carga inicial en móvil con LCP < 2.5s sobre conexión 4G.
  - Filtros combinables por rango de fecha, precio y tipo de habitación con respuesta < 500ms.
  - Tarjetas con fotografía, número de habitación, tipo, fecha y precio en POL con equivalente en EUR.
  - Diseño mobile-first adaptado a iPhone 12 / Galaxy S21 en adelante.
  - Tests E2E con Playwright: navegación del catálogo, aplicación de filtros y verificación de respuestas.
- **Tareas Técnicas**:
  - `TASK-10.1`: Desarrollar componentes UI de catálogo y barra de filtros reactiva (React/Next.js).
  - `TASK-10.2`: Integrar consumo de `GET /api/nfts` con estado reactivo (SWR / TanStack Query).
  - `TASK-10.3`: Escribir tests E2E Playwright para flujos de navegación y filtrado.

#### US-11: Conexión Wallet y Checkout Anónimo On-chain (8 SP)
- **Como** comprador de una noche de hotel,  
  **quiero** conectar mi wallet y pagar directamente en cripto sin rellenar formularios,  
  **para** reservar de forma 100% anónima.
- **Criterios de Aceptación**:
  - Compatible con MetaMask y WalletConnect v2 (Trust Wallet, Rainbow, Coinbase Wallet).
  - Flujo de compra invoca `HotelMarketplace.buy(tokenId)` con el importe exacto en MATIC/POL.
  - Modal de estado: preparando → firmando → confirmando → éxito / error.
  - Tests E2E Playwright con wallet simulada: compra exitosa y rechazo de firma.
- **Tareas Técnicas**:
  - `TASK-11.1`: Configurar proveedor wagmi/viem con RainbowKit o Web3Modal.
  - `TASK-11.2`: Implementar hook de compra con `HotelMarketplace`.
  - `TASK-11.3`: Modal de seguimiento con manejo de rechazos; test E2E con wallet mock.

#### US-12: Resguardo QR con Secreto AES-256-GCM, Re-descarga EIP-712 y Pase Wallet (8 SP)
- **Como** huésped que acaba de adquirir una noche,  
  **quiero** recibir inmediatamente mi código QR de check-in, poder re-descargarlo y guardarlo en Apple/Google Wallet,  
  **para** llevar mi reserva siempre conmigo sin depender de recordar la descarga inicial.
- **Criterios de Aceptación**:
  - Al confirmarse el bloque on-chain, se genera un `checkInSecret` de 32 bytes cifrado con AES-256-GCM en BD.
  - Pantalla de confirmación muestra el QR y permite descargarlo como PNG, PDF.
  - **Re-descarga**: `GET /api/qr/:tokenId` requiere firma EIP-712 (`tokenId + nonce + expiresAt`) del titular actual; descifra `check_in_secret_enc` con clave del vault.
  - **Pase Wallet**: Genera archivo `.pkpass` (Apple Wallet) y `.json` (Google Wallet) y los envía por email al comprador al momento de la compra.
  - Al producirse `NFTSold` (reventa), el Event Listener rota el `check_in_secret_enc` (nuevo secreto) antes de notificar al nuevo propietario.
  - El QR es válido hasta las 23:59 horas del día de salida.
- **Tareas Técnicas**:
  - `TASK-12.1`: Servicio de generación de QR criptográfico con AES-256-GCM; endpoint de re-descarga con verificación EIP-712.
  - `TASK-12.2`: Generación de `.pkpass` y `.json` de pase Wallet; envío por email (BullMQ).
  - `TASK-12.3`: Componente modal post-compra con descarga PNG/PDF y enlace de pase Wallet.

#### US-13: Internacionalización Multilingüe (ES / EN / RU) (3 SP)
- **Como** turista internacional,  
  **quiero** navegar la plataforma en mi idioma con formatos locales,  
  **para** realizar la compra con total claridad.
- **Criterios de Aceptación**:
  - Soporte completo ES, EN, RU con selector en cabecera.
  - Formato de fechas por locale; tipografías compatibles con cirílico.
- **Tareas Técnicas**:
  - `TASK-13.1`: Configurar `next-intl` o `i18next`; archivos JSON para los tres idiomas.
  - `TASK-13.2`: Validar renderizado cirílico en dispositivos iOS y Android.

#### US-21: Tests E2E Frontend Sprint 4 (Playwright) (2 SP)
- **Criterios de Aceptación**:
  - Suite Playwright cubre: carga del catálogo, filtros, conexión de wallet, checkout completo, descarga QR.
  - Todos los tests pasan en entorno de testnet (Polygon Amoy).
- **Tareas Técnicas**:
  - `TASK-21.1`: Escribir y ejecutar suite E2E de Sprint 4 en entorno staging conectado a Amoy.

---

### 🟢 SPRINT 5: Recepción, Reventa, Back-office, Web Push y Tests E2E
**Duración**: Semanas 10 y 11 · **Capacidad**: 24 SP · **Meta**: Módulo de recepción con RECEPTION_ROLE, reventa completa, panel de Carlos con re-confirmación MFA, notificaciones Web Push y tests E2E.

#### US-14: Validación Segura de QR en Recepción con RECEPTION_ROLE (6 SP)
- **Como** recepcionista del hotel,  
  **quiero** escanear el QR del huésped con mis credenciales propias y verificar su validez en < 3 segundos,  
  **para** hacer el check-in sin acceso a funciones administrativas.
- **Criterios de Aceptación**:
  - El recepcionista tiene credenciales propias con `RECEPTION_ROLE` en JWT (sin acceso al panel de admin).
  - Interfaz web interna exclusiva de recepción con lector de cámara integrado.
  - `POST /admin/qr/validate` solo accesible con `RECEPTION_ROLE` o `DEFAULT_ADMIN_ROLE`.
  - Al validar con éxito, marca `CHECKED_IN` en BD en < 3s.
  - Segundo escaneo retorna `ALREADY_CHECKED_IN` inmediatamente.
  - Admite late check-in sin rechazo de fecha.
  - Tests E2E: check-in exitoso, intento de replay, acceso no autorizado sin RECEPTION_ROLE.
- **Tareas Técnicas**:
  - `TASK-14.1`: Implementar `RECEPTION_ROLE` en JWT middleware; crear credenciales de recepción.
  - `TASK-14.2`: Desarrollar interfaz web de escáner QR para recepción.
  - `TASK-14.3`: Lógica atómica de verificación y consumición de secreto en `/admin/qr/validate`.

#### US-15: Marketplace de Reventa Propio con Flujo Guiado (7 SP)
- **Como** propietario de un NFT que no podrá viajar,  
  **quiero** poner mi noche a la venta en el marketplace del hotel,  
  **para** recuperar mi dinero permitiendo que otro huésped la aproveche.
- **Criterios de Aceptación**:
  - Vista "Mis Noches": wallet conectada muestra NFTs en propiedad.
  - Flujo de 2 pasos: `approve()` ERC-721 → `listForSale(tokenId, precio)`.
  - Oferta visible en catálogo como reventa.
  - Royalty liquidado automáticamente por el smart contract.
  - Tests E2E: listado, cancelación y compra de reventa con rotación de secreto.
- **Tareas Técnicas**:
  - `TASK-15.1`: Componente UI de gestión y listado de NFTs en reventa.
  - `TASK-15.2`: Flujo de aprobación ERC-721 y transacción de listing con wagmi.
  - `TASK-15.3`: Test E2E del flujo completo de reventa incluyendo rotación de secreto.

#### US-16: Back-office de Carlos: Minteo Masivo con Re-MFA y Dashboard Financiero (8 SP)
- **Como** propietario del hotel (Carlos),  
  **quiero** dar de alta nuevas fechas con re-confirmación MFA y consultar métricas financieras,  
  **para** gestionar el negocio y auditar beneficios.
- **Criterios de Aceptación**:
  - Formulario de alta masiva: habitación, rango de fechas, precio base, tipo.
  - Botón "Mintear" exige código TOTP adicional (`confirmTotpCode`) antes de enviar la transacción.
  - Validación: impide fechas pasadas o noches duplicadas.
  - Dashboard con 7 métricas (ingresos primarios, royalties, inventario, gráficos mes/tipo, top reventas).
  - Exclusión de eventos `MINT` en totales de ingresos.
  - Exportación CSV con cabeceras formalizadas.
- **Tareas Técnicas**:
  - `TASK-16.1`: Interfaz de minteo masivo con diálogo de re-confirmación MFA.
  - `TASK-16.2`: Componentes de dashboard con gráficas interactivas y exportador CSV.

#### US-18: Notificaciones Web Push Opt-in al Propietario del NFT (3 SP)
- **Como** propietario de un NFT,  
  **quiero** recibir notificaciones push en mi navegador cuando alguien compre mi habitación en reventa,  
  **para** estar informado en tiempo real.
- **Criterios de Aceptación**:
  - Toggle "Activar notificaciones" en la vista "Mis Noches".
  - `POST /api/push/subscribe` y `DELETE /api/push/unsubscribe` funcionan correctamente.
  - Ante `NFTSold` en el Event Listener, el worker envía push al propietario anterior.
  - Suscripción no persiste email ni datos personales; solo el endpoint de push.
- **Tareas Técnicas**:
  - `TASK-18.1`: Implementar worker de Web Push (FCM) integrado con BullMQ.
  - `TASK-18.2`: Componente UI de toggle de notificaciones.

#### US-22: Tests E2E Frontend Sprint 5 (Playwright) (0 SP — integrado en US-14/15/16)
- Playwright cubre: check-in exitoso con RECEPTION_ROLE, reventa completa, minteo masivo con re-MFA.
- Todos los tests pasan en staging conectado a Polygon Amoy.

---

### 🟢 SPRINT 6: Pruebas de Carga k6, Hardening y Compliance
**Duración**: Semanas 12 y 13 · **Capacidad**: 16 SP · **Meta**: Validación de concurrencia con 200 usuarios, hardening final y cierre del hito legal MiCA/fiscal.

#### US-23: Pruebas de Carga de Rendimiento k6 (200 Usuarios Concurrentes) (6 SP)
- **Como** responsable de calidad (QA),  
  **quiero** someter la plataforma a prueba de estrés con 200 usuarios simultáneos,  
  **para** certificar que el catálogo responde con p95 < 500ms y 0% de errores 5xx.
- **Criterios de Aceptación**:
  - Script k6: navegación, filtrado y consulta de detalle.
  - 200 usuarios virtuales concurrentes durante 10 minutos.
  - p95 < 500ms y tasa de fallos 5xx = 0.0%.
- **Tareas Técnicas**:
  - `TASK-23.1`: Scripts k6 en `scripts/load-tests/catalog.js`.
  - `TASK-23.2`: Ejecutar en staging, generar informe de telemetría.

#### US-24: Validación Integral en Polygon Amoy y Ciclo E2E Completo (6 SP)
- **Como** ingeniero DevOps/Web3,  
  **quiero** validar el ciclo completo en Polygon Amoy con transacciones reales,  
  **para** tener confianza en el despliegue en mainnet.
- **Criterios de Aceptación**:
  - Contratos verificados en Polygonscan Amoy (primer deploy fue en Sprint 3).
  - Ciclo completo con transacciones reales: minteo (relayer) → compra MetaMask → QR → check-in → burn token no vendido.
  - Event Listener procesando eventos de testnet sin errores.
  - `withdraw()` de fondos acumulados verificado en testnet.
- **Tareas Técnicas**:
  - `TASK-24.1`: Script de prueba de humo E2E en Amoy documentando hashes de transacciones.
  - `TASK-24.2`: Verificar Pull-over-Push y `withdraw()` con transacciones reales.

#### US-25: Formalización del Hito Regulatorio `H-COMPLIANCE` (4 SP)
- **Como** responsable legal del proyecto,  
  **quiero** documentar el dictamen legal sobre MiCA y el régimen tributario de royalties,  
  **para** garantizar operación dentro del marco regulatorio antes de mainnet.
- **Criterios de Aceptación**:
  - Informe legal ratificando NFTs como utility tokens (voucher de servicio) bajo MiCA.
  - Guía fiscal para declaración de criptoactivos (IS, Modelo 172).
  - Aprobación formal registrada en el repositorio.
- **Tareas Técnicas**:
  - `TASK-25.1`: Recopilar dictámenes y anexar acta de cumplimiento al repositorio (`docs/COMPLIANCE.md`).

---

## 3. Matriz de Trazabilidad: Requisitos PRD/SRS ↔ Historias de Usuario

| Requisito PRD / SRS | Descripción del Requisito | Historia(s) Asignada(s) | Sprint |
|---------------------|---------------------------|--------------------------|--------|
| **RF-01** | Catálogo Público de NFTs | `US-10`, `US-07b` | Sprint 4, 3 |
| **RF-02** | Filtros y Buscador (<500ms) | `US-10`, `US-04` | Sprint 4, 2 |
| **RF-03** | Back-office Gestión Inventario | `US-16`, `US-05` | Sprint 5, 2 |
| **RF-04** | Compra de NFT Anónima | `US-11`, `US-02` | Sprint 4, 1 |
| **RF-05** | Notificación Email al Propietario | `US-08` | Sprint 3 |
| **RF-06** | Reventa Marketplace y Royalties | `US-15`, `US-02`, `US-01` | Sprint 5, 1 |
| **RF-07** | Generación y Entrega de QR | `US-12` | Sprint 4 |
| **RF-08** | Validación de QR en Recepción | `US-14` | Sprint 5 |
| **RF-09** | Dashboard del Propietario (7 métricas) | `US-16` | Sprint 5 |
| **RF-10** | Histórico de Ventas Público | `US-17` | Sprint 3 |
| **RF-11** | Quema Automática de NFTs (Burn) | `US-09`, `US-01` | Sprint 3, 1 |
| **RF-12** | Notificaciones Push Web (Opt-in) | `US-18` | Sprint 5 |
| **RNF-01** | Carga móvil LCP < 2.5s | `US-10` | Sprint 4 |
| **RNF-02** | Respuesta filtros < 500ms | `US-10`, `US-04` | Sprint 4, 2 |
| **RNF-03** | Validación QR < 3s | `US-14` | Sprint 5 |
| **RNF-04** | Uptime ≥ 99.5% (RPO < 1h, RTO < 4h) | `US-04`, `US-07` | Sprint 2, 3 |
| **RNF-05** | Concurrencia 200 usuarios | `US-23`, `US-04` | Sprint 6, 2 |
| **RNF-06** | Auth Admin MFA + RTR + Blocklist | `US-05` | Sprint 2 |
| **RNF-07** | Tests Foundry (unitarios + fuzzing) | `US-01`, `US-02` | Sprint 1 |
| **RNF-08** | Multi-RPC Failover y Reconciliación | `US-07` | Sprint 3 |
| **RNF-09** | Resiliencia Precios CoinGecko | `US-06` | Sprint 2 |
| **RNF-10** | Heartbeat de Listener | `US-07` | Sprint 3 |
| **RNF-11** | Privacidad RGPD (Compra anónima) | `US-11`, `US-12` | Sprint 4 |
| **RNF-12** | Registro de Viajeros RD 933/2021 | `US-14` (recepción física) | Sprint 5 |
| **RNF-13** | Multidioma ES / EN / RU | `US-13` | Sprint 4 |
| **RNF-14** | Mobile-first Responsive | `US-10`, `US-11` | Sprint 4 |
| **RNF-15** | Accesibilidad WCAG 2.1 AA | Fase 2 (post-MVP) | — |
| **RNF-16** | Distribución CDN Cloudflare | Fase 2 (post-MVP) | — |
| **H-COMPLIANCE** | Dictamen MiCA y Fiscalidad | `US-25` | Sprint 6 |
| **DevOps/CI** | Pipeline CI/CD, Monorepo, Vault | `US-00` | Sprint 0 |

---

## 4. Deuda Técnica Planificada (Fase 2 Post-MVP)

Las siguientes decisiones se posponen explícitamente a Fase 2 y deben ser abordadas antes del lanzamiento a producción definitivo:

| Ítem | Descripción | Sprint sugerido Fase 2 |
|------|-------------|------------------------|
| **CDN Cloudflare** | Configuración DNS/proxy, WAF básico, caché de estáticos | F2-S1 |
| **WCAG 2.1 AA** | Auditoría axe-core del catálogo y checkout | F2-S1 |
| **Backup/DR** | pg_dump diario automatizado a GCS; prueba de restore mensual | F2-S1 |
| **Textos legales** | T&C, Política de Privacidad, Aviso Legal en `/legal` | F2-S2 |
| **Consulta fiscal** | IVA aplicable en venta de NFTs en España (asesor externo) | F2-S1 |

---
*Backlog de Sprints v1.1.0 — Post-Auditoría · 17 hallazgos resueltos · 142 SP · 13 semanas.*

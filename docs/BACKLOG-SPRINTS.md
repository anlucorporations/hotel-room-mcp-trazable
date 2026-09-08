# Backlog de Sprints y Desglose de Historias de Usuario
## Hotel Marina del Sol: Plataforma NFT de Reservas

> **Versión**: 1.2.0  
> **Fecha**: 2026-09-08  
> **Estado**: Aprobado — Post-Auditoría v3 (21 hallazgos resueltos)  
> **Alineación**: PRD v1.1.0 y SRS v1.3.0  
> **Sprint Cadence**: Sprint 0 (1 semana) + 6 Sprints de 2 semanas = **13 semanas en total**  

---

## 0. Definición de Hecho (DoD) — Global

Los siguientes criterios aplican de forma obligatoria a **todas** las historias de usuario:

- [ ] Código revisado en merge request por al menos 1 par.
- [ ] Tests unitarios y de integración escritos y pasando en CI (pipeline GitLab).
- [ ] **Cobertura de código ≥ 80%** (contratos: Foundry lcov; backend: Jest/Pytest).
- [ ] **Análisis estático de contratos con `slither .` sin hallazgos HIGH o CRITICAL** obligatorio en el pipeline CI para cualquier cambio o pull request que afecte contratos inteligentes.
- [ ] Despliegue en entorno correspondiente verificado (Anvil → Sprint 0/1/2, Polygon Amoy en GCP → Sprint 3+).
- [ ] Criterios de aceptación de la historia validados manualmente o con test E2E.
- [ ] Documentación técnica actualizada si el cambio modifica una interfaz pública o esquema de BD.

---

## 1. Resumen del Roadmap de Sprints

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ROADMAP DE SPRINTS                            │
├──────────┬──────────────────────────────────────────────┬───────────────┤
│ Sprint   │ Objetivo Principal                           │ Story Points  │
├──────────┼──────────────────────────────────────────────┼───────────────┤
│ Sprint 0 │ DevOps, CI/CD, Observabilidad y Cimientos    │ 8 SP          │
│ Sprint 1 │ Smart Contracts Core, Pausable y Precios     │ 21 SP         │
│ Sprint 2 │ BD Indexada, Auth MFA, Health y Endpoints    │ 26 SP         │
│ Sprint 3 │ Listener, Notif., Bot Burner y Deploy Amoy   │ 21 SP         │
│ Sprint 4 │ Tienda Pública, Wallet, QR, Pases y E2E      │ 26 SP         │
│ Sprint 5 │ Recepción (MFA + On-chain), Reventa y Panel  │ 24 SP         │
│ Sprint 6 │ Pruebas Carga k6, Hardening y Compliance     │ 16 SP         │
├──────────┴──────────────────────────────────────────────┴───────────────┤
│ TOTAL: 142 Story Points                                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Detalle de Sprints e Historias de Usuario

---

### 🟣 SPRINT 0: DevOps, CI/CD, Observabilidad y Cimientos
**Duración**: Semana 1 · **Capacidad**: 8 SP · **Meta**: Infraestructura de desarrollo, pipeline CI automático, Sentry y entorno Anvil configurados.

#### US-00: Configuración del Monorepo, CI/CD y Observabilidad (8 SP)
- **Criterios de Aceptación**:
  - Monorepo inicializado: `packages/contracts`, `apps/api`, `apps/web`, `scripts/`.
  - Pipeline CI ejecuta linting, formateo, tests y `slither .` bloqueando en severidad HIGH o CRITICAL.
  - `docker-compose.yml` levanta PostgreSQL 16 y Redis 7 con un solo comando.
  - Foundry (`foundry.toml`) y OpenZeppelin v5 instalados y compilando.
  - Sentry integrado en backend y exportación de logs JSON estructurados configurada para GCP Cloud Logging.
  - Instancia GCP aprovisionada con Foundry para despliegues en Polygon Amoy.
- **Tareas Técnicas**:
  - `TASK-00.1`: Estructura de monorepo, `.gitignore` y convenciones de ramas.
  - `TASK-00.2`: `.gitlab-ci.yml` con stages: `lint` → `test` → `coverage` → `slither` → `deploy-preview`.
  - `TASK-00.3`: `docker-compose.yml` con PostgreSQL 16 y Redis 7.
  - `TASK-00.4`: Verificación de Foundry, OpenZeppelin v5 y Slither.
  - `TASK-00.5`: Configuración de instancia GCP y conectividad RPC.
  - `TASK-00.6`: Integración de Sentry y formato de logging estructurado.

---

### 🟢 SPRINT 1: Smart Contracts Core, Pausable y Protección Anti-evasión
**Duración**: Semanas 2 y 3 · **Capacidad**: 21 SP · **Meta**: Contratos compilados, verificados en Foundry con cobertura ≥ 80% y desplegados en Anvil local.

#### US-01: Contrato `HotelNFT.sol` con AccessControl, Pausable y `markCheckedIn` (8 SP)
- **Criterios de Aceptación**:
  - `DEFAULT_ADMIN_ROLE`: Configuración global, `setMarketplaceContract()` y pausado de emergencia (`pause()`/`unpause()`).
  - `MINTER_ROLE`: Acuñación masiva (≤50 tokens/lote) mediante relayer backend.
  - `BURNER_ROLE`: Quema exclusiva de tokens no vendidos (`burn` y `burnBatch`).
  - `RECEPTION_ROLE`: Función `markCheckedIn(tokenId)` que marca la estancia y bloquea transferencias en `_update()`.
  - `royaltyInfo` calcula 5% (simples/dobles) y 10% (suite).
  - Slither en CI sin alertas HIGH ni CRITICAL.
- **Tareas Técnicas**:
  - `TASK-01.1`: Implementación de `HotelNFT.sol` con roles OpenZeppelin y Pausable.
  - `TASK-01.2`: Lógica de `markCheckedIn()` y bloqueo de transferencias en `_update()`.
  - `TASK-01.3`: Tests unitarios y fuzzing en Foundry (`HotelNFT.t.sol`).

#### US-02: Contrato `HotelMarketplace.sol` con Pull-over-Push y `minListingPrice` (8 SP)
- **Criterios de Aceptación**:
  - `minListingPrice` configurable por `DEFAULT_ADMIN_ROLE` para evitar ventas a 1 wei que evadan royalties.
  - `listForSale(tokenId, price)` valida que el NFT no esté marcado como `isCheckedIn`.
  - Liquidación mediante Pull-over-Push (`pendingWithdrawals` + `withdraw()`).
  - Protección `nonReentrant` y control `whenNotPaused`.
- **Tareas Técnicas**:
  - `TASK-02.1`: Implementar `HotelMarketplace.sol` con `minListingPrice` y `withdraw()`.
  - `TASK-02.2`: Tests en Foundry (`Marketplace.t.sol`) simulando wash trading y reentrancy.

#### US-03: Entorno Local Anvil y Scripts de Despliegue Foundry (5 SP)
- **Criterios de Aceptación**:
  - Script `Deploy.s.sol` despliega `HotelNFT` y `HotelMarketplace`, enlaza contratos y exporta ABIs a `packages/shared`.
- **Tareas Técnicas**:
  - `TASK-03.1`: Script Foundry `Deploy.s.sol`.
  - `TASK-03.2`: Exportación automatizada de ABIs y direcciones de contratos.

---

### 🟢 SPRINT 2: Backend Core, Base de Datos, Health Checks y Endpoints Catálogo
**Duración**: Semanas 4 y 5 · **Capacidad**: 26 SP · **Meta**: Base de datos indexada, endpoints de catálogo funcionales, health checks y autenticación protegida con MFA TOTP obligatorio.

#### US-04: Esquema de Base de Datos Off-chain y Health Checks (5 SP)
- **Criterios de Aceptación**:
  - Tablas: `nfts` (con `check_in_secret_enc` AES-256-GCM), `listings`, `sale_events`, `admin_sessions`, `mfa_recovery_codes`, `email_notifications`.
  - Endpoints `GET /health/live` (200 OK) y `GET /health/ready` (comprobando PostgreSQL, Redis y RPC).
- **Tareas Técnicas**:
  - `TASK-04.1`: Migraciones DDL completas en PostgreSQL.
  - `TASK-04.2`: Creación de índices compuestos optimizados.
  - `TASK-04.3`: Tests de integración de BD.
  - `TASK-04.4`: Implementación de endpoints `/health/live` y `/health/ready`.

#### US-05: Autenticación con MFA Obligatorio (Admin y Recepción) y JWT Blocklist (13 SP)
- **Criterios de Aceptación**:
  - Cuentas de Administrador y Recepción exigen contraseña + MFA TOTP obligatorio.
  - Refresh Token Rotation (RTR) con hash SHA-256 en BD.
  - Logout añade JWT a blocklist en Redis (TTL = expiración restante).
  - `mintBatch` exige `confirmTotpCode` en el cuerpo de la petición.
- **Tareas Técnicas**:
  - `TASK-05.1`: Endpoints `/auth/login`, `/auth/mfa/verify`, `/auth/refresh`, `/auth/logout`.
  - `TASK-05.2`: Middleware de validación TOTP y JWT blocklist.
  - `TASK-05.3`: 8 códigos de rescate con hash bcrypt.
  - `TASK-05.4`: Tests de seguridad de autenticación.

#### US-06: Servicio Resiliente de Cotización EUR con Caché (<5ms) (3 SP)
- **Criterios de Aceptación**:
  - Worker actualiza MATIC/EUR cada 5 minutos en Redis; respuesta en < 5ms; fallback dinámico a Binance.
- **Tareas Técnicas**:
  - `TASK-06.1`: Worker de cotizaciones con circuit breaker.
  - `TASK-06.2`: Tests de fallback y caché en memoria.

#### US-07b: Endpoints Backend del Catálogo y Metadatos (5 SP)
- **Criterios de Aceptación**:
  - `GET /api/nfts` con filtros reactivos (< 500ms) y paginación.
  - `GET /api/nfts/:tokenId/metadata` compatible con el estándar ERC-721.
- **Tareas Técnicas**:
  - `TASK-07b.1`: Implementación de `GET /api/nfts`.
  - `TASK-07b.2`: Endpoint de metadatos `GET /api/nfts/:tokenId/metadata`.

---

### 🟢 SPRINT 3: Event Listener, Bot Burner y Primer Deploy Amoy
**Duración**: Semanas 6 y 7 · **Capacidad**: 21 SP · **Meta**: Sincronización continua de eventos on-chain, bot burner desatendido, alertas técnicas dirigidas y despliegue inicial en testnet.

#### US-07: Sincronizador de Eventos On-chain con Alerta a DevOps (8 SP)
- **Criterios de Aceptación**:
  - WebSocket con heartbeat cada 30s y timeout de respuesta de **5000ms**.
  - Alerta por email a `DEVOPS_ALERT_EMAIL` si no hay eventos en 10 minutos.
  - Persistencia de `lastBlockProcessed` y reconciliación con `eth_getLogs`.
  - Rotación de `check_in_secret_enc` ante `NFTSold`.
- **Tareas Técnicas**:
  - `TASK-07.1`: EventListener con multi-RPC, heartbeat de 5000ms y alerta de silencio.
  - `TASK-07.2`: Transiciones de estado atómicas en BD.
  - `TASK-07.3`: Tests de reconciliación tras caída de red.

#### US-08: Cola Asíncrona de Notificaciones con Resiliencia en BD (3 SP)
- **Criterios de Aceptación**:
  - Notificación de venta despachada a Carlos en < 60s.
  - Registro previo en tabla `email_notifications` (PENDING) con cron de reconciliación ante caídas de Redis.
- **Tareas Técnicas**:
  - `TASK-08.1`: Cola BullMQ y plantilla responsiva.
  - `TASK-08.2`: Mecanismo de persistencia y reconciliación de correos.

#### US-09: Bot Burner con Redlock y Alerta Técnica de Gas (5 SP)
- **Criterios de Aceptación**:
  - Ejecución a las **12:00 PM Europe/Madrid**.
  - Redis Redlock (`hotel:burn:lock`, TTL 30s).
  - Alerta enviada a `DEVOPS_ALERT_EMAIL` si el saldo es < 5 POL (cancela la ejecución).
- **Tareas Técnicas**:
  - `TASK-09.1`: Cron job con timezone `Europe/Madrid` y Redlock.
  - `TASK-09.2`: Verificación de saldo y firma de transacciones con vault.

#### US-17: Histórico Público de Ventas y Reventas (5 SP)
- **Criterios de Aceptación**:
  - `GET /api/sales/history` con filtros y exportación CSV.
- **Tareas Técnicas**:
  - `TASK-17.1`: Endpoint de histórico y exportador CSV.

#### US-20: Primer Despliegue en Polygon Amoy vía Foundry en GCP (0 SP — Hito)
- **Criterios de Aceptación**:
  - `HotelNFT` y `HotelMarketplace` desplegados y verificados en Polygonscan Amoy desde la instancia GCP.
- **Tareas Técnicas**:
  - `TASK-20.1`: Despliegue en Amoy y verificación on-chain.

---

### 🟢 SPRINT 4: Frontend Tienda Pública, Pases Wallet y Checkout Anónimo
**Duración**: Semanas 8 y 9 · **Capacidad**: 26 SP · **Meta**: Tienda pública operativa, compra anónima Web3, generación de resguardos y pases móviles, y tests E2E.

#### US-10: Catálogo Público Responsivo en Tiempo Real (5 SP)
- **Criterios de Aceptación**:
  - Carga LCP < 2.5s; filtros combinables con respuesta < 500ms; mobile-first.
- **Tareas Técnicas**:
  - `TASK-10.1`: Componentes UI del catálogo y filtros reactivos.
  - `TASK-10.2`: Consumo del endpoint `/api/nfts`.

#### US-11: Conexión Wallet y Checkout Anónimo On-chain (8 SP)
- **Criterios de Aceptación**:
  - Integración wagmi/viem (MetaMask, WalletConnect v2); compra anónima directa.
- **Tareas Técnicas**:
  - `TASK-11.1`: Proveedor Web3 y modal de conexión.
  - `TASK-11.2`: Hook de compra con `HotelMarketplace.buy()`.

#### US-12: Resguardo QR Seguro y Pases Digitales Apple/Google Wallet (8 SP)
- **Criterios de Aceptación**:
  - QR con secreto AES-256-GCM; re-descarga con firma EIP-712.
  - Generación de pase `.pkpass` (Apple Wallet) con `passkit-generator` y pase Google Wallet mediante `GET /api/wallet/pass/:tokenId`.
- **Tareas Técnicas**:
  - `TASK-12.1`: Generación de QR criptográfico y re-descarga EIP-712.
  - `TASK-12.2`: Descarga de resguardos en PNG/PDF.
  - `TASK-12.2b`: Servicio de generación y firma de pases Apple y Google Wallet.

#### US-13: Internacionalización Multilingüe (ES / EN / RU) (3 SP)
- **Criterios de Aceptación**:
  - Soporte ES, EN, RU con selector en cabecera.
- **Tareas Técnicas**:
  - `TASK-13.1`: Configuración de framework i18n y archivos de traducción.

#### US-21: Tests E2E Frontend Sprint 4 con Playwright (2 SP)
- **Criterios de Aceptación**:
  - Cobertura de pruebas E2E para catálogo, checkout y descarga de pases.
- **Tareas Técnicas**:
  - `TASK-21.1`: Suite de pruebas E2E en Playwright.

---

### 🟢 SPRINT 5: Recepción (MFA + On-chain), Reventa y Back-office
**Duración**: Semanas 10 y 11 · **Capacidad**: 24 SP · **Meta**: Módulo de recepción seguro con validación on-chain y contingencia, reventa y panel de Carlos.

#### US-14: Validación Segura en Recepción con MFA, On-chain y Contingencia (6 SP)
- **Criterios de Aceptación**:
  - Acceso a web de recepción protegido por MFA TOTP obligatorio.
  - Validación de QR invoca `markCheckedIn(tokenId)` on-chain y marca `CHECKED_IN` en BD.
  - **Protocolo de contingencia**: Recepción puede buscar por habitación y fecha para ejecutar check-in asistido si el huésped no dispone de dispositivo móvil.
  - El cumplimiento del RD 933/2021 se registra físicamente en el PMS del hotel.
- **Tareas Técnicas**:
  - `TASK-14.1`: Interfaz web de recepción con lector de cámara y soporte MFA.
  - `TASK-14.2`: Integración de llamada on-chain `markCheckedIn(tokenId)`.
  - `TASK-14.3`: Flujo de contingencia asistido por habitación y fecha.

#### US-15: Marketplace de Reventa Propio con Flujo Guiado (7 SP)
- **Criterios de Aceptación**:
  - Vista "Mis Noches"; validación de que el precio propuesto sea `price >= minListingPrice`.
- **Tareas Técnicas**:
  - `TASK-15.1`: UI de gestión de reventa.
  - `TASK-15.2`: Flujo guiado de `approve()` y `listForSale()`.

#### US-16: Back-office Carlos: Minteo con Re-MFA y Dashboard Financiero (8 SP)
- **Criterios de Aceptación**:
  - Formulario de alta masiva con orquestación atómica: `mintBatch` → `approve` → `listForSale`.
  - Re-confirmación obligatoria de TOTP antes de enviar la transacción de minteo.
  - Dashboard de 7 métricas y exportador CSV.
- **Tareas Técnicas**:
  - `TASK-16.1`: Panel de minteo masivo con re-MFA.
  - `TASK-16.2`: Componentes de gráficas y exportador CSV.

#### US-18: Notificaciones Web Push Opt-in (3 SP)
- **Criterios de Aceptación**:
  - Suscripción Web Push anónima ante ventas de reventa.
- **Tareas Técnicas**:
  - `TASK-18.1`: Worker Web Push (FCM).
  - `TASK-18.2`: Toggle UI en frontend.

#### US-22: Tests E2E Frontend Sprint 5 con Playwright (0 SP — Hito)
- **Criterios de Aceptación**:
  - Pruebas E2E de check-in on-chain, contingencia y reventa ejecutadas en staging.
- **Tareas Técnicas**:
  - `TASK-22.1`: Suite Playwright para flujos operativos de recepción y reventa.

---

### 🟢 SPRINT 6: Testing k6, Validación Integral Amoy y Compliance
**Duración**: Semanas 12 y 13 · **Capacidad**: 16 SP · **Meta**: Pruebas de estrés con 200 usuarios, validación E2E en Polygon Amoy y cierre del hito regulatorio.

#### US-23: Pruebas de Carga de Rendimiento k6 (200 Usuarios Concurrentes) (6 SP)
- **Criterios de Aceptación**:
  - 200 usuarios concurrentes × 10 min; p95 < 500ms; 0% errores 5xx.
- **Tareas Técnicas**:
  - `TASK-23.1`: Scripts k6 (`scripts/load-tests/catalog.js`).
  - `TASK-23.2`: Ejecución y reporte de telemetría.

#### US-24: Validación Integral en Polygon Amoy y Ciclo E2E Completo (6 SP)
- **Criterios de Aceptación**:
  - Ciclo completo verificado: minteo → compra → check-in on-chain (`markCheckedIn`) → retiro Pull-over-Push (`withdraw`).
- **Tareas Técnicas**:
  - `TASK-24.1`: Ejecución del ciclo E2E completo en testnet documentando hashes.

#### US-25: Formalización del Hito Regulatorio `H-COMPLIANCE` (4 SP)
- **Criterios de Aceptación**:
  - Informe MiCA y guía fiscal anexados al repositorio (`docs/COMPLIANCE.md`).
  - Guía operativa de custodios multisig validada (`docs/GUIA-GNOSIS-SAFE.md`).
- **Tareas Técnicas**:
  - `TASK-25.1`: Documentación legal formalizada.

---

## 3. Matriz de Trazabilidad Completa: Requisitos ↔ Historias

| Requisito PRD / SRS | Descripción del Requisito | Historia(s) de Usuario | Sprint |
|---------------------|---------------------------|------------------------|--------|
| **RF-01** | Catálogo Público de NFTs | `US-10`, `US-07b` | Sprint 4, 2 |
| **RF-02** | Filtros y Buscador (<500ms) | `US-10`, `US-04` | Sprint 4, 2 |
| **RF-03** | Back-office Gestión Inventario | `US-16`, `US-05` | Sprint 5, 2 |
| **RF-04** | Compra de NFT Anónima | `US-11`, `US-02` | Sprint 4, 1 |
| **RF-05** | Notificación Email al Propietario | `US-08` | Sprint 3 |
| **RF-06** | Reventa Marketplace y Royalties | `US-15`, `US-02`, `US-01` | Sprint 5, 1 |
| **RF-07** | Generación y Entrega de QR / Passes | `US-12` | Sprint 4 |
| **RF-08** | Validación de QR en Recepción | `US-14` | Sprint 5 |
| **RF-09** | Dashboard del Propietario (7 métricas) | `US-16` | Sprint 5 |
| **RF-10** | Histórico de Ventas Público | `US-17` | Sprint 3 |
| **RF-11** | Quema Automática de NFTs (Burn) | `US-09`, `US-01` | Sprint 3, 1 |
| **RF-12** | Notificaciones Push Web (Opt-in) | `US-18` | Sprint 5 |
| **RNF-01** | Carga móvil LCP < 2.5s / E2E | `US-10`, `US-21` | Sprint 4 |
| **RNF-02** | Respuesta filtros < 500ms | `US-10`, `US-04` | Sprint 4, 2 |
| **RNF-03** | Validación QR < 3s / On-chain | `US-14`, `US-22` | Sprint 5 |
| **RNF-04** | Uptime ≥ 99.5% y Health Checks | `US-04`, `US-07` | Sprint 2, 3 |
| **RNF-05** | Concurrencia 200 usuarios k6 | `US-23` | Sprint 6 |
| **RNF-06** | Auth Admin/Recepción MFA + RTR | `US-05`, `US-14` | Sprint 2, 5 |
| **RNF-07** | Tests Foundry (unitarios + fuzzing)| `US-01`, `US-02`, `US-03` | Sprint 1 |
| **RNF-08** | Multi-RPC Failover y Deploy Amoy | `US-07`, `US-20`, `US-24` | Sprint 3, 6 |
| **RNF-09** | Resiliencia Precios CoinGecko | `US-06` | Sprint 2 |
| **RNF-10** | Heartbeat de Listener (5000ms) | `US-07` | Sprint 3 |
| **RNF-11** | Privacidad RGPD (Compra anónima) | `US-11`, `US-12` | Sprint 4 |
| **RNF-12** | Registro Viajeros RD 933/2021 (PMS) | `US-14` | Sprint 5 |
| **RNF-13** | Multidioma ES / EN / RU | `US-13` | Sprint 4 |
| **RNF-14** | Mobile-first Responsive | `US-10`, `US-11` | Sprint 4 |
| **H-COMPLIANCE**| Dictamen MiCA y Fiscalidad | `US-25` | Sprint 6 |
| **DevOps/CI** | CI/CD, Monorepo y Sentry | `US-00` | Sprint 0 |

---
*Backlog de Sprints v1.2.0 — Post-Auditoría v3 · 142 Story Points · 13 semanas.*

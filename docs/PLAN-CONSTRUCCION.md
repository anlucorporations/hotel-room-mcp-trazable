# Plan de Construcción del Software
## Hotel Marina del Sol: Plataforma NFT de Reservas

> **Versión**: 1.2.0  
> **Fecha**: 2026-09-08  
> **Estado**: Aprobado — Post-Auditoría v3 (21 hallazgos resueltos)  
> **Alineación**: PRD v1.1.0 y SRS v1.3.0  
> **Repositorio**: `hotel-room-mcp-trazable`  

---

## 1. Introducción y Enfoque de Construcción

Este plan establece la estrategia técnica, metodología, fases secuenciales, gestión de entornos y compuertas de calidad (*Quality Gates*) para construir la plataforma Web3 de reservas hoteleras tokenizadas del **Hotel Marina del Sol**.

El desarrollo sigue un enfoque **incremental y guiado por pruebas (TDD/BDD)**.

**Toolchain de despliegue**: [Foundry](https://book.getfoundry.sh/) (`forge script`) ejecutado en **instancia GCP del equipo** para todos los despliegues en Polygon Amoy (testnet) y Polygon PoS (mainnet). Los despliegues locales usan Foundry con Anvil.

---

## 2. Estrategia de Entornos y Despliegue

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   DESARROLLO    │      │     TESTNET      │      │   PRODUCCIÓN    │
│   (Local)       │ ───> │ (Polygon Amoy)   │ ───> │  (Polygon PoS)  │
│                 │      │                  │      │                 │
│ Anvil Local     │      │ ChainId: 80002   │      │ ChainId: 137    │
│ Wallet 0 Admin  │      │ Foundry en GCP   │      │ Gnosis Safe     │
│ Wallet 1 Minter │      │ Hot-wallet QA    │      │ Relayer Backend │
│ Wallet 2 Burner │      │ Cloud DB Staging │      │ Cloud DB Prod   │
│ Wallet 3 Recept.│      │ Sentry Staging   │      │ Sentry Prod     │
└─────────────────┘      └──────────────────┘      └─────────────────┘
```

| Parámetro | Entorno Desarrollo (Local) | Entorno Pruebas (Testnet) | Entorno Producción (Mainnet) |
|-----------|----------------------------|---------------------------|------------------------------|
| **Red Blockchain** | Anvil local (Foundry) | **Polygon Amoy (PoS)** | **Polygon PoS** |
| **Chain ID** | 31337 | **80002** | **137** |
| **RPC Primario** | `http://127.0.0.1:8545` | Alchemy Polygon Amoy RPC | Alchemy Polygon Mainnet RPC |
| **RPC Respaldo** | N/A | Infura Polygon Amoy RPC | Infura Polygon Mainnet RPC |
| **Toolchain Deploy**| `forge script` (local) | `forge script` en **GCP** | `forge script` en **GCP** |
| **DEFAULT_ADMIN_ROLE** | Cuenta 0 de Anvil | Wallet QA dedicada | **Gnosis Safe Multisig 2-of-3** |
| **MINTER_ROLE** | Cuenta 1 de Anvil | Wallet Minter Testnet | Hot-wallet Relayer Backend |
| **BURNER_ROLE** | Cuenta 2 de Anvil | Wallet Bot Testnet | Hot-wallet Bot Backend |
| **RECEPTION_ROLE** | Cuenta 3 de Anvil | Wallet Recepción Testnet | Hot-wallet Recepción Backend |
| **Observabilidad**| Logs en consola | Sentry Staging + Cloud Logs | Sentry Prod + Cloud Logs |

---

## 3. Fases de Construcción e Hitos

```
F0: DevOps, CI/CD & Observabilidad (Semana 1)
         │
         ▼
F1: Smart Contracts Core, Pausable & Anti-evasión (Semanas 2–3)
         │
         ▼
F2: Backend Core, Base de Datos, Health & Endpoints Catálogo (Semanas 4–5)
         │
         ▼
F3: Listener, Bot Burner con Redlock & 1er Deploy Amoy (Semanas 6–7)
         │
         ▼
F4: Frontend Web3, Catálogo, Passes & Tests E2E (Semanas 8–9)
         │
         ▼
F5: Recepción (MFA + markCheckedIn), Reventa & Back-office (Semanas 10–11)
         │
         ▼
F6: Pruebas k6, Hardening, Compliance & Validación Amoy (Semanas 12–13)
```

---

### Fase 0: DevOps, CI/CD y Cimientos (Semana 1)
- **Objetivo**: Establecer el monorepo estructurado, pipeline CI automático, observabilidad base y contenerización local.
- **Entregables**:
  - Monorepo: `packages/contracts`, `apps/api`, `apps/web`, `scripts/`.
  - `.gitlab-ci.yml` con stages: `lint` → `test` → `coverage` → `slither` → `deploy-preview`.
  - Integración de Sentry en API y Workers; configuración de exportación de logs JSON estructurados.
  - `docker-compose.yml` con PostgreSQL 16 y Redis 7 para desarrollo local.
  - Foundry + OpenZeppelin v5.x instalados y compilando.
  - Instancia GCP con Foundry instalado y conectividad RPC verificada.

---

### Fase 1: Smart Contracts Core y Suite de Pruebas (Semanas 2–3)
- **Objetivo**: Desarrollar contratos inteligentes seguros con protección anti-evasión y prevención de doble gasto.
- **Entregables**:
  - `HotelNFT.sol`: ERC-721 + EIP-2981 + AccessControl + Pausable.
    - `mintBatch()` restringido a `MINTER_ROLE` (≤50 tokens/lote).
    - `markCheckedIn()` on-chain restringido a `RECEPTION_ROLE` bloqueando transferencias en `_update()`.
    - `burn()` y `burnBatch()` restringidos a `BURNER_ROLE`.
    - `setMarketplaceContract()` y `pause()` / `unpause()` para `DEFAULT_ADMIN_ROLE`.
  - `HotelMarketplace.sol`: ReentrancyGuard + AccessControl + Pausable + Pull-over-Push + `minListingPrice` anti-evasión.
  - Cobertura de pruebas en Foundry ≥ 80%.
  - Slither en CI sin hallazgos HIGH ni CRITICAL.

---

### Fase 2: Backend Core, Base de Datos, Health y Endpoints (Semanas 4–5)
- **Objetivo**: Capa de datos relacional, endpoints del catálogo listos antes de frontend, observabilidad y autenticación.
- **Entregables**:
  - Tablas: `nfts`, `listings`, `sale_events`, `admin_sessions`, `mfa_recovery_codes`, `email_notifications`.
  - Endpoints del catálogo completos: `GET /api/nfts` con filtros y `GET /api/nfts/:tokenId/metadata`.
  - Health checks: `GET /health/live` y `GET /health/ready` (comprobación PostgreSQL, Redis y RPC).
  - Autenticación con MFA TOTP obligatorio para administradores y personal de recepción; JWT Blocklist en Redis.
  - Worker de cambio EUR (< 5ms de latencia de lectura con fallback a Binance).

---

### Fase 3: Event Listener, Bot Burner y Despliegue en Amoy (Semanas 6–7)
- **Objetivo**: Sincronización continua de eventos, scheduler desatendido seguro y primer despliegue real en testnet.
- **Entregables**:
  - Event Listener WebSocket con timeout de ping en **5000ms**, reconciliación `eth_getLogs` y alerta a `DEVOPS_ALERT_EMAIL` tras 10 min en silencio.
  - Bot Burner con cron a las **12:00 PM Europe/Madrid**, Redis Redlock (TTL 30s) y alerta si saldo < 5 POL.
  - Worker de correos BullMQ con persistencia y reconciliación en tabla `email_notifications`.
  - Histórico de ventas: `GET /api/sales/history` con exportación CSV.
  - Primer despliegue verificado en Polygon Amoy (chainId 80002) usando Foundry en GCP.

---

### Fase 4: Frontend Web3, Catálogo y Pases Digitales (Semanas 8–9)
- **Objetivo**: Experiencia de usuario móvil, compra anónima y generación de resguardos y pases Wallet.
- **Entregables**:
  - Catálogo reactivo con filtros (< 500ms) y carga LCP < 2.5s.
  - Checkout anónimo con MetaMask y WalletConnect v2.
  - Resguardo QR con AES-256-GCM y re-descarga con firma EIP-712.
  - Generación de pases Apple Wallet (`.pkpass` con passkit-generator) y Google Wallet (`.json`).
  - Internacionalización ES / EN / RU.
  - Pruebas E2E con Playwright para navegación, checkout y descarga.

---

### Fase 5: Módulos Operativos (Recepción, Reventa y Back-office) (Semanas 10–11)
- **Objetivo**: Módulo de recepción seguro con contingencia y marcado on-chain, reventa y analítica.
- **Entregables**:
  - Pantalla de recepción protegida con MFA TOTP: escaneo QR y llamada a `markCheckedIn()` on-chain en < 3s.
  - Flujo de contingencia en recepción: búsqueda manual por habitación/fecha asistida para huéspedes sin dispositivo.
  - Registro de viajeros RD 933/2021 formalmente documentado como operación en PMS físico.
  - Reventa guiada: `approve()` + `listForSale()` con verificación `price >= minListingPrice`.
  - Panel de Carlos: minteo masivo con re-confirmación TOTP, dashboard de 7 métricas y exportador CSV.
  - Tests E2E Playwright de recepción, reventa y minteo.

---

### Fase 6: Pruebas k6, Hardening y Compliance (Semanas 12–13)
- **Objetivo**: Validación de estrés, ciclo E2E completo en testnet y dictamen legal MiCA/fiscal.
- **Entregables**:
  - Prueba k6: 200 usuarios concurrentes, p95 < 500ms, 0% errores 5xx.
  - Validación de retiro Pull-over-Push con transacciones reales en Polygon Amoy.
  - Documento de compliance MiCA y régimen fiscal (`docs/COMPLIANCE.md`).
  - Guía operativa para custodios multisig (`docs/GUIA-GNOSIS-SAFE.md`).

---

## 4. Compuertas de Calidad (Quality Gates)

1. **Gate Fase 0**: Pipeline CI activo; Sentry configurado; conectividad GCP verificada.
2. **Gate Fase 1**: Cobertura Foundry ≥ 80%; `slither .` sin HIGH ni CRITICAL; test de `markCheckedIn()` impidiendo transferencias posteriores.
3. **Gate Fase 2**: Tests backend ≥ 80%; endpoints de catálogo operativos; `/health/ready` respondiendo en staging.
4. **Gate Fase 3**: Despliegue confirmado en Polygon Amoy; reconciliación probada ante corte simulado; alerta de silencio funcionando.
5. **Gate Fase 4**: LCP < 2.5s; generación y descarga de pases Wallet verificada; E2E pasando.
6. **Gate Fase 5**: Check-in asistido por MFA ejecutando `markCheckedIn()` on-chain; re-confirmación TOTP en minteo masivo.
7. **Gate Fase 6**: Test de estrés k6 superado; ciclo E2E en Amoy documentado; acta MiCA registrada.

---

## 5. Gestión de Riesgos y Runbook de Recuperación (SPOF GCP)

| Riesgo Técnico / Operativo | Impacto | Estrategia de Mitigación |
|-----------------------------|---------|--------------------------|
| **Caída de la Instancia Única de GCP (SPOF)** | Alto | **Runbook de Reinicio (RTO < 4h)**: La VM cuenta con imagen automatizada y reinicio automático de servicios vía systemd/Docker. Si la VM sufre una falla de hardware en GCP, el operador DevOps recrea la instancia desde el snapshot diario y re-enlaza la IP estática en < 30 minutos. El Event Listener reconcilia bloques automáticamente con `eth_getLogs`. |
| **Saldo de gas insuficiente en bot burner** | Alto | Alerta enviada a `DEVOPS_ALERT_EMAIL` si el saldo es < 5 POL; el bot cancela la ejecución previa. |
| **Doble gasto post check-in** | Crítico | Resuelto: `markCheckedIn()` en `HotelNFT.sol` bloquea transferencias on-chain irreversibles. |
| **Evasión de royalties (Wash trading)** | Alto | Resuelto: `minListingPrice` configurable en `HotelMarketplace.sol` impide ofertas a 1 wei. |
| **Pérdida de notificaciones por caída de Redis**| Medio| Resuelto: Registros persistentes en `email_notifications` con cron de reconciliación. |

---
*Plan de Construcción v1.2.0 — Post-Auditoría v3 · 13 semanas (Sprint 0 + Sprints 1-6).*

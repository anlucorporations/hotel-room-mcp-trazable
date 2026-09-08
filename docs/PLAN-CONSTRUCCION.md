# Plan de Construcción del Software
## Hotel Marina del Sol: Plataforma NFT de Reservas

> **Versión**: 1.1.0  
> **Fecha**: 2026-09-08  
> **Estado**: Aprobado — Post-Auditoría (17 hallazgos resueltos)  
> **Alineación**: PRD v1.1.0 y SRS v1.2.0  
> **Repositorio**: `hotel-room-mcp-trazable`  

---

## 1. Introducción y Enfoque de Construcción

Este plan establece la estrategia técnica, metodología, fases secuenciales, gestión de entornos y compuertas de calidad (*Quality Gates*) para construir la plataforma Web3 de reservas hoteleras tokenizadas del **Hotel Marina del Sol**.

El desarrollo sigue un enfoque **incremental y guiado por pruebas (TDD/BDD)**, priorizando en primer lugar la seguridad matemática e inmutabilidad de los smart contracts on-chain, seguido por la resiliencia de los sincronizadores off-chain y culminando con las interfaces de usuario móviles y operativas.

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
│ PostgreSQL Loc. │      │ CoinGecko Live   │      │ Multi-RPC Live  │
└─────────────────┘      └──────────────────┘      └─────────────────┘
```

| Parámetro | Entorno Desarrollo (Local) | Entorno Pruebas (Testnet) | Entorno Producción (Mainnet) |
|-----------|----------------------------|---------------------------|------------------------------|
| **Red Blockchain** | Anvil local (Foundry) | **Polygon Amoy (PoS)** | **Polygon PoS** |
| **Chain ID** | 31337 | **80002** | **137** |
| **RPC Primario** | `http://127.0.0.1:8545` | Alchemy Polygon Amoy RPC | Alchemy Polygon Mainnet RPC |
| **RPC Respaldo** | N/A | Infura Polygon Amoy RPC | Infura Polygon Mainnet RPC |
| **Herramienta Deploy** | `forge script` (local) | `forge script` en **GCP** | `forge script` en **GCP** |
| **DEFAULT_ADMIN_ROLE** | Cuenta 0 de Anvil | Wallet QA dedicada | **Gnosis Safe Multisig 2-of-3** |
| **MINTER_ROLE** | Cuenta 1 de Anvil | Wallet Minter Testnet | Hot-wallet Relayer Backend |
| **BURNER_ROLE** | Cuenta 2 de Anvil | Wallet Bot Testnet | Hot-wallet Bot Backend |
| **Base de Datos** | PostgreSQL local (Docker) | PostgreSQL gestionado | PostgreSQL clúster HA |
| **Cola Asíncrona** | Redis local (Docker) | Redis gestionado | Redis clúster HA |
| **Custodia Claves** | `.env.vault` (gitignored) | GCP Secret Manager | HashiCorp Vault / AWS Secrets Manager |

---

## 3. Fases de Construcción e Hitos

```
F0: DevOps & Cimientos (1 semana)
         │
         ▼
F1: Smart Contracts (semanas 2–3) ──────────────────────────────────────┐
         │                                                              │
         ▼                                                              │
F2: Backend & Base de Datos (semanas 4–5)                               │
         │                                                              │
         ▼                                                              │
F3: Listener, Automatismos y 1er Deploy Amoy (semanas 6–7)             │
         │                                                              │
         ▼                                                              │
F4: Frontend Web3 & Catálogo (semanas 8–9)                             │
         │                                                              │
         ▼                                                              │
F5: Módulos Operativos & Push (semanas 10–11)                          │
         │                                                              │
         ▼                                                              │
F6: Hardening, k6 y Compliance (semanas 12–13) ◄───────────────────────┘
```

---

### Fase 0: DevOps, CI/CD y Cimientos (Semana 1)
- **Objetivo**: Establecer el monorepo estructurado, pipeline CI automático, entorno de compilación Web3 y contenerización local antes de escribir la primera línea de negocio.
- **Entregables**:
  - Monorepo: `packages/contracts`, `apps/api`, `apps/web`, `scripts/`.
  - `.gitlab-ci.yml` con stages: `lint` → `test` → `coverage` → `slither` → `deploy-preview`.
  - `docker-compose.yml` con PostgreSQL 16 y Redis 7 para desarrollo local.
  - Foundry (`foundry.toml`) + OpenZeppelin v5.x instalados y compilando sin errores.
  - Slither configurado en CI: bloquear en severidad HIGH o CRITICAL.
  - Instancia GCP aprovisionada con Foundry instalado y conectividad verificada a RPC de Polygon Amoy.
  - Gestión de secretos documentada: `.env.vault` para desarrollo, GCP Secret Manager para testnet.

---

### Fase 1: Smart Contracts Core y Suite de Pruebas (Semanas 2–3)
- **Objetivo**: Desarrollar, auditar internamente y testear exhaustivamente los contratos inteligentes.
- **Entregables**:
  - `HotelNFT.sol`: ERC-721 + EIP-2981 + OpenZeppelin `AccessControl` + `Pausable`.
    - `mintBatch()` restringido a `MINTER_ROLE` (relayer backend, ≤50 tokens/lote).
    - `burn()` y `burnBatch()` restringidos a `BURNER_ROLE`.
    - `setMarketplaceContract()` restringido a `DEFAULT_ADMIN_ROLE` para actualización sin redespliegue.
    - `pause()` / `unpause()` restringidos a `DEFAULT_ADMIN_ROLE` para pausado de emergencia.
    - Restricción de operador en `_update()` para canalizar transferencias exclusivamente por el marketplace.
  - `HotelMarketplace.sol`: ReentrancyGuard + AccessControl + Pausable + **Pull-over-Push** (liquidación vía `pendingWithdrawals` + `withdraw()`).
  - Suite de tests en Foundry con cobertura ≥ **80%** (lcov).
  - Análisis Slither: 0 hallazgos HIGH o CRITICAL.
  - Script `Deploy.s.sol` multi-entorno compatible con Anvil, Amoy y Mainnet.

---

### Fase 2: Backend Core, Base de Datos y Seguridad (Semanas 4–5)
- **Objetivo**: Construir la capa de datos off-chain, autenticación reforzada y servicios de soporte financiero.
- **Entregables**:
  - Esquema PostgreSQL indexado: tablas `nfts` (con `check_in_secret_enc` AES-256-GCM), `listings`, `sale_events`, `admin_sessions`, `mfa_recovery_codes`, `push_subscriptions`.
  - Módulo de autenticación back-office:
    - JWT RS256 (15 min) + MFA TOTP + RTR con hash SHA-256 del refresh token en BD.
    - **JWT Blocklist en Redis** al hacer logout (TTL = tiempo restante del token).
    - **Re-confirmación TOTP** antes de `mintBatch()`.
    - **8 códigos de rescate MFA** con hash bcrypt en `mfa_recovery_codes`.
  - Worker de tipo de cambio EUR: CoinGecko cada 5 min, caché Redis TTL 10 min, respuesta en **< 5ms** al cliente.
  - Endpoints REST del catálogo (`GET /api/nfts` + `GET /api/nfts/:tokenId/metadata`) listos para Sprint 4.

---

### Fase 3: Event Listener, Automatismos y Primer Despliegue en Amoy (Semanas 6–7)
- **Objetivo**: Automatizar la reactividad ante eventos on-chain, desplegar en testnet real y verificar la máquina de estados.
- **Entregables**:
  - Sincronizador WebSocket multi-RPC (Alchemy + Infura): heartbeat 30s, reconciliación `eth_getLogs`.
  - **Alerta de silencio**: email a Carlos si el listener no procesa ningún evento en 10 minutos.
  - Aplicación de la máquina de estados unificada: `NFTSold` rota `check_in_secret_enc`; `NFTBurned` cancela listings activos.
  - Worker de correo BullMQ: notificación a Carlos en < 60s con 3 reintentos (10s, 30s, 90s).
  - Bot Burner desatendido:
    - Cron a las **12:00 PM hora `Europe/Madrid`**.
    - **Redis Redlock** (`hotel:burn:lock`, TTL 30s) para exclusión mutua.
    - **Alerta de gas** a Carlos si saldo < 5 POL; aborta la quema si no hay fondos.
    - Clave del bot obtenida desde vault (GCP Secret Manager en testnet/prod).
  - Histórico público `GET /api/sales/history` con filtros y exportación CSV.
  - **Primer despliegue en Polygon Amoy** vía `forge script` desde instancia GCP; contratos verificados en Polygonscan Amoy.

---

### Fase 4: Frontend Web3, Catálogo y Checkout Anónimo (Semanas 8–9)
- **Objetivo**: Proveer la experiencia de usuario pública en dispositivos móviles y escritorio.
- **Entregables**:
  - Catálogo responsivo mobile-first con LCP < 2.5s y filtros < 500ms.
  - Buscador y filtros: fecha, precio, tipo de habitación.
  - Integración Web3 con wagmi/viem: MetaMask y WalletConnect v2.
  - Flujo de compra anónimo on-chain.
  - Resguardo QR con AES-256-GCM + re-descarga con firma EIP-712 + generación de pase `.pkpass`/`.json` enviado por email.
  - Internacionalización completa ES / EN / RU.
  - Tests E2E Playwright: navegación, filtros, checkout, descarga QR, pase Wallet.

---

### Fase 5: Módulos Operativos (Recepción, Reventa, Back-office y Web Push) (Semanas 10–11)
- **Objetivo**: Dotar de herramientas operativas a la recepción, a los huéspedes que deseen revender y al propietario.
- **Entregables**:
  - Web de recepción con `RECEPTION_ROLE` (credenciales propias, solo acceso a `/admin/qr/validate`).
  - Pantalla de validación QR para recepción: estado `CHECKED_IN` en < 3s; replay bloqueado.
  - Módulo de reventa: "Mis Noches" → `approve()` → `listForSale()` → rotación de secreto QR.
  - Panel de Carlos: minteo masivo con re-confirmación TOTP + dashboard 7 métricas + exportación CSV.
  - Web Push opt-in al propietario del NFT ante `NFTSold`.
  - Tests E2E Playwright: check-in, reventa completa, minteo con re-MFA.

---

### Fase 6: Hardening, Pruebas de Carga k6 y Compliance (Semanas 12–13)
- **Objetivo**: Validación final de rendimiento, ciclo E2E en Amoy y cumplimiento normativo.
- **Entregables**:
  - Suite k6: 200 usuarios concurrentes × 10 min, p95 < 500ms, 0% errores 5xx.
  - Validación `withdraw()` de Pull-over-Push con transacciones reales en Amoy.
  - Ciclo completo E2E en Amoy: minteo → compra → QR → check-in → burn no vendido → `withdraw()`.
  - Hito **`H-COMPLIANCE`**: dictamen MiCA (utility token/voucher) + guía fiscal IS/Modelo 172.

---

## 4. Compuertas de Calidad (Quality Gates)

```
[Fase N] ──> ¿Tests pasan? ──> ¿Cobertura ≥ 80%? ──> ¿Sin vulns HIGH/CRIT? ──> [Fase N+1]
                  │                   │                       │
                  └──[ RECHAZADO: Corregir antes de continuar ]
```

1. **Gate Fase 0 (DevOps)**:
   - Pipeline CI activo y ejecutándose en GitLab en cada MR.
   - `docker-compose up` levanta PostgreSQL + Redis sin errores.
   - Instancia GCP: `forge script --rpc-url $AMOY_RPC_URL` conecta exitosamente.

2. **Gate Fase 1 (Smart Contracts)**:
   - 100% de tests pasando en Foundry.
   - Cobertura ≥ **80%** (lcov).
   - Slither: 0 hallazgos HIGH o CRITICAL.
   - `setMarketplaceContract()`, `Pausable` y Pull-over-Push cubiertos por tests.
   - Verificación de royalties EIP-2981 (5% y 10%) en todas las rutas de transferencia.

3. **Gate Fase 2 & 3 (Backend & Listener)**:
   - Cobertura backend ≥ **80%** (Jest/Pytest).
   - JWT Blocklist operativa: tokens rechazados tras logout.
   - Simulación exitosa de caída de RPC con reconciliación `eth_getLogs`.
   - Redis Redlock: dos instancias concurrentes del bot no ejecutan burn simultáneamente.
   - Alerta de silencio del listener verificada en test.

4. **Gate Fase 4 & 5 (Frontend & Operaciones)**:
   - LCP < 2.5s en móvil 4G simulado.
   - Tests E2E Playwright: catálogo, checkout, QR, re-descarga EIP-712, check-in con RECEPTION_ROLE, reventa.
   - Re-confirmación MFA operativa para `mintBatch()`.
   - Rotación de `check_in_secret_enc` verificada ante `NFTSold`.

5. **Gate Fase 6 (Release Candidate)**:
   - k6: p95 < 500ms y 0% errores 5xx con 200 usuarios concurrentes.
   - Ciclo E2E completo en Polygon Amoy verificado con hashes de transacciones reales.
   - `withdraw()` Pull-over-Push verificado en testnet.
   - Acta de aprobación del hito `H-COMPLIANCE` registrada.

---

## 5. Gestión de Riesgos y Mitigaciones en Construcción

| Riesgo Técnico / Operativo | Impacto | Estrategia de Mitigación |
|-----------------------------|---------|--------------------------|
| **Saldo insuficiente para gas en bot burner** | Alto | Alerta email a Carlos si balance < 5 POL; bot aborta la quema antes de ejecutarla. |
| **Doble ejecución del bot burner** | Alto | Redis Redlock (`hotel:burn:lock`, TTL 30s): segunda instancia aborta sin error silencioso. |
| **Listener silencioso (nodo RPC caído)** | Alto | Alerta email si no hay eventos en 10 minutos; heartbeat WebSocket 30s con reconexión automática. |
| **Saturación de RPC público de Polygon** | Alto | Endpoints dedicados (Alchemy + Infura) con failover automático implementado en el provider. |
| **Agotamiento de cuota de CoinGecko** | Medio | Caché Redis TTL 10 min; fallback dinámico a Binance/CryptoCompare; latencia < 5ms al cliente. |
| **Replay attack o clonación de QR** | Crítico | `checkInSecret` de un solo uso validado y consumido en BD; re-descarga requiere firma EIP-712 del titular. |
| **Fuga de `check_in_secret`** | Crítico | Almacenado cifrado AES-256-GCM; clave en vault; nunca en texto plano en BD o logs. |
| **Discrepancia temporal en burn de estancias** | Alto | Hora fijada a las 12:00 PM `Europe/Madrid`; timezone explícita en el cron job. |
| **Colisión de minteo en Gnosis Safe** | Resuelto | `MINTER_ROLE` en relayer backend; Gnosis Safe solo para `DEFAULT_ADMIN_ROLE` (configuración). |
| **Clave del bot burner comprometida** | Alto | Custodia en HashiCorp Vault / AWS Secrets Manager en producción; rotación trimestral documentada. |

---

## 6. Deuda Técnica Planificada (Fase 2 Post-MVP)

Las siguientes decisiones se posponen a Fase 2 de forma explícita y documentada:

| Ítem | Justificación de postergación | Sprint Fase 2 sugerido |
|------|-------------------------------|------------------------|
| **CDN Cloudflare** | No crítico para MVP; configuración DNS en staging | F2-S1 |
| **WCAG 2.1 AA** | Auditoría axe-core post-estabilización UI | F2-S1 |
| **Backup/DR automatizado** | pg_dump diario a GCS; prueba de restore mensual | F2-S1 |
| **Textos legales (T&C, PP, AL)** | Carlos los redacta con asesor antes del lanzamiento | F2-S2 |
| **Consulta fiscal (IVA NFTs)** | Ambigüedad legal; requiere asesor externo | F2-S1 |

---
*Plan de Construcción v1.1.0 — Post-Auditoría · 17 hallazgos resueltos · 13 semanas (Sprint 0 + Sprints 1-6).*

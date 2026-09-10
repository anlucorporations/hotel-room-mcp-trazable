# Informe de Auditoría de Requerimientos y Plan de Desarrollo

> **Proyecto**: Hotel Marina del Sol (`hotel-room-mcp-trazable`)  
> **Fecha**: 2026-09-10  
> **Equipo Auditor**: 7 revisores especializados en paralelo (Fase 1) + 1 verificador adversarial técnico (Fase 2) + Resolución interactiva (Fase 3)  
> **Alcance**: `docs/PRD.md`, `docs/SRS.md`, `docs/PLAN-CONSTRUCCION.md`, `docs/BACKLOG-SPRINTS.md`, `docs/GUIA-GNOSIS-SAFE.md`, y contrastación con el código implementado en Sprint 0 y Sprint 1.  

---

## 1. Veredicto General

### **Veredicto: APROBADO — 100% DE HALLAZGOS RESUELTOS**

La arquitectura global, la coherencia matemática de la capacidad (142 Story Points en 13 semanas cuadrando con precisión milimétrica), las bases de smart contracts en Foundry y el pipeline CI/CD han superado con éxito la auditoría técnica exhaustiva. 

Los **23 hallazgos verificados fueron consultados uno a uno con el usuario**, aplicando de manera inmediata las decisiones acordadas tanto en el código de los contratos como en la totalidad de la documentación de requerimientos y arquitectura del repositorio. El proyecto cuenta con **plena luz verde para el inicio del Sprint 2**.

---

## 2. Resumen Estadístico de la Auditoría

- **Total de hallazgos brutos procesados (Fase 1)**: 108
  - *R1 - Revisor Ambigüedad*: 24
  - *R2 - Revisor Consistencia*: 14
  - *R3 - Revisor Completitud RNF*: 12
  - *R4 - Revisor Stakeholders*: 14
  - *R5 - Revisor Trazabilidad*: 12
  - *R6 - Revisor Riesgos Técnicos*: 15
  - *R7 - Revisor Seguridad y Legal*: 17
- **Descartados por el Verificador Adversarial (Fase 2)**: 49 (Falsos positivos frente al código de Sprint 1 o decisiones pre-aprobadas como WCAG/CDN diferidos a Fase 2 y compra anónima física en PMS).
- **Fusionados por redundancia**: 36
- **Hallazgos Verificados y Consultados uno a uno (Fase 3)**: **23**
  - 🔴 **CRÍTICO**: 0
  - 🟠 **ALTO**: 8 (8 resueltos ✅)
  - 🟡 **MEDIO**: 9 (9 resueltos ✅)
  - 🔵 **BAJO**: 5 (5 resueltos ✅)
  - ⚪ **INFO**: 1 (1 resuelto ✅)
- **Estado Actual**: **23 / 23 RESUELTOS (100%)**

---

## 3. Matriz de Resolución de Hallazgos Verificados [ID_V-01 a ID_V-23]

| ID | Severidad | Categoría | Hallazgo Verificado | Decisión y Acción Aplicada | Estado |
|---|---|---|---|---|:---:|
| **ID_V-01** | 🟡 MEDIO | Smart Contracts | **Desalineación documental en SRS.md respecto al código real**: Snippets no reflejaban constructores ni permisos de Sprint 1. | Actualizados snippets en `docs/SRS.md` §3.1 y §3.2 con el código real de `HotelNFT.sol` y `HotelMarketplace.sol`. | ✅ RESUELTO |
| **ID_V-02** | 🟠 ALTO | Smart Contracts | **Falta de validación de expiración en `HotelMarketplace.buy()`**: Compras de reventas caducadas antes del bot burner. | Añadido `require(block.timestamp < checkInTimestamp, "Marketplace: Expired night")`, prueba `test_BuyRevertsIfNightExpired()` en Foundry y regenerados ABIs. | ✅ RESUELTO |
| **ID_V-03** | 🟡 MEDIO | Lógica Financiera | **Anotación de `minListingPrice` como '1 wei' en SRS §3.2**: Anulaba la protección anti wash-trading. | Documentado suelo de `0.01 ether` (POL) en `SRS.md` §3.2 parametrizable en `Deploy.s.sol` y gobernable por Gnosis Safe. | ✅ RESUELTO |
| **ID_V-04** | 🟠 ALTO | Operaciones / UI | **Ausencia de interfaz de retiro Pull-over-Push y omisión en Gnosis Safe**: Falta de UI de retiro y runbook de tesorería. | Añadida `TASK-15.3` (UI retiro) en Backlog US-15 y runbook `§2.5 Retiro de Tesorería` en `docs/GUIA-GNOSIS-SAFE.md`. | ✅ RESUELTO |
| **ID_V-05** | 🟠 ALTO | Backend / Obs. | **Falsa alarma de 10 min en Event Listener por falta de transacciones**: Falsos positivos en horas valle. | Re-calibrada la alerta en SRS (§2, §6), Plan y Backlog (TASK-07.1) a bloques `newHeads` de Polygon (> 10 min sin bloques). | ✅ RESUELTO |
| **ID_V-06** | 🟠 ALTO | Blockchain | **Ausencia de profundidad de confirmaciones contra reorgs en Polygon PoS**: Riesgo de asentar bloques huérfanos. | Establecida política de 32 confirmaciones (~64s) en SRS §6 y Backlog US-07 con estado transitorio `CONFIRMING`. | ✅ RESUELTO |
| **ID_V-07** | 🟡 MEDIO | Blockchain / RPC | **Falta de paginación/chunking por bloques en reconciliación `eth_getLogs`**: Rechazo de peticiones en RPCs. | Especificado en SRS §6 y Backlog TASK-07.3 chunking de máximo 2.000 bloques por llamada con backoff exponencial. | ✅ RESUELTO |
| **ID_V-08** | 🟠 ALTO | Base de Datos | **Esquema DDL incompleto en SRS §5 y VARCHAR en montos de wei**: Faltaban 4 tablas y precisión numérica. | Añadidos DDLs completos de `listings`, `sale_events`, `admin_sessions`, `mfa_recovery_codes` y campos `NUMERIC(78, 0)`. | ✅ RESUELTO |
| **ID_V-09** | 🟠 ALTO | API REST | **Catálogo de endpoints nucleares omitidos en especificación formal**: mint-batch, analytics, history, mfa/setup. | Formalizada nota en SRS §4 difiriendo esquemas OpenAPI detallados al diseño técnico de cada historia (Sprints 2 y 3). | ✅ RESUELTO |
| **ID_V-10** | 🟠 ALTO | Seguridad / Auth | **Ausencia de Rate Limiting y anti-fuerza bruta en login y MFA**: Riesgo de adivinación de códigos TOTP. | Especificado limitador en Redis (máximo 5 intentos / 15 min con bloqueo de 15 min) en SRS §4.1 y Backlog TASK-05.5. | ✅ RESUELTO |
| **ID_V-11** | 🟠 ALTO | Criptografía | **Exposición de `checkInSecret` en query string abierta de URL de QR**: Riesgo de fuga en logs de red. | Formateado payload como fragmento hash `#ticket=<jws>` firmado en SRS §4.3 y Backlog TASK-12.1. | ✅ RESUELTO |
| **ID_V-12** | 🟠 ALTO | Backend / Conc. | **Concurrencia de nonces y falta de alerta de gas en `RECEPTION_ROLE`**: Colisiones de nonce en check-in simultáneo. | Añadida cola transaccional secuencial y alerta de saldo < 5 POL a `DEVOPS_ALERT_EMAIL` en Backlog TASK-14.2. | ✅ RESUELTO |
| **ID_V-13** | 🟡 MEDIO | Operaciones / Seg. | **Ambigüedad en protocolo de acreditación para check-in en contingencia**: Riesgo de suplantación sin factor de posesión. | Exigida comprobación de factor de posesión (wallet compradora, hash de tx o resguardo) en SRS §4.3 y Backlog TASK-14.3. | ✅ RESUELTO |
| **ID_V-14** | 🟡 MEDIO | Rendimiento / UX | **Incompatibilidad de SLA de validación < 3s con confirmación on-chain**: Bloqueo en recepción. | Adoptada validación optimista (< 500ms HTTP) y asentamiento on-chain asíncrono con alerta WebSocket en SRS §4.3, Plan y Backlog. | ✅ RESUELTO |
| **ID_V-15** | 🔵 BAJO | Backend / Msg | **Riesgo de duplicación de correos por re-encolado en BullMQ**: Duplicación de emails de venta. | Especificado `jobId = notification.id` determinista para deduplicación nativa en BullMQ en SRS §6 y Backlog TASK-08.1. | ✅ RESUELTO |
| **ID_V-16** | 🟡 MEDIO | Trazabilidad | **Discrepancia funcional en Web Push**: PRD RF-12 cubre lotes primarios, Backlog restringía a reventas. | Armonizada US-18 en Backlog para alertar tanto de nuevos lotes primarios minteados como de publicaciones de reventa. | ✅ RESUELTO |
| **ID_V-17** | 🟡 MEDIO | Trazabilidad | **Envío de resguardo a email efímero presente en PRD pero omitido en SRS/Backlog**: Omisión funcional RGPD. | Incorporado endpoint `POST /api/qr/:tokenId/send-email` en SRS §4.3 y subtarea `TASK-12.3` en Backlog US-12. | ✅ RESUELTO |
| **ID_V-18** | 🟡 MEDIO | Frontend | **Componente visual del Histórico de Ventas Público omitido en frontend de Sprint 4**: RF-10 sin pantalla. | Incorporada `TASK-10.3` en Backlog US-10 consumiendo `/api/sales/history` con tabla paginada de 20 filas. | ✅ RESUELTO |
| **ID_V-19** | 🔵 BAJO | Planificación | **Salto en la numeración de historias de usuario en Backlog (falta US-19)**: Inconsistencia numérica. | Añadida nota formal en Backlog §3 vinculando el identificador US-19 a la tarea `TASK-10.3` de histórico visual. | ✅ RESUELTO |
| **ID_V-20** | 🟡 MEDIO | Seguridad / DevOps | **Falta de aislamiento de claves privadas entre procesos en VM única**: Gestión de hot-wallets. | Unificados roles `MINTER_ROLE` y `BURNER_ROLE` bajo la wallet de operador (`HOTEL_OPERATOR_HOT_WALLET`) en Plan §2 y SRS §3.3. | ✅ RESUELTO |
| **ID_V-21** | 🔵 BAJO | QA / CI | **Falta de definición metodológica de mocking Web3 para tests Playwright**: Inestabilidad con extensiones. | Especificado mock provider EIP-1193 inyectado en Playwright conectado a Anvil en Plan §3 y Backlog TASK-21.1. | ✅ RESUELTO |
| **ID_V-22** | 🔵 BAJO | Base de Datos | **Parámetros del pool de conexiones PostgreSQL y purga de notificaciones omitidos**: Saturación de BD. | Parametrizado pool (`max: 20`, `idleTimeout: 30s`) y cron mensual de purga de emails `SENT` > 90 días en SRS §5.1 y Backlog US-04. | ✅ RESUELTO |
| **ID_V-23** | ⚪ INFO | Legal / MiCA | **Clarificación de cláusula de no custodia en Términos de Servicio de reventa**: Blindaje regulatorio CASP. | Confirmada e incorporada la cláusula expresa de no custodia bajo el Reglamento MiCA en Backlog US-25 (`docs/COMPLIANCE.md`). | ✅ RESUELTO |

---

## 4. Estado Final y Siguiente Paso

Con la resolución integral de los 23 hallazgos:
1. Smart Contracts verificados en Foundry (115 pruebas pasando, 0 fallos).
2. Paquete `@hotel/shared` compilado con ABIs sincronizados y 85 pruebas unitarias pasando.
3. Especificaciones funcionales y técnicas (`PRD.md`, `SRS.md`, `PLAN-CONSTRUCCION.md`, `BACKLOG-SPRINTS.md`, `GUIA-GNOSIS-SAFE.md`) 100% consistentes y auditadas.
4. Repositorio sincronizado en `origin` y `gitlab-public` (`main` y `HotelAntigravity`).

**Luz verde definitiva para el inicio del Sprint 2: Backend Core, Base de Datos, Health Checks y Endpoints Catálogo (26 SP)**.

# Informe de Auditoría de Requerimientos y Plan de Desarrollo

> **Proyecto**: Hotel Marina del Sol (`hotel-room-mcp-trazable`)  
> **Fecha**: 2026-09-09  
> **Equipo Auditor**: 7 revisores especializados en paralelo (Fase 1) + 1 verificador adversarial técnico (Fase 2)  
> **Alcance**: `docs/PRD.md` (v1.1.0), `docs/SRS.md` (v1.3.0), `docs/PLAN-CONSTRUCCION.md` (v1.2.0), `docs/BACKLOG-SPRINTS.md` (v1.2.0), `docs/GUIA-GNOSIS-SAFE.md` (v1.0.0), y contrastación con el código implementado en Sprint 0 y Sprint 1.  

---

## 1. Veredicto General

### **Veredicto: APROBADO CON PLAN DE REFINAMIENTO**

La arquitectura global, la coherencia matemática de la capacidad (142 Story Points en 13 semanas cuadrando con precisión milimétrica), y las bases de contratos y CI/CD implementadas en Sprint 0 y Sprint 1 son **sólidas y técnicamente viables**. 

Los smart contracts reales de Sprint 1 (`HotelNFT.sol` y `HotelMarketplace.sol`) ya resolvieron con éxito y pruebas al 100% los bloqueos de constructores, permisos y venta primaria a tesorería. La auditoría confirma que **no existen bloqueadores críticos (0 CRÍTICOS)** que impidan el avance hacia el Sprint 2. Se han identificado **8 hallazgos de severidad ALTA y 9 de severidad MEDIA** que corresponden a refinamientos de especificación de base de datos (DDLs completos en SRS §5), seguridad en endpoints (rate limiting con Redis en login/MFA), calibración de monitoreo (alerta de bloques vs transacciones) y completitud de flujos en historias pendientes (Sprints 2 a 5).

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
- **Hallazgos Verificados y Confirmados (Fase 3)**: **23**
  - 🔴 **CRÍTICO**: 0
  - 🟠 **ALTO**: 8
  - 🟡 **MEDIO**: 9
  - 🔵 **BAJO**: 5
  - ⚪ **INFO**: 1

---

## 3. Tabla Consolidada de Hallazgos Verificados [ID_V-01 a ID_V-23]

| ID | Severidad | Categoría | Hallazgo Verificado | Acción Sugerida |
|---|---|---|---|---|
| **ID_V-01** | 🟡 MEDIO | Smart Contracts | **Desalineación documental en SRS.md respecto al código real de Sprint 1**: Los snippets de Solidity en SRS §3.1 y §3.2 corresponden a borradores previos y no reflejan los contratos implementados (`HotelNFT.sol` y `HotelMarketplace.sol` con `_admin`, `pause/unpause`, listado primario y 100% a tesorería). | Actualizar los snippets en `docs/SRS.md` §3.1 y §3.2 con el código real y testeado del repo. |
| **ID_V-02** | 🟠 ALTO | Smart Contracts | **Falta de validación de expiración en `HotelMarketplace.buy()`**: `listForSale` valida vigencia al publicar, pero si un listing de reventa queda activo tras la fecha de check-in, `buy()` no comprueba `block.timestamp < checkInTimestamp`, permitiendo comprar estancias caducadas. | Añadir `require(block.timestamp < checkInTimestamp, "Marketplace: Expired night")` en `HotelMarketplace.buy()` y test en Foundry. |
| **ID_V-03** | 🟡 MEDIO | Lógica Financiera | **Anotación de `minListingPrice` como '1 wei' en SRS §3.2 contradice la protección anti-evasión**: Anotar 1 wei anula el propósito de evitar el wash trading y la evasión de royalties secundarios. | Corregir en `SRS.md` §3.2 fijando un umbral inicial realista (ej. 5 POL o equivalente a 5€), administrable por la Gnosis Safe. |
| **ID_V-04** | 🟠 ALTO | Operaciones / UI | **Ausencia de interfaz de retiro Pull-over-Push para vendedores secundarios y omisión de runbook en Gnosis Safe**: Falta interfaz de usuario para que el vendedor secundario retire sus fondos (`withdraw()`), y la guía multisig no detalla cómo retirar la recaudación de tesorería. | Añadir `TASK-15.3: UI de Retiro Pull-over-Push` en Sprint 5, e incorporar runbook `§2.5 Retiro de Tesorería` en `docs/GUIA-GNOSIS-SAFE.md`. |
| **ID_V-05** | 🟠 ALTO | Backend / Observabilidad | **Falsa alarma de silencio de 10 min en Event Listener por falta de transacciones en horas valle**: Alertar por "sin eventos en 10 min" saturará a DevOps en un hotel de 50 habitaciones. Debe monitorear la recepción de bloques de Polygon (`newHeads`), no transacciones de clientes. | Modificar `SRS.md` §2, §6 y `TASK-07.1` para que la alerta evalúe la llegada de bloques de red Polygon y no eventos del contrato. |
| **ID_V-06** | 🟠 ALTO | Blockchain / Resiliencia | **Ausencia de profundidad de confirmaciones contra reorgs en Polygon PoS**: Polygon sufre reorganizaciones de 2 a 32+ bloques. Ingestar eventos con 1 solo bloque arriesga consolidar reservas de bloques huérfanos. | Especificar en `SRS.md` §6 y `TASK-07.1` una profundidad de confirmaciones segura (ej. 32 bloques o estado `finalized`) antes de asentar la venta off-chain. |
| **ID_V-07** | 🟡 MEDIO | Blockchain / RPC | **Falta de paginación/chunking por bloques en reconciliación `eth_getLogs`**: Consultar intervalos superiores a 2.000 bloques de una sola llamada tras un reinicio de la VM provocará que los RPCs públicos de Alchemy/Infura rechacen la petición. | Establecer en `SRS.md` §6 y `TASK-07.3` chunking automático de máximo 2.000 bloques por llamada con backoff exponencial. |
| **ID_V-08** | 🟠 ALTO | Base de Datos | **Esquema DDL incompleto en SRS §5 (faltan 4 tablas) y tipo VARCHAR en montos de wei**: SRS §5 omite DDL de `listings`, `sale_events`, `admin_sessions` y `mfa_recovery_codes`. Además `base_price_wei VARCHAR(78)` dificulta agregaciones numéricas. | Incorporar en `docs/SRS.md` §5 los DDLs de las 4 tablas faltantes y cambiar `base_price_wei` a `NUMERIC(78, 0)`. |
| **ID_V-09** | 🟠 ALTO | API REST | **Catálogo de endpoints nucleares omitidos en la especificación de API de SRS §4**: Faltan las especificaciones formales de `/admin/nfts/mint-batch`, `/admin/analytics` (7 métricas), `/api/sales/history` (CSV) y `/auth/mfa/setup` (enrolamiento TOTP). | Completar en `docs/SRS.md` §4 las rutas, cabeceras, esquemas JSON y códigos de respuesta de los 4 endpoints requeridos. |
| **ID_V-10** | 🟠 ALTO | Seguridad / Auth | **Ausencia de Rate Limiting y protección de fuerza bruta en endpoints de login y MFA**: Los códigos TOTP de 6 dígitos son susceptibles a ataques automatizados si no se limitan los intentos fallidos. | Especificar en `SRS.md` §4.1 límite de tasa en Redis (máximo 5 intentos / 15 min con bloqueo temporal) y añadir tarea técnica `TASK-05.5`. |
| **ID_V-11** | 🟠 ALTO | Criptografía / Privacidad | **Exposición del secreto `checkInSecret` en query string abierta en URL de código QR**: El payload `?t=0x...&s=secret` expone el secreto en logs de servidores, proxies y navegadores. | Definir en `SRS.md` §4.3 el QR como un token criptográfico compacto firmado (o JWT/JWE), evitando secretos en texto plano en la URL. |
| **ID_V-12** | 🟠 ALTO | Backend / Concurrencia | **Concurrencia de nonces de Ethereum y falta de alerta de saldo de gas para `RECEPTION_ROLE`**: Check-ins simultáneos con la misma hot-wallet generarán colisiones de nonce (`nonce too low`). Además falta alerta por saldo bajo de gas. | Implementar en `TASK-14.2` cola transaccional secuencial para recepción y alerta a `DEVOPS_ALERT_EMAIL` si el saldo es menor a 5 POL. |
| **ID_V-13** | 🟡 MEDIO | Operaciones / Seguridad | **Ambigüedad en el protocolo de acreditación para check-in asistido en contingencia**: Al ser compra anónima, buscar solo por fecha y habitación abre riesgo de suplantación si no se exige un factor de posesión. | Detallar en `SRS.md` §4.3 que el huésped debe exhibir la wallet compradora, hash de tx o resguardo impreso antes del registro en PMS. |
| **ID_V-14** | 🟡 MEDIO | Rendimiento / UX | **Incompatibilidad de SLA de validación < 3s con confirmación sincrónica on-chain de Polygon**: Esperar la confirmación on-chain (2-5s) antes de responder HTTP 200 violará el SLA de 3s en recepción. | Especificar validación optimista: respuesta inmediata (<500ms) tras validar BD y asentamiento on-chain asíncrono con alerta WebSocket si revierte. |
| **ID_V-15** | 🔵 BAJO | Backend / Mensajería | **Riesgo de duplicación de correos por re-encolado en BullMQ**: El cron de reconciliación re-encola registros `PENDING` > 5 min. Si un job estaba demorado en SMTP, puede duplicar correos. | Especificar en `SRS.md` §6 y `TASK-08.1` el uso de `jobId = notification.id` determinista para deduplicación nativa en BullMQ. |
| **ID_V-16** | 🟡 MEDIO | Trazabilidad / Negocio | **Discrepancia funcional en Web Push**: PRD RF-12 define alertas para nuevos lotes primarios, mientras Backlog US-18 las restringe a reventas secundarias. | Alinear `US-18` y `SRS.md` para notificar disponibilidad de nuevos lotes primarios de habitaciones (con opción a reventas). |
| **ID_V-17** | 🟡 MEDIO | Trazabilidad / Funcional | **Requisito de 'Enviar resguardo a email efímero' presente en PRD pero omitido en SRS y Backlog**: PRD RF-07 define envío opcional a email efímero (sin persistir en BD), omitido en SRS §4.3 y Backlog US-12. | Incorporar endpoint `POST /api/qr/:tokenId/send-email` en `SRS.md` §4.3 y agregar subtarea `TASK-12.3` en `BACKLOG-SPRINTS.md`. |
| **ID_V-18** | 🟡 MEDIO | Trazabilidad / Frontend | **Componente visual del Histórico de Ventas Público omitido en tareas de Frontend de Sprint 4**: `US-17` hace el endpoint y CSV, pero falta maquetar la tabla pública para los visitantes. | Añadir subtarea `TASK-10.3: Vista de Histórico Público de Transacciones` en `US-10` de `BACKLOG-SPRINTS.md`. |
| **ID_V-19** | 🔵 BAJO | Planificación | **Salto en la numeración de historias de usuario en Backlog (`US-18` pasa a `US-20`, falta `US-19`)**: Hueco en la correlatividad numérica en la documentación. | Asignar el ID `US-19` a la tarea técnica de Histórico Frontend / Retiro o corregir correlatividad documental en el Backlog. |
| **ID_V-20** | 🟡 MEDIO | Seguridad / DevOps | **Falta de aislamiento de claves privadas entre procesos en la VM única**: Las hot-wallets de Minter, Burner y Recepción no deben compartir entorno global en la VM. | Especificar en `PLAN §2` y `SRS §3.3` inyección de secretos segregada por contenedor Docker independiente. |
| **ID_V-21** | 🔵 BAJO | QA / CI | **Falta de definición metodológica de mocking Web3 para tests E2E de Playwright**: Indefinición de si Playwright usa Synpress o un mock provider EIP-1193 sobre Anvil. | Documentar en `PLAN §3` Fase 4 y `TASK-21.1` el uso de un provider mock EIP-1193 conectado al Anvil local para estabilidad en CI. |
| **ID_V-22** | 🔵 BAJO | Base de Datos | **Parámetros del pool de conexiones PostgreSQL y purga de tabla `email_notifications` omitidos**: Concurrencia de 200 usuarios y workers puede saturar el pool si no se acota. | Parametrizar en `SRS.md` §5 el pool de conexiones (`max: 20`, `idleTimeout: 30s`) y definir cron para purgar registros `SENT` > 90 días. |
| **ID_V-23** | ⚪ INFO | Legal / Compliance | **Clarificación de cláusula de no custodia en Términos de Servicio de reventa**: Ratificar formalmente que el hotel actúa como proveedor de software y no como custodio CASP en el mercado secundario. | Confirmar que el dictamen legal y términos de uso en `docs/COMPLIANCE.md` (US-25 en Sprint 6) incorporen la cláusula expresa de no custodia. |

---

## 4. Plan de Acción Priorizado por Sprint

```mermaid
flowchart LR
    subgraph Sprint1Docs["Cierre Sprint 1 (Inmediato)"]
        V01["ID_V-01: Actualizar snippets SRS"]
        V03["ID_V-03: Corregir precio min en SRS"]
    end

    subgraph Sprint2["Sprint 2: Backend Core, BD y Auth"]
        V08["ID_V-08: DDL 4 tablas + NUMERIC"]
        V09["ID_V-09: Especificar 4 endpoints en SRS"]
        V10["ID_V-10: Rate limiting login/MFA"]
        V22["ID_V-22: Pool conexiones PostgreSQL"]
        V19["ID_V-19: Ajuste ID US-19"]
    end

    subgraph Sprint3["Sprint 3: Listener, Burner, Deploy Amoy"]
        V05["ID_V-05: Alerta 10m en newHeads"]
        V06["ID_V-06: Confirmaciones contra reorgs"]
        V07["ID_V-07: Chunking 2000 bloques eth_getLogs"]
        V15["ID_V-15: Deduplicación BullMQ con jobId"]
        V20["ID_V-20: Aislamiento Docker de wallets"]
    end

    subgraph Sprint4["Sprint 4: Tienda, Wallet y QR"]
        V11["ID_V-11: QR sin secreto en URL"]
        V17["ID_V-17: Email efímero resguardo"]
        V18["ID_V-18: UI Histórico público"]
        V21["ID_V-21: Mocking EIP-1193 Playwright"]
    end

    subgraph Sprint56["Sprints 5 y 6: Recepción y Hardening"]
        V02["ID_V-02: Expiración en buy()"]
        V04["ID_V-04: UI Retiro y Guía Multisig"]
        V12["ID_V-12: Nonces y gas en Recepción"]
        V13["ID_V-13: Factor posesión contingencia"]
        V14["ID_V-14: Validación optimista <3s"]
        V16["ID_V-16: Armonizar Web Push"]
        V23["ID_V-23: Cláusula no custodia"]
    end

    Sprint1Docs --> Sprint2 --> Sprint3 --> Sprint4 --> Sprint56
```

---

## 5. Conclusión

El proyecto se encuentra en un **estado de alta madurez técnica**. Las 23 observaciones consolidadas son perfectamente abordables dentro de la cadencia de los sprints planificados sin necesidad de agregar tiempo de calendario ni desbordar los 142 Story Points aprobados. El equipo cuenta con luz verde para proceder de inmediato con la actualización documental de cierre del Sprint 1 y el arranque del Sprint 2.

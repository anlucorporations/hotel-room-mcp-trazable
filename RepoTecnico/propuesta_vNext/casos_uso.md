# Casos de uso y criterios de aceptación — Propuesta vNext
## Suite de Mantenimiento + Suite Ama de llaves

> **Tipo:** análisis funcional de Fase 2 sobre la propuesta vNext (no modifica el sistema actual).
> **Versión:** 1.0.0 · **Fecha:** 2026-10-06 · **Autor:** @asistenteProyecto (analista funcional senior).
> **Alcance:** comportamiento de los actores **Jefe de Mantenimiento (`HEAD_MAINTENANCE`)**, **Técnico (`MAINTENANCE_TECH`)**, **Ama de llaves (`HEAD_KEEPER`)**, **Camarera (`HOUSEKEEPER`)**, **Recepción (`RECEPTION_ROLE`)**, **Administrador/Owner (`DEFAULT_ADMIN_ROLE`)**, **Huésped** y **Soporte (= Administrador)**, con **firma on-chain selectiva**.
>
> **Fuentes**
> - `RepoTecnico/propuesta_vNext/requerimientos.md` — RF-M-01…RF-M-12, RF-K-01…RF-K-10, RF-S-01…RF-S-08, RNF-M-01…RNF-M-21, D-C1…D-C42.
> - `RepoTecnico/propuesta_vNext/diccionario_datos.md` — tablas, campos y enums.
> - `RepoTecnico/propuesta_vNext/diagrama_er.md` — relaciones y máquina de estados.
> - `RepoTecnico/propuesta_vNext/base_datos.sql` — restricciones `CHECK`, semillas y trigger append-only.
> - `RepoTecnico/propuesta_vNext/entornos_globales.md` — flags y variables.
> - `RepoTecnico/propuesta_vNext/INFORME_AUDITORIA_VNEXT_V1.md` — hallazgos H-01…H-39 y decisiones de resolución.
> - `RepoTecnico/estado_proyecto.md` §11 — decisiones confirmadas por el cliente.
> - `docs/CASOS-DE-USO.md` — formato, convenciones Gherkin/EARS y regla de testabilidad del proyecto.
>
> **Regla de oro de la firma on-chain (D-C34, ajustada por D-C27):** la firma on-chain es **obligatoria solo** en (1) **bloqueo/desbloqueo de habitación** por mantenimiento y (2) **verificación de tareas preventivas de áreas críticas** (`POOL_FILTER`, `WATER_PUMP`, `ELEVATOR`, `ELECTRIC_GENERATOR`). La **inspección de limpieza es opcional** (D-C23) y el **cargo por daños no se firma on-chain** (D-C27, auditoría off-chain). Todo lo demás (tickets, asignaciones, estados intermedios, configuración, mantenimiento rutinario) es off-chain auditado.
>
> **Alcance de esta fase (D-C7):** este documento es Fase 2 (Casos de uso) de la propuesta vNext, no modifica código, contratos ni BD, y queda pendiente de aprobación explícita del alcance por el cliente antes de comprometer fechas o presupuesto.

---

## 1. Convenciones

| Convención | Regla aplicada en este documento |
|---|---|
| **Gherkin** (`Dado / Cuando / Entonces / Y / Pero`) | `Dado` = contexto/estado previo verificable; `Cuando` = **una** acción o evento; `Entonces` = resultado **observable** (evento on-chain, fila/campo en BD, código HTTP, `data-testid`, error concreto o métrica con percentil y muestra). |
| **EARS** para restricciones del sistema | Ubicuo «El sistema deberá…»; Evento «Cuando \<evento\>, el sistema deberá…»; Estado «Mientras \<estado\>, el sistema deberá…»; No deseado «Si \<condición\>, entonces el sistema deberá…»; Opcional «De acuerdo con \<característica\>, el sistema deberá…». |
| **Un caso de uso por objetivo de actor** | Cada objetivo distinto de un actor tiene su propio `CU-V-XX`; no se fusionan objetivos con disparadores ni postcondiciones distintas. |
| **Testabilidad** | Todo `Entonces` cita un oráculo concreto (§3, §4, §5). No se admiten oráculos subjetivos («correctamente», «rápido», «adecuado»). |
| **Trazabilidad** | Cada CU declara los RF/RNF y las decisiones D-C que cubre; la cobertura se cierra en §12 y §13. |
| **Idioma de la interfaz** | ES/EN/RU según el operario (RNF-M-17); los identificadores de código, eventos y tablas se mantienen en inglés. |

---

## 2. Parámetros y constantes

Valores de referencia usados por los criterios. Son **configurables** salvo indicación; los tests los leen del getter o de la variable de entorno, nunca de un literal incrustado.

| Constante | Valor de referencia | Fuente / variable | Usado en |
|---|---|---|---|
| `TZ_REF` | `Europe/Madrid` | config | Todas las fechas civiles |
| `PIN_LENGTH` | 4–6 dígitos | D-C17 / RNF-M-09 | CU-V-12, CU-V-27 |
| `PIN_HASH_ALGO` | `bcrypt` (coste ≥ 12) | D-C17 | CU-V-12, CU-V-27, CU-V-44 |
| `TERMINAL_PIN_MAX_ATTEMPTS` | 5 | `TERMINAL_PIN_MAX_ATTEMPTS` | CU-V-12, CU-V-27 |
| `TERMINAL_PIN_ROTATION_DAYS` | 90 | `TERMINAL_PIN_ROTATION_DAYS` | CU-V-12, CU-V-36 |
| `TERMINAL_SESSION_TIMEOUT_MS` | 300 000 (5 min) | `TERMINAL_SESSION_TIMEOUT_MS` | CU-V-12, CU-V-27 |
| `TOTP_WINDOW_S` / `TOTP_DRIFT` | 30 s / ±1 ventana | estándar TOTP | CU-V-01, CU-V-16 |
| `ANCHOR_BACKOFF` | 30 s → 1 → 2 → 5 → 10 min | D-C18 / RNF-M-03 | CU-V-03, CU-V-05, CU-V-07, CU-V-43 |
| `ANCHOR_MAX_RETRIES` | 8 | `OPERATIONAL_SIGNATURE_MAX_RETRIES` | CU-V-43 |
| `ANCHOR_TTL_HOURS` | 24 h | `OPERATIONAL_SIGNATURE_TTL_HOURS` | CU-V-43 |
| `ANCHOR_RETRY_BASE_MS` | 30 000 ms | `OPERATIONAL_SIGNATURE_RETRY_MS` | CU-V-43 |
| `PENDING_ALERT_MIN` | 10 min | RNF-M-13 | CU-V-43 |
| `RETRY_ALERT_COUNT` | > 5 | RNF-M-13 | CU-V-43 |
| `SLA_VALIDATION_HOURS` | 24 h | D-C38 / RNF-M-21 | CU-V-09, CU-V-39 |
| `P95_BOARD_MS` | 500 ms (20 usuarios, 50 habitaciones, 90 días) | D-C26 / RNF-M-05 | CU-V-18 |
| `P95_LIST_MS` | 800 ms (página máx. 50) | D-C26 / RNF-M-05 | CU-V-10, CU-V-13, CU-V-26 |
| `P95_SIGN_MS` | 5 000 ms hasta `SIGNED` (sin minado) | D-C26 / RNF-M-05 | CU-V-03, CU-V-05, CU-V-07 |
| `PAGE_MAX` | 50 | RNF-M-05 | CU-V-10, CU-V-13, CU-V-26 |
| `SUPPLY_THRESHOLD_DEFAULT_PCT` | 20 % del estándar | D-C33 / RF-K-09 | CU-V-25, CU-V-30 |
| `SUPPLY_REMINDER` | diario hasta reponer | D-C33 | CU-V-25 |
| `EVIDENCE_RETENTION_DAYS` | 90 días tras check-out | `DAMAGE_EVIDENCE_RETENTION_DAYS` (D-C19) | CU-V-24, CU-V-41, CU-V-42 |
| `DAMAGE_CLAIM_WINDOW_H` | 24 h antes del check-out (configurable) | D-C14 / RNF-M-10 | CU-V-41 |
| `AUDIT_RETENTION_YEARS` | 5 años | D-C31 / RNF-M-19 | CU-V-40 |
| `RPO` / `RTO` | 1 h / 4 h | D-C25 / RNF-M-12 | CU-V-45 |
| `BACKUP_RETENTION` | 30 diarios + 12 mensuales | D-C25 | CU-V-45 |
| `CRITICAL_AREA_CODES` | `POOL_FILTER,WATER_PUMP,ELEVATOR,ELECTRIC_GENERATOR` | D-C20 / `maintenance_area_types.is_critical` | CU-V-06, CU-V-07 |
| `AREA_TYPE_SEED` | 10 tipos (4 críticos) | `base_datos.sql` §5 | CU-V-06, CU-V-08 |
| `ROOM_STATES` | `CLEAN`,`DIRTY`,`OCCUPIED`,`PENDING_CLEANING`,`IN_INSPECTION` | §3.14 diccionario / RF-K-02 | CU-V-18, CU-V-29 |
| `SIGN_STATUS` | `PENDING`,`SIGNED`,`MINED`,`FAILED`,`REVOKED` | `base_datos.sql` | CU-V-03, CU-V-43 |
| `NOTIF_STATUS` | `PENDING`,`SENT`,`ACKNOWLEDGED`,`DISPUTED`,`EXPIRED`,`RESOLVED_ACCEPTED`,`RESOLVED_REJECTED` | `damage_charge_guest_notifications` | CU-V-24, CU-V-41, CU-V-33 |
| `SIGN_ENTITY_TYPES` | `ROOM_BLOCK`,`ROOM_UNBLOCK`,`INSPECTION`,`PREVENTIVE_TASK` (usados; `AREA_LOG` es valor reservado del CHECK y **no** se firma) | `base_datos.sql` | CU-V-03, CU-V-05, CU-V-07, CU-V-21 |
| `ENABLE_OPERATIONAL_SIGNATURES` | solo dev/test; en producción fijo | `entornos_globales.md` | CU-V-37 |
| `MAINTENANCE_BLOCK_REQUIRES_SIGNATURE` | **true** fijo en producción | D-C34 | CU-V-03, CU-V-05 |
| `INSPECTION_REQUIRES_SIGNATURE` | **false** por defecto (opcional, D-C23) | `INSPECTION_REQUIRES_SIGNATURE` | CU-V-21 |
| `DAMAGE_CHARGE_REQUIRES_SIGNATURE` | **false** en producción (D-C27) | `DAMAGE_CHARGE_REQUIRES_SIGNATURE` | CU-V-24 |
| `TASK_USABILITY` | ≤ 30 s/tarea · ≤ 3 toques · ES/EN/RU · confirmación visual+sonora | D-C29 / RNF-M-17 | CU-V-12, CU-V-14, CU-V-27, CU-V-29 |
| `RPC_TIMEOUT_MS` | 5 000 ms | config | CU-V-18, CU-V-43 |

> **Vocabulario canónico (diccionario §3.14):** este documento usa exactamente los valores canónicos para `rooms.publication_status` (`DRAFT`, `PUBLISHED`, `PAUSED`, `MAINTENANCE`, `OUT_OF_SERVICE`), `rooms.operational_status`, `maintenance_incidents.status`, `housekeeping_assignments.status`, `preventive_tasks.status`/`validation_status`, `housekeeping_inspections.result` y `damage_charge_guest_notifications.status`. `ACKNOWLEDGED` significa «huésped conforme sin reclamación»; la resolución de una reclamación usa `RESOLVED_ACCEPTED`/`RESOLVED_REJECTED`. El bloqueo por mantenimiento de una habitación es `publication_status = 'MAINTENANCE'` (no un estado operativo).

---

## 3. Eventos canónicos on-chain (`HotelOperations.sol`)

Contrato **inmutable** (D-C39) con evento genérico `OperationalAction(actionType, entityId, payloadHash, signer, timestamp)`; los eventos tipados son azúcar semántica sobre el mismo `actionType`. Añadir tipos no exige redeploy.

| Evento | Parámetros | `actionType` | Se emite en | Obligatoriedad |
|---|---|---|---|---|
| `RoomBlocked` | `roomNumber, reason, until, signer, timestamp` | `ROOM_BLOCK` | CU-V-03 | **Obligatoria** |
| `RoomUnblocked` | `roomNumber, signer, timestamp` | `ROOM_UNBLOCK` | CU-V-05 | **Obligatoria** |
| `PreventiveTaskVerified` | `taskId, planCode, signer, timestamp` | `PREVENTIVE_TASK` | CU-V-07 | **Obligatoria si área crítica** |
| `HousekeepingInspected` | `roomNumber, inspectionType, result, signer, timestamp` | `INSPECTION` | CU-V-21 | Opcional (flag) |
| `DamageChargeRecorded` | `chargeId, roomNumber, amountCents, currency, signer, timestamp` | `DAMAGE_CHARGE` | — | **No se emite** por D-C27 (reservado para dev/test) |
| `OperationalAction` | `actionType, entityId, payloadHash, signer, timestamp` | cualquiera | CU-V-03, CU-V-05, CU-V-07 | Según el tipo |

> **Nota:** el mantenimiento rutinario de áreas comunes **no se firma on-chain** (D-C34): `maintenance_area_logs.signature_id` queda siempre `NULL` y no se crea fila en `on_chain_signatures`. El tipo `AREA_LOG` permanece en el CHECK de la tabla como valor reservado, pero **no** se usa en el flujo vigente: no existe firma opcional.

---

## 4. Errores y estados canónicos

Selectores de revert / respuestas de error que usan los escenarios negativos. Se comprueba el **selector** o el **código**, no el texto libre.

| Error / estado | Significado | Oráculo |
|---|---|---|
| `AccessControlUnauthorizedAccount(account, role)` | Cuenta sin el rol on-chain requerido | Revert de `HotelOperations` |
| `SignatureMismatch(expected, recovered)` | `recovered_signer` ≠ `signer_address` registrada | `on_chain_signatures.status = FAILED` + error persistido |
| `RoleChangedSinceSigning(roleSnapshot)` | El rol del firmante cambió entre firma y verificación | `status = FAILED` |
| `RoomAlreadyBlocked(roomNumber)` | La habitación ya está `MAINTENANCE` | HTTP 409 |
| `RoomNotBlocked(roomNumber)` | Se intenta desbloquear una habitación no bloqueada | HTTP 409 |
| `RoomBlockedByMaintenance(roomNumber)` | Se intenta activar la venta de una habitación bloqueada por mantenimiento | HTTP 409 (distinto de `RoomAlreadyBlocked`, que aplica al reintento de bloqueo) |
| `OpenIncident(incidentId)` | Quedan incidencias abiertas que impiden desbloquear | HTTP 422 |
| `MissingRequiredSignature(entityType)` | Acción obligatoria sin firma `SIGNED` | HTTP 422 |
| `EntityPendingAnchor(entityId)` | Existe una firma `PENDING` sobre la misma entidad | HTTP 423 |
| `OptimisticLockConflict(updated_at)` | Otro operario modificó el registro | HTTP 409 |
| `InvalidPin()` / `PinLocked(until)` / `PinExpired()` / `MustChangePin()` | Fallo de autenticación de terminal | HTTP 401 / 423 / 401 / 428 |
| `InvalidPeriodicity(value)` | Periodicidad fuera del CHECK correspondiente (`preventive_plans_periodicity_check`: `WEEKLY`/`MONTHLY`/`QUARTERLY`; `maintenance_area_tasks_periodicity_check`: `DAILY`…`ANNUAL`) | Violación de CHECK |
| `ThresholdOutOfRange(value)` | Umbral de suministro fuera de `[0, estándar]` | HTTP 422 |
| `DeadlineExceeded()` | SLA de validación de 24 h vencido | `status = PENDING_VERIFICATION_EXPIRED` |
| `DueDateExceeded()` | Reclamación del huésped presentada fuera del plazo `due_date` | HTTP 409 + `status = EXPIRED` |
| `IncidentRoomRequired()` | `room_id` y `area_id` ambos nulos o ambos presentes | Violación de CHECK |
| `ChainUnavailable()` | El RPC no responde dentro de `RPC_TIMEOUT_MS` | `status = PENDING` + job encolado |
| `AuditMutationForbidden()` | `UPDATE`/`DELETE` sobre `operator_audit_log` | Trigger `trg_operator_audit_append_only` |
| `DegradedState()` | Dependencia caída, se sirve lectura degradada | `data-testid="degraded-state"` |

---

## 5. Catálogo de `data-testid` observables

| `data-testid` | Elemento | Usado en |
|---|---|---|
| `requires-signature` | Icono ⛓ + etiqueta «Requiere firma» | CU-V-01, CU-V-03, CU-V-05, CU-V-07, CU-V-21, CU-V-38 |
| `signature-preview` | Modal de previsualización previo a firmar | CU-V-03, CU-V-05, CU-V-07, CU-V-38 |
| `signature-pending-anchor` | Aviso de firma en cola (`PENDING_ANCHOR`) | CU-V-03, CU-V-05, CU-V-07, CU-V-43 |
| `wallet-disconnected` | Botón de firma `disabled` sin wallet | CU-V-01, CU-V-03, CU-V-05, CU-V-07, CU-V-16 |
| `room-state-board` | Tablero de estado operativo (5 estados canónicos + marca de bloqueo) | CU-V-18 |
| `incident-list` / `incident-detail` | Listado y detalle de incidencias | CU-V-02, CU-V-13 |
| `assignment-list` | Asignaciones del turno | CU-V-17, CU-V-28 |
| `terminal-pin` | Teclado de PIN | CU-V-12, CU-V-27 |
| `inspection-result` | Resultado `APPROVED`/`REJECTED` | CU-V-21, CU-V-22 |
| `damage-charge-form` | Formulario de cargo por daños | CU-V-24 |
| `supply-alert` | Alerta de umbral de suministros (`supply_alerts.status = 'OPEN'`) | CU-V-25, CU-V-30 |
| `sla-countdown` | Tiempo restante de validación (24 h) | CU-V-09, CU-V-39 |
| `pending-verification` | Tareas pendientes de validación | CU-V-09, CU-V-39 |
| `anchor-queue` | Cola de anclajes del Soporte | CU-V-43 |
| `audit-export` | Botón de exportación de evidencias | CU-V-40 |
| `degraded-state` / `retry` | Estado degradado con reintento | CU-V-10, CU-V-13, CU-V-18, CU-V-25, CU-V-26, CU-V-43 |
| `empty-state` | Estado vacío de listados e informes | CU-V-10, CU-V-17, CU-V-26, CU-V-28, CU-V-39 |
| `evidence-missing` | Aviso «evidencia no adjunta» (no bloquea la acción) | CU-V-03, CU-V-07, CU-V-14, CU-V-24 |
| `possible-duplicate` | Aviso de posible incidencia duplicada | CU-V-23, CU-V-31 |
| `conflict-warning` | Aviso de concurrencia/reapertura que exige confirmación explícita | CU-V-20, CU-V-22 |

---

## 6. Actores y mapa de casos de uso

| Actor | Rol de plataforma | Wallet | Casos de uso |
|---|---|---|---|
| Jefe de Mantenimiento | `HEAD_MAINTENANCE` | Sí (`HEAD_MAINTENANCE_ROLE`) | CU-V-01 … CU-V-10 (CU-V-11 fusionado en CU-V-19) |
| Técnico de mantenimiento | `MAINTENANCE_TECH` | No | CU-V-12 … CU-V-15 |
| Ama de llaves | `HEAD_KEEPER` | Sí (`HEAD_KEEPER_ROLE`), solo inspección opcional | CU-V-16 … CU-V-26 |
| Camarera | `HOUSEKEEPER` | No | CU-V-27 … CU-V-30 |
| Recepción | `RECEPTION_ROLE` | No (D-C37) | CU-V-31 … CU-V-34 |
| Administrador / Owner | `DEFAULT_ADMIN_ROLE` | Sí (`OWNER_BACKUP`) | CU-V-35 … CU-V-40 |
| Huésped | Cliente con estancia | No | CU-V-41, CU-V-42 |
| Soporte (= Administrador) | `DEFAULT_ADMIN_ROLE` | Sí | CU-V-43 … CU-V-45 |

---

## 7. Suite de Mantenimiento — Jefe de Mantenimiento (`HEAD_MAINTENANCE`)

### CU-V-01 — Autenticarse en la Suite de Mantenimiento

- **Actor primario:** Jefe de Mantenimiento (`HEAD_MAINTENANCE`).
- **Trazabilidad:** RF-S-01, RNF-M-02, RNF-M-06, RNF-M-09 (análoga), D-C1, D-C42.
- **Precondición:** usuario `active = TRUE` con `role = HEAD_MAINTENANCE`; `totp_secret_enc` enrolado; wallet registrada en `operator_wallets` con `is_active = TRUE`.
- **Disparador:** el jefe abre `/mantenimiento`.

**Postcondición (oráculo):** Sesión de back-office creada (HTTP 200 con cookie) y wallet desacoplada; si no hay wallet, los botones de firma quedan `disabled` con `data-testid="wallet-disconnected"` y no se crea ninguna fila en `on_chain_signatures`.

**Flujo principal**
1. El jefe introduce usuario + contraseña y un código TOTP.
2. El sistema valida la contraseña y el TOTP, crea sesión de back-office y redirige al dashboard.
3. La sesión **no** incluye la wallet: el sistema mantiene la wallet desacoplada y solo la solicita al firmar.
4. El panel muestra las acciones que requieren firma con `data-testid="requires-signature"`.

**Flujos alternativos / excepciones**
- 01a — Contraseña o TOTP incorrectos: HTTP 401, sin sesión.
- 01b — TOTP reutilizado (mismo `time-step` ya consumido): HTTP 401 (anti-replay).
- 01c — Usuario `active = FALSE`: HTTP 403, sin sesión.
- 01d — Wallet no registrada: la sesión se crea, pero los botones de firma quedan `disabled` con `data-testid="wallet-disconnected"`.
- 01e — Wallet registrada sin `HEAD_MAINTENANCE_ROLE` on-chain: al firmar, revert `AccessControlUnauthorizedAccount`.

```gherkin
Escenario: Acceso correcto con contraseña y TOTP
  Dado que soy un usuario activo con rol HEAD_MAINTENANCE y TOTP enrolado
  Y mi wallet 0xA11ce está activa en operator_wallets
  Cuando introduzco usuario, contraseña correcta y un código TOTP vigente
  Entonces la respuesta es HTTP 200 y se crea una cookie de sesión
  Y el dashboard muestra el botón data-testid="requires-signature" para el bloqueo de habitación

Escenario: TOTP reutilizado
  Dado que ya inicié sesión con el código TOTP del time-step actual
  Cuando vuelvo a enviar el mismo código dentro de la misma ventana de 30 s
  Entonces la respuesta es HTTP 401
  Y no se emite una nueva cookie de sesión

Escenario: Wallet no registrada
  Dado que mi usuario HEAD_MAINTENANCE no tiene fila activa en operator_wallets
  Cuando abro una acción de bloqueo de habitación
  Entonces el botón de firma está disabled con data-testid="wallet-disconnected"
  Y no se construye ninguna transacción

Escenario: Wallet sin rol on-chain
  Dado que mi wallet está registrada pero no tiene HEAD_MAINTENANCE_ROLE
  Cuando intento firmar el bloqueo de la habitación 204
  Entonces la transacción revierte con AccessControlUnauthorizedAccount(0xA11ce, HEAD_MAINTENANCE_ROLE)
```

**Restricciones (EARS)**
- El sistema deberá autenticar a los jefes con contraseña + TOTP y **no** deberá usar la wallet como método de inicio de sesión.
- De acuerdo con una acción que requiera firma, el sistema deberá solicitar la conexión de la wallet en el momento de firmar y mantenerla desacoplada de la sesión.
- Si la wallet no está registrada o no tiene el rol on-chain, entonces el sistema deberá deshabilitar la firma o revertir con `AccessControlUnauthorizedAccount`, respectivamente.

---

### CU-V-02 — Recibir, clasificar y asignar incidencias

- **Actor primario:** Jefe de Mantenimiento.
- **Actores secundarios:** Recepción, Ama de llaves, Técnico (reportan).
- **Trazabilidad:** RF-M-01, RF-M-02, RF-S-08, RNF-M-01, RNF-M-06, D-C21, D-C36.
- **Precondición:** existe una incidencia en estado `OPEN` reportada por Recepción, Ama de llaves, Camarera o Técnico.
- **Disparador:** el jefe abre `/mantenimiento/incidencias`.

**Postcondición (oráculo):** `maintenance_incidents.status = 'IN_PROGRESS'`, `assigned_to` informado y una fila en `operator_audit_log` con `action = 'ASSIGN'` y `actor_role = 'HEAD_MAINTENANCE'`; los casos inválidos no alteran la BD (HTTP 422 o violación de CHECK).

**Flujo principal**
1. El jefe visualiza la incidencia (`data-testid="incident-list"` / `data-testid="incident-detail"`) con `kind`, `priority` (`LOW`/`MEDIUM`/`HIGH`), `description`, `reported_by` y `reported_by_role`.
2. La clasifica: fija `kind`, `priority` y `blocks_sale`.
3. La asigna a un técnico activo (`terminal_operators.role = MAINTENANCE_TECH`, `active = TRUE`).
4. El sistema pasa la incidencia a `IN_PROGRESS` y registra la asignación en `operator_audit_log` (`action = ASSIGN`).

**Flujos alternativos / excepciones**
- 02a — La incidencia no referencia ni `room_id` ni `area_id` (o ambos): se rechaza por la restricción «exactamente uno» (HTTP 422).
- 02b — Se intenta asignar a un operario `HOUSEKEEPER` o inactivo: HTTP 422.
- 02c — Reasignación de una incidencia `IN_PROGRESS`: permitida; se registra nuevo `ASSIGN` en auditoría.
- 02d — `reported_by_role` fuera del vocabulario cerrado: violación del CHECK `maintenance_incidents_reported_by_role_check`.

```gherkin
Escenario: Clasificar y asignar una incidencia de habitación
  Dado que Recepción reportó la incidencia 7c1e para la habitación 204 con priority=HIGH
  Y el técnico "tech.luis" está activo con rol MAINTENANCE_TECH
  Cuando clasifico la incidencia como ELECTRICITY, blocks_sale=TRUE y la asigno a tech.luis
  Entonces maintenance_incidents.status pasa a IN_PROGRESS y assigned_to = "tech.luis"
  Y operator_audit_log contiene una fila action=ASSIGN con actor_role=HEAD_MAINTENANCE

Escenario: Incidencia sin habitación ni área
  Cuando creo una incidencia sin room_id y sin area_id
  Entonces la inserción falla con la restricción de «exactamente uno de room_id o area_id»

Escenario: Asignación a un operario no técnico
  Dado que "camarera.ana" tiene role = HOUSEKEEPER
  Cuando intento asignarle la incidencia 7c1e
  Entonces la respuesta es HTTP 422
  Y assigned_to permanece sin cambios

Escenario: Rol de quien reporta fuera de vocabulario
  Cuando registro reported_by_role = "CLIENT"
  Entonces la inserción viola maintenance_incidents_reported_by_role_check
```

**Restricciones (EARS)**
- El sistema deberá aceptar `reported_by_role` solo del vocabulario `RECEPTION`, `HEAD_KEEPER`, `HOUSEKEEPER`, `HEAD_MAINTENANCE`, `MAINTENANCE_TECH`.
- Cuando el jefe clasifique o asigne una incidencia, el sistema deberá escribir una fila en `operator_audit_log` (D-C21) con `actor_username`, `actor_role`, `entity_type`, `entity_id`, `action` y `created_at`.
- De acuerdo con una incidencia de área común, el sistema deberá exigir `area_id` no nulo y `room_id` nulo.

---

### CU-V-03 — Bloquear habitación para venta (firma on-chain obligatoria)

- **Actor primario:** Jefe de Mantenimiento.
- **Trazabilidad:** RF-M-03, RF-S-02, RF-S-07, RF-S-08, RNF-M-02, RNF-M-03, RNF-M-07, RNF-M-08, RNF-M-14, D-C1, D-C16, D-C18, D-C21, D-C23, D-C32, D-C34, D-C39.
- **Precondición:** incidencia con `blocks_sale = TRUE`; habitación con `publication_status = 'PUBLISHED'`; wallet conectada con `HEAD_MAINTENANCE_ROLE`.
- **Disparador:** el jefe pulsa «Bloquear para venta».

**Postcondición (oráculo):** `rooms.publication_status = 'MAINTENANCE'`, `maintenance_incidents.block_signature_id` no nulo, `on_chain_signatures` (`entity_type = 'ROOM_BLOCK'`, `status = 'SIGNED'`/`PENDING`/`FAILED`) y evento `RoomBlocked`/`OperationalAction('ROOM_BLOCK',…)`; sin wallet ni firma válida no hay cambio de estado (HTTP 409 `RoomAlreadyBlocked` o revert).

**Flujo principal**
1. El jefe fija `reason` y `until` (fecha civil en `TZ_REF`).
2. La UI marca la acción con ⛓ + «Requiere firma» (`data-testid="requires-signature"`); el botón está `disabled` si no hay wallet.
3. Con wallet conectada, el sistema muestra el modal `data-testid="signature-preview"` con acción, entidad y datos (`roomNumber`, `reason`, `until`).
4. El jefe confirma y firma el mensaje **EIP-712**; el sistema verifica `recovered_signer == signer_address` y el `role_snapshot`.
5. El sistema guarda `on_chain_signatures` (`entity_type = ROOM_BLOCK`, `status = SIGNED`) y encola el anclaje.
6. Al confirmarse la transacción se emite `RoomBlocked(roomNumber, reason, until, signer, timestamp)` (o `OperationalAction('ROOM_BLOCK', …)`).
7. `rooms.publication_status = 'MAINTENANCE'` (bloqueo comercial; `operational_status` no se modifica por el bloqueo), `rooms.maintenance_blocked_until = until`, `rooms.maintenance_blocked_reason = reason`; `maintenance_incidents.block_signature_id` apunta a la firma.
8. El catálogo público deja de mostrar la habitación.

**Flujos alternativos / excepciones**
- 03a — Sin wallet: botón `disabled` (`data-testid="wallet-disconnected"`), sin firma ni cambio de estado.
- 03b — Wallet sin rol: revert `AccessControlUnauthorizedAccount`.
- 03c — Cadena no disponible: `status` de la firma queda `PENDING` con job encolado, la habitación se muestra como `PENDING_ANCHOR` (`data-testid="signature-pending-anchor"`) y **no** se permite una nueva acción sobre la misma entidad (`EntityPendingAnchor`, HTTP 423).
- 03d — `recovered_signer` ≠ `signer_address`: `status = FAILED` con `SignatureMismatch`, la habitación no cambia de estado.
- 03e — Habitación ya bloqueada: HTTP 409 `RoomAlreadyBlocked`.
- 03f — Evidencia no adjunta: aviso `data-testid="evidence-missing"` («evidencia no adjunta»), pero la acción **no** se bloquea (D-C12).
- 03g — El jefe rechaza la firma: ningún cambio en BD ni on-chain.

```gherkin
Escenario: Bloqueo correcto con firma on-chain
  Dado que la incidencia 7c1e de la habitación 204 tiene blocks_sale=TRUE
  Y mi wallet 0xA11ce tiene HEAD_MAINTENANCE_ROLE y saldo de gas
  Cuando fijo motivo "cuadro eléctrico averiado" y hasta 2026-10-20, y firmo el mensaje EIP-712
  Entonces on_chain_signatures tiene entity_type=ROOM_BLOCK y status=SIGNED
  Y el contrato emite RoomBlocked(204, "cuadro eléctrico averiado", 2026-10-20, 0xA11ce, <ts>)
  Y rooms.publication_status = 'MAINTENANCE' y maintenance_incidents.block_signature_id no es nulo
  Y la habitación 204 no aparece en el catálogo público

Escenario: Botón deshabilitado sin wallet
  Dado que no tengo la wallet conectada
  Cuando abro la acción de bloqueo de la habitación 204
  Entonces el botón de firma está disabled con data-testid="wallet-disconnected"
  Y no se crea ninguna fila en on_chain_signatures

Escenario: Firma con wallet sin rol
  Dado que mi wallet 0xDead no tiene HEAD_MAINTENANCE_ROLE
  Cuando firmo el bloqueo de la habitación 204
  Entonces la transacción revierte con AccessControlUnauthorizedAccount(0xDead, HEAD_MAINTENANCE_ROLE)
  Y rooms.publication_status sigue siendo 'PUBLISHED'

Escenario: Firma válida pero cadena caída (PENDING_ANCHOR)
  Dado que el RPC no responde dentro de RPC_TIMEOUT_MS
  Cuando firmo el bloqueo de la habitación 204
  Entonces on_chain_signatures.status = 'PENDING' con retry_count=0 y next_attempt_at fijado
  Y la habitación muestra data-testid="signature-pending-anchor"
  Y un segundo intento de bloqueo sobre la entidad devuelve HTTP 423 EntityPendingAnchor

Escenario: Firma manipulada
  Dado que la firma fue generada por una clave distinta de 0xA11ce
  Cuando el sistema verifica la firma
  Entonces on_chain_signatures.status = 'FAILED' con error SignatureMismatch
  Y no se emite RoomBlocked ni cambia publication_status

Escenario: Habitación ya bloqueada
  Dado que la habitación 204 ya tiene publication_status='MAINTENANCE'
  Cuando intento bloquearla de nuevo
  Entonces la respuesta es HTTP 409 con RoomAlreadyBlocked(204)
```

**Restricciones (EARS)**
- Cuando el Jefe de Mantenimiento bloquee una habitación para venta, el sistema deberá exigir una firma EIP-712 válida de una wallet con `HEAD_MAINTENANCE_ROLE` antes de persistir el cambio.
- Mientras el anclaje de una firma esté `PENDING`, el sistema deberá marcar la entidad como `PENDING_ANCHOR` y deberá impedir una nueva acción sobre la misma entidad.
- Si el anclaje falla, entonces el sistema deberá reintentar con backoff `ANCHOR_BACKOFF`, hasta `ANCHOR_MAX_RETRIES` y con TTL `ANCHOR_TTL_HOURS`, sin revertir el estado off-chain.
- El sistema no deberá escribir ningún dato personal del huésped ni del jefe on-chain: solo `roomNumber`, `reason`, `until`, dirección `signer` y `timestamp`.
- El sistema deberá emitir el evento mediante `OperationalAction('ROOM_BLOCK', entityId, payloadHash, signer, timestamp)`, sin exigir redeploy para nuevos tipos.
- El sistema deberá verificar criptográficamente la firma **EIP-712** (`nonce`, `domain_hash`, `recovered_signer`) y deberá comprobar `role_snapshot` contra `operator_wallets` antes de aceptar el estado `SIGNED` (D-C16).

---

### CU-V-04 — Resolver y cerrar una incidencia (registrando repuestos)

- **Actor primario:** Jefe de Mantenimiento.
- **Trazabilidad:** RF-M-04, RF-M-10, RF-S-06, RNF-M-06, D-C34.
- **Precondición:** incidencia en `IN_PROGRESS` con técnico asignado.
- **Disparador:** el jefe cierra la incidencia con diagnóstico y acciones.

**Postcondición (oráculo):** `maintenance_incidents.status = 'RESOLVED'` con `resolved_by`/`resolved_at` no nulos, consumo de material vinculado y `operator_audit_log` (`action = 'RESOLVE'`); `publication_status` permanece en `'MAINTENANCE'` si `blocks_sale = TRUE`.

**Flujo principal**
1. El jefe registra `resolution_notes` con diagnóstico y acciones.
2. Registra los repuestos/materiales consumidos (cantidad y vínculo a la incidencia).
3. El sistema pasa la incidencia a `RESOLVED` con `resolved_by`, `resolved_at`.
4. **No** se modifica `publication_status`: el desbloqueo es un caso de uso aparte (CU-V-05).
5. Se escribe la traza en `operator_audit_log` (`action = RESOLVE`).

**Flujos alternativos / excepciones**
- 04a — Se intenta cerrar con `status = OPEN` sin diagnóstico: HTTP 422.
- 04b — Cantidad de repuesto ≤ 0: HTTP 422.
- 04c — Incidencia con `blocks_sale = TRUE` cerrada sin desbloquear: la habitación permanece `MAINTENANCE` y el listado lo refleja.
- 04d — Repuesto no catalogado: se permite como texto libre, con aviso.

```gherkin
Escenario: Cierre de incidencia con repuestos
  Dado que la incidencia 7c1e está IN_PROGRESS y asignada a tech.luis
  Cuando registro diagnóstico "breaker sustituido", acciones "cambio de breaker" y 2 uds de "BREAKER-16A"
  Entonces maintenance_incidents.status = 'RESOLVED', resolved_by = mi usuario y resolved_at no es nulo
  Y el consumo de 2 uds de BREAKER-16A queda vinculado a la incidencia
  Y operator_audit_log contiene action=RESOLVE

Escenario: Cierre sin diagnóstico
  Dado que la incidencia 7c1e está OPEN
  Cuando intento cerrarla con resolution_notes vacío
  Entonces la respuesta es HTTP 422
  Y status permanece OPEN

Escenario: Incidencia que bloquea venta y no se desbloquea
  Dado que la incidencia 7c1e tiene blocks_sale=TRUE y la habitación 204 está en MAINTENANCE
  Cuando cierro la incidencia como RESOLVED sin desbloquear
  Entonces rooms.publication_status sigue siendo 'MAINTENANCE'

Escenario: Consumo con cantidad inválida
  Cuando registro un consumo con cantidad 0 para la incidencia 7c1e
  Entonces la respuesta es HTTP 422
```

**Restricciones (EARS)**
- Cuando el jefe resuelva una incidencia, el sistema deberá exigir `resolution_notes` no vacío y deberá mantener el bloqueo de venta hasta que se ejecute CU-V-05.
- El sistema no deberá exigir firma on-chain para resolver una incidencia (D-C34).
- El sistema deberá vincular cada consumo material a la incidencia o a la tarea que lo origina.

---

### CU-V-05 — Desbloquear habitación tras verificación (firma on-chain obligatoria)

- **Actor primario:** Jefe de Mantenimiento.
- **Trazabilidad:** RF-M-05, RF-S-02, RF-S-07, RNF-M-02, RNF-M-03, RNF-M-07, RNF-M-14, D-C1, D-C16, D-C18, D-C23.
- **Precondición:** habitación con `publication_status = 'MAINTENANCE'`; sin incidencias abiertas que bloqueen venta; wallet con `HEAD_MAINTENANCE_ROLE`.
- **Disparador:** el jefe pulsa «Desbloquear».

**Postcondición (oráculo):** `on_chain_signatures` (`entity_type = 'ROOM_UNBLOCK'`, `status = 'SIGNED'`), evento `RoomUnblocked`, `rooms.publication_status = 'PAUSED'` y `operational_status = 'PENDING_CLEANING'`, campos de bloqueo a `NULL` y `unblock_signature_id` vinculado; `recovered_signer == signer_address` verificado (HTTP 422 `OpenIncident`/409 `RoomNotBlocked` en los casos alternos).

**Flujo principal**
1. El sistema comprueba que no quedan incidencias `OPEN`/`IN_PROGRESS` con `blocks_sale = TRUE` para la habitación.
2. La UI muestra `data-testid="requires-signature"` y el modal de previsualización `data-testid="signature-preview"`.
3. El jefe firma EIP-712; el sistema verifica `recovered_signer == signer_address` y comprueba `role_snapshot` contra `operator_wallets`; `on_chain_signatures` (`entity_type = ROOM_UNBLOCK`) pasa a `SIGNED` (o a `FAILED` con `SignatureMismatch`/`RoleChangedSinceSigning` si no coinciden).
4. El contrato emite `RoomUnblocked(roomNumber, signer, timestamp)`.
5. `rooms.publication_status` pasa a `'PAUSED'` y `rooms.operational_status` pasa a `'PENDING_CLEANING'` (pendiente de limpieza/inspección), **no** a `'PUBLISHED'`: la venta la activa Recepción/Admin manualmente (D-C9).
6. `rooms.maintenance_blocked_until` y `maintenance_blocked_reason` se limpian; `incidents.unblock_signature_id` se vincula.
7. Se notifica al Ama de llaves (CU-V-19; CU-V-11 queda fusionado).

**Flujos alternativos / excepciones**
- 05a — Quedan incidencias abiertas: HTTP 422 `OpenIncident`.
- 05b — Habitación no bloqueada: HTTP 409 `RoomNotBlocked`.
- 05c — Cadena caída: `PENDING_ANCHOR`, sin nueva acción sobre la entidad (HTTP 423).
- 05d — Firma de un técnico (sin rol): revert `AccessControlUnauthorizedAccount`.
- 05e — El jefe rechaza la firma: sin cambios.

```gherkin
Escenario: Desbloqueo correcto
  Dado que la habitación 204 está en MAINTENANCE y no tiene incidencias abiertas con blocks_sale
  Y mi wallet tiene HEAD_MAINTENANCE_ROLE
  Cuando firmo el desbloqueo
  Entonces el contrato emite RoomUnblocked(204, 0xA11ce, <ts>)
  Y rooms.publication_status pasa a 'PAUSED' y rooms.operational_status a 'PENDING_CLEANING'
  Y rooms.maintenance_blocked_until y maintenance_blocked_reason quedan en NULL

Escenario: Desbloqueo con incidencia abierta
  Dado que la habitación 204 tiene la incidencia 7c1e en IN_PROGRESS con blocks_sale=TRUE
  Cuando firmo el desbloqueo
  Entonces la respuesta es HTTP 422 con OpenIncident(7c1e)
  Y publication_status sigue siendo 'MAINTENANCE'

Escenario: Desbloqueo de una habitación no bloqueada
  Dado que la habitación 305 tiene publication_status='PUBLISHED'
  Cuando intento desbloquearla
  Entonces la respuesta es HTTP 409 con RoomNotBlocked(305)

Escenario: Firma de un técnico
  Dado que la wallet 0xTech no tiene HEAD_MAINTENANCE_ROLE
  Cuando esa wallet firma el desbloqueo
  Entonces la transacción revierte con AccessControlUnauthorizedAccount(0xTech, HEAD_MAINTENANCE_ROLE)

Escenario: Firma manipulada en el desbloqueo
  Dado que la firma fue generada por una clave distinta de la registrada en operator_wallets
  Cuando el sistema verifica la firma EIP-712
  Entonces recovered_signer ≠ signer_address y on_chain_signatures.status = 'FAILED' con SignatureMismatch
  Y rooms.publication_status sigue siendo 'MAINTENANCE'

Escenario: La inspección no libera la venta
  Dado que la habitación 204 quedó con operational_status='PENDING_CLEANING' y publication_status='PAUSED' tras el desbloqueo
  Cuando el Ama de llaves aprueba la inspección
  Entonces rooms.publication_status sigue siendo 'PAUSED'
  Y la habitación no aparece en el catálogo hasta que Recepción ejecute CU-V-32
```

**Restricciones (EARS)**
- Si existen incidencias abiertas con `blocks_sale = TRUE`, entonces el sistema deberá rechazar el desbloqueo con `OpenIncident`.
- Cuando el desbloqueo se complete, el sistema deberá dejar la habitación en `operational_status = 'PENDING_CLEANING'` con `publication_status = 'PAUSED'` y **no** deberá activar la venta automáticamente (D-C9).
- El sistema deberá exigir firma on-chain válida con `HEAD_MAINTENANCE_ROLE` para todo desbloqueo y deberá verificar criptográficamente la firma EIP-712 (`nonce`, `domain_hash`, `recovered_signer`) y el `role_snapshot` contra `operator_wallets` antes de aceptar el estado `SIGNED` (D-C16).

---

### CU-V-06 — Configurar y programar plan de mantenimiento preventivo

- **Actor primario:** Jefe de Mantenimiento.
- **Trazabilidad:** RF-M-06, RF-M-07, RF-S-08, RNF-M-06, D-C3, D-C34.
- **Precondición:** el catálogo `maintenance_area_types` está sembrado (10 tipos; 4 críticos).
- **Disparador:** el jefe crea o edita un plan preventivo.

**Postcondición (oráculo):** Filas en `preventive_plans` y en `preventive_tasks` con `requires_signature` derivado de `maintenance_area_types.is_critical`, más `operator_audit_log` (`action = 'CREATE'`/`'UPDATE'`); la periodicidad inválida viola `preventive_plans_periodicity_check` y HTTP 422 sin entidad.

**Flujo principal**
1. El jefe crea una fila en `preventive_plans` con `code`, `name`, `equipment`, `periodicity` y `room_id`/`area_id` opcional. La periodicidad del plan la restringe el CHECK real `preventive_plans_periodicity_check` a `WEEKLY`, `MONTHLY` y `QUARTERLY`; las tareas rutinarias por área (`maintenance_area_tasks`) admiten `DAILY`…`ANNUAL` (`maintenance_area_tasks_periodicity_check`).
2. Si el plan apunta a un área con `is_critical = TRUE`, el sistema fija `requires_signature = TRUE` en sus tareas.
3. El sistema genera las `preventive_tasks` con `due_date` según la periodicidad.
4. Se registra el cambio en `operator_audit_log` (`action = CREATE`/`UPDATE`).

**Flujos alternativos / excepciones**
- 06a — Periodicidad de plan inválida: violación del CHECK `preventive_plans_periodicity_check` (valores válidos `WEEKLY`/`MONTHLY`/`QUARTERLY`).
- 06b — Plan sin `room_id` ni `area_id`: se rechaza (HTTP 422).
- 06c — Se intenta poner `requires_signature = FALSE` en un área crítica: el sistema lo fuerza a `TRUE` (el flag de desactivación solo existe en dev/test).
- 06d — Área `is_active = FALSE`: HTTP 422.

```gherkin
Escenario: Crear plan preventivo crítico
  Dado que el área "Piscina principal" tiene area_type_code=POOL_FILTER y is_critical=TRUE
  Cuando creo un plan preventivo WEEKLY para esa área
  Entonces las preventive_tasks generadas tienen requires_signature=TRUE
  Y operator_audit_log registra action=CREATE del plan

Escenario: Periodicidad inválida de plan
  Cuando creo un plan en preventive_plans con periodicity='BIWEEKLY'
  Entonces la inserción viola preventive_plans_periodicity_check

Escenario: Intento de desactivar la firma en área crítica
  Dado que el área es ELEVATOR con is_critical=TRUE
  Cuando envío requires_signature=FALSE para su tarea
  Entonces el sistema persiste requires_signature=TRUE

Escenario: Plan sin entidad asociada
  Cuando creo un plan sin room_id y sin area_id
  Entonces la respuesta es HTTP 422
```

**Restricciones (EARS)**
- De acuerdo con el área de un plan preventivo, el sistema deberá derivar `requires_signature` de `maintenance_area_types.is_critical` como única fuente de verdad.
- El sistema deberá aceptar en `preventive_plans.periodicity` solo `WEEKLY`, `MONTHLY` y `QUARTERLY` (CHECK `preventive_plans_periodicity_check`) y en `maintenance_area_tasks.periodicity` solo `DAILY`, `WEEKLY`, `MONTHLY`, `QUARTERLY` y `ANNUAL` (`maintenance_area_tasks_periodicity_check`).
- El sistema no deberá exigir firma on-chain para crear o editar el plan (solo para verificar la tarea ejecutada en áreas críticas).

---

### CU-V-07 — Registrar cumplimiento de tarea preventiva (firma obligatoria en áreas críticas)

- **Actor primario:** Jefe de Mantenimiento.
- **Actores secundarios:** Técnico (ejecuta), sistema (genera vencimientos).
- **Trazabilidad:** RF-M-08, RF-S-05, RF-S-07, RNF-M-02, RNF-M-03, RNF-M-07, RNF-M-08, D-C3, D-C18, D-C20, D-C34.
- **Precondición:** `preventive_task` con `status` vencido o en curso; `evidence_path` opcional.
- **Disparador:** el jefe verifica una tarea preventiva ejecutada.

**Postcondición (oráculo):** `preventive_tasks.status = 'DONE'` y `validation_status = 'VALIDATED'` con `verified_by`, `verified_at` y `signature_id`; en áreas críticas, `on_chain_signatures` (`entity_type = 'PREVENTIVE_TASK'`, `status = 'SIGNED'`) y evento `PreventiveTaskVerified`; sin firma: HTTP 422 `MissingRequiredSignature`.

**Flujo principal**
1. El jefe revisa la tarea con `completed_by`, `completed_at`, `notes` y `evidence_path`.
2. Si la tarea es de **área crítica** (`requires_signature = TRUE`): la UI muestra `data-testid="requires-signature"`, el modal de previsualización (`data-testid="signature-preview"`) y exige firma EIP-712.
3. El sistema guarda `on_chain_signatures` (`entity_type = PREVENTIVE_TASK`, `status = SIGNED`) y encola el anclaje.
4. El contrato emite `PreventiveTaskVerified(taskId, planCode, signer, timestamp)`.
5. `preventive_tasks.verified_by`, `verified_at` y `signature_id` quedan informados; `preventive_tasks.status` pasa a `DONE` y `validation_status` a `VALIDATED`.
6. Si la tarea es de **área no crítica**: se verifica sin firma (`signature_id = NULL`), con traza off-chain.

**Flujos alternativos / excepciones**
- 07a — Tarea crítica sin firma: HTTP 422 `MissingRequiredSignature(PREVENTIVE_TASK)`.
- 07b — Firma con wallet sin `HEAD_MAINTENANCE_ROLE`: revert `AccessControlUnauthorizedAccount`.
- 07c — Cadena caída: `PENDING_ANCHOR` con backoff; no se marca `DONE`/`VALIDATED` hasta `SIGNED`.
- 07d — Evidencia no adjunta en tarea crítica: aviso `data-testid="evidence-missing"` («evidencia no adjunta»), no bloquea (D-C12).
- 07e — Tarea ya verificada: HTTP 409.

```gherkin
Escenario: Verificación de tarea crítica con firma
  Dado que la tarea preventiva "Cambio de filtro" pertenece a POOL_FILTER con requires_signature=TRUE
  Y mi wallet 0xA11ce tiene HEAD_MAINTENANCE_ROLE
  Cuando firmo la verificación con evidence_path="s3://evidencias/filtro-1010.jpg"
  Entonces on_chain_signatures tiene entity_type=PREVENTIVE_TASK y status=SIGNED
  Y el contrato emite PreventiveTaskVerified(<taskId>, "POOL_FILTER", 0xA11ce, <ts>)
  Y preventive_tasks.verified_by = mi usuario y signature_id no es nulo

Escenario: Tarea crítica sin firma
  Dado que la tarea "Revisión de ascensor" pertenece a ELEVATOR con requires_signature=TRUE
  Cuando intento verificar sin firma
  Entonces la respuesta es HTTP 422 con MissingRequiredSignature(PREVENTIVE_TASK)
  Y preventive_tasks.verified_at sigue en NULL

Escenario: Tarea no crítica sin firma
  Dado que la tarea "Corte de césped" pertenece a GARDEN con requires_signature=FALSE
  Cuando la verifico sin firma
  Entonces preventive_tasks.verified_by = mi usuario y signature_id = NULL
  Y no se emite ningún evento on-chain

Escenario: Firma sin rol de mantenimiento
  Dado que la wallet 0xOtro no tiene HEAD_MAINTENANCE_ROLE
  Cuando firma la verificación de POOL_FILTER
  Entonces la transacción revierte con AccessControlUnauthorizedAccount(0xOtro, HEAD_MAINTENANCE_ROLE)

Escenario: Área crítica sin evidencia
  Dado que la tarea de ELECTRIC_GENERATOR no tiene evidence_path
  Cuando el jefe firma la verificación
  Entonces la verificación se completa con estado SIGNED
  Pero la UI muestra el aviso "evidencia no adjunta"
```

**Restricciones (EARS)**
- Cuando la tarea preventiva pertenezca a un área con `is_critical = TRUE`, el sistema deberá exigir firma on-chain con `HEAD_MAINTENANCE_ROLE` y deberá rechazar la verificación con `MissingRequiredSignature` en su ausencia.
- El sistema no deberá exigir firma on-chain para tareas de áreas no críticas.
- El sistema deberá emitir `PreventiveTaskVerified` o `OperationalAction('PREVENTIVE_TASK', …)` por cada verificación crítica, con dirección del firmante y timestamp.

---

### CU-V-08 — Registrar mantenimiento rutinario de áreas comunes

- **Actor primario:** Jefe de Mantenimiento.
- **Actores secundarios:** Técnico (ejecuta), Camarera (reporta).
- **Trazabilidad:** RF-M-09, RF-S-06, RF-M-10, RNF-M-06, D-C34.
- **Precondición:** `maintenance_area_task` activa del área correspondiente.
- **Disparador:** el jefe o el técnico registra la ejecución de una tarea rutinaria.

**Postcondición (oráculo):** Fila en `maintenance_area_logs` con `signature_id = NULL`, sin fila en `on_chain_signatures` ni evento on-chain (y `verified_by`/`verified_at` al verificar); HTTP 422/503 en los casos inválidos.

**Flujo principal**
1. El ejecutor registra `performed_by`, `performed_at`, `notes` y `evidence_path` (opcional).
2. El sistema crea `maintenance_area_logs` sin firma on-chain (D-C34).
3. El jefe puede verificar el log (`verified_by`, `verified_at`); **no** hay firma on-chain ni fila en `on_chain_signatures` (el mantenimiento rutinario no se firma, D-C34).
4. Se registra traza off-chain.

**Flujos alternativos / excepciones**
- 08a — Tarea inactiva: HTTP 422.
- 08b — Área inactiva: HTTP 422.
- 08c — Terminal sin conexión: se rechaza la escritura sin modo offline (CU-V-12, RNF-M-18).
- 08d — Consumo de material asociado con cantidad ≤ 0: HTTP 422.

```gherkin
Escenario: Registro de tarea rutinaria de jardín
  Dado que el área "Jardines" tiene la tarea "Riego diario" activa
  Cuando registro su ejecución con performed_by="tech.luis" y evidence_path="s3://ev/riego.jpg"
  Entonces se crea maintenance_area_logs con signature_id = NULL
  Y no se emite ningún evento on-chain

Escenario: Verificación del log sin firma on-chain
  Dado que existe un maintenance_area_log de "Recolección de desechos"
  Cuando el jefe lo verifica
  Entonces verified_by y verified_at quedan informados
  Y no se crea ninguna fila en on_chain_signatures para el log

Escenario: Tarea de área inactiva
  Dado que el área "Baños comunes" tiene is_active=FALSE
  Cuando registro la ejecución de una de sus tareas
  Entonces la respuesta es HTTP 422

Escenario: Registro desde terminal sin conexión
  Dado que el terminal ha perdido la conexión
  Cuando intento registrar una tarea rutinaria
  Entonces la respuesta es HTTP 503 con mensaje claro
  Y no se crea el log
```

**Restricciones (EARS)**
- El sistema no deberá exigir firma on-chain para el mantenimiento rutinario de áreas comunes.
- Mientras un terminal no tenga conexión, el sistema deberá rechazar la escritura con un mensaje claro y **no** deberá operar en modo offline.
- El sistema deberá registrar `performed_by`, `performed_at` y la evidencia cuando exista.

---

### CU-V-09 — Validar tareas de subordinados (SLA 24 h)

- **Actor primario:** Jefe de Mantenimiento.
- **Trazabilidad:** RF-S-06, RNF-M-20, RNF-M-21, D-C35, D-C38.
- **Precondición:** tarea o incidencia cerrada por un técnico con estado `PENDING_VERIFICATION`.
- **Disparador:** el jefe revisa las tareas pendientes de validación.

**Postcondición (oráculo):** `preventive_tasks.validation_status = 'VALIDATED'` (o `PENDING_VERIFICATION_EXPIRED` al vencer el SLA) con traza en `operator_audit_log`; el vencimiento escala a Administración y la auto-validación devuelve HTTP 403.

**Flujo principal**
1. El panel muestra `data-testid="pending-verification"` y `data-testid="sla-countdown"` con el tiempo restante.
2. Si el jefe valida dentro de las 24 h: la tarea pasa a `VALIDATED`.
3. Si el jefe rechaza: la tarea vuelve al técnico con observaciones.
4. Si vencen las 24 h sin validación: la tarea pasa a `PENDING_VERIFICATION_EXPIRED` y escala al Administrador (CU-V-39); el panel del jefe y el del Administrador la muestran.

**Flujos alternativos / excepciones**
- 09a — La tarea vencida no bloquea la habitación, pero no cuenta como completada (RNF-M-21).
- 09b — Validar una tarea no completada: HTTP 422.
- 09c — El propio subordinado intenta validarse: HTTP 403.
- 09d — Validar una tarea ya validada: HTTP 409.

```gherkin
Escenario: Validación dentro del SLA
  Dado que la tarea 5aa1 está PENDING_VERIFICATION desde hace 3 h
  Cuando el jefe la valida
  Entonces su estado pasa a VALIDATED
  Y el data-testid="sla-countdown" deja de mostrarse

Escenario: Vencimiento del SLA
  Dado que la tarea 5aa1 supera las 24 h sin validación
  Cuando el proceso de vencimiento se ejecuta
  Entonces la tarea pasa a PENDING_VERIFICATION_EXPIRED
  Y aparece en el panel del Administrador (data-testid="pending-verification")

Escenario: Tarea vencida no bloquea la habitación
  Dado que la tarea 5aa1 está PENDING_VERIFICATION_EXPIRED
  Entonces rooms.publication_status no cambia por ese motivo
  Pero la tarea no cuenta como completada

Escenario: Auto-validación de un subordinado
  Dado que "tech.luis" es el ejecutor de la tarea 5aa1
  Cuando tech.luis intenta validarla
  Entonces la respuesta es HTTP 403
```

**Restricciones (EARS)**
- El sistema deberá exigir la validación de una tarea por un jefe distinto del ejecutor.
- Cuando transcurran `SLA_VALIDATION_HOURS` sin validación, el sistema deberá pasar la tarea a `PENDING_VERIFICATION_EXPIRED` y deberá escalarla al Administrador.
- El sistema deberá mostrar el tiempo restante de validación en el panel del jefe.

---

### CU-V-10 — Generar informes de mantenimiento

- **Actor primario:** Jefe de Mantenimiento.
- **Trazabilidad:** RF-M-11, RNF-M-05, RNF-M-06, D-C41.
- **Precondición:** datos de incidencias, tareas y consumo disponibles.
- **Disparador:** el jefe abre `/mantenimiento/informes`.

**Postcondición (oráculo):** Informe paginado con `page_size ≤ PAGE_MAX` y p95 < `P95_LIST_MS`; `data-testid="empty-state"` sin datos y `data-testid="degraded-state"`/`retry` si el servicio cae; HTTP 422 si `page_size > PAGE_MAX`.

**Flujo principal**
1. El jefe filtra por habitación, área, técnico y periodo.
2. El sistema agrega incidencias, tiempos y consumos, y los muestra paginados (máx. `PAGE_MAX`).
3. Exporta el resultado en CSV/PDF.

**Flujos alternativos / excepciones**
- 10a — Sin datos: `data-testid="empty-state"`.
- 10b — Página > `PAGE_MAX`: HTTP 422.
- 10c — Servicio caído: `data-testid="degraded-state"` con `data-testid="retry"`.

```gherkin
Escenario: Informe filtrado por técnico y periodo
  Dado que existen incidencias resueltas por tech.luis entre 2026-10-01 y 2026-10-07
  Cuando genero el informe con esos filtros
  Entonces el listado incluye solo esas incidencias
  Y la página devuelve como máximo 50 filas

Escenario: Informe sin datos
  Cuando genero un informe para un área sin incidencias
  Entonces se muestra data-testid="empty-state"

Escenario: Página por encima del máximo
  Cuando solicito page_size=200
  Entonces la respuesta es HTTP 422

Escenario: Servicio de informes degradado
  Dado que el RPC/BD de lectura está caído
  Cuando abro los informes
  Entonces se muestra data-testid="degraded-state" y data-testid="retry"
```

**Restricciones (EARS)**
- El sistema deberá devolver los listados con p95 < `P95_LIST_MS` y páginas de como máximo `PAGE_MAX` elementos.
- Si no hay datos, entonces el sistema deberá mostrar el estado vacío en lugar de un error.

---

### CU-V-11 — (Fusionado en CU-V-19) Notificar al Ama de llaves que la habitación está lista para limpieza

> **Estado:** caso de uso **fusionado en CU-V-19** (CU-AUD-03). Se conserva el número CU-V-11 para no romper la numeración, los gráficos ni la trazabilidad. La notificación es **automática** (la dispara una transición de estado del sistema): **no** es un objetivo del actor Jefe de Mantenimiento ni requiere su intervención.

- **Actor primario:** Sistema (notificación automática).
- **Actor beneficiario:** Ama de llaves (`HEAD_KEEPER`).
- **Trazabilidad:** RF-M-12, RF-K-03, D-C41 → ver CU-V-19.
- **Precondición:** incidencia resuelta o habitación desbloqueada (CU-V-05) con `operational_status = 'PENDING_CLEANING'`.
- **Disparador:** transición automática de la habitación a `operational_status = 'PENDING_CLEANING'`.

**Postcondición (oráculo):** notificación idempotente registrada para `HEAD_KEEPER` y habitación en la cola de limpieza descrita en CU-V-19; no se crea una segunda notificación para la misma `(room_id, transición, timestamp)`.

**Flujo, excepciones y criterios de aceptación:** ver **CU-V-19** (flujo unificado, sin actor Jefe de Mantenimiento).

---

## 8. Suite de Mantenimiento — Técnico (`MAINTENANCE_TECH`)

### CU-V-12 — Autenticarse en el terminal fijo con PIN

- **Actor primario:** Técnico de mantenimiento.
- **Trazabilidad:** RNF-M-09, RNF-M-17, RNF-M-18, RNF-M-20, RNF-M-04, D-C2, D-C10, D-C17, D-C29, D-C30.
- **Precondición:** operario dado de alta en `terminal_operators` (`role = MAINTENANCE_TECH`, `active = TRUE`).
- **Disparador:** el técnico introduce su PIN en el terminal.

**Postcondición (oráculo):** Sesión de terminal creada (HTTP 200) o fallo con HTTP 401/423/428; `failed_attempts`, `locked_until` y `must_change_pin` actualizados conforme al caso.

**Flujo principal**
1. El técnico introduce PIN de 4–6 dígitos (`data-testid="terminal-pin"`).
2. El sistema compara el `pin_hash` bcrypt y crea sesión de terminal.
3. Si `must_change_pin = TRUE`, fuerza el cambio antes de operar.
4. La sesión se cierra automáticamente tras `TERMINAL_SESSION_TIMEOUT_MS` (5 min) de inactividad.

**Flujos alternativos / excepciones**
- 12a — PIN incorrecto: `failed_attempts` aumenta en 1; HTTP 401.
- 12b — 5.º intento fallido: `locked_until` se fija; HTTP 423 `PinLocked`.
- 12c — `must_change_pin = TRUE`: HTTP 428 `MustChangePin`; obliga al cambio.
- 12d — PIN con más de `TERMINAL_PIN_ROTATION_DAYS` desde `pin_changed_at`: HTTP 401 `PinExpired`.
- 12e — Redis caído: se opera sin caché, sin bloquear la sesión.
- 12f — PostgreSQL caído: se bloquea la escritura con mensaje claro y se mantiene la lectura cacheada; **sin modo offline**.

```gherkin
Escenario: Acceso correcto con PIN
  Dado que "tech.luis" está activo con un PIN válido y must_change_pin=FALSE
  Cuando introduzco el PIN correcto en data-testid="terminal-pin"
  Entonces la respuesta es HTTP 200 y se crea la sesión de terminal

Escenario: Bloqueo tras 5 intentos fallidos
  Dado que "tech.luis" acumula 4 intentos fallidos
  Cuando introduce un PIN incorrecto por quinta vez
  Entonces failed_attempts = 5, locked_until no es nulo y la respuesta es HTTP 423 PinLocked

Escenario: PIN de un solo uso inicial
  Dado que "tech.luis" tiene must_change_pin=TRUE
  Cuando introduce su PIN inicial correcto
  Entonces la respuesta es HTTP 428 MustChangePin
  Y se le exige fijar un PIN nuevo antes de continuar

Escenario: PIN caducado por rotación
  Dado que pin_changed_at es de hace 91 días
  Cuando introduzco el PIN correcto
  Entonces la respuesta es HTTP 401 PinExpired
  Y se solicita la rotación del PIN

Escenario: Caída de PostgreSQL
  Dado que PostgreSQL no responde
  Cuando intento registrar una tarea
  Entonces la respuesta es HTTP 503 con mensaje claro
  Y la lectura cacheada sigue disponible

Escenario: Terminal sin conexión
  Dado que el terminal ha perdido la red
  Cuando intento cualquier escritura
  Entonces el sistema avisa de la pérdida de conexión
  Y no se realiza ninguna operación offline
```

**Restricciones (EARS)**
- El sistema deberá aceptar PIN de 4–6 dígitos almacenados con hash bcrypt y deberá bloquear la cuenta tras `TERMINAL_PIN_MAX_ATTEMPTS` fallos.
- El sistema deberá exigir la rotación del PIN cada `TERMINAL_PIN_ROTATION_DAYS` y el cambio en el primer acceso.
- Mientras un terminal no tenga conexión, el sistema deberá rechazar la escritura; **no** deberá ofrecer modo offline.
- Si Redis cae, entonces el sistema deberá operar sin caché; si PostgreSQL cae, deberá bloquear la escritura con mensaje claro manteniendo la lectura cacheada.

---

### CU-V-13 — Consultar mis incidencias y tareas asignadas

- **Actor primario:** Técnico de mantenimiento.
- **Trazabilidad:** RF-M-02, RNF-M-20, RNF-M-04, RNF-M-05, D-C35.
- **Precondición:** sesión de terminal válida.
- **Disparador:** el técnico abre `/mantenimiento` o `/mantenimiento/incidencias`.

**Postcondición (oráculo):** `data-testid="incident-list"`/`incident-detail` limitado a `assigned_to = username` o sus áreas, sin importes ni botones de firma; HTTP 403 en acceso ajeno y `data-testid="degraded-state"` si el servicio cae.

**Flujo principal**
1. El sistema muestra solo las incidencias y tareas donde `assigned_to = username` o las de sus áreas (`data-testid="incident-list"` / `data-testid="incident-detail"`).
2. El listado incluye estado, prioridad y `due_date`.
3. **No** muestra importes, huéspedes, cargos, configuración ni firma on-chain.

**Flujos alternativos / excepciones**
- 13a — Intento de acceso a una incidencia no asignada: HTTP 403.
- 13b — Intento de ver el importe de un cargo: el campo no se renderiza.
- 13c — Servicio degradado: `data-testid="degraded-state"` con `data-testid="retry"`.

```gherkin
Escenario: Listado limitado a mis tareas
  Dado que "tech.luis" tiene asignadas 3 incidencias
  Cuando abre /mantenimiento/incidencias
  Entonces ve exactamente esas 3 incidencias
  Y no ve incidencias de otros técnicos

Escenario: Acceso a incidencia ajena
  Dado que la incidencia 7c1e está asignada a "tech.marta"
  Cuando tech.luis abre /mantenimiento/incidencias/7c1e
  Entonces la respuesta es HTTP 403

Escenario: Sin importes ni huéspedes
  Cuando tech.luis abre el detalle de una incidencia
  Entonces no se renderiza ningún importe, nombre de huésped ni cargo
  Y no aparece ningún botón de firma on-chain

Escenario: Listado degradado
  Dado que el servicio de lectura está caído
  Cuando abro el listado
  Entonces se muestra data-testid="degraded-state"
```

**Restricciones (EARS)**
- El sistema deberá restringir la vista del técnico a sus incidencias, tareas y áreas asignadas.
- El sistema no deberá exponer al técnico importes, datos de huéspedes, cargos, configuración ni acciones de firma.
- El sistema deberá devolver el listado en p95 < `P95_LIST_MS` con páginas de como máximo `PAGE_MAX` elementos.

---

### CU-V-14 — Registrar avance y cierre de tarea con evidencia

- **Actor primario:** Técnico de mantenimiento.
- **Trazabilidad:** RF-M-04, RF-M-08, RF-M-09, RF-M-10, RF-S-06, RNF-M-17, RNF-M-18, RNF-M-20, D-C29, D-C30, D-C34.
- **Precondición:** tarea o incidencia asignada al técnico, en `OPEN`/`IN_PROGRESS`.
- **Disparador:** el técnico registra avance, adjunta evidencia y cierra.

**Postcondición (oráculo):** Tarea/incidencia cerrada con `updated_at` actualizado y traza en `operator_audit_log`; HTTP 403/409 `OptimisticLockConflict`/503 en los casos alternos y `data-testid="evidence-missing"` sin foto.

**Flujo principal**
1. El técnico marca `IN_PROGRESS` y añade notas.
2. Adjunta evidencia opcional (foto/nota) con `evidence_path`.
3. Cierra la tarea: el estado pasa a `PENDING_VERIFICATION` (pendiente de validación del jefe, CU-V-09).
4. La operación completa se realiza en ≤ 30 s y ≤ 3 toques; la confirmación es visual y sonora.
5. Se registra la traza off-chain (`operator_audit_log`).

**Flujos alternativos / excepciones**
- 14a — Tarea no asignada al técnico: HTTP 403.
- 14b — Conflicto de concurrencia (bloqueo optimista `updated_at`): HTTP 409 `OptimisticLockConflict`.
- 14c — Sin evidencia: se permite; aviso `data-testid="evidence-missing"` («evidencia no adjunta»).
- 14d — Sin conexión: HTTP 503, sin modo offline.
- 14e — Tarea ya cerrada: HTTP 409.

```gherkin
Escenario: Cierre de tarea con evidencia
  Dado que la tarea 5aa1 está asignada a tech.luis en estado OPEN
  Cuando la marco IN_PROGRESS, adjunto la foto "s3://ev/5aa1.jpg" y la cierro
  Entonces su estado pasa a PENDING_VERIFICATION
  Y el tiempo desde el inicio de la operación hasta el cierre es ≤ 30 s
  Y la UI emite confirmación visual y sonora

Escenario: Conflicto de concurrencia
  Dado que "tech.marta" ya actualizó la tarea 5aa1 (nuevo updated_at)
  Cuando tech.luis intenta cerrarla con el updated_at antiguo
  Entonces la respuesta es HTTP 409 con OptimisticLockConflict(updated_at)

Escenario: Cierre sin evidencia
  Dado que la tarea 5aa1 no tiene evidencia adjunta
  Cuando tech.luis la cierra
  Entonces el cierre se completa
  Y se muestra data-testid="evidence-missing" con el aviso "evidencia no adjunta"

Escenario: Cierre de tarea ajena
  Dado que la tarea 5aa1 está asignada a tech.marta
  Cuando tech.luis intenta cerrarla
  Entonces la respuesta es HTTP 403

Escenario: Tarea ya cerrada
  Dado que la tarea 5aa1 está PENDING_VERIFICATION
  Cuando tech.luis intenta cerrarla de nuevo
  Entonces la respuesta es HTTP 409
```

**Restricciones (EARS)**
- Cuando el técnico cierre una tarea, el sistema deberá dejarla en `PENDING_VERIFICATION` y **no** deberá considerarla completada hasta la validación del jefe.
- El sistema deberá aplicar bloqueo optimista con `updated_at` y deberá devolver HTTP 409 ante conflicto.
- El sistema deberá permitir registrar la tarea en ≤ 30 s y ≤ 3 toques, con confirmación visual y sonora y mensajes en el idioma del operario.

---

### CU-V-15 — Reportar incidencia desde el terminal

- **Actor primario:** Técnico de mantenimiento.
- **Trazabilidad:** RF-M-01, RF-S-06, RNF-M-06, RNF-M-20, D-C36.
- **Precondición:** sesión de terminal válida.
- **Disparador:** el técnico detecta una avería durante su trabajo.

**Postcondición (oráculo):** `maintenance_incidents` creada con `status = 'OPEN'` y `reported_by_role = 'MAINTENANCE_TECH'`; HTTP 422 sin entidad, violación del CHECK si el rol se manipula y HTTP 503 sin conexión.

**Flujo principal**
1. El técnico registra `kind`, `description` y `priority`.
2. El sistema crea la incidencia con `reported_by = username` y `reported_by_role = MAINTENANCE_TECH`.
3. La incidencia queda `OPEN` para que el jefe la clasifique y asigne (CU-V-02).

**Flujos alternativos / excepciones**
- 15a — `reported_by_role` distinto de `MAINTENANCE_TECH`: violación del CHECK.
- 15b — Incidencia sin `room_id` ni `area_id`: HTTP 422.
- 15c — Sin conexión: HTTP 503.

```gherkin
Escenario: Reporte de avería
  Dado que estoy autenticado como "tech.luis"
  Cuando reporto la avería kind="PLUMBING" en la habitación 210 con priority=HIGH
  Entonces se crea maintenance_incidents con status=OPEN
  Y reported_by_role = 'MAINTENANCE_TECH'

Escenario: Rol de reporte manipulado
  Cuando envío reported_by_role='RECEPTION' en la petición
  Entonces la inserción viola maintenance_incidents_reported_by_role_check

Escenario: Reporte sin habitación ni área
  Cuando reporto una avería sin room_id y sin area_id
  Entonces la respuesta es HTTP 422

Escenario: Reporte sin conexión
  Dado que el terminal perdió la conexión
  Cuando intento reportar una avería
  Entonces la respuesta es HTTP 503
```

**Restricciones (EARS)**
- El sistema deberá fijar `reported_by_role = MAINTENANCE_TECH` para las incidencias reportadas desde el terminal del técnico.
- El sistema deberá exigir exactamente uno de `room_id` o `area_id` por incidencia.

---

## 9. Suite Ama de llaves — Ama de llaves (`HEAD_KEEPER`)

### CU-V-16 — Autenticarse en la Suite Ama de llaves

- **Actor primario:** Ama de llaves (`HEAD_KEEPER`).
- **Trazabilidad:** RF-S-01, RNF-M-02, RNF-M-06, RNF-M-04, D-C1, D-C40, D-C42.
- **Precondición:** usuario activo con `role = HEAD_KEEPER`; TOTP enrolado; wallet registrada (para firma opcional de inspección).
- **Disparador:** el Ama de llaves abre `/ama-de-llaves` (o es redirigida desde `/housekeeping`, D-C40).

**Postcondición (oráculo):** Cookie de sesión (HTTP 200) y redirección HTTP 308 de `/housekeeping` a `/ama-de-llaves`; el botón de firma de inspección aparece o queda `disabled` según `INSPECTION_REQUIRES_SIGNATURE`.

**Flujo principal**
1. Introduce usuario + contraseña + TOTP y accede al tablero.
2. La ruta `/housekeeping` redirige a `/ama-de-llaves` y la UI la rotula «Ama de llaves».
3. La wallet permanece desacoplada y solo se solicita si el hotel ha activado la firma de inspección (`INSPECTION_REQUIRES_SIGNATURE = TRUE`).

**Flujos alternativos / excepciones**
- 16a — Credenciales incorrectas: HTTP 401.
- 16b — Usuario inactivo: HTTP 403.
- 16c — Wallet no registrada: se permite navegar; la firma de inspección queda indisponible.
- 16d — Redirección desde `/housekeeping`: HTTP 308 a `/ama-de-llaves` conservando la ruta interna.

```gherkin
Escenario: Acceso correcto
  Dado que soy un usuario activo con rol HEAD_KEEPER y TOTP enrolado
  Cuando inicio sesión con contraseña y TOTP correctos
  Entonces recibo una cookie de sesión (HTTP 200)
  Y accedo al tablero /ama-de-llaves

Escenario: Redirección de la ruta antigua
  Cuando abro /housekeeping
  Entonces recibo una redirección HTTP 308 a /ama-de-llaves

Escenario: Usuario inactivo
  Dado que mi usuario HEAD_KEEPER tiene active=FALSE
  Cuando intento iniciar sesión
  Entonces la respuesta es HTTP 403

Escenario: Wallet no registrada
  Dado que mi usuario no tiene wallet activa en operator_wallets
  Cuando el hotel tiene INSPECTION_REQUIRES_SIGNATURE=FALSE y abro una inspección
  Entonces puedo registrar la inspección sin firma
  Y el botón de firma on-chain no se muestra
```

**Restricciones (EARS)**
- El sistema deberá autenticar al Ama de llaves con contraseña + TOTP y mantener la wallet desacoplada de la sesión.
- El sistema deberá redirigir `/housekeeping` a `/ama-de-llaves` sin romper enlaces existentes.
- De acuerdo con el flag `INSPECTION_REQUIRES_SIGNATURE`, el sistema deberá mostrar o no el botón de firma de inspección.

---

### CU-V-17 — Crear turnos y asignar habitaciones a las camareras

- **Actor primario:** Ama de llaves.
- **Trazabilidad:** RF-K-01, RF-K-04, RF-S-08, RNF-M-06, D-C9.
- **Precondición:** camareras activas en `terminal_operators` (2 a cargo) y habitaciones con estado operativo.
- **Disparador:** el Ama de llaves crea un turno (mañana/tarde/noche) y reparte habitaciones.

**Postcondición (oráculo):** Filas en `housekeeping_assignments` con `status = 'PENDING'`, `assignee` y `room_id`, más `operator_audit_log` (`action = 'ASSIGN'`/`'CREATE'`); HTTP 422/409 en los casos alternos y `data-testid="empty-state"` sin habitaciones pendientes.

**Flujo principal**
1. Crea el turno con fecha y franja (`MAÑANA`/`TARDE`/`NOCHE`) y abre la asignación (`data-testid="assignment-list"`).
2. Asigna habitaciones a cada camarera (manual o reparto automático).
3. El sistema crea `housekeeping_assignments` con `assignee`, `room_id` y `status`.
4. Registra la operación en `operator_audit_log` (`action = ASSIGN`/`CREATE`).

**Flujos alternativos / excepciones**
- 17a — Camarera inactiva o inexistente: HTTP 422.
- 17b — Solapamiento de turnos de la misma camarera: HTTP 409.
- 17c — La habitación está bloqueada por mantenimiento (`publication_status = 'MAINTENANCE'`): se puede asignar limpieza, pero **no** se activa la venta (D-C9).
- 17d — Reparto automático sin habitaciones pendientes: `data-testid="empty-state"`.

```gherkin
Escenario: Crear turno y repartir habitaciones
  Dado que hay 2 camareras activas y 10 habitaciones DIRTY
  Cuando creo el turno de MAÑANA y ejecuto el reparto automático
  Entonces se crean housekeeping_assignments con status=PENDING
  Y cada camarera recibe al menos 1 habitación

Escenario: Asignación a camarera inactiva
  Dado que "camarera.ana" tiene active=FALSE
  Cuando intento asignarle la habitación 301
  Entonces la respuesta es HTTP 422

Escenario: Solapamiento de turnos
  Dado que "camarera.ana" ya tiene el turno MAÑANA
  Cuando intento asignarle otro turno MAÑANA en la misma fecha
  Entonces la respuesta es HTTP 409

Escenario: Habitación bloqueada por mantenimiento
  Dado que la habitación 204 está bloqueada por mantenimiento (publication_status='MAINTENANCE')
  Cuando la asigno a una camarera para limpieza
  Entonces la asignación se crea
  Pero rooms.publication_status sigue siendo 'MAINTENANCE'

Escenario: Reparto sin habitaciones pendientes
  Dado que no hay habitaciones DIRTY
  Cuando ejecuto el reparto automático
  Entonces se muestra data-testid="empty-state"
```

**Restricciones (EARS)**
- El sistema deberá registrar la asignación de cada habitación a una camarera con su turno y estado.
- El sistema deberá impedir solapamientos de turno por camarera.
- El sistema no deberá activar la venta como consecuencia de una asignación de limpieza.

---

### CU-V-18 — Consultar el tablero de estado operativo en tiempo real

- **Actor primario:** Ama de llaves.
- **Trazabilidad:** RF-K-02, RNF-M-04, RNF-M-05, D-C26.
- **Precondición:** sesión válida; habitaciones cargadas.
- **Disparador:** el Ama de llaves abre `/ama-de-llaves`.

**Postcondición (oráculo):** `data-testid="room-state-board"` muestra los cinco estados canónicos y marca el bloqueo derivado de `publication_status = 'MAINTENANCE'`; p95 < `P95_BOARD_MS` y `data-testid="degraded-state"` con lectura cacheada.

**Flujo principal**
1. El sistema muestra cada habitación con su estado operativo canónico: `CLEAN`, `DIRTY`, `OCCUPIED`, `PENDING_CLEANING`, `IN_INSPECTION` (`data-testid="room-state-board"`); el bloqueo por mantenimiento se representa como indicador derivado de `publication_status = 'MAINTENANCE'`, no como estado operativo.
2. Los cambios de estado de las camareras se reflejan en el tablero.
3. El tablero es usable desde móvil (botones amplios, contraste legible).

**Flujos alternativos / excepciones**
- 18a — Estado desconocido: se muestra «estado no disponible» sin romper el tablero.
- 18b — Dependencia caída: `data-testid="degraded-state"` con lectura cacheada.
- 18c — Concurrencia: el estado mostrado refleja el último `updated_at`.

```gherkin
Escenario: Tablero con los cinco estados operativos
  Dado que existen habitaciones en CLEAN, DIRTY, OCCUPIED, PENDING_CLEANING e IN_INSPECTION
  Cuando abro /ama-de-llaves
  Entonces data-testid="room-state-board" muestra las habitaciones con esos 5 estados
  Y una habitación con publication_status='MAINTENANCE' se marca como bloqueada por mantenimiento

Escenario: Reflejo de un cambio de estado
  Dado que la camarera inicia la limpieza de la habitación 301 (asignación IN_PROGRESS y habitación DIRTY)
  Cuando el tablero se actualiza
  Entonces la habitación 301 aparece como DIRTY con su updated_at más reciente y la asignación IN_PROGRESS

Escenario: Latencia del tablero
  Dado el escenario de carga de 20 usuarios concurrentes, 50 habitaciones y ventana de 90 días
  Cuando se mide el tiempo de carga del tablero
  Entonces el p95 es < 500 ms

Escenario: Dependencia degradada
  Dado que el servicio de estado no responde
  Cuando abro el tablero
  Entonces se muestra data-testid="degraded-state"
  Y la lectura cacheada sigue visible
```

**Restricciones (EARS)**
- Cuando cambie el estado operativo de una habitación, el sistema deberá reflejarlo en el tablero en p95 < `P95_BOARD_MS` con 20 usuarios concurrentes, 50 habitaciones y ventana de 90 días.
- El sistema deberá usar exclusivamente los cinco estados de `ROOM_STATES`; el bloqueo por mantenimiento se deriva de `publication_status = 'MAINTENANCE'`.
- Mientras una dependencia esté caída, el sistema deberá mostrar el estado degradado sin dejar el tablero inutilizable.

---

### CU-V-19 — Recibir notificación de habitaciones que requieren limpieza

- **Actor primario:** Ama de llaves.
- **Trazabilidad:** RF-K-03, RF-M-12, RNF-M-06.
- **Precondición:** se produce un check-out, una resolución de mantenimiento o el uso diario.
- **Disparador:** el sistema detecta la transición a «requiere limpieza».

**Postcondición (oráculo):** Notificación idempotente registrada para `HEAD_KEEPER` y habitación en la cola de limpieza; sin notificación si la habitación ya está `CLEAN` o con asignación `IN_PROGRESS`, y encolada si no hay Ama de llaves activa.

**Flujo principal**
1. El sistema crea la notificación con `{roomNumber, origen, timestamp}` para `HEAD_KEEPER`.
2. La habitación aparece en la cola de limpieza del tablero.
3. La operación es idempotente por `(room_id, origen, timestamp)`.

**Flujos alternativos / excepciones**
- 19a — Notificación duplicada por reproceso: se deduplica.
- 19b — Sin Ama de llaves activa: queda encolada.
- 19c — Habitación ya en `DIRTY`/`PENDING_CLEANING` con asignación `IN_PROGRESS`, o en `CLEAN`: no genera nueva notificación.

```gherkin
Escenario: Notificación por check-out
  Dado que la habitación 401 registra un check-out
  Cuando el sistema procesa la transición
  Entonces HEAD_KEEPER recibe 1 notificación de limpieza para la habitación 401

Escenario: Notificación por mantenimiento resuelto
  Dado que la habitación 204 pasa a operational_status='PENDING_CLEANING' tras el desbloqueo
  Cuando el sistema procesa la transición
  Entonces HEAD_KEEPER recibe 1 notificación de limpieza para la habitación 204

Escenario: Deduplicación
  Dado que la notificación de (401, CHECKOUT, <ts>) ya existe
  Cuando el proceso se reintenta
  Entonces no se crea una segunda notificación

Escenario: Habitación ya limpia
  Dado que la habitación 401 está CLEAN
  Cuando llega un evento de uso diario
  Entonces no se genera notificación nueva
```

**Restricciones (EARS)**
- Cuando una habitación requiera limpieza, el sistema deberá notificar al Ama de llaves de forma idempotente.
- Si no hay Ama de llaves activa, entonces el sistema deberá encolar la notificación sin perderla.

---

### CU-V-20 — Supervisar el trabajo de las camareras

- **Actor primario:** Ama de llaves.
- **Trazabilidad:** RF-K-04, RNF-M-06, D-C35.
- **Precondición:** turno activo con asignaciones.
- **Disparador:** el Ama de llaves abre el panel de supervisión.

**Postcondición (oráculo):** Panel con asignaciones/estados por camarera y nueva fila `operator_audit_log` (`action = 'ASSIGN'`) tras reasignar; `data-testid="conflict-warning"` si la asignación está `IN_PROGRESS` y HTTP 403 a técnicos.

**Flujo principal**
1. El sistema muestra por camarera las habitaciones asignadas, su estado y los tiempos.
2. El Ama de llaves puede reasignar una habitación pendiente a otra camarera.
3. La reasignación se audita (`action = ASSIGN`).

**Flujos alternativos / excepciones**
- 20a — Reasignar una habitación con asignación ya `IN_PROGRESS`: se permite con aviso `data-testid="conflict-warning"` que exige confirmación explícita.
- 20b — Camarera sin asignaciones: se muestra «sin tareas».
- 20c — Intento de un técnico de ver este panel: HTTP 403.

```gherkin
Escenario: Panel de supervisión
  Dado que "camarera.ana" tiene 5 asignaciones y "camarera.rosa" 4
  Cuando abro el panel de supervisión
  Entonces veo 5 y 4 asignaciones respectivamente con su estado

Escenario: Reasignación de una tarea pendiente
  Dado que la habitación 301 está asignada a camarera.rosa en estado PENDING
  Cuando la reasigno a camarera.ana
  Entonces housekeeping_assignments.assignee = "camarera.ana"
  Y operator_audit_log registra action=ASSIGN

Escenario: Reasignación de una tarea en curso
  Dado que la asignación de camarera.rosa en la habitación 301 está IN_PROGRESS
  Cuando intento reasignarla
  Entonces el sistema muestra data-testid="conflict-warning"
  Y la reasignación requiere confirmación explícita

Escenario: Acceso de un técnico
  Dado que "tech.luis" tiene rol MAINTENANCE_TECH
  Cuando intenta abrir el panel de supervisión de camareras
  Entonces la respuesta es HTTP 403
```

**Restricciones (EARS)**
- El sistema deberá mostrar al Ama de llaves las asignaciones y estados de sus camareras.
- El sistema deberá auditar cualquier reasignación de habitación.

---

### CU-V-21 — Inspeccionar y certificar una habitación (firma opcional; no libera venta)

- **Actor primario:** Ama de llaves.
- **Trazabilidad:** RF-K-05, RF-S-03, RF-S-07, RNF-M-02, RNF-M-06, D-C5, D-C15, D-C23, D-C32.
- **Precondición:** habitación limpiada (`CLEAN`) con asignación `DONE`; `INSPECTION_REQUIRES_SIGNATURE` configurado.
- **Disparador:** el Ama de llaves inspecciona tras check-out o servicio diario.

**Postcondición (oráculo):** `housekeeping_inspections` con `result = 'APPROVED'`/`'REJECTED'`, `rooms.last_inspection_at` y `last_inspection_result` actualizados y `signature_id` según el flag; `publication_status` permanece `'PAUSED'` (no libera venta) y HTTP 422 `MissingRequiredSignature` si falta la firma exigida.

**Flujo principal**
1. El Ama de llaves abre la inspección y fija `inspection_type` (`CHECKOUT`/`DAILY_SERVICE`).
2. Registra `result` (`APPROVED`/`REJECTED`) y `observations` (`data-testid="inspection-result"`).
3. Se registra `housekeeping_inspections` con `room_id` como FK principal (D-C5).
4. `rooms.last_inspection_at` y `last_inspection_result` se actualizan.
5. Si `INSPECTION_REQUIRES_SIGNATURE = TRUE`: la UI muestra `data-testid="requires-signature"` y el modal `data-testid="signature-preview"`, exige firma on-chain y se emite `HousekeepingInspected(roomNumber, inspectionType, result, signer, timestamp)` (`entity_type = INSPECTION`).
6. Si el flag es `FALSE`: la inspección se registra sin firma (`signature_id = NULL`).
7. **La venta no se libera**: `publication_status` no cambia (D-C9/D-C15); Recepción/Admin la activan en CU-V-32.

**Flujos alternativos / excepciones**
- 21a — Resultado `REJECTED`: no certifica; pasa a CU-V-22.
- 21b — Flag activo y sin wallet: la firma es obligatoria en ese caso; HTTP 422 `MissingRequiredSignature(INSPECTION)`.
- 21c — Firma con wallet sin `HEAD_KEEPER_ROLE`: revert `AccessControlUnauthorizedAccount`.
- 21d — Inspección sin asignación previa: permitida con aviso.
- 21e — Intento de activar la venta desde la inspección: no disponible (HTTP 403 / opción ausente).

```gherkin
Escenario: Inspección aprobada sin firma (flag desactivado)
  Dado que INSPECTION_REQUIRES_SIGNATURE=FALSE
  Y la habitación 301 está CLEAN
  Cuando registro la inspección CHECKOUT con result=APPROVED
  Entonces housekeeping_inspections.result = 'APPROVED' y signature_id = NULL
  Y rooms.last_inspection_result = 'APPROVED'
  Y rooms.publication_status sigue siendo 'PAUSED'

Escenario: Inspección aprobada con firma (flag activado)
  Dado que INSPECTION_REQUIRES_SIGNATURE=TRUE y mi wallet tiene HEAD_KEEPER_ROLE
  Cuando registro la inspección DAILY_SERVICE APPROVED y firmo EIP-712
  Entonces on_chain_signatures tiene entity_type=INSPECTION y status=SIGNED
  Y el contrato emite HousekeepingInspected(301, "DAILY_SERVICE", "APPROVED", 0xB0b, <ts>)

Escenario: Flag activo sin wallet
  Dado que INSPECTION_REQUIRES_SIGNATURE=TRUE
  Cuando intento certificar la inspección sin wallet conectada
  Entonces la respuesta es HTTP 422 con MissingRequiredSignature(INSPECTION)

Escenario: Firma sin rol de Ama de llaves
  Dado que la wallet 0xOtro no tiene HEAD_KEEPER_ROLE
  Cuando firma la inspección
  Entonces la transacción revierte con AccessControlUnauthorizedAccount(0xOtro, HEAD_KEEPER_ROLE)

Escenario: La inspección no libera la venta
  Dado que la inspección de la habitación 301 resultó APPROVED
  Cuando consulto rooms.publication_status
  Entonces sigue siendo 'PAUSED'
  Y la habitación no aparece en el catálogo hasta CU-V-32
```

**Restricciones (EARS)**
- De acuerdo con el flag `INSPECTION_REQUIRES_SIGNATURE`, el sistema deberá exigir o no la firma on-chain de la inspección.
- Cuando se certifique una inspección con firma, el sistema deberá emitir `HousekeepingInspected` o `OperationalAction('INSPECTION', …)`.
- El sistema no deberá liberar la venta como consecuencia de una inspección aprobada.
- Si `INSPECTION_REQUIRES_SIGNATURE = TRUE` y no hay firma válida, entonces el sistema deberá rechazar la certificación con `MissingRequiredSignature`.

---

### CU-V-22 — Rechazar una limpieza y devolverla a la camarera

- **Actor primario:** Ama de llaves.
- **Trazabilidad:** RF-K-06, RNF-M-06, D-C5.
- **Precondición:** habitación en `IN_INSPECTION` o `CLEAN` con asignación `DONE`.
- **Disparador:** el Ama de llaves detecta una limpieza deficiente.

**Postcondición (oráculo):** `housekeeping_inspections.result = 'REJECTED'` con observaciones, `housekeeping_assignments.status = 'PENDING'` (único estado de retrabajo) y `rooms.operational_status = 'DIRTY'`; escalada al Ama de llaves/Administración y HTTP 422 sin observaciones.

**Flujo principal**
1. Registra la inspección con `result = REJECTED` (`data-testid="inspection-result"`) y `observations` obligatorias.
2. El sistema devuelve la asignación a la camarera con el **único** estado `PENDING` (no existe `REJECTED`) y la habitación a `DIRTY`.
3. Se notifica a la camarera en el terminal.
4. Se registra la traza off-chain.

**Flujos alternativos / excepciones**
- 22a — Rechazo sin observaciones: HTTP 422.
- 22b — Reincidencia (3.er rechazo de la misma habitación): se marca para revisión del **Ama de llaves** y se escala a **Administración** (no al Jefe de Mantenimiento).
- 22c — La camarera ya no está activa: la asignación se reasigna.

```gherkin
Escenario: Rechazo con observaciones
  Dado que la habitación 301 fue limpiada por camarera.rosa
  Cuando registro la inspección con result=REJECTED y observaciones "baño sin repasar"
  Entonces housekeeping_inspections.result = 'REJECTED'
  Y la asignación vuelve a la camarera con estado PENDING
  Y rooms.operational_status pasa a 'DIRTY'

Escenario: Rechazo sin observaciones
  Cuando registro la inspección con result=REJECTED y observaciones vacías
  Entonces la respuesta es HTTP 422

Escenario: Tercer rechazo de la misma habitación
  Dado que la habitación 301 acumula 2 rechazos en el día
  Cuando registro el tercero
  Entonces la habitación queda marcada para revisión del Ama de llaves y escalada a Administración
  Y se muestra data-testid="conflict-warning"

Escenario: Camarera inactiva
  Dado que camarera.rosa tiene active=FALSE
  Cuando rechazo su limpieza
  Entonces el sistema propone reasignar la habitación a otra camarera activa
```

**Restricciones (EARS)**
- Cuando el Ama de llaves rechace una limpieza, el sistema deberá exigir observaciones y deberá devolver la asignación a la camarera.
- El sistema deberá notificar a la camarera del rechazo en su terminal.
- Si la camarera ya no está activa, entonces el sistema deberá proponer la reasignación.

---

### CU-V-23 — Reportar incidencia de mantenimiento desde housekeeping

- **Actor primario:** Ama de llaves.
- **Actores secundarios:** Camarera (reporta).
- **Trazabilidad:** RF-K-07, RF-M-01, RNF-M-06, D-C8, D-C36, D-C37.
- **Precondición:** sesión válida.
- **Disparador:** el Ama de llaves o la camarera detecta una avería durante la limpieza.

**Postcondición (oráculo):** `maintenance_incidents` con `status = 'OPEN'` y `reported_by_role = 'HEAD_KEEPER'`/`'HOUSEKEEPER'`; HTTP 403 si intenta cambiar `publication_status` y `data-testid="possible-duplicate"` ante duplicados.

**Flujo principal**
1. Registra `kind`, `description`, `priority` y `room_id`/`area_id`.
2. El sistema crea la incidencia con `reported_by_role = HEAD_KEEPER` (o `HOUSEKEEPER`) y estado `OPEN`.
3. La incidencia queda para que el Jefe de Mantenimiento la clasifique (CU-V-02).
4. El Ama de llaves **no** puede fijar `publication_status`.

**Flujos alternativos / excepciones**
- 23a — El Ama de llaves intenta bloquear la habitación: HTTP 403 (D-C8).
- 23b — Reporte sin entidad: HTTP 422.
- 23c — Avería duplicada en la misma habitación y día: aviso `data-testid="possible-duplicate"`.

```gherkin
Escenario: Reporte de avería desde housekeeping
  Dado que soy HEAD_KEEPER y detecto una fuga en la habitación 210
  Cuando reporto la incidencia kind="PLUMBING" con priority=HIGH
  Entonces se crea maintenance_incidents con status=OPEN y reported_by_role='HEAD_KEEPER'

Escenario: El Ama de llaves no puede bloquear
  Dado que la incidencia 9f2a afecta a la habitación 210
  Cuando intento poner publicacion_status='MAINTENANCE'
  Entonces la respuesta es HTTP 403
  Y la habitación no se bloquea

Escenario: Reporte sin entidad
  Cuando reporto una avería sin room_id y sin area_id
  Entonces la respuesta es HTTP 422

Escenario: Posible duplicado
  Dado que ya existe una incidencia OPEN de PLUMBING para la habitación 210 hoy
  Cuando reporto otra idéntica
  Entonces el sistema muestra data-testid="possible-duplicate"
```

**Restricciones (EARS)**
- El sistema deberá fijar `reported_by_role` a `HEAD_KEEPER` o `HOUSEKEEPER` para los reportes de housekeeping.
- El sistema no deberá permitir que el Ama de llaves ni la camarera cambien `publication_status`; el bloqueo corresponde al Jefe de Mantenimiento.

---

### CU-V-24 — Registrar cargo por daños (auditoría off-chain, sin firma)

- **Actor primario:** Ama de llaves.
- **Trazabilidad:** RF-K-08, RF-S-04, RNF-M-06, RNF-M-10, D-C4, D-C12, D-C19, D-C21, D-C27.
- **Precondición:** daño detectado durante la inspección o limpieza; existe `additional_charge` y, si aplica, `nfts.token_id` de la noche vendida (D-C4).
- **Disparador:** el Ama de llaves registra el cargo por daños.

**Postcondición (oráculo):** `additional_charges` creado con `amount_cents > 0`, `housekeeping_damage_charges` con `signature_id = NULL`, traza en `operator_audit_log` y ninguna fila/evento on-chain; notificación al huésped preparada (CU-V-41) con `data-testid="damage-charge-form"` (HTTP 422/404 en los casos alternos).

**Flujo principal**
1. El Ama de llaves registra `damage_description`, `evidence_path` (opcional pero recomendado), importe y moneda (`EUR` por defecto) en `data-testid="damage-charge-form"`.
2. El sistema crea el `additional_charge` y la fila `housekeeping_damage_charges` con `room_id`, `charge_id`, `token_id` (noche vendida) y `inspection_id`.
3. **No** se crea fila de firma on-chain ni se emite evento on-chain: `signature_id = NULL` (D-C27).
4. Se escribe la traza en `operator_audit_log` y se vincula `audit_log_id`.
5. El cargo queda registrado y **se notifica al huésped** con plazo de reclamación (D-C14, CU-V-41); el cobro se aplica en el check-out sumándolo al folio (CU-V-34, D-C11).
6. Se prepara la notificación al huésped (CU-V-41).

**Flujos alternativos / excepciones**
- 24a — Importe ≤ 0: HTTP 422 (CHECK `additional_charges.amount_cents > 0`).
- 24b — `room_id` inexistente: HTTP 404.
- 24c — Daño sin `token_id` (no hay noche vendida): se permite; el cargo se imputa a la habitación.
- 24d — Sin evidencia: se permite; aviso `data-testid="evidence-missing"` («evidencia no adjunta») (D-C12).
- 24e — Se intenta aportar `signature_id`: el sistema lo ignora/rechaza por política (D-C27).
- 24f — Foto subida con EXIF/GPS: se elimina y se cifra (D-C19).

```gherkin
Escenario: Registro de cargo por daños sin firma on-chain
  Dado que la habitación 301 tuvo un desperfecto durante la estancia con token 30120261005 vendido
  Cuando registro el cargo con descripción "TV rota", importe 25000 céntimos y foto
  Entonces housekeeping_damage_charges.signature_id es NULL
  Y housekeeping_damage_charges.token_id = '30120261005'
  Y operator_audit_log contiene la traza del cargo
  Y no se emite ningún evento on-chain

Escenario: Importe inválido
  Cuando registro un cargo con amount_cents = 0
  Entonces additional_charges rechaza la fila por el CHECK amount_cents > 0

Escenario: Habitación inexistente
  Cuando registro un cargo para room_id = 00000000-0000-0000-0000-000000000000
  Entonces la respuesta es HTTP 404

Escenario: Cargo sin token vendido
  Dado que no existe una noche vendida para la habitación
  Cuando registro el cargo
  Entonces token_id queda NULL
  Y el cargo se imputa a la habitación

Escenario: Evidencia con metadatos
  Dado que subo una foto con GPS y EXIF
  Cuando el sistema la almacena
  Entonces la imagen se guarda cifrada y sin EXIF
  Y se sirve mediante URL firmada temporal

Escenario: Intento de firmar el cargo on-chain
  Dado que DAMAGE_CHARGE_REQUIRES_SIGNATURE=FALSE
  Cuando envío un signature_id junto con el cargo
  Entonces el sistema no persiste la firma
  Y el cargo queda auditado solo off-chain
```

**Restricciones (EARS)**
- El sistema **no** deberá exigir ni registrar firma on-chain para los cargos por daños (D-C27); deberá auditarlos en `operator_audit_log`.
- El sistema deberá vincular el cargo al `token_id` de la noche vendida cuando exista (D-C4).
- Si falta la evidencia, entonces el sistema deberá permitir el registro y mostrar el aviso «evidencia no adjunta».
- El sistema deberá cifrar las fotos, eliminar sus metadatos EXIF/GPS y retenerlas `EVIDENCE_RETENTION_DAYS` (90 días) tras el check-out.

---

### CU-V-25 — Gestionar consumibles y suministros con alerta de umbral

- **Actor primario:** Ama de llaves.
- **Trazabilidad:** RF-K-09, RNF-M-06, D-C33.
- **Precondición:** catálogo de suministros con estándar y `threshold_qty` configurable por el Ama de llaves (por defecto 20 % del estándar).
- **Disparador:** el stock de un suministro cae por debajo del umbral o el Ama de llaves ajusta el umbral.

**Postcondición (oráculo):** `supply_alerts` con una fila `status = 'OPEN'` por suministro (`last_reminded_at` al recordar, `status = 'CLOSED'` y `closed_at` al reponer) y `data-testid="supply-alert"`; HTTP 422 `ThresholdOutOfRange` fuera de rango.

**Flujo principal**
1. El Ama de llaves configura `threshold_qty` (default `SUPPLY_THRESHOLD_DEFAULT_PCT` del estándar).
2. El sistema compara `stock_qty` con `threshold_qty` y, si `stock_qty < threshold_qty`, crea/actualiza la entidad persistente `supply_alerts` con `status = 'OPEN'`, `opened_at` y `supply_item_id`, y genera la alerta `data-testid="supply-alert"`.
3. Notifica al Ama de llaves y la hace visible al Administrador.
4. Emite un recordatorio diario hasta reponer, actualizando `supply_alerts.last_reminded_at`.
5. Al superar el umbral, cierra la alerta automáticamente (`supply_alerts.status = 'CLOSED'` y `closed_at` no nulo).

**Flujos alternativos / excepciones**
- 25a — `threshold_qty` fuera de `[0, estándar]`: HTTP 422 `ThresholdOutOfRange`.
- 25b — `stock_qty` negativo: HTTP 422.
- 25c — Alerta ya abierta (`supply_alerts.status = 'OPEN'`): no se duplica; se actualiza `last_reminded_at`.
- 25d — Reposición exacta al umbral (`stock_qty == threshold_qty`): no hay alerta (el disparador es estricto `<`).

```gherkin
Escenario: Alerta por caída bajo el umbral
  Dado que el suministro "Jabón" tiene estándar 100 y threshold_qty 20
  Cuando stock_qty pasa a 19
  Entonces se crea una fila supply_alerts con status='OPEN' y supply_item_id del "Jabón"
  Y se muestra la alerta data-testid="supply-alert", visible para el Ama de llaves y para el Administrador

Escenario: Recordatorio diario
  Dado que la alerta de "Jabón" sigue abierta 24 h después
  Cuando el proceso diario se ejecuta
  Entonces se emite 1 recordatorio a HEAD_KEEPER
  Y supply_alerts.last_reminded_at se actualiza sin crear una alerta nueva

Escenario: Cierre automático al reponer
  Dado que la alerta de "Jabón" está abierta
  Cuando stock_qty pasa a 25 (por encima del umbral 20)
  Entonces supply_alerts.status = 'CLOSED' con closed_at no nulo

Escenario: Umbral fuera de rango
  Cuando configuro un threshold_qty de 150 sobre un estándar de 100
  Entonces la respuesta es HTTP 422 con ThresholdOutOfRange(150)

Escenario: Stock en el umbral exacto
  Dado que stock_qty = threshold_qty = 20
  Cuando se evalúa la condición
  Entonces no se genera alerta

Escenario: Stock negativo
  Cuando registro stock_qty = -1
  Entonces la respuesta es HTTP 422
```

**Restricciones (EARS)**
- Cuando `stock_qty < threshold_qty`, el sistema deberá crear una alerta única por suministro en `supply_alerts` (`status = 'OPEN'`), notificarla al Ama de llaves, hacerla visible al Administrador y recordarla a diario actualizando `last_reminded_at` hasta reponer.
- Cuando `stock_qty >= threshold_qty`, el sistema deberá cerrar automáticamente la alerta (`supply_alerts.status = 'CLOSED'`, `closed_at`).
- El sistema deberá aceptar `threshold_qty` solo dentro de `[0, estándar]`.

---

### CU-V-26 — Generar informes de productividad e inspecciones

- **Actor primario:** Ama de llaves.
- **Trazabilidad:** RF-K-10, RNF-M-05, RNF-M-06, D-C41.
- **Precondición:** datos de asignaciones e inspecciones disponibles.
- **Disparador:** el Ama de llaves abre `/ama-de-llaves` → informes.

**Postcondición (oráculo):** Informe agregado paginado con `page_size ≤ PAGE_MAX` y p95 < `P95_LIST_MS`; `data-testid="empty-state"` sin datos y HTTP 422 si `page_size > PAGE_MAX`.

**Flujo principal**
1. Filtra por camarera, fecha y resultado de inspección.
2. El sistema agrega habitaciones limpiadas, rechazos e inspecciones aprobadas, con paginación máx. `PAGE_MAX`.
3. Exporta CSV/PDF.

**Flujos alternativos / excepciones**
- 26a — Sin datos: `data-testid="empty-state"`.
- 26b — Página > `PAGE_MAX`: HTTP 422.
- 26c — Servicio degradado: `data-testid="degraded-state"`.

```gherkin
Escenario: Informe de productividad por camarera
  Dado que camarera.ana limpió 12 habitaciones con 1 rechazo en la semana
  Cuando genero el informe de productividad de esa semana
  Entonces el informe muestra 12 habitaciones y 1 rechazo para camarera.ana

Escenario: Informe de inspecciones
  Dado que se registraron 8 inspecciones APPROVED y 2 REJECTED
  Cuando genero el informe de inspecciones
  Entonces muestra 8 APPROVED y 2 REJECTED

Escenario: Sin datos
  Cuando genero un informe para una camarera sin asignaciones
  Entonces se muestra data-testid="empty-state"

Escenario: Página por encima del máximo
  Cuando solicito page_size=100
  Entonces la respuesta es HTTP 422
```

**Restricciones (EARS)**
- El sistema deberá devolver los informes con p95 < `P95_LIST_MS` y páginas de como máximo `PAGE_MAX` elementos.
- El sistema deberá registrar la autoría y el filtro usado en cada exportación, según la auditoría off-chain.

---

## 10. Suite Ama de llaves — Camarera (`HOUSEKEEPER`)

### CU-V-27 — Autenticarse en el terminal fijo con PIN

- **Actor primario:** Camarera.
- **Trazabilidad:** RNF-M-09, RNF-M-17, RNF-M-18, RNF-M-04, D-C2, D-C10, D-C17, D-C29, D-C30.
- **Precondición:** operaria en `terminal_operators` (`role = HOUSEKEEPER`, `active = TRUE`).
- **Disparador:** la camarera introduce su PIN en el terminal.

**Postcondición (oráculo):** Sesión de terminal creada (HTTP 200) o HTTP 401/423/428 según el fallo, con `failed_attempts`/`locked_until`/`pin_changed_at` actualizados.

**Flujo principal**
1. Introduce PIN de 4–6 dígitos (`data-testid="terminal-pin"`).
2. El sistema valida el hash bcrypt y crea la sesión de terminal.
3. Rota el PIN si `must_change_pin = TRUE` o si superó los 90 días.
4. Cierra la sesión a los 5 min de inactividad.

**Flujos alternativos / excepciones**
- 27a — PIN incorrecto: `failed_attempts++`, HTTP 401.
- 27b — 5.º fallo: `locked_until` fijado, HTTP 423 `PinLocked`.
- 27c — PIN caducado: HTTP 401 `PinExpired`.
- 27d — Primer acceso: HTTP 428 `MustChangePin`.
- 27e — PostgreSQL caído: HTTP 503 en escritura, lectura cacheada.
- 27f — Sin conexión: aviso y sin modo offline.

```gherkin
Escenario: Acceso correcto
  Dado que "camarera.ana" está activa con PIN válido
  Cuando introduce su PIN
  Entonces la respuesta es HTTP 200 y accede a sus asignaciones del turno

Escenario: Bloqueo tras 5 fallos
  Dado que camarera.ana acumula 4 fallos
  Cuando falla el 5.º PIN
  Entonces failed_attempts=5, locked_until no es nulo y la respuesta es HTTP 423 PinLocked

Escenario: Primer acceso con PIN de un solo uso
  Dado que camarera.ana tiene must_change_pin=TRUE
  Cuando introduce su PIN inicial
  Entonces la respuesta es HTTP 428 MustChangePin

Escenario: PIN caducado por rotación de 90 días
  Dado que pin_changed_at es de hace 91 días
  Cuando introduce su PIN correcto
  Entonces la respuesta es HTTP 401 PinExpired
```

**Restricciones (EARS)**
- El sistema deberá aplicar al terminal de la camarera la misma política de PIN que al del técnico (`PIN_LENGTH`, bcrypt, 5 intentos, 90 días, 5 min).
- El sistema no deberá permitir el uso del terminal sin conexión.

---

### CU-V-28 — Consultar mis habitaciones asignadas del turno

- **Actor primario:** Camarera.
- **Trazabilidad:** RF-K-01, RF-K-02, RNF-M-04, RNF-M-05.
- **Precondición:** turno activo con asignaciones para la camarera.
- **Disparador:** la camarera abre el terminal tras autenticarse.

**Postcondición (oráculo):** `data-testid="assignment-list"` con solo las habitaciones asignadas a la camarera en el turno y `data-testid="empty-state"` sin asignaciones; la reasignación ajena desaparece al refrescar.

**Flujo principal**
1. El sistema muestra solo las habitaciones asignadas a la camarera en el turno (`data-testid="assignment-list"`).
2. Cada habitación muestra su estado operativo y el orden de prioridad.
3. La vista es móvil y de ≤ 3 toques para iniciar la limpieza.

**Flujos alternativos / excepciones**
- 28a — Sin asignaciones: `data-testid="empty-state"`.
- 28b — Servicio degradado: lectura cacheada de la lista.
- 28c — Habitación reasignada por el Ama de llaves: desaparece de la lista con refresco.

```gherkin
Escenario: Lista de habitaciones del turno
  Dado que camarera.ana tiene 5 habitaciones asignadas en el turno MAÑANA
  Cuando abre el terminal
  Entonces data-testid="assignment-list" muestra esas 5 habitaciones con su estado

Escenario: Sin asignaciones
  Dado que camarera.ana no tiene habitaciones asignadas hoy
  Cuando abre el terminal
  Entonces se muestra data-testid="empty-state"

Escenario: Reasignación en curso
  Dado que el Ama de llaves reasignó la habitación 305 a otra camarera
  Cuando refresco la lista
  Entonces la habitación 305 ya no aparece en mi lista
```

**Restricciones (EARS)**
- El sistema deberá mostrar a la camarera únicamente las habitaciones asignadas a ella en el turno activo.
- El sistema deberá permitir iniciar la limpieza en ≤ 3 toques.

---

### CU-V-29 — Registrar estado de limpieza y completar tarea

- **Actor primario:** Camarera.
- **Trazabilidad:** RF-K-02, RF-K-04, RNF-M-17, RNF-M-18, RNF-M-20 (análoga), D-C29, D-C30.
- **Precondición:** habitación asignada a la camarera.
- **Disparador:** la camarera empieza o termina la limpieza.

**Postcondición (oráculo):** `housekeeping_assignments.status = 'IN_PROGRESS'` y habitación `'DIRTY'` durante la limpieza, y `'DONE'`/`'CLEAN'` al terminar; traza en `operator_audit_log` y HTTP 403/409 `OptimisticLockConflict`/503 en los casos alternos.

**Flujo principal**
1. Marca la asignación como `IN_PROGRESS` y la habitación como `DIRTY`.
2. Al terminar, marca la asignación como `DONE` y la habitación como `CLEAN`.
3. La confirmación es visual y sonora; el registro ≤ 30 s y ≤ 3 toques.
4. Se audita la transición.

**Flujos alternativos / excepciones**
- 29a — Habitación no asignada a la camarera: HTTP 403.
- 29b — Conflicto de concurrencia: HTTP 409 `OptimisticLockConflict`.
- 29c — Habitación bloqueada por mantenimiento (`publication_status='MAINTENANCE'`): puede limpiarse, pero no habilita la venta.
- 29d — Sin conexión: HTTP 503.
- 29e — Reapertura por inspección rechazada: la habitación vuelve a `DIRTY` y la asignación a `PENDING` (CU-V-22).

```gherkin
Escenario: Inicio y fin de limpieza
  Dado que la habitación 301 está asignada a camarera.ana en estado PENDING
  Cuando la marco IN_PROGRESS y después la completo
  Entonces housekeeping_assignments.status = 'DONE'
  Y rooms.operational_status = 'CLEAN'
  Y el registro completo tardó ≤ 30 s

Escenario: Habitación ajena
  Dado que la habitación 302 está asignada a camarera.rosa
  Cuando camarera.ana intenta marcarla DIRTY
  Entonces la respuesta es HTTP 403

Escenario: Conflicto de concurrencia
  Dado que otro operario actualizó la habitación 301 (nuevo updated_at)
  Cuando envío el cambio con el updated_at antiguo
  Entonces la respuesta es HTTP 409 con OptimisticLockConflict

Escenario: Habitación bloqueada por mantenimiento
  Dado que la habitación 204 está bloqueada por mantenimiento (publication_status='MAINTENANCE') y asignada a camarera.ana
  Cuando la limpio y la marco CLEAN
  Entonces rooms.publication_status sigue siendo 'MAINTENANCE'

Escenario: Reapertura por inspección rechazada
  Dado que la inspección de la habitación 301 fue REJECTED
  Entonces su operational_status vuelve a 'DIRTY'
  Y housekeeping_assignments.status vuelve a 'PENDING' y la asignación regresa a mi lista
```

**Restricciones (EARS)**
- Cuando la camarera complete una limpieza, el sistema deberá dejar la habitación en `CLEAN` y la asignación en `DONE` (con `IN_PROGRESS`/`DIRTY` durante la limpieza).
- El sistema deberá aplicar bloqueo optimista (`updated_at`) y devolver HTTP 409 ante conflicto.
- El sistema no deberá permitir que la camarera modifique habitaciones no asignadas a ella.

---

### CU-V-30 — Registrar consumo de suministros de la habitación

- **Actor primario:** Camarera.
- **Trazabilidad:** RF-K-09, RNF-M-06, D-C33.
- **Precondición:** catálogo de suministros con estándar y umbral.
- **Disparador:** la camarera repone o consume suministros durante la limpieza.

**Postcondición (oráculo):** `stock_qty` descontado (sin quedar negativo); si cruza el umbral se crea/actualiza `supply_alerts` con `status = 'OPEN'` y `data-testid="supply-alert"`; HTTP 422/404 en los casos inválidos.

**Flujo principal**
1. Registra el consumo/consumo de un suministro por habitación.
2. El sistema descuenta `stock_qty`.
3. Si `stock_qty < threshold_qty`, crea/actualiza `supply_alerts` (`status = 'OPEN'`) para el suministro y dispara la alerta (CU-V-25).
4. Se audita la operación.

**Flujos alternativos / excepciones**
- 30a — Cantidad ≤ 0: HTTP 422.
- 30b — Suministro inexistente: HTTP 404.
- 30c — Consumo que deja el stock en negativo: HTTP 422.

```gherkin
Escenario: Consumo normal
  Dado que el suministro "Gel de baño" tiene stock_qty=50
  Cuando registro un consumo de 2 unidades en la habitación 301
  Entonces stock_qty pasa a 48

Escenario: Consumo que dispara alerta
  Dado que el suministro "Jabón" tiene stock_qty=20 y threshold_qty=20
  Cuando registro un consumo de 1 unidad
  Entonces stock_qty pasa a 19
  Y supply_alerts tiene una fila con status='OPEN' para "Jabón"
  Y se genera la alerta data-testid="supply-alert"

Escenario: Cantidad inválida
  Cuando registro un consumo de 0 unidades
  Entonces la respuesta es HTTP 422

Escenario: Suministro inexistente
  Cuando registro consumo de un suministro no catalogado
  Entonces la respuesta es HTTP 404
```

**Restricciones (EARS)**
- Cuando la camarera registre un consumo, el sistema deberá descontarlo del stock y evaluar el umbral.
- El sistema no deberá permitir dejar `stock_qty` negativo.

---

## 11. Recepción (`RECEPTION_ROLE`)

### CU-V-31 — Reportar incidencia de mantenimiento

- **Actor primario:** Recepción.
- **Trazabilidad:** RF-M-01, RNF-M-06, D-C36, D-C37.
- **Precondición:** sesión de recepción válida.
- **Disparador:** un huésped o el personal reporta una avería.

**Postcondición (oráculo):** `maintenance_incidents` con `status = 'OPEN'` y `reported_by_role = 'RECEPTION'`; HTTP 403 si intenta bloquear y `data-testid="possible-duplicate"` ante duplicados.

**Flujo principal**
1. Recepción registra `kind`, `description`, `priority` y `room_id`/`area_id`.
2. El sistema crea la incidencia con `reported_by_role = RECEPTION`, estado `OPEN`.
3. Queda en la cola del Jefe de Mantenimiento (CU-V-02).

**Flujos alternativos / excepciones**
- 31a — Reporte sin entidad: HTTP 422.
- 31b — Recepción intenta bloquear la habitación: HTTP 403 (D-C37).
- 31c — Duplicado del mismo día: aviso `data-testid="possible-duplicate"`.

```gherkin
Escenario: Reporte desde recepción
  Dado que un huésped informa de un aire acondicionado averiado en la habitación 402
  Cuando recepción registra la incidencia kind="HVAC" con priority=HIGH
  Entonces se crea maintenance_incidents con status=OPEN y reported_by_role='RECEPTION'

Escenario: Recepción no firma ni bloquea
  Cuando recepción intenta poner la habitación 402 en MAINTENANCE
  Entonces la respuesta es HTTP 403
  Y no se crea ninguna firma on-chain

Escenario: Reporte sin entidad
  Cuando recepción reporta una avería sin room_id y sin area_id
  Entonces la respuesta es HTTP 422

Escenario: Posible duplicado
  Dado que ya existe una incidencia OPEN de HVAC para la habitación 402 hoy
  Cuando recepción reporta otra idéntica
  Entonces el sistema muestra data-testid="possible-duplicate"
```

**Restricciones (EARS)**
- El sistema deberá fijar `reported_by_role = RECEPTION` para los reportes de recepción.
- El sistema no deberá otorgar a Recepción capacidad de firma on-chain (D-C37).

---

### CU-V-32 — Activar o desactivar manualmente la venta de la habitación

- **Actor primario:** Recepción (también Administrador/Owner).
- **Trazabilidad:** RF-K-05 (soporte), RF-M-12, RNF-M-06, D-C9, D-C37.
- **Precondición:** habitación inspeccionada (`last_inspection_result = 'APPROVED'`) o mantenimiento resuelto; sin bloqueo vigente.
- **Disparador:** Recepción pulsa «Activar venta» o «Desactivar venta» en `/admin/habitacion`.

**Postcondición (oráculo):** `rooms.publication_status = 'PUBLISHED'` al activar (o `'PAUSED'` al desactivar) con traza en `operator_audit_log` (`action = 'UPDATE'`, `actor_role = 'RECEPTION_ROLE'`); HTTP 409 `RoomBlockedByMaintenance` con bloqueo vigente.

**Flujo principal**
1. Recepción abre la habitación y pulsa «Activar venta».
2. El sistema verifica que no hay bloqueo por mantenimiento ni incidencia abierta con `blocks_sale`.
3. `rooms.publication_status` pasa a `'PUBLISHED'` (y a `'PAUSED'` al desactivar); con `PUBLISHED` la habitación aparece en el catálogo público.
4. Se registra la traza en `operator_audit_log` (`action = UPDATE`).
5. La liberación **no** requiere firma on-chain por defecto; puede configurarse según política interna (D-C15) pero Recepción no firma (D-C37).

**Flujos alternativos / excepciones**
- 32a — Habitación bloqueada por mantenimiento: HTTP 409 `RoomBlockedByMaintenance` (error propio; **no** se reutiliza `RoomAlreadyBlocked`).
- 32b — Inspección `REJECTED` o ausente: se exige confirmación explícita y se avisa.
- 32c — Desactivar venta con reservas activas: se avisa y se exige confirmación.
- 32d — La activación sin inspección previa queda registrada como excepción auditada.

```gherkin
Escenario: Activación de la venta tras inspección aprobada
  Dado que la habitación 301 tiene last_inspection_result='APPROVED'
  Y no tiene bloqueo por mantenimiento ni incidencias abiertas con blocks_sale
  Cuando Recepción pulsa "Activar venta"
  Entonces rooms.publication_status = 'PUBLISHED'
  Y la habitación 301 aparece en el catálogo público
  Y operator_audit_log registra action=UPDATE con actor_role=RECEPTION_ROLE

Escenario: Activación con bloqueo de mantenimiento vigente
  Dado que la habitación 204 tiene publication_status='MAINTENANCE'
  Cuando Recepción intenta activar la venta
  Entonces la respuesta es HTTP 409 con RoomBlockedByMaintenance(204)
  Y publication_status no cambia

Escenario: Activación sin inspección
  Dado que la habitación 305 nunca fue inspeccionada
  Cuando Recepción activa la venta
  Entonces el sistema solicita confirmación explícita
  Y registra la excepción en operator_audit_log

Escenario: Desactivación con reservas activas
  Dado que la habitación 301 tiene reservas futuras
  Cuando Recepción desactiva la venta
  Entonces el sistema avisa del impacto en reservas
  Y exige confirmación explícita antes de aplicar el cambio

Escenario: La inspección por sí sola no activa la venta
  Dado que la inspección de la habitación 301 fue APPROVED hace 1 minuto
  Cuando nadie de Recepción/Admin ha pulsado "Activar venta"
  Entonces rooms.publication_status sigue siendo 'PAUSED'
```

**Restricciones (EARS)**
- Cuando una inspección sea aprobada, el sistema **no** deberá activar la venta automáticamente; deberá exigir una acción manual de Recepción o Administración.
- Si la habitación está bloqueada por mantenimiento, entonces el sistema deberá rechazar la activación de la venta.
- El sistema deberá auditar toda activación o desactivación manual con su actor.

---

### CU-V-33 — Resolver la reclamación del huésped sobre un cargo por daños

- **Actor primario:** Recepción.
- **Trazabilidad:** RF-K-08 (soporte), RNF-M-10, D-C14, D-C19, D-C37.
- **Precondición:** existe una notificación `damage_charge_guest_notifications` en estado `DISPUTED`.
- **Disparador:** el huésped reclama a través de Recepción.

**Postcondición (oráculo):** `damage_charge_guest_notifications.status = 'RESOLVED_ACCEPTED'` o `'RESOLVED_REJECTED'` con `resolved_by`/`resolved_at` no nulos; `additional_charges` anulado/ajustado o mantenido según la resolución y traza en `operator_audit_log`; `EXPIRED` no admite reclamación.

**Flujo principal**
1. Recepción revisa la reclamación con `dispute_notes` y la evidencia.
2. Resuelve: acepta la reclamación (anula/ajusta el cargo) o la desestima (mantiene el cargo).
3. La notificación pasa a `RESOLVED_ACCEPTED` (reclamación aceptada: cargo anulado/ajustado) o `RESOLVED_REJECTED` (reclamación desestimada: el cargo se mantiene); se fijan `resolved_by` y `resolved_at`. `ACKNOWLEDGED` no es una resolución: significa «huésped conforme sin reclamación».
4. Se registra la traza en `operator_audit_log`.

**Flujos alternativos / excepciones**
- 33a — Reclamación fuera de plazo (`status = EXPIRED`): no admite reclamación; el cargo se mantiene.
- 33b — Sin evidencia adjunta: se resuelve con la descripción disponible y se documenta.
- 33c — El huésped aporta contra-evidencia: se adjunta al expediente.
- 33d — Ajuste del importe: se actualiza `additional_charges` con la traza correspondiente.

```gherkin
Escenario: Reclamación aceptada
  Dado que la notificación del cargo CH-101 está en estado DISPUTED
  Cuando Recepción acepta la reclamación y anula el cargo
  Entonces damage_charge_guest_notifications.status = 'RESOLVED_ACCEPTED'
  Y resolved_by y resolved_at quedan informados
  Y additional_charges refleja la anulación

Escenario: Reclamación desestimada
  Dado que el huésped reclama un cargo con evidencia fotográfica clara
  Cuando Recepción desestima la reclamación
  Entonces damage_charge_guest_notifications.status = 'RESOLVED_REJECTED' con resolved_by y resolved_at informados
  Y el cargo se mantiene para el cobro en el check-out
  Y se registra la justificación en operator_audit_log

Escenario: Reclamación fuera de plazo
  Dado que la notificación CH-102 está en estado EXPIRED
  Cuando el huésped intenta reclamar
  Entonces el sistema no admite la reclamación
  Y el cargo se mantiene

Escenario: Reclamación sin evidencia del cargo
  Dado que el cargo CH-103 no tiene foto adjunta
  Cuando Recepción resuelve la reclamación
  Entonces documenta la resolución con la descripción disponible
  Y el resultado queda auditado
```

**Restricciones (EARS)**
- El sistema deberá permitir a Recepción resolver una reclamación aceptándola o desestimándola, con traza de quién y cuándo.
- Si el plazo de reclamación expiró, entonces el sistema deberá rechazar nuevas reclamaciones y mantener el cargo.
- El sistema deberá limitar el acceso a la evidencia a las partes implicadas y aplicar `EVIDENCE_RETENTION_DAYS`.

---

### CU-V-34 — Confirmar el cargo por daños en el check-out

- **Actor primario:** Recepción.
- **Trazabilidad:** RF-K-08 (soporte), D-C11, D-C14, RNF-M-10, D-C37.
- **Precondición:** estancia activa con cargo(s) por daños no reclamados o desestimados.
- **Disparador:** Recepción procesa el check-out.

**Postcondición (oráculo):** `additional_charges.status = 'PAID'` en la fila del cargo vinculada al folio de la estancia y traza off-chain; el cierre se bloquea con HTTP 409 si hay una reclamación `DISPUTED` y continúa sin cargos si no los hay.

**Flujo principal**
1. El sistema suma los cargos por daños al folio/estado de cuenta de la estancia.
2. Si la notificación sigue en plazo y sin reclamación, se aplica; si está `DISPUTED`, el cargo queda en espera de resolución (CU-V-33).
3. Recepción confirma el check-out; se marca `additional_charges.status = 'PAID'` en la fila del cargo, vinculada al folio de la estancia.
4. Se registra la traza off-chain.

**Flujos alternativos / excepciones**
- 34a — Cargo con reclamación `DISPUTED` pendiente: no se cobra; bloquea el cierre con HTTP 409 hasta resolver.
- 34b — Sin cargos: el check-out continúa sin cambios.
- 34c — Pago parcial: se registra el importe pendiente.

```gherkin
Escenario: Cobro de un cargo no reclamado
  Dado que la estancia de la habitación 301 tiene un cargo de 250,00 € sin reclamación
  Cuando Recepción confirma el check-out
  Entonces el cargo se suma al folio de la estancia
  Y additional_charges.status = 'PAID' en la fila vinculada al folio
  Y figura como cobrado en el estado de cuenta

Escenario: Cargo en disputa
  Dado que el cargo de la habitación 301 está en estado DISPUTED
  Cuando Recepción intenta cerrar el check-out
  Entonces el sistema bloquea el cierre
  Y exige resolver la reclamación (CU-V-33)

Escenario: Estancia sin cargos
  Dado que la estancia no tiene cargos por daños
  Cuando Recepción confirma el check-out
  Entonces el check-out se completa sin cargos adicionales

Escenario: Cargo en plazo sin reclamar
  Dado que la notificación está en estado SENT y aún no venció el plazo
  Cuando Recepción confirma el check-out antes del vencimiento
  Entonces el sistema avisa del plazo pendiente
  Y requiere confirmación explícita para cobrar
```

**Restricciones (EARS)**
- Cuando Recepción cierre el check-out, el sistema deberá sumar los cargos por daños no reclamados al folio de la estancia y deberá marcar `additional_charges.status = 'PAID'` en la fila del cargo vinculada al folio.
- Si existe un cargo en estado `DISPUTED`, entonces el sistema deberá bloquear el cierre hasta resolver la reclamación.
- El sistema deberá auditar el cobro del cargo con su actor y su importe.

---

## 12. Administrador / Owner (`DEFAULT_ADMIN_ROLE`)

### CU-V-35 — Gestionar wallets y roles on-chain de los jefes

- **Actor primario:** Administrador/Owner.
- **Trazabilidad:** RNF-M-15, RNF-M-06, D-C1, D-C13, D-C6.
- **Precondición:** cuenta con `DEFAULT_ADMIN_ROLE`.
- **Disparador:** alta, cambio o baja de la wallet de un jefe.

**Postcondición (oráculo):** `operator_wallets` con la fila activa/revocada y el rol on-chain concedido/revocado en `HotelOperations`; violación de `operator_wallets_backup_check`/UNIQUE en los casos inválidos y bloqueo de la baja en orden incorrecto.

**Flujo principal**
1. El Administrador asigna una `wallet_address` a un usuario (`operator_wallets`), con `role` (`HEAD_MAINTENANCE`/`HEAD_KEEPER`) o `OWNER_BACKUP`.
2. Concede el rol on-chain correspondiente en `HotelOperations`.
3. Para la baja: **primero** revoca el rol on-chain y **después** fija `revoked_at` en BD (RNF-M-15).
4. Mantiene el histórico de wallets por usuario (no se borra el registro).
5. La wallet de respaldo (`OWNER_BACKUP`) se registra con `backup_for_role`.

**Flujos alternativos / excepciones**
- 35a — `OWNER_BACKUP` sin `backup_for_role`: violación del CHECK `operator_wallets_backup_check`.
- 35b — Dirección duplicada: violación del UNIQUE de `wallet_address`.
- 35c — Baja sin revocar primero on-chain: el sistema bloquea la operación.
- 35d — Reasignación de wallet a otro usuario: se exige desactivar la anterior.

```gherkin
Escenario: Alta de wallet de jefe
  Dado que el usuario "jefe.mantenimiento" no tiene wallet
  Cuando le asigno 0xA11ce con role=HEAD_MAINTENANCE
  Entonces operator_wallets contiene una fila activa con wallet_address=0xA11ce
  Y el rol HEAD_MAINTENANCE_ROLE queda concedido on-chain

Escenario: Alta de wallet de respaldo
  Dado que el Owner quiere actuar como respaldo de mantenimiento
  Cuando registro 0xOwner con role=OWNER_BACKUP y backup_for_role=HEAD_MAINTENANCE
  Entonces la fila se persiste con backup_for_role no nulo

Escenario: Respaldo sin rol de respaldo
  Cuando registro role=OWNER_BACKUP sin backup_for_role
  Entonces la inserción viola operator_wallets_backup_check

Escenario: Baja en orden incorrecto
  Dado que la wallet 0xA11ce todavía tiene HEAD_MAINTENANCE_ROLE on-chain
  Cuando intento marcarla como revocada en BD
  Entonces el sistema bloquea la operación
  Y exige revocar primero el rol on-chain

Escenario: Dirección duplicada
  Cuando asigno una wallet ya registrada a otro usuario
  Entonces la inserción viola el UNIQUE de wallet_address
```

**Restricciones (EARS)**
- Cuando se dé de baja una wallet, el sistema deberá revocar primero el rol on-chain y después marcar `revoked_at`.
- El sistema deberá mantener el histórico de wallets por usuario y vincular `operator_wallets` a `admin_users`.
- De acuerdo con `role = OWNER_BACKUP`, el sistema deberá exigir `backup_for_role` no nulo.

---

### CU-V-36 — Dar de alta, rotar y dar de baja operarios de terminal

- **Actor primario:** Administrador/Owner (y jefes, según RNF-M-16).
- **Trazabilidad:** RNF-M-09, RNF-M-16, RNF-M-06, D-C10, D-C17, D-C29.
- **Precondición:** quien crea tiene rol `HEAD_MAINTENANCE`, `HEAD_KEEPER` o `DEFAULT_ADMIN_ROLE` y está activo.
- **Disparador:** alta de un técnico/camarera o rotación de su PIN.

**Postcondición (oráculo):** `terminal_operators` con la fila creada (`created_by` autorizado, `must_change_pin = TRUE`), rotada (`pin_hash`/`pin_changed_at`) o dada de baja (`active = FALSE`); HTTP 403/violación de CHECK/UNIQUE en los casos alternos.

**Flujo principal**
1. El sistema valida que `created_by` corresponde a un usuario activo con rol autorizado.
2. Crea el `terminal_operator` con rol `MAINTENANCE_TECH`/`HOUSEKEEPER` y PIN de un solo uso (`must_change_pin = TRUE`).
3. En la rotación, actualiza `pin_hash` y `pin_changed_at`.
4. En la baja, fija `active = FALSE`.
5. Todo cambio se audita.

**Flujos alternativos / excepciones**
- 36a — `created_by` sin rol autorizado: HTTP 403.
- 36b — `created_by` inactivo: HTTP 403.
- 36c — Rol distinto de `MAINTENANCE_TECH`/`HOUSEKEEPER`: violación del CHECK `terminal_operators_role_check`.
- 36d — Username duplicado: violación del UNIQUE.

```gherkin
Escenario: Alta de técnico
  Dado que soy HEAD_MAINTENANCE activo
  Cuando doy de alta a "tech.luis" con role=MAINTENANCE_TECH
  Entonces terminal_operators contiene la fila con must_change_pin=TRUE
  Y created_by = mi usuario

Escenario: Alta por un usuario no autorizado
  Dado que "camarera.ana" tiene rol HOUSEKEEPER
  Cuando intenta dar de alta un operario de terminal
  Entonces la respuesta es HTTP 403

Escenario: Rotación de PIN
  Dado que "tech.luis" tiene un PIN vigente
  Cuando el jefe rota su PIN
  Entonces pin_hash cambia y pin_changed_at se actualiza
  Y must_change_pin pasa a TRUE para el siguiente acceso

Escenario: Rol no permitido
  Cuando creo un terminal_operator con role='RECEPTION'
  Entonces la inserción viola terminal_operators_role_check

Escenario: Username duplicado
  Cuando doy de alta un operario con username ya existente
  Entonces la inserción viola el UNIQUE de username
```

**Restricciones (EARS)**
- El sistema deberá validar que `terminal_operators.created_by` corresponde a un usuario activo con rol `HEAD_MAINTENANCE`, `HEAD_KEEPER` o `DEFAULT_ADMIN_ROLE`.
- El sistema deberá aceptar solo los roles `MAINTENANCE_TECH` y `HOUSEKEEPER` en `terminal_operators`.
- El sistema deberá generar el PIN inicial como un solo uso y exigir su cambio en el primer acceso.

---

### CU-V-37 — Gobernar los flags de firma on-chain

- **Actor primario:** Administrador/Owner.
- **Trazabilidad:** RNF-M-11, RNF-M-06, D-C22, D-C34, D-C23, D-C27.
- **Precondición:** cuenta con `DEFAULT_ADMIN_ROLE` y TOTP validado.
- **Disparador:** el Administrador cambia `INSPECTION_REQUIRES_SIGNATURE` u otro flag de firma.

**Postcondición (oráculo):** Flag actualizado en configuración con `old_value`/`new_value` en `operator_audit_log`; HTTP 401 sin TOTP y HTTP 422 al intentar desactivar un flag obligatorio sin firma on-chain, permaneciendo fijos en producción.

**Flujo principal**
1. El Administrador accede a los ajustes con TOTP.
2. Puede cambiar `INSPECTION_REQUIRES_SIGNATURE` (opcional por D-C23).
3. Los flags obligatorios (`MAINTENANCE_BLOCK_REQUIRES_SIGNATURE` en `TRUE` y `DAMAGE_CHARGE_REQUIRES_SIGNATURE` en `FALSE` en producción) **no** se pueden desactivar/activar sin firma on-chain del propio cambio de configuración.
4. Todo cambio se registra en `operator_audit_log`.
5. `ENABLE_OPERATIONAL_SIGNATURES` solo es modificable en dev/test.

**Flujos alternativos / excepciones**
- 37a — Cambio sin TOTP: HTTP 401.
- 37b — Intento de desactivar un flag obligatorio sin firma on-chain: HTTP 422.
- 37c — Cambio sin traza de auditoría: no se persiste.
- 37d — Cambio del flag en producción: los valores obligatorios quedan fijos.

```gherkin
Escenario: Cambio del flag opcional de inspección
  Dado que valido mi TOTP como Owner
  Cuando activo INSPECTION_REQUIRES_SIGNATURE
  Entonces el flag queda en TRUE
  Y operator_audit_log registra action=UPDATE con old_value y new_value

Escenario: Intento de desactivar un flag obligatorio
  Dado que MAINTENANCE_BLOCK_REQUIRES_SIGNATURE es TRUE en producción
  Cuando intento ponerlo en FALSE sin firma on-chain
  Entonces la respuesta es HTTP 422
  Y el flag permanece TRUE

Escenario: Cambio sin TOTP
  Cuando intento cambiar un flag sin validar TOTP
  Entonces la respuesta es HTTP 401

Escenario: Flag solo de desarrollo
  Dado que el entorno es producción
  Cuando intento modificar ENABLE_OPERATIONAL_SIGNATURES
  Entonces el sistema rechaza el cambio por estar fijo en este entorno
```

**Restricciones (EARS)**
- El sistema deberá permitir el cambio de flags solo al Owner con TOTP y deberá registrarlo en `operator_audit_log` con valor anterior y nuevo.
- Si se intenta desactivar un flag obligatorio, entonces el sistema deberá exigir la firma on-chain del propio cambio de configuración.
- El sistema no deberá permitir modificar `ENABLE_OPERATIONAL_SIGNATURES` fuera de dev/test.

---

### CU-V-38 — Firmar en emergencia como `OWNER_BACKUP`

- **Actor primario:** Administrador/Owner.
- **Trazabilidad:** RF-S-02, RF-S-05, RF-S-07, RNF-M-15, D-C6, D-C13.
- **Precondición:** el Jefe de Mantenimiento no está disponible; el Owner tiene `OWNER_BACKUP` para `HEAD_MAINTENANCE`.
- **Disparador:** urgencia que requiere bloquear/desbloquear o verificar una tarea crítica.

**Postcondición (oráculo):** `on_chain_signatures` con `role_snapshot = 'OWNER_BACKUP'` (o `HEAD_MAINTENANCE`), `recovered_signer == signer_address` y `status = 'SIGNED'`, más el evento correspondiente; la UI muestra `data-testid="requires-signature"`/`signature-preview` y sin rol on-chain la transacción revierte.

**Flujo principal**
1. El Owner abre la acción crítica y se identifica como respaldo; la UI la marca con ⛓ + «Requiere firma» (`data-testid="requires-signature"`) y muestra el modal `data-testid="signature-preview"` con acción, entidad y datos.
2. Firma EIP-712 con su wallet `OWNER_BACKUP`; el sistema verifica `recovered_signer == signer_address` y resuelve el rol efectivo contra `operator_wallets`/`HotelOperations`.
3. El sistema registra la firma con `role_snapshot = OWNER_BACKUP` (o `HEAD_MAINTENANCE`) y `backup_for_role = HEAD_MAINTENANCE`; si `recovered_signer` no coincide, `status = FAILED`.
4. Emite el evento correspondiente con la dirección del Owner.
5. Se registra la emergencia en auditoría con su justificación.

**Flujos alternativos / excepciones**
- 38a — Owner sin `OWNER_BACKUP`: revert `AccessControlUnauthorizedAccount`.
- 38b — El jefe sí está disponible: se prioriza su firma y se advierte del uso del respaldo.
- 38c — Firma de respaldo para `HEAD_KEEPER`: permitida solo si `backup_for_role` lo incluye.
- 38d — Uso abusivo: se alerta al Owner y queda traza íntegra.

```gherkin
Escenario: Bloqueo de emergencia por el Owner
  Dado que el Jefe de Mantenimiento no está disponible
  Y mi wallet 0xOwner tiene OWNER_BACKUP para HEAD_MAINTENANCE
  Cuando firmo el bloqueo de la habitación 204
  Entonces on_chain_signatures.role_snapshot = 'OWNER_BACKUP' y recovered_signer = 0xOwner
  Y el contrato emite RoomBlocked(204, reason, until, 0xOwner, <ts>)

Escenario: Owner sin rol de respaldo
  Dado que mi wallet no tiene OWNER_BACKUP
  Cuando firmo el bloqueo de emergencia
  Entonces la transacción revierte con AccessControlUnauthorizedAccount(0xOwner, HEAD_MAINTENANCE_ROLE)

Escenario: Jefe disponible
  Dado que el Jefe de Mantenimiento está activo
  Cuando el Owner intenta firmar en su lugar
  Entonces el sistema advierte del uso del respaldo
  Y solicita confirmación explícita de la emergencia

Escenario: Respaldo para un rol no cubierto
  Dado que backup_for_role='HEAD_MAINTENANCE'
  Cuando el Owner intenta firmar una verificación propia de HEAD_KEEPER
  Entonces la operación se rechaza

Escenario: Trazabilidad de la emergencia
  Cuando el Owner firma en emergencia
  Entonces operator_audit_log registra la justificación y on_chain_signatures conserva signer_address=0xOwner
```

**Restricciones (EARS)**
- De acuerdo con una emergencia de mantenimiento, el sistema deberá permitir firmar al Owner con `OWNER_BACKUP` y deberá registrar `role_snapshot` y `backup_for_role`.
- El sistema deberá limitar la firma de respaldo al rol para el que fue habilitada.
- El sistema deberá auditar cada uso del respaldo con su justificación.
- El sistema deberá marcar toda firma de emergencia con ⛓ + «Requiere firma» (`data-testid="requires-signature"`), mostrar el modal `data-testid="signature-preview"` antes de firmar (RF-S-07) y verificar criptográficamente la firma EIP-712 (`recovered_signer`, `role_snapshot`) antes de aceptar `SIGNED`.

---

### CU-V-39 — Gestionar las tareas vencidas escaladas

- **Actor primario:** Administrador/Owner.
- **Trazabilidad:** RNF-M-21, RNF-M-06, D-C38.
- **Precondición:** tareas en `PENDING_VERIFICATION_EXPIRED`.
- **Disparador:** el Administrador abre el panel de tareas escaladas.

**Postcondición (oráculo):** `preventive_tasks.validation_status = 'VALIDATED'` (o de nuevo `PENDING_VERIFICATION` tras reasignar) con traza en `operator_audit_log`; `data-testid="empty-state"` sin tareas vencidas y HTTP 422 a un jefe inactivo.

**Flujo principal**
1. El panel lista las tareas cuyo SLA de 24 h venció sin validación.
2. El Administrador puede reasignar la validación a otro jefe, validar él mismo o devolver al ejecutor.
3. La decisión se audita.

**Flujos alternativos / excepciones**
- 39a — Sin tareas vencidas: `data-testid="empty-state"`.
- 39b — Reasignación a un jefe inactivo: HTTP 422.
- 39c — Validación por el Administrador: se registra con su rol.

```gherkin
Escenario: Panel de tareas vencidas
  Dado que la tarea 5aa1 está PENDING_VERIFICATION_EXPIRED
  Cuando el Administrador abre el panel
  Entonces data-testid="pending-verification" incluye la tarea 5aa1

Escenario: Reasignación de la validación
  Dado que el jefe original no está disponible
  Cuando el Administrador reasigna la validación a otro jefe activo
  Entonces la tarea vuelve a PENDING_VERIFICATION con el nuevo validador
  Y se registra la traza

Escenario: Validación por el Administrador
  Dado que la tarea 5aa1 está vencida
  Cuando el Administrador la valida directamente
  Entonces su estado pasa a VALIDATED con actor_role=DEFAULT_ADMIN_ROLE

Escenario: Sin tareas vencidas
  Cuando el Administrador abre el panel sin tareas vencidas
  Entonces se muestra data-testid="empty-state"

Escenario: Reasignación a jefe inactivo
  Dado que el jefe destino tiene active=FALSE
  Cuando el Administrador intenta reasignarle la validación
  Entonces la respuesta es HTTP 422
```

**Restricciones (EARS)**
- Cuando una tarea supere `SLA_VALIDATION_HOURS` sin validación, el sistema deberá escalarla al Administrador y mostrarla en su panel.
- El sistema deberá auditar cada decisión del Administrador sobre tareas escaladas.

---

### CU-V-40 — Exportar el expediente de evidencias y auditoría

- **Actor primario:** Administrador/Owner.
- **Trazabilidad:** RNF-M-19, RNF-M-06, RNF-M-12, D-C31.
- **Precondición:** existen registros en `operator_audit_log`, `on_chain_signatures` y evidencias asociadas.
- **Disparador:** auditoría interna o requerimiento de un tercero.

**Postcondición (oráculo):** Expediente PDF/CSV con la cadena `prev_hash` + `integrity_hash` y las firmas, registrado en `operator_audit_log`; HTTP 403 sin rol, `AuditMutationForbidden` en `UPDATE`/`DELETE` y marca de no válido si la cadena falla.

**Flujo principal**
1. El Administrador filtra por periodo, entidad o actor.
2. El sistema genera un expediente en PDF/CSV firmado (`data-testid="audit-export"`).
3. El expediente incluye la cadena de integridad (`prev_hash` + `integrity_hash`) y las firmas on-chain.
4. La exportación se registra en auditoría.

**Flujos alternativos / excepciones**
- 40a — Exportación sin permisos: HTTP 403.
- 40b — Intento de `UPDATE`/`DELETE` sobre la auditoría: trigger `AuditMutationForbidden`.
- 40c — Verificación de integridad fallida (cadena rota): se marca el expediente como no válido.
- 40d — Exportación > `PAGE_MAX` registros: se pagina y se documenta.

```gherkin
Escenario: Exportación de expediente
  Dado que tengo DEFAULT_ADMIN_ROLE
  Cuando exporto la auditoría del periodo 2026-10-01 a 2026-10-07
  Entonces obtengo un archivo PDF/CSV con los registros y su integrity_hash encadenado
  Y la exportación queda registrada en operator_audit_log

Escenario: Exportación sin permisos
  Dado que "tech.luis" no tiene DEFAULT_ADMIN_ROLE
  Cuando intenta exportar la auditoría
  Entonces la respuesta es HTTP 403

Escenario: Auditoría append-only
  Dado que existe una fila en operator_audit_log
  Cuando intento ejecutar UPDATE o DELETE sobre ella
  Entonces el trigger trg_operator_audit_append_only lanza AuditMutationForbidden

Escenario: Cadena de integridad rota
  Dado que la comprobación de prev_hash + integrity_hash falla
  Cuando genero el expediente
  Entonces el expediente se marca como no válido
  Y se alerta al Administrador

Escenario: Retención
  Dado que un registro de auditoría tiene 4 años
  Cuando intento eliminarlo por política de retención
  Entonces el sistema no lo permite antes de los 5 años (AUDIT_RETENTION_YEARS)
```

**Restricciones (EARS)**
- El sistema deberá mantener `operator_audit_log` y `on_chain_signatures` en modo append-only con hash de integridad encadenado (`prev_hash` + `integrity_hash`).
- El sistema deberá retener la auditoría `AUDIT_RETENTION_YEARS` (5 años) y permitir la exportación firmada del expediente.
- Si la cadena de integridad no verifica, entonces el sistema deberá marcar el expediente como no válido y alertar.

---

## 13. Huésped

### CU-V-41 — Recibir la notificación de cargo por daños y reclamar

- **Actor primario:** Huésped.
- **Trazabilidad:** RNF-M-10, RF-K-08 (soporte), RF-S-04, D-C14, D-C19.
- **Precondición:** el Ama de llaves registró un cargo (CU-V-24) y existe una reserva con canal de contacto (email/Telegram/web).
- **Disparador:** el sistema envía la notificación del cargo.

**Postcondición (oráculo):** Fila en `damage_charge_guest_notifications` con `channel`, `sent_at`, `due_date` y `status` (`SENT`/`ACKNOWLEDGED`/`DISPUTED`/`EXPIRED`); HTTP 409 `DueDateExceeded` fuera de plazo y reemisión de URL firmada si el enlace caduca.

**Flujo principal**
1. El sistema envía al huésped una notificación con datos mínimos: reserva, descripción del daño, importe y enlace a la evidencia.
2. La notificación se registra en `damage_charge_guest_notifications` con `channel`, `sent_at`, `due_date` y `status = SENT`.
3. El huésped puede **Acknowledge** (conforme, `status = ACKNOWLEDGED`, sin reclamación) o **Dispute** (reclamar) dentro del plazo (`DAMAGE_CLAIM_WINDOW_H`, por defecto 24 h antes del check-out).
4. Si reclamar: se fija `status = DISPUTED`, `dispute_notes` y `disputed_at`; Recepción resuelve (CU-V-33).
5. Si no reclama en plazo: `status = EXPIRED`; el cargo se cobra en el check-out (CU-V-34).

**Flujos alternativos / excepciones**
- 41a — Canal no disponible: se reintenta por el canal alternativo y se registra.
- 41b — Reclamación fuera de plazo: rechazada (`DueDateExceeded`), el cargo se mantiene.
- 41c — Enlace a evidencia caducado: se reemite una URL firmada temporal al huésped autenticado.
- 41d — Notificación sin evidencia (D-C12): se informa de que no hay foto adjunta.

```gherkin
Escenario: Notificación con evidencia e importe
  Dado que el cargo CH-101 se aprobó con descripción "TV rota" e importe 250,00 €
  Cuando el sistema notifica al huésped
  Entonces damage_charge_guest_notifications tiene channel=EMAIL, status=SENT y due_date fijado
  Y la notificación incluye la descripción y el importe pero ningún dato personal de terceros

Escenario: Reclamación dentro de plazo
  Dado que la notificación CH-101 está en estado SENT y dentro de plazo
  Cuando el huésped reclama con notas "el daño era previo"
  Entonces status pasa a 'DISPUTED' con dispute_notes y disputed_at informados
  Y Recepción puede resolver la reclamación (CU-V-33)

Escenario: Sin reclamación al vencer el plazo
  Dado que la notificación CH-101 alcanzó su due_date sin reclamación
  Cuando el proceso de vencimiento se ejecuta
  Entonces status pasa a 'EXPIRED'
  Y el cargo queda listo para el cobro en el check-out

Escenario: Reclamación fuera de plazo
  Dado que la notificación CH-101 está EXPIRED
  Cuando el huésped intenta reclamar
  Entonces la respuesta es HTTP 409 con DueDateExceeded
  Y el cargo se mantiene

Escenario: Enlace de evidencia caducado
  Dado que la URL firmada de la evidencia expiró
  Cuando el huésped autenticado solicita verla de nuevo
  Entonces el sistema reemite una URL firmada temporal
```

**Restricciones (EARS)**
- Cuando se apruebe un cargo por daños, el sistema deberá notificar al huésped por el canal preferido con datos mínimos, descripción, importe y enlace a la evidencia.
- El sistema deberá fijar un `due_date` de reclamación (por defecto `DAMAGE_CLAIM_WINDOW_H` antes del check-out) y deberá registrar `SENT`, `ACKNOWLEDGED` (huésped conforme), `DISPUTED`, `EXPIRED` o, tras la resolución en CU-V-33, `RESOLVED_ACCEPTED`/`RESOLVED_REJECTED`.
- Si el plazo vence sin reclamación, entonces el sistema deberá marcar `EXPIRED` y mantener el cargo para el cobro.

---

### CU-V-42 — Ejercer los derechos de acceso y supresión

- **Actor primario:** Huésped.
- **Trazabilidad:** RNF-M-10, D-C19, RNF-M-06.
- **Precondición:** el huésped acredita su identidad y su estancia; la reclamación está resuelta.
- **Disparador:** el huésped solicita acceso o supresión de sus datos/evidencias.

**Postcondición (oráculo):** Datos de la estancia entregados o evidencias eliminadas/anonimizadas, con la solicitud registrada en auditoría sin el dato suprimido; HTTP 403 sin identidad acreditada y supresión pospuesta mientras la reclamación esté abierta.

**Flujo principal**
1. El huésped solicita acceso o supresión.
2. El sistema entrega los datos mínimos asociados a su estancia (descripción, importe, canal, resolución).
3. Si procede la supresión y no hay obligación legal de conservar: elimina o anonimiza las fotos y datos personales.
4. Se registra la solicitud y su resolución en auditoría (sin conservar el dato suprimido).

**Flujos alternativos / excepciones**
- 42a — Reclamación abierta: la supresión se pospone hasta resolverla.
- 42b — Obligación de conservación (auditoría/fiscal): se conserva el registro mínimo y se informa al huésped.
- 42c — Identidad no acreditada: HTTP 403.

```gherkin
Escenario: Acceso a los datos de la estancia
  Dado que el huésped acredita su identidad y la estancia 2026-10-05/301
  Cuando solicita acceso
  Entonces recibe descripción, importe, canal y resolución de sus cargos
  Y no recibe datos de terceros

Escenario: Supresión tras resolver la reclamación
  Dado que la reclamación del cargo CH-101 está resuelta
  Cuando el huésped solicita la supresión
  Entonces las fotos asociadas se eliminan o anonimizan
  Y la solicitud queda auditada sin el dato suprimido

Escenario: Supresión con reclamación abierta
  Dado que la notificación CH-101 está DISPUTED
  Cuando el huésped solicita la supresión
  Entonces el sistema pospone la supresión hasta resolver la reclamación

Escenario: Conservación obligatoria
  Dado que existe una obligación legal de conservar el registro del cargo
  Cuando el huésped solicita la supresión
  Entonces el sistema conserva el registro mínimo exigido
  Y lo informa al huésped

Escenario: Identidad no acreditada
  Cuando un tercero intenta acceder a los datos de la estancia sin acreditación
  Entonces la respuesta es HTTP 403
```

**Restricciones (EARS)**
- El sistema deberá permitir al huésped el acceso y la supresión de sus datos, con base legal contractual, y deberá registrar la solicitud.
- Si la reclamación está abierta, entonces el sistema deberá posponer la supresión hasta su resolución.
- De acuerdo con una obligación legal de conservación, el sistema deberá conservar el mínimo registro exigido e informar al huésped.

---

## 14. Soporte (= Administrador / Owner)

### CU-V-43 — Supervisar la cola de anclajes y firmas pendientes

- **Actor primario:** Soporte (= Administrador/Owner).
- **Trazabilidad:** RNF-M-03, RNF-M-13, RNF-M-14, D-C18, D-C24, D-C31.
- **Precondición:** cuenta con `DEFAULT_ADMIN_ROLE`.
- **Disparador:** una firma queda `PENDING` o `FAILED`, o hay alertas de cola.

**Postcondición (oráculo):** Cola visible en `data-testid="anchor-queue"` con estados, `retry_count` y `next_attempt_at`; `on_chain_signatures.status = 'MINED'` al confirmar o `'FAILED'` al agotar reintentos (entidad `PENDING_ANCHOR`), con alerta si `PENDING > PENDING_ALERT_MIN` y `data-testid="degraded-state"` si cae el RPC.

**Flujo principal**
1. El Soporte abre `data-testid="anchor-queue"` con las firmas por estado, `retry_count` y `next_attempt_at`.
2. El sistema muestra métricas de la cola (tamaño, retraso, fallos), saldo de gas por wallet y alertas.
3. Si una firma lleva > `PENDING_ALERT_MIN` (10 min) en `PENDING` o `retry_count > RETRY_ALERT_COUNT` (5), se genera alerta.
4. El Soporte puede forzar un reintento o marcar la entidad para intervención manual.
5. Al confirmarse, `status = MINED` y la entidad deja de estar `PENDING_ANCHOR`.
6. El worker detecta reorgs comparando `tx_hash` confirmado (RNF-M-14).

**Flujos alternativos / excepciones**
- 43a — Backoff agotado (8 reintentos o TTL 24 h): la firma pasa a `FAILED`; la entidad queda `PENDING_ANCHOR` visible y no se revierte el estado off-chain.
- 43b — RPC caído: `data-testid="degraded-state"`; los jobs se reprograman.
- 43c — Nonce atascado: se serializa por wallet y se permite reemplazo controlado.
- 43d — Firma `FAILED` por `RoleChangedSinceSigning`: se exige nueva firma del rol vigente.
- 43e — Reorg detectado: se marca el job para reanclaje y se alerta.

```gherkin
Escenario: Cola con firmas pendientes
  Dado que existen 3 firmas en estado PENDING con retry_count 1, 2 y 0
  Cuando abro data-testid="anchor-queue"
  Entonces veo las 3 firmas con su next_attempt_at, retry_count y entidad asociada

Escenario: Alerta por firma PENDING > 10 min
  Dado que una firma lleva 11 min en PENDING
  Cuando el monitor evalúa la cola
  Entonces se genera una alerta al Soporte
  Y la entidad muestra data-testid="signature-pending-anchor"

Escenario: Alerta por reintentos excesivos
  Dado que una firma tiene retry_count = 6
  Cuando el monitor evalúa la cola
  Entonces se genera una alerta al Soporte

Escenario: Agotamiento de reintentos
  Dado que una firma superó ANCHOR_MAX_RETRIES (8)
  Cuando el worker cierra el job
  Entonces on_chain_signatures.status pasa a 'FAILED'
  Y la entidad permanece PENDING_ANCHOR sin revertir el estado off-chain
  Y se impide una nueva acción sobre la entidad

Escenario: RPC caído
  Dado que el RPC no responde
  Cuando abro la cola de anclajes
  Entonces se muestra data-testid="degraded-state"
  Y los jobs se reprograman con backoff

Escenario: Nonce atascado
  Dado que dos firmas de la misma wallet compiten por nonce
  Cuando el worker serializa por wallet
  Entonces las transacciones se emiten en orden sin quedar atascadas

Escenario: Cambio de rol entre firma y verificación
  Dado que el firmante perdió su rol HEAD_MAINTENANCE_ROLE
  Cuando el worker verifica la firma
  Entonces status pasa a 'FAILED' con RoleChangedSinceSigning
  Y se exige una nueva firma del rol vigente

Escenario: Reorg de cadena
  Dado que el tx_hash confirmado desaparece de la cadena canónica
  Cuando el worker compara el tx_hash
  Entonces marca el job para reanclaje y alerta al Soporte
```

**Restricciones (EARS)**
- El sistema deberá reintentar el anclaje con backoff `ANCHOR_BACKOFF`, máximo `ANCHOR_MAX_RETRIES` y TTL `ANCHOR_TTL_HOURS`.
- Si una firma permanece `PENDING` más de `PENDING_ALERT_MIN` o su `retry_count` supera `RETRY_ALERT_COUNT`, entonces el sistema deberá alertar al Soporte.
- Cuando se agoten los reintentos, el sistema deberá marcar la firma `FAILED`, mantener la entidad `PENDING_ANCHOR` y bloquear nuevas acciones sobre ella.
- El sistema deberá detectar reorgs comparando el `tx_hash` confirmado y deberá serializar los nonces por wallet.

---

### CU-V-44 — Recuperar el PIN de un operario de terminal

- **Actor primario:** Soporte (= Administrador/Owner).
- **Trazabilidad:** RNF-M-09, RNF-M-16, RNF-M-06, D-C17, D-C24.
- **Precondición:** el operario está bloqueado (`locked_until`) o ha olvidado su PIN.
- **Disparador:** el operario solicita la recuperación del PIN.

**Postcondición (oráculo):** `terminal_operators` con `failed_attempts = 0`, `locked_until = NULL` y `must_change_pin = TRUE`, PIN de un solo uso emitido y traza en `operator_audit_log`; HTTP 403 sin rol y HTTP 422 sobre operario inactivo.

**Flujo principal**
1. El Soporte localiza al operario en `terminal_operators`.
2. Verifica su identidad por el procedimiento interno y desbloquea (`failed_attempts = 0`, `locked_until = NULL`).
3. Genera un PIN de un solo uso (`must_change_pin = TRUE`) y lo entrega por canal seguro.
4. Registra la operación en auditoría.

**Flujos alternativos / excepciones**
- 44a — El Soporte no tiene `DEFAULT_ADMIN_ROLE`: HTTP 403.
- 44b — Recuperación de un operario inactivo: HTTP 422.
- 44c — Recuperación repetida de la misma cuenta en < 24 h: alerta antifraude.
- 44d — Entrega del PIN por canal no seguro: se rechaza.

```gherkin
Escenario: Desbloqueo y nuevo PIN de un solo uso
  Dado que "tech.luis" está bloqueado con locked_until no nulo
  Cuando el Soporte desbloquea su cuenta
  Entonces failed_attempts=0, locked_until=NULL y must_change_pin=TRUE
  Y se emite un PIN de un solo uso
  Y operator_audit_log registra la recuperación

Escenario: Recuperación sin rol
  Dado que mi cuenta no tiene DEFAULT_ADMIN_ROLE
  Cuando intento recuperar el PIN de tech.luis
  Entonces la respuesta es HTTP 403

Escenario: Recuperación de operario inactivo
  Dado que "tech.luis" tiene active=FALSE
  Cuando intento recuperar su PIN
  Entonces la respuesta es HTTP 422

Escenario: Recuperaciones repetidas
  Dado que ya se recuperó el PIN de tech.luis hace 2 h
  Cuando se solicita otra recuperación
  Entonces el sistema genera una alerta antifraude
  Y solicita confirmación adicional

Escenario: Canal inseguro
  Cuando se intenta entregar el PIN por un canal no seguro
  Entonces el sistema rechaza la entrega
```

**Restricciones (EARS)**
- El sistema deberá permitir la recuperación del PIN solo a cuentas con `DEFAULT_ADMIN_ROLE`, con nueva credencial de un solo uso y traza de auditoría.
- El sistema deberá alertar ante recuperaciones repetidas de la misma cuenta en menos de 24 h.

---

### CU-V-45 — Restaurar y verificar copias de seguridad

- **Actor primario:** Soporte (= Administrador/Owner).
- **Trazabilidad:** RNF-M-12, RNF-M-03, RNF-M-13, D-C25, D-C24.
- **Precondición:** existen copias diarias + WAL/PITR, con evidencias replicadas.
- **Disparador:** incidente de datos o prueba de restauración programada.

**Postcondición (oráculo):** BD restaurada dentro del RTO de 4 h y con pérdida ≤ RPO de 1 h, trabajos `PENDING_ANCHOR` reintentados sin duplicar firmas y cadena `prev_hash` + `integrity_hash` verificada; alerta si se supera RPO/RTO.

**Flujo principal**
1. El Soporte inicia la restauración desde el último dump/WAL dentro del RPO de 1 h.
2. El sistema recupera la BD operativa en un RTO de 4 h y reintenta los trabajos `PENDING_ANCHOR` tras restaurar.
3. Verifica la integridad de la auditoría (`prev_hash` + `integrity_hash`) y de las evidencias replicadas.
4. Registra el resultado de la restauración y su duración.

**Flujos alternativos / excepciones**
- 45a — RPO superado (> 1 h de datos perdidos): se alerta y se documenta la pérdida.
- 45b — RTO superado (> 4 h): se alerta al Administrador.
- 45c — Evidencia no replicada: se marca para recuperación desde origen.
- 45d — Trabajos `PENDING_ANCHOR` tras restaurar: se reintentan sin duplicar firmas.

```gherkin
Escenario: Restauración dentro de RPO/RTO
  Dado que existe un dump diario y WAL hasta hace 30 min
  Cuando el Soporte restaura la BD
  Entonces la BD queda operativa en ≤ 4 h (RTO)
  Y la pérdida de datos no supera 1 h (RPO)

Escenario: Reintento de anclajes tras restaurar
  Dado que hay 2 trabajos en PENDING_ANCHOR antes de la restauración
  Cuando la BD se restaura
  Entonces el worker reintenta esos 2 trabajos
  Y no se generan firmas duplicadas

Escenario: RPO superado
  Dado que la última copia útil es de hace 90 min
  Cuando se restaura
  Entonces el sistema alerta de la pérdida superior a 1 h
  Y documenta el hueco

Escenario: RTO superado
  Dado que la restauración lleva 5 h
  Cuando finaliza
  Entonces el sistema alerta al Administrador por superar el RTO

Escenario: Verificación de la auditoría restaurada
  Cuando finaliza la restauración
  Entonces la cadena prev_hash + integrity_hash verifica
  Y las evidencias replicadas están accesibles
```

**Restricciones (EARS)**
- El sistema deberá garantizar RPO de 1 h y RTO de 4 h con dump diario + WAL/PITR y retención de 30 diarios + 12 mensuales.
- Cuando se restaure la BD, el sistema deberá reintentar los trabajos `PENDING_ANCHOR` sin duplicar firmas.
- Si el RPO o el RTO se superan, entonces el sistema deberá alertar y documentar el incidente.

---

## 15. Restricciones globales del sistema (EARS)

Aplican transversalmente a todas las suites; se trazan en §12/§13 a los casos correspondientes.

- **[RNF-M-01] Separación de privilegios.** El sistema no deberá permitir que un técnico firme por el jefe ni que el Ama de llaves desbloquee mantenimiento; el rol on-chain se verificará en cada firma contra `operator_wallets` y `HotelOperations`.
- **[RNF-M-04] Usabilidad móvil.** El sistema deberá priorizar el uso desde móvil (contraste legible, botones amplios, mensajes claros) **sin** exigir un nivel formal WCAG 2.1 (D-C28).
- **[RNF-M-05] Rendimiento.** El sistema deberá cumplir: tablero de habitaciones p95 < `P95_BOARD_MS` (500 ms) con 20 usuarios concurrentes; listados p95 < `P95_LIST_MS` (800 ms) con página máx. 50; firma registrada p95 < `P95_SIGN_MS` (5 s) hasta `SIGNED` sin minado.
- **[RNF-M-07] Sin PII on-chain.** El sistema no deberá escribir datos personales en la cadena: solo hashes, identificadores de habitación, estados, direcciones y timestamps.
- **[RNF-M-08] Extensibilidad.** El contrato `HotelOperations` deberá ser inmutable y emitir `OperationalAction(actionType, entityId, payloadHash, signer, timestamp)`; añadir un tipo no deberá exigir redeploy.
- **[RNF-M-15] Ciclo de vida de wallets.** El sistema deberá revocar el rol on-chain **antes** de marcar `revoked_at` y deberá mantener histórico de wallets por usuario.
- **[RNF-M-19] Cumplimiento.** El sistema deberá retener `operator_audit_log` y `on_chain_signatures` 5 años, en modo append-only con hash encadenado, y deberá exportar el expediente de evidencias.

---

## 16. Matriz de trazabilidad requisito → caso(s) de uso

### 16.1 Requisitos funcionales de Mantenimiento

| Requisito | Caso(s) de uso |
|---|---|
| RF-M-01 | CU-V-02, CU-V-15, CU-V-23, CU-V-31 |
| RF-M-02 | CU-V-02, CU-V-13 |
| RF-M-03 | CU-V-03 |
| RF-M-04 | CU-V-04, CU-V-14 |
| RF-M-05 | CU-V-05 |
| RF-M-06 | CU-V-06 |
| RF-M-07 | CU-V-06 |
| RF-M-08 | CU-V-07, CU-V-14 |
| RF-M-09 | CU-V-08, CU-V-14 |
| RF-M-10 | CU-V-04, CU-V-08, CU-V-14 |
| RF-M-11 | CU-V-10 |
| RF-M-12 | CU-V-19 |

### 16.2 Requisitos funcionales de Ama de llaves

| Requisito | Caso(s) de uso |
|---|---|
| RF-K-01 | CU-V-17, CU-V-28 |
| RF-K-02 | CU-V-18, CU-V-29 |
| RF-K-03 | CU-V-19 |
| RF-K-04 | CU-V-20, CU-V-29 |
| RF-K-05 | CU-V-21 |
| RF-K-06 | CU-V-22 |
| RF-K-07 | CU-V-23 |
| RF-K-08 | CU-V-24, CU-V-33, CU-V-34, CU-V-41 |
| RF-K-09 | CU-V-25, CU-V-30 |
| RF-K-10 | CU-V-26 |

### 16.3 Requisitos funcionales de firma y trazabilidad

| Requisito | Caso(s) de uso |
|---|---|
| RF-S-01 | CU-V-01, CU-V-16 |
| RF-S-02 | CU-V-03, CU-V-05, CU-V-38 |
| RF-S-03 | CU-V-21 |
| RF-S-04 | CU-V-24 |
| RF-S-05 | CU-V-07, CU-V-38 |
| RF-S-06 | CU-V-08, CU-V-09, CU-V-14 |
| RF-S-07 | CU-V-03, CU-V-05, CU-V-07, CU-V-21 |
| RF-S-08 | CU-V-02, CU-V-06, CU-V-17, CU-V-35, CU-V-37 |

### 16.4 Requisitos no funcionales

| Requisito | Caso(s) de uso | Restricción global §15 |
|---|---|---|
| RNF-M-01 | CU-V-03, CU-V-13, CU-V-23 | ✓ |
| RNF-M-02 | CU-V-01, CU-V-03, CU-V-07, CU-V-16, CU-V-21 | — |
| RNF-M-03 | CU-V-03, CU-V-05, CU-V-07, CU-V-43, CU-V-45 | — |
| RNF-M-04 | CU-V-12, CU-V-13, CU-V-18, CU-V-27, CU-V-28 | ✓ |
| RNF-M-05 | CU-V-10, CU-V-13, CU-V-18, CU-V-26, CU-V-28 | ✓ |
| RNF-M-06 | CU-V-02, CU-V-04, CU-V-06, CU-V-08, CU-V-17, CU-V-24, CU-V-35, CU-V-37, CU-V-40, CU-V-42 | — |
| RNF-M-07 | CU-V-03, CU-V-05, CU-V-07 | ✓ |
| RNF-M-08 | CU-V-03, CU-V-07 | ✓ |
| RNF-M-09 | CU-V-12, CU-V-27, CU-V-36, CU-V-44 | — |
| RNF-M-10 | CU-V-24, CU-V-33, CU-V-34, CU-V-41, CU-V-42 | — |
| RNF-M-11 | CU-V-37 | — |
| RNF-M-12 | CU-V-40, CU-V-45 | — |
| RNF-M-13 | CU-V-43, CU-V-45 | — |
| RNF-M-14 | CU-V-03, CU-V-05, CU-V-07, CU-V-43 | — |
| RNF-M-15 | CU-V-35, CU-V-38 | ✓ |
| RNF-M-16 | CU-V-36, CU-V-44 | — |
| RNF-M-17 | CU-V-12, CU-V-14, CU-V-27, CU-V-29 | — |
| RNF-M-18 | CU-V-12, CU-V-14, CU-V-27, CU-V-29 | — |
| RNF-M-19 | CU-V-40 | ✓ |
| RNF-M-20 | CU-V-13, CU-V-14, CU-V-15 | — |
| RNF-M-21 | CU-V-09, CU-V-39 | — |

---

## 17. Tabla de cobertura (ningún requisito huérfano)

Recuento: **30 requisitos funcionales** (12 RF-M + 10 RF-K + 8 RF-S) y **21 RNF-M** = **51 requisitos, todos cubiertos**.

| Requisito | Cubierto | CU(s) |
|---|---|---|
| RF-M-01 | ✅ | CU-V-02, CU-V-15, CU-V-23, CU-V-31 |
| RF-M-02 | ✅ | CU-V-02, CU-V-13 |
| RF-M-03 | ✅ | CU-V-03 |
| RF-M-04 | ✅ | CU-V-04, CU-V-14 |
| RF-M-05 | ✅ | CU-V-05 |
| RF-M-06 | ✅ | CU-V-06 |
| RF-M-07 | ✅ | CU-V-06 |
| RF-M-08 | ✅ | CU-V-07, CU-V-14 |
| RF-M-09 | ✅ | CU-V-08, CU-V-14 |
| RF-M-10 | ✅ | CU-V-04, CU-V-08, CU-V-14 |
| RF-M-11 | ✅ | CU-V-10 |
| RF-M-12 | ✅ | CU-V-19 |
| RF-K-01 | ✅ | CU-V-17, CU-V-28 |
| RF-K-02 | ✅ | CU-V-18, CU-V-29 |
| RF-K-03 | ✅ | CU-V-19 |
| RF-K-04 | ✅ | CU-V-20, CU-V-29 |
| RF-K-05 | ✅ | CU-V-21 |
| RF-K-06 | ✅ | CU-V-22 |
| RF-K-07 | ✅ | CU-V-23 |
| RF-K-08 | ✅ | CU-V-24, CU-V-33, CU-V-34, CU-V-41 |
| RF-K-09 | ✅ | CU-V-25, CU-V-30 |
| RF-K-10 | ✅ | CU-V-26 |
| RF-S-01 | ✅ | CU-V-01, CU-V-16 |
| RF-S-02 | ✅ | CU-V-03, CU-V-05, CU-V-38 |
| RF-S-03 | ✅ | CU-V-21 |
| RF-S-04 | ✅ | CU-V-24 |
| RF-S-05 | ✅ | CU-V-07, CU-V-38 |
| RF-S-06 | ✅ | CU-V-08, CU-V-09, CU-V-14 |
| RF-S-07 | ✅ | CU-V-03, CU-V-05, CU-V-07, CU-V-21 |
| RF-S-08 | ✅ | CU-V-02, CU-V-06, CU-V-17, CU-V-35, CU-V-37 |
| RNF-M-01 | ✅ | CU-V-03, CU-V-13, CU-V-23 |
| RNF-M-02 | ✅ | CU-V-01, CU-V-03, CU-V-07, CU-V-16, CU-V-21 |
| RNF-M-03 | ✅ | CU-V-03, CU-V-05, CU-V-07, CU-V-43, CU-V-45 |
| RNF-M-04 | ✅ | CU-V-12, CU-V-13, CU-V-18, CU-V-27, CU-V-28 |
| RNF-M-05 | ✅ | CU-V-10, CU-V-13, CU-V-18, CU-V-26, CU-V-28 |
| RNF-M-06 | ✅ | CU-V-02, CU-V-04, CU-V-06, CU-V-08, CU-V-17, CU-V-24, CU-V-35, CU-V-37, CU-V-40, CU-V-42 |
| RNF-M-07 | ✅ | CU-V-03, CU-V-05, CU-V-07 |
| RNF-M-08 | ✅ | CU-V-03, CU-V-07 |
| RNF-M-09 | ✅ | CU-V-12, CU-V-27, CU-V-36, CU-V-44 |
| RNF-M-10 | ✅ | CU-V-24, CU-V-33, CU-V-34, CU-V-41, CU-V-42 |
| RNF-M-11 | ✅ | CU-V-37 |
| RNF-M-12 | ✅ | CU-V-40, CU-V-45 |
| RNF-M-13 | ✅ | CU-V-43, CU-V-45 |
| RNF-M-14 | ✅ | CU-V-03, CU-V-05, CU-V-07, CU-V-43 |
| RNF-M-15 | ✅ | CU-V-35, CU-V-38 |
| RNF-M-16 | ✅ | CU-V-36, CU-V-44 |
| RNF-M-17 | ✅ | CU-V-12, CU-V-14, CU-V-27, CU-V-29 |
| RNF-M-18 | ✅ | CU-V-12, CU-V-14, CU-V-27, CU-V-29 |
| RNF-M-19 | ✅ | CU-V-40 |
| RNF-M-20 | ✅ | CU-V-13, CU-V-14, CU-V-15 |
| RNF-M-21 | ✅ | CU-V-09, CU-V-39 |

**Requisitos sin caso de uso: ninguno.** Los 51 requisitos (30 funcionales + 21 no funcionales) tienen al menos un caso de uso con criterios Gherkin/EARS testeables.

---

## 18. Índice de casos de uso

| CU | Objetivo | Actor primario | Firma on-chain |
|---|---|---|---|
| CU-V-01 | Autenticarse en la Suite de Mantenimiento | Jefe de Mantenimiento | — |
| CU-V-02 | Recibir, clasificar y asignar incidencias | Jefe de Mantenimiento | No |
| CU-V-03 | Bloquear habitación para venta | Jefe de Mantenimiento | **Obligatoria** |
| CU-V-04 | Resolver y cerrar una incidencia | Jefe de Mantenimiento | No |
| CU-V-05 | Desbloquear habitación tras verificación | Jefe de Mantenimiento | **Obligatoria** |
| CU-V-06 | Configurar y programar plan preventivo | Jefe de Mantenimiento | No |
| CU-V-07 | Registrar cumplimiento de tarea preventiva | Jefe de Mantenimiento | **Obligatoria (críticas)** |
| CU-V-08 | Registrar mantenimiento rutinario de áreas comunes | Jefe de Mantenimiento | No |
| CU-V-09 | Validar tareas de subordinados (SLA 24 h) | Jefe de Mantenimiento | No |
| CU-V-10 | Generar informes de mantenimiento | Jefe de Mantenimiento | No |
| CU-V-11 | (Fusionado en CU-V-19) Notificar al Ama de llaves habitación lista | Sistema (automático) | No |
| CU-V-12 | Autenticarse en el terminal (PIN) | Técnico | — |
| CU-V-13 | Consultar mis incidencias/tareas asignadas | Técnico | No |
| CU-V-14 | Registrar avance y cierre con evidencia | Técnico | No (valida el jefe) |
| CU-V-15 | Reportar incidencia desde el terminal | Técnico | No |
| CU-V-16 | Autenticarse en la Suite Ama de llaves | Ama de llaves | — |
| CU-V-17 | Crear turnos y asignar habitaciones | Ama de llaves | No |
| CU-V-18 | Consultar el tablero de estado operativo | Ama de llaves | No |
| CU-V-19 | Recibir notificación de limpieza | Ama de llaves | No |
| CU-V-20 | Supervisar el trabajo de las camareras | Ama de llaves | No |
| CU-V-21 | Inspeccionar y certificar habitación | Ama de llaves | Opcional (D-C23) |
| CU-V-22 | Rechazar limpieza y devolverla | Ama de llaves | No |
| CU-V-23 | Reportar incidencia de mantenimiento | Ama de llaves | No |
| CU-V-24 | Registrar cargo por daños | Ama de llaves | **No (D-C27)** |
| CU-V-25 | Gestionar suministros con alerta de umbral | Ama de llaves | No |
| CU-V-26 | Generar informes de productividad e inspecciones | Ama de llaves | No |
| CU-V-27 | Autenticarse en el terminal (PIN) | Camarera | — |
| CU-V-28 | Consultar mis habitaciones del turno | Camarera | No |
| CU-V-29 | Registrar estado de limpieza y completar | Camarera | No |
| CU-V-30 | Registrar consumo de suministros | Camarera | No |
| CU-V-31 | Reportar incidencia de mantenimiento | Recepción | No |
| CU-V-32 | Activar/desactivar la venta manualmente | Recepción | No (D-C9/D-C37) |
| CU-V-33 | Resolver reclamación del huésped | Recepción | No |
| CU-V-34 | Confirmar cargo por daños en el check-out | Recepción | No |
| CU-V-35 | Gestionar wallets y roles on-chain de jefes | Administrador/Owner | On-chain (roles) |
| CU-V-36 | Alta/rotación/baja de operarios de terminal | Administrador/Owner | No |
| CU-V-37 | Gobernar flags de firma on-chain | Administrador/Owner | On-chain (flags obligatorios) |
| CU-V-38 | Firmar en emergencia como `OWNER_BACKUP` | Administrador/Owner | **Obligatoria (emergencia)** |
| CU-V-39 | Gestionar tareas vencidas escaladas | Administrador/Owner | No |
| CU-V-40 | Exportar expediente de evidencias y auditoría | Administrador/Owner | No |
| CU-V-41 | Recibir notificación de cargo y reclamar | Huésped | No |
| CU-V-42 | Ejercer derechos de acceso y supresión | Huésped | No |
| CU-V-43 | Supervisar la cola de anclajes | Soporte (=Admin) | No (gestiona firmas) |
| CU-V-44 | Recuperar PIN de operario de terminal | Soporte (=Admin) | No |
| CU-V-45 | Restaurar y verificar copias de seguridad | Soporte (=Admin) | No |

**Total: 45 casos de uso** (CU-V-01 … CU-V-45), repartidos en 8 actores.

---

## 19. Registro de correcciones

Trazabilidad de la auditoría funcional vNext (`INFORME_AUDITORIA_VNEXT_V1.md`). Todos los cambios se aplicaron sobre este documento, salvo las dos excepciones de consistencia indicadas al final.

| Hallazgo | Severidad | Qué se cambió | Dónde |
|---|---|---|---|
| CU-AUD-01 | Crítica | Eliminados `AVAILABLE` y `CLEANING` de `publication_status`; el publicable es `PUBLISHED` y la limpieza/inspección se modela en `operational_status` (`PENDING_CLEANING`/`IN_INSPECTION`), con `publication_status='PAUSED'` tras el desbloqueo. | §2 (`ROOM_STATES`), CU-V-03, CU-V-05, CU-V-11, CU-V-19, CU-V-21, CU-V-32 |
| CU-AUD-02 | Crítica | Alineados todos los estados operativos, de asignación y de validación con el vocabulario canónico (`CLEAN`/`DIRTY`/`OCCUPIED`/`PENDING_CLEANING`/`IN_INSPECTION`; `PENDING`/`IN_PROGRESS`/`DONE`; `PENDING_VERIFICATION`/`VALIDATED`/`PENDING_VERIFICATION_EXPIRED`; `DONE`). | §2, CU-V-07, CU-V-08, CU-V-17, CU-V-18, CU-V-19, CU-V-20, CU-V-21, CU-V-22, CU-V-29 |
| CU-AUD-03 | Alta | CU-V-11 fusionado en CU-V-19 (se conserva el número como referencia «fusionado en CU-V-19») y se elimina al Jefe de Mantenimiento como actor de la notificación automática. | CU-V-11, §6, §16, §17, §18 |
| CU-AUD-04 | Alta | D-C14 (notificación + plazo) fijado como flujo vigente; eliminada la expresión «nota interna»; el cobro se aplica en el check-out. | CU-V-24, CU-V-34; `requerimientos.md` §5.2 y §8 |
| CU-AUD-05 | Alta | Corregida la semántica de `ACKNOWLEDGED` (huésped conforme, no reclamación aceptada) y añadidos los estados de resolución `RESOLVED_ACCEPTED`/`RESOLVED_REJECTED` con oráculo de BD al desestimar. | §2 (`NOTIF_STATUS`), §4, CU-V-33, CU-V-41; diccionario §3.10.1/§3.14 y `base_datos.sql` §12 |
| CU-AUD-06 | Media | Eliminada la opcionalidad de firma de `AREA_LOG`: el mantenimiento rutinario no firma on-chain. | §2, §3 (nota), CU-V-08 |
| CU-AUD-07 | Media | En CU-V-17 se cambió la cita D-C8 → D-C9 y se añadió D-C9 a su trazabilidad. | CU-V-17 |
| CU-AUD-08 | Media | Uso de `preventive_plans` (plural) y referencia a su CHECK correcto `preventive_plans_periodicity_check` (`WEEKLY`/`MONTHLY`/`QUARTERLY`), distinguiéndolo de `maintenance_area_tasks_periodicity_check`. | §4, CU-V-06 |
| CU-AUD-09 | Media | Oráculo del importe corregido a `additional_charges.amount_cents > 0` (no `damage_charge_cents`). | CU-V-24 |
| CU-AUD-10 | Media | Definido el error propio `RoomBlockedByMaintenance` (HTTP 409) y usado en CU-V-32, sin reutilizar `RoomAlreadyBlocked`. | §4, CU-V-32 |
| CU-AUD-11 | Media | Catálogo de `data-testid` §5 sincronizado: añadidos `empty-state`, `evidence-missing`, `possible-duplicate` y `conflict-warning`; implementados `incident-list`/`incident-detail` y `damage-charge-form`; retirados `no-wallet`/`wrong-network`. | §5, CU-V-02, CU-V-13, CU-V-24 |
| CU-AUD-12 | Media | Añadido un apartado **Postcondición (oráculo)** verificable (estado BD / evento on-chain / código HTTP) a los 45 casos de uso. | CU-V-01 … CU-V-45 |
| CU-AUD-13 | Media | Avisos subjetivos dotados de oráculo (`evidence-missing`, `possible-duplicate`, `conflict-warning`) y `DueDateExceeded` añadido a §4 con su HTTP 409. | §4, §5, CU-V-03, CU-V-07, CU-V-14, CU-V-20, CU-V-22, CU-V-23, CU-V-24, CU-V-31, CU-V-41 |
| CU-AUD-14 | Media | Estado único `PENDING` para la asignación rechazada y escalada al Ama de llaves/Administración (no al Jefe de Mantenimiento). | CU-V-22, CU-V-29 |
| CU-AUD-15 | Media | Retirado `P95_SIGN_MS` de CU-V-01/CU-V-16 y usado `P95_LIST_MS` en CU-V-13; tabla de constantes §2 actualizada. | §2, CU-V-01, CU-V-13 |
| CU-AUD-16 | Media | Patrones EARS corregidos («Al agotar…» → «Cuando se agoten…»; «De acuerdo con D-C…» → «El sistema deberá…»). | CU-V-03, CU-V-24, CU-V-43, §15 |
| CU-AUD-17 | Media | La alerta de suministros usa la entidad persistente `supply_alerts` (`status` `OPEN`/`CLOSED`, `last_reminded_at`, `closed_at`) como oráculo. | §2, §5, CU-V-25, CU-V-30; diccionario §3.13 |
| CU-AUD-18 | Baja | CU-V-38 dotado de los criterios RF-S-07 (⛓, `data-testid="requires-signature"`, modal de previsualización) y de la verificación EIP-712 (`recovered_signer`, `role_snapshot`). | CU-V-38 |
| CU-AUD-19 | Baja | Replicados en CU-V-05 los pasos y oráculos de verificación EIP-712 que ya usaba CU-V-03. | CU-V-05 |
| CU-AUD-20 | Baja | Concretado el oráculo del cobro en el check-out: `additional_charges.status='PAID'` vinculado al folio. | CU-V-34 |

> **Notas de consistencia (fuera de `casos_uso.md`):**
> 1. CU-AUD-05 exige estados de resolución nuevos; para que el oráculo de BD sea verificable se añadieron `RESOLVED_ACCEPTED`/`RESOLVED_REJECTED` al CHECK de `damage_charge_guest_notifications.status` en `base_datos.sql` §12 y al diccionario §3.10.1/§3.14.
> 2. CU-AUD-04 elimina la expresión «nota interna» también en `requerimientos.md` §5.2 y §8.
> 3. **Armonizado (2026-10-06):** `requerimientos.md` RF-K-02 y §5.2 ya usan el vocabulario canónico (`CLEAN`, `DIRTY`, `OCCUPIED`, `PENDING_CLEANING`, `IN_INSPECTION`); los gráficos de `casos_uso/` se regeneran con los mismos valores.

---

*Casos de uso vNext · Fase 2 · @asistenteProyecto · 2026-10-06 (revisado: auditoría CU-AUD-01…CU-AUD-20).*

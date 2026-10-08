# Informe de Auditoría — Propuesta vNext

**Versión:** 1.0  
**Alcance:** `RepoTecnico/propuesta_vNext/` (Fase 1 — Concepto / propuesta de arquitectura)  
**Objetivo:** Determinar si la propuesta vNext está lista para pasar a Fase 2 (Casos de Uso / Diseño detallado).  
**Veredicto:** **NO LISTA**. Existen bloqueadores de severidad CRÍTICA y ALTA que deben resolverse antes de avanzar.

---

## 1. Resumen Ejecutivo

La propuesta vNext introduce de forma ambiciosa el acceso on-chain para Jefe de Mantenimiento y Ama de llaves, nuevos flujos de bloqueo/inspección/cargos por daños, terminales fijos con PIN y un contrato auxiliar `HotelOperations.sol`. Sin embargo, tras la auditoría con 7 lentes y verificación adversarial, se detectan **3 hallazgos CRÍTICOS** y **19 hallazgos de severidad ALTA** que impiden considerarla madura para Fase 2.

### Veredicto

**NO se recomienda pasar a Fase 2 / Casos de Uso hasta que se resuelvan los bloqueadores CRÍTICOS y la mayoría de los ALTOS.**

### Bloqueadores principales

| Tipo | Hallazgo | Riesgo |
|------|----------|--------|
| CRÍTICO | El esquema de firmas on-chain permite estados `SIGNED`/`MINED` sin prueba criptográfica ni vínculo a rol activo. | Destruye el no repudio que justifica toda la vNext. |
| CRÍTICO | El Jefe de Mantenimiento no puede delegar ni recuperar su wallet; un solo punto de fallo paraliza operaciones críticas. | Disponibilidad comercial en riesgo. |
| CRÍTICO | El huésped no figura como actor afectado por cargos por daños y bloqueos. | Riesgo legal/operativo de cobros sin aviso ni reclamación. |

### Métricas consolidadas

| Severidad | Hallazgos |
|-----------|-----------|
| CRÍTICA | 3 |
| ALTA | 19 |
| MEDIA | 13 |
| BAJA | 4 |
| **Total** | **39** |

Los 39 hallazgos provienen de la consolidación de 50 hallazgos verificados iniciales (R1-R7), eliminando duplicados entre dimensiones y manteniendo la severidad más alta.

---

## 2. Metodología

Se aplicó el protocolo de auditoría en 3 fases y 7 lentes:

### Fase 1 — Revisión (7 revisores en paralelo)

Cada revisor aplicó un lente específico sobre los artefactos de `RepoTecnico/propuesta_vNext/`:

| Lente | Enfoque |
|-------|---------|
| **R1 — Ambigüedad y testabilidad** | Términos vagos, criterios no medibles, imposibilidad de escribir tests de aceptación deterministas. |
| **R2 — Consistencia** | Contradicciones internas entre requerimientos, diccionario de datos, diagrama ER y SQL. |
| **R3 — Completitud RNF (ISO 25010)** | Categorías de requisitos no funcionales ausentes o insuficientes. |
| **R4 — Stakeholders** | Actores ausentes o con rol mal definido. |
| **R5 — Trazabilidad con el brief** | Requisitos añadidos sin base en la solicitud del cliente y deseos perdidos. |
| **R6 — Riesgos técnicos** | Puntos únicos de fallo, riesgos de escalabilidad, concurrencia y resiliencia. |
| **R7 — Seguridad y legal** | Controles de acceso, PII/GDPR, integridad de firmas, gobernanza de feature flags. |

### Fase 2 — Verificación adversarial

Cada lente fue revisado por un verificador que:

- Contrastó los hallazgos contra el código y documentación real.
- Filtró falsos positivos.
- Deduplicó hallazgos intra-dimensión.
- Ajustó severidades con evidencia.
- **Descartó ante la duda** cualquier hallazgo no confirmable.

### Fase 3 — Síntesis

Se consolidaron los hallazgos supervivientes de las 7 dimensiones:

- Deduplicación cruzada entre lentes.
- Asignación de identificadores únicos `H-01` a `H-39`.
- Priorización por severidad (CRÍTICA > ALTA > MEDIA > BAJA).
- Generación de plan de acción con esfuerzo S/M/L.

**Artefactos auditados:**

- [RepoTecnico/propuesta_vNext/requerimientos.md](RepoTecnico/propuesta_vNext/requerimientos.md)
- [RepoTecnico/propuesta_vNext/diccionario_datos.md](RepoTecnico/propuesta_vNext/diccionario_datos.md)
- [RepoTecnico/propuesta_vNext/base_datos.sql](RepoTecnico/propuesta_vNext/base_datos.sql)
- [RepoTecnico/propuesta_vNext/diagrama_er.md](RepoTecnico/propuesta_vNext/diagrama_er.md)
- [RepoTecnico/propuesta_vNext/entornos_globales.md](RepoTecnico/propuesta_vNext/entornos_globales.md)
- [RepoTecnico/estado_proyecto.md](RepoTecnico/estado_proyecto.md)
- [RepoTecnico/proceso_propuesto_bloque3.md](RepoTecnico/proceso_propuesto_bloque3.md)

---

## 3. Tabla de Hallazgos por Severidad

| ID | Severidad | Área | Título |
|----|-----------|------|--------|
| H-01 | ALTA | Autenticación / terminales fijos | PIN corto de terminales sin política de seguridad ni defensas contra fuerza bruta |
| H-02 | ALTA | Configuración / áreas críticas | `CRITICAL_AREA_CODES` desajustado respecto a la semilla de `maintenance_area_types` |
| H-03 | ALTA | Modelo de datos / cargos | Cargo por daños modelado en dos tablas y permite firmas en estado inválido |
| H-04 | MEDIA | Trazabilidad con brief / cargos | Cargo por daños con firma on-chain obligatoria pese a `D-C11` (nota interna) |
| H-05 | ALTA | Modelo de datos / firmas | `maintenance_area_logs` tiene `signature_id` pero no existe `entity_type` válido en `on_chain_signatures` |
| H-06 | ALTA | Lógica de negocio / inspecciones | Inspección se justifica como habilitante de disponibilidad pero la decisión confirmada dice lo contrario |
| H-07 | ALTA | Arquitectura / cola de firmas | Cola de anclaje on-chain no modelada; timeout, reintentos y backoff sin definir |
| H-08 | ALTA | Arquitectura / sincronización | Sin mecanismo de compensación ante fallo de anclaje después de actualizar la BD |
| H-09 | ALTA | Escalabilidad / concurrencia | Ausencia de gestión de nonces para wallets de jefes |
| H-10 | CRÍTICA | Firmas on-chain / no repudio | Esquema de firmas permite estados `SIGNED`/`MINED` sin prueba criptográfica ni vínculo a rol activo |
| H-11 | ALTA | Gobernanza / feature flags | Feature flags permiten desactivar en producción firmas declaradas obligatorias |
| H-12 | ALTA | Integridad del modelo / inspecciones | `housekeeping_inspections.signature_id` es nullable pese a firma obligatoria para aprobaciones |
| H-13 | CRÍTICA | Seguridad / ciclo de vida de wallets | Jefe de Mantenimiento no puede delegar ni recuperar su wallet; falta custodia, rotación y backup |
| H-14 | ALTA | Seguridad / revocación | Revocación de wallets en BD no garantiza revocación on-chain ni trazabilidad histórica |
| H-15 | ALTA | PII / GDPR | PII de operarios y evidencia fotográfica sin clasificación ni medidas de protección |
| H-16 | ALTA | Control de acceso / terminales | `terminal_operators.created_by` carece de integridad referencial con supervisores |
| H-17 | ALTA | RNF / observabilidad | Ausencia de RNF de observabilidad y monitoreo operativo |
| H-18 | ALTA | RNF / backup | Backup y recuperación ante desastres no contemplados |
| H-19 | MEDIA | RNF / accesibilidad | Requisito de accesibilidad limitado a "usable desde móvil" |
| H-20 | MEDIA | RNF / usabilidad | Usabilidad solo cubre flujo de firma, no terminales de campo |
| H-21 | MEDIA | RNF / fiabilidad | No se define tolerancia a fallos de terminales ni desconexión móvil |
| H-22 | MEDIA | RNF / cumplimiento | Cumplimiento normativo y auditoría insuficientemente detallado |
| H-23 | ALTA | RNF / rendimiento | "Tiempo real" y "listados < 1 s" sin carga, percentiles ni ámbito definidos |
| H-24 | MEDIA | Ambigüedad / firma on-chain | "Mostrar claramente" no es un criterio de aceptación medible |
| H-25 | MEDIA | Ambigüedad / suministros | "Alerta de umbral crítico" no define umbral ni canal de alerta |
| H-26 | MEDIA | Ambigüedad / configuración | "Firma recomendada / opcional configurable" no determina cuándo se exige |
| H-27 | MEDIA | Ambigüedad / permisos | "Lectura limitada" no especifica qué puede ver el técnico de mantenimiento |
| H-28 | BAJA | Ambigüedad / extensibilidad | "Sin redeploy masivo" no cuantifica qué tipo de despliegue es aceptable |
| H-29 | MEDIA | Consistencia / referencias | Diccionario cita `D-C8` que no existe en la tabla de decisiones confirmadas |
| H-30 | MEDIA | Consistencia / vocabularios | `maintenance_incidents.reported_by_role` declara vocabulario cerrado pero SQL no lo refuerza |
| H-31 | ALTA | Trazabilidad / firma obligatoria | Propuesta impone firma on-chain obligatoria para bloqueos, inspecciones y cargos sin base explícita en el brief |
| H-32 | ALTA | Trazabilidad / contratos | Creación de `HotelOperations.sol` no aparece en la solicitud de vNext |
| H-33 | BAJA | Trazabilidad / rutas | Cambio de ruta `/housekeeping` a `/ama-de-llaves` sin justificación |
| H-34 | BAJA | Trazabilidad / alcance | Propuesta añade informes y notificaciones no presentes en la solicitud |
| H-35 | BAJA | Trazabilidad / autenticación | Propuesta impone autenticación SIWE/EIP-4361 para jefes sin base en el brief |
| H-36 | CRÍTICA | Stakeholders | Huésped no figura como actor afectado por cargos por daños y bloqueos |
| H-37 | ALTA | Stakeholders | No existe actor de soporte u operador de infraestructura para cola de firmas y terminales |
| H-38 | MEDIA | Stakeholders | Recepción tiene acciones críticas en vNext pero su rol no está actualizado en la matriz de firmas |
| H-39 | MEDIA | Stakeholders / riesgos | Técnicos y camareras carecen de timeout/escalación si el jefe no valida sus acciones |

---

## 4. Hallazgos Detallados

### H-10 — CRÍTICA — Firmas on-chain / no repudio

**Título:** Esquema de firmas on-chain permite estados `SIGNED`/`MINED` sin prueba criptográfica ni vínculo a rol activo.

**Detalle:** `on_chain_signatures` almacena `signature TEXT NULL` y `signer_address VARCHAR(42) NOT NULL`, pero no impone que `signature` sea no nula cuando `status` es `SIGNED`/`MINED`, ni que `signer_address` corresponda a una fila activa de `operator_wallets` con rol `HEAD_*`. No existe validación de que el rol de la wallet coincida con el `entity_type` firmado, ni que la wallet esté activa en el momento de la firma. La recuperación del signer y la validación EIP-191/EIP-712 no aparecen en el diccionario ni en el SQL.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/base_datos.sql:83-100](RepoTecnico/propuesta_vNext/base_datos.sql#L83-L100) — `signature` es `NULL` sin `CHECK` por estado.
- [RepoTecnico/propuesta_vNext/diccionario_datos.md:89-103](RepoTecnico/propuesta_vNext/diccionario_datos.md#L89-L103) — campos sin validación criptográfica ni de rol.
- [RepoTecnico/propuesta_vNext/requerimientos.md:75-84](RepoTecnico/propuesta_vNext/requerimientos.md#L75-L84) — firma obligatoria pero sin mecanismo de verificación en el modelo.
- [RepoTecnico/propuesta_vNext/base_datos.sql:83-105](RepoTecnico/propuesta_vNext/base_datos.sql#L83-L105) — `signer_address` sin FK ni `CHECK` hacia `operator_wallets`.

**Recomendación:**

1. Añadir `CHECK (signature IS NOT NULL WHEN status IN ('SIGNED','MINED'))`.
2. Añadir clave foránea de `signer_address` a `operator_wallets.wallet_address` con `is_active = TRUE`.
3. Definir validación de dominio que verifique que el rol de la wallet (`HEAD_MAINTENANCE`/`HEAD_KEEPER`) es compatible con el `entity_type` firmado.
4. Documentar en requisitos la recuperación del signer y validación EIP-191/EIP-712 antes de cualquier transición a `SIGNED`.

---

### H-13 — CRÍTICA — Seguridad / ciclo de vida de wallets

**Título:** Jefe de Mantenimiento no puede delegar ni recuperar su wallet; falta custodia, rotación y backup.

**Detalle:** `D-C6` confirma explícitamente que el Jefe de Mantenimiento firma siempre él mismo y que no se implementa delegación temporal on-chain ni off-chain. Si la wallet se pierde, es comprometida o el titular no está disponible, los bloqueos/desbloqueos de habitaciones (`RF-M-03`, `RF-M-05`) y las verificaciones de tareas críticas se detienen. La propuesta no documenta procedimiento de recuperación, wallet de respaldo, rotación de claves, generación segura (HSM/keystore), 2FA para acciones críticas ni quién dentro de la administración audita las altas/bajas de wallets.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/requerimientos.md:172](RepoTecnico/propuesta_vNext/requerimientos.md#L172) — `D-C6`: "siempre firma él mismo; no hay delegación temporal".
- [RepoTecnico/propuesta_vNext/requerimientos.md:47, :49](RepoTecnico/propuesta_vNext/requerimientos.md#L47-L49) — `RF-M-03`, `RF-M-05` firma obligatoria.
- [RepoTecnico/propuesta_vNext/requerimientos.md:36](RepoTecnico/propuesta_vNext/requerimientos.md#L36) — principio de jefes como únicos firmantes.
- [RepoTecnico/propuesta_vNext/diccionario_datos.md:64-79](RepoTecnico/propuesta_vNext/diccionario_datos.md#L64-L79) y [base_datos.sql:64-75](RepoTecnico/propuesta_vNext/base_datos.sql#L64-L75) — `operator_wallets` tiene `assigned_by` y `revoked_at` pero no proceso de custodia/recuperación.

**Recomendación:**

1. Diseñar mecanismo de delegación de emergencia (rol temporal on-chain con caducidad automática) o wallet multifirma/custodia compartida.
2. Definir un rol de Custodio de claves (p. ej. Administrador con procedimiento de 2-personas) y documentar el ciclo de vida completo: solicitud, aprobación, aceptación por el jefe, generación segura, backup cifrado, rotación periódica, revocación ante baja/robo y recuperación.
3. Añadir RNF de seguridad sobre generación segura de claves, rotación y 2FA para acciones críticas.

---

### H-36 — CRÍTICA — Stakeholders

**Título:** Huésped no figura como actor afectado por cargos por daños y bloqueos.

**Detalle:** La propuesta introduce cargos por daños (`RF-K-08`) y bloqueos de habitación que impactan directamente al huésped, pero no lo modela como actor, no define notificación, consentimiento ni derecho a evidencia. Aunque `D-C8` establece que el cargo se comunica en check-out como nota interna, ello no elimina el riesgo legal/operativo de cobrar a un huésped sin flujo de aviso previo ni posibilidad de reclamación documentada.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/requerimientos.md:24-34](RepoTecnico/propuesta_vNext/requerimientos.md#L24-L34) — tabla de actores no incluye huésped.
- [RepoTecnico/propuesta_vNext/diccionario_datos.md:224-241](RepoTecnico/propuesta_vNext/diccionario_datos.md#L224-L241) — `housekeeping_damage_charges` vincula cargo a token pero no al huésped.
- [RepoTecnico/propuesta_vNext/requerimientos.md:69-70](RepoTecnico/propuesta_vNext/requerimientos.md#L69-L70) — `RF-K-08`: cargo por daños con firma obligatoria sin notificación al huésped.
- [RepoTecnico/propuesta_vNext/requerimientos.md:178-180](RepoTecnico/propuesta_vNext/requerimientos.md#L178-L180) — `D-C8`: cargo comunicado solo en check-out como nota interna.

**Recomendación:**

1. Añadir el actor Huésped en la tabla de stakeholders.
2. Definir quién y cuándo se le notifica de un cargo por daños, cómo se le presenta la evidencia (foto/descripción) y si debe existir aceptación explícita o vía reclamación antes del check-out.
3. Revisar `D-C8` con el cliente si la notificación previa es obligatoria legalmente.

---

### H-01 — ALTA — Autenticación / terminales fijos

**Título:** PIN corto de terminales sin política de seguridad ni defensas contra fuerza bruta.

**Detalle:** Técnicos y camareras se autentican con un "PIN corto", pero ni los requisitos ni el diccionario ni el SQL definen longitud, complejidad, límite de intentos fallidos, bloqueo temporal, rotación periódica ni registro de intentos. `terminal_operators.pin_hash` es `TEXT` sin restricción. Un terminal físico compartido con PIN corto y sin rate-limit es vulnerable a fuerza bruta y observación.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/requerimientos.md:179](RepoTecnico/propuesta_vNext/requerimientos.md#L179) — autenticación por PIN corto.
- [RepoTecnico/propuesta_vNext/diccionario_datos.md:28, :36](RepoTecnico/propuesta_vNext/diccionario_datos.md#L28-L36) — `pin_hash` sin política.
- [RepoTecnico/propuesta_vNext/base_datos.sql:42-54](RepoTecnico/propuesta_vNext/base_datos.sql#L42-L54) — columna `pin_hash TEXT` sin restricción.

**Recomendación:** Especificar longitud mínima (6-8 dígitos), retardo exponencial/bloqueo tras N intentos fallidos, rotación forzada, hash fuerte (coste bcrypt documentado) y tabla/log de intentos de autenticación.

---

### H-02 — ALTA — Configuración / áreas críticas

**Título:** `CRITICAL_AREA_CODES` desajustado respecto a la semilla de `maintenance_area_types`.

**Detalle:** `entornos_globales.md` define `CRITICAL_AREA_CODES=POOL_FILTER,WATER_PUMP,ELEVATOR,ELECTRIC_GENERATOR`, pero la semilla de `maintenance_area_types` incluye `POOL`, `WATER_PUMP`, `PLUMBING`, `ELECTRICITY`, `HVAC`, `WASTE`, `ELEVATOR`. No existen `POOL_FILTER` ni `ELECTRIC_GENERATOR` en el catálogo. Como la lógica de firma obligatoria para tareas preventivas críticas depende de estos códigos, las tareas de áreas críticas reales (`POOL`, `ELECTRICITY`) no se marcarán como `requires_signature=TRUE`.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/entornos_globales.md:23](RepoTecnico/propuesta_vNext/entornos_globales.md#L23) — `CRITICAL_AREA_CODES`.
- [RepoTecnico/propuesta_vNext/base_datos.sql:162-172](RepoTecnico/propuesta_vNext/base_datos.sql#L162-L172) — semilla de áreas.
- [RepoTecnico/propuesta_vNext/requerimientos.md:169](RepoTecnico/propuesta_vNext/requerimientos.md#L169) — `D-C3` lista de áreas críticas.

**Recomendación:** Alinear `CRITICAL_AREA_CODES` con los códigos reales del catálogo o, preferiblemente, mover la lista de áreas críticas a la columna `is_critical` de `maintenance_area_types` y que la aplicación la lea de la BD como única fuente de verdad.

---

### H-03 — ALTA — Modelo de datos / cargos

**Título:** Cargo por daños modelado en dos tablas y permite firmas en estado inválido.

**Detalle:** `maintenance_incidents` añade campos `damage_charge_cents`, `damage_charge_currency` y `damage_charge_approved_by` sin vínculo a firma on-chain, mientras que `housekeeping_damage_charges` exige `signature_id NOT NULL` con `ON DELETE RESTRICT`, pero no impide que la firma referenciada tenga estado `FAILED`, `PENDING` o `REVOKED`. El modelo dual genera ambigüedad sobre la fuente de verdad y permite registrar un cargo económico sin prueba on-chain válida, violando `RF-S-04` y el principio de no repudio.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/requerimientos.md:69, :79, :156](RepoTecnico/propuesta_vNext/requerimientos.md#L69-L79) — `RF-K-08`, `RF-S-04`, `D-V5`.
- [RepoTecnico/propuesta_vNext/diccionario_datos.md:183-185, :230-240](RepoTecnico/propuesta_vNext/diccionario_datos.md#L183-L240) — modelo dual.
- [RepoTecnico/propuesta_vNext/base_datos.sql:187-193, :272-284](RepoTecnico/propuesta_vNext/base_datos.sql#L187-L284) — `maintenance_incidents` con cargo y `housekeeping_damage_charges` sin `CHECK` de estado de firma.

**Recomendación:**

1. Eliminar los campos de cargo de `maintenance_incidents` y centralizar todo cargo por daños en `housekeeping_damage_charges`.
2. Añadir restricción `CHECK` o trigger que exija `on_chain_signatures.status IN ('SIGNED','MINED')` para crear/aprobar un cargo.
3. Si el cargo de incidencia es un caso separado, documentar la regla y añadir `signature_id` también a `maintenance_incidents`.

---

### H-05 — ALTA — Modelo de datos / firmas

**Título:** `maintenance_area_logs` tiene `signature_id` pero no existe `entity_type` válido en `on_chain_signatures`.

**Detalle:** El diagrama ER relaciona `on_chain_signatures` con `maintenance_area_logs` y el SQL vNext crea la FK. Sin embargo, el enum `entity_type` solo admite `ROOM_BLOCK`, `ROOM_UNBLOCK`, `INSPECTION`, `DAMAGE_CHARGE`, `PREVENTIVE_TASK`. No existe un valor válido para registrar la firma de un log de área común, forzando a reusar un tipo semánticamente incorrecto.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/diagrama_er.md:50, :69, :107-117](RepoTecnico/propuesta_vNext/diagrama_er.md#L50-L117)
- [RepoTecnico/propuesta_vNext/base_datos.sql:83-100, :146-156](RepoTecnico/propuesta_vNext/base_datos.sql#L83-L156)
- [RepoTecnico/propuesta_vNext/diccionario_datos.md:90, :159](RepoTecnico/propuesta_vNext/diccionario_datos.md#L90-L159)

**Recomendación:** Añadir un valor `AREA_LOG` (o equivalente) al enum `entity_type`, o eliminar `signature_id` de `maintenance_area_logs` si las tareas rutinarias de áreas comunes no se firman on-chain.

---

### H-06 — ALTA — Lógica de negocio / inspecciones

**Título:** Inspección se justifica como habilitante de disponibilidad pero la decisión confirmada dice lo contrario.

**Detalle:** En [requerimientos.md:136](RepoTecnico/propuesta_vNext/requerimientos.md#L136) la regla de oro de firma incluye "certifica un resultado que habilita el siguiente proceso crítico (inspección → disponible)". Sin embargo, la pregunta resuelta en [requerimientos.md:178](RepoTecnico/propuesta_vNext/requerimientos.md#L178) establece que tras inspección aprobada "la venta de noches futuras no se libera automáticamente; debe activarla Recepción o Administración manualmente". Esto contradice la justificación de firma obligatoria de `RF-K-05`/`RF-S-03`.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/requerimientos.md:127, :136, :178](RepoTecnico/propuesta_vNext/requerimientos.md#L127-L178)

**Recomendación:** Aclarar si la inspección habilita realmente la disponibilidad comercial o solo registra un estado operativo. Si Recepción/Administración debe liberar las ventas manualmente, la firma on-chain debería asociarse a esa liberación y no (solo) a la inspección.

---

### H-07 — ALTA — Arquitectura / cola de firmas

**Título:** Cola de anclaje on-chain no modelada; timeout, reintentos y backoff sin definir.

**Detalle:** `RNF-M-03` y `D-V8` exigen una cola de anclaje con reintentos y un estado `pending_anchor` cuando la cadena falla. El esquema SQL solo contiene `on_chain_signatures` con estados `PENDING/SIGNED/MINED/FAILED/REVOKED`; no existe tabla de trabajos de anclaje, contador de reintentos, backoff, TTL ni columna `pending_anchor` en las entidades operativas. Tampoco se definen timeout de RPC, número máximo de reintentos, política de backoff ni acción final tras agotarlos.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/requerimientos.md:94, :159](RepoTecnico/propuesta_vNext/requerimientos.md#L94-L159) — `RNF-M-03`, `D-V8`.
- [RepoTecnico/propuesta_vNext/entornos_globales.md:17](RepoTecnico/propuesta_vNext/entornos_globales.md#L17) — solo `OPERATIONAL_SIGNATURE_RETRY_MS = 30000`.
- [RepoTecnico/propuesta_vNext/base_datos.sql:83-105](RepoTecnico/propuesta_vNext/base_datos.sql#L83-L105) — `on_chain_signatures` sin campos de cola/reintento.

**Recomendación:** Añadir tabla de trabajos de anclaje (`operational_signature_jobs`) con `retry_count`, `next_attempt_at`, `backoff` y estado; o extender `on_chain_signatures`; reflejar `pending_anchor` en las tablas afectadas. Definir timeout de RPC, número máximo de reintentos, política de backoff, TTL máximo en cola y acción final.

---

### H-08 — ALTA — Arquitectura / sincronización

**Título:** Sin mecanismo de compensación ante fallo de anclaje después de actualizar la BD.

**Detalle:** `D-V4`, `D-V7` y `D-V8` indican que estados críticos de habitación se actualizan primero en BD (`publication_status`/`operational_status`) y luego on-chain. Si la transacción on-chain falla o queda pendiente, no se define si se revierte el cambio en BD, se bloquea la habitación indefinidamente o se permite operar con estado desfasado. Tampoco se menciona manejo de reorgs de cadena.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/requerimientos.md:156-159](RepoTecnico/propuesta_vNext/requerimientos.md#L156-L159) — `D-V4`, `D-V7`, `D-V8`.
- [RepoTecnico/propuesta_vNext/base_datos.sql:236-248](RepoTecnico/propuesta_vNext/base_datos.sql#L236-L248) — campos de `rooms`.

**Recomendación:** Definir máquina de estados transaccional (cambio en BD solo tras `MINED` con umbral de confirmaciones, o patrón saga con compensación explícita) e incluir manejo de reorgs en el worker de operaciones.

---

### H-09 — ALTA — Escalabilidad / concurrencia

**Título:** Ausencia de gestión de nonces para wallets de jefes.

**Detalle:** `operator_wallets` y `on_chain_signatures` no incluyen campo de nonce ni control de secuencia. Si los jefes firman varias acciones concurrentes, las transacciones pueden competir por el mismo nonce, quedarse atascadas o requerir reemplazo (RBF) sin mecanismo definido.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/base_datos.sql:64-79](RepoTecnico/propuesta_vNext/base_datos.sql#L64-L79) — `operator_wallets` sin nonce.
- [RepoTecnico/propuesta_vNext/base_datos.sql:83-105](RepoTecnico/propuesta_vNext/base_datos.sql#L83-L105) — `on_chain_signatures` sin nonce ni secuencia.

**Recomendación:** Incluir nonce en `on_chain_signatures` (o tabla de transacciones pendientes) y serializar la emisión de transacciones por wallet mediante cola por cuenta, con reintentos controlados y detección de tx stuck.

---

### H-11 — ALTA — Gobernanza / feature flags

**Título:** Feature flags permiten desactivar en producción firmas declaradas obligatorias.

**Detalle:** Las variables `ENABLE_OPERATIONAL_SIGNATURES`, `MAINTENANCE_BLOCK_REQUIRES_SIGNATURE`, `INSPECTION_REQUIRES_SIGNATURE` y `DAMAGE_CHARGE_REQUIRES_SIGNATURE` pueden configurarse a `false`. Si en producción se desactivan, se rompen los requisitos obligatorios `RF-S-02`, `RF-S-03`, `RF-S-04` y la trazabilidad legal sin modificar contrato ni BD.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/entornos_globales.md:13-23](RepoTecnico/propuesta_vNext/entornos_globales.md#L13-L23)
- [RepoTecnico/propuesta_vNext/requerimientos.md:47-49, :65-69, :77-84](RepoTecnico/propuesta_vNext/requerimientos.md#L47-L84)

**Recomendación:** Diferenciar flags de desarrollo/test vs producción; en producción las firmas obligatorias deben ser inmutables o requerir doble autorización administrativa con alerta de seguridad si se desactivan.

---

### H-12 — ALTA — Integridad del modelo / inspecciones

**Título:** `housekeeping_inspections.signature_id` es nullable pese a firma obligatoria para aprobaciones.

**Detalle:** `RF-K-05` y `RF-S-03` exigen firma on-chain obligatoria para certificar inspecciones. Sin embargo `housekeeping_inspections.signature_id` es `UUID NULL`, permitiendo insertar una inspección `APPROVED` sin firma.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/base_datos.sql:252-266](RepoTecnico/propuesta_vNext/base_datos.sql#L252-L266) — `signature_id UUID NULL`.
- [RepoTecnico/propuesta_vNext/requerimientos.md:66, :79](RepoTecnico/propuesta_vNext/requerimientos.md#L66-L79) — `RF-K-05`, `RF-S-03`.

**Recomendación:** Hacer `signature_id NOT NULL` cuando `result = 'APPROVED'` mediante `CHECK` o validación de aplicación, y rechazar aprobaciones sin firma on-chain confirmada.

---

### H-14 — ALTA — Seguridad / revocación

**Título:** Revocación de wallets en BD no garantiza revocación on-chain ni trazabilidad histórica.

**Detalle:** `operator_wallets` tiene `revoked_at` e `is_active`, pero no hay proceso documentado que revoque el rol correspondiente en `HotelOperations.sol` antes de marcar la fila. La relación con `admin_users` es por `username` (no por UUID), permitiendo inconsistencias si cambia el username o se recicla. No existe histórico de wallets asignadas a un mismo usuario.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/diccionario_datos.md:64-79](RepoTecnico/propuesta_vNext/diccionario_datos.md#L64-L79)
- [RepoTecnico/propuesta_vNext/base_datos.sql:64-78](RepoTecnico/propuesta_vNext/base_datos.sql#L64-L78)
- [RepoTecnico/propuesta_vNext/diagrama_er.md:37-46](RepoTecnico/propuesta_vNext/diagrama_er.md#L37-L46)

**Recomendación:** Vincular `operator_wallets` con `admin_users.id`, añadir tabla de histórico de wallets, y definir proceso atómico: revocar rol on-chain antes de marcar `revoked_at`, con verificación de la transacción.

---

### H-15 — ALTA — PII / GDPR

**Título:** PII de operarios y evidencia fotográfica sin clasificación ni medidas de protección.

**Detalle:** `terminal_operators.full_name` es PII directa; `maintenance_area_logs.evidence_path`, `preventive_tasks.evidence_path` y `housekeeping_damage_charges.evidence_path` apuntan a fotos que pueden contener metadatos EXIF/GPS. `RNF-M-07` solo prohíbe PII on-chain, pero no se modela clasificación, cifrado en reposo/tránsito, control de acceso a evidencias, stripping de metadatos ni plazos de retención/borrado conforme al GDPR.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/diccionario_datos.md:34](RepoTecnico/propuesta_vNext/diccionario_datos.md#L34) — `full_name`.
- [RepoTecnico/propuesta_vNext/diccionario_datos.md:156, :204, :237](RepoTecnico/propuesta_vNext/diccionario_datos.md#L156-L237) — `evidence_path`.
- [RepoTecnico/propuesta_vNext/requerimientos.md:97-99](RepoTecnico/propuesta_vNext/requerimientos.md#L97-L99) — `RNF-M-07` sin medidas off-chain.

**Recomendación:** Añadir requisito de clasificación de datos, cifrado de PII en reposo, control de acceso a evidencias (URLs firmadas con expiración), stripping de EXIF y política de conservación/borrado.

---

### H-16 — ALTA — Control de acceso / terminales

**Título:** `terminal_operators.created_by` carece de integridad referencial con supervisores.

**Detalle:** `terminal_operators.created_by` es un `VARCHAR(100)` sin FK ni constraint; la relación con `admin_users` es solo lógica por `username`. No se garantiza que quien da de alta sea un `HEAD_MAINTENANCE`, `HEAD_KEEPER` o `DEFAULT_ADMIN_ROLE` activo.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/diccionario_datos.md:28-38](RepoTecnico/propuesta_vNext/diccionario_datos.md#L28-L38) — `created_by` sin FK.
- [RepoTecnico/propuesta_vNext/base_datos.sql:42-54](RepoTecnico/propuesta_vNext/base_datos.sql#L42-L54) — sin FK a `admin_users` ni check de rol.

**Recomendación:** Añadir FK real a `admin_users(id)` o trigger/constraint que verifique `created_by` contra un usuario activo con rol suficiente, y documentar la regla de negocio de alta de operarios.

---

### H-17 — ALTA — RNF / observabilidad

**Título:** Ausencia de RNF de observabilidad y monitoreo operativo.

**Detalle:** La propuesta no define requisitos de logging estructurado, métricas, trazas ni alertas para operaciones críticas. Tampoco especifica monitoreo del saldo de gas de wallets, profundidad/retraso de la cola de anclajes, salud del contrato ni sincronización BD-cadena.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/requerimientos.md:88-100](RepoTecnico/propuesta_vNext/requerimientos.md#L88-L100) — `RNF-M-01…M-08` sin observabilidad.
- [RepoTecnico/propuesta_vNext/entornos_globales.md:9-24](RepoTecnico/propuesta_vNext/entornos_globales.md#L9-L24) — sin métricas/logs/alertas.

**Recomendación:** Añadir RNF de observabilidad: IDs de correlación, logs estructurados por firma, métricas de cola de anclajes, dashboards de habitaciones bloqueadas/inspecciones y alertas de error/minado fallido; monitoreo de gas, tamaño/retraso de cola y firma `PENDING` más de X minutos.

---

### H-18 — ALTA — RNF / backup

**Título:** Backup y recuperación ante desastres no contemplados.

**Detalle:** No existen RNF ni decisiones de arquitectura sobre respaldo y recuperación de estados de habitación, registros de firmas on-chain pendientes/fallidas, evidencia fotográfica ni cola de anclajes. `on_chain_signatures` registra estados pero no define política de retención o respaldo.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/requerimientos.md:88-100](RepoTecnico/propuesta_vNext/requerimientos.md#L88-L100)
- [RepoTecnico/propuesta_vNext/diccionario_datos.md:82-103](RepoTecnico/propuesta_vNext/diccionario_datos.md#L82-L103) — `on_chain_signatures` sin política de retención/respaldo.
- [RepoTecnico/propuesta_vNext/entornos_globales.md:9-24](RepoTecnico/propuesta_vNext/entornos_globales.md#L9-L24) — sin variables de backup.

**Recomendación:** Incluir RNF de backup: RPO/RTO para BD y almacenamiento de evidencias, replicación de firmas, procedimiento de recuperación de cola de anclajes y retención de logs de auditoría.

---

### H-23 — ALTA — RNF / rendimiento

**Título:** "Tiempo real" y "listados < 1 s" sin carga, percentiles ni ámbito definidos.

**Detalle:** `RNF-M-05` exige tableros en "tiempo real" y "listados < 1 s", sin especificar qué listados, volumen de datos, usuarios concurrentes ni percentiles (`p50`/`p95`/`p99`). `RF-K-02` repite "tiempo real" para el estado operativo de habitaciones.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/requerimientos.md:63, :96](RepoTecnico/propuesta_vNext/requerimientos.md#L63-L96)

**Recomendación:** Reemplazar "tiempo real" por latencias medibles (p. ej. `p95 < 500 ms` para cambios de estado visibles en el tablero), indicar listados concretos, tamaño de página máximo, escenario de carga objetivo y percentiles.

---

### H-31 — ALTA — Trazabilidad / firma obligatoria

**Título:** Propuesta impone firma on-chain obligatoria para bloqueos, inspecciones y cargos sin base explícita en el brief.

**Detalle:** La solicitud de vNext pide "acceso on-chain para firmar movimientos" y "analizando cuáles son obligatoriamente con wallet y cuáles no". Las decisiones confirmadas acuerdan roles con wallets diferentes y firma obligatoria en áreas críticas (`D-C3`), pero no declaran obligatoriedad on-chain para bloqueo/desbloqueo de habitaciones, inspecciones ni cargos por daños. La propuesta las cataloga como obligatorias.

**Evidencia:**

- [RepoTecnico/estado_proyecto.md:3286, :3301-3312](RepoTecnico/estado_proyecto.md#L3286-L3312)
- [RepoTecnico/propuesta_vNext/requerimientos.md:45-49, :65-69, :77-84](RepoTecnico/propuesta_vNext/requerimientos.md#L45-L84)

**Recomendación:** Solicitar confirmación explícita del cliente para cada movimiento obligatorio con firma on-chain; documentar la opción off-chain/configurable si el cliente prefiere no pagar gas por esas operaciones.

---

### H-32 — ALTA — Trazabilidad / contratos

**Título:** Creación de `HotelOperations.sol` no aparece en la solicitud de vNext.

**Detalle:** La solicitud del cliente solo pide "acceso on-chain para firmar movimientos". La propuesta decide crear un nuevo contrato `HotelOperations.sol` para eventos de mantenimiento, inspecciones y cargos. Es una decisión de arquitectura del equipo que amplía el alcance de despliegue, seguridad y operación.

**Evidencia:**

- [RepoTecnico/estado_proyecto.md:3286, :3302](RepoTecnico/estado_proyecto.md#L3286-L3302)
- [RepoTecnico/propuesta_vNext/requerimientos.md:152-159](RepoTecnico/propuesta_vNext/requerimientos.md#L152-L159) — `D-V1`.

**Recomendación:** Validar con el cliente si acepta la complejidad de un contrato adicional, o si prefiere reutilizar/anclar eventos en el contrato existente; registrar la decisión como ADR.

---

### H-37 — ALTA — Stakeholders

**Título:** No existe actor de soporte u operador de infraestructura para cola de firmas y terminales.

**Detalle:** La propuesta incluye cola de anclajes on-chain, terminales fijos con PIN y posibles fallos de firma, pero no define quién gestiona reintentos, monitoriza la cola, atiende incidencias de terminales ni recupera PINs olvidados.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/entornos_globales.md:9-24](RepoTecnico/propuesta_vNext/entornos_globales.md#L9-L24) — variables de cola y worker sin actor asociado.
- [RepoTecnico/propuesta_vNext/requerimientos.md:24-34](RepoTecnico/propuesta_vNext/requerimientos.md#L24-L34) — tabla de actores no incluye soporte.
- [RepoTecnico/propuesta_vNext/base_datos.sql:83-100](RepoTecnico/propuesta_vNext/base_datos.sql#L83-L100) — `on_chain_signatures` registra estados `FAILED` pero no quién los gestiona.

**Recomendación:** Añadir actor Soporte/Técnico de infraestructura con permisos de lectura sobre `on_chain_signatures` y terminales, y definir procedimientos de escalado para firmas fallidas, caída de RPC y recuperación de acceso a terminales.

---

### H-04 — MEDIA — Trazabilidad con brief / cargos

**Título:** Cargo por daños con firma on-chain obligatoria pese a `D-C11` (nota interna).

**Detalle:** `D-C11` confirma que el cargo por daños "es nota interna y se cobra en el check-out". La propuesta lo trata como movimiento con firma on-chain obligatoria (`RF-K-08`, `RF-S-04`) y lo vincula al token/noche (`D-C4`).

**Evidencia:**

- [RepoTecnico/estado_proyecto.md:3336](RepoTecnico/estado_proyecto.md#L3336)
- [RepoTecnico/propuesta_vNext/requerimientos.md:69, :81](RepoTecnico/propuesta_vNext/requerimientos.md#L69-L81)
- [RepoTecnico/propuesta_vNext/diccionario_datos.md:224-241](RepoTecnico/propuesta_vNext/diccionario_datos.md#L224-L241)

**Recomendación:** Preguntar al cliente si el cargo por daños requiere trazabilidad on-chain o basta con auditoría off-chain vinculada al folio/estancia; alinear el modelo con `D-C11`.

---

### H-19 — MEDIA — RNF / accesibilidad

**Título:** Requisito de accesibilidad limitado a "usable desde móvil".

**Detalle:** `RNF-M-04` reduce la accesibilidad a usabilidad móvil. No se incluyen criterios de accesibilidad (WCAG 2.1 AA/AAA), contraste, navegación por teclado, lectores de pantalla ni soporte para condiciones de uso en campo.

**Evidencia:** [RepoTecnico/propuesta_vNext/requerimientos.md:95](RepoTecnico/propuesta_vNext/requerimientos.md#L95)

**Recomendación:** Ampliar `RNF-M-04` con estándar WCAG objetivo, tamaños táctiles mínimos, compatibilidad con lectores de pantalla y validación en terminales reales.

---

### H-20 — MEDIA — RNF / usabilidad

**Título:** Usabilidad solo cubre flujo de firma, no terminales de campo.

**Detalle:** Solo `RNF-M-02` define UX de firma. Faltan RNF de usabilidad para técnicos y camareras que usarán terminales fijos con PIN: tiempo máximo por tarea, número de toques, mensajes de error comprensibles, flujo offline/online y capacitación mínima.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/requerimientos.md:93](RepoTecnico/propuesta_vNext/requerimientos.md#L93) — `RNF-M-02`.
- [RepoTecnico/propuesta_vNext/requerimientos.md:179](RepoTecnico/propuesta_vNext/requerimientos.md#L179) — `D-C2` confirma terminales fijos con PIN.

**Recomendación:** Añadir RNF de usabilidad para terminales: tiempo objetivo de registro de tarea, flujo en 3 pasos o menos, mensajes en idioma del operario y manejo de errores sin términos técnicos.

---

### H-21 — MEDIA — RNF / fiabilidad

**Título:** No se define tolerancia a fallos de terminales ni desconexión móvil.

**Detalle:** `RNF-M-03` define reintentos de anclaje on-chain, pero no aborda operación de terminales sin conectividad, sincronización de estados al recuperar conexión, conflictos de concurrencia ni tolerancia a caída de PostgreSQL/Redis.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/requerimientos.md:94](RepoTecnico/propuesta_vNext/requerimientos.md#L94)
- [RepoTecnico/propuesta_vNext/diccionario_datos.md:26-44](RepoTecnico/propuesta_vNext/diccionario_datos.md#L26-L44) — `terminal_operators` sin modo offline.

**Recomendación:** Ampliar `RNF-M-03` con soporte offline de terminales con sincronización posterior, manejo de concurrencia optimista/pesimista, y degradación graceful si PostgreSQL o Redis no responden.

---

### H-22 — MEDIA — RNF / cumplimiento

**Título:** Cumplimiento normativo y auditoría insuficientemente detallado.

**Detalle:** `RNF-M-06` y `RNF-M-07` apuntan al cumplimiento, pero faltan RNF sobre retención de registros, inmutabilidad de logs off-chain, exportación/evidencia para regulador, normativa de registro de viajeros, GDPR y firma de responsabilidad de daños.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/requerimientos.md:96-98](RepoTecnico/propuesta_vNext/requerimientos.md#L96-L98)
- [RepoTecnico/propuesta_vNext/diccionario_datos.md:82-103](RepoTecnico/propuesta_vNext/diccionario_datos.md#L82-L103)

**Recomendación:** Añadir RNF de cumplimiento: periodo de retención de logs, hash de integridad de auditoría off-chain, exportación de evidencia, cumplimiento GDPR/registro de viajeros y trazabilidad de quién aprobó cada cargo por daños.

---

### H-24 — MEDIA — Ambigüedad / firma on-chain

**Título:** "Mostrar claramente" no es un criterio de aceptación medible.

**Detalle:** `RF-S-07` obliga a que el sistema "muestre claramente" qué acciones requieren firma de wallet. "Claramente" es subjetivo; no se puede automatizar su verificación sin definir elementos concretos de UI.

**Evidencia:** [RepoTecnico/propuesta_vNext/requerimientos.md:83](RepoTecnico/propuesta_vNext/requerimientos.md#L83)

**Recomendación:** Definir criterios observables: icono de cadena junto al botón, etiqueta textual, deshabilitar botón hasta conectar wallet, modal de preview de transacción; validar con test de tarea de usuario.

---

### H-25 — MEDIA — Ambigüedad / suministros

**Título:** "Alerta de umbral crítico" no define umbral ni canal de alerta.

**Detalle:** `RF-K-09` exige gestionar consumibles "con alerta de umbral crítico", pero no indica el porcentaje o cantidad que dispara la alerta, quién la configura, a quién se notifica ni cómo se cierra.

**Evidencia:** [RepoTecnico/propuesta_vNext/requerimientos.md:70](RepoTecnico/propuesta_vNext/requerimientos.md#L70)

**Recomendación:** Especificar umbral (p. ej. stock < 20 % del nivel estándar), canal de notificación, frecuencia máxima de repetición y condición de resolución.

---

### H-26 — MEDIA — Ambigüedad / configuración

**Título:** "Firma recomendada / opcional configurable" no determina cuándo se exige.

**Detalle:** `RF-M-04`, `RF-M-08` y `RF-S-05` marcan firmas como "recomendada" u "opcional configurable". No se define un mecanismo de configuración ni valores por defecto documentados.

**Evidencia:** [RepoTecnico/propuesta_vNext/requerimientos.md:49, :53, :81, :122, :123](RepoTecnico/propuesta_vNext/requerimientos.md#L49-L123)

**Recomendación:** Convertir cada firma en obligatoria/prohibida o en configuración explícita con valores por defecto documentados; incluir criterios de decisión en requisitos y reflejarlos en variables de entorno homologadas.

---

### H-27 — MEDIA — Ambigüedad / permisos

**Título:** "Lectura limitada" no especifica qué puede ver el técnico de mantenimiento.

**Detalle:** La ruta `/mantenimiento` permite acceso a `MAINTENANCE_TECH` con "lectura limitada", pero no se indica qué datos o acciones están permitidos ni cuáles están ocultos.

**Evidencia:** [RepoTecnico/propuesta_vNext/entornos_globales.md:33](RepoTecnico/propuesta_vNext/entornos_globales.md#L33)

**Recomendación:** Documentar la matriz de permisos por rol y ruta (p. ej. el técnico ve solo incidencias asignadas a él y no precios ni datos de huéspedes).

---

### H-29 — MEDIA — Consistencia / referencias

**Título:** Diccionario cita `D-C8` que no existe en la tabla de decisiones confirmadas.

**Detalle:** `diccionario_datos.md:28` justifica la tabla `terminal_operators` con la decisión confirmada `D-C8`. En `requerimientos.md` las decisiones confirmadas van solo de `D-C1` a `D-C7`.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/diccionario_datos.md:28](RepoTecnico/propuesta_vNext/diccionario_datos.md#L28)
- [RepoTecnico/propuesta_vNext/requerimientos.md:163-174, :179](RepoTecnico/propuesta_vNext/requerimientos.md#L163-L179)

**Recomendación:** Corregir la referencia del diccionario a la pregunta resuelta correspondiente o, si se considera una decisión confirmada, añadir formalmente `D-C8` a la tabla de decisiones.

---

### H-30 — MEDIA — Consistencia / vocabularios

**Título:** `maintenance_incidents.reported_by_role` declara vocabulario cerrado pero SQL no lo refuerza.

**Detalle:** El diccionario limita `reported_by_role` a `RECEPTION`, `HEAD_KEEPER`, `HOUSEKEEPER`, `HEAD_MAINTENANCE`, pero el SQL vNext crea la columna sin restricción `CHECK`. Además, `MAINTENANCE_TECH` es un actor definido en los requisitos y no queda claro si debe poder reportar averías.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/diccionario_datos.md:178](RepoTecnico/propuesta_vNext/diccionario_datos.md#L178)
- [RepoTecnico/propuesta_vNext/requerimientos.md:29](RepoTecnico/propuesta_vNext/requerimientos.md#L29)
- [RepoTecnico/propuesta_vNext/base_datos.sql:181](RepoTecnico/propuesta_vNext/base_datos.sql#L181)

**Recomendación:** Añadir un `CHECK` en `base_datos.sql` para `reported_by_role` con el vocabulario decidido, y confirmar explícitamente si `MAINTENANCE_TECH` debe poder reportar incidencias.

---

### H-38 — MEDIA — Stakeholders

**Título:** Recepción tiene acciones críticas en vNext pero su rol no está actualizado en la matriz de firmas.

**Detalle:** Recepción reporta incidencias de mantenimiento y, según decisiones resueltas, debe activar manualmente la venta tras una inspección aprobada. Sin embargo, en la matriz de obligatoriedad de firmas y en las rutas de mantenimiento no se explicitan estos permisos.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/requerimientos.md:32](RepoTecnico/propuesta_vNext/requerimientos.md#L32)
- [RepoTecnico/propuesta_vNext/requerimientos.md:178](RepoTecnico/propuesta_vNext/requerimientos.md#L178)
- [RepoTecnico/propuesta_vNext/requerimientos.md:116-131](RepoTecnico/propuesta_vNext/requerimientos.md#L116-L131)
- [RepoTecnico/propuesta_vNext/entornos_globales.md:29-39](RepoTecnico/propuesta_vNext/entornos_globales.md#L29-L39)

**Recomendación:** Actualizar el rol de Recepción en vNext: explicitar que puede reportar incidencias y activar la venta de una habitación tras mantenimiento/inspección, y añadir las rutas/permisos correspondientes.

---

### H-39 — MEDIA — Stakeholders / riesgos

**Título:** Técnicos y camareras carecen de timeout/escalación si el jefe no valida sus acciones.

**Detalle:** Los subordinados no firman on-chain; sus acciones quedan registradas off-chain y deben ser validadas por el jefe (`RF-S-06`). No se define tiempo máximo de espera, escalación a otro responsable ni qué ocurre si una tarea completada nunca es validada.

**Evidencia:**

- [RepoTecnico/propuesta_vNext/requerimientos.md:36](RepoTecnico/propuesta_vNext/requerimientos.md#L36)
- [RepoTecnico/propuesta_vNext/requerimientos.md:82](RepoTecnico/propuesta_vNext/requerimientos.md#L82)
- [RepoTecnico/propuesta_vNext/base_datos.sql:42-54](RepoTecnico/propuesta_vNext/base_datos.sql#L42-L54)

**Recomendación:** Definir SLAs de validación, estados de vencimiento (p. ej. `PENDING_VERIFICATION_EXPIRED`) y mecanismo de escalación al administrador o segundo jefe cuando se supere el umbral.

---

### H-28 — BAJA — Ambigüedad / extensibilidad

**Título:** "Sin redeploy masivo" no cuantifica qué tipo de despliegue es aceptable.

**Detalle:** `RNF-M-08` pide que el contrato permita añadir eventos "sin redeploy masivo". "Masivo" no está definido: puede interpretarse como sin redeploy alguno, con upgrade de proxy, o sin migrar estado.

**Evidencia:** [RepoTecnico/propuesta_vNext/requerimientos.md:99](RepoTecnico/propuesta_vNext/requerimientos.md#L99)

**Recomendación:** Definir el mecanismo aceptable (p. ej. upgrade de proxy UUPS con almacenamiento gap) y qué operaciones de migración de datos, si las hay, se consideran admisibles.

---

### H-33 — BAJA — Trazabilidad / rutas

**Título:** Cambio de ruta `/housekeeping` a `/ama-de-llaves` sin justificación.

**Detalle:** `D-62` acordó que la pantalla móvil del personal de limpieza vive en `/housekeeping`. La propuesta vNext propone `/ama-de-llaves` para la Suite Ama de llaves.

**Evidencia:**

- [RepoTecnico/proceso_propuesto_bloque3.md:62-64](RepoTecnico/proceso_propuesto_bloque3.md#L62-L64)
- [RepoTecnico/propuesta_vNext/entornos_globales.md:40-49](RepoTecnico/propuesta_vNext/entornos_globales.md#L40-L49)

**Recomendación:** Confirmar con el cliente si se mantiene `/housekeeping` o se adopta `/ama-de-llaves`; documentar la decisión para no romper marcadores o enlaces compartidos.

---

### H-34 — BAJA — Trazabilidad / alcance

**Título:** Propuesta añade informes y notificaciones no presentes en la solicitud.

**Detalle:** La solicitud no menciona informes de mantenimiento, informes de productividad de camareras ni notificación al Ama de llaves cuando una habitación esté lista. La propuesta los incluye como `RF-M-11`, `RF-M-12` y `RF-K-10`.

**Evidencia:**

- [RepoTecnico/estado_proyecto.md:3283-3286](RepoTecnico/estado_proyecto.md#L3283-L3286)
- [RepoTecnico/propuesta_vNext/requerimientos.md:55-56, :71](RepoTecnico/propuesta_vNext/requerimientos.md#L55-L71)

**Recomendación:** Marcarlos como "propuesta del equipo" y validar prioridad con el cliente antes de incluirlos en el alcance.

---

### H-35 — BAJA — Trazabilidad / autenticación

**Título:** Propuesta impone autenticación SIWE/EIP-4361 para jefes sin base en el brief.

**Detalle:** `RF-S-01` exige que los jefes se autentiquen con SIWE/EIP-4361 "igual que los administradores". La solicitud de vNext solo pide "acceso on-chain para firmar movimientos". El sistema actual usa contraseña + TOTP (`D-04`) y los roles de personal son sin wallet (`D-56`).

**Evidencia:**

- [RepoTecnico/propuesta_vNext/requerimientos.md:77](RepoTecnico/propuesta_vNext/requerimientos.md#L77)
- [RepoTecnico/estado_proyecto.md:301, :3286](RepoTecnico/estado_proyecto.md#L301-L3286)

**Recomendación:** Decidir si los jefes usan SIWE, contraseña+TOTP+wallet desacoplada u otro método; validar con el cliente y mantener coherencia con `D-04`/`D-56`.

---

## 5. RNF Faltantes o a Reforzar

Los siguientes requisitos no funcionales deben introducirse o completarse antes de Fase 2:

| Categoría ISO 25010 | Estado | RNF faltante / a reforzar | Hallazgos relacionados |
|---------------------|--------|---------------------------|------------------------|
| **Seguridad** | Faltante | Ciclo de vida completo de wallets: generación segura (HSM/keystore), rotación, revocación on-chain, recuperación ante pérdida de dispositivo, 2FA para acciones críticas. | H-10, H-13, H-14 |
| **Seguridad** | Faltante | Política de PIN para terminales: longitud, entropía, rate-limit, bloqueo, rotación, log de intentos. | H-01, H-16 |
| **Seguridad** | Faltante | Clasificación y protección de PII: cifrado en reposo/tránsito, control de acceso a evidencias, stripping de EXIF, retención/borrado GDPR. | H-15 |
| **Fiabilidad** | Faltante | Tolerancia a fallos de terminales: modo offline, sincronización posterior, concurrencia, degradación graceful de BD/Redis. | H-21 |
| **Rendimiento** | A reforzar | Definir SLAs medibles: usuarios concurrentes, volumen, percentiles p95/p99, frecuencia de actualización de tableros, SLA de lectura on-chain. | H-23 |
| **Observabilidad** | Faltante | Logging estructurado, métricas, trazas, dashboards, alertas de gas, cola de anclajes, firmas `PENDING` y reconciliador BD-cadena. | H-17 |
| **Mantenibilidad/Recuperación** | Faltante | Backup y recuperación: RPO/RTO para BD y evidencias, replicación de firmas, recuperación de cola de anclajes, retención de logs de auditoría. | H-18 |
| **Cumplimiento** | Faltante | Retención de registros, inmutabilidad de logs off-chain, exportación/evidencia para regulador, registro de viajeros, GDPR. | H-22 |
| **Usabilidad** | A reforzar | RNF para terminales de campo: tiempo por tarea, número de toques, mensajes comprensibles, capacitación mínima. | H-20 |
| **Accesibilidad** | A reforzar | WCAG 2.1 AA/AAA, contraste, navegación por teclado, lectores de pantalla, tamaños táctiles. | H-19 |

---

## 6. Stakeholders Faltantes

| Actor | Motivo | Hallazgos relacionados |
|-------|--------|------------------------|
| **Huésped** | Es afectado por cargos por daños y bloqueos de habitación; requiere notificación, acceso a evidencia y mecanismo de reclamación. | H-36 |
| **Custodio de claves / Administrador de wallets** | Necesario para el ciclo de vida seguro de wallets de jefes (alta, backup, rotación, revocación, recuperación). | H-13, H-14 |
| **Soporte / Operador de infraestructura** | Gestiona reintentos de cola de anclajes, incidencias de terminales, recuperación de PIN y caídas de RPC. | H-37 |
| **Recepción** | Ya existe como actor pero su rol en vNext no está actualizado: debe poder reportar incidencias y activar venta tras inspección. | H-38 |
| **Supervisor/Administrador de contingencia** | Mecanismo de escalación cuando el jefe no valida acciones de subordinados o está ausente. | H-39 |

---

## 7. Plan de Acción

### 7.1 Quick wins — Esfuerzo S (1-3 días)

| ID | Acción | Responsable sugerido |
|----|--------|----------------------|
| H-29 | Corregir referencia `D-C8` en diccionario o añadir decisión formal. | Analista de requisitos |
| H-30 | Añadir `CHECK` a `reported_by_role` y confirmar si `MAINTENANCE_TECH` reporta. | DBA / Backend |
| H-02 | Alinear `CRITICAL_AREA_CODES` con códigos reales de `maintenance_area_types`. | Backend / DBA |
| H-12 | Hacer `signature_id NOT NULL` para inspecciones `APPROVED`. | Backend / DBA |
| H-27 | Documentar matriz de permisos de `/mantenimiento`. | Analista de seguridad |
| H-28 | Definir mecanismo de upgrade aceptable en `RNF-M-08`. | Arquitecto |
| H-33, H-34, H-35 | Validar con cliente: ruta `/housekeeping`, informes adicionales y SIWE. | Product Owner |

### 7.2 Mejoras — Esfuerzo M (1-2 semanas)

| ID | Acción | Responsable sugerido |
|----|--------|----------------------|
| H-01 | Definir política completa de PIN para terminales e implementar rate-limit/bloqueo. | Backend / Seguridad |
| H-05 | Añadir `AREA_LOG` al enum `entity_type` o eliminar `signature_id` de `maintenance_area_logs`. | Backend / Arquitecto |
| H-06 | Aclarar si inspección habilita disponibilidad comercial o solo estado operativo. | Product Owner / Analista |
| H-16 | Añadir FK de `terminal_operators.created_by` a `admin_users` con validación de rol. | Backend / DBA |
| H-24, H-25, H-26 | Convertir términos vagos en criterios observables con valores por defecto. | Analista de requisitos |
| H-19, H-20, H-21 | Ampliar RNF de accesibilidad, usabilidad de terminales y fiabilidad offline. | UX / Arquitecto |
| H-22 | Detallar RNF de cumplimiento normativo y auditoría. | Legal / Compliance |
| H-23 | Redefinir `RNF-M-05` con SLAs cuantificables. | Arquitecto de rendimiento |
| H-38 | Actualizar rol de Recepción en vNext con rutas y permisos. | Analista / Backend |
| H-39 | Definir SLA de validación y escalación para subordinados. | Analista / Backend |

### 7.3 Roadmap — Esfuerzo L (2-4 semanas o más)

| ID | Acción | Responsable sugerido |
|----|--------|----------------------|
| H-10 | Rediseñar esquema de firmas con validación criptográfica EIP-191/EIP-712, FK a wallet activa y CHECK por estado. | Arquitecto / Blockchain |
| H-13 | Diseñar mecanismo de delegación de emergencia o multifirma, y ciclo de vida completo de wallets. | Arquitecto / Seguridad |
| H-14 | Implementar revocación on-chain atómica con histórico de wallets y vinculación por `admin_users.id`. | Backend / Blockchain |
| H-15 | Implementar clasificación de PII, cifrado, control de acceso a evidencias y política GDPR. | Seguridad / Legal |
| H-03 | Centralizar modelo de cargos por daños y asegurar que solo firmas `SIGNED`/`MINED` permitan cargos. | Backend / DBA / Blockchain |
| H-04 | Validar con cliente si cargo por daños requiere firma on-chain dado `D-C11`. | Product Owner |
| H-07 | Modelar tabla de trabajos de anclaje con retry, backoff, TTL y acción final. | Backend / Arquitecto |
| H-08 | Definir máquina de estados transaccional y manejo de reorgs. | Arquitecto / Blockchain |
| H-09 | Implementar gestión de nonces y cola serializada por wallet. | Backend / Blockchain |
| H-11 | Revisar gobernanza de feature flags para firmas obligatorias en producción. | Arquitecto / Seguridad |
| H-17 | Construir observabilidad: métricas, logs estructurados, alertas y reconciliador. | DevOps / Backend |
| H-18 | Definir e implementar estrategia de backup y recuperación. | DevOps / DBA |
| H-31 | Confirmar con cliente obligatoriedad on-chain de cada movimiento. | Product Owner |
| H-32 | Validar creación de `HotelOperations.sol` y registrar ADR. | Arquitecto / Cliente |
| H-36 | Modelar actor Huésped, flujo de notificación y reclamación. | Product Owner / Legal |
| H-37 | Definir actor Soporte y procedimientos de escalado. | Operaciones / Product Owner |

### 7.4 Criterios de aceptación para pasar a Fase 2

Antes de iniciar Casos de Uso / Diseño detallado, se deben cumplir como mínimo:

1. **Resueltos todos los hallazgos CRÍTICOS** (H-10, H-13, H-36) con decisiones documentadas y, cuando aplique, cambios en el modelo de datos.
2. **Resueltos al menos 12 de los 19 hallazgos ALTA**, priorizando: H-03, H-07, H-08, H-09, H-11, H-12, H-14, H-15, H-16, H-17, H-18, H-23, H-31, H-32, H-37.
3. **Confirmación por escrito del cliente** sobre:
   - Qué movimientos son obligatoriamente on-chain (H-31).
   - Si acepta un contrato adicional `HotelOperations.sol` (H-32).
   - Si el cargo por daños requiere firma on-chain o es nota interna (H-04).
   - Si se mantiene `/housekeeping` o se adopta `/ama-de-llaves` (H-33).
   - Si los jefes usan SIWE o contraseña+TOTP+wallet (H-35).
   - Cómo se notifica al huésped sobre cargos por daños (H-36).
4. **RNF de seguridad, observabilidad, backup y cumplimiento** añadidos al documento de requisitos.
5. **Stakeholders faltantes** incorporados a la tabla de actores con permisos y procedimientos asociados.

---

## 8. Conclusión

La propuesta vNext es técnicamente ambiciosa y coherente con la dirección estratégica del proyecto, pero presenta **deudas arquitectónicas y de seguridad significativas** que deben cerrarse antes de avanzar a Fase 2. Los tres bloqueadores CRÍTICOS (no repudio de firmas, punto único de fallo de wallets y ausencia del huésped como stakeholder) son incompatibles con un sistema de producción que gestiona cargos económicos y estados de habitación on-chain.

Se recomienda una iteración de refinamiento de **2-4 semanas** (dependiendo de la disponibilidad del cliente para validar decisiones) antes de aprobar el paso a Casos de Uso.

---

## Anexo A — Estado de resolución (2026-10-06)

Decisiones tomadas con el cliente que resuelven los hallazgos. Ver `RepoTecnico/estado_proyecto.md` §11 para el detalle.

| Hallazgo | Severidad | Estado | Resolución |
|---|---|---|---|
| H-10 | CRÍTICA | ✅ Resuelto | Firma **EIP-712 off-chain verificada criptográficamente** en BD + comprobación contra snapshot de roles (D-C16). Se añaden `nonce`, `domain_hash`, `recovered_signer`, `verified_at`, `role_snapshot`. |
| H-13 | CRÍTICA | ✅ Resuelto | Wallet de respaldo = **wallet del Owner/Administrador** (`OWNER_BACKUP`) para emergencias de mantenimiento (D-C13). |
| H-36 | CRÍTICA | ✅ Resuelto | **Huésped** como actor; **notificación con evidencia e importe y plazo de reclamación** antes del check-out (D-C14); tabla `damage_charge_guest_notifications`. |
| H-01 | ALTA | ✅ Resuelto | **Política de PIN completa**: 4-6 dígitos, bcrypt, bloqueo tras 5 fallos, rotación 90 días, PIN de un solo uso, timeout 5 min (D-C17, RNF-M-09). |
| H-02 | ALTA | ✅ Resuelto | Áreas críticas desglosadas: `POOL_FILTER`, `WATER_PUMP`, `ELEVATOR`, `ELECTRIC_GENERATOR` con `is_critical = TRUE` (D-C20). |
| H-03 | ALTA | ✅ Resuelto | Trigger `assert_damage_charge_signature` exige firma `SIGNED`/`MINED`; cargo centralizado en `housekeeping_damage_charges`. |
| H-05 | ALTA | ✅ Resuelto | Añadido `AREA_LOG` al enum `entity_type`. |
| H-06 | ALTA | ✅ Resuelto | La inspección **no libera venta**; la firma certifica la revisión (D-C15) y pasa a **opcional** por D-C23. |
| H-07 | ALTA | ✅ Resuelto | Backoff exponencial, máx. 8 reintentos, TTL 24 h, estado `PENDING_ANCHOR` (D-C18, RNF-M-03). |
| H-08 | ALTA | ✅ Resuelto | RNF-M-14: cambio en BD solo con firma `SIGNED`; compensación y reconciliación de reorgs. |
| H-09 | ALTA | ✅ Resuelto | Campo `nonce` en `on_chain_signatures` + serialización por wallet en la cola. |
| H-11 | ALTA | ✅ Resuelto | Gobernanza de flags: solo Owner con TOTP; desactivar flags obligatorios exige firma on-chain del cambio (D-C22, RNF-M-11). |
| H-12 | ALTA | ✅ Resuelto | Por D-C23 la firma de inspección es opcional; `signature_id` nullable es coherente. |
| H-14 | ALTA | ✅ Resuelto | RNF-M-15: revocación on-chain antes de `revoked_at`; FK a `admin_users.id`; histórico. |
| H-15 | ALTA | ✅ Resuelto | RNF-M-10 + comentario SQL: fotos cifradas, EXIF eliminado, URL firmada, retención 90 días (D-C19). |
| H-16 | ALTA | ✅ Resuelto | RNF-M-16: `created_by` validado contra rol activo. |
| H-17 | ALTA | ✅ Resuelto | RNF-M-13: observabilidad, métricas de cola, gas y alertas. |
| H-18 | ALTA | ✅ Resuelto | RNF-M-12: RPO 1 h, RTO 4 h, PITR, retención 30 d + 12 m (D-C25). |
| H-23 | ALTA | ✅ Resuelto | RNF-M-05: p95 medibles y escenario de carga (D-C26). |
| H-31 | ALTA | ✅ Resuelto | Alcance on-chain confirmado: obligatorio en bloqueo/desbloqueo y cargos; opcional en inspección (D-C23). |
| H-32 | ALTA | ✅ Resuelto | Se confirma la creación de `HotelOperations.sol` sin tocar `HotelNights.sol` (D-C23). |
| H-37 | ALTA | ✅ Resuelto | Soporte = Administrador (Owner) con lectura de cola/terminales y escalado (D-C24). |
| H-04 | MEDIA | ✅ Resuelto | Cargo por daños **sin firma on-chain**; solo auditoría off-chain (D-C27, ajusta D-C23). |
| H-19 | MEDIA | ✅ Resuelto | Accesibilidad: solo usabilidad móvil, sin WCAG formal (D-C28, riesgo aceptado). |
| H-20 | MEDIA | ✅ Resuelto | Usabilidad de terminal: ≤ 30 s/tarea, ≤ 3 toques, idioma del operario (D-C29, RNF-M-17). |
| H-21 | MEDIA | ✅ Resuelto | Sin modo offline; bloqueo optimista y degradación graceful (D-C30, RNF-M-18). |
| H-22 | MEDIA | ✅ Resuelto | Cumplimiento: retención 5 años, append-only con hash encadenado, exportación (D-C31, RNF-M-19). |
| H-24 | MEDIA | ✅ Resuelto | Criterios observables: icono ⛓, etiqueta, `data-testid`, botón disabled, modal preview (D-C32). |
| H-25 | MEDIA | ✅ Resuelto | Umbral de suministros configurable, notificación y cierre automático (D-C33). |
| H-26 | MEDIA | ✅ Resuelto | Firmas por tipo sin "recomendada"; flags solo dev/test (D-C34). |
| H-27 | MEDIA | ✅ Resuelto | Matriz de permisos del técnico (D-C35, RNF-M-20). |
| H-29 | MEDIA | ✅ Resuelto | Referencia `D-C8` corregida a `D-C10` en el diccionario. |
| H-30 | MEDIA | ✅ Resuelto | `reported_by_role` con `CHECK`; el técnico puede reportar (D-C36). |
| H-38 | MEDIA | ✅ Resuelto | Permisos de Recepción explicitados (D-C37). |
| H-39 | MEDIA | ✅ Resuelto | SLA de validación 24 h con escalado (D-C38, RNF-M-21). |
| H-28 | BAJA | ✅ Resuelto | Contrato inmutable con evento genérico `OperationalAction` (D-C39). |
| H-33 | BAJA | ✅ Resuelto | Ruta `/ama-de-llaves` con redirección desde `/housekeeping` (D-C40). |
| H-34 | BAJA | ✅ Resuelto | Informes/notificaciones marcados como "propuesta del equipo", prioridad baja (D-C41). |
| H-35 | BAJA | ✅ Resuelto | Autenticación de jefes: contraseña + TOTP + wallet desacoplada (D-C42). |

**Veredicto actualizado (2026-10-06):** los **39 hallazgos (3 CRÍTICOS, 19 ALTOS, 13 MEDIA y 4 BAJOS) están resueltos** mediante las decisiones D-C13…D-C42. La propuesta vNext queda **APTA para pasar a Fase 2** (casos de uso + documento técnico), pendiente de validación del cliente.

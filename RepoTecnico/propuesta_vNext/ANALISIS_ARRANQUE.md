# Análisis de arranque — vNext (Fase 3) · 2026-10-10

**Comando:** `/asistente-proyecto analiza vNext y preparate para implementar`
**Alcance analizado:** `RepoTecnico/propuesta_vNext/` (Fase 1 + Fase 2 completas) y su contraste con el
**estado real del repositorio** en `1a29701`…`fb10fa1`.
**Carácter:** análisis de preparación (lectura). **No se ha implementado ni modificado código de vNext.**

---

## 1. Resumen ejecutivo

**Veredicto: vNext está LISTA para arrancar por F1, con tres condiciones de andamiaje.**

- La propuesta está **completa y auditada**: 9 documentos (7.636 líneas), **45 casos de uso CU-V-01…45**
  con Gherkin/EARS y trazabilidad, diagramas (casos de uso, secuencia, estados), documento técnico
  (1.218 líneas) y **plan de desarrollo vertical de 10 ciclos F1–F10** (778 líneas, 77 días-persona).
- La auditoría vNext V1 dio **NO LISTA** (3 CRÍTICOS + 19 ALTOS + 13 MEDIA + 4 BAJOS) y sus **39
  hallazgos quedaron resueltos** con las decisiones D-C13…D-C42; el veredicto actualizado (2026-10-06) es
  **APTA para pasar a Fase 3**.
- Del **modelo de datos vNext no hay nada implementado**: 0 de las 12 tablas están en
  `packages/shared/src/db/migrator.ts` ni en el `base_datos.sql` raíz; `HotelOperations.sol` no existe.
- **Primer ciclo: F1 — Fundaciones** (4 días-persona), raíz de la ruta crítica `F1 → F2 → F3 → F4 → F6 → F10`.

---

## 2. Qué es vNext (según el plan)

**Suite de Mantenimiento + Suite Ama de llaves con firma on-chain selectiva** (`HotelOperations.sol`
inmutable, tipo de acción genérico, meta-transacción por relayer, **sin PII on-chain**).

| Ciclo | Nombre | Esfuerzo | Depende de |
|---|---|---|---|
| **F1** | Fundaciones: esquema vNext + auditoría append-only | S · 4 d | — |
| F2 | Contrato `HotelOperations.sol` + motor EIP-712 | L · 9 d | F1 |
| F3 | Outbox de anclaje y worker relayer | L · 9 d | F2 |
| F4 | Suite Mantenimiento | L · 12 d | F3 |
| F5 / F6 | Terminal PIN / Suite Ama de llaves | M 6 d / L 11 d | F1,F4 / F4 |
| F7 / F8 | Cargos por daños / Suministros y SLA | M 6 d / M 5 d | F6 / F4,F6 |
| F9 / F10 | Admin, gobernanza y soporte / Recepción y cierre | L 10 d / M 5 d | F2,F3,F5 / F4,F6,F7,F9 |

**Regla de oro (P4/P6):** firma EIP-712 **obligatoria** en bloqueo/desbloqueo de habitación, verificación
preventiva de área crítica (`POOL_FILTER`, `WATER_PUMP`, `ELEVATOR`, `ELECTRIC_GENERATOR`), `CONFIG`
obligatoria y emergencia `OWNER_BACKUP`; **opcional** en inspección; **nunca** en cargos por daños,
tickets ni configuración interna. `HotelNights.sol` **no se toca** (D-V1, D-C23).

---

## 3. Estado real medido (no narrado)

### 3.1 Documentación (Fase 1 + Fase 2): COMPLETA

| Artefacto | Líneas | Estado |
|---|---|---|
| `requerimientos.md` | 206 | ✅ RF-G/M/K/S, RNF-M-01…21, decisiones D-C1…D-C42 |
| `casos_uso.md` | 2.890 | ✅ 45 CU-V con Gherkin/EARS y trazabilidad |
| `casos_uso/diagrama_casos_uso.md` · `diagramas_secuencia.md` · `diagrama_estados.md` | 242/396/177 | ✅ generados tras la auditoría |
| `documento_tecnico.md` | 1.218 | ✅ C1–C17, M1–M18, runbook §9.5, plan §11 |
| `diccionario_datos.md` · `diagrama_er.md` | 380/334 | ✅ 12 tablas nuevas + extensiones |
| `plan_desarrollo.md` | 778 | ✅ F1–F10 con tareas, pruebas y gates |
| `INFORME_AUDITORIA_VNEXT_V1.md` | 892 | ✅ 39 hallazgos **resueltos** (D-C13…D-C42) |
| `base_datos.sql` (paquete vNext) | 447 | ✅ DDL completo y sembrado |

### 3.2 Código: NADA implementado

| Comprobación | Medición |
|---|---|
| Tablas vNext en `packages/shared/src/db/migrator.ts` | **0 de 12** (`maintenance_area_types`, `operator_audit_log`, `on_chain_signatures`, `operator_wallets`, `feature_flags`… ausentes) |
| Tablas vNext en `RepoTecnico/base_datos.sql` (raíz, 48 tablas) | **0 de 12** (solo `housekeeping_assignments`, que es del producto vigente) |
| `packages/contracts/src/HotelOperations.sol` | **no existe** (solo `HotelNights`, `Faucet`, `Bootstrap`) |
| Vocabulario de roles vNext (`HEAD_KEEPER`, `HEAD_MAINTENANCE`, `MAINTENANCE_TECH`, `HOUSEKEEPER`) | **no existe** (hoy hay `HOUSEKEEPING`, `MAINTENANCE`) |
| `is_critical` / semilla de 10 áreas (4 críticas) | **no existe** en la BD vigente |

### 3.3 Entrada real de F1 (medida sobre el artefacto, no sobre el plan)

| Elemento | Cantidad real | Plan decía |
|---|---|---|
| `CREATE TABLE IF NOT EXISTS` | **12** | 12 ✅ |
| `ALTER TABLE … ADD COLUMN IF NOT EXISTS` | **19** (el «20» que dije antes incluía una línea de comentario) | «26 ALTER TABLE» → el real es **25** ⚠️ |
| `ALTER TABLE` totales | **25** sobre **4 tablas** (`maintenance_incidents` 11, `preventive_tasks` 9, `rooms` 6, `preventive_plans` 1) | — |
| Constraints CHECK redefinidas | **3** (`rooms_operational_status_check`, `preventive_tasks_validation_status_check`, `maintenance_incidents_reported_by_role_check`) | — |
| Tablas extendidas | **4 con DDL** (`maintenance_incidents`, `preventive_tasks`, `rooms`, `preventive_plans`) + **`admin_users`** con extensión **lógica** de roles (sin DDL) = **5** | «5 extensiones» **✅ correcto** (el documento técnico lo documenta en DT-AUD-11) |
| Función + trigger append-only | `forbid_audit_mutation` + `trg_operator_audit_append_only` | ✅ |
| Semilla `maintenance_area_types` | 10 tipos, 4 `is_critical = TRUE` | ✅ |

---

## 4. Observaciones del análisis (huecos y bloqueos detectados)

| # | Observación | Evidencia | Impacto en F1 |
|---|---|---|---|
| **A1** | **El plan y el artefacto no cuadran en el total de `ALTER TABLE`** («26» frente a **25**: 19 columnas sobre 4 tablas + 3 CHECK = 3 `DROP` + 3 `ADD`) y el gate usa mal el vocabulario («5 **columnas**-extensión» cuando son **5 tablas extendidas**, 4 con DDL). Ver la rectificación de B1 en §8.2. | `plan_desarrollo.md:65,127,143,154` vs `propuesta_vNext/base_datos.sql` | **Bloquea T1.1/T1.13**: hay que fijar la fuente de verdad antes de tocar el migrador |
| **A2** | **El gate de salida de F1 está hoy en rojo por un motivo ajeno**: `pnpm --filter @hotel/shared test` falla en `documentation-guardian.test.ts` (`CU-38`/`CU-39` citados por un commit de otra sesión y no catalogados en el SRS). | `git log -1 -- packages/shared/src/reception/day-board.test.ts` → `c8b4792`; fichero idéntico a `HEAD` | F1 no puede cerrar sin resolverlo (o acotarlo formalmente) |
| **A3** | **Falta el guardián de paridad que pide D8**: `architecture-guardian.test.ts` compara `db/schema.sql` ↔ `runMigrations`, pero **no** `base_datos.sql` raíz, así que la desincronización de los tres artefactos es invisible (fue el hallazgo H-08 de la auditoría vNext). | `packages/shared/src/architecture-guardian.test.ts:26,144-155` | T1.3 sin red de seguridad |
| **A4** | **No hay job de CI con `psql`** (D11): solo existe `.github/workflows/ci.yml`, sin validación del script SQL. | `grep -rln "psql\|base_datos.sql" .github/workflows/` → vacío | El gate «script aplicado dos veces sin error» no se puede cumplir en CI todavía (en local tampoco hay `psql`) |
| **A5** | **WIP ajeno sobre los mismos ficheros que F1 va a reescribir**: `RepoTecnico/base_datos.sql` y `packages/shared/src/db/migrator.ts` están modificados (orden de FK de `room_cleaning_checklists`). | `git status --porcelain` (14 entradas, 2 en esos ficheros) | **Solape de escritura**: hay que commitearlo o integrarlo antes de arrancar F1 |
| **A6** | `reset-plan.test.ts` valida el orden de borrado **contra `base_datos.sql`** y hoy espera la cobertura de las tablas vigentes: las 12 nuevas y las 3 CHECK redefinidas lo pondrán rojo en cuanto se añadan. | `packages/shared/src/db/reset-plan.ts:1-13` | Es esperable (T1.4), pero conviene hacerlo **en el mismo commit** que las tablas |
| **A7** | **Pendientes de la auditoría V6 (quema) que tocan wallets y roles de F2/F9**: H-02 (el firmante acumula `MINTER+BURNER`; cuenta 0 con `BURNER_ROLE` y clave publicada) y H-03/QW-4 (variables de quema fuera de plantilla/manual/script). vNext F2 introduce `HotelOperations.sol`, relayer sin roles y `operator_wallets`; el Safe 2-de-3 (D5) es `DEFAULT_ADMIN`. | `INFORME_OPTIMIZACION_V6.md` §3.3; `plan_desarrollo.md:66,733` | **Decisión de secuencia**: conviene cerrar H-02/H-03 antes o durante F2, no después de F9 |

**Nada de esto invalida el plan**: son tres condiciones de andamiaje (A1, A2/A3/A4 y A5) y una decisión de
secuencia (A7).

---

## 5. Preparación del ciclo F1 (listo para ejecutar)

**Entregable verificable (del plan):** `psql -f <sql>` aplicado **dos veces** sin errores sobre copia
restaurada; `runMigrations()` crea el esquema y `resetDatabase()` lo desmonta en orden inverso de FK;
`UPDATE`/`DELETE` sobre `operator_audit_log` **revertidos por trigger**; semilla de **10 áreas, 4 críticas**.

**Orden de ejecución propuesto** (adapta T1.1–T1.13 del plan al repositorio real):

| Paso | Contenido | Ficheros | Verificación |
|---|---|---|---|
| 1 | **Fijar la fuente de verdad** del delta (A1): reconciliar 12 tablas / 19 columnas / 3 CHECK / 5 tablas extendidas y actualizar plan, diccionario, ER y documento técnico | `propuesta_vNext/{plan_desarrollo,diccionario_datos,diagrama_er,documento_tecnico}.md` | Cifras idénticas en los cuatro documentos |
| 2 | Portar el DDL vNext al esquema inicial del migrador (12 `CREATE TABLE` + 25 `ALTER TABLE` + trigger + semilla, `IF NOT EXISTS`/`ON CONFLICT`) | `packages/shared/src/db/migrator.ts` | `migrator.test.ts`; `runMigrations` idempotente |
| 3 | Sincronizar el SQL suelto del paquete y el `schema.sql` | `propuesta_vNext/base_datos.sql`, `packages/shared/src/db/schema.sql` | Diff vacío entre los tres |
| 4 | Ampliar el orden de borrado (12 tablas nuevas) y las 3 CHECK | `packages/shared/src/db/reset-plan.ts` | `reset-plan.test.ts` |
| 5 | Extender el **guardián de arquitectura** para comparar también `base_datos.sql` (A3, D8) | `packages/shared/src/architecture-guardian.test.ts` | La prueba falla si alguien desincroniza los tres artefactos |
| 6 | Vocabulario: roles nuevos + estados/tipos de entidad canónicos | `packages/shared/src/domain/roles.ts`, `domain/operations-state.ts` (nuevo) | Test de exhaustividad frente al SQL |
| 7 | Repositorios: auditoría con hash encadenado; operaciones (`operator_wallets`, `on_chain_signatures` con nonce único); mantenimiento; terminal; housekeeping | `packages/shared/src/db/repositories/*.ts` (3 nuevos + 2 extendidos) | Índice único `(signer_address, nonce)`; cadena de hashes |
| 8 | Variables nuevas en el ejemplo de entorno y registro de estado | `.env.example`, `RepoTecnico/estado_proyecto.md` | Validación de env |
| 9 | **Job de CI con `psql`** (A4, D11) y arranque de `base_datos.sql` dos veces | `.github/workflows/ci.yml` | Job verde en el PR |

**Riesgos del ciclo** (del plan, más los detectados): orden FK `housekeeping_damage_charges →
operator_audit_log` (ya mitigado); triple desincronización migrador ↔ `schema.sql` ↔ `base_datos.sql`
(A3, se cubre en el paso 5); **las 3 CHECK nuevas redefinen columnas de tablas con datos** —hay que
verificar que los valores vivos las satisfacen o migrarlos—; y el solape de escritura (A5).

**Gates de cierre de F1:** `pnpm typecheck` y `pnpm --filter @hotel/shared test` **verdes** (requiere A2);
`psql` aplicando el script **dos veces** sin error; `UPDATE`/`DELETE` sobre `operator_audit_log`
revertidos; 12 tablas + columnas-extensiones confirmadas con `\d+`; los tres artefactos de datos
coherentes (con la cifra de A1 ya reconciliada).

---

## 6. Lo que necesito del responsable antes de escribir código

1. **Alcance del arranque**: ¿F1 tal cual, o F1 acompañado de los gates que hoy faltan (A2 documento,
   A3 guardián de paridad, A4 job `psql`)? Este análisis recomienda **F1 + los tres gates en el mismo
   ciclo**, porque sin ellos el cierre de F1 no es verificable.
2. **Fuente de verdad del delta (A1)**: ¿manda el **artefacto SQL** (12 tablas / 19 columnas / 3 CHECK) y
   se actualizan plan, diccionario, ER y documento técnico, o se revisa antes el SQL contra el plan?
3. **Secuencia con la auditoría V6 (A7)**: ¿cerrar **H-02/H-03** (custodia de roles y configuración de
   quema) antes de F2, o se asume como deuda hasta F9?

**No haré sin orden explícita:** commit, push ni despliegue de vNext. Tampoco tocaré el WIP ajeno de A5
(solo lo integraré o lo dejaré fuera del alcance).

---

## 7. Anexo: comandos de verificación de F1

```bash
# Idempotencia del esquema (cuando exista el job de CI, A4)
psql "$DATABASE_URL" -f RepoTecnico/base_datos.sql && psql "$DATABASE_URL" -f RepoTecnico/base_datos.sql

# Migración + reset + repositorios nuevos
pnpm --filter @hotel/shared exec vitest run src/db/migrator.test.ts src/db/reset-plan.test.ts \
  src/db/repositories/audit.repository.test.ts src/db/repositories/operations.repository.test.ts

# Guardián de paridad de los tres artefactos (paso 5)
pnpm --filter @hotel/shared exec vitest run src/architecture-guardian.test.ts

# Gate completo del ciclo
pnpm typecheck && pnpm --filter @hotel/shared test
```

*Análisis de arranque vNext · Fase 3 · @asistenteProyecto · 2026-10-10.*

---

## 8. Auditoría del DDL vNext contra el plan y los artefactos (encargo del responsable)

Encargo: **«revisa el SQL contra el plan antes de tocar nada»**. Es una revisión de lectura; **no se ha
modificado ningún fichero de la propuesta**. Método: parseo del DDL (12 `CREATE TABLE`, 25 `ALTER
TABLE`), del `diagrama_er.md` (19 entidades) y del `diccionario_datos.md` (16 tablas citadas), con
comparación de conjuntos de columnas.

### 8.1 Lo que está correcto (verificado, no deducido)

| Comprobación | Resultado |
|---|---|
| Cobertura: las **12 tablas** del SQL están en el ER y en el diccionario | ✅ 12/12 en ambos (ninguna huérfana) |
| Semilla `maintenance_area_types` | ✅ **10 filas, 4 con `is_critical = TRUE`** |
| Áreas críticas = las que exige la configuración | ✅ `POOL_FILTER`, `WATER_PUMP`, `ELEVATOR`, `ELECTRIC_GENERATOR` (coinciden 1:1 con `CRITICAL_AREA_CODES` de `entornos_globales.md:38`) → el hallazgo **H-02 de la auditoría V1 está realmente resuelto** |
| Índice único de nonce | ✅ `uq_on_chain_signatures_nonce` presente |
| Auditoría append-only | ✅ función `forbid_audit_mutation` + trigger `trg_operator_audit_append_only` |
| CHECK redefinidas | ✅ 3: `maintenance_incidents_reported_by_role_check`, `rooms_operational_status_check`, `preventive_tasks_validation_status_check` |
| Columnas del diccionario ↔ SQL | ✅ el diccionario documenta también las columnas-extensión (`validation_status`:216,349; `audit_log_id`:257) |

### 8.2 Hallazgos

| # | Severidad | Hallazgo | Evidencia | Corrección propuesta |
|---|---|---|---|---|
| **B1** | BAJA | **RECTIFICADO (2026-10-10).** Mi primera lectura de B1 fue **errónea**: interpreté «5 extensiones» como extensiones de PostgreSQL. El documento técnico (§5.3, DT-AUD-11) ya definía «**5 tablas extendidas**»: `maintenance_incidents`, `preventive_tasks`, `rooms`, `preventive_plans` **con DDL** y `admin_users` con extensión **lógica** de roles (el SQL lo declara como comentario y la restricción vive en la capa de dominio: `admin_users.role` es `VARCHAR(30)` **sin CHECK**). Lo que sí difiere es el **total de `ALTER TABLE`: 26 en el plan frente a 25 reales** (19 columnas + 3 CHECK = 3 `DROP` + 3 `ADD`), y el gate dice «5 **columnas**-extensión» donde debería decir «5 **tablas** extendidas». | `documento_tecnico.md:640,650,1042,1207`; `base_datos.sql:25-47` (comentario de roles) y `RepoTecnico/base_datos.sql:177` (`role VARCHAR(30)` sin CHECK) | Ya aplicado: plan y documento técnico dicen «12 tablas nuevas + 5 tablas extendidas (4 con DDL: 19 columnas y 3 CHECK; `admin_users` lógica)» y el plan registra 1.0.1 |
| **B2** | MEDIA | **El ER no incluye 2 columnas que sí están en el SQL y en el diccionario**: `housekeeping_damage_charges.audit_log_id` (FK lógica a `operator_audit_log`) y `preventive_tasks.validation_status` (columna-extensión del SLA de 24 h). Los tres artefactos deben ir juntos (P8), y hoy el ER va por detrás. | Comparación columna a columna SQL↔ER; `diccionario_datos.md:257,216,349` | Añadir ambas al bloque Mermaid correspondiente de `diagrama_er.md` |
| **B3** | BAJA | **El ER documenta 7 tablas del producto vigente** (`admin_users`, `rooms`, `preventive_plans`, `preventive_tasks`, `maintenance_incidents`, `maintenance_incident_events`, `housekeeping_assignments`) porque el SQL vNext las **extiende** pero no las recrea. Es correcto por diseño, pero se presta a confundir «12 tablas nuevas» con «modelo completo». | ER (19 entidades) vs SQL (12 `CREATE TABLE` en el paquete) | Declararlo explícitamente en la cabecera del ER y en el §3.2 de este análisis |
| **B4** | BAJA | El `base_datos.sql` del paquete **no es autosuficiente**: contiene los `ALTER TABLE` sobre tablas que crea el esquema raíz, así que aplicarlo suelto sobre una base vacía falla. El entregable de F1 («`psql -f …` dos veces sin errores») se refiere al **script raíz ya fusionado**, no a este fichero. | `base_datos.sql` del paquete (ALTER sobre `rooms`, `preventive_tasks`, `maintenance_incidents`, `preventive_plans` sin `CREATE`) | Al fusionar en F1 (paso 2-3), dejar el paquete como **fuente del delta** y el raíz como script ejecutable; documentarlo en la cabecera de ambos |

### 8.3 Conclusión de la revisión

El DDL es **coherente y está listo para portarse**: cubre las 12 tablas, los objetos clave y la semilla
crítica, y el diccionario ya está sincronizado. Lo que hay que corregir **antes** de tocar el migrador es
**documental** (B1 y B2) y una aclaración de alcance (B3, B4). Con B1 y B2 resueltos en el mismo commit
del paso 1, F1 puede arrancar sin arrastrar una desincronización entre los tres artefactos —que es,
precisamente, el defecto H-08 de la auditoría V1—.

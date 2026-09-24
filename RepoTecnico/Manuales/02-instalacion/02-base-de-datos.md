# 02 · Base de datos: esquema, migraciones y respaldo

> **Fuente de verdad del esquema**: `packages/shared/src/db/migrator.ts` (**13 tablas**).
> `packages/shared/src/db/schema.sql` se conserva como referencia histórica y su **paridad** la
> comprueba un guardián (`packages/shared/src/architecture-guardian.test.ts`).
> **Diccionario columna a columna**: [`../../diccionario_datos.md`](../../diccionario_datos.md).
> **Especificación**: [`docs/SRS.md`](../../../docs/SRS.md) §5 y ADR-03.

## 1. Convenciones del modelo

| Convención | Regla |
|---|---|
| Importes | Siempre en **wei**, `NUMERIC(78,0)`. Nunca coma flotante. En JSON viajan como `string` |
| Direcciones | `VARCHAR(42)` con el prefijo `0x` |
| Hash de transacción | `VARCHAR(66)` |
| Identificador de token | `VARCHAR(66)` en base de datos; `uint256` en la cadena |
| Fechas de negocio | `DATE` `AAAA-MM-DD` (noche de estancia) |
| Marcas de tiempo | `TIMESTAMP`/`TIMESTAMPTZ` en UTC; `Europe/Madrid` solo en presentación y en el planificador de quema |
| Identificadores internos | `UUID` con `gen_random_uuid()` (extensión `pgcrypto`) |
| PII | **No se almacena PII de viajeros** (ADR-20). La de operadores se minimiza (ADR-24) |

### Codificación canónica del `tokenId`

```
tokenId = room · 10^8 + AAAAMMDD
Ejemplo: habitación 102, noche 2026-06-15  →  10220260615
```

Implementado en `packages/shared/src/domain/token-id.ts` y replicado en el contrato
(`ROOM_MULTIPLIER`). El calendario se valida off-chain (año bisiesto incluido) y el rango on-chain.

### Maestro de habitaciones (`RoomMaster`)

| Rango | Tipo | Royalty |
|---|---|---|
| 101–115 | simple | 5 % |
| 116–130 | doble | 5 % |
| 201–220 | suite | 10 % |

Total: **50 habitaciones**. Está duplicado a propósito en `domain/room-master.ts` y en
`contracts/src/libraries/RoomMaster.sol`.

## 2. Las 13 tablas

| Grupo | Tablas | Qué guardan |
|---|---|---|
| Inventario y ventas | `nfts`, `listings`, `sale_events` | Índice de noches, ofertas de reventa y ventas con royalty |
| Operadores | `admin_users`, `admin_sessions`, `mfa_recovery_codes` | Hash bcrypt, semilla TOTP cifrada, refresh con rotación, códigos de rescate |
| Comunicaciones | `email_notifications`, `push_subscriptions` | Cola persistente de correo y suscripciones push con *opt-out* |
| Recepción | `checkin_contingency_logs` | Check-in asistido **sin PII** (motivo de vocabulario cerrado) |
| Worker | `worker_checkpoints`, `worker_processed_logs`, `worker_aggregate_counters`, `worker_sale_history` | Progreso, idempotencia por log, contadores y ventas con **marca temporal del bloque** |

Puntos que conviene tener presentes antes de tocar nada:

- `nfts.status` es el **espejo** del estado del contrato: `AVAILABLE` · `CONFIRMING` · `SOLD` ·
  `BURNED` · `CHECKED_IN`. La verdad está en la cadena.
- `nfts.on_chain_anchored` (`TRUE` por defecto) y `tx_hash_mint` con hash centinela: una fila con
  `FALSE` queda **fuera del catálogo**.
- `worker_aggregate_counters` es **una sola fila** (`id = 0` con `CHECK`).
- `worker_sale_history` tiene PK compuesta `(tx_hash, log_index)` y `block_timestamp TIMESTAMPTZ NULL`:
  se rellena leyendo la cabecera del bloque (`backfillTimestamps`, idempotente). Si un bloque no se
  puede leer, la fila sigue sin fecha y se declara en `undatedSalesCount` en vez de inventarla.
- `sale_events.block_timestamp` usa `DEFAULT NOW()` (reloj de la máquina). Por eso el dashboard, el
  histórico y sus CSV leen `worker_sale_history` y **no** `sale_events` (ADR-25).
- La escritura de agregados usa `BEGIN` → `INSERT` de la clave de idempotencia → `SELECT … FOR UPDATE`
  de la fila única → mutación → `COMMIT`. El `FOR UPDATE` es imprescindible: las sumas en wei se
  calculan en `bigint` en JavaScript y se persisten ya calculadas.

## 3. Migraciones: incrementales, idempotentes y **ordenadas**

`runMigrations()` se ejecuta **al arrancar** en cerrado (worker y web). No hay comando de migración
aparte ni ficheros numerados: el esquema completo vive en una constante SQL idempotente.

1. No crees tablas a mano: añade la sentencia al `INITIAL_SCHEMA_SQL` de `migrator.ts`.
2. Usa siempre `IF NOT EXISTS` y, para columnas nuevas, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.
3. **El orden es el invariante**: en PostgreSQL, `CREATE TABLE IF NOT EXISTS` **no añade columnas** a
   una tabla que ya existía. Si añades una columna y un índice sobre ella, el `ALTER` va **antes** del
   `CREATE INDEX`.

   ```sql
   ALTER TABLE worker_sale_history ADD COLUMN IF NOT EXISTS block_timestamp TIMESTAMPTZ NULL;
   CREATE INDEX IF NOT EXISTS idx_worker_sale_history_ts ON worker_sale_history(block_timestamp);
   ```

   Con el orden inverso, el worker **no arrancaba** contra una base ya creada («no existe la
   columna»). Ese fallo real es el que el guardián de arquitectura protege hoy.
4. Actualiza `RepoTecnico/diccionario_datos.md` en el mismo cambio.
5. Ejecuta `pnpm --filter @hotel/shared test`: el guardián comprueba el **orden de la migración
   incremental** y la **paridad de tablas** entre `schema.sql` y `runMigrations`.

`resetDatabase()` (solo pruebas) borra las 13 tablas y vuelve a migrar. **No lo uses sobre una base
con datos reales.**

## 4. Verificar el esquema aplicado

1. Lista las tablas y cuéntalas:

   ```powershell
   psql "postgresql://hotel_admin:<clave>@127.0.0.1:5432/hotel_nft_dev" -c "\dt"
   ```

   Deben salir **13**.

2. Comprueba la precisión de los importes (debe ser `78,0`):

   ```powershell
   psql "postgresql://hotel_admin:<clave>@127.0.0.1:5432/hotel_nft_dev" -c `
     "SELECT table_name, column_name, numeric_precision, numeric_scale FROM information_schema.columns WHERE data_type='numeric' ORDER BY 1,2;"
   ```

3. Comprueba la fila semilla de contadores y la columna del relleno de fechas:

   ```powershell
   psql "postgresql://hotel_admin:<clave>@127.0.0.1:5432/hotel_nft_dev" -c "SELECT * FROM worker_aggregate_counters;"
   psql "postgresql://hotel_admin:<clave>@127.0.0.1:5432/hotel_nft_dev" -c "\d worker_sale_history"
   ```

4. Comprueba que la extensión está instalada:

   ```powershell
   psql "postgresql://hotel_admin:<clave>@127.0.0.1:5432/hotel_nft_dev" -c "\dx"
   ```

## 5. Respaldo y restauración

### 5.1 Qué es fuente de verdad y qué es índice

| Dato | Dónde vive | ¿Necesita copia? |
|---|---|---|
| Propiedad, listados, ventas, check-in, royalties, saldos pendientes | **La cadena** (`HotelNights`) | No: se reconstruye leyendo la cadena desde el bloque de despliegue |
| Índice, histórico, agregados y contadores | PostgreSQL | Sí, pero es reconstruible |
| **Operadores** (bcrypt + semilla TOTP cifrada), sesiones, códigos de rescate | PostgreSQL | **Sí, y es lo único que no se puede reconstruir** |
| Cola de correo, suscripciones push, contingencia, checkpoints | PostgreSQL | Sí (se pierden avisos y trabajo, no dinero) |

### 5.2 Verificación reproducible de la recuperación

```powershell
pnpm test:dr
```

Qué hace, de verdad:

1. Ejecuta `pg_dump --format=plain --no-owner --no-privileges` de la base real y anota tamaño y
   **SHA-256**.
2. **Restaura** el volcado en un esquema de la misma base y cronometra la operación.
3. Compara **tabla por tabla** entre origen y restaurada: recuentos y sumas de control.
4. Limpia el esquema de verificación **siempre**, incluso si algo falla.
5. Escribe el artefacto [`../../evidencias/dr-verify.json`](../../evidencias/dr-verify.json).

Última ejecución documentada: volcado de **192.910 bytes** (SHA-256 `61b75798…649d`), restauración en
el esquema `dr_verify` con **RTO 0,73 s**, **283 filas comparadas y 6/6 tablas idénticas**
(`nfts` 42, `worker_sale_history` 48, `worker_aggregate_counters` 1, `email_notifications` 190,
`push_subscriptions` 0, `admin_users` 2). Resultado: **CUMPLE**.

**Nota de alcance declarada en el artefacto**: el rol de la aplicación **no tiene `CREATEDB`**, así que
la restauración se hace en un esquema de la misma base, no en una base nueva. El volcado, la
restauración y la comparación son reales; el aislamiento no es total.

### 5.3 Copia manual

```powershell
pg_dump --no-owner --no-privileges -d "$env:DATABASE_URL" -f hotel_backup.sql
# Huella para comprobar que lo restaurado es lo volcado
Get-FileHash hotel_backup.sql -Algorithm SHA256
```

Recomendaciones operativas (no automatizadas hoy en el repositorio): frecuencia diaria para
credenciales y negocio; **cifrado en reposo** del volcado (contiene correos y hashes) con la clave
fuera del mismo destino; retención de al menos 7 diarios y 4 semanales; **una copia fuera del
servidor**; y verificación periódica con `pnpm test:dr`.

### 5.4 Runbook: se ha perdido la base

| Paso | Acción | Comprobación |
|---|---|---|
| 1 | Provisionar PostgreSQL, crear el rol `hotel_admin`, la base `hotel_nft_dev` y la extensión `pgcrypto` (como superusuario) | `psql "$env:DATABASE_URL" -c "\dt"` |
| 2 | Restaurar el último volcado | `psql -d "$env:DATABASE_URL" -f hotel_backup.sql` |
| 3 | Verificar integridad contra la huella SHA-256 | `Get-FileHash hotel_backup.sql` |
| 4 | Arrancar el worker: aplica las migraciones que falten y **reindexa** desde el bloque de despliegue | `/health` con `lag` pequeño y decreciente |
| 5 | Comprobar que las cifras cuadran con la cadena | `/aggregates` (minteadas, vendidas, quemadas, royalties) |
| 6 | Reaprovisionar los operadores que falten | `pnpm --filter @hotel/shared provision:admin -- --username …` |
| 7 | Avisar a recepción y al propietario: las sesiones anteriores **ya no valen** | Login con contraseña + TOTP |

Si el checkpoint del worker queda **por delante** de la cabeza de la cadena (tras reiniciar Anvil o
redesplegar), el worker lo detecta, **rebobina** al bloque de despliegue, lo registra y **degrada** la
salud mientras el `lag` sea negativo. No borres nada a mano. Detalle: [03 · Incidentes](../03-operacion/03-incidentes.md).

## 6. Retención y huecos abiertos

| Dato | Plazo | Mecanismo | Estado |
|---|---|---|---|
| Notificaciones enviadas | 90 días | `purgeOldNotifications` | Implementado; **sin planificador** (se ejecuta solo si alguien lo invoca) |
| Sesiones caducadas | Según expiración del refresh | Revisión periódica | **Sin planificador** |
| Logs de contingencia | Mientras dure la relación con el huésped | Revisión manual | A definir con el cliente |
| PII de operadores (`ip_address`, `user_agent`) | **Sin plazo definido** | — | **Hueco abierto**: se siguen escribiendo en claro (ADR-24) |
| Datos de viajeros | **No se almacenan** | — | Decidido y comprobado (ADR-20) |

Otros huecos comprobados en M9 y no resueltos:

- `nfts.room_type` está restringido a `SIMPLE` o `SUITE`: el tipo **doble** existe en el dominio y en
  el contrato (con royalty del 5 %) pero **no se persiste**, así que un filtro por «doble» servido
  desde PostgreSQL no devuelve resultados.
- No se guarda el hash de la transacción que ancló el check-in (`check_in_tx_hash`): el hash se
  devuelve en la respuesta y la UI lo muestra, pero no queda traza off-chain.
- **Dos indexadores de la misma noche** (índice del listener y agregados del procesador) que pueden
  discrepar entre sí.
- `nfts.check_in_secret_enc` sigue poblándose pero el pase nuevo ya no lo usa: su retirada es deuda.

---

*Volver a [Instalación](README.md) · Diccionario completo: [`../../diccionario_datos.md`](../../diccionario_datos.md)*

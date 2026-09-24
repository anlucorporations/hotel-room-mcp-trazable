# 03 · Runbook de incidentes

> **Cómo usar este documento**: localiza el síntoma, ejecuta el diagnóstico **antes** de tocar nada y
> aplica la acción. La columna «qué NO hacer» evita las tres respuestas que empeoran el incidente:
> borrar estado, saltarse una guarda y simular éxito.
> **Regla de oro**: la cadena decide lo que es cierto; la base de datos es un índice reconstruible.
> Cuando el índice y la cadena discrepan, **manda la cadena**.

Direcciones y variables usadas abajo:

```powershell
$RPC = "http://127.0.0.1:8545"
$C   = $env:CONTRACT_ADDRESS
```

---

## 1. Cadena muda (alerta de silencio)

| | |
|---|---|
| **Síntoma** | Alerta de **silencio de cadena** por correo (`SILENCE_THRESHOLD_MS`, 10 min por defecto); `/health` con `lag` creciendo; el monitor acumula `STALL_CYCLES` ciclos sin bloque nuevo |
| **Diagnóstico** | `cast block-number --rpc-url $RPC` dos veces separadas 30 s. `Get-Service postgresql-x64-18` no aplica: mira el proceso de Anvil. `curl.exe http://127.0.0.1:8787/health` |
| **Acción** | 1) Si Anvil murió, arráncalo: `anvil --chain-id 81234 --block-time 2`. 2) Si sigue vivo pero sin producir, revisa disco y CPU de la máquina. 3) Si reiniciaste Anvil, **redespliega** y resincroniza ([01 · Despliegue y redespliegue](01-despliegue-y-redespliegue.md) §4) |
| **Qué NO hacer** | No reinicies el worker para «que se despierte»: el problema está en la cadena, no en el índice. No silencies la alerta antes de confirmar que hay bloques |

La alerta se emite **una vez por episodio** y se **rearma** cuando vuelve un bloque: no esperes un
correo por minuto, y no interpretes el silencio posterior como recuperación.

---

## 2. `lag` negativo o checkpoint por delante de la cabeza

| | |
|---|---|
| **Síntoma** | `/health` con `lag` **negativo** (p. ej. `lastBlock: 1890`, `headBlock: 367`) y `status: "down"`; `/aggregates` a cero o congelado con noches reales en la cadena |
| **Diagnóstico** | `curl.exe http://127.0.0.1:8787/health` y compara con `cast block-number --rpc-url $RPC`. Mira el log del worker: busca el aviso de **rebobinado** al bloque de despliegue |
| **Acción** | 1) Confirma que el contrato desplegado es el que dice el registro: `Get-Content packages/shared/deployments/81234.json`. 2) Deja que el worker rebobine al `deploymentBlock` en el siguiente arranque/ciclo. 3) Comprueba que `/aggregates` vuelve a cuadrar con la cadena |
| **Qué NO hacer** | **No borres filas a mano** de `worker_checkpoints` ni de los agregados: el rebobinado es automático y está probado. No interpretes `lag` negativo como «va por delante y todo bien»: degrada la salud **a propósito** porque antes reportaba `ok` y el fallo era silencioso |

Este caso aparece sobre todo al **reiniciar Anvil**: el contrato vuelve a la misma dirección
determinista, así que un redeploy no se detecta por cambio de dirección y el checkpoint antiguo
sobrevive. Es el motivo del rebobinado.

---

## 3. RPC caído

| | |
|---|---|
| **Síntoma** | `/health/ready` → 503 con `polygonRPC: DOWN`; catálogo en estado degradado; check-in con **503 `TITULARIDAD_NO_VERIFICABLE`**; el listener acumula fallos consecutivos de RPC |
| **Diagnóstico** | `cast chain-id --rpc-url $RPC`; `curl.exe -s -o NUL -w "%{http_code}" $env:RPC_URL`; revisa que Anvil escuche en `127.0.0.1:8545` |
| **Acción** | 1) Restaura el RPC (arranca Anvil o corrige `RPC_URL`). 2) Espera un ciclo: la salud se recupera sola. 3) Repite la operación que falló (un check-in rechazado por titularidad no verificable **libera el resguardo**) |
| **Qué NO hacer** | No marques un check-in «a mano» en la base. No emitas un pase nuevo para saltarte la verificación de titularidad. No asumas que un 503 es un 401: la titularidad **no verificable** es un problema de infraestructura, no de credenciales |

No existe *failover* multi-RPC (ADR-26): un solo RPC por componente, y su caída se **declara**.

---

## 4. Redis caído

| | |
|---|---|
| **Síntoma** | `/health/ready` → 503 con `redis: DOWN`; login devuelve **500** (no 401); `logout` **propaga** el fallo en vez de simular éxito; check-in sin cerrojo ni consumo de `jti` |
| **Diagnóstico** | `& "$env:USERPROFILE\memurai\Memurai\memurai-cli.exe" ping` (debe responder `PONG`); `pwsh scripts/dev/start-redis.ps1` si no responde |
| **Acción** | 1) Arranca Redis con el guion. 2) Comprueba `/health/ready` hasta ver `redis: UP`. 3) Repite los logins y check-ins afectados |
| **Qué NO hacer** | No interpretes un **500** en el login como credenciales inválidas: el guard no debe confundir una caída de Redis con un 401, y si lo hiciera sería un defecto. No toques `REDIS_URL` para apuntar a otro servidor «temporal» en producción |

Redis sostiene tres cosas que **no** se pueden sustituir por memoria del proceso: la **cola única** de
correo, la **blocklist** de JWT y los **locks** de check-in y quema.

---

## 5. PostgreSQL sin conexiones (pool agotado)

| | |
|---|---|
| **Síntoma** | La web devuelve *timeouts* de 5 s bajo carga; en el log del SSR aparece `timeout exceeded when trying to connect`; el catálogo cae a su respaldo por RPC |
| **Diagnóstico** | `SELECT count(*) FROM pg_stat_activity;` y `SHOW max_connections;`. Compara con `DATABASE_POOL_MAX` (hoy 20). Comprueba `pg_stat_activity` por estado y por aplicación |
| **Acción** | 1) Reduce la concurrencia del generador de carga (deja de medir desde la misma máquina). 2) Dimensiona `DATABASE_POOL_MAX` según `max_connections` y el número de procesos. 3) Cachea el catálogo o pon la capa CDN delante (D-11) |
| **Qué NO hacer** | No subas `max_connections` sin medir el coste de memoria. No bajes el perfil de la prueba de carga para que la certificación salga verde: el perfil de 200 concurrentes **no cumple** (31 % de *timeouts*) y así está declarado |

Referencia medida: 50 concurrentes → 9.119 peticiones, 0 errores, p95 172 ms (**cumple**);
200 concurrentes → 3.114 peticiones, 974 errores (**31 %**), todos por pool agotado.

---

## 6. Saldo de gas bajo

| | |
|---|---|
| **Síntoma** | Alerta del monitor de saldo de gas; aviso del planificador de quema si la wallet baja de `BURNER_MIN_BALANCE_NATIVE`; el ciclo de quema puede quedar incompleto |
| **Diagnóstico** | `cast balance <BURNER_ADDRESS> --rpc-url $RPC` y `cast balance <RECEPTION_ADDRESS> --rpc-url $RPC`. Contrasta con `MIN_GAS_NATIVE` (monitor) y `BURNER_MIN_BALANCE_NATIVE` (worker) |
| **Acción** | 1) Recarga la wallet operativa. 2) Confirma que el cerrojo del día se liberó y que el ciclo de quema reintenta. 3) Verifica que el monitor **rearma** el aviso si el saldo vuelve a caer |
| **Qué NO hacer** | No uses la wallet de **recepción** para quemar ni al revés: cada hot-wallet tiene un solo rol y esa separación es lo que limita el daño de una clave comprometida. No firmes desde el admin para «ahorrar» gas |

El monitor avisa **al entrar en fallo**, no en cada ciclo: no esperes un correo por vuelta.

---

## 7. Quema que descarta tokens

| | |
|---|---|
| **Síntoma** | El ciclo de quema termina con `skippedTokens` no vacío en el log y en el resultado del ciclo; algunas noches caducadas siguen sin quemarse |
| **Diagnóstico** | Revisa el resultado del ciclo en el log del worker; comprueba el estado real de las noches descartadas: `cast call $C "isExpired(uint256)(bool)" <tokenId> --rpc-url $RPC` y `cast call $C "soldOnce(uint256)(bool)" <tokenId> --rpc-url $RPC` |
| **Acción** | 1) Comprueba el saldo de gas (§6) y recarga si procede. 2) Recuerda el diseño: la simulación previa con **reintento token a token** evita que una noche no quemable tumbe el lote. 3) Si el descarte se repite, ábrelo como incidencia: **la quema no alerta** de los descartes, solo los registra (deuda declarada) |
| **Qué NO hacer** | No marques filas como `BURNED` a mano: el worker marca **solo** los tokens que declaran los eventos `Burn` del recibo. No fuerces un lote mayor que `burnBatchMax()` |

---

## 8. Correo en `FAILED`

| | |
|---|---|
| **Síntoma** | Filas `FAILED` en `email_notifications`; aviso a DevOps cuando un correo **agota los reintentos**; `emailDegraded: true` en `/health` |
| **Diagnóstico** | `psql "$env:DATABASE_URL" -c "SELECT status, count(*) FROM email_notifications GROUP BY status;"` y `SELECT id, event_type, attempts, created_at FROM email_notifications WHERE status='FAILED' ORDER BY created_at DESC LIMIT 20;` |
| **Acción** | 1) Revisa el proveedor SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`) y la conectividad. 2) Corrige la causa y vuelve a encolar (la **reconciliación** periódica recupera lo atascado; un `FAILED` que ya agotó intentos es el que hay que reintentar). 3) Documenta el incidente si afectó a avisos de venta |
| **Qué NO hacer** | No borres las filas `FAILED` para «limpiar»: son el rastro del fallo. No pongas `SMTP_PASS` en un fichero versionado. No cuentes con la purga de `SENT` a 90 días: **no tiene planificador** y no se ejecuta sola |

El SMTP caído **no** bloquea el ciclo de ventas: la cola persiste el trabajo por diseño (ADR-21).

---

## 9. Contrato en pausa (`CONTRATO_EN_PAUSA`)

| | |
|---|---|
| **Síntoma** | Compras y escrituras rechazadas con **503 `CONTRATO_EN_PAUSA`**; el revert `EnforcedPause` aparece en el diagnóstico; catálogo y `/reventa` no ofrecen compra |
| **Diagnóstico** | `cast call $C "paused()(bool)" --rpc-url $RPC`. Revisa quién pausó (pantalla `/admin/pausa` y eventos `Paused`/`Unpaused`) |
| **Acción** | 1) Confirma que la pausa es **deliberada** (mantenimiento, incidencia de seguridad). 2) Si lo es, comunica la ventana y reanuda con `unpause()` desde `/admin/pausa`. 3) Si **no** lo es, trátalo como incidente de seguridad: revisa el operador con `PAUSER_ROLE` |
| **Qué NO hacer** | **No lo diagnostiques como avería** de anclaje o de RPC: es un estado de negocio. No intentes «rodear» la pausa desde otra ruta: `mint` y `markCheckedIn` son `whenNotPaused` a propósito |

Nota: `withdrawFunds` **sí** está permitido en pausa (es `onlyRole(TREASURER_ROLE) nonReentrant`): es
una vía de remediación, no un defecto.

---

## 10. Resguardo ya usado (`TICKET_YA_USADO`)

| | |
|---|---|
| **Síntoma** | Segundo escaneo del mismo QR → **409 `TICKET_YA_USADO`**, aunque el mostrador insista en que es el primer intento |
| **Diagnóstico** | Estado real de la noche: `cast call $C "isCheckedIn(uint256)(bool)" <tokenId> --rpc-url $RPC` y `cast call $C "ownerOf(uint256)(address)" <tokenId> --rpc-url $RPC`. **Sin** el índice por delante: la cadena es la verdad |
| **Acción** | 1) Si `isCheckedIn` es `true`, el check-in **ya ocurrió**: entrega la llave, no un pase nuevo. 2) Si `isCheckedIn` es `false` y el resguardo está gastado, emite uno nuevo **desde la wallet del titular** (firma EIP-712; los tres endpoints exigen titularidad) |
| **Qué NO hacer** | No reutilices el resguardo gastado. No liberes el `jti` a mano en Redis: el consumo es la garantía de **un solo uso**, incluso entre puestos. No emitas un pase con la wallet del hotel suplantando al titular |

---

## 11. Check-in en proceso (`CHECKIN_EN_PROCESO`)

| | |
|---|---|
| **Síntoma** | **409 `CHECKIN_EN_PROCESO`** al escanear desde un segundo puesto, con el resguardo todavía válido |
| **Diagnóstico** | Es el **cerrojo por noche** (`RedisCheckInLock`, TTL **15 s**) haciendo su trabajo: otro puesto está anclando la misma noche. Comprueba `/health/ready` (`redis: UP`) y la latencia del RPC |
| **Acción** | 1) Espera unos segundos y reintenta en el **mismo** puesto: el resguardo **no se ha gastado**. 2) Si el RPC está lento o caído, resuélvelo primero (§3) |
| **Qué NO hacer** | No borres el cerrojo en Redis. No pidas al huésped un resguardo nuevo: el suyo sigue siendo válido. No difundas un segundo `markCheckedIn`: la cadena consumiría la noche una sola vez y el segundo puesto vería un 200 con un hash que revierte |

**Ventana residual declarada**: si un anclaje se colgara más de 15 s (TTL del cerrojo), otro puesto
podría entrar y difundir un segundo `markCheckedIn`; la cadena lo revertiría con `AlreadyCheckedIn` y
el índice quedaría coherente. Con el RPC sano el anclaje tarda ~40 ms.

---

## 12. Plantilla de cierre de incidente

1. Qué se observó (síntoma y hora).
2. Qué se comprobó (comando o endpoint **con su salida**).
3. Qué se hizo y qué efecto tuvo.
4. Si el incidente reveló una causa que el sistema no detectaba o diagnosticaba mal, **abre deuda**:
   primera línea en `RepoTecnico/estado_proyecto.md` y, si cambia una decisión, un **ADR nuevo**
   (los ADR no se reescriben: se sustituyen).
5. Si el incidente afectó a dinero o a un check-in, deja la traza del bloque y del hash.

---

*Volver a [Operación](README.md) · E2E y verificación: [02 · E2E y verificación](02-e2e-y-verificacion.md)*

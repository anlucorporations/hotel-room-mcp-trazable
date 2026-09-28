# 03 · E2E y verificación reproducible

> **Regla del proyecto**: ninguna afirmación de calidad sin instrumento ni artefacto (ADR-23). Los
> cinco E2E on-chain (M4–M7 y F8), la prueba de carga y la de recuperación escriben su evidencia en
> [`../../evidencias/`](../../evidencias).
> **Aviso que no se puede saltar**: **para el worker** antes de lanzar los E2E on-chain. El listener
> indexa el mismo contrato y **reescribe** las filas que los guiones afirman; con el worker vivo, el
> E2E de M5 falla con «El índice off-chain queda en CHECKED_IN» sin que haya nada roto en el código.

## 1. Prerrequisitos comunes

1. **Cadena**: Anvil en `http://127.0.0.1:8545`, `chainId 81234`, con el contrato desplegado.

   ```powershell
   cast chain-id --rpc-url http://127.0.0.1:8545
   cast code $env:CONTRACT_ADDRESS --rpc-url http://127.0.0.1:8545
   ```

2. **Servicios**: PostgreSQL 18 y Redis en marcha (M5, M6 y M7 los necesitan de verdad).
3. **Registro de despliegue sincronizado**: `packages/shared/deployments/81234.json` válido.
4. **Roles repartidos** según lo que exige cada guion (el pipeline los declara explícitamente porque
   sin ellos el despliegue es correcto pero los E2E fallan):

   | Rol | Cuenta esperada | Por qué |
   |---|---|---|
   | `DEFAULT_ADMIN_ROLE` | cuenta 1 (`ADMIN_ADDRESS`) | M4 comprueba que el **desplegador ya NO** es admin |
   | `BURNER_ROLE` | cuenta 2 | M6 firma la quema |
   | `PAUSER_ROLE` | cuenta 1 | M7 comprueba `EnforcedPause` |
   | `RECEPTION_ROLE` | cuenta 3 (`RECEPTION_WALLET_PRIVATE_KEY`) | M4 y M5 anclan el check-in |

5. **`.env` cargado**: los guiones hacen `process.loadEnvFile`, que **lanza** si el fichero no existe.
6. **Worker parado** (ver el aviso de arriba).
7. **Operador de recepción aprovisionado** para M5 (contraseña + TOTP):

   ```powershell
   pnpm --filter @hotel/shared provision:reception -- --username recepcion@hotel.es
   ```

## 2. Orden de ejecución

```
pnpm test:e2e:m4  →  pnpm test:e2e:m5  →  pnpm test:e2e:m6  →  pnpm test:e2e:m7  →  pnpm test:e2e:f8
```

Los guiones de `packages/contracts/scripts/e2e/` son **idempotentes y re-ejecutables**: eligen la
**primera fecha libre** de su habitación de prueba y calculan las fechas con el **reloj de la cadena**,
no con el de la máquina. Por eso siguen pasando después del viaje en el tiempo de M6.

El de **F8** es el único que no necesita PostgreSQL ni Redis (no escribe índice: lee el estado
**on-chain** con `ownerOf`) y **registra él mismo** sus habitaciones. Se puede lanzar sin preparar
nada más que una cadena:

```bash
bash scripts/dev/f8-mint-window-sweep.sh     # Anvil desechable + despliegue + banco de pruebas
```

No ejecutes dos E2E ni dos suites a la vez en el mismo workspace: Foundry reescribe su registro de
despliegue y `tsup` limpia `packages/shared/dist`.

## 3. M4 — compra primaria, reventa y `claim`

```powershell
pnpm test:e2e:m4
```

**Qué demuestra** (39/39 aserciones, firma de verdad): minteo, compra primaria, listado, cancelación,
re-listado, reventa, cobro por `claim()` y las guardas del contrato. Comprueba además el **calldata
byte a byte**: el `input` **minado** coincide con el objeto verificado por `verifiedTxRequest`.

| Dato | Valor documentado |
|---|---|
| Habitación | 102 (primera fecha libre en cada ejecución) |
| Precio primaria / reventa | 0,1 ETH / 0,2 ETH |
| Royalty | 5 % = 0,01 ETH al hotel; 0,19 ETH al vendedor |
| Evidencia | [`../../evidencias/m4-e2e-anvil.json`](../../evidencias/m4-e2e-anvil.json) |

**Cómo leer la evidencia**: claves `hito`, `premisa`, `fecha`, `red` (`chainId`, `rpc`, `contrato`,
`treasury`), `noches` (`room`, `mintPriceWei`, `resalePriceWei`, `dateYYYYMMDD`), `transacciones`
(`mint`, `buyPrimary`, `list`, `unlist`, …) y el array `comprobaciones` en orden.

**Cómo verificarla tú mismo** (una transacción del artefacto):

```powershell
cast receipt <hash> --rpc-url http://127.0.0.1:8545      # status 1, bloque monótono
cast tx <hash> --rpc-url http://127.0.0.1:8545           # `to` = contrato canónico, selector correcto
```

## 4. M5 — check-in anclado on-chain

```powershell
pnpm test:e2e:m5
```

**Qué demuestra** (33 comprobaciones): que el check-in **se ancla en la cadena** o no ocurre; que el
**mismo resguardo dos veces** se rechaza con **409 `TICKET_YA_USADO`**; que la **contingencia sin PII**
funciona y que rechaza como «código de resguardo» valores que parecen datos personales
(`JuanPerezGarcia`, `600123456`, `12345678`); y que la titularidad EIP-712 es obligatoria.

| Dato | Valor documentado |
|---|---|
| Habitaciones | 105 (camino QR) y 106 (contingencia) |
| Precio primaria | 0,11 ETH |
| Latencia del anclaje medida en servidor | **~41 ms** (SLA de recepción < 500 ms) |
| Evidencia | [`../../evidencias/m5-e2e-anvil.json`](../../evidencias/m5-e2e-anvil.json) |

## 5. M6 — automatismos (con **viaje en el tiempo**)

```powershell
pnpm test:e2e:m6
```

**Qué demuestra** (20/20), en este orden: el **listener escribe la fila del índice** desde el evento
`Mint` (sin sembrarla a mano); la cadena **viaja en el tiempo** para caducar la noche; el
**planificador** quema con `burnExpired`; el recibo confirma, se emite `Burn`, `ownerOf` revierte y el
índice queda `BURNED`; el aviso `BURN_EXECUTED` **sale por la cola única** y un **sumidero SMTP
local** recibe el mensaje (fila → `SENT`); la **reconciliación** reencola una notificación atascada; un
**servicio de push local** verifica el JWT VAPID y **descifra** la notificación (RFC 8291/8292); y la
**alerta de silencio** se dispara y queda encolada.

| Dato | Valor documentado |
|---|---|
| Habitación | 108 (primera fecha libre de cada ejecución) |
| Precio primaria | 0,12 ETH |
| Evidencia | [`../../evidencias/m6-e2e-anvil.json`](../../evidencias/m6-e2e-anvil.json) |

> **Viaje en el tiempo**: el guion adelanta el reloj de la **cadena** (~+40 días; en la práctica deja
> Anvil adelantado unos dos meses). Es lo que permite caducar una noche sin esperar. Para volver al
> presente: **reiniciar Anvil → redesplegar → `sync` → actualizar `.env` → arrancar el worker**
> ([01 · Despliegue y redespliegue](01-despliegue-y-redespliegue.md) §5).

## 6. M7 — dashboard, agregados y accesibilidad de las cifras

```powershell
pnpm test:e2e:m7
```

**Qué demuestra** (33 comprobaciones) sobre Anvil + PostgreSQL reales: tres ventas primarias (simple,
doble y suite) y dos reventas con su `RoyaltyPaid`, repartidas en **dos meses distintos viajando en el
reloj de la cadena**, más una venta en la **frontera de mes** (00:30 del día 1 en Madrid = 23:30 UTC
del último día del mes anterior) que se cuenta en el mes del hotel y **no** en el de UTC. Los
contadores de la base incluyen exactamente lo que dicen los recibos. Y el criterio de aceptación: la
serie mensual, el desglose por tipo y el ranking que calcula el **SQL** son **idénticos** a los que
deriva del histórico `summarizeHistory`, la vía independiente. Se comprueba además el mismo payload
por HTTP, que `buy` revierte con `EnforcedPause` con el contrato en pausa, que tras una reventa manda
el dueño nuevo on-chain y que `ownerOf` de una noche quemada revierte de verdad. El relleno de fechas
deja **0 ventas fuera de la serie** (`undatedSalesCount: 0`).

| Dato | Valor documentado |
|---|---|
| Habitaciones | simple 103, doble 119, suite 204, frontera de mes 105 |
| Evidencia | [`../../evidencias/m7-dashboard-anvil.json`](../../evidencias/m7-dashboard-anvil.json) |
| Verificación adversarial del hito | [`../../evidencias/m7-verificacion-adversarial.md`](../../evidencias/m7-verificacion-adversarial.md) |

**Aviso**: cada ejecución **regenera** el artefacto y **cambia los hashes** (elige la primera fecha
libre y cada quema es una transacción nueva). La tabla de hashes que aparece en
[`../../estado_proyecto.md`](../../estado_proyecto.md) corresponde a la ejecución documentada, no a la
tuya.

## 7. F8 — barrido multi-habitación y ventana de acuñación

```bash
pnpm test:e2e:f8        # contra el Anvil y el contrato configurados en .env
# o, sin preparar nada (Anvil desechable + despliegue + registro de habitaciones):
bash scripts/dev/f8-mint-window-sweep.sh
```

**Qué demuestra** sobre una cadena real: el **registro dinámico** de habitaciones (simple, doble y
suite), el **barrido** de la ventana para las tres (15 noches acuñadas con su recibo en `success`),
la **idempotencia** de D-16 (el segundo barrido encuentra **0 noches pendientes** y **no firma ninguna
transacción**), que **volver a acuñar la misma noche revierte on-chain** (nada de tokens duplicados) y
el **aviso de agotamiento** de D-17: con 5 noches libres la ventana está en agotamiento (< 7) y al
ampliarla a 12 vuelve a estar holgada, que es cuando el planificador del worker **rearma** el aviso.

| Dato | Valor documentado |
|---|---|
| Habitaciones | simple 101, doble 116, suite 201 |
| Ventanas | corta 5 días · ampliada 12 días |
| Evidencia | [`../../evidencias/f8-mint-window-sweep.json`](../../evidencias/f8-mint-window-sweep.json) |
| Aviso por correo (worker) | `MINT_WINDOW_ALERT_EMAIL` / `MINT_WINDOW_ALERT_HOUR_LOCAL` / `MINT_WINDOW_CHECK_INTERVAL_MS` |

**Aviso**: cada ejecución **regenera** el artefacto y **cambia los hashes** (las fechas se calculan
desde el reloj de la cadena). El banco de pruebas **no** sustituye a la verificación del aviso por
correo de extremo a extremo: eso exige SMTP real (ver el manual de variables de entorno).

## 8. Prueba de carga

```powershell
pnpm test:load
```

- Mide por **HTTP real** el sistema en marcha (worker en 8787 y, si está levantada, la web en 3000).
- **Valida el contenido** de cada respuesta: no basta un 200, una respuesta de mentira cuenta como fallo.
- **Aborta** si el worker no responde, en vez de publicar cifras.
- **SLA**: `p95 < 500 ms` y tasa de error `< 1 %`; si no se cumple, el comando sale con error.
- Artefacto: [`../../evidencias/load-test.json`](../../evidencias/load-test.json).

Perfil medido y documentado: **50 usuarios concurrentes, 15 s** → **9.119 peticiones**, **0 errores**,
p50 67,3 ms, **p95 172,2 ms**, p99 327,1 ms, 606,4 rps, sobre `worker:/health`, `worker:/aggregates` y
`worker:/history`. Veredicto: **CUMPLE**.

**Perfil de 200 concurrentes: NO cumple** en una sola máquina y se publica tal cual: 3.114 peticiones,
**974 errores (31 %)**, todos por *timeout* de 5 s al **agotarse el pool de PostgreSQL de la web**
(`timeout exceeded when trying to connect`); el plano de datos del worker no da ni un error pero sube
a p95 ≈ 1,2 s. Dos causas separadas: contención de la propia máquina (el generador compite con los
servicios; k6 desde otra máquina sigue pendiente, B-3) y pool sin dimensionar para 200 SSR
simultáneos. El pipeline usa el perfil de 50 declarado; **no se baja el perfil para que salga verde**.

Guion alternativo para cuando k6 esté instalado:

```powershell
pnpm test:load:k6      # k6 run scripts/load-tests/catalog-load.js
```

## 9. Prueba de recuperación ante desastre

```powershell
pnpm test:dr
```

Qué hace: `pg_dump` real con su **SHA-256**, **restauración real** cronometrada en un esquema de la
misma base, comparación **tabla por tabla** (recuentos y sumas de control), limpieza del esquema
siempre y escritura del artefacto [`../../evidencias/dr-verify.json`](../../evidencias/dr-verify.json).

Última ejecución documentada: **283 filas comparadas, 6/6 tablas idénticas, RTO 0,73 s** → **CUMPLE**.
**Nota de alcance**: el rol de la aplicación no tiene `CREATEDB`, así que la restauración se hace en un
esquema, no en una base nueva. Detalle y runbook: [02 · Base de datos](../02-instalacion/02-base-de-datos.md).

## 10. Accesibilidad (axe + Playwright)

```powershell
pnpm --filter @hotel/web exec playwright test
```

Escanea seis rutas (`/`, `/reventa`, `/historico`, `/admin/dashboard`, `/admin/mint`, `/asistente`) en
los proyectos `chromium` y `mobile`: **12/12 sin violaciones critical/serious** sobre el HTML real y la
paleta real.

**Deuda declarada**: el escenario **con datos** no entra todavía en el análisis — el spec fuerza
`WORKER_BASE_URL` a un puerto muerto (vistas degradadas) y el dashboard exige sesión, así que las
gráficas y tablas con cifras reales no se escanean.

## 11. Qué **no** está verificado (y por tanto no se declara)

- **LCP < 2,5 s en 4G móvil (RNF-01)**: no hay instrumento de medición en el repositorio. **Sin medir**.
- **Cobertura ≥ 80 %**: no alcanzada; el hueco está localizado y el trinquete impide empeorar
  ([04 · Rendimiento y cobertura](../04-mantenimiento/02-rendimiento-y-cobertura.md)).
- **Reorg real de Polygon**: 32 confirmaciones son configuración documentada, nunca probadas.
- **`pnpm audit` (SCA) sin triar** y **digest de la imagen de Slither sin fijar**.
- **k6 no instalado** (B-3): el perfil de 200 concurrentes medido desde otra máquina queda pendiente.

---

*Volver a [Operación](README.md) · Incidentes: [03 · Incidentes](03-incidentes.md)*

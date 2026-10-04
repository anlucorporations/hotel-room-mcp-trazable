# Estado de la inyección de datos · @InyectaDatos

> Memoria de avance del skill. Actualizar en cada paso.

## Avance

| Paso | Estado | Notas |
|---|---|---|
| 1. Análisis / `estructura_datos.md` | ⏳ pendiente | Existe documentación previa en `RepoTecnico/` (diccionario_datos, diagrama_er) a reutilizar |
| 2. Casos de uso / `casos_uso_inyeccion.md` | ⏳ pendiente | Reutilizar `docs/CASOS-DE-USO.md` y casos de incremento v2/v3 |
| 3. Cuentas / `cuentas_anvil.md` | ✅ hecho | Ver below |
| 4. Asignación de roles | ✅ hecho | Cuentas 0–3 internas confirmadas; huéspedes simulados = cuentas 4–9 (aprobado) |
| 5. Plan de inyección | ✅ aprobado | Plan completo aprobado por el usuario (P1-P3 + huéspedes 4-9 + fases) |
| 6. Script | ✅ ejecutado | Reutilizado y adaptado `inject-data.ts`: dry-run OK, inyección real cadena+BD, 2 check-ins manuales |

## Paso 3 · Registro (2026-02-27)

- Anvil **no estaba en marcha**; se arrancó una instancia limpia:
  `anvil --chain-id 81234 --block-time 2` (job en segundo plano, sesiones
  DSH). ⚠️ Reinicios futuros pierden el estado.
- Consultado con `cast`: chain-id 81234, 10 cuentas, balances 10.000 ETH,
  nonces 0. Detalle completo en [`cuentas_anvil.md`](cuentas_anvil.md).
- **Hallazgo 1 (corregido)**: el `.env` **sí coincide** con las cuentas Anvil 0–3
  (verificado con `cast wallet address`). La alarma inicial era un error de la
  documentación, que mostraba prefijos de clave como si fueran direcciones;
  manual corregido. Decisión A = sin cambios en `.env`.
- **Hallazgo 2**: la cadena está recién creada: `HotelNights` **no está
  desplegado** (`cast code` → vacío). Requerido redespliegue antes de inyectar.
- **Hallazgo 3**: Redis (`:6379`) no responde; PostgreSQL (`:5432`) sí.

## Decisiones del usuario (Paso 4, 2026-02-27)

1. **Opción A aprobada** — tras la verificación resultó que `.env` ya era
   correcto: no hay cambios; se corrigió el manual de variables que inducía a
   error (direcciones reales de cuentas 1–3 documentadas).
2. **Huéspedes simulados**: cuentas Anvil 4–9 del pool determinista,
   financiadas vía faucet.

## Ejecución del plan (P1–P6, 2026-02-27)

- P1 ✅ redespliegue `HotelNights` (bloque 20) + `sync` + `.env`
  (`NEXT_PUBLIC_DEPLOYMENT_BLOCK=20`); roles verificados con `cast`.
- P2 ✅ Redis 7.0.15 sin root (`.deb` extraído → `/tmp/redis7`).
- P3 ✅ faucet con 100 ETH y huéspedes 4–9 con 20 ETH.
- Adaptación ✅: `dev-accounts.ts` (pool 0–9) + `inject-data.ts` (roles por
  hot-wallet, compradores 4–9, reventa 7→4). Typecheck: sin tsconfig en contracts;
  validado por ejecución (dry-run + real).
- Inyección ✅ cadena: 50 habitaciones, 6 mints, 6 ventas, 1 reventa (royalty
  0.0075 ETH retenido; vendedor 0.1425 ETH pendiente). BD ✅: 50 `rooms`,
  operadores `admin@hotel.es` / `recepcion@hotel.es` (credenciales impresas una
  vez, respaldadas fuera del repo en `/tmp/operadores-inyeccion-local.txt`).
- Check-ins ✅ (2, firmados por la hot-wallet 3). Quema ⏸ omitida (sin noches
  caducadas en cadena recién creada).

## Pendientes

1. **Servicios volátiles**: tras un reinicio del entorno, volver a levantar
   anvil/redis/postgres y redesplegar (pasos reproducibles en `cuentas_anvil.md` §4).
2. **Quema programada**: demostrar con noches caducadas (o `BURN_INTERVAL_MS` en
   dev) cuando el worker esté en marcha.
3. **Multisig Gnosis Safe** (B-7) sigue fuera de alcance.


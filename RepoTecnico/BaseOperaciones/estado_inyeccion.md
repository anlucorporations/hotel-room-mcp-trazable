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

## Tarea en curso · Personal del hotel (2026-10-05)

| Paso | Estado | Notas |
|---|---|---|
| 1. Análisis / `estructura_datos_personal.md` | ✅ hecho | Diccionario de `admin_users` + `mfa_recovery_codes`, roles (D-56), validaciones, `provisionUser` y capa B sin FK |
| 2. Casos de uso | ✅ reutilizados | CU-42 (Sistemas → Usuarios, `docs/SRS.md:376`); sin documento nuevo |
| 5. Plan de inyección | ⏳ esperando decisiones | 1) alcance A/B · 2) vía API o BD · 3) plantilla de personas |
| 6. Script `scripts/personal.ts` | ⏳ pendiente | Se genera tras aprobar el plan |

> Estado real de partida: existen `admin@hotel.es` (owner) y `recepcion@hotel.es` (recepción) del
> `inject-data.ts`; **housekeeping y mantenimiento no tienen cuenta todavía**. Ninguna cuenta es
> borrable: la baja es `active = false`.


---

## Inyección `@planta` — esquema de habitaciones (2026-10-05)

**Estado: EJECUTADA en producción.** 40 habitaciones creadas con su foto y sus servicios.

### Qué hace el script

`scripts/planta.ts` (**@planta**, exclusivo de este proyecto) crea la planta aprobada por el
responsable y registra en off-chain la dirección de la foto de cada habitación.

| | Detalle |
|---|---|
| Habitaciones | **40** · plantas **1, 2, 3 y 4** · 10 por planta |
| Reparto por planta | `x01`–`x03` **dobles** · `x04`–`x05` **suites** · `x06`–`x10` **simples** |
| Precios | simple **0,06 ETH** · doble **0,10 ETH** · suite **0,80 ETH** |
| Estado inicial | `DRAFT` (publicar es un caso de uso aparte) |
| Servicios | Los 8 del catálogo. Los que no tienen código (servicio a la habitación, escritorio, jacuzzi, iluminación graduable, vistas a la piscina) van **en la descripción**, como se acordó |
| Fotos | Una imagen **por tipo** de `docs/imagenes/`, materializada con el nombre canónico de cada habitación y registrada en `room_images` |

### Cómo se ejecuta

```bash
# Modo seco (imprime el plan; no crea nada)
pnpm --filter @hotel/shared exec tsx ../../scripts/planta.ts

# Ejecución real (pide confirmación; --yes para no interactivo)
export ADMIN_USER=… ADMIN_PASSWORD=… ADMIN_TOTP_SECRET=…
pnpm --filter @hotel/shared exec tsx ../../scripts/planta.ts --apply

# Solo las fotos
pnpm --filter @hotel/shared exec tsx ../../scripts/planta.ts --images-only --yes
```

Registro de cada ejecución: `.deploy-logs/planta-<fecha>.log` (ignorado por git).

### Lecciones operativas (importantes para la próxima inyección)

1. **Límite del borde (WAF).** El alta en ráfaga devuelve **HTTP 429** («Edge WAF Rate Limit»). El
   script ya reintenta con retroceso exponencial y espacia las altas, **pero lo decisivo** fue
   consultar primero el listado y no enviar altas de habitaciones que ya existen: 37 respuestas `409`
   consumían la cuota y la petición siguiente recibía el 429.
2. **Idempotencia.** Volver a ejecutarlo es seguro: omite lo que ya existe (consulta previa) y no
   duplica fotos.
3. **Las fotos se sirven desde el contenedor.** La subida por la API escribe el fichero en la
   instancia que atiende la petición; para que esté garantizado en todas las instancias y sobreviva a
   un redespliegue, los 40 ficheros se guardan también en `docs/imagenes/` del repositorio (viajan en
   la imagen de la web).

### Resultado verificado (producción)

| Comprobación | Resultado |
|---|---|
| Habitaciones | **40** (101–110, 201–210, 301–310, 401–410) · 12 dobles · 8 suites · 20 simples |
| Ficha doble (101) | planta 1 · 4 personas · 2 camas · 26 m² · balcón · 0,10 ETH · WIFI/AC/TV/baño privado/balcón/calefacción |
| Ficha suite (104) | planta 1 · 2 personas · cama king · 42 m² · vista GARDEN · 0,80 ETH · + minibar · salón y terraza |
| Ficha simple (106) | planta 1 · 2 personas · 18 m² · 0,06 ETH · WIFI/AC/TV/baño privado/calefacción |
| Fotos | Las 40 con su fila en `room_images` (`is_cover`) y servidas por `/api/rooms/images/<fichero>` |

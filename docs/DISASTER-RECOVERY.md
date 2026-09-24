# Recuperación ante desastres y continuidad

> **Versión**: 2.0.0 (sustituye a la 1.0.0, cuyas cifras no eran reproducibles)
> **Fecha**: 2026-09-23 · **Hito**: M8 · **Decisión de origen**: D-08
> **Artefacto de la verificación**: [`RepoTecnico/evidencias/dr-verify.json`](../RepoTecnico/evidencias/dr-verify.json)
> **Objetivos declarados**: **RPO** = último volcado disponible · **RTO medido** = **0,73 s**
> en este entorno (el objetivo de 4 h era del plan antiguo y no tiene instrumento en el repositorio)

## 0. Qué cambió respecto a la versión anterior

La v1.0.0 describía volcados cifrados en Google Cloud Storage, snapshots horarios, recuperación de una
VM en GCP y una prueba de recuperación **que «restauraba» un objeto en memoria**. Esa prueba se retiró
como certificación falsa (hallazgo H-03). Lo que hay hoy es más modesto y **comprobable**: un volcado
real, una restauración real y una comparación tabla por tabla, ejecutables con un comando.

## 1. Qué es fuente de verdad y qué es índice

| Dato | Dónde vive | ¿Necesita copia? |
|---|---|---|
| Propiedad de las noches, listados, ventas, check-in, royalties, saldos pendientes | **La cadena** (`HotelNights`) | No: se puede reconstruir leyendo la cadena desde el bloque de despliegue |
| Índice de noches, histórico de ventas, agregados y contadores | PostgreSQL | **Sí**, pero es reconstruible desde la cadena |
| Operadores (hash bcrypt, semilla TOTP cifrada), sesiones, códigos de rescate | PostgreSQL | **Sí, y es lo único que no se puede reconstruir** |
| Cola de correo y suscripciones push | PostgreSQL | Sí (se pierden avisos, no dinero) |
| Contingencia de check-in | PostgreSQL | Sí (auditoría, sin datos personales) |
| Checkpoints y claves de idempotencia del worker | PostgreSQL | Sí, para no reprocesar |

**Consecuencia práctica**: perder el índice no es perder el negocio. Lo que hay que proteger de verdad
son las **credenciales de los operadores** (sin ellas nadie entra al panel ni a recepción) y el propio
volcado.

## 2. Cómo se hace una copia

```bash
# Volcado lógico de la base del proyecto (es lo que hace la verificación de DR)
pg_dump --no-owner --no-privileges -d "$DATABASE_URL" -f hotel_backup.sql
# Huella para comprobar que lo restaurado es lo volcado
sha256sum hotel_backup.sql > hotel_backup.sql.sha256
```

Recomendaciones operativas (no automatizadas hoy en el repositorio):

1. **Frecuencia**: diaria para las tablas de credenciales y de negocio; el histórico se puede regenerar.
2. **Cifrado en reposo**: el volcado contiene correos y hashes; hay que cifrarlo (AES-256) o almacenarlo
   en un destino cifrado, y guardar la clave **fuera** del mismo destino.
3. **Retención**: al menos 7 días de diarios y 4 semanales; el histórico público no necesita retención.
4. **Fuera del servidor**: una copia en otro proveedor o región. Un volcado que vive en la misma máquina
   no protege del fallo que importa.
5. **Verificación periódica**: una copia que nunca se ha restaurado no es una copia (ver §3).

## 3. Verificación reproducible de la recuperación

```bash
pnpm test:dr     # requiere PostgreSQL en marcha con la base del proyecto
```

Qué hace, de verdad:

1. Ejecuta **`pg_dump`** de la base real y anota su tamaño y su **SHA-256**.
2. **Restaura** el volcado en un **esquema** de la misma base y cronometra la operación (**RTO medido:
   0,73 s** en este entorno).
3. Compara **tabla por tabla** entre origen y restaurada: recuentos y sumas de control.
   Resultado de la última ejecución: **283 filas comparadas, 6/6 tablas idénticas**.
4. Limpia el esquema de verificación **siempre**, incluso si algo falla, para no contaminar el siguiente
   volcado.
5. Escribe el artefacto `RepoTecnico/evidencias/dr-verify.json` con las cifras y las notas de alcance.

**Nota de alcance declarada en el artefacto**: el rol de la aplicación **no tiene `CREATEDB`** (crear
una base exige el superusuario), así que la restauración se hace en un esquema de la misma base, no en
una base nueva. El volcado, la restauración y la comparación son reales; el aislamiento no es total.

## 4. Runbook: se ha perdido la base de datos

| Paso | Acción | Comprobación |
|---|---|---|
| 1 | Provisionar PostgreSQL y crear el rol `hotel_admin` y la base `hotel_nft_dev` (más la extensión `pgcrypto`, como superusuario) | `psql "$DATABASE_URL" -c '\dt'` |
| 2 | Restaurar el último volcado | `psql -d "$DATABASE_URL" -f hotel_backup.sql` |
| 3 | Verificar integridad contra la huella | `sha256sum -c hotel_backup.sql.sha256` |
| 4 | Arrancar el worker: **aplica las migraciones que falten** y reindexar desde el bloque de despliegue | `/health` con `lag` pequeño y decreciente |
| 5 | Comprobar que las cifras cuadran con la cadena | `/aggregates` (minteadas, vendidas, quemadas, royalties) |
| 6 | Reaprovisionar los operadores que falten | `pnpm --filter @hotel/shared provision:admin -- --username …` |
| 7 | Avisar a recepción y al propietario: las **sesiones anteriores ya no valen** | login con contraseña + TOTP |

**Si el checkpoint del worker queda por delante de la cabeza de la cadena** (por ejemplo, tras
redesplegar o reiniciar Anvil), el worker lo detecta, **rebobina** al bloque de despliegue, lo registra
con un aviso y **degrada la salud** mientras el `lag` sea negativo. No hay que borrar nada a mano.

## 5. Runbook: se ha perdido la cadena (o hay que redesplegar)

El contrato es **inmutable**: un cambio de reglas es un **redespliegue con dirección nueva** (ADR-22).

1. **Parar el worker** (si no, indexa a la vez que se cambia el contrato).
2. Reiniciar Anvil (**borra el estado**) o desplegar en el nonce siguiente (**dirección nueva**).
3. `forge script script/Deploy.s.sol:Deploy --rpc-url … --broadcast --slow` desde `packages/contracts`.
4. `pnpm --filter @hotel/contracts sync` → registro nuevo en `packages/shared/deployments/<chainId>.json`.
5. Actualizar `.env`: `CONTRACT_ADDRESS`, `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_DEPLOYMENT_BLOCK`
   y, si aplica, `NEXT_PUBLIC_FAUCET_ADDRESS`.
6. Arrancar el worker y comprobar `/health`: el checkpoint se rebobina al bloque de despliegue.
7. **Re-mintear el inventario** que deba existir: el estado on-chain anterior ya no existe.

## 6. Qué no está cubierto (deuda declarada)

- **No hay automatización de copias** en el repositorio: es un procedimiento, no un cron. Se probó y
  funcionó a mano; ponerlo en producción exige un planificador y un destino externo.
- **No hay copia cifrada verificada** de extremo a extremo (cifrado, descifrado y restauración) como
  parte de `pnpm test:dr`.
- **No hay ensayo de recuperación total del sistema** (base + servicios + cadena) en un entorno limpio.
- **No hay copia de las claves** de las hot-wallets ni del multisig: su custodia es una decisión
  pendiente del cliente (B-7) y su pérdida es irrecuperable por diseño.
- El **RTO de 0,73 s** es el de la restauración en un esquema local; no incluye aprovisionar una máquina
  nueva, DNS, certificados ni el redespliegue del contrato.

---

*Disaster recovery v2.0.0 · reescrito en M8/M9 · reproduce con `pnpm test:dr`.*

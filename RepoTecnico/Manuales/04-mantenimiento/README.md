# 04 · Mantenimiento

> **Principio**: toda decisión nueva entra en [`docs/adr/`](../../../docs/adr/README.md) **antes** de
> tocar el código, y todo cambio que proteja un **invariante** entra con su **guardián**.
> **Referencia de proceso**: [`docs/PLAN-CONSTRUCCION.md`](../../../docs/PLAN-CONSTRUCCION.md) §7.

## 1. Dónde se toca cada cosa

| Quiero cambiar… | Dónde | Qué lo prueba | Guardián que lo protege |
|---|---|---|---|
| Reglas del contrato | `packages/contracts/src/HotelNights.sol` + suite Foundry | `pnpm test:contracts` (13 ficheros de suite; re-mide el número de pruebas) | — (exige **redespliegue**, ADR-22) |
| Esquema de datos | `packages/shared/src/db/migrator.ts` | `pnpm --filter @hotel/shared test` | `architecture-guardian` (orden + paridad) |
| Un importe, una fecha o un tipo de dominio | `packages/shared/src/domain/**` | test hermano `*.test.ts` | — |
| Autenticación, TOTP o JWT | `packages/shared/src/auth/**` | `auth.test.ts`, `guard.test.ts` | `secrets-guardian`, `admin-auth-guardian` |
| Un endpoint de la web | `apps/web/src/app/api/**/route.ts` | `*.test.ts` junto a la ruta | según el área (recepción, admin, pausa) |
| El destino o el camino de firma de una compra | `apps/web/src/components/buy/verifiedTxRequest.ts` | `verifiedTxRequest.test.ts` + E2E M4 | `legacy-target-guardian` |
| El índice o los agregados | `apps/worker/src/aggregate-*.ts`, `listener-runtime.ts` | `aggregate-*.test.ts` | — |
| La cola de correo | `apps/worker/src/email-consumer.ts`, `packages/shared/src/queue/` | `email-consumer.test.ts` | — |
| La quema programada | `apps/worker/src/burn-scheduler.ts`, `packages/shared/src/burner/` | `burn-scheduler.test.ts` | — |
| El check-in | `packages/shared/src/reception/**`, `apps/web/src/app/api/reception/**` | `reception.test.ts` + E2E M5 | `reception-guardian` |
| La emisión del resguardo | `apps/web/src/lib/ticket-ownership.ts`, `packages/shared/src/passes/` | `qr.test.ts`, `pass.test.ts` | `reception-guardian` |
| Las gráficas o el CSV del dashboard | `apps/web/src/components/dashboard/**`, `apps/worker/src/aggregate-store.ts` | E2E M7 | — |
| Los colores o el contraste | `apps/web/src/**` + `packages/config/tailwind/preset.cjs` | `apps/web/src/lib/a11y/a11y.test.ts` | `a11y` (paleta real) |
| Los manuales, la sección de Ayuda o los PDF | `docs/manual-*.md` (**fuente única**) → `pnpm build:manuals` | `apps/web/src/lib/help/manuals-sync.test.ts` | `manuals-sync` + `documentation-guardian` |
| Los metadatos de un paquete | `<paquete>/package.json` | `pnpm build` / `pnpm test` | — |

## 2. Cómo añadir una migración

1. **Comprueba la decisión**: si cambia el modelo de datos de forma normativa, primero el ADR.
2. Abre `packages/shared/src/db/migrator.ts` y añade la sentencia al `INITIAL_SCHEMA_SQL`, **siempre
   idempotente**: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`,
   `CREATE INDEX IF NOT EXISTS`.
3. **Respeta el orden.** Es el invariante que más ha dolido: en PostgreSQL, `CREATE TABLE IF NOT
   EXISTS` **no añade columnas** a una tabla existente, así que el `ALTER` va **antes** del índice
   sobre la columna nueva. Con el orden inverso el worker no arranca contra una base ya creada.

   ```sql
   ALTER TABLE nfts ADD COLUMN IF NOT EXISTS tu_columna TEXT NULL;
   CREATE INDEX IF NOT EXISTS idx_nfts_tu_columna ON nfts(tu_columna);
   ```

4. Añade la misma tabla/columna a `packages/shared/src/db/schema.sql` (es referencia histórica, pero
   el guardián exige **paridad** con `runMigrations`).
5. Actualiza el diccionario: [`../../diccionario_datos.md`](../../diccionario_datos.md).
6. Ejecuta el guardián y comprueba que **se pone rojo** si rompes el orden a propósito (una prueba de
   guardián que nunca falla no protege nada):

   ```powershell
   pnpm --filter @hotel/shared test
   ```

7. Verifica contra una base **ya creada** (no solo contra una vacía): es el escenario que destapa el
   problema de orden.

## 3. Cómo añadir una ruta de API protegida

1. Crea el fichero en `apps/web/src/app/api/<área>/<nombre>/route.ts`. Las áreas con control de
   acceso son `admin` (rol de administración) y `reception` (`RECEPTION_ROLE`).
2. Obtén la sesión y **valida firma, caducidad y blocklist** con el guard compartido
   (`apps/web/src/lib/guard.ts`), no comprobando solo que la cookie exista.
3. Devuelve **401** sin sesión válida y **403** con rol ajeno. No mezcles ambos códigos.
4. Si la ruta lee datos financieros o de agregados, léelos de la **fuente única** (`/aggregates` del
   worker), no los recalcules (ADR-25).
5. Si la ruta **escribe** en la cadena, no firmes nunca un objeto reconstruido: pasa por el punto
   único de firma (ADR-11) y valida destino e importe.
6. Añade la prueba junto a la ruta (`route.test.ts` o un `*.test.ts` del área) cubriendo: sin sesión
   → 401; rol ajeno → 403; caso feliz; y el caso de error de dominio más probable.
7. Documenta la ruta en [`docs/SRS.md`](../../../docs/SRS.md) §4 con su rol y sus códigos.
8. Si la ruta protege un invariante (que no se filtre PII, que nadie lea cifras sin sesión), añade su
   **guardián** (§4).

## 4. Cómo añadir una prueba y su guardián

### 4.1 Una prueba normal

1. Colócala junto al código, con el sufijo `*.test.ts` (o `*.test.tsx` en la web).
2. Usa el runner del paquete: **Vitest** en `shared`, `worker`, `web`, `mcp` y `monitor`; **Foundry**
   en `contracts`; **Playwright + axe** para la web en navegador real.
3. No ejecutes dos suites a la vez en el mismo workspace.
4. Mantén el **entorno de pruebas hermético**: sin conexiones reales a cadena, PostgreSQL o Redis
   (hay dobles ya escritos: `test-fakes.ts`, `fake-redis`, `empty-server-only.ts`).

   ```powershell
   pnpm --filter @hotel/shared test
   pnpm --filter @hotel/web test
   pnpm test:e2e:m4
   ```

### 4.2 Un guardián

Un guardián es una prueba que **falla si alguien reintroduce un patrón prohibido**. Procedimiento:

1. Escribe el invariante como una aserción sobre los **ficheros reales** del repositorio (no sobre
   objetos literales escritos dentro del propio test: la auditoría encontró certificaciones que hacían
   exactamente eso).
2. **Pruébalo con una sonda de regresión**: introduce el patrón prohibido en un sitio temporal,
   comprueba que el guardián se pone **rojo**, y retírala. Si no se pone rojo, el guardián no protege.
3. Deja el motivo escrito en el comentario de cabecera (qué hallazgo o qué incidente lo originó).
4. Nómbralo `<asunto>-guardian.test.ts`.

## 5. Cómo regenerar los ABI

Los ABI de `packages/shared/src/abi/**` están **generados**: cada fichero empieza con «Generado por
`scripts/gen-abi.ts` — NO editar a mano».

```powershell
pnpm contracts:build
pnpm --filter @hotel/contracts gen:abi
pnpm --filter @hotel/shared build
```

Después de un cambio de contrato, además: **redespliegue** y **resincronización** del registro
(ADR-22), más actualización del `.env`. Detalle: [03 · Despliegue y redespliegue](../03-operacion/01-despliegue-y-redespliegue.md).

## 6. Política de ADR

1. **Toda decisión nueva entra en `docs/adr/` antes de tocar el código.** Se crea
   `docs/adr/ADR-NN-titulo.md` con el siguiente número libre.
2. Los ADR **no se reescriben**: si una decisión cambia, se **añade** un ADR que **supersede** al
   anterior y el índice refleja el estado (`vigente`, `sustituido por ADR-XX`).
3. Actualiza el índice de [`docs/adr/README.md`](../../../docs/adr/README.md) en el mismo cambio.
4. Cita el ADR en el **comentario** del código que lo explica (el «por qué», no el «qué»).
5. El **guardián de documentación** lo comprueba: cero referencias a documentos inexistentes, todo
   ADR citado existe, el índice está completo, los documentos normativos existen y declaran versión,
   y todo `CU-*` citado está catalogado en `docs/SRS.md` §9.

## 7. Guardianes que hay hoy

| Guardián | Invariante que protege |
|---|---|
| `packages/shared/src/architecture-guardian.test.ts` | **5 invariantes**: (1) el **orden** de la migración incremental (el fallo de M7); (2) los caminos de escritura usan el ABI **canónico**; (3) la conexión **bloqueante** de Redis no aparece en servicios de peticiones; (4) no hay **secretos embebidos** ni respaldos literales de variables secretas; (5) **paridad de tablas** entre `db/schema.sql` y `runMigrations` |
| `packages/shared/src/documentation-guardian.test.ts` | Cero referencias huérfanas (`DISEÑO*`, `CASOS-DE-USO`, `REQUISITOS §`); todo `ADR-NN` citado existe; el índice de ADR está completo y sin duplicados; PRD/SRS/PLAN/BACKLOG existen y declaran versión; todo `CU-*` citado está en `docs/SRS.md` §9 |
| `apps/web/src/lib/legacy-target-guardian.test.ts` | **7 invariantes** sobre **todo** `apps/web/src`: única dirección de compra/reventa/cobro; toda llamada a `sendTransaction(` pasa por `verifiedTxRequest(`; sin direcciones literales fuera de `config/chain.ts`; sin referencias a la generación legacy |
| `apps/web/src/lib/reception-guardian.test.ts` | **5 invariantes** del check-in: titularidad EIP-712 obligatoria en los **tres** endpoints que emiten el pase; sin verificaciones EIP-712 sueltas; sin campos de identidad (PII); ABI canónico; consumo del `jti` |
| `apps/web/src/lib/paused-guardian.test.ts` | La pausa se refleja en las **cuatro vistas** cubiertas; el revert de pausa se diagnostica como **`CONTRATO_EN_PAUSA` (503)**, no como avería de anclaje; `withdrawFunds` **no** se bloquea en pausa |
| `apps/web/src/lib/admin-auth-guardian.test.ts` | El dashboard y las pantallas de administración **verifican la validez de la sesión antes de leer nada** (hallazgo H1: servían cifras a un cliente anónimo ocultando el árbol) |
| `apps/web/src/lib/secrets-guardian.test.ts` | Ningún secreto literal en la web; los secretos se leen del entorno y fallan en cerrado |
| `apps/web/src/lib/a11y/a11y.test.ts` | La paleta que se mide es la del **preset real** (si divergen, la suite falla); ningún `className` con color fuera de paleta; el contraste se compara con el **ratio exacto** antes de redondear |
| `apps/web/src/lib/guard.test.ts` | El guard de autorización responde 401 sin sesión, 403 con rol ajeno y **no confunde una caída de infraestructura con credencial inválida** |
| `apps/web/src/lib/help/manuals-sync.test.ts` | Lo que sirve la Ayuda **no puede divergir** de `docs/manual-*.md`: las mismas secciones (número y orden) y **las mismas imágenes** (cada `![](imagenes/x.svg)` del manual aparece en el módulo). El módulo `manuals.generated.ts` se regenera con `pnpm build:manuals`; editarlo a mano pone el guardián en rojo |

## 8. Reglas del repositorio que un cambio no debe romper

- **El contrato es inmutable**: no hay *proxy*, no se «actualiza». Un cambio = redespliegue con
  dirección nueva + resincronización del registro + `.env` (ADR-22).
- Los `.ps1` se mantienen en **ASCII puro** (PowerShell 5.1 los lee como ANSI sin BOM).
- **No se editan ficheros UTF-8 con `Get-Content -Raw`/`Set-Content`**: corrompe los acentos. Usa las
  herramientas del agente o `[System.IO.File]::WriteAllText` con codificación explícita.
- **No se ejecutan dos suites a la vez** en el mismo workspace.
- **No se hace `push` sin orden explícita del responsable.**
- El pipeline de CI es **bloqueante** (8 etapas, sin `allow_failure` ni `|| true` que enmascaren un
  gate): si una etapa no está verde, no es «ruido».

## 9. Cierre de un cambio

1. `pnpm typecheck && pnpm lint && pnpm test`.
2. Si toca la cadena: `pnpm test:contracts`, **redespliegue**, `sync` y E2E M4–M7 (con el worker parado).
3. Si toca el esquema: migración ordenada, diccionario actualizado y verificación contra una base ya
   creada.
4. Si publicas una cifra de calidad: **instrumento + artefacto**, o se declara **sin medir**.
5. Registra el avance en [`../../estado_proyecto.md`](../../estado_proyecto.md) §9 y actualiza el PRD/SRS
   si cambia un requisito o su estado.

---

*Volver al índice: [`../README.md`](../README.md) · [Seguridad](01-seguridad.md) · [Rendimiento y cobertura](02-rendimiento-y-cobertura.md)*

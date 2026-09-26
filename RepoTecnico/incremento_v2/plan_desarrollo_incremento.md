# Plan de desarrollo · Incremento v2 (owner · recepción · reventa)

> Plan **vertical** por hitos: cada hito es una entrega operativa y verificable. Se implementa en
> orden; cada hito cierra con `pnpm typecheck` y sus pruebas en verde antes de pasar al siguiente.

## Contexto técnico de partida

- Back-office: Next.js App Router + JWT (cookies HttpOnly) + `guard.ts`; gating de UI en
  `adminNav.ts` / `AdminPanel.tsx` / `useAdminSession.ts`.
- Datos: PostgreSQL; el esquema canónico vive en `packages/shared/src/db/migrator.ts`
  (`INITIAL_SCHEMA_SQL`, idempotente). Repositorios en `packages/shared/src/db/repositories/`.
- Recepción: `/recepcion` (client) + `/api/reception/checkin` (ya existe, exige `RECEPTION_ROLE`).
- Reventa: `/reventa` + `useListNight`/`MyNightCard` (`list`/`unlist` on-chain).
- i18n: `apps/web/messages/{es,en,ru}.json`.

---

## H1 · Acceso total del owner (CU-30)

**Objetivo**: que `DEFAULT_ADMIN_ROLE` habilite todos los paneles, sin elevar privilegios on-chain.

Tareas:
1. `packages/shared/src/domain/roles.ts` (o helper en `apps/web/src/lib`): función pura
   `rolesSatisfy(sessionRoles, requiredRole)` — `DEFAULT_ADMIN_ROLE` implica cualquier rol;
   cualquier otro rol solo se satisface a sí mismo.
2. `useAdminSession.hasRole` usa el helper (fuente única de gating UI).
3. `AdminLayout.Sidebar` usa el helper (ya delega en `hasRole`; verificar).
4. Auditoría del `guard.ts`: documentar que la elevación es de UX; los paneles siguen exigiendo el
   rol de contrato al firmar.
5. Pruebas: `rolesSatisfy` (unit) + guardián `admin-auth-guardian.test.ts` actualizado.
6. i18n: sin textos nuevos.

**Criterio de cierre**: los 7 paneles habilitados para owner; RECEPTION sigue bloqueado; typecheck verde.

---

## H2 · Modelo de datos de recepción (CU-31..CU-35)

**Objetivo**: persistencia off-chain del check-out, incidencias, cargos y código de recuperación.

Tareas:
1. `migrator.ts` (`INITIAL_SCHEMA_SQL`), idempotente:
   - `ALTER TABLE nfts ADD COLUMN IF NOT EXISTS recovery_code VARCHAR(16)` + índice único.
   - `additional_charges` (id, token_id FK, concept, amount_cents BIGINT, currency, status
     PENDING/CANCELLED/PAID, created_by, created_at, cancelled_by, cancelled_at, cancel_reason).
   - `stay_checkouts` (id, token_id FK UNIQUE, room_number, check_in_date, room_condition,
     notes, processed_by, created_at).
   - `checkout_incidents` (id, checkout_id FK, kind, description, created_at) — vocabulario cerrado.
2. `resetDatabase()` incluye las tablas nuevas (orden de DROP).
3. Repositorio `ReceptionRepository` (o métodos en `NFTsRepository`): overview por fecha, lookup por
   código, alta/listado/cancelación de cargos, creación idempotente de check-out.
4. Derivación determinista del código de recuperación (`domain/recovery-code.ts`):
   `MDS-` + base32(sha256(`hotel-recovery:v1:` + tokenId))[0..8]; función pura y testeable.
5. Backfill de `recovery_code` para filas existentes (en migrator/script) sin romper si ya existe.
6. Pruebas: derivación del código (determinismo, formato) y repositorio contra PostgreSQL de prueba.

**Criterio de cierre**: migración idempotente ejecutada 2 veces sin error; repositorio probado.

---

## H3 · API de recepción (CU-31..CU-35)

**Objetivo**: superficie HTTP autenticada para el panel.

Tareas:
1. `GET /api/reception/overview?date=YYYY-MM-DD` → reservas del día + estado de las 50 habitaciones.
2. `GET /api/reception/reservations/lookup?code=` → reserva por código de recuperación.
3. `GET /api/reception/charges?tokenId=` y `POST /api/reception/charges` (alta por recepción).
4. `POST /api/reception/checkout` → idempotente, cancela cargos y marca `CHECKED_OUT`.
5. Todas exigen `RECEPTION_ROLE` o owner (extender `authorize` para que el owner pase rutas de recepción).
6. Actualizar el tipo de estado `NFTRecord.status` para incluir `CHECKED_OUT`.
7. Pruebas de integración: 401 sin sesión, overview, lookup (200/404/400), checkout (200/409/idempotente),
   cargos (201/400).

**Criterio de cierre**: endpoints probados contra PostgreSQL; errores mapeados por código.

---

## H4 · UI del MVP de recepción (CU-31..CU-35, CU-33)

**Objetivo**: pantalla operativa para el mostrador.

Tareas:
1. Reestructurar `/recepcion` en secciones con pestañas: **Hoy** (reservas + estado habitaciones),
   **Check-in** (QR/JWS + búsqueda por código + comprobación de reserva), **Check-out**
   (verificación + cargos + cancelar).
2. Puerta de sesión `ReceptionGate` (reutiliza `useAdminSession`/`CredentialForm`) que exige
   `RECEPTION_ROLE` o owner.
3. Componentes: `DayBoard`, `RoomStatusGrid`, `RecoveryCodeLookup`, `CheckoutForm`, `ChargeList`.
4. Wrapper de API con cookies: `apiFetch` de sesión.
5. i18n ES/EN/RU: namespaces `reception` (nuevo) y ampliación de `admin` si aplica.
6. Pruebas de lógica (normalización de código, derivación de estado de habitación, validación del
   formulario) sin DOM; E2E Playwright si el entorno lo permite.

**Criterio de cierre**: typecheck verde; flujo completo navegable; textos en los 3 idiomas.

---

## H5 · «Mis reventas» (CU-36, CU-37)

**Objetivo**: que el huésped gestione sus reventas y reciba avisos.

Tareas:
1. Ruta `/mis-noches/mis-reventas` (o sección dentro de `/mis-noches`): «Publicadas» y «Vendidas».
2. `useMyResales`: deriva publicadas (`listingOf` por token poseído) y vendidas (eventos `Sale` con
   `seller` = wallet), más `pendingWithdrawals`.
3. Acciones publicar/editar/retirar reutilizando `useListNight` y `MyNightCard` (DRY).
4. Avisos: contador in-app de novedades desde la última visita (almacenamiento local, sin PII) y
   envío de Web Push anónimo desde el worker al confirmar una reventa.
5. i18n ES/EN/RU: namespace `myResales`.
6. Pruebas: lógica de derivación/avisos y (si aplica) E2E.

**Criterio de cierre**: publicar/editar/retirar operativo; avisos visibles; typecheck verde.

---

## H6 · Verificación y cierre documental

Tareas:
1. `pnpm typecheck` (workspace) y `pnpm test` de los paquetes tocados.
2. Revisión de guardianes (a11y, secretos, legacy, boundaries) en verde.
3. Actualizar `estado_proyecto.md` con el incremento y `RepoTecnico/incremento_v2/`.
4. Resumen final con evidencias y deuda anotada.

**Criterio de cierre**: todo en verde o deuda declarada explícitamente.

---

## Estimación relativa

| Hito | Esfuerzo | Depende de |
|---|---|---|
| H1 | S | — |
| H2 | M | — |
| H3 | M | H2 |
| H4 | L | H3 |
| H5 | M | — (reutiliza on-chain existente) |
| H6 | S | H1–H5 |

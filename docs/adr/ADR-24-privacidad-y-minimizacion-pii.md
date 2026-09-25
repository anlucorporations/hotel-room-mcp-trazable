# ADR-24 · Minimización de PII y textos legales coherentes

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-14

## Contexto

La compra se anunciaba como anónima pero el sistema guardaba direcciones IP, *user agent* y correos, y
los textos legales describían un producto que no era el que se ejecutaba.

## Decisión

Se minimiza la PII al mínimo técnico: sin IP ni *user agent* en claro; las notificaciones llevan solo lo
imprescindible; las suscripciones de push requieren consentimiento explícito y tienen opt-out, con purga
de las que el navegador ya no reconoce (404/410). Los textos de Privacidad y Términos se reescriben
conforme al sistema real y declaran que **no se recogen datos de viajeros** porque el registro se hace en
el mostrador (ADR-20).

## Consecuencias

- El navegador puede revocar el consentimiento por sí mismo y la plataforma lo respeta.
- El correo del comprador solo se usa para los avisos de su compra.
- Cualquier inclusión futura de PII exige guardián y actualización de textos.

## Traza de sesiones: decisión de M9 (resuelve el hueco)

Al escribir la documentación de M9 se comprobó que la decisión **no se estaba cumpliendo**: el código
seguía escribiendo la IP y el *user agent* **en claro** en `admin_sessions` en cada login, verificación de
TOTP y rotación de refresh (solo de **operadores**; los compradores nunca se vieron afectados).

Decisión del responsable (M9), ya implementada:

1. **Pseudonimización con clave, no un hash simple.** El espacio de IPv4 son ~4.300 millones de valores y
   un `SHA-256` sin clave se revierte enumerándolo en minutos. La traza se calcula con **HMAC-SHA256** y
   un secreto: sin la clave, el valor no es reversible.
2. **Clave propia con respaldo**: `SESSION_TRACE_SECRET`; si falta, se deriva de `AES_SECRET_KEY`. Sin
   ninguna de las dos, `hashSessionTrace` **lanza** (nada de trazas que parezcan protegidas sin estarlo).
3. **Un único punto de escritura**: `SessionsRepository.createSession` pasa ambos valores por
   `hashSessionTrace`, así que ningún llamante puede saltárselo. Se almacena `hmac-sha256:<64 hex>`.
4. **Retención corta**: la fila se borra al caducar el refresh (7 días) mediante el
   **planificador de retención** del worker — el mismo que purga los correos enviados con más de 90 días
   y los códigos de rescate de operadores que ya no existen. Los plazos declarados **se ejecutan**.
5. **Filas anteriores migradas** con `pnpm --filter @hotel/shared backfill:session-traces` (idempotente,
   con modo seco).

Lo que se conserva: reconocer **repeticiones** (la misma IP en dos sesiones produce la misma traza), que
es la única utilidad que tenía el dato. Lo que se pierde: poder leer la IP de un acceso pasado.

## Dónde se ve

`packages/shared/src/auth/crypto.ts` (`hashSessionTrace`), `packages/shared/src/db/repositories/sessions.repository.ts`,
`packages/shared/src/db/migrator.ts`, `packages/shared/src/maintenance/retention.ts`,
`apps/worker/src/retention-scheduler.ts`, `packages/shared/scripts/backfill-session-traces.ts`,
`packages/shared/src/push/service.ts`, `packages/shared/src/push/web-push.ts`,
`apps/web/src/app/privacidad/page.tsx`, `apps/web/src/app/terminos/page.tsx`, `docs/COMPLIANCE.md`.

# ADR-04 · Autenticación canónica: contraseña + TOTP + JWT con rotación

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-04

## Contexto

Convivían dos sistemas incompletos: SIWE y unas credenciales embebidas `SYSTEM_USERS` con contraseñas
en claro y un TOTP por defecto `JBSWY3DPEHPK3PXP`. Ninguna ruta comprobaba sesión ni rol.

## Decisión

Hay un solo sistema: contraseña con bcrypt + TOTP **obligatorio** + access token JWT de 15 minutos con
rotación de refresh y blocklist en Redis. Los operadores viven en la tabla `admin_users` con la semilla
TOTP cifrada con AES-256-GCM (`auth/crypto.ts`).

Todas las rutas `/api/admin/**` y `/api/reception/**` llevan guards de autorización: 401 sin sesión y
403 con rol ajeno. El aprovisionamiento se hace con `pnpm --filter @hotel/shared provision:admin` o
`provision:reception`. No hay ninguna credencial por defecto: `requireSecret` falla en cerrado
(CWE-798).

SIWE queda fuera del camino crítico: no autoriza el back-office ni protege ninguna API.

## Consecuencias

- El logout revoca de verdad mediante la blocklist; una caída de Redis se propaga como error en vez de
  enmascararse como 401.
- El token de refresh se guarda como hash, no en claro.
- La re-confirmación TOTP de operaciones de alto impacto (minteo) valida contra la semilla cifrada del
  operador autenticado, no contra un secreto de entorno.
- **Deuda declarada**: el SRS histórico decía RS256 y el código usa HS256 con `JWT_SECRET`, declarado
  en `.env.example`.

## Dónde se ve

`packages/shared/src/auth/service.ts`, `packages/shared/src/auth/crypto.ts`, `packages/shared/src/db/repositories/users.repository.ts`, `apps/web/src/lib/guard.ts`, `apps/web/src/lib/admin-session.ts`, `apps/web/src/lib/admin-auth-guardian.test.ts`, `packages/shared/scripts/create-admin.ts`.

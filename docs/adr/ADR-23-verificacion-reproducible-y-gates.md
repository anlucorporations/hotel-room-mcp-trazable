# ADR-23 · Verificación reproducible y gates bloqueantes

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-08

## Contexto

Existían tres «certificaciones» falsas (un guion que imprimía seis `OK` sin firmar una transacción, un
benchmark que medía un servidor de mentira levantado por él mismo y una verificación de recuperación que
«restauraba» un objeto en memoria), la cobertura no se medía, `lint` estaba rojo y el pipeline no
bloqueaba nada (`|| true` y `allow_failure: true`).

## Decisión

Toda afirmación de calidad se mide sobre el sistema en marcha y produce **artefacto**; las
certificaciones falsas se retiran. En concreto: `pnpm test:load` mide por HTTP el sistema real, valida el
contenido de cada respuesta y aborta si el worker no responde (SLA declarado: p95 < 500 ms y errores
< 1 %); `pnpm test:dr` hace `pg_dump`, restaura de verdad y compara tabla por tabla; los cuatro E2E
on-chain (M4–M7) firman contra Anvil y fallan en duro; el pipeline de CI pierde los `|| true` y el
`allow_failure`, con etapas `setup`, `static`, `test`, `coverage`, `chain-e2e`, `web-e2e`,
`certifications` y `security`; la cobertura se mide y se publica con umbrales en **trinquete** (el valor
medido, no el deseado) porque el 80 % global no se alcanza todavía.

## Consecuencias

- `apps/web` está en 24,95 % de sentencias (falta todo el entorno DOM) y es el hueco declarado que fija
  el techo global en 78,7 %.
- El perfil de 200 usuarios concurrentes **no** cumple el SLA en una sola máquina (31 % de timeouts por
  agotamiento del pool de PostgreSQL al competir con el generador) y se documenta con sus números en vez
  de disfrazarse.
- La medición real a 50 concurrentes da 9.119 peticiones, 0 errores y p95 172 ms.
- El escaneo de accesibilidad con axe corre en navegador real (12/12 sin violaciones
  critical/serious).

## Dónde se ve

`.gitlab-ci.yml`, `scripts/load-tests/run-load-test.ts`, `scripts/backup/restore-verify.ts`, `RepoTecnico/evidencias/`, `RepoTecnico/cobertura.md`.

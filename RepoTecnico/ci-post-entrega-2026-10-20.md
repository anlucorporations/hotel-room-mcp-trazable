# Verificación post-entrega — remotos y CI (2026-10-20)

> **Alcance:** comprobar el estado de la entrega tras el push a `origin/main` y la etiqueta de release,
> e identificar si el CI de los remotos valida el commit entregado.

## 1. Entrega publicada

| Elemento | Estado |
|---|---|
| Rama `main` (origin, GitLab) | `9ce34b9 → 3fc64a2` (fast-forward, 41 commits) |
| Rama `Hotel-DSH-GCP-v3` | sincronizada con `origin` en `3fc64a2` |
| Etiqueta anotada | **`entrega-final-2026-10-20`** creada y publicada en `origin` |
| Árbol local | limpio salvo un fichero suelto ajeno (`RepoTecnico/BaseOperaciones/estructura_datos_personal.md`, sin seguimiento) |

## 2. CI de GitLab (origin)

**Hallazgo:** los pipelines de GitLab **fallan sin jobs** desde antes de la entrega.

| Pipeline | Ref | Commit | Estado |
|---|---|---|---|
| 2968953948 | `entrega-final-2026-10-20` | `3fc64a2` | failed (sin jobs) |
| 2968051252 | `main` | `3fc64a2` | failed (sin jobs) |
| 2968019586 | `Hotel-DSH-GCP-v3` | `3fc64a2` | failed (sin jobs) |
| 2967932436 | `Hotel-DSH-GCP-v3` | `cf21dbd` | failed (sin jobs) |
| 2967406414 | `Hotel-DSH-GCP-v3` | `39f447f` | failed (sin jobs) |

Evidencia: `GET /projects/:id/pipelines/:id/jobs` → `[]` y `duration: null`; `yaml_errors: null`. Es decir,
el pipeline se crea y falla **antes de ejecutar ningún job** — no es un fallo de los tests de esta
entrega. Causas habituales: CI/CD deshabilitado en el proyecto, ausencia de runners disponibles o
configuración de pipeline no ejecutable. **Requiere acción en GitLab** (habilitar runners compartidos o
registrar uno); no se puede resolver desde el repositorio.

## 3. CI de GitHub (remoto alternativo)

**Actualización (2026-10-20 18:43 UTC):** `main` se publicó también en `github` (`9ce34b9 → 6180c8f`).
GitHub Actions lanzó el pipeline del commit entregado (`run 39476902319`, evento `push`) y **los cuatro
jobs fallan en ~2 s sin ejecutar ningún paso**:

| Job | Resultado | Evidencia |
|---|---|---|
| Build · typecheck · lint · test · smoke | failure | sin `runner_name`, `steps: []` |
| Web · Playwright E2E | failure | sin `runner_name`, `steps: []` |
| Schema · PostgreSQL 18 | failure | sin `runner_name`, `steps: []` |
| Contract · slither | failure | sin `runner_name`, `steps: []` |
| Web · perf nightly | skipped | — |

Es el mismo patrón que en GitLab: **no hay runner disponible** (o Actions está deshabilitado/sin cuota);
no es un fallo de los tests. Requiere acción en la configuración de GitHub (Actions → runners/billing o
límite de gasto de la organización) y después relanzar el pipeline.

**Recomendación:** mantener **GitHub Actions como CI canónico** (`.github/workflows/ci.yml` es el más
completo), habilitar un runner y relanzar. Mientras tanto, la calidad del commit entregado está
respaldada por los gates locales (§4).

## 4. Gates del commit entregado (`3fc64a2`)

Ejecutados en local sobre el árbol entregado (ver `aceptacion_fase4.md` y `aceptacion_fase5.md`):

| Gate | Resultado |
|---|---|
| `pnpm test` (6 paquetes) | 2.465 pruebas, 0 fallos |
| `forge test` | 202 pruebas / 20 suites |
| E2E Playwright | 126/126 (chromium + mobile) |
| `typecheck` | 6/6 |
| `lint` | 0 errores |
| `build:manuals` + guardián | 44 manuales · 484 secciones · 18/18 |
| `next build` | verde |

## 5. Acciones pendientes (post-entrega)

1. Decidir remoto/CI canónico (§3) y, si aplica, publicar `main` en GitHub.
2. Habilitar runners en GitLab o desactivar su pipeline para no generar señales falsas de fallo.
3. Recordar los pendientes ya documentados: A9 (IAM), H-02/H-03 (legal/DPIA) y manual del huésped.

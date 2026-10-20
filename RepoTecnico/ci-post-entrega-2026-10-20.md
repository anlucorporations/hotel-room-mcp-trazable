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

**Hallazgo:** el repositorio de GitHub **no contiene** el commit de la entrega (solo se publicó a
`origin`, GitLab). El último run de `main` corresponde al commit anterior `9ce34b9` y los cuatro jobs
fallan (`Build`, `Web E2E`, `slither`, `perf nightly`). No es atribuible a esta entrega porque ese commit
no es el entregado.

**Recomendación:** decidir cuál es el CI canónico:

- **Opción A (recomendada):** GitHub Actions como CI canónico (`.github/workflows/ci.yml` está más
  actualizado y ejecuta los gates reales); publicar `main` también en `github` y usar ese pipeline.
- **Opción B:** reparar los runners de GitLab y usar `.gitlab-ci.yml`.
- **Opción C:** usar ambos con un único remoto canónico para no duplicar señales.

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

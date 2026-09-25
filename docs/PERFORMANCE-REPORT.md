# Informe de rendimiento y prueba de carga

## Hotel Marina del Sol — medición real del sistema en marcha

> **Versión**: 2.0.0 (sustituye por completo a la v1.0.0, que **no era válida**)
> **Fecha**: 2026-09-23 · **Hito**: M8 · **Decisión de origen**: D-08
> **Herramienta**: `scripts/load-tests/run-load-test.ts` (medidor propio, `pnpm test:load`)
> **Artefacto**: [`RepoTecnico/evidencias/load-test.json`](../RepoTecnico/evidencias/load-test.json)

## 0. Por qué se reescribió este informe

La versión anterior **certificaba** 200 usuarios concurrentes con p95 de 185 ms y «0,00 % de errores».
Esa medición **no era del sistema**: el guion levantaba su propio servidor de mentira y medía ese.
La auditoría V5 lo clasificó como una de las tres certificaciones falsas (hallazgo H-03) y se **retiró**.

Lo que sigue es la medición del sistema real, y **falla cuando no cumple**.

## 1. Qué mide el medidor actual

| Aspecto | Cómo se comporta |
|---|---|
| Objetivo | HTTP real contra el **worker en marcha** (8787) y, si está levantada, la web (3000) |
| Validación de contenido | **No basta con un 200**: cada respuesta se valida (forma y contenido esperados); una respuesta de mentira cuenta como fallo |
| Aborto temprano | Si el worker no responde, el guion **aborta** en vez de publicar cifras |
| SLA | **p95 < 500 ms** y **tasa de error < 1 %**; si no se cumple, el comando sale con error |
| Salida | Artefacto JSON con perfil, cifras y veredicto |

## 2. Perfil declarado para el pipeline: 50 usuarios concurrentes

Medición registrada en el artefacto (perfil **declarado** del pipeline):

| Métrica | Resultado medido | SLA declarado | Veredicto |
|---|---|---|---|
| Peticiones | **9.119** (50 concurrentes, **15 s**) | — | — |
| Errores | **0** | < 1 % | **CUMPLE** |
| p50 | **67,3 ms** | — | — |
| p95 | **172,2 ms** | < 500 ms | **CUMPLE** |
| p99 | **327,1 ms** | — | — |
| Rendimiento | **606,4 peticiones/s** | — | — |

**Alcance real de esta medición (declarado en el artefacto)**: los objetivos medidos son los del
**plano de datos del worker** —`/health`, `/aggregates` y `/history`, que son las rutas que consume la
web—; los objetivos de la web (`/`, `/api/sales/history`, `/health/ready`) figuran como **omitidos** en
esa ejecución porque el servidor de Next no estaba levantado. Dicho claro: esta cifra certifica el plano
de datos, **no** el renderizado de la web, y así queda declarado en lugar de presentarse como una
medición del sistema completo.

Este es el perfil que ejecuta la etapa `certifications` del pipeline y es **el mayor perfil que este
entorno puede medir con honestidad**, porque el generador de carga corre en la **misma máquina** que
Next, PostgreSQL, Redis y Anvil.

## 3. Perfil de 200 usuarios concurrentes: **no cumple**, y sabemos por qué

La medición a 200 concurrentes en una sola máquina da el resultado contrario, y se publica tal cual:

| Métrica | Resultado medido |
|---|---|
| Peticiones | **3.114** |
| Errores | **974 (31 %)** |
| Causa de los errores | **timeout de 5 s en la web**, todos |
| Log del servidor | `timeout exceeded when trying to connect` (pool de PostgreSQL de la web agotado) → el catálogo cae a respaldo por RPC → el SSR supera los 5 s |
| Plano de datos del worker | **0 errores**, pero p95 ≈ **1,2 s** |

Hay **dos causas separadas** y no conviene confundirlas:

1. **Contención de la propia máquina**: el generador compite con los servicios que mide. La medición
   limpia exige lanzar la carga desde otra máquina (**k6**, bloqueante B-3) o desde otro contenedor.
2. **Dimensionamiento del pool de la web**: `DATABASE_POOL_MAX` no está calculado para 200 peticiones
   SSR simultáneas. Se corrige con pool dimensionado, caché de catálogo y/o la capa CDN prevista en
   D-11.

**Consecuencia de proceso**: el pipeline usa el perfil de 50 (declarado) y el de 200 se documenta con
sus números. **No se baja el perfil para que la certificación salga verde.**

## 4. Otros rendimientos medidos (no estimados)

| Medición | Resultado | Dónde |
|---|---|---|
| Validación del resguardo y ancla de check-in en servidor | **~41 ms** (SLA de recepción < 500 ms) | E2E M5 |
| Recuperación ante desastre (RTO) | **0,73 s** (`pg_dump` + restauración real + comparación) | `RepoTecnico/evidencias/dr-verify.json` |
| Accesibilidad (axe, navegador real) | **24/24 sin violaciones critical/serious** (12 rutas × 2 proyectos, con movimiento reducido) | `apps/web/e2e/a11y.spec.ts` |
| Cobertura | global 49,51 % · `web` 24,95 % (hueco declarado) | `RepoTecnico/cobertura.md` |

## 5. Límites de esta medición (declarados, no escondidos)

- **LCP y métricas de campo**: no hay instrumento en el repositorio. El RNF-01 («LCP < 2,5 s en 4G
  móvil») queda **sin medir**; no se declara cumplido.
- **k6 no está instalado** (B-3): el guion `scripts/load-tests/catalog-load.js` se conserva para cuando
  lo esté, y es el camino para medir los 200 concurrentes desde otra máquina.
- **Un solo nodo**: no se mide escalado horizontal; el sistema está pensado para una instancia con
  PostgreSQL y Redis dedicados.
- **Datos sintéticos**: la base de la medición contenía el histórico real de los E2E, no el volumen de
  una temporada completa.

---

*Informe de rendimiento v2.0.0 · regenerado en M8/M9 · reproduce con `pnpm test:load` (worker en marcha).*

# 04 · Rendimiento y cobertura

> **Regla del proyecto**: ninguna cifra se publica sin **instrumento** y sin **artefacto**; lo que no
> está medido se declara **sin medir** (ADR-23).
> **Documentos de referencia**: [`docs/PERFORMANCE-REPORT.md`](../../../docs/PERFORMANCE-REPORT.md),
> [`../../cobertura.md`](../../cobertura.md),
> [`../../evidencias/load-test.json`](../../evidencias/load-test.json).

## 1. Cómo se mide el rendimiento

Instrumento: **medidor propio** `scripts/load-tests/run-load-test.ts`.

```powershell
pnpm test:load
```

| Aspecto | Comportamiento |
|---|---|
| Objetivo | HTTP **real** contra el sistema en marcha: worker en **8787** y, si está levantada, la web en **3000** |
| Validación de contenido | No basta un 200: cada respuesta se valida en forma y contenido; una respuesta de mentira cuenta como **fallo** |
| Aborto temprano | Si el worker no responde, el guion **aborta** en vez de publicar cifras |
| SLA declarado | **p95 < 500 ms** y tasa de error **< 1 %**; si no se cumple, el comando sale con error |
| Salida | Artefacto JSON con perfil, cifras por endpoint y veredicto |

Alternativa para cuando **k6** esté instalado (hoy no lo está: B-3):

```powershell
pnpm test:load:k6      # k6 run scripts/load-tests/catalog-load.js
```

## 2. Números reales medidos

### 2.1 Perfil del pipeline: 50 usuarios concurrentes

Artefacto: [`../../evidencias/load-test.json`](../../evidencias/load-test.json) (15 s, timeout 5 s).

| Métrica | Medido | SLA | Veredicto |
|---|---|---|---|
| Peticiones | **9.119** | — | — |
| Errores | **0** | < 1 % | **CUMPLE** |
| p50 | 67,3 ms | — | — |
| **p95** | **172,2 ms** | < 500 ms | **CUMPLE** |
| p99 | 327,1 ms | — | — |
| Rendimiento | 606,4 req/s | — | — |

Desglose por endpoint medido:

| Endpoint | Peticiones | p50 | p95 | Errores |
|---|---|---|---|---|
| `worker:/health` | 2.972 | 19,9 ms | 103,4 ms | 0 |
| `worker:/aggregates` | 3.122 | 113,1 ms | 195,7 ms | 0 |
| `worker:/history` | 3.025 | 61,6 ms | 135,2 ms | 0 |

En esa ejecución la web **no** estaba levantada y el artefacto lo declara en `objetivosOmitidos`
(`web:/`, `web:/api/sales/history`, `web:/health/ready`): no se inventan cifras de lo que no se midió.

### 2.2 Perfil de 200 usuarios concurrentes: **NO cumple**

| Métrica | Medido |
|---|---|
| Peticiones | **3.114** |
| Errores | **974 (31 %)** |
| Causa de los errores | **timeout de 5 s en la web**, todos |
| Log del servidor | `timeout exceeded when trying to connect` → el **pool de PostgreSQL de la web se agota** → el catálogo cae al respaldo por RPC → el SSR supera los 5 s |
| Plano de datos del worker | **0 errores**, pero p95 ≈ **1,2 s** |

Dos causas **separadas**, y no conviene confundirlas:

1. **Contención de la propia máquina**: el generador de carga corre en la misma máquina que Next,
   PostgreSQL, Redis y Anvil; la medición limpia exige lanzar la carga desde otra máquina (k6, B-3).
2. **Dimensionamiento del pool de la web**: `DATABASE_POOL_MAX` (hoy 20) no está calculado para 200
   peticiones SSR simultáneas. Se corrige dimensionando el pool y/o cacheando el catálogo, o poniendo
   la capa CDN delante (D-11).

**Consecuencia de proceso**: el pipeline usa el perfil de 50 (declarado) y el de 200 se documenta con
sus números. **No se baja el perfil para que la certificación salga verde.**

### 2.3 Otros rendimientos medidos

| Medición | Resultado | Dónde |
|---|---|---|
| Validación del resguardo + ancla de check-in en servidor | **~41 ms** (SLA de recepción < 500 ms) | E2E M5 |
| Recuperación ante desastre (RTO) | **0,73 s** | [`../../evidencias/dr-verify.json`](../../evidencias/dr-verify.json) |
| Accesibilidad en navegador real | **16/16** sin violaciones critical/serious | `apps/web/e2e/a11y.spec.ts` |
| Contrato | **13 suites / 125 pruebas** al cerrar M9 (con la generación legacy retirada) | `pnpm test:contracts` |
| Cobertura de `@hotel/shared` (M9) | statements **79,58 %** · branches **80,59 %** · functions **75,29 %** | `pnpm --filter @hotel/shared test:coverage` |

### 2.4 Lo que **no** está medido

- **LCP < 2,5 s en 4G móvil (RNF-01)**: **no hay instrumento** en el repositorio. No se declara
  cumplido. Es la primera cifra que hay que instrumentar si el cliente pide métricas de campo.
- **Escalado horizontal**: se mide un solo nodo. El sistema está pensado para una instancia con
  PostgreSQL y Redis dedicados.
- **Reorg real de Polygon**: 32 confirmaciones son configuración documentada, nunca probadas.
- **Datos sintéticos**: la base de la medición contenía el histórico real de los E2E, no el volumen de
  una temporada completa.

## 3. Cómo se mide la cobertura

### 3.1 Comandos

```powershell
pnpm --filter @hotel/shared  test:coverage
pnpm --filter @hotel/worker  test:coverage
pnpm --filter @hotel/web     test:coverage
pnpm --filter @hotel/monitor test:coverage
pnpm --filter @hotel/mcp     test:coverage
```

Cada script es `vitest run --coverage` con `@vitest/coverage-v8`. Los artefactos quedan en
`<paquete>/coverage/`: resumen por consola (`text-summary`), `coverage-summary.json` (las cifras del
documento) y `lcov.info`. El directorio `coverage/` está en `.gitignore`.

Medición **sin exclusiones** (cifras crudas, incluye `main.ts`, ABI y dobles):

```powershell
pnpm --filter @hotel/<pkg> exec vitest run --coverage `
  --coverage.reportsDirectory=coverage-raw `
  --coverage.exclude="**/node_modules/**" `
  --coverage.exclude="src/**/*.test.ts" `
  --coverage.exclude="src/**/*.test.tsx"
```

`coverage-raw/` **no** está cubierto por la regla `coverage/` de `.gitignore`: bórralo a mano después.

### 3.2 Resultados reales con las exclusiones del gate

| Paquete | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `packages/shared` | **79,21 %** (2.839/3.584) | 80,47 % (573/712) | **75,00 %** (189/252) | 79,21 % |
| `apps/worker` | **80,68 %** (1.366/1.693) | 88,31 % (325/368) | 85,36 % (105/123) | 80,68 % |
| `apps/web` | **24,95 %** (2.017/8.081) | 74,05 % (471/636) | 53,84 % (105/195) | 24,95 % |
| `apps/monitor` | **91,12 %** (339/372) | 86,36 % (95/110) | 93,10 % (27/29) | 91,12 % |
| `apps/mcp` | **93,97 %** (499/531) | 87,23 % (123/141) | 92,85 % (39/42) | 93,97 % |
| **GLOBAL** | **49,51 %** (7.060/14.261) | 80,68 % (1.587/1.967) | 72,54 % (465/641) | 49,51 % |

Sin exclusiones: global **50,25 %** de statements (9.513/18.932).

> **Discrepancia entre documentos, declarada**: [`../../cobertura.md`](../../cobertura.md) §3.1 da
> `shared` en **79,21 %** y funciones **75,00 %**, mientras el PRD (RNF-17) y
> [`../../estado_proyecto.md`](../../estado_proyecto.md) (cierre de M8) citan **79,61 %** y **75,29 %**.
> Son dos ventanas de medición distintas sobre un árbol en edición. **Reproduce el comando antes de
> citar el decimal**; la diferencia no cambia la conclusión: `shared` no alcanza el 80 % en funciones.

### 3.3 Exclusiones y su justificación

| Patrón | Por qué |
|---|---|
| `src/**/*.test.ts(x)`, `*.spec.ts(x)` | Los tests no son producto |
| `**/dist/**`, `**/.next/**`, `**/out/**`, `**/*.d.ts`, `**/*.config.*` | Artefactos regenerables y andamiaje |
| `**/test/**` | Dobles e infraestructura de prueba (`setup-env`, `fake-redis`, `empty-server-only`, `guard-mock`) |
| `**/scripts/**`, `scripts/create-admin.ts` | Scripts operativos de un solo uso, no runtime del paquete |
| `src/abi/**` (**solo `shared`**) | ABI **volcado por el compilador**: son literales JSON, no lógica. Excluirlos quita el **52 %** del denominador de `shared` (3.897 de 7.457 sentencias). Es la exclusión más agresiva del conjunto y se documenta para que no quede oculta |

### 3.4 Política de **trinquete**

Los umbrales de cada `vitest.config.ts` están fijados al **valor medido** (entero inferior con un punto
de margen), no al 80 % deseado:

| Paquete | statements | branches | functions | lines |
|---|---|---|---|---|
| `@hotel/shared` | 78 | 79 | 74 | 78 |
| `@hotel/worker` | 79 | 87 | 84 | 79 |
| `@hotel/web` | 23 | 73 | 52 | 23 |
| `@hotel/monitor` | 90 | 85 | 92 | 90 |
| `@hotel/mcp` | 92 | 86 | 91 | 92 |

Qué significa y qué **no** significa:

- **Sí** bloquea regresiones: si la cobertura baja del umbral, el proceso sale con código ≠ 0 y la
  etapa `coverage` del pipeline falla.
- **No** certifica el 80 %: `web` (24,95 %) y `shared` (79,21 % / funciones 75,00 %) están por debajo y
  así se declara. El gate **está cableado** al pipeline, que publica `lcov`.

## 4. Huecos declarados y dónde está el trabajo

| Hueco | Detalle | Prerrequisito para cerrarlo |
|---|---|---|
| **`apps/web` 24,95 %** | Falta **entero** el entorno DOM: `environment: "node"` e `include: ["src/**/*.test.ts"]` (sin `.tsx`), sin `jsdom` ni `@testing-library/react`. El hueco son 4.505 sentencias de componentes + 1.077 de `app/` (RSC) + 482 de `lib/` | Añadir jsdom + `@testing-library/react` + dobles de wagmi |
| **`packages/shared` 79,21 % / funciones 75,00 %** | Faltan dobles de `pg`, `ioredis` y BullMQ y unos seis tests de helpers puros | Dobles de infraestructura |
| **Techo global** | El global está dominado por `web`: aporta **8.081 de las 14.261** sentencias (56,7 %). Aunque los otros cuatro paquetes llegasen al 100 %, el global se quedaría en **78,7 %** | Cerrar el hueco de `web` es la única vía real al 80 % |
| **Perfil de 200 concurrentes** | 31 % de *timeouts* por pool agotado | k6 desde otra máquina (B-3) + pool dimensionado y/o caché/CDN |
| **LCP** | Sin instrumento | Añadir medición de campo |
| **Escaneo axe con datos** | El spec fuerza un worker muerto y el dashboard exige sesión: las gráficas con cifras reales no se escanean | Escenario E2E con worker vivo y sesión |
| **`pnpm audit` sin triar** y **digest de Slither sin fijar** | Documentado en el propio pipeline | Triage y fijado de digest |

## 5. Cómo reportar una cifra nueva (sin mentir)

1. Mide con el instrumento del repositorio, no con una estimación.
2. Guarda el **artefacto** (JSON en `RepoTecnico/evidencias/` o informe de la suite).
3. Di el **perfil exacto**: concurrencia, duración, endpoints, máquina y si los servicios estaban
   levantados.
4. Si no cumple el SLA, **publícalo con sus números** y la causa; no bajes el perfil ni cambies el
   umbral del trinquete para que salga verde.
5. Actualiza [`../../cobertura.md`](../../cobertura.md) (o el informe de rendimiento) y registra el
   avance en [`../../estado_proyecto.md`](../../estado_proyecto.md) §9.

---

*Volver a [Mantenimiento](README.md) · Índice general: [`../README.md`](../README.md)*

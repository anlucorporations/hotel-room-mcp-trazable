# Cobertura de pruebas y gates de CI (M8 · D-08)

> **Estado:** medido sobre el árbol de trabajo el 2026-09-23. Los números de §3 y la evidencia de §6
> proceden de la **misma ejecución de cierre** (§6), posterior a la corrección por otro agente del fallo
> descrito en §6.1.
> **Regla de este documento:** no se redondea hacia arriba, no se inventa ninguna cifra y nada se declara
> cumplido si no lo está. Todas las cifras son salidas literales de Vitest y se pueden reproducir con los
> comandos de la §2.

---

## 0. Medición posterior (2026-10-08)

> **Actualización**: el gate de la web **vuelve a pasar**. Aquí abajo queda la medición de 2026-09-23, que
> es la que describe la deuda original.

| Métrica (web) | 2026-09-23 | **2026-10-08** | Umbral |
|---|---|---|---|
| Ramas | 74,05 % (calibración del trinquete) | **73,07 %** | 73 |
| Sentencias | 24,95 % | 34,86 % | 23 |
| Funciones | 53,84 % | 61,79 % | 52 |
| Líneas | 24,95 % | 34,86 % | 23 |
| Pruebas | — | **909** | — |

El gate estaba en rojo por **ramas** (69,49 %) porque **ningún handler de API tenía pruebas** y las
validaciones defensivas de las librerías estaban sin cubrir. Se añadieron **75 pruebas** (14 ficheros)
centradas en ramas reales; detalle en `estado_proyecto.md` §14.19. Quedan sin cubrir las ramas
inalcanzables por diseño y las rutas de API de otros flujos, que necesitan el andamiaje de pruebas de
handlers (autenticación, base de datos y cadena dobladas) que el proyecto todavía no tiene.

---

## 1. Resumen ejecutivo

| Pregunta | Respuesta honesta |
|---|---|
| ¿Hay gate de cobertura bloqueante? | **Sí**: `test:coverage` en los 5 paquetes con `thresholds` que hacen fallar el proceso (exit ≠ 0) si la cobertura baja. |
| ¿La cobertura está medida? | **Sí**, con `@vitest/coverage-v8` y umbrales fijados al valor real medido (trinquete), no a un 80 % teórico. |
| ¿Se cumple el 80 % de M8/D-08? | **No en todos: 3 de los 5 paquetes sí, 2 no.** Cumplen `monitor` (91,12 %), `mcp` (93,97 %) y `worker` (80,68 %) en statements, branches y functions. **No cumplen `shared` (79,21 % st, 75,00 % fn) ni, muy lejos, `apps/web` (24,95 % st, 53,84 % fn).** |
| ¿Y el global? | **49,51 % de statements** con las exclusiones del gate, **50,25 %** sin exclusiones. El global está dominado por `apps/web`, que aporta 8.081 de las 14.261 sentencias (56,7 %). |
| Hallazgo principal | Excluir el ABI generado **no** deja `shared` en ≈87 % (como estimaba el enunciado) sino en **79,21 %**. Ver §9.1. |

**Consecuencia para D-08:** hoy los gates bloquean **regresiones**, que es lo que sí se puede afirmar; **no**
certifican el 80 % de cobertura. Declarar M8 «cumplido» en cobertura sería falso: falta la mayor parte del
trabajo de pruebas de la web (§7.3).

---

## 2. Cómo reproducir cada medición

### 2.1 Medición del gate (con las exclusiones configuradas)

```bash
pnpm --filter @hotel/shared  test:coverage
pnpm --filter @hotel/worker  test:coverage
pnpm --filter @hotel/web     test:coverage
pnpm --filter @hotel/monitor test:coverage
pnpm --filter @hotel/mcp     test:coverage
```

Cada script es exactamente `vitest run --coverage` (ver `package.json` de cada paquete). Artefactos en
`<paquete>/coverage/`: resumen por consola (`text-summary`), `coverage-summary.json` (cifras de este
documento) y `lcov.info` (`lcov`, para visor externo). El directorio `coverage/` ya está en `.gitignore`.

Para una sola cifra por paquete sin depender del script:

```bash
pnpm --filter @hotel/<pkg> exec vitest run --coverage
```

### 2.2 Medición **sin exclusiones** (solo se excluyen los propios tests)

Reproduce las cifras «crudas» de la auditoría (incluye `main.ts`, ABI generado, dobles de prueba y
cualquier otro fichero de `src`):

```bash
pnpm --filter @hotel/<pkg> exec vitest run --coverage \
  --coverage.reportsDirectory=coverage-raw \
  --coverage.exclude="**/node_modules/**" \
  --coverage.exclude="src/**/*.test.ts" \
  --coverage.exclude="src/**/*.test.tsx"
```

`--coverage.reportsDirectory=coverage-raw` evita pisar el informe del gate. **Ojo:** `coverage-raw/` no
está cubierto por la regla `coverage/` de `.gitignore`; hay que **borrarlo a mano** después de medir (en
esta sesión se hizo así).

### 2.3 Suite normal (sin cobertura)

```bash
pnpm --filter @hotel/<pkg> test
```

---

## 3. Resultados reales

### 3.1 Con las exclusiones del gate

| Paquete | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `packages/shared` | **79,21 %** (2.839/3.584) | **80,47 %** (573/712) | **75,00 %** (189/252) | 79,21 % (2.839/3.584) |
| `apps/worker` | **80,68 %** (1.366/1.693) | **88,31 %** (325/368) | **85,36 %** (105/123) | 80,68 % (1.366/1.693) |
| `apps/web` | **24,95 %** (2.017/8.081) | **74,05 %** (471/636) | **53,84 %** (105/195) | 24,95 % (2.017/8.081) |
| `apps/monitor` | **91,12 %** (339/372) | **86,36 %** (95/110) | **93,10 %** (27/29) | 91,12 % (339/372) |
| `apps/mcp` | **93,97 %** (499/531) | **87,23 %** (123/141) | **92,85 %** (39/42) | 93,97 % (499/531) |
| **GLOBAL** | **49,51 %** (7.060/14.261) | **80,68 %** (1.587/1.967) | **72,54 %** (465/641) | 49,51 % (7.060/14.261) |

Con `provider: "v8"` sobre estos proyectos, `lines` y `statements` coinciden siempre (mismo instrumento y
mismo conjunto de ficheros); se declaran las cuatro métricas porque el gate las evalúa las cuatro.

### 3.2 Sin exclusiones (solo tests fuera)

| Paquete | Statements | Branches | Functions |
|---|---|---|---|
| `packages/shared` | 65,94 % (4.944/7.497) | 80,41 % (575/715) | 74,90 % (191/255) |
| `apps/worker` | 72,99 % (1.665/2.281) | 89,73 % (402/448) | 83,42 % (151/181) |
| `apps/web` | 24,95 % (2.017/8.081) | 74,05 % (471/636) | 53,84 % (105/195) |
| `apps/monitor` | 80,16 % (388/484) | 87,40 % (111/127) | 90,90 % (40/44) |
| `apps/mcp` | 84,71 % (499/589) | 86,61 % (123/142) | 90,69 % (39/43) |
| **GLOBAL** | **50,25 %** (9.513/18.932) | **81,33 %** (1.682/2.068) | **73,26 %** (526/718) |

Efecto de las exclusiones (statements): `shared` +13,27 pt, `worker` +7,69 pt, `monitor` +10,96 pt,
`mcp` +9,26 pt, `web` 0,00 pt.

> **Nota de trazabilidad.** El enunciado citaba como cifras crudas `shared` 66,25 % (4.941/7.457),
> `worker` 72,6 % (1.619/2.230), `web` 22,78 % (2.017/8.852), `monitor` 75,2 % (364/484) y `mcp` 58,29 %
> (376/645). Al empezar esta sesión, el comando de §2.2 reproducía **exactamente** la cifra de `monitor`
> (364/484) y el numerador de `shared` (4.941), lo que valida el método. Las cifras de §3.2 son las de la
> **misma ventana de medición que §3.1**; las demás diferencias frente al enunciado se explican porque el
> árbol está en edición por varios agentes a la vez (denominadores y numeradores se mueven: `web` 8.852 →
> 8.081 sentencias con el mismo numerador de 2.017; `monitor` 364 → 388 cubiertas porque otra rama añadió
> pruebas durante la sesión; `mcp` 645 → 589 además de las pruebas que añade esta tarea, §8). Las cifras
> de la auditoría eran, por tanto, de una **revisión anterior** del árbol.

---

## 4. Exclusiones y su justificación

Bloque común a los cinco `vitest.config.ts` (cada línea lleva su comentario en el propio fichero):

| Patrón | Por qué se excluye | Qué se pierde |
|---|---|---|
| `src/**/*.test.ts` / `*.tsx` / `*.spec.ts` / `*.spec.tsx` | Los tests no son producto: medirlos infla la cifra sin decir nada del código entregado. | Nada. |
| `**/dist/**` | Salida de `tsup`: artefacto regenerable. | Nada. |
| `**/.next/**`, `**/out/**` (web) | Salida de `next build` (RSC compiladas, chunks, caché). | Nada. |
| `**/*.d.ts` | Declaraciones de tipos: no generan código ejecutable. | Nada. |
| `**/*.config.*` | Configuración de herramienta (vitest/tsup/next/tailwind/postcss): andamiaje. | Nada relevante. |
| `**/test/**` | Utilidades y dobles compartidos por las suites (`setup-env.ts`, `fake-redis.ts`, `empty-server-only.ts`, `guard-mock.ts`). Infraestructura de test. | Nada. |
| `**/scripts/**`, `scripts/create-admin.ts` | Scripts operativos de un solo uso que se ejecutan a mano contra una BD real; no son runtime del paquete. | Nada. |
| `src/abi/**` (**solo `shared`**) | ABI **volcado por el compilador de Solidity**: los 4 ficheros empiezan literalmente con `// Generado por scripts/gen-abi.ts — NO editar a mano.` Son literales JSON, no lógica; nadie ramifica dentro de un ABI, así que su «cobertura» no mide calidad y sólo diluye la señal. Se regeneran con `pnpm contracts:build`. | El **52 % del denominador** de `shared` (3.897 de 7.457 sentencias), de las que **2.105 estaban cubiertas** y 1.792 no (detalle en §9.1). Es la exclusión más agresiva del conjunto y se documenta aquí de forma explícita para que no quede oculta: quien no la acepte, recalcule con §2.2. |
| `src/index.ts` (**solo `shared`**) | Barrel raíz de `export *` sin lógica propia (ya estaba excluido antes de esta tarea; se conserva y ahora **documentado**). Los demás barrels con contenido propio (`env/index.ts`, `health/index.ts`, `deployments/index.ts`, `fixtures/index.ts`) **sí se miden**. | 62 sentencias de re-exportación, **todas sin cubrir** (los tests importan los módulos directamente, no el barrel). Excluirlas sube `shared` de 77,87 % a 79,21 %: **+1,34 pt**. Es la única exclusión que mejora la cifra quitando código no cubierto, y por eso se declara explícitamente. |
| `src/main.ts` (**worker, monitor, mcp**) | *Composition root*: construye las implementaciones concretas y llama a `void main()` **al importarse** (levanta HTTP, BullMQ, planificador, señales). Un test unitario no puede importarlo sin arrancar el proceso entero. La lógica sí se mide en los módulos que compone (`run-worker.ts`, `listener-runtime.ts`, `monitor-core.ts`, `probe.ts`, `chain-monitor.ts`, `tools/`, `server.ts`, `http-server.ts`…). | 58 sentencias en `mcp`, 61 en `monitor` y 244 en `worker`, **todas sin cubrir**. Se declara abiertamente que esta exclusión mejora la cifra. |
| `src/**/test-fakes.ts` (worker, monitor) | Dobles de prueba (`FakeHealthProbe`, `FakeAlerter`, `silentLogger`): infraestructura de test, no runtime del servicio. | 51 sentencias en `monitor` (49 cubiertas, porque los propios tests los usan) y **344 en `worker`** (299 cubiertas). Es la exclusión que más mueve la cifra de `worker`, y por eso se declara. |
| **Efecto combinado declarado** | Sin las dos filas anteriores (y sin las demás, que no casan con ningún fichero de estos paquetes), los statements caen de 93,97 % a **84,71 %** en `mcp` (−9,26 pt), de 91,12 % a **80,16 %** en `monitor` (−10,96 pt) y de 80,68 % a **72,99 %** en `worker` (−7,69 pt). Recalculable con §2.2. | — |

**Lo que NO se ha excluido (a propósito):**

- En `apps/web` **no** se excluye `src/app/**` ni `src/components/**` (2.017 de las 8.081 sentencias
  cubiertas están ahí, y el resto es exactamente el trabajo pendiente). Esconderlo habría convertido el
  gate en un trámite.
- No se excluye `src/logger.ts` (pino) en ninguno de los cuatro paquetes que lo tienen aunque esté al 0 %.
- No se excluyen páginas RSC (`page.tsx`, `layout.tsx`), ni `middleware.ts`, ni `src/i18n/request.ts`,
  ni `src/config/chain.ts`.

---

## 5. Umbrales configurados (trinquete) y por qué

Criterio: `umbral = floor(valor_medido) − 1 punto`. Así el gate **falla hoy** ante cualquier regresión real
y **no** exige un 80 % que no se alcanza. No hay ningún umbral redondeado hacia arriba.

| Paquete | Statements | Branches | Functions | Lines | Medido (st/br/fn) |
|---|---|---|---|---|---|
| `packages/shared` | **78** | **79** | **74** | **78** | 79,21 / 80,47 / 75,00 |
| `apps/worker` | **79** | **87** | **84** | **79** | 80,68 / 88,31 / 85,36 |
| `apps/web` | **23** | **73** | **52** | **23** | 24,95 / 74,05 / 53,84 |
| `apps/monitor` | **90** | **85** | **92** | **90** | 91,12 / 86,36 / 93,10 |
| `apps/mcp` | **92** | **86** | **91** | **92** | 93,97 / 87,23 / 92,85 |

Notas:

- **Ningún paquete tiene un 80 % de umbral.** Poner 80 en `web` habría dejado el gate en rojo permanente
  (y por tanto inútil: nadie mira un gate que siempre falla); poner 80 en `shared` habría sido declarar
  cumplido lo que está a 0,34 pt.
- El punto de margen absorbe el ruido normal del árbol (en esta misma sesión el denominador de `web` se
  movió de 8.077 a 8.081 sentencias por ediciones de otro agente, sin bajar el porcentaje).
- El umbral es **global por paquete**, no por fichero. Un fichero nuevo pequeño sin tests apenas mueve el
  global; por eso el trinquete se complementa con la revisión de PR.
- **El gate es bloqueante** porque `vitest run --coverage` sale con código ≠ 0 al incumplir un umbral. La
  conexión de ese exit code al pipeline queda en `.gitlab-ci.yml`, **fuera del alcance de esta tarea**
  (fichero prohibido para este agente y en edición por otro).

---

## 6. Verificación ejecutada (salida real)

Se ejecutaron los cinco `test:coverage` y los cinco `test` de forma consecutiva. **Los 10 procesos
terminaron con `EXIT=0`.** Salida literal (recortada a las líneas de resumen):

```
########## test:coverage @hotel/shared
 Test Files  28 passed (28)
      Tests  254 passed (254)
Statements   : 79.21% ( 2839/3584 )
Branches     : 80.47% ( 573/712 )
Functions    : 75% ( 189/252 )
Lines        : 79.21% ( 2839/3584 )
EXIT=0
########## test @hotel/shared
 Test Files  28 passed (28)
      Tests  254 passed (254)
EXIT=0
########## test:coverage @hotel/worker
 Test Files  12 passed (12)
      Tests  114 passed (114)
Statements   : 80.68% ( 1366/1693 )
Branches     : 88.31% ( 325/368 )
Functions    : 85.36% ( 105/123 )
Lines        : 80.68% ( 1366/1693 )
EXIT=0
########## test @hotel/worker
 Test Files  12 passed (12)
      Tests  114 passed (114)
EXIT=0
########## test:coverage @hotel/web
 Test Files  32 passed (32)
      Tests  243 passed (243)
Statements   : 24.95% ( 2017/8081 )
Branches     : 74.05% ( 471/636 )
Functions    : 53.84% ( 105/195 )
Lines        : 24.95% ( 2017/8081 )
EXIT=0
########## test @hotel/web
 Test Files  32 passed (32)
      Tests  243 passed (243)
EXIT=0
########## test:coverage @hotel/monitor
 Test Files  5 passed (5)
      Tests  34 passed (34)
Statements   : 91.12% ( 339/372 )
Branches     : 86.36% ( 95/110 )
Functions    : 93.1% ( 27/29 )
Lines        : 91.12% ( 339/372 )
EXIT=0
########## test @hotel/monitor
 Test Files  5 passed (5)
      Tests  34 passed (34)
EXIT=0
########## test:coverage @hotel/mcp
 Test Files  4 passed (4)
      Tests  38 passed (38)
Statements   : 93.97% ( 499/531 )
Branches     : 87.23% ( 123/141 )
Functions    : 92.85% ( 39/42 )
Lines        : 93.97% ( 499/531 )
EXIT=0
########## test @hotel/mcp
 Test Files  4 passed (4)
      Tests  38 passed (38)
EXIT=0
```

Ningún umbral hubo que ajustarlo a la baja después de esto: los valores de umbral de §5 son los mismos que
se usaron en esta ejecución.

### 6.1 Incidencia durante la sesión: `@hotel/shared` en rojo por una edición ajena (**resuelta**)

Entre la primera verificación y la de cierre, una **edición concurrente de otro agente** sobre
`packages/shared/src/queue/notifications.ts` (fichero prohibido para quien escribe este informe) dejó 2 de
los 254 tests de `shared` en rojo:

```
❯ src/queue/notifications.test.ts (3 tests | 2 failed) 54ms
   × NotificationQueueService (US-08) > debe persistir en PostgreSQL en PENDING y encolar en BullMQ con jobId = notification.id
     → AssertionError: expected "spy" to be called with arguments: [ 'NFT_SOLD', { …(4) }, …(1) ] / Number of calls: 0
   × NotificationQueueService (US-08) > debe reconciliar notificaciones PENDING con antigüedad > 5 min
     → Error: [vitest] No "createIORedisClient" export is defined on the "bullmq" mock.
        ❯ NotificationQueueService.getQueue src/queue/notifications.ts:35:21
 Test Files  1 failed | 27 passed (28)
      Tests  2 failed | 252 passed (254)
EXIT=1
```

**Causa:** `notifications.ts` empezó a usar `createIORedisClient` y el `vi.mock("bullmq")` de
`notifications.test.ts` no lo declaraba. **No tenía relación con los umbrales de cobertura**: era un fallo
de *test*, no de cobertura. **Estado: resuelto por el otro agente** antes del cierre; la ejecución de §6
(10 procesos en verde) es la posterior a la corrección. Se deja constancia porque el mismo cambio movió el
denominador de `shared` de 3.560 a 3.584 sentencias (−0,45 pt de cobertura), lo que ilustra por qué los
umbrales llevan 1 punto de margen.

---

## 7. Análisis honesto del hueco frente al 80 %

### 7.0 La aritmética del global

Las 8.081 sentencias de `apps/web` son el **56,7 %** del denominador total (14.261). Consecuencia incómoda
pero verificable:

- Aunque los otros cuatro paquetes llegasen al **100 %**, el global sería 11.223/14.261 = **78,70 %**:
  **no se llega al 80 % global sin tocar `apps/web`.**
- Para que el global alcance el 80 % (≥ 11.409 sentencias cubiertas) con los otros cuatro como están
  (5.043 cubiertas), `apps/web` necesita cubrir **≥ 6.366 de sus 8.081 sentencias (≈ 78,8 %)**.

Es decir: **el 80 % del proyecto es, en la práctica, el 80 % de `apps/web`.**

### 7.1 `packages/shared` — 79,21 % st / 75,00 % fn → faltan **29 sentencias** para el 80 % de statements

Irónicamente es el paquete más cerca del objetivo en statements (29 sentencias) y el más lejos en
functions (63 de 252 sin cubrir). Huecos, por tamaño:

| Fichero | Sin cubrir / total | % | De qué tipo |
|---|---|---|---|
| `src/redis/client.ts` | 130/135 | 3,7 % | Cliente Redis singleton con conexión perezosa y reconexión; requiere doble de `ioredis` o Redis real. |
| `src/db/repositories/nfts.repository.ts` | 110/257 | 57,2 % | SQL de repositorio: caminos de actualización y de error; requiere doble de `pg`. |
| `src/logger.ts` | 62/62 | 0 % | Configuración de pino (redacción, transporte). Nadie lo importa en los tests. |
| `src/db/pool.ts` | 50/55 | 9,1 % | Pool `pg` (reintentos, cierre, hooks de error). |
| `src/queue/notifications.ts` | 49/134 | 63,4 % | Cola BullMQ (reconciliación de `PENDING`, `jobId` determinista). Ya cambiado por otra rama durante la sesión (§6.1). |
| `src/events/listener.ts` | 37/342 | 89,2 % | Ramas de reorg/silencio ya mayormente cubiertas; quedan 17 ramas. |
| `src/reception/service.ts` | 34/391 | 91,3 % | 17 ramas de códigos de error. |
| `src/auth/service.ts` | 26/287 | 90,9 % | 9 ramas + 4 funciones (bloqueos, recuperación). |
| `src/deployments/index.ts`, `src/domain/roles.ts`, `src/db/migrator.ts`, `src/network.ts`, `src/browser.ts` | 26+23+23+22+13 = 107 | 0 % | Lectura de fichero de despliegues y helpers puros nunca importados por un test. |
| `src/zz-probe4.ts` | 18/18 | 0 % | **Fichero de sondeo/scratch ajeno a esta tarea** (`zz-`), presente en `packages/shared/src/**` durante la sesión. No lo toca este informe (fichero prohibido), pero **no debería llegar a `main`**: no es producto. |

**Trabajo pendiente real:** (a) dobles de `pg`/`ioredis`/BullMQ para los tres adaptadores de
infraestructura — es el grueso (≈ 340 sentencias, ≈ 50 funciones); (b) 6 tests pequeños para los helpers
puros (`roles`, `network`, `browser`, `migrator`, `deployments/index`). Con (b) solo ya se cruzaría el 80 %
de statements; con (a) se acercaría también el 80 % de **functions**, que es la métrica que hoy falla de
verdad en este paquete (75,00 %).

### 7.2 `apps/worker` — 80,68 % st / 85,36 % fn → **cumple** el 80 % en statements

Los huecos son los adaptadores de borde, ninguno por encima de 52 sentencias:

| Fichero | Sin cubrir / total | De qué tipo |
|---|---|---|
| `src/listener-runtime.ts` | 52/52 | Arranque/parada del runtime del listener (composición de ciclos). |
| `src/mailer.ts` | 52/52 | Envío SMTP real (análogo al `alerter` del monitor: se puede cubrir con el mismo patrón de doble). |
| `src/queued-mailer.ts` | 44/44 | Encolado + entrega diferida. |
| `src/sale-notifier.ts` | 42/42 | Notificación de venta (orquestación). |
| `src/chain-source.ts` | 46/164 | 71,95 %: ramas de reconexión/paginación del origen de cadena. |
| `src/run-worker.ts` | 32/208 | 84,61 %: ramas de parada y error. |
| `src/sale-processor.ts`, `src/email-consumer.ts`, `src/http-server.ts` | 16+16+9 | Ramas de error ya casi cubiertas. |
| `src/logger.ts` | 7/7 | Configuración de pino. |

**Trabajo pendiente real:** ≈ 7 ficheros de borde, ~250 sentencias. Es el paquete con el hueco **más
barato** después de `mcp`/`monitor`: `mailer`/`queued-mailer` se cubren con un doble de `nodemailer` y
`listener-runtime` con un doble de la fuente de cadena.

### 7.3 `apps/web` — 24,95 % st / 53,84 % fn → **faltan 4.448 sentencias** para el 80 % (el gran hueco)

Causa raíz estructural, no de esfuerzo: **la suite de la web es server-side en Node**
(`environment: "node"`, `include: ["src/**/*.test.ts"]`, ni siquiera admite `.test.tsx`). Las rutas de API
están probadas (24 ficheros, 1.398 sentencias, sólo 368 sin cubrir = 73,7 %); **toda la UI React está a
0 %** porque sin `jsdom` no hay forma de montarla.

Desglose exacto del hueco (sentencias sin cubrir / total; los bloques suman las 6.064 sin cubrir sobre
las 8.081 totales):

| Bloque | Sin cubrir / total | Ficheros | De qué tipo |
|---|---|---|---|
| `src/components/admin/**` | 1.645 / 1.671 | 17 | Componentes y hooks de admin (mint, roles, fondos, pausa, royalty, caducadas, sesión). **Requiere DOM + `@testing-library/react` + mocks de wagmi/viem.** |
| `src/components/my-nights/**` | 457 / 485 | 7 | Tarjetas y hooks de «Mis noches» (listar, reclamar, reventa). DOM + wagmi. |
| `src/components/buy/**` | 439 / 452 | 6 | Flujo de compra (`BuyButton`, `TxModal`, `useBuyNight`, `usePurchaseReview`). DOM + wagmi. |
| `src/components/assistant/**` | 376 / 396 | 4 | Chat del asistente y handoff de compra. DOM + streaming SSE. |
| `src/components/dashboard/**` | 374 / 374 | 6 | Gráficas de Recharts (D-16). DOM + `ResizeObserver`. |
| `src/components/{wallet,layout,catalog,history,tx,resale}/**` | 829 / 845 | 17 | UI de wallet, cabecera/pie, filtros, tablas, recibos y mercado de reventa. DOM. |
| `src/components/*.tsx` (raíz) | 385 / 385 | 5 | `CatalogClient`, `NightCard`, `NightImage`, `DegradedState`, `ContractPausedBanner`. DOM. |
| **Subtotal UI/componentes** | **4.505 / 4.608** | **62** | **74,3 % del hueco total** |
| `src/app/api/**` | 368 / 1.398 | 24 | **Parcialmente cubierto** (73,7 %); falta ramas de error y rutas sin test (`api/assistant/route.ts` 85, `api/auth/verify/route.ts` 79). Server-side, **no necesita DOM**. |
| `src/app/recepcion/page.tsx` | 279 / 279 | 1 | Página RSC grande de recepción. RSC + mocks de `next/navigation`/server actions. |
| Resto de `src/app/**` (páginas, layouts, `loading.tsx`, `providers.tsx`, `app/health/**`) | 430 / 443 | 21 | Páginas y layouts de Next (RSC). |
| `src/lib/nights.ts` | 168 / 168 | 1 | Consultas de noches (server-side, importada sólo por componentes). |
| `src/lib/assistant/**` | 131 / 346 | 11 | Parcialmente cubierto (orquestador, validación de tx y rate-limit **sí** lo están). |
| Resto de `src/lib/**` + `src/config/**` + `src/i18n/**` + `src/middleware.ts` | 183 / 839 | 16 | Helpers puros y de servidor sin test (`format.ts` 49, `session.ts` 37, `i18n/request.ts` 25, `worker-api.ts` 22, `nonce-store.ts` 12, `config/chain.ts` 11…): **los más baratos, no necesitan DOM**. |

Reparto por tipo de trabajo: **UI/componentes 4.505 (74,3 %)**, **app/RSC 1.077 (17,8 %)**,
**lib/config 482 (7,9 %)**.

**Trabajo pendiente real, en orden de coste/beneficio:**

1. **Habilitar entorno DOM**: añadir `jsdom` + `@testing-library/react` + `@testing-library/user-event`,
   permitir `src/**/*.test.tsx` en `include` y usar `environmentMatchGlobs` (o
   `// @vitest-environment jsdom` por fichero) para no romper los tests de servidor. **Sin esto, el 80 %
   es inalcanzable.** Es la dependencia bloqueante de todo lo demás.
2. **Mocks de la capa wallet**: `wagmi` (`useAccount`, `useWriteContract`, `useReadContract`) y `viem`.
   Sin ellos no se puede montar ni un botón de compra.
3. **Tests de componentes**: admin (1.645), my-nights (457), buy (439), assistant (376), dashboard (374),
   resto de componentes (829 + 385). Es el 74 % del hueco.
4. **Tests de páginas RSC**: `recepcion/page.tsx` (279) y las 21 páginas/layouts restantes (430), con mocks
   de `next/navigation`, `next-intl` y de los server actions.
5. **Cerrar ramas de `src/app/api/**`** (368 sin cubrir) y los helpers puros de `src/lib` (183).

Ni el punto 1 ni el 2 existen hoy en `apps/web/package.json` (no hay `jsdom`, `@testing-library/*`). Es
trabajo pendiente de verdad, no un ajuste de configuración.

### 7.4 `apps/monitor` — 91,12 % st → **cumple** las cuatro métricas (la más baja, branches 86,36 %)

Hueco residual, ~33 sentencias:

- `src/logger.ts` 7/7 (0 %): configuración de pino.
- `src/monitor-core.ts` 17/143 (88,1 %): ramas de ventana de fallos y de recuperación.
- `src/chain-monitor.ts` 7/91 (92,3 %): ramas del temporizador y de `minNative` por wallet.
- `src/config.ts` 2/64 (96,9 %).

No es necesario tocar nada para el 80 %; si se quiere subir, los tres puntos anteriores son baratos.

### 7.5 `apps/mcp` — 93,97 % st → **cumple** las cuatro métricas (la más baja, branches 87,23 %)

Hueco residual, ~30 sentencias:

- `src/logger.ts` 7/7 (0 %).
- `src/server.ts` 10/55 (81,8 %): el registro de herramientas del `McpServer` (callbacks sólo invocados a
  través del transporte MCP real).
- `src/http-server.ts` 13/116 (88,8 %): ramas de transporte Streamable HTTP y de allowlist.

### 7.6 Resumen de lo que falta, por tipo de trabajo

| Tipo de trabajo | Dónde | Sentencias sin cubrir | ¿Bloquea el 80 %? |
|---|---|---|---|
| Entorno DOM + testing-library | `apps/web` (transversal) | — | **Sí, es el prerrequisito** |
| Tests de componentes React y hooks | `apps/web/src/components/**` (62 ficheros) | 4.505 | **Sí** |
| Tests de páginas/layouts RSC | `apps/web/src/app/**` no-API (22 ficheros) | 709 | Sí |
| Dobles de infraestructura (`pg`, `ioredis`, BullMQ) | `packages/shared` (`redis/client`, `db/*`, `queue/*`) | ≈ 340 | No para statements en `shared` (faltan 29), sí para functions |
| Ramas de error en rutas API | `apps/web/src/app/api/**` | 368 | Ayuda |
| Helpers puros y de servidor sin test | `apps/web/src/lib/**` (no assistant), `src/config`, `src/i18n`, `middleware.ts` | 183 | Aporta el 80 % de statements en `shared` junto con lo siguiente |
| Helpers puros sin test | `shared` (`roles`, `network`, `browser`, `migrator`, `deployments/index`) | 107 | |
| Adaptadores de borde (SMTP, runtime del listener) | `apps/worker` | ≈ 250 | No (ya cumple) |
| Configuración de logger (pino) | los 4 paquetes con `logger.ts` | 7-61 | No |

---

## 8. Tests añadidos en esta tarea

Solo se han añadido tests que prueban **comportamiento real**. No se ha añadido ningún test trivial para
inflar la cifra, y en particular **no se ha tocado ningún fichero de `apps/web/src/**`,
`packages/shared/src/**`, `apps/worker/src/**`, `packages/contracts/**`, `scripts/**` ni
`.gitlab-ci.yml`**.

### 8.1 `apps/mcp/src/chain/viem-chain-reader.test.ts` (fichero NUEVO, 15 tests)

`ViemChainReader` era el **único fichero del MCP a 0 %** (123 sentencias, 0/531) y su ausencia es lo que
explicaba que el paquete estuviera en 70,80 %. Se prueba el adaptador doblando **sólo la frontera de red**
(`createPublicClient`) y ejercitando de verdad:

- el troceado de `getLogs` en chunks de `GETLOGS_MAX_RANGE` (5000) desde el bloque de despliegue, incluido
  el último chunk recortado a la cabeza y el caso «despliegue por delante de la cabeza ⇒ ningún chunk»
  (la paginación es la parte con coste y riesgo real: ADR-09, sin indexador);
- la decodificación de `Mint` (`room`/`date` a `number`, precio a `bigint`) y el **descarte de logs mal
  formados** en lugar de inventar un registro;
- la deduplicación de `Sale`/`Listed`/`Sale.buyer`;
- `getNightSignals`: listado activo, listado inactivo (precio 0, no se arrastra el precio viejo) y
  `ownerOf` revirtiendo ⇒ `exists:false` con todas las señales a cero;
- `isOwnedBy`: comparación sin distinguir mayúsculas, propietario distinto y revert tolerado.

Resultado: `apps/mcp` pasa de **70,80 %** a **93,97 %** de statements (376 → 499 cubiertas de 531).

### 8.2 `apps/monitor/src/alerter.test.ts` (fichero NUEVO, 4 tests)

`EmailAlerter` estaba a 0 % (24 sentencias). Se dobla `nodemailer.createTransport` y se verifica lo único
que un doble de `Alerter` en el núcleo **no** puede verificar: que la configuración se traduce a
nodemailer como toca —en particular `secure`, derivado del puerto (465 ⇒ TLS implícito), que si se
equivoca rompe **todas** las alertas de producción en silencio— además del `from`/`to`/`subject`/`text`
enviados y la propagación del fallo de entrega.

Resultado: `apps/monitor` pasa de **84,67 %** a **91,12 %** de statements (315 → 339 de 372), y `alerter.ts`
queda al 100 %.

Ninguno de los dos tests toca ficheros prohibidos: son ficheros nuevos dentro de los paquetes que sí se
pueden editar (`apps/mcp`, `apps/monitor`).

---

## 9. Correcciones a las cifras del informe de auditoría

### 9.1 El ABI de `shared` no explica lo que se creía

El enunciado estimaba que excluir `src/abi/hotel-nft.ts` (1.218 sentencias, 0 %) y
`src/abi/hotel-marketplace.ts` (573, 0 %) —en total 1.791 sentencias sin cubrir— dejaría
`packages/shared` en ≈ 87 %. **No es correcto.** `src/abi/**` contiene **cuatro** ABI generados más su
barrel, y el conjunto suma **3.897 sentencias**, no 1.791:

| Fichero del ABI | Sentencias | Cubiertas |
|---|---|---|
| `src/abi/hotel-nights.ts` | 1.808 | 1.808 |
| `src/abi/hotel-nft.ts` | 1.218 | 0 |
| `src/abi/hotel-marketplace.ts` | 573 | 0 |
| `src/abi/faucet.ts` | 297 | 297 |
| `src/abi/index.ts` | 1 | 0 |
| **Total ABI** | **3.897** | **2.105** (1.792 sin cubrir) |

El error consistió en confundir «sentencias **sin cubrir** del ABI» (1.792, cifra que sí es correcta)
con «sentencias **totales** del ABI» (3.897): `hotel-nights.ts` y `faucet.ts` son grandes pero **sí se
ejecutan** en los tests, así que entran en el numerador. La cuenta correcta, con la configuración del
gate, es:

- Cuenta del enunciado (incorrecta): `4.941 / (7.457 − 1.791) = 87,2 %`.
- Cuenta real (sobre los mismos datos crudos de la auditoría): el gate quita 3.959 sentencias (3.897 del
  ABI + 62 de `src/index.ts`), de las que 2.105 estaban cubiertas ⇒
  `(4.941 − 2.105) / (7.457 − 3.897) = 2.836 / 3.560 = **79,66 %**`.

Excluir el ABI generado sigue estando justificado (y está documentado en §4 con su tamaño explícito), pero
el efecto es **+13 pt** sobre el dato crudo, no «llegar al 87 %». `shared` **no** alcanza el 80 % ni
siquiera tras la exclusión: con el árbol de cierre mide **79,21 % (2.839/3.584)** y le faltan 29 sentencias
cubiertas. Y conviene decirlo entero: la exclusión quita también 2.105 sentencias **cubiertas**, así que no
es una forma de «inflar» el porcentaje eliminando sólo lo malo.

### 9.2 Las cifras crudas del enunciado son de una revisión anterior del árbol

Al **empezar** la sesión, el comando de §2.2 reproducía **exactamente** `monitor` 364/484 = 75,20 % (la
cifra de la auditoría) y el numerador de `shared` 4.941, lo que valida el método. Al **cerrar**, el mismo
comando da `monitor` 388/484 = 80,16 % (otra rama añadió pruebas) y `shared` 4.944/7.497 (el denominador
bajó 22 sentencias y la cobertura subió 3). Las cifras de `web` (8.852 → 8.081 sentencias de denominador
con el mismo numerador de 2.017), `worker` (2.230 → 2.281) y `mcp` (645 → 589, además de las pruebas que
añade esta tarea) siguen la misma pauta. Conclusión: **comparar porcentajes entre revisiones distintas del
árbol no tiene sentido**; lo comparable es el par (comando, cifra) de §3, medido en una sola ventana.

---

## 10. Limitaciones y avisos

1. **Las cifras son una foto, no un contrato.** Hay trabajo en curso sobre `apps/web/src/**` y
   `packages/shared/src/**`; el denominador se mueve. El margen de 1 punto de los umbrales absorbe el
   movimiento normal, pero una reestructuración grande puede dejar el gate en rojo: en ese caso lo
   correcto es **mirar antes de bajar el umbral**.
2. **El gate aún no está cableado al pipeline.** `vitest run --coverage` devuelve exit ≠ 0 al incumplir,
   pero la conexión a CI vive en `.gitlab-ci.yml`, fichero prohibido para este agente y en edición por
   otro. Mientras no se conecte, esto es un gate **ejecutable pero no bloqueante en el pipeline**.
3. **Las exclusiones casi no mueven el global, pero sí mueven los paquetes.** El global *baja* de 50,25 %
   a 49,51 % al aplicar exclusiones (se quitan sentencias que en conjunto están algo más cubiertas que la
   media, sobre todo por los ABI de `shared` que sí se ejecutan en los tests). En cambio, por paquete:
   `shared` +13,27 pt, `monitor` +10,96 pt, `mcp` +9,26 pt, `worker` +7,69 pt, `web` 0,00 pt. Todas están
   listadas en §4 para que cualquiera pueda recalcular sin ellas con el comando de §2.2.
4. **`lines` == `statements`** en los cinco paquetes con `provider: "v8"`; no es un error de transcripción.
5. **`branch` coverage de `web` (74,05 %) es engañosamente alta**: se calcula sólo sobre el código que
   llega a ejecutarse, y en `web` eso es mayoritariamente las rutas de API. No debe leerse como «la web
   está al 74 %».
6. **No se ha medido cobertura de los contratos Solidity** (`packages/contracts`): es otro runner
   (Foundry) y otra decisión de D-08, fuera del alcance de este informe.
7. **No se ha modificado `apps/web/src/**` ni `packages/shared/src/**`**, por lo que el hueco de la §7.3
   queda descrito pero **no** reducido. Tampoco se ha borrado `packages/shared/coverage-tmp/` (informe
   crudo de la auditoría anterior, no versionado) porque este agente no debe tocar el paquete: **conviene
   eliminarlo** cuando ya no haga falta; el informe del gate es `packages/shared/coverage/`.
8. **Recordatorio de higiene:** durante la sesión apareció `packages/shared/src/zz-probe4.ts` (18
   sentencias, 0 %), un fichero de sondeo ajeno a esta tarea. No lo toca este informe, pero **no debería
   llegar a `main`**.

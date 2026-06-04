# Informe de revisión — Diseño UX y mockup

> **Auditoría multi-agente** · 15 agentes: 7 revisores especializados + 7 críticos adversariales + 1 sintetizador.
> **Hallazgos confirmados:** 47 tras verificación adversarial — 6 altas · 18 medias · 23 bajas (consolidado).
> **Auditados:** `docs/DISENO-UX.md`, `docs/ux-mockups/catalogo.html` · **Referencias:** `REQUISITOS.md`, `CASOS-DE-USO.md`, `DISENO-TECNICO.md`, `PLAN-DE-PRUEBAS.md` · **Fecha:** 2026-06-04

## 1. Veredicto general
El diseño UX está bien encaminado y es maduro a nivel de lenguaje visual, tokens y trazabilidad de pantallas, pero **aún no está listo para guiar la implementación del Hito 3 sin retoques**. La calidad visual es alta (concepto «Mediterráneo editorial» coherente, tipografía y paleta sólidas), pero hay tres clases de problemas bloqueantes: huecos de cobertura de casos de uso del MVP (paginación obligatoria RNF-02, gestión de reventa CU-06/claim, estados del buy-button por saldo/en-curso, accesibilidad del TxModal), defectos de accesibilidad WCAG verificados (foco terracota invisible sobre teal 1.71:1, eyebrow 4.29:1 sobre arena) y problemas de codificación del mockup que rompen los tests (data-testid `buy-button` duplicado en 6 cards contra el strict mode de Playwright). Ninguno es estructural: son correcciones puntuales de especificación y de mockup. Con el plan de acción de §7 resuelto, el diseño puede servir como referencia fiable para el frontend.

## 2. Resumen por severidad

| Severidad | Total |
|-----------|-------|
| Alta | 6 |
| Media | 18 |
| Baja | 23 |
| **Total** | **47** |

## 3. Hallazgos críticos (severidad alta)

1. **Anillo de foco terracota invisible sobre botón primario teal (1.71:1)**
   - Ubicación: mockup `:focus-visible` (CSS L57); `.btn-primary` (HTML 251/268/284/300/316/332), `.chip[aria-pressed=true]` (L112), `.retry` (L351).
   - Problema: outline `--terracotta` #C0542E sobre `--sea` #0E5A63 da 1.71:1 (2.41:1 sobre `--sea-deep` en hover), muy por debajo del 3:1 que exigen WCAG 1.4.11 y 2.4.7/2.4.11. Afecta a todos los CTAs «Reservar», chips presionados y al botón retry.
   - Recomendación: garantizar ≥3:1 del indicador de foco contra AMBOS colores adyacentes (anillo de doble capa claro/blanco + sombra exterior oscura, o color de foco con ≥3:1 sobre teal). Verificar específicamente sobre `.btn-primary`, chips presionados y `.retry`.

2. **El eyebrow en terracota sobre arena cae a 4.29:1 — incumple el AA 4.5:1 que el propio doc declara universal**
   - Ubicación: mockup `.hero .eyebrow` (CSS L95, HTML L210); doc §2.1 fila `--terracotta` y §6/RNF-20.
   - Problema: terracota #C0542E sobre arena #FBF6EC = 4.286:1, por debajo del mínimo AA para texto pequeño (12.5px, 600, mayúsculas). §2.1 documenta 4.6:1 pero ese ratio es sobre BLANCO (4.62:1), no sobre el fondo real de uso; §6 afirma que todas las parejas cumplen ≥4.5:1, lo que el mockup contradice.
   - Recomendación: subir el eyebrow a ≥14px (texto grande, basta 3:1) o, manteniéndolo pequeño, oscurecer a un terracota de texto (~#A8431F) verificado ≥4.5:1 sobre `--sand`, o usar `--ink-soft`. Documentar en §2.1 una variante `terracotta-text` con su ratio real sobre arena y revisar la afirmación de §6/RNF-20.

3. **TxModal (confirmación/firma de compra) sin requisitos de accesibilidad de diálogo modal**
   - Ubicación: doc §3 organismo `TxModal` / §5.3.
   - Problema: §5.3 define los pasos pero NO especifica `role=dialog`/`alertdialog` + `aria-modal`, foco inicial, trampa de foco, retorno de foco al disparador, cierre con Escape, ni `aria-labelledby`/`aria-describedby` de la tx ni anuncio de cambio de paso. Es el punto donde el usuario autoriza el pago (ADR-11), hueco relevante frente a WCAG 2.4.3, 4.1.2, 1.3.1.
   - Recomendación: especificar `role=dialog aria-modal=true`, foco inicial al título/primer control, focus trap, Escape cierra (salvo durante el minado), retorno de foco al botón «Reservar», `aria-labelledby`/`aria-describedby` de la tx decodificada y anuncio del cambio de paso (`role=status` para progreso, `role=alert` para tx-reverted, `aria-busy` en el spinner).

4. **El buy-button no especifica «deshabilitado por saldo» (CU-05 05a / TC-E2E-021) ni «compra en curso» (anti doble envío)**
   - Ubicación: doc §4.2, §5.3 (TxModal), §3 (NightCard); mockup `.btn-primary[data-testid=buy-button]`.
   - Problema: ni el wireframe de compra ni los estados de tx ni el buy-button contemplan un estado disabled-por-saldo con mensaje (TC-E2E-021), ni un estado «en curso» (`aria-busy`/bloqueado durante tx-pending/minado) que impida el doble envío con bloques de hasta ~33 s en idle (DISENO-TECNICO §9).
   - Recomendación: especificar dos estados del buy-button: (a) «sin saldo» (disabled + `aria-disabled` + mensaje «Saldo insuficiente» con data-testid) y (b) «en curso» (`aria-busy`/deshabilitado durante tx-pending/minado). Documentarlos en §5.3 y la NightCard de §3.

5. **El catálogo no define paginación ni sus estados pese a ser obligatoria (RNF-02; CU-04)**
   - Ubicación: doc §4.1, §3, §7; mockup `main#catalogo .grid` (grid fijo de 6 cards).
   - Problema: RNF-02 impone «paginación obligatoria» y la EARS de CU-04 exige limitar a `CATALOG_WINDOW_DAYS` con paginación sobre 90 días (catálogo de referencia 50×90 = 4500 noches, RNF-11/TC-NF-001). No hay control de paginación/«cargar más»/scroll infinito ni sus estados (cargando-página-siguiente, fin-de-lista).
   - Recomendación: añadir a §3 un componente de paginación o «load more» (con estado de carga incremental y mensaje de fin de lista) y reflejarlo en §4.1 y el mockup, con anuncio `aria-live` y gestión de foco (RNF-20).

6. **Falta el flujo UX de gestión de reventa (fijar/actualizar/cancelar precio) y la acción `claim()` (CU-06 + ADR-15)**
   - Ubicación: doc §4.3 (Mis noches), §7.
   - Problema: CU-06 cubre listar, actualizar precio (re-Listed, TC-CT-036) y cancelar (Unlisted); ADR-15/DISENO-TECNICO §4 añade `claim()` (retiro de fondos por pull). El UX solo muestra `[Traspasar][Ver]` sin formulario de precio (>0), sin vista «noche ya listada», sin flujo de cancelación, sin mapeo de errores 06a-06d (NotOwner/InvalidPrice/NightExpired/NotListed) y sin UI para `claim()`.
   - Recomendación: especificar la pantalla de gestión de reventa (formulario de precio con validación, vista «noche ya listada» con actualizar/cancelar, mapeo 06a-06d a mensajes y la acción `claim()` con su estado) y reflejarla en §4.3 y §7.

7. **`data-testid=buy-button` duplicado en las 6 cards rompe el strict mode de Playwright**
   - Ubicación: mockup L251/268/284/300/316/332; doc §7; PLAN TC-E2E-020/021/022.
   - Problema: `page.getByTestId('buy-button')` resuelve a 6 nodos y lanza error por múltiples coincidencias. Los TC de compra y TC-E2E-030 (chat) necesitan apuntar al botón de UNA noche concreta (fixture tokenId 10220260615), pero no hay testid por card ni por tokenId.
   - Recomendación: añadir un data-testid por card con el tokenId (p.ej. `night-card-10220260615`) o sufijar el botón (`buy-button-<tokenId>`); el test selecciona la card por su scope y luego el buy-button dentro. Documentar la convención en §7.

> Nota: el hallazgo «eyebrow 4.29:1» aparece duplicado en el conjunto original con severidades media y alta; se reporta una sola vez con severidad alta (el problema base se sostiene). El conteo de §2 considera la entrada media como deduplicada hacia la alta.

## 4. Hallazgos por dimensión

### Accesibilidad

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| Alta | `:focus-visible` L57; `.btn-primary`, `.chip[aria-pressed=true]` L112, `.retry` L351 | Foco terracota sobre teal 1.71:1 (<3:1, WCAG 1.4.11/2.4.7) | Anillo de doble capa o color con ≥3:1 sobre teal; verificar en CTAs/chips/retry |
| Media | `.hero .eyebrow` L95/L210; §2.1 | Terracota sobre arena 4.29:1 (<4.5:1, WCAG 1.4.3); doc declara la cifra sobre blanco | Oscurecer terracota-texto o usar `--ink-soft`/≥14px; documentar ratio sobre sand |
| Media | Script L366-377; chips L218-223 | Toggle de chips permite 0 filtros activos (estado indefinido) | No des-seleccionar el único filtro; reactivar «Todas» al quedar vacío |
| Media | `span.count[data-testid=result-count][aria-live=polite]` L224; script L366-377 | `aria-live` no anuncia: el `textContent` nunca cambia al filtrar (WCAG 4.1.3) | Actualizar `result-count` tras render; considerar `role=status` |
| Media | doc §5.2; `.badge` variantes | «Vendida»/«Expirada» solo por color/opacidad (WCAG 1.4.1) | Acompañar cada estado con etiqueta textual o icono además del color |
| Media | `<article>` 235/257/273/289/305/321 y buy-button 251/268/284/300/316/332 | 6 botones «Reservar» idénticos sin nombre accesible único; articles sin etiqueta (WCAG 2.4.4/4.1.2) | `aria-label`/`aria-describedby` por botón (room+fecha+precio); `aria-labelledby` en cada article |
| Media | doc §4.4 (HistoryTable), §1 (320px) | Tabla de 5 columnas sin reflow responsive ni semántica (caption/th scope) especificados (RNF-01/20) | Definir patrón móvil (cards apiladas) con semántica de tabla; validar a 320px (TC-NF-040/030) |
| Baja | `html{scroll-behavior:smooth}` L38; media reduced-motion L179-182 | `scroll-behavior:smooth` no se neutraliza bajo `prefers-reduced-motion` | Añadir `html{scroll-behavior:auto}` dentro del media query |
| Baja | `<h2 class="sr-only" style="...left:-999px">` L230; `.skip` L54 | Clase `.sr-only` no existe; oculta solo por inline frágil | Definir `.sr-only` canónica (clip-path) y aplicarla al h2 y skip-link |
| Baja | §2.1 fila `--olive`; `.pill-net` L166 | `.pill-net` cumple por margen estrecho (4.73:1); doc declara cifra sobre blanco (5.73:1) | Documentar ratio real sobre fondo; oscurecer ligeramente para holgura (no bloqueante) |
| Baja | §2.1 fila `--gold`; `.badge.suite` L141 | Redacción ambigua sobre `--gold` como texto (2.97:1 falla) vs fondo (badge 5.54:1 cumple) | Precisar: gold válido como FONDO con texto oscuro, NO como texto sobre claro |

### Coherencia

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| Media | `.hero` L210-212; §4.1; cf. REQUISITOS §1/§9/§10 | El hero promete estancia real («en propiedad», «sin papeleo») sin aclarar el alcance NO canjeable del piloto | Microcopy/nota visible de reserva tokenizada no canjeable, alineada con REQUISITOS §1/§9/§10 |
| Media | §5.2 vs §3 Badge; cf. CASOS §4 | §5.2 mezcla el tipo «Suite» con estados y afirma coherencia falsa con CASOS §4 (DISPONIBLE/EN_PODER_CLIENTE/LISTADA_SECUNDARIO/EXPIRADA/QUEMADA) | Separar badge de tipo y badge de estado; mapear cada estado UI al canónico; retirar «Suite» de estados |
| Media | `.price .eth` 250/268/284/300/316/332; chip L223; §1/§3 | «ETH» expone jerga cripto en el punto de pago, contra el principio de ocultar web3 | Token único de UX writing para moneda (p.ej. «Ξ» o «ETH» con microcopy de contexto) propagado a todas las vistas |
| Media | `.wallet button` L202-204; §1/§3/§5.1 | La dirección hex «0xB13F…0959» es la única etiqueta visible del botón de cuenta | Anteponer etiqueta humana («Mi cuenta») como primaria; dirección como secundaria; documentar copy en §3/§5.1 |
| Media | §4.7/CU-17; §5.1 | Onboarding expone «MetaMask» y «red» sin traducir a lenguaje de viajero | Reescribir con beneficio primero («cartera digital gratuita», «red del hotel»); jerga como apoyo |
| Baja | §4.6 wireframe «[rol: MINTER]» | Se rotula un rol pero muestra acciones de ROYALTY_ADMIN/PAUSER/BURNER, en tensión con el gate por rol de CU-01 | Aclarar que es vista compuesta; condicionar cada bloque a su rol on-chain |
| Baja | mockup card 102 L275-284 (badge «Simple»); cf. CASOS CU-02, PLAN §3 | Tipo de hab. 102: mockup «Simple» vs CASOS/PLAN la tratan como «suite» | Unificar: corregir CASOS CU-02 y PLAN §3 a «simple», o usar hab. de franja suite (201-220) |
| Baja | `.badge.suite` L240 + `.type` L246 (y Doble/Simple) | Etiquetado redundante del tipo (badge + label) en cada card | Reservar el badge al diferenciador (Suite/Reventa) y omitirlo en Doble/Simple; una sola fuente por dato |
| Baja | buy-button card Reventa L284 vs primarias; §1/§4.2 | La card de reventa usa el mismo CTA «Reservar» sin diferenciar transacción entre particulares | Variante/microcopy para reventa («de otro viajero»); definir set canónico de CTAs en §1/§3 |

### Cobertura

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| Alta | §4.2/§5.3/§3; mockup buy-button | buy-button sin estado «sin saldo» (CU-05 05a/TC-E2E-021) ni «en curso» (anti doble envío) | Especificar ambos estados con data-testid y `aria-disabled`/`aria-busy` |
| Alta | §4.1/§3/§7; mockup grid | Sin paginación obligatoria (RNF-02; CU-04) ni sus estados | Componente paginación/load-more con estados y `aria-live` |
| Alta | §4.3/§7 | Falta flujo de gestión de reventa (precio/actualizar/cancelar) y `claim()` (CU-06+ADR-15) | Especificar pantalla con validación, mapeo 06a-06d y `claim()` |
| Media | §4.1/§5.4/§7; `.grid`/`.state` | Falta estado de carga/skeleton del catálogo (DISENO-TECNICO §8; CU-04 RPC_TIMEOUT_MS) | Añadir estado `catalog-loading` coherente con shell prerenderizado; sin shimmer bajo reduced-motion |
| Media | §4.3/§5.3 | No hay confirmación/recibo del listado/actualización/cancelación de reventa (TxModal solo cubre compra; ADR-11/RNF-19) | Generalizar TxModal/TxStepper a reventa y `claim()` con revisión y recibos + data-testid |
| Media | §5.3 | No distingue «firma rechazada por usuario» de «tx revertida on-chain» (TC-E2E-022; CU-02f/05g/06e/17b) | Separar tx-reverted (reintentar) de firma cancelada (cierra sin error, restaura estado) |
| Media | §4.6/§5.4/§7 | Dashboard sin estado «sin datos» (0% sin NaN) ni «degradado» (CU-11 11a/11b; TC-E2E-051) | Especificar MetricCard sin datos y degraded-state con retry + data-testid en §7 |
| Media | §4.4/§5.4 | Histórico solo define vacío, no el degradado del endpoint de agregados (CU-09 09b; TC-E2E-042) | Añadir degraded-state + retry del histórico (endpoint del worker, no RPC directo) |
| Media | §4.5/§3 | Estados del asistente IA poco especificados: «pensando», error recuperable en dominio, forma del rechazo OOD (CU-08 08b/08e) | Especificar indicador «escribiendo» (`aria-live`), error recuperable y plantilla OOD sin CTA, con data-testid |
| Baja | `.save` 241/263/279/295/311/327; §3/§6 | Botón «Guardar» (favorito) sin RF/CU ni persistencia definida (arquitectura es lectura RPC sin backend) | Eliminar del MVP o documentar como Fase 2 con mecanismo (localStorage) |

> Nota: «El botón Guardar carece de flujo/destino» (usabilidad, baja) y «Guardar sin requisito/CU ni persistencia» (cobertura, baja) describen el mismo defecto; se tratan como un único hallazgo.

### Visual

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| Media | `.ph` L131 y `.ph .fallback` L133 (gradiente idéntico); demo L293 | Estado de carga y fallback de imagen usan el mismo degradado: no se distingue «cargando» de «sin imagen» (frecuente, solo 3 fotos reales RF-18a) | Carga = shimmer sutil; fallback = composición estática de marca (ola SVG + nº habitación en Fraunces) |
| Baja | badges «★ Suite»/«↔ Reventa» L240/278/294 vs SVG stroke-2px L241/248 | Iconografía mixta: glifos Unicode frente al set propio SVG stroke-2px (§3) | Sustituir ★/↔ por iconos outline del set propio o diferenciar solo por color de badge |
| Baja | `<link>` Fraunces wght@…900 L9 vs usos 500/600; §2.2 | Peso 900 de Fraunces cargado pero sin uso; sin token/clase `--measure` aplicable | Asignar 900 a un ancla editorial o eliminarlo; definir clase/token `--measure` (~60-66ch) |

### Usabilidad

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| Media | script L366-377; `.count[data-testid=result-count]` L224 | El filtro de chips no actualiza contador `aria-live` ni filtra el grid (feedback roto; CU-04) | Cablear chips para recalcular/actualizar contador (singular/plural) y disparar empty-state al llegar a 0 |
| Media | §5.3; CASOS CU-05 (05a-05g) y §3 | Los errores de tx no definen el mapa revert→microcopy de hospitalidad (incl. concurrencia 05d) | Mapa revert→microcopy con acción siguiente por error (concurrencia/expirada/saldo/rechazo) |
| Media | §5.3 paso 1; §4.5; ADR-11 | TxModal muestra campos de tx (to/value/tokenId) en vez de un resumen de reserva legible | Resumen humano como elemento primario; datos técnicos en desplegable «Ver detalles» (ADR-11) |
| Baja | script L369-376 | El filtro puede quedar sin ningún chip activo (ni «Todas»): estado ambiguo | Reactivar «Todas» automáticamente cuando no quede ningún chip; documentar la regla |
| Baja | `.badge.reventa` «↔ Reventa» L278; §3/§5.2 | El badge no explica el modelo (otro huésped vende, hay royalty) | Texto más legible («De otro huésped») + microcopy de confianza; «↔» a tooltip |
| Baja | empty-state `<p>` L342 | El empty-state mezcla recuperación con promesa de negocio («Pronto añadiremos más») | Centrar copy en recuperación («Prueba a quitar alguno»); reservar promesas para catálogo globalmente vacío |

> Nota: el contador `aria-live` que no refleja el filtrado aparece como hallazgo en accesibilidad (4.1.3), usabilidad y código (demo); se trata como un único defecto con la corrección en §7.

### Código

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| Alta | mockup L251/268/284/300/316/332; §7; TC-E2E-020/021/022 | `data-testid=buy-button` duplicado en 6 cards rompe el strict mode de Playwright | testid por card con tokenId (`night-card-<tokenId>`) o sufijar el botón; documentar convención |
| Media | mockup L237 (y 259/275/307/323) img `loading="lazy"`; §6 (LCP<2,5s); TC-NF-001 | Primera card above-the-fold con lazy y sin `fetchpriority` penaliza el LCP | `priority`/`fetchpriority=high` (sin lazy) en card(s) del primer viewport; lazy desde la fila inferior |
| Media | mockup imgs L237/259/275/291/307/323 (sin width/height); `.ph{aspect-ratio:4/3}` L131 | Imágenes sin width/height intrínsecos: reserva de espacio depende solo del CSS de layout (CLS) | Declarar width/height (o aspect-ratio) en el `<img>`; en next/image usar `fill` + `sizes` o dimensiones 4/3 |
| Media | mockup onerror inline L238/260/276/292/308/324 | Fallback vía `onerror` inline + `nextElementSibling` no portable a React/CSP (bloqueado por CSP sin unsafe-inline) | Componente cliente `NightImage` con estado (`onError→setHasError`); conservar `data-testid=img-fallback` |
| Baja | mockup `.sr-only` L230; solo `.skip` L54; §6 | Clase `.sr-only` no existe; h2 oculto con inline incompleto | Definir `.sr-only` canónica (clip-path); en Next.js usar la utilidad sr-only de Tailwind |
| Baja | mockup header L64-65, `.filters` L102, `.badge`/`.save` L138-139/143, `.dot` L91, `.pill-net` L166 | `color-mix()` y `backdrop-filter` sin fallback sólido en superficies sticky translúcidas | Fondo sólido de respaldo antes del `color-mix`; envolver el efecto en `@supports` |
| Baja | mockup `result-count` L224, script L366-377 | El contador `aria-live` no refleja el filtrado (JS solo togglea aria-pressed) | Aclarar que el JS es demo; en implementación reescribir `textContent` y ocultar/mostrar cards (TC-E2E-011/014) |
| Baja | mockup img `src=""` L291 (`img-fallback-demo`) | `src=""` puede provocar petición espuria al documento (anti-patrón) | Forzar fallback por ausencia de src o data URI transparente; modelar error por estado del componente |
| Baja | mockup `<link>` Google Fonts L7-9 | Fraunces variable por `<link>`: riesgo de FOUT y render-blocking del titular LCP | Autohospedar con `next/font` (size-adjust/metrics fallback); limitar pesos y rango opsz a los usados |

### Trazabilidad

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| Baja | mockup L237/259/275/307/323 (Unsplash ?w=720); ADR-12, DISENO-TECNICO §8, §6/§8 | Fotos cargadas desde Unsplash externo, contra next/image + host/CDN de ADR-12 | Sustituir por next/image al host/CDN propio (3 imágenes/tipo, RF-18a) con sizes/srcset; anotar que son placeholder |
| Baja | mockup L289-302 (demo) y `.fallback` sin testid L239/261/277/309/325; TC-E2E-013/CU-04 04c | `data-testid=img-fallback` vive solo en la card demo, no en el `.fallback` que activa `onerror` en cards reales | Mover `data-testid=img-fallback` al `.fallback` de las cards reales y eliminar la card demo |
| Baja | §4.6 (botón «Publicar noche» sin testid) y §7 (lista incluye `mint-action`); TC-E2E-001 | `mint-action` figura en §7 pero no anclado a componente ni mockup admin | Anclar `mint-action` al botón «Publicar noche» del MintForm en §4.6; reflejar en snippet/mockup admin |
| Baja | §7 fila Admin (CU-01/02/10/11/12/13/14) y §4.6 vs CASOS §5 | El mapa §7 omite CU-15 (Withdraw) y CU-16 (Roles/Ownership), CU del MVP con UI back-office | Añadir CU-15/CU-16 a §7 y reflejar «Retirar a tesorería» y «Gestionar roles/Transferir ownership» en §4.6 |
| Baja | §2.4 (Tablet 768-1023) y mockup L175 (≥1024→3 col) vs REQUISITOS RNF-01 (768-1024/>1024) | Breakpoint Tablet con rangos solapados en RNF-01 (1024 ambiguo); TC-NF-040 valida 320/768/1024 | Corregir RNF-01 a rangos no solapados (768-1023/≥1024) o nota en §2.4 fijando 1024 como desktop |
| Baja | §4.7 (red «Marina del Sol») vs DISENO-TECNICO §13 (NETWORK_NAME=«Codecrypto Besu»); TC-ACC-002/TC-E2E-062 | Divergencia entre nombre mostrado al usuario y chainName técnico que MetaMask registra | Distinguir alias de marca del chainName técnico; documentar que el guard compara chainId 81234, no el nombre |

## 5. Accesibilidad: incumplimientos WCAG concretos

- **1.4.3 Contraste (mínimo)** — `.hero .eyebrow` (terracota #C0542E sobre `--sand` #FBF6EC = 4.29:1, texto pequeño). Arreglo: oscurecer a terracota-texto (~#A8431F) verificado ≥4.5:1 sobre sand, o `--ink-soft`, o subir a ≥14px. Corregir §2.1 (cifra 4.6:1 es sobre blanco) y la afirmación de §6.
- **1.4.11 Contraste de componentes no textuales / 2.4.7 + 2.4.11 Foco visible** — `:focus-visible` outline terracota sobre `--sea` teal = 1.71:1 (2.41:1 en hover sea-deep). Afecta `.btn-primary`, `.chip[aria-pressed=true]`, `.retry`. Arreglo: indicador de doble capa o ≥3:1 contra ambos colores adyacentes.
- **1.4.1 Uso del color** — estados «Vendida» (atenuada) y «Expirada» (gris) de §5.2 sin etiqueta/icono. Arreglo: acompañar cada estado con texto o icono además del color.
- **2.4.4 / 2.4.6 / 4.1.2 Nombre, función, valor** — 6 botones «Reservar» idénticos sin nombre accesible único; `<article>` sin `aria-label`/`aria-labelledby`. Arreglo: nombre accesible por botón (room+fecha+precio) y `aria-labelledby` por article (como ya se hizo en `.save`).
- **4.1.3 Mensajes de estado** — `result-count` con `aria-live=polite` que nunca cambia al filtrar. Arreglo: actualizar `textContent` tras render; `role=status` de refuerzo.
- **2.4.3 Orden del foco / 4.1.2 / 1.3.1** — TxModal sin `role=dialog aria-modal`, focus trap, retorno de foco, Escape ni labelledby/describedby de la tx. Arreglo: especificar todo el patrón de diálogo modal en §5.3.
- **1.3.1 Información y relaciones / 1.4.10 Reflujo** — HistoryTable de 5 columnas sin reflow a 320px (RNF-01 sin scroll horizontal) ni semántica (caption, th scope). Arreglo: patrón cards apiladas manteniendo semántica de tabla.
- **2.3.3 Animación desde interacciones (AAA, intención del propio media query)** — `scroll-behavior:smooth` no neutralizado bajo `prefers-reduced-motion`. Arreglo: `html{scroll-behavior:auto}` dentro del media query.
- **Robustez sr-only (apoyo a 1.3.1/2.4.x)** — `.sr-only` indefinida; h2 oculto con inline frágil. Arreglo: clase `.sr-only` canónica con clip-path.

## 6. Pantallas/estados a añadir

- **CU-04 (Catálogo):** componente de **paginación/«load more»** (RNF-02) con estados cargando-página-siguiente y fin-de-lista; **estado skeleton/loading** (`catalog-loading`) coherente con el shell prerenderizado de DISENO-TECNICO §8.
- **CU-05/07 (Compra):** estados del buy-button **«sin saldo»** (disabled + mensaje, TC-E2E-021) y **«en curso»** (`aria-busy`, anti doble envío); **firma rechazada** distinguida de **tx revertida** (TC-E2E-022); **mapa revert→microcopy** de hospitalidad (concurrencia 05d, expirada, saldo, rechazo); **resumen de reserva legible** primario en TxModal; **especificación a11y del TxModal**.
- **CU-06 (Reventa):** pantalla de **gestión de reventa** (formulario de precio con validación, vista «noche ya listada» con actualizar/cancelar), mapeo de errores 06a-06d, acción **`claim()`** y sus recibos; generalizar TxModal a estos flujos.
- **CU-08 (Asistente):** estados **«escribiendo/pensando»** (con `aria-live`), **error recuperable en dominio** y **plantilla de rechazo fuera de dominio** (sin CTA de compra), distintos de `assistant-unavailable`.
- **CU-09 (Histórico):** **degraded-state + retry** del endpoint de agregados del worker; patrón **responsive de HistoryTable** a 320px.
- **CU-11 (Dashboard):** MetricCard **«sin datos»** (0% sin NaN) y **degraded-state** del dashboard con retry; data-testid en §7.
- **CU-15/CU-16 (Admin):** pantallas/acciones **«Retirar a tesorería»** y **«Gestionar roles / Transferir ownership»** en §4.6 y §7.
- **CU-17 (Onboarding):** copy reescrito con beneficio primero; distinción chainName técnico vs alias de marca.

## 7. Plan de acción priorizado

**Bloqueantes para iniciar implementación (resolver primero):**

1. `catalogo.html`: dar testid único por card/tokenId al buy-button (`night-card-<tokenId>` o `buy-button-<tokenId>`) y documentar la convención en `DISENO-UX.md §7`. (TC-E2E-020/021/022)
2. `catalogo.html`: corregir el indicador de foco para garantizar ≥3:1 contra teal y arena (doble capa o color con contraste), verificado en `.btn-primary`, chips presionados y `.retry`.
3. `DISENO-UX.md §3/§5.3`: especificar el patrón de accesibilidad del **TxModal** (dialog/aria-modal, focus trap, Escape, retorno de foco, labelledby/describedby, anuncio de pasos).
4. `DISENO-UX.md §3/§4.1/§7` + `catalogo.html`: añadir **paginación/load-more** (RNF-02/CU-04) con estados y `aria-live`.
5. `DISENO-UX.md §4.3/§7`: especificar el **flujo de reventa** (precio/actualizar/cancelar, errores 06a-06d) y la acción **`claim()`** (CU-06/ADR-15).
6. `DISENO-UX.md §3/§5.3`: definir estados del **buy-button** «sin saldo» y «en curso» con sus data-testid.

**Correcciones de especificación (segunda tanda):**

7. `DISENO-UX.md §5.3`: distinguir **firma rechazada** vs **tx revertida** y definir el **mapa revert→microcopy**; especificar el **resumen de reserva legible** como elemento primario del modal.
8. `DISENO-UX.md §4.1/§5.4`: añadir **estado skeleton/loading** del catálogo (sin shimmer bajo reduced-motion).
9. `DISENO-UX.md §4.4/§4.6/§5.4/§7`: añadir **degraded-state** del histórico, estados **«sin datos»/degradado** del dashboard, y mapear **CU-15/CU-16**.
10. `DISENO-UX.md §4.5`: especificar estados del **asistente** (escribiendo, error en dominio, rechazo OOD).
11. `DISENO-UX.md §4.4 + §1`: definir el **reflujo responsive de HistoryTable** a 320px con semántica de tabla.
12. `DISENO-UX.md §5.2 + §3`: separar **badge de tipo** y **badge de estado**, mapear a los estados canónicos de CASOS §4 y exigir etiqueta/icono además del color (1.4.1).
13. `DISENO-UX.md §1/§4.1`: añadir aclaración de **reserva no canjeable** (REQUISITOS §1/§9/§10); reescribir copy de onboarding (§4.7) con beneficio primero.
14. `DISENO-UX.md §2.1`: precisar los ratios de contraste indicando el **fondo real** (terracota/olive/gold sobre blanco vs sand); revisar la afirmación universal de §6; añadir variante `terracotta-text`.

**Pulido de mockup y coherencia documental:**

15. `catalogo.html`: subir/oscurecer el **eyebrow** (≥4.5:1 sobre sand); definir clase `.sr-only` canónica; añadir `html{scroll-behavior:auto}` en el media query reduced-motion.
16. `catalogo.html`: cablear el filtro demo para **actualizar `result-count`** y filtrar el grid, reactivando «Todas» al quedar 0 chips; nombres accesibles únicos por botón «Reservar» y `aria-labelledby` por article.
17. `catalogo.html`: quitar `lazy` y añadir `fetchpriority=high` en la primera card; declarar width/height en imgs; mover `data-testid=img-fallback` al `.fallback` de cards reales y eliminar la card demo (`src=""`); fallback de carga visualmente distinto; fondo sólido de respaldo en superficies con `color-mix`/`backdrop-filter`.
18. `DISENO-UX.md §2.4 / REQUISITOS RNF-01`: desambiguar el breakpoint 1024 (tablet 768-1023 / desktop ≥1024).
19. Coherencia menor: token único de moneda (ETH/Ξ) propagado; copy del WalletButton conectado («Mi cuenta»); decidir/aplazar el botón **Guardar**; unificar el tipo de la hab. 102 entre CASOS/PLAN y el maestro; anclar `mint-action` al botón «Publicar noche»; iconografía outline unificada; autohospedar fuentes con `next/font` y sustituir Unsplash por next/image al CDN propio.
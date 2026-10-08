# Requerimientos — Hotel Marina del Sol

> **Fase**: 3 (Terminación, hito M9) · **Fecha**: 2026-09-23
> **Fuente primaria**: `docs/BRIEF-CLIENTE-INICIAL.md`
> **Especificaciones vigentes**: [`docs/PRD.md`](../docs/PRD.md) v2.0.0 · [`docs/SRS.md`](../docs/SRS.md) v2.0.0 · decisiones normativas en [`docs/adr/`](../docs/adr/README.md)
> **Estado del proyecto**: [`RepoTecnico/estado_proyecto.md`](estado_proyecto.md) · **Cobertura**: [`RepoTecnico/cobertura.md`](cobertura.md)
> **Auditoría de origen**: [`RepoTecnico/INFORME_OPTIMIZACION_V5.md`](INFORME_OPTIMIZACION_V5.md) (22 hallazgos, veredicto NO CUMPLE)

## Cómo leer este documento

Cada requisito lleva **origen** (para que no vuelva a haber requisitos inventados: hallazgo H-15 /
decisión D-15) y **estado real** tras cerrar los hitos M0–M8.

**Origen**: `CLI` = pedido por el cliente en el brief · `ANA` = añadido por el análisis (necesario para
cumplir un deseo del cliente) · `EXT` = añadido sin base en el brief (mantenido por decisión D-11) ·
`TEC` = requisito técnico derivado de una decisión.
**Estado**: `OK` implementado, cableado y verificado · `PAR` parcial con deuda declarada · `AUS` ausente ·
`FASE POSTERIOR` fuera del alcance entregado · `RET` retirado por decisión.

> **Nota de trazabilidad**: los identificadores (`RF-*`, `RNF-*`, `RT-*`, `CU-*`, `US-*`) se conservan
> porque el código y las pruebas los citan. Este documento es la **vista de gestión**; la especificación
> normativa es el PRD/SRS, y la equivalencia entre ambos la comprueba un guardián
> (`packages/shared/src/documentation-guardian.test.ts`).
>
> **Revisiones de M9** (decisiones del responsable, ya implementadas): RF-01/RF-02 recuperan el tipo
> **«doble»** (que se perdía al persistir), RNF-11 resuelve la traza de sesiones con **pseudonimización
> HMAC** y el planificador de **retención** hace efectivos los plazos declarados.

---

## 1. Requisitos funcionales

| ID | Requisito | Origen | Estado | Verificación / deuda |
|---|---|---|---|---|
| RF-01 | Catálogo público con foto, habitación, tipo, fecha y precio, en ES/EN/RU y usable en móvil | CLI | **OK** | `/` sirve venta primaria (D-07); los **tres tipos del maestro** (simple, doble y suite) se persisten y se filtran (M9); las fotos siguen siendo provisionales (B-6) |
| RF-02 | Filtros por fecha, precio, tipo y número de habitación, combinables y sin recarga | CLI | **OK** | `FilterBar`; el filtro por tipo admite los tres del maestro (M9); deuda: filtros propios en `/reventa` (RF-14) |
| RF-03 | Back-office con alta de inventario, precio y foto, y aviso por correo al propietario | CLI | **OK** | Minteo on-chain con re-MFA (ADR-04) + aviso por la cola única (ADR-21) |
| RF-04 | Compra anónima con wallet (MetaMask y otras) | CLI | **OK** | Un solo destino y un solo camino de firma (ADR-11); WalletConnect v2 pendiente de B-4 |
| RF-05 | Notificación por correo al propietario tras cada venta y reventa | CLI | **OK** | Cola única con consumidor y reconciliación; aviso a DevOps si agota intentos |
| RF-06 | Reventa con royalties para el hotel | CLI | **OK** | Royalty por tipo inmutable (ADR-18) + suelo (ADR-19) + transferencias bloqueadas (ADR-07) |
| RF-07 | Resguardo QR de check-in con descarga en pantalla | CLI | **OK** | JWS de un solo uso + EIP-712 del titular contra `ownerOf`; el titular lo genera, lo ve y lo **descarga** desde «Mis noches» y lo enseña en `/checkin`; pases Apple/Google pendientes de credenciales |
| RF-08 | Validación del resguardo en recepción, sin doble uso | CLI | **OK** | Ancla on-chain + `jti` en Redis + cerrojo por noche (ADR-05); E2E M5 33/33 |
| RF-09 | Dashboard del propietario con 7 métricas, gráficas y exportación CSV | CLI | **OK** | KPIs + serie mensual + desglose por tipo + ranking, con la fuente única (ADR-25) |
| RF-10 | Histórico público de ventas y reventas, paginado | CLI | **OK** | `/historico` y CSV desde los agregados del worker |
| RF-11 | Quema automática de las noches no vendidas | CLI | **OK** | Planificador a las 12:00 del hotel, `burnExpired` con simulación y recibo (ADR-21) |
| RF-12 | Avisos push a navegadores suscritos, con opt-in y opt-out | CLI | **OK** | RFC 8291/8292 reales; *best-effort*, no hay recordatorios programados |
| RF-13 | Verificación de disponibilidad on-chain antes de cobrar | ANA | **OK** | Revisión + simulación previa (ADR-11) |
| RF-14 | Re-confirmación de doble factor en operaciones de alto impacto | ANA | **OK** | TOTP contra la semilla cifrada del operador autenticado |
| RF-15 | Retiro de fondos por el vendedor de una reventa (pull-over-push) | ANA | **OK** | `claim()` + `pendingWithdrawals` (ADR-15) |
| RF-16 | Venta primaria en el catálogo y reventa en vista propia | ANA | **OK** | `/reventa` descarta lo que el contrato rechazaría |
| RF-17 | Registro de viajeros conforme al RD 933/2021 | EXT | **Fuera de la plataforma** | Se cumple en el PMS/mostrador; la ruta rechaza PII con 400 (ADR-20) |
| RF-18 | Multisig de custodios para la gobernanza y los fondos | EXT | **AUS** | Gnosis Safe 2-of-3 en alcance; faltan los dos firmantes del cliente (B-7) |
| RF-18a | Maestro de habitaciones como fuente única de tipos y números | ANA | **OK** | `RoomMaster.sol` + `domain/room-master.ts`; de él se deriva el royalty |
| RF-19 | Faucet de pruebas para demos en red local | EXT | **OK** | Solo con `DEPLOY_FAUCET=true` (ADR-13) |
| RF-20 | Chat conversacional que guíe la compra | CLI (deseo) | **PAR** | Cadena completa con validación independiente del LLM; el LLM externo es de pago y no está presupuestado |
| RF-21 | Subastas para la suite | CLI (deseo) | **FASE POSTERIOR** | Diferido por decisión |
| RF-22 | Metadatos en IPFS/Arweave | CLI (deseo) | **PAR** | `ipfs://` con gateway propio; el *pinning* es manual y Arweave queda para fase posterior |
| RF-23 | Cumplimiento MiCA y fiscalidad antes de mainnet | EXT | **FASE POSTERIOR** | Gate de la fase pública, con dictamen externo |

---

## 2. Requisitos no funcionales (ISO 25010)

| ID | Categoría | Requisito | Origen | Estado real y medida |
|---|---|---|---|---|
| RNF-01 | Rendimiento | LCP < 2,5 s en 4G móvil | ANA | **SIN MEDIR**: no hay instrumento de LCP en el repositorio; no se declara cumplido |
| RNF-02 | Rendimiento | Filtros del catálogo < 500 ms | ANA | **MEDIDO**: 50 concurrentes → 9.119 peticiones, 0 errores, **p95 172 ms** |
| RNF-03 | Rendimiento | Validación del resguardo < 3 s | CLI | **OK**: ~41 ms en servidor, con el ancla on-chain incluida |
| RNF-04 | Fiabilidad | Recuperación ante desastre | ANA | **MEDIDO**: `pg_dump` + restauración real + comparación 6/6 tablas (283 filas), RTO 0,73 s |
| RNF-05 | Escalabilidad | ≥ 200 usuarios concurrentes sin degradar | ANA | **NO CUMPLE en una máquina** y está medido: 31 % de *timeouts* por agotamiento del pool; k6 desde otra máquina es B-3 |
| RNF-06 | Seguridad | Doble factor obligatorio en back-office y recepción | CLI (implícito) | **OK**: contraseña + TOTP; 401/403 en todas las rutas protegidas (ADR-04) |
| RNF-07 | Seguridad | Contratos con pruebas unitarias, de integración e invariantes | ANA | **OK**: 13 suites / 125 pruebas Foundry (tras retirar la generación legacy en M9) |
| RNF-08 | Resiliencia | Multi-RPC con *failover* | ANA | **RETIRADO**: un solo RPC, sin failover (ADR-26) |
| RNF-09 | Resiliencia | Cotización EUR con caché y respaldo | ANA | **PAR**: respaldo declarado con factor fijo que envejece (ADR-14) |
| RNF-10 | Observabilidad | *Heartbeat* y alerta si la red se queda muda | ANA | **OK**: listener con heartbeat y alerta de silencio (una por episodio); monitor de cadena y gas (ADR-26) |
| RNF-11 | Privacidad | Compra anónima, sin datos personales | CLI | **OK**: la compra no recoge datos; la traza de acceso de los operadores se guarda **pseudonimizada con HMAC** (ADR-24) y su plazo (7 días) **se ejecuta** con el planificador de retención |
| RNF-12 | Cumplimiento | Registro de viajeros resuelto | CLI | **Fuera de la plataforma** (ADR-20) |
| RNF-13 | Usabilidad | ES / EN / RU completos | CLI | **OK** |
| RNF-14 | Usabilidad | Diseño móvil primero | CLI | **PAR**: escaneo axe en `chromium` y `mobile`; sin matriz de dispositivos físicos |
| RNF-15 | Accesibilidad | WCAG 2.1 AA verificable | EXT | **OK sobre la paleta real**: ratio exacto, sin colores fuera de paleta, gráficas con tabla equivalente, **axe 16/16** (8 rutas × chromium/mobile) sin violaciones critical/serious. Deuda: escenario con datos |
| RNF-16 | Portabilidad | Distribución por CDN | EXT | **FASE POSTERIOR** (mantenido en alcance) |
| RNF-17 | Mantenibilidad | Cobertura de pruebas ≥ 80 % | ANA | **NO ALCANZADO, MEDIDO Y CON GATE**: `mcp` 93,97 · `monitor` 91,12 · `worker` 80,68 · `shared` 79,61 · `web` 24,95 → global 49,51 %. Umbrales en trinquete |
| RNF-18 | Mantenibilidad | Documentación coherente con el código | ANA | **OK en M9**: ADR + PRD/SRS/plan/backlog reescritos y guardián de documentación en verde |
| RNF-19 | Seguridad | Ningún secreto en el repositorio | ANA | **OK** en el código (`requireSecret` en cerrado + guardianes); **acción pendiente del responsable**: revocar el token de GitLab retirado (B-0) y rotar claves |
| RNF-20 | Observabilidad | Errores capturados y trazables | ANA | **OK como logging estructurado JSON**; Sentry retirado (ADR-26) |
| RNF-21 | Verificabilidad | Toda afirmación de calidad reproducible desde el repositorio | ANA | **OK**: certificaciones con artefacto, pipeline sin `\|\| true` ni `allow_failure` (ADR-23) |

---

## 3. Requisitos técnicos (entorno y plataforma)

| ID | Requisito | Origen | Estado | Decisión |
|---|---|---|---|---|
| RT-01 | Red canónica: Anvil local `127.0.0.1:8545`, `chainId 81234` | TEC | **OK** | ADR-01, ADR-17 |
| RT-02 | Contrato único `HotelNights` con `Deploy.s.sol`, `sync-deployment` y registro válido | TEC | **OK** | ADR-02, ADR-06, ADR-09 |
| RT-03 | PostgreSQL como única persistencia (13 tablas) | TEC | **OK** | ADR-03 |
| RT-04 | Redis para cola, locks y blocklist | TEC | **OK** (Memurai 4.1.2 / Redis 7.2.5) | ADR-03, ADR-04 |
| RT-05 | Migraciones incrementales aplicadas al arrancar | TEC | **OK** | ADR-03 |
| RT-06 | Autenticación única: contraseña + TOTP + JWT con rotación | TEC | **OK** | ADR-04 |
| RT-07 | Registro de ADR y limpieza de referencias huérfanas | TEC | **OK (M9)** | D-15 · guardián de documentación |
| RT-08 | `Dockerfile` e IaC del entorno de despliegue | TEC | **AUS** (fase pública) | D-08, D-11 |
| RT-09 | Pipeline con gates bloqueantes (cobertura, web, E2E) | TEC | **OK** | ADR-23 |
| RT-10 | Prueba de carga real con artefacto | TEC | **OK** con medidor propio; k6 pendiente (B-3) | ADR-23 |
| RT-11 | Proyecto WalletConnect Cloud | TEC | **AUS** (B-4) | D-11 |
| RT-12 | Integración real con el PMS del hotel | TEC | **AUS** (B-5); el adaptador no simula nada y no acepta PII | ADR-20 |

---

## 4. Preguntas abiertas al cliente

Pendientes de respuesta en [`docs/RESPUESTA-CLIENTE-BORRADOR.md`](../docs/RESPUESTA-CLIENTE-BORRADOR.md):

1. **Red**: quedarse en red privada (demostración) o saltar a Polygon (fase posterior presupuestada aparte).
2. **Economía**: confirmar el suelo de reventa (0,01 ETH) y el royalty inmutable (5 % / 10 %).
3. **Custodia**: quién guarda las claves y con qué política; designar los **dos firmantes** de la multisig.
4. **PMS**: qué programa usa el hotel y si permite conectarse.
5. **Fotos definitivas** de los tres tipos de habitación.
6. **Fecha**: junio no es alcanzable con el alcance aceptado; cerrar fecha o reducir por fases.
7. **Coste**: validar tarifa, importe del trabajo terminado y coste mensual.

---

## 5. Criterios de aceptación globales

Son los de [`docs/PRD.md`](../docs/PRD.md) §8 (doce criterios, cada uno con su ejecución o su marca de
deuda). Resumen: lo que se firma es lo que se revisa; el royalty es inmutable e ineludible; el check-in
se ancla en la cadena y no se repite; la quema es automática y solo marca lo confirmado; las cifras del
dashboard cuadran con el histórico; ninguna ruta protegida se abre sin rol; **ninguna credencial en el
repositorio**; **ningún dato de viajeros en la plataforma**; toda cifra de calidad es reproducible con su
artefacto; y la documentación describe el sistema que se ejecuta.

---

## 6. Nuevos requerimientos — Suite de recepción (modificación en curso)

> **Origen**: petición del cliente el 2026-10-06 · **Estado**: detalle cerrado, en diseño de datos.
> **Objetivo**: redefinir el ciclo de vida operativo de la habitación tras el check-out y enriquecer la
> subsección **Estado de las habitaciones** del puesto de recepción con una ficha detalle por habitación.

| ID | Requisito | Origen | Estado | Verificación / deuda |
|---|---|---|---|---|
| RF-50 | Tras el check-out, la habitación pasa automáticamente a estado **PENDIENTE_DE_LIMPIEZA** (limpieza + cambio de lencería). Solo recepción puede cambiarla manualmente a **LIBRE/DISPONIBLE** | CLI | **DIS** | Nuevo valor en `rooms.operational_status`; el checkout debe actualizar a `PENDING_CLEANING` |
| RF-51 | La subsección «Estado de las habitaciones» de recepción es un **resumen** (rejilla/lista); al seleccionar una habitación se despliega una **ficha detalle** dividida en **Zona Habitación** y **Zona Huésped** | CLI | **DIS** | Nuevo endpoint `GET /api/reception/rooms/:roomNumber` y componente `RoomDetailCard` |
| RF-52 | En estado **Reservada**: zona Habitación muestra el checklist previo a la llegada (Limpieza, Desodorización, Cambio de Lencería, Climatización, Restitución de Suministros, Solicitudes Especiales); zona Huésped muestra adultos, niños, bebés, mascotas, acceso PMR y la wallet del titular del token (mostrada solo a recepción, no en público) | CLI | **DIS** | Tabla `room_cleaning_checklist_items` + `room_cleaning_checklists`; columnas `adult_count`, `child_count`, `baby_count`, `pet_count`, `accessibility_count` en `reservations` |
| RF-53 | En estado **Ocupada**: zona Habitación muestra un calendario del rango completo de la reserva (check-in … check-out); cada fecha lleva iconos de Limpieza, Mantenimiento, Cargos y Novedades que indican si se realizó alguna acción de ese tipo en esa fecha | CLI | **DIS** | Agregación de `housekeeping_room_logs`, `maintenance_incident_events`, `additional_charges` e incidencias/novedades |
| RF-54 | En estado **Mantenimiento**: zona Habitación muestra la descripción del incidente de mantenimiento abierto (`maintenance_incidents.description`) | CLI | **DIS** | Reutilizar `maintenance_incidents` con `status = 'OPEN'` o `'IN_PROGRESS'` |
| RF-55 | En estado **Libre**: zona Habitación muestra el resumen del último checklist completado (mismos ítems que RF-52) | CLI | **DIS** | Mismo modelo de checklist que RF-52 |

**Decisiones de diseño cerradas con el cliente**:
- El estado post-check-out es un nuevo estado operativo `PENDING_CLEANING`.
- Recepción es el único actor que libera la habitación manualmente (pasa a `CLEAN`).
- El checklist tiene 6 ítems fijos; todos son obligatorios excepto *Solicitudes Especiales*.
- Los datos de huéspedes (edades, mascotas, acceso) se recogen en el formulario de reserva y pueden
  editarse desde recepción.
- La wallet del huésped es la dirección del titular del token (`nfts.current_owner`).

**Impacto en datos**: se añaden el valor `PENDING_CLEANING` a `rooms.operational_status`, el catálogo
`room_cleaning_checklist_items`, la tabla de registros `room_cleaning_checklists` y columnas de
ocupación en `reservations`. Los tres artefactos de datos se actualizan en el mismo cambio.

---

## 7. Nuevos requerimientos — Asistente IA v3 (Hito H1, 2026-10-07)

Origen: `RepoTecnico/propuesta_v3_asistente_ia.md` (aprobada el 2026-10-07). Continúa la numeración
vigente (máximo anterior: RF-55, RNF-21, RT-12).

### 7.1 Funcionales

| ID | Descripción | Prioridad | Estado |
|---|---|---|---|
| **RF-56** | El asistente responde sobre protocolos, servicios, normas y ubicación del hotel usando la herramienta MCP `searchHotelManuals`. | Alta | **✅ Cumplido en H3** para todo lo indexado: el prompt obliga a consultar la herramienta y prohíbe responder de memoria. Sigue pendiente el **contenido del hotel** en `docs/manual-huesped.md` |
| **RF-57** | El asistente mantiene el flujo conversacional de reserva sobre las herramientas MCP existentes, sin cambios de contrato. | Alta | **✅ En producción desde la release v40 (H5)**. Cubierto por RF-12 |
| **RF-58** | El asistente responde en español y formula en español la búsqueda contra el índice. (EN/RU pasan a v3.1.) | Alta | **✅ Cumplido en H3**: entiende otros idiomas, contesta en español y busca en español (`prompt.test.ts`) |
| **RF-59** | Cuando la respuesta provenga del índice, el asistente cita `manual §sección`; si no hay coincidencia, lo declara y no inventa. | Media | **✅ Cumplido en H3**: formato de cita, restricción a las secciones devueltas por la herramienta y prohibición de inventar |
| **RF-60** | El MCP expone `searchHotelManuals` con esquema estricto y operación *read-only*, sin acceso a BD. | Media | **✅ Cumplido en H2** (5ª herramienta, índice en memoria) |

### 7.2 No funcionales

| ID | Descripción | Criterio de aceptación | Estado |
|---|---|---|---|
| **RNF-22** | Coste incremental del asistente ≤ 5 USD/mes con 1 000 conversaciones/mes. | Facturación de GCP + contador de tokens | **✅ Medido en H4 contra el modelo real**: **0,248 USD / 1 000 conversaciones** (margen ≈20× sobre el techo). La cifra facturada de GCP se revisa en H5 |
| **RNF-23** | Cero recursos nuevos de infraestructura (sin GPU, sin base vectorial, sin Cloud SQL adicional). | Inventario de recursos GCP antes/después | Pendiente (H5) |
| **RNF-24** | Presupuesto de tokens por petición: entrada ≤ 6 000 y salida ≤ 512. | Test unitario del presupuesto + telemetría | **✅ Cumplido en H4**: presupuesto de entrada con ventana deslizante, tope de salida 512, tope de 2 rondas de herramientas y telemetría por petición |
| **RNF-25** | Latencia p95 ≤ 2,5 s con instancias calientes; se documenta el efecto del *cold start*. | Medición en Cloud Run | **✅ Medido en H4 y en producción (H5)**: p95 **2 278 ms** y p50 1 246 ms en 20 conversaciones; en producción, 1,30-1,78 s en caliente. **Efecto del cold start documentado**: la primera petición tras inactividad mide 7,0-9,7 s con `min-instances=0`. Se marca **frágil**: con 20 muestras el p95 es el segundo peor valor, así que una llamada lenta del proveedor lo mueve; hay que remedirlo con más volumen desde Cloud Run en H5 |
| **RNF-26** | Sin PII en logs ni en el índice de conocimiento; los prompts no se registran. | Auditoría de logs | **✅ Cumplido en H3-H5**: el índice excluye documentación interna (con guardián), el generador rechaza credenciales, el saneador enmascara la PII antes de salir al modelo y se **verificó en producción** que una petición con nombre, correo y móvil deja **0 coincidencias** en los logs. La línea de telemetría no tiene campos de texto libre (un test fija sus claves) y los prompts no se registran |
| **RNF-27** | Sanitización de PII antes de enviar la conversación al LLM (defensa en profundidad): correo, teléfono, DNI/NIE, IBAN y nombres presentados. | Test unitario del saneador + prueba de integración en el endpoint | **✅ Cumplido en H3** |

### 7.3 Técnicos

| ID | Descripción | Estado |
|---|---|---|
| **RT-13** | Índice de conocimiento generado en build por `apps/mcp/scripts/build-knowledge-index.mjs`; sin ETL en runtime y sin acceso a BD. | **✅ Cumplido en H2/H2.1** (corpus dirigido a personas, guardián de sincronía y `pnpm knowledge` para regenerar; ver R12) |
| **RT-14** | Adaptador `LlmClient` sobre **Vercel AI SDK** contra **Vertex AI · Gemini 2.5 Flash-Lite** en `europe-west1`, conmutable por `ASSISTANT_PROVIDER`. | **✅ Cumplido en H1** |
| **RT-15** | Descartado `pgvector`/HNSW; plan B = embeddings precalculados en build con coseno en memoria. | Documentado |

### 7.4 Trazabilidad

`RF-56…RF-60` → **CU-47** (nuevo, «Consultar información del hotel») y ampliación de **CU-08**
(RF-12, `docs/SRS.md §9`). `RNF-22…RNF-27` → **CU-48** (nuevo, «Operar el asistente con presupuesto
controlado»).

> **Modelo de datos**: la v3 **no modifica** `base_datos.sql`, `diccionario_datos.md` ni
> `diagrama_er.md`. Los tres artefactos siguen sincronizados sin cambios.

> **Corpus del índice (H2)**: solo los tres manuales dirigidos a personas
> (`docs/manual-comprador.md` → `cliente`, `docs/manual-recepcion.md` → `recepcion`,
> `docs/manual-cliente.md` → `propietario`). La documentación interna **no se indexa**: contiene
> credenciales de ejemplo (prohibidas dentro de `apps/` por el guardián D-04) y el MCP se despliega
> con `--allow-unauthenticated`, de modo que la audiencia la elige quien llama.

---

*Requerimientos consolidados · origen trazado · volcados a `docs/PRD.md` y `docs/SRS.md` en M9.*

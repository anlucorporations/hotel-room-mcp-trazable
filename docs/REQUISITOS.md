# Requisitos — Hotel Marina del Sol (NFTs de noches de hotel)

> Documento de requisitos derivado del brief inicial del cliente
> ([`BRIEF-CLIENTE-INICIAL.md`](./BRIEF-CLIENTE-INICIAL.md)) y de las decisiones
> tomadas en la sesión de refinamiento.
>
> **Cliente:** Carlos Martínez — Hotel Marina del Sol (Alicante, ~50 habitaciones)
> **Naturaleza del entregable:** Piloto / Prueba de concepto (PoC) demostrable
> **Fecha del documento:** 2026-06-03
> **Versión:** 2 — incorpora las correcciones de la auditoría
> ([`REVISION-REQUISITOS.md`](./REVISION-REQUISITOS.md))

---

## 1. Resumen ejecutivo

El hotel quiere vender **cada noche de cada habitación como un NFT**, comprable desde
una tienda web propia (en vez de Booking), con **reventa entre clientes** y **cobro de
un royalty al hotel** en cada venta secundaria.

El primer entregable es un **piloto/PoC sobre red privada**, con **pago simbólico vía
faucet** (sin dinero real, por lo que se evita la carga regulatoria de pagos, KYC/AML y
custodia de fondos). Se entrega de forma **incremental en 4 hitos** y se cotiza a
**precio cerrado por alcance fijo** (solo el desarrollo; el mantenimiento mensual se
estima aparte, ver RNF-09 y §11).

> **Alcance del piloto (importante):** las noches NFT del piloto **no son canjeables
> por una estancia real** ni generan hospedaje (no aplica el registro de viajeros del
> RD 933/2021). El canje/check-in con identidad es Fase 2 (RF-20). El pago es en ETH de
> la red privada Besu, **sin valor monetario**. El paso a operación comercial es un
> **gate bloqueante** con revisión legal previa (ver §10).

---

## 2. Stakeholders y roles

### 2.1 Partes interesadas

| Interesado | Descripción | Interés principal |
|------------|-------------|-------------------|
| Carlos Martínez (propietario) | Dueño del Hotel Marina del Sol | Vender noches, cobrar royalties, ver resultados |
| Comprador primario | Cliente que compra una noche en la tienda | Reservar/poseer la noche |
| Propietario/revendedor | Poseedor de un NFT que lo revende | Revender su noche |
| Comprador secundario | Cliente que compra en el mercado secundario | Adquirir una noche revendida |
| Codecrypto | Operador de la red Besu y del entorno | Uptime del nodo, RPC, financiación del gas |
| Agencia / equipo de desarrollo | Construye y entrega el piloto | Cumplir alcance y plazo |
| "El sobrino" | Creó la wallet original del hotel | Riesgo de seguridad a resolver (ver §8) |

### 2.2 Actores y matriz de roles (permisos)

Para evitar un punto único de fallo, los privilegios on-chain se separan por **rol**
(OpenZeppelin AccessControl) en lugar de concentrarse en una única cuenta "admin".

| Rol / Actor | Ámbito | Permisos |
|-------------|--------|----------|
| `DEFAULT_ADMIN` (owner) | on-chain | Asignar/revocar roles; transferencia de ownership en 2 pasos (Ownable2Step). En producción: multisig (Safe) |
| `MINTER` | on-chain | Mintear noches-habitación (RF-18b) |
| `ROYALTY_ADMIN` | on-chain | Ajustar el porcentaje de royalty dentro del rango permitido (RF-08) |
| `PAUSER` | on-chain | Activar/desactivar la pausa de emergencia (RNF-15) |
| `BURNER` | on-chain | Quemar noches expiradas **no vendidas** (propiedad del hotel); nunca tokens de clientes (RF-17) |
| `TREASURY` (receptor) | on-chain | Dirección que recibe ingresos y royalties; destino del `withdraw` (RNF-15) |
| Operador back-office | off-chain | Acceso autenticado al panel de minteo y gestión (RF-05, RF-06) |
| Visor de dashboard | off-chain | Solo lectura de métricas (RF-10) |
| Operador del faucet | off-chain | Financia y opera el faucet; vigila el saldo (RF-21) |
| Operador del mini-worker | off-chain | Opera el listener de eventos y el envío de email (RF-09) |
| Custodio del pinning IPFS | off-chain | Garantiza persistencia de imágenes y metadata (Decisión 13) |
| Comprador / vendedor secundario | público | Conectar wallet, comprar, listar/revender el NFT que posee |

> En el piloto los roles on-chain pueden recaer en pocas cuentas, pero el **diseño del
> contrato debe soportar la separación** para producción. El responsable de custodia de
> las claves se define en §8 y §11.

---

## 3. Requisitos funcionales

### 3.1 MVP — Piloto (primer entregable)

| ID | Requisito | Hito |
|------|-----------|------|
| RF-01 | Tokenizar cada noche-habitación como NFT **ERC-721** (unidad = habitación × fecha); contratos base **OpenZeppelin** | 1 |
| RF-03 | Compra pagando con **ETH nativo de la red Besu** (`payable`), con protección anti-reentrancy (RNF-14) | 1 |
| RF-04 | Conexión y firma con **MetaMask** (incluye añadir la red custom) | 1 |
| RF-05 | Back-office privado para mintear noches bajo demanda (habitación + fecha + precio), con **validación de inputs** (RNF-14) | 1 |
| RF-06 | Autenticación y **control de acceso por roles** del back-office; los roles on-chain se gestionan con AccessControl (ver §2.2) | 1 |
| RF-18a | Catálogo maestro: 50 habitaciones (101–130, 201–220) y 3 tipos (simple, doble, suite); la **foto corresponde al tipo** de habitación | 1 |
| RF-18b | Minteo bajo demanda por el rol `MINTER` (sin carga masiva obligatoria); solo habitaciones del maestro, fecha válida y precio > 0 | 1 |
| RF-19 | **Unicidad on-chain**: tokenId determinístico de formato canónico (ver §5, Decisión 3); el contrato rechaza duplicados con revert | 1 |
| RF-21 | **Faucet de ETH (utilidad de entorno de pruebas, NO de producción)**: en desarrollo/CI dispensa ETH simbólico a las wallets de test, con límite por wallet/ventana. **En producción no existe faucet**; la obtención de ETH en producción se trata en la monetización (§12.1, Fase 2). Ver Decisión 15 | 1 (dev/test) |
| RF-07 | Reventa (mercado secundario) **solo vía el contrato**; solo el propietario del tokenId puede listar | 2 |
| RF-08 | Royalty al hotel mediante **ERC-2981**, cobrado **en cada reventa (venta secundaria)**; **la venta primaria no paga royalty** (100 % del importe al hotel). **Toda transmisión exige precio > 0** y se ejecuta por el contrato; se **bloquean los `transferFrom` directos y los transfers a coste 0**, de modo que no hay vías de evasión. **Porcentaje configurable** por `ROYALTY_ADMIN` en *basis points*, rango 0–2000 bps (0 %–20 %), **por defecto 1000 bps (10 %)**; revert fuera de rango | 2 |
| RF-17 | Noches caducadas: **expiración lógica** (fecha de la noche < día actual en `Europe/Madrid` ⇒ no comprable ni revendible) + **burn manual en lote** por el admin (tamaño de lote acotado) | 2 |
| RF-02 | Marketplace público con catálogo de noches disponibles (foto del tipo, fecha, habitación, precio) | 3 |
| RF-14 | Filtros y buscador (fecha, precio, tipo de habitación) dentro de la ventana acotada (Decisión 23) | 3 |
| RF-15 | Histórico de ventas público (lectura de eventos on-chain); **pseudónimo: sin PII on-chain** (ver RNF-05) | 3 |
| RF-10 | Dashboard del admin con **métricas mínimas**: importe vendido (primario), royalties acumulados, nº de noches vendidas y **ratio de ocupación comercial = noches vendidas / noches minteadas** (dato on-chain). Cada métrica con fórmula, unidad y periodo | 3 |
| RF-09 | Email al admin por cada venta, vía **mini-worker** que escucha eventos; idempotente y con catch-up (RNF-12). *Best-effort*: la verdad de las ventas es on-chain (RF-15) | 1-3 (ver §6) |
| RF-12 | **Asistente IA = LLM + MCP server del contrato**. Un servidor **MCP** expone herramientas *read-only* (noches/habitaciones disponibles; NFTs en poder de una wallet dada) y una herramienta que **devuelve los datos para construir la tx de compra** (no firma). Un **LLM con prompt acotado al dominio** (solo disponibilidad y compra de noches; rechaza cualquier otra petición) conversa con el cliente; al comprar, **el usuario firma la tx en MetaMask**. El MCP **nunca custodia claves ni firma** | 4 |

### 3.2 Fase 2 (fuera del piloto)

| ID | Requisito |
|------|-----------|
| RF-11 | Soporte para otras wallets además de MetaMask (WalletConnect) |
| RF-13 | Subastas para habitaciones premium (suite) |
| RF-16 | Notificaciones push al móvil del cliente |
| RF-20 | **Flujo de check-in/canje + identidad off-chain** (registro de viajeros / GDPR) |
| — | Dashboard detallado (gráficas, comparativas, export CSV) + indexador de eventos |
| — | Ocupación física real (requiere RF-20) |

---

## 4. Requisitos no funcionales

### 4.1 RNF base (refinados y cuantificados)

| ID | Requisito | Fase |
|------|-----------|------|
| RNF-01 | **Responsive / mobile-first**: breakpoints móvil <768 / tablet 768–1024 / desktop >1024; navegadores objetivo = últimas 2 versiones de Chrome, Safari, Firefox, Edge + Safari iOS y Chrome Android; áreas táctiles ≥44 px; sin scroll horizontal; legible sin zoom. (La valoración estética se traslada a una guía de diseño.) | MVP |
| RNF-02 | **Rendimiento** (ver métricas en RNF-11): listado renderizado < 1 s tras la respuesta RPC; paginación obligatoria; caché en cliente con TTL definido | MVP |
| RNF-03 | Coste de gas **despreciable pero no nulo**: la red Besu tiene `baseFee = 0` y min-gas-price **1000 wei** (spike); el comprador necesita un mínimo ínfimo de ETH para gas. Sin valor monetario | MVP |
| RNF-04 | Seguridad del sistema: se concreta en RNF-13 (claves/acceso), RNF-14 (contrato) y RNF-15 (pausa/fondos) | MVP (transversal) |
| RNF-05 | Minimización de datos: **ningún dato personal (PII) on-chain**. Campos públicos on-chain = wallet, precio, fecha, habitación, tipo. Se reconoce que la dirección de wallet puede ser un dato personal vinculable (Cons. 26 RGPD); el email del admin es un tratamiento off-chain (ver RNF-13) | MVP (transversal) |
| RNF-10 | **Royalty forzado on-chain en cada reventa** (ERC-2981 + transmisión solo vía contrato). Se **bloquean los `transferFrom` directos y los transfers a coste 0**: toda transmisión pasa por la función de venta con precio > 0. La **venta primaria no paga royalty**; toda **venta secundaria sí**. **No quedan vías de evasión on-chain** (decisión §11-A) | MVP |
| RNF-06 | i18n: español ahora; inglés/ruso después (arquitectura i18n-ready) | Fase 2 |
| RNF-07 | Escalabilidad para tráfico europeo de temporada | Fase 2 |
| RNF-08 | **Plazo**: "operativo para junio" se define como **Hito 1 entregable antes del 2026-06-30**; cada hito tiene fecha comprometida. Los Hitos 1–3 constituyen un MVP de valor aun si el Hito 4 (Chat IA) se desliza (ver §11, decisión B) | MVP |
| RNF-09 | **Coste**: precio **cerrado** solo para el **desarrollo del MVP** (4 hitos). **Sin mantenimiento gestionado ni cotizado**: la operación del piloto (nodo Besu, pinning IPFS, mini-worker, MCP/LLM) la asume Codecrypto/el cliente internamente (decisión §11-C) | MVP |

### 4.2 RNF añadidos por la auditoría

| ID | Requisito | Fase |
|------|-----------|------|
| RNF-11 | **Métricas de rendimiento verificables**: LCP < 2,5 s en P75 sobre 4G con catálogo de referencia (50 habitaciones × 90 noches); máximo de llamadas RPC por vista acotado; método de medida (Lighthouse / percentiles). Documentar el punto de quiebre estimado de la lectura RPC | MVP |
| RNF-12 | **Gestión de errores y resiliencia**: timeouts y reintentos del RPC con UI degradada; fallback de imágenes IPFS; **mini-worker idempotente "at-least-once" con checkpoint del último bloque** (no perder avisos de venta); mensajes claros ante tx revertida | MVP |
| RNF-13 | **Gestión de claves y control de acceso**: roles separados (AccessControl), **wallet dedicada no reutilizada**, backup seguro (keystore/seed cifrada offline), recuperación/transferencia (Ownable2Step; multisig en producción), backup de la clave que firma el faucet | MVP |
| RNF-14 | **Seguridad de smart contracts verificable**: OpenZeppelin (ERC-721/ERC-2981), patrón checks-effects-interactions + `nonReentrant` en compra y reventa, validación de inputs del minteo, análisis estático + revisión documentada. Auditoría externa antes de producción | MVP |
| RNF-15 | **Pausa de emergencia y retirada de fondos**: `Pausable` (congela compra/reventa) controlado por `PAUSER`; `withdraw` con control de acceso hacia la dirección `TREASURY`; política para ETH residual; prueba de pausa en el Hito 2 | MVP |
| RNF-16 | **Estrategia de pruebas**: unit del contrato, integración E2E (MetaMask + Anvil), pruebas del worker, casos negativos por hito; objetivo de cobertura para la lógica crítica on-chain | MVP |
| RNF-17 | **Observabilidad**: logging estructurado y health-checks (worker, faucet, IA, RPC); alerta si el worker deja de procesar o el RPC no responde; métricas operativas mínimas | MVP |
| RNF-18 | **Compatibilidad y flujo móvil web3**: matriz de navegadores; flujo de compra móvil con MetaMask (in-app browser y/o WalletConnect en Fase 2); comportamiento sin `window.ethereum` | MVP |
| RNF-19 | **Usabilidad y onboarding web3**: flujo guiado (instalar wallet, añadir la red custom, usar el faucet); estados de feedback de transacción; confirmación explícita antes de firmar en el chat IA | MVP |
| RNF-20 | **Accesibilidad** WCAG 2.1/2.2 AA (contraste, foco, teclado, alt text, formularios etiquetados): objetivo razonable en el piloto, **obligatorio en producción** (EAA) | MVP (parcial) |
| RNF-21 | **Mantenibilidad**: runbook de operación por componente; código modular | MVP |
| RNF-22 | **Validación en Besu real**: criterios de aceptación en la red de producción (tiempos de bloque, latencia RPC, estabilidad de suscripciones de eventos, gas efectivo) antes de la entrega final | MVP |

---

## 5. Decisiones de arquitectura y diseño

| # | Tema | Decisión |
|---|------|----------|
| 1 | Red blockchain | **Anvil** (dev) → **Besu** privada de Codecrypto (prod), EVM-compatible. Se descartan Ethereum/Polygon públicas en el piloto por ser pago real; ver §9 |
| 2 | Medio de pago | **ETH nativo** de la red Besu (`payable`, sin ERC-20), **sin valor monetario** |
| 3 | Unicidad NFT | **tokenId determinístico canónico**: `tokenId = nº_habitación · 10^8 + (YYYY·10^4 + MM·10^2 + DD)`. Ej.: hab. 102, noche 2026-06-15 → `10220260615`. Zona horaria de referencia `Europe/Madrid`; "noche" = **fecha de entrada**; colisión ⇒ revert |
| 4 | Identidad / GDPR | Off-chain y **solo en el check-in** (movido a Fase 2); cadena sin PII |
| 5 | Chat IA | **LLM + MCP server del contrato** (RF-12): herramientas read-only (disponibilidad, NFTs por wallet) + preparación de datos de tx; el usuario firma. Prompt **acotado al dominio**. **En el MVP** |
| 6 | Reventa / royalty | **ERC-2981 + transmisión solo vía contrato**; **`transferFrom` directos y transfers a coste 0 bloqueados** — toda transmisión exige precio > 0 y paga royalty (decisión §11-A) |
| 7 | Noches caducadas | **Expiración lógica + burn manual en lote** (regla en RF-17) |
| 8 | Subastas | **Fase 2** |
| 9 | Push al cliente | **Fase 2** (en MVP solo email al admin) |
| 10 | Idiomas | **Solo español**, arquitectura i18n-ready |
| 11 | Arquitectura de datos | **Lectura directa por RPC** (sin indexador); la cadena es la fuente de verdad. Acotada por la Decisión 23 |
| 12 | Aviso de venta | **Mini-worker** de notificaciones (evento → email), idempotente con checkpoint (RNF-12) |
| 13 | Metadata / imágenes | **IPFS con pinning**, con **redundancia** (≥2 pinners/gateways o pin en el nodo del operador) y verificación de CIDs |
| 14 | Dashboard | **Métricas mínimas** on-chain en MVP; detalle a Fase 2 |
| 15 | Obtención de ETH | **Faucet solo en entornos de desarrollo/pruebas** (Anvil/CI), pago simbólico: dispensa fija con **1 dispensación por wallet / 24 h**. **En producción no hay faucet**; la obtención de ETH en producción es la monetización de Fase 2 (§12.1) |
| 16 | Filtros + histórico | **Incluidos en el MVP** |
| 17 | % Royalty | **Configurable** (basis points, 0–2000, def. 1000) por `ROYALTY_ADMIN` |
| 18 | Estrategia de entrega | **Incremental en 4 hitos** demostrables |
| 19 | Presupuesto | **Precio cerrado** solo para el desarrollo del MVP (ver RNF-09 y §11-C) |
| 20 🆕 | Roles del contrato | **OpenZeppelin AccessControl** (MINTER, ROYALTY_ADMIN, PAUSER, TREASURY) + **Ownable2Step**; multisig en producción |
| 21 🆕 | Seguridad operacional | **Pausable** + `withdraw` controlado hacia `TREASURY` (RNF-15) |
| 22 🆕 | Inmutabilidad | Contrato **inmutable** en el piloto; cambios = redeploy + re-minteo; ABI versionada. Proxy de actualización se valora para producción |
| 23 🆕 | Acotación de la lectura RPC | El catálogo/filtros/histórico operan sobre una **ventana de fechas acotada** (p. ej. próximos 90 días) y/o un máximo de tokens por consulta, con paginación; sub-indexador/caché ligera solo si los umbrales de RNF-11 no se cumplen |
| 24 🆕 | Librerías | Contratos basados en **OpenZeppelin auditado** (ERC-721, ERC-2981, AccessControl, Pausable, ReentrancyGuard) |

---

## 6. Plan de entrega por hitos

> Los RNF transversales **RNF-04/RNF-13/RNF-14/RNF-15 (seguridad), RNF-01, RNF-03,
> RNF-05, RNF-12, RNF-16, RNF-17** aplican **desde el Hito 1** y se verifican de forma
> continua, no solo en el hito donde aparecen.

| Hito | Contenido | Requisitos |
|------|-----------|------------|
| **1 — Contrato base + compra primaria** | NFT ERC-721 (OZ), maestro, minteo validado, unicidad canónica, pago ETH interno, MetaMask, back-office + roles, faucet con límites, **aviso de venta (RF-09) ya operativo**. Infra: Anvil→Besu, pinning IPFS redundante. Seguridad: AccessControl, reentrancy, validación de inputs | RF-01, RF-03, RF-04, RF-05, RF-06, RF-09, RF-18a, RF-18b, RF-19, RF-21, RNF-13, RNF-14, RNF-16 |
| **2 — Mercado secundario** | Reventa vía contrato, royalty ERC-2981 configurable, expiración + burn en lote, **pausa de emergencia + withdraw**, prueba de reentrancy y de pausa | RF-07, RF-08, RF-17, RNF-10, RNF-15 |
| **3 — Capa pública + admin** | Catálogo público, filtros y buscador (ventana acotada), histórico público, dashboard mínimo on-chain, resiliencia y observabilidad | RF-02, RF-10, RF-14, RF-15, RNF-01, RNF-02, RNF-11, RNF-12, RNF-17, RNF-18, RNF-19 |
| **4 — Chat IA** | **MCP server del contrato** (disponibilidad, NFTs por wallet, preparación de datos de tx) + **LLM con prompt acotado** al dominio; el usuario firma en MetaMask. El MCP no custodia claves ni firma | RF-12 |
| **Cierre** | Validación en Besu real antes de la entrega final | RNF-22 |

> **Nota de plazo:** RF-09 (aviso de venta) se adelanta al Hito 1 porque hay ventas
> reales desde el primer hito. El Hito 4 (Chat IA) es el de mayor incertidumbre; los
> Hitos 1–3 son un MVP entregable de valor por sí mismos.

---

## 7. Infraestructura derivada

- Nodo **Besu** (producción) y **Anvil** (desarrollo); **MetaMask** con RPC custom.
- **Pinning IPFS redundante** para las 3 imágenes (una por tipo) y la metadata de cada
  NFT (`tokenURI`), con verificación periódica de CIDs y política de re-pin.
- **Faucet** de ETH **solo en entornos de desarrollo/pruebas** (Anvil/CI) con límites y alerta de saldo bajo; **no se despliega en producción**.
- **Mini-worker** listener de eventos → email, idempotente y con catch-up por bloque.
- **MCP server del contrato** (herramientas read-only: disponibilidad y NFTs por
  wallet; y preparación de los datos de la tx de compra, **sin firmar**) + **LLM con
  prompt acotado** al dominio, conectado al MCP. El MCP es de **solo lectura +
  preparación de tx**, nunca custodia claves ni firma.
- **Observabilidad**: logging y health-checks de worker, faucet, IA y RPC.

---

## 8. Seguridad y custodia de claves

- **Roles separados** (Decisión 20): ninguna cuenta concentra mint + royalty + pausa +
  burn + retirada de fondos.
- **Wallet dedicada**: el contrato y los roles **no reutilizan** la wallet personal del
  hotel creada por "el sobrino" (riesgo de compromiso/repudio identificado en el brief,
  línea 49). El acceso del sobrino a cualquier clave debe resolverse explícitamente.
- **Custodia y recuperación**: backup offline cifrado de las claves (incluida la del
  faucet); transferencia de ownership en 2 pasos; **multisig (Safe) en producción**.
- **Contrato**: `nonReentrant` en pagos, checks-effects-interactions, validación de
  inputs, `Pausable` y `withdraw` controlado (RNF-14, RNF-15).
- **Wallet dedicada nueva** exclusiva para el contrato, con **responsable de custodia
  designado**; se deja de usar la wallet del sobrino para esto (multisig en producción)
  — decisión confirmada (§11-D).
- **MCP/LLM del asistente (RF-12)**: el MCP server es **solo lectura + preparación de
  datos de tx** (nunca firma ni custodia claves); el prompt del LLM está **acotado al
  dominio** y endurecido contra *prompt injection* y peticiones fuera de alcance.

---

## 9. Trazabilidad con el brief

| Punto del brief | Tratamiento en este documento |
|-----------------|-------------------------------|
| "¿Cuánto sale el gas al mes?" (línea 44) | Gas ≈ 0 en red Besu privada; lo asume el operador (RNF-03) |
| "Ethereum… mejor Polygon… decidme vosotros" (línea 26) | Se decide **Besu privada** para el piloto: se descartan Ethereum/Polygon **públicas** porque implican dinero real y carga regulatoria; el piloto usa pago **simbólico** (Decisión 1, RF-03, RNF-03) |
| Royalty / "como en OpenSea" (líneas 20, 33) | **Forzado on-chain en cada cambio de propietario**; `transferFrom` directos y transfers a coste 0 bloqueados, sin vías de evasión (RF-08, RNF-10) |
| "como si fuera una reserva normal" (línea 19) | En el piloto el NFT **no es canjeable** por estancia real; el check-in es Fase 2 (RF-20, §1) |
| "Nada de GDPR ni datos personales" (línea 41) | Cadena sin PII (RNF-05); identidad solo en check-in (Fase 2). Se reconoce la wallet como posible dato vinculable |
| "El chat IA compra solo" (línea 28) | La IA prepara; el usuario firma (RF-12) |
| "La wallet del hotel ya la tengo… la uso para más cosas" (línea 49) | Identificado como **riesgo de seguridad**: se exige wallet dedicada (§8) |
| "Pagar con cripto" sin token con valor | Pago simbólico vía faucet (RF-21); on-ramp a euros = Fase 2 |

---

## 10. Cumplimiento legal y gates

- **Piloto no comercial**: las noches NFT no son canjeables por estancia ni se cobra
  dinero real. No se recogen datos identificativos de huéspedes (no aplica RD 933/2021
  en el piloto).
- **Gate bloqueante a producción comercial**: antes de aceptar dinero real o habilitar
  el canje como reserva, se requiere **revisión legal previa** (MiCA, PSD2/AML,
  fiscalidad, protección de datos y derechos del consumidor). No es un paso opcional.
- **Tratamiento off-chain mínimo**: el email del admin y las credenciales del mini-worker
  (SMTP) se gestionan con un secret manager, nunca en el repositorio (RNF-05, RNF-13).

---

## 11. Decisiones de negocio (confirmadas)

> Resueltas con el cliente. Ya están reflejadas en los requisitos y decisiones de arriba.

**A — Royalty: bloquear transfers a coste 0.** ✅
Toda transmisión de un NFT exige precio > 0 y paga royalty; se bloquean los
`transferFrom` directos y los transfers gratuitos. El royalty queda **forzado on-chain
sin vías de evasión** (RF-08, RNF-10, Decisión 6).

**B — Chat IA: MCP server + LLM acotado, en el MVP.** ✅
Se implementa como un **MCP server del contrato** (herramientas read-only de
disponibilidad y de NFTs por wallet, más preparación de los datos de la tx de compra) y
un **LLM con prompt acotado** al dominio que conversa con el cliente; el usuario firma la
tx en MetaMask. El MCP **no custodia claves ni firma** (RF-12, Decisión 5, §8).

**C — Mantenimiento: sin gestión cotizada.** ✅
El precio cerrado cubre solo el desarrollo del MVP. La operación del piloto la asume
Codecrypto/el cliente internamente; no se cotiza mantenimiento mensual (RNF-09).

**D — Custodia de claves: wallet dedicada nueva + responsable.** ✅
Se crea una wallet dedicada exclusiva para el contrato con responsable de custodia
designado; se deja de usar la wallet del sobrino para esto (multisig en producción)
(§8, RNF-13).

---

## 12. Preguntas abiertas para Fase 2 / producción real

1. **Monetización real y obtención de ETH en producción**: on-ramp euros → ETH interno
   (pasarela de pago, tipo de cambio, tesorería) para pasar de piloto a operación
   comercial. **Resuelve también cómo obtiene el cliente el ETH en producción**, dado que
   el faucet solo existe en entornos de pruebas (RF-21).
2. **Custodia de datos de check-in** (RF-20): responsable de tratamiento, almacenamiento
   cifrado, retención y conexión con el registro oficial de viajeros (SES.Hospedajes).
3. **SLA de la red Besu** (Codecrypto): uptime del nodo, RPC y financiación del gas en
   producción.
4. **Indexador de eventos** para el dashboard detallado y consultas a gran escala.
5. **Auditoría externa** del smart contract antes de operar con valor real.

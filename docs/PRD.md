# PRD — Hotel Marina del Sol: Plataforma NFT de Reservas

> **Versión**: 1.1.0  
> **Estado**: Aprobado tras Auditoría y Refinamiento Técnico  
> **Fecha**: 2026-09-07  
> **Cliente**: Carlos Martínez — Hotel Marina del Sol, Alicante  
> **Proyecto**: hotel-room-mcp-trazable  

---

## 1. Visión del Producto

Plataforma web de venta de noches de hotel como NFTs en la blockchain Polygon. Cada noche de cada habitación es un token único (ERC-721). Los compradores adquieren el derecho de hospedaje directamente desde la web del hotel, eliminando intermediarios (Booking.com). El hotel cobra royalties automáticos en cada reventa en el mercado secundario propio.

### Objetivo de negocio
- Reducir ocupación vacía en temporada baja mediante venta anticipada tokenizada.
- Generar ingreso pasivo por royalties en el mercado secundario (5% en simples/dobles y 10% en suite).
- Ofrecer liquidez al comprador: si no puede asistir, puede revender su noche en el marketplace propio sin perder su inversión.

---

## 2. Contexto del Proyecto

| Campo | Valor |
|-------|-------|
| Hotel | Marina del Sol — Alicante, España |
| Habitaciones | 50 (101–130 planta baja · 201–220 primera planta) |
| Tipos | Simple · Doble · Suite |
| Audiencia | Compradores en España + Europa (ES / EN / RU) |
| Red blockchain producción | Polygon PoS (mainnet, chainId 137) |
| Red blockchain testnet | Polygon Amoy (testnet oficial, chainId 80002) |
| Red blockchain desarrollo | Anvil local (Hardhat / Foundry) con wallet 0 como deployer inicial |

---

## 3. Actores del Sistema

| Actor | Tipo | Descripción |
|-------|------|-------------|
| **Propietario (Carlos)** | Interno admin | Gestiona back-office con MFA: da de alta inventario, fija precios, consulta dashboard financiero. |
| **Comprador primario** | Externo | Adquiere el NFT desde el catálogo público pagando con cripto (MetaMask o WalletConnect). Compra anónima. |
| **Comprador secundario** | Externo | Adquiere el NFT en reventa dentro del marketplace propio del hotel. |
| **Recepcionista** | Interno operativo | Escanea el QR del huésped y valida el `checkInSecret` en tiempo real, marcando la estancia como consumida (`CHECKED_IN`). |
| **Custodios Multisig** | Gobernanza | Comité de 3 firmantes (Carlos + 2 designados) con Gnosis Safe 2-of-3 (`DEFAULT_ADMIN_ROLE`). Controlan fondos y contratos. |
| **Bot Burner (Servicio)** | Sistema | Hot-wallet de servicio con rol `BURNER_ROLE` que ejecuta la quema automática desatendida. |
| **Backend listener** | Sistema | Proceso que escucha eventos on-chain, sincroniza la base de datos y encola notificaciones. |

---

## 4. Requisitos Funcionales — MVP

### RF-01 · Catálogo Público de NFTs
- **Actor**: Comprador primario / secundario
- **Descripción**: Página pública que muestra todas las noches disponibles con foto, tipo de habitación, número de habitación, fecha y precio en MATIC/POL + equivalente en EUR (calculado desde caché backend).
- **Criterios de aceptación**:
  - Se muestran solo NFTs con estado `AVAILABLE` (o con oferta activa en reventa).
  - Cada tarjeta muestra: foto, número de habitación, tipo, fecha, precio en cripto y EUR.
  - Disponible en ES / EN / RU.
  - LCP < 2.5s en conexión 4G móvil.
  - Metadatos servidos inicialmente desde servidor centralizado del hotel.

---

### RF-02 · Filtros y Buscador
- **Actor**: Comprador primario / secundario
- **Descripción**: Filtros por rango de fecha, rango de precio, tipo de habitación y número de habitación.
- **Criterios de aceptación**:
  - Filtros combinables entre sí que responden en < 500ms gracias a índices optimizados en BD.
  - Actualización reactiva sin recargar página.
  - Estado vacío amigable si no hay disponibilidad.

---

### RF-03 · Back-office: Gestión de Inventario NFT
- **Actor**: Propietario (Carlos)
- **Descripción**: Panel privado para mintear noches de hotel como NFTs: selección de habitación, fecha, precio y tipo. Permite alta masiva de fechas.
- **Criterios de aceptación**:
  - Autenticación: email + contraseña con MFA obligatorio (TOTP / email OTP).
  - Gestión de sesión segura: access token (15 min) y refresh token con rotación (RTR) almacenado como hash SHA-256 en BD.
  - Re-confirmación de MFA requerida para acciones de alto impacto (minteo masivo `mint-batch`).
  - Validación de negocio: rechazo de fechas pasadas y duplicados (misma habitación + misma fecha).

---

### RF-04 · Compra de NFT
- **Actor**: Comprador primario
- **Descripción**: El usuario conecta su wallet (MetaMask o WalletConnect v2), selecciona un NFT y ejecuta la compra en MATIC/POL. El comprador asume el gas de la red.
- **Criterios de aceptación**:
  - Proceso 100% anónimo: no se exige registro, email ni datos personales.
  - Verificación on-chain de disponibilidad antes de procesar el pago.
  - Al confirmarse el bloque on-chain, la pantalla muestra de inmediato la confirmación de éxito con el QR de check-in descargable.

---

### RF-05 · Notificación por Email al Propietario
- **Actor**: Sistema → Propietario
- **Descripción**: Ante cada venta primaria o reventa, el sistema notifica a Carlos los detalles de la transacción.
- **Criterios de aceptación**:
  - Notificación procesada mediante cola asíncrona (BullMQ) y despachada en < 60 segundos tras el evento `NFTSold`.
  - Contenido: habitación, tipo, fecha de estancia, precio en cripto + EUR, tipo de operación (primaria/reventa), wallet compradora truncada.
  - 3 reintentos automáticos con backoff exponencial si el servicio de email (SendGrid/Resend) reporta error.

---

### RF-06 · Reventa en Marketplace Propio con Royalties
- **Actor**: Comprador secundario + Smart contract
- **Descripción**: Un portador de NFT puede listar su token para reventa fijando libremente su precio en el marketplace del hotel.
- **Criterios de aceptación**:
  - Paso previo documentado: aprobación ERC-721 (`approve` o `setApprovalForAll`) antes de invocar `listForSale`.
  - Royalties inmutables: **5%** para habitaciones simples y dobles · **10%** para suite, transferidos automáticamente a la multisig del hotel.
  - Reventa bloqueada si la fecha de check-in ya ha pasado.
  - Reventas limitadas exclusivamente al marketplace propio para garantizar el cobro de royalties.

---

### RF-07 · Generación y Entrega del QR de Check-in
- **Actor**: Sistema → Comprador
- **Descripción**: Tras completarse la compra, el sistema genera un código QR criptográfico único que incorpora un secreto off-chain de un solo uso (`checkInSecret`).
- **Criterios de aceptación**:
  - Entrega directa en pantalla: modal con botón de descarga en formato PNG, PDF o pase digital para Apple/Google Wallet.
  - Opción adicional: campo efímero "Enviar resguardo a este email" (el correo se usa únicamente para el envío del resguardo y jamás se guarda en la base de datos).
  - El QR incorpora `tokenId` + `checkInSecret` firmado.
  - Validez del QR: activo desde la compra hasta las **23:59 horas del día de check-out** oficial.

---

### RF-08 · Validación de QR en Recepción
- **Actor**: Recepcionista
- **Descripción**: El recepcionista escanea el QR del huésped con la app/web interna del hotel para validar el derecho de estancia.
- **Criterios de aceptación**:
  - Validación en < 3 segundos: verifica titularidad on-chain y valida el `checkInSecret` contra la BD off-chain.
  - Al validar con éxito, el sistema marca el token con estado `CHECKED_IN`, impidiendo que el mismo QR o un duplicado clonado sea usado nuevamente.
  - No requiere que el huésped tenga wallet activa ni móvil con batería en recepción si lleva el QR impreso o en pase digital.
  - Permite late check-in de madrugada sin rechazos erróneos de fecha.

---

### RF-09 · Dashboard del Propietario
- **Actor**: Propietario (Carlos)
- **Descripción**: Panel analítico con 7 métricas clave del negocio:
  1. Total ventas primarias (cripto + EUR equivalente).
  2. Total ingresos por royalties de reventa (cripto + EUR).
  3. Inventario: NFTs vendidos / disponibles / quemados.
  4. Gráfica de ventas por mes (barras).
  5. Gráfica de ventas por tipo de habitación.
  6. Ranking de habitaciones más revendidas.
  7. Listado de últimas transacciones en tiempo real.
- **Criterios de aceptación**:
  - Exclusión estricta de eventos `MINT` en los totales de ingresos por ventas.
  - Datos sincronizados con < 5 minutos de latencia respecto a la blockchain.
  - Exportación de tablas a formato CSV con cabeceras formalizadas.

---

### RF-10 · Histórico de Ventas Público
- **Actor**: Visitante
- **Descripción**: Registro público y transparente de transacciones históricas en la web del hotel.
- **Criterios de aceptación**:
  - Muestra exclusivamente ventas primarias (`PRIMARY_SALE`) y reventas (`RESALE`), ocultando eventos internos de minteo o quema.
  - Datos mostrados: tipo de operación, habitación, tipo, fecha de estancia, precio (cripto + EUR), fecha de transacción y wallet truncada (0x1234...ABCD).
  - Paginación de 20 elementos por página ordenada cronológicamente de forma descendente.

---

### RF-11 · Quema Automática de NFTs No Vendidos (Burn)
- **Actor**: Bot Burner (Servicio)
- **Descripción**: Proceso que quema de forma irreversible los NFTs que no lograron venderse para evitar reservas fantasma.
- **Criterios de aceptación**:
  - El burn se ejecuta a las **12:00 PM del día siguiente** a la fecha de la noche (coincidiendo con el check-out oficial del hotel), garantizando que las habitaciones están disponibles para venta de última hora hasta el final.
  - Solo se pueden quemar tokens cuyo owner actual sea el propio contrato/hotel (nunca un token adquirido por un usuario).
  - Soporte de ejecución por lotes `burnBatch(uint256[] tokenIds)` para optimizar el gasto de gas.
  - El token quemado pasa al estado `BURNED` en BD y se refleja en el dashboard.

---

### RF-12 · Notificaciones Push Web (Opt-in)
- **Actor**: Sistema → Comprador suscrito
- **Descripción**: Alertas web automáticas a navegadores suscritos cuando se pone a la venta un nuevo lote de habitaciones.
- **Criterios de aceptación**:
  - Consentimiento explícito previo (LSSI-CE art. 21) mediante Web Push API.
  - Posibilidad de revocación (opt-out) en cualquier momento.
  - Emisión genérica a todos los suscritos sin perfilado invasivo ni almacenamiento de datos personales.

---

## 5. Requisitos Funcionales — Fase 2 (Post-MVP)

- **RF-F2-01 · Chat IA Conversacional**: Asistente con lenguaje natural que guía al huésped y presenta el botón de confirmación de compra manual.
- **RF-F2-02 · Sistema de Subastas**: Mecanismo de subasta inglesa para la suite presidencial en marketplace propio.
- **RF-F2-03 · Multi-wallet y Migración IPFS**: Soporte ampliado de wallets y descentralización de metadatos en IPFS/Arweave.

---

## 6. Requisitos No Funcionales (ISO 25010)

| ID | Categoría | Requisito | Métrica Objetivo |
|----|-----------|-----------|------------------|
| RNF-01 | Rendimiento | Carga del catálogo público | LCP < 2.5s en 4G móvil |
| RNF-02 | Rendimiento | Respuesta de filtros en catálogo | < 500ms mediante índices en BD |
| RNF-03 | Rendimiento | Validación de QR en recepción | < 3s de respuesta |
| RNF-04 | Disponibilidad | Uptime y Resiliencia | Uptime ≥ 99.5% mensual (RPO < 1h, RTO < 4h) |
| RNF-05 | Escalabilidad | Concurrencia de usuarios | ≥ 200 usuarios simultáneos sin degradación (validado con k6) |
| RNF-06 | Seguridad | Autenticación back-office | MFA obligatorio + Refresh Token Rotation con hash SHA-256 |
| RNF-07 | Seguridad | Smart contracts | Tests unitarios + integración + fuzzing en Foundry |
| RNF-08 | Resiliencia | Conexión blockchain | Multi-RPC (Alchemy + Infura) con failover y reconciliación de bloques |
| RNF-09 | Resiliencia | Precios EUR de CoinGecko | Worker en backend con caché cada 5 min y failover a Binance/CryptoCompare |
| RNF-10 | Observabilidad | Monitorización de listener | Heartbeat WebSocket cada 30s y alertas por desconexión a canal de operaciones |
| RNF-11 | Compliance | Privacidad RGPD | Compra 100% anónima sin recopilación forzada de datos personales online |
| RNF-12 | Compliance | Registro de viajeros | Cumplimiento del RD 933/2021 mediante registro presencial tradicional en el hotel |
| RNF-13 | UX / i18n | Multidioma | Soporte completo para Español (ES), Inglés (EN) y Ruso (RU) |
| RNF-14 | UX | Diseño responsive | Mobile-first certificado en iOS 15+ y Android 11+ |
| RNF-15 | Accesibilidad | Estándar WCAG | WCAG 2.1 nivel AA |
| RNF-16 | Infraestructura | CDN | Distribución de estáticos y caché vía Cloudflare |

---

## 7. Stack Tecnológico

### Blockchain
- **Redes**: Polygon PoS (Mainnet, chainId 137) · Polygon Amoy (Testnet, chainId 80002) · Anvil local (Dev).
- **Estándar de Tokens**: ERC-721 + EIP-2981 (Royalties).
- **Control de Acceso**: OpenZeppelin `AccessControl` (`DEFAULT_ADMIN_ROLE` para Gnosis Safe, `BURNER_ROLE` para bot).
- **Gobernanza de Fondos**: Multisig Gnosis Safe 2-of-3.
- **Conectividad**: MetaMask + WalletConnect v2.

### Backend y Base de Datos
- **Entorno**: Abierto hasta el inicio de implementación de APIs (opciones principales: Node.js/TypeScript o Python/FastAPI con middlewares de seguridad equivalentes a Helmet).
- **Base de Datos Off-chain**: PostgreSQL / MongoDB con esquemas indexados para consultas concurrentes.
- **Mensajería Asíncrona**: Cola BullMQ / Celery para despacho de correos y tareas programadas.
- **Push**: Web Push API + FCM.

---

## 8. Modelo de Negocio y Reglas Económicas

| Concepto | Regla Aplicable |
|----------|-----------------|
| Venta Primaria | Precio íntegro fijado por Carlos en el back-office (MATIC/POL). |
| Royalty Reventa Simples y Dobles | **5%** del valor de reventa retenido on-chain para la multisig del hotel. |
| Royalty Reventa Suite | **10%** del valor de reventa retenido on-chain para la multisig del hotel. |
| Pago del Gas | Asumido íntegramente por el comprador tanto en compra primaria como en reventa. |
| Exclusividad de Reventa | Obligatoriamente canalizada a través del marketplace propio del hotel. |
| Horario de Burn | NFTs no vendidos se queman a las **12:00 PM del día posterior** a la noche ofertada. |

---

## 9. Restricciones y Roadmap Legal

- **Anonimato en Compra**: La compra de NFTs no solicitará DNI, nombre ni email obligatorio.
- **Identificación Legal de Huéspedes**: En cumplimiento del **RD 933/2021**, los datos identificativos del viajero se registrarán exclusivamente de manera presencial en el mostrador del hotel durante el check-in.
- **Hito H-COMPLIANCE**: Previo al despliegue en Polygon Mainnet, se formalizará un dictamen con un asesor legal/fiscal especializado para ratificar el encuadre bajo el reglamento europeo **MiCA** (clasificación como utility token / bono de servicio) y las obligaciones fiscales sobre criptoactivos (IS / Modelo 172).

---

## 10. Criterios de Aceptación Globales

1. Carlos puede crear inventario masivo desde el back-office con MFA y el catálogo público se actualiza en < 5 segundos.
2. Un comprador adquiere una noche con su wallet en < 3 confirmaciones de bloque y obtiene en pantalla su QR de check-in con `checkInSecret`.
3. Recepción valida el QR en < 3 segundos, cambiando su estado a `CHECKED_IN` e imposibilitando accesos duplicados.
4. Carlos recibe un email con los detalles de cada venta en < 60 segundos tras el evento on-chain.
5. Los NFTs no vendidos son quemados automáticamente por el bot a las 12:00 PM del día posterior.
6. El dashboard financiero muestra ventas y royalties en tiempo real excluyendo eventos de minteo interno.
7. La tienda pública resiste 200 usuarios concurrentes sin degradar la respuesta por debajo de 500ms.
8. La plataforma es plenamente operativa en Español, Inglés y Ruso.
9. El contrato protege el 100% de los royalties mediante operador exclusivo en el marketplace.
10. La multisig Gnosis Safe 2-of-3 custodia la titularidad del contrato y la recepción de fondos sin exponer claves en servidores.

---
*PRD v1.1.0 — Aprobado formalmente para diseño técnico e implementación.*

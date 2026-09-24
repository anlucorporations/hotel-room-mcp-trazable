# 01 · Arquitectura del sistema

> **Fuente**: [`docs/SRS.md`](../../../docs/SRS.md) §2 (arquitectura), §3 (contrato), §4 (interfaces),
> [`docs/adr/README.md`](../../../docs/adr/README.md) (decisiones normativas).
> **Red canónica**: Anvil local `http://127.0.0.1:8545`, `chainId 81234` (ADR-01, ADR-17).

## 1. Vista de componentes

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ apps/web — Next.js (App Router, RSC)                                    :3000│
│  /            catálogo primario        /reventa   mercado secundario         │
│  /mis-noches  noches propias + claim   /historico histórico público          │
│  /recepcion   mostrador                /asistente chat → MCP                 │
│  /admin/*     7 pantallas de back-office                                     │
│  25 rutas de API bajo /api/**   ·   /health/live  ·  /health/ready           │
└───────┬────────────────────────────────────────────────┬─────────────────────┘
        │ HTTPS/REST (fetch)                             │ RPC JSON (viem/wagmi)
┌───────▼──────────────────────────┐        ┌────────────▼─────────────────────┐
│ apps/worker — Node + tsx   :8787 │        │ packages/contracts                │
│  listener + heartbeat            │◄──────►│  HotelNights.sol (único)          │
│  agregados SQL y /history        │  RPC   │  ERC-721 + AccessControl +        │
│  consumidor de la cola de correo │        │  Pausable + EIP-2981              │
│  planificador de quema           │        │  RoomMaster · DateLib · Faucet    │
│  HTTP /health /aggregates /history│       └───────────────────────────────────┘
└───────┬──────────────────────────┘                        ▲
        │ PostgreSQL (pool) · Redis (cola, locks, blocklist)│ RPC
┌───────▼──────────┐  ┌────────────────┐  ┌─────────────────┴───────────────┐
│ PostgreSQL 18    │  │ Redis ≥ 5 (7.x)│  │ apps/mcp — read-only     :8788  │
│ 5432 · 13 tablas │  │ 6379           │  │ 4 herramientas + buildPurchaseTx│
└──────────────────┘  └────────────────┘  └─────────────────────────────────┘
                    apps/monitor — /health + viveza de cadena + gas (SMTP propio)
```

| Componente | Responsabilidad | No hace |
|---|---|---|
| `apps/web` | Interfaz pública y back-office, rutas de API, lectura de cadena desde el navegador | No indexa eventos ni quema |
| `apps/worker` | Escucha eventos, consolida el índice y los agregados, consume la cola de correo, ejecuta la quema programada | No firma transacciones de usuario |
| `apps/mcp` | Cuatro herramientas **read-only** y preparación de la compra sin firma | **Nunca firma ni custodia claves** (ADR-11) |
| `apps/monitor` | Sondea `/health`, vigila viveza de cadena y saldo de gas | No toca la base de negocio |
| `packages/contracts` | Contrato canónico y script de despliegue | No guarda estado off-chain |
| PostgreSQL | Única persistencia: índice, operadores, cola de correo, agregados (ADR-03) | No decide verdad: la cadena decide |
| Redis | Cola BullMQ, locks distribuidos y blocklist de JWT | No es fuente de verdad duradera |

**Los cuatro servicios propios**: web **3000**, worker **8787**, MCP **8788**, monitor (sin puerto
propio; es un sondeador). Infraestructura: PostgreSQL **5432**, Redis **6379**, Anvil **8545**.

## 2. Superficie del contrato `HotelNights`

| Grupo | Funciones | Rol exigido |
|---|---|---|
| Inventario | `mint(roomNumber, dateYYYYMMDD, priceWei)` | `MINTER_ROLE` + `whenNotPaused` |
| Venta primaria | `buy(tokenId)` *payable* | cualquiera (una sola vez por noche, `soldOnce`) |
| Reventa | `list`, `unlist`, `buyResale` *payable* | titular, respetando `minListingPrice` |
| Cobros | `claim()`, `pendingWithdrawals(address)` | beneficiario acreditado (ADR-15, *pull over push*) |
| Check-in | `markCheckedIn`, `isCheckedIn` | `RECEPTION_ROLE` + `whenNotPaused` |
| Quema | `burnExpired(tokenIds)`, `burnBatchMax()` | `BURNER_ROLE` |
| Royalty | `royaltyInfo(tokenId, salePrice)` (EIP-2981) | consulta — **inmutable**, derivado del tipo (ADR-18) |
| Gobernanza | `setMinListingPrice`, `pause`, `unpause`, `withdrawFunds` | `DEFAULT_ADMIN_ROLE`, `PAUSER_ROLE`, `TREASURER_ROLE` |
| Lectura | `ownerOf`, `roomOf`, `soldOnce`, `listingOf`, `isExpired` | cualquiera |

Royalty: **5 %** en `simple` y `doble`, **10 %** en `suite`; fijado en el mint y no modificable.
Suelo de listado: `minListingPrice` (0,01 ETH en local) y **nunca 0** (ADR-19).
Transferencias directas bloqueadas con `DirectTransferDisabled`: el token solo se mueve por `buy`,
`buyResale` y quema (ADR-07).

## 3. Flujo de una compra (CU-05, ADR-11)

1. El catálogo `/` sirve **solo venta primaria**; `/reventa` sirve el mercado secundario y descarta
   lo que el contrato rechazaría (noche consumida, listado inactivo, fecha fuera de ventana).
2. El usuario pulsa comprar. `usePurchaseReview` **construye** el objeto `PurchaseTxData`
   (`to`, `data`, `value`, `chainId`).
3. `verifiedTxRequest` es el **punto único de firma**: verifica la forma del calldata, que `value`
   sea un importe válido y que `to` sea **el contrato canónico**; si el destino es otro, **falla en
   cerrado**. Esto importa porque `buy(uint256)` del `HotelMarketplace` legacy (retirado del árbol en
   M9) **compartía selector** con el canónico: el calldata era byte a byte idéntico y lo único que
   distinguía ambas generaciones era la dirección. El guardián sigue prohibiendo reintroducir un
   segundo camino de firma o una dirección literal.
4. La interfaz muestra la revisión (destino, importe, calldata) y el usuario firma **ese mismo
   objeto**, byte a byte, desde su wallet.
5. La cadena emite `Sale` (y `RoyaltyPaid` en la reventa); la tesorería y el vendedor quedan
   acreditados para `claim()`.
6. El listener del worker consolida el evento en el índice (`nfts`, `listings`, `sale_events`) y el
   procesador actualiza los agregados; el aviso de venta se **encola** (ADR-21) y el push se emite
   *best-effort*.

**Deuda declarada**: `unlist` es la única escritura de reventa que no pasa por objeto verificado (no
tiene importe); un fallo **parcial** de RPC en `fetchResaleMarket` puede mostrar una lista incompleta
sin avisar (el fallo total sí degrada la vista).

## 4. Flujo de un check-in (CU-08, ADR-05)

1. El titular pide su resguardo: `GET /api/qr/[tokenId]` (o su envío por correo, o el pase de
   wallet). Los **tres** endpoints exigen la **firma EIP-712 del titular** contra `ownerOf` on-chain;
   sin ella → **401**. El `nonce` es de un solo uso (replay → 401) y la autorización vale **5 min**.
2. Se emite un JWS con un `jti` propio (un solo uso) y el `chainId`/`verifyingContract` de la cadena
   activa.
3. En el mostrador, el operador con `RECEPTION_ROLE` escanea el resguardo y llama a
   `POST /api/reception/checkin`.
4. El servicio **consume el `jti` en Redis** (`SET NX EX`): el mismo resguardo dos veces → **409
   `TICKET_YA_USADO`**.
5. Toma el **cerrojo por noche** (`RedisCheckInLock`, TTL 15 s): si otro puesto está anclando → **409
   `CHECKIN_EN_PROCESO`** y el resguardo no se gasta.
6. Relee `ownerOf` on-chain y exige que coincida con el huésped del JWS (RPC caído →
   `TITULARIDAD_NO_VERIFICABLE` 503; token quemado → `TOKEN_QUEMADO`).
7. **Simula** `markCheckedIn(tokenId)` antes de difundir: una transacción firmada se difunde aunque
   vaya a revertir, así que la simulación es lo que detecta `AlreadyCheckedIn` y `NightNotSold`.
8. Firma y difunde la **hot-wallet de recepción** (singleton por proceso con cola de nonces) y
   devuelve el hash del ancla; el listener consolida `CheckedIn`.
9. La contingencia sin dispositivo (`/api/reception/checkin/contingency`) ancla igual, exige prueba de
   posesión estricta (dirección, hash de transacción o código `MDS-…`) y **motivo de vocabulario
   cerrado**; nunca admite PII (ADR-20, ADR-24).

**Deuda declarada**: falta `nfts.check_in_tx_hash` para auditar qué transacción consumió cada noche
(el hash se devuelve en la respuesta y la UI lo muestra); ventana residual de 15 s del cerrojo.

## 5. Flujo de la quema programada (CU-13, ADR-21)

1. El planificador vive en el worker y se despierta a la hora local del hotel
   (`BURN_HOUR_LOCAL=12`, `BURN_TIMEZONE=Europe/Madrid`). En local, `BURN_INTERVAL_MS` fuerza el ciclo
   cada N ms para demos.
2. Lee la **hora de la cadena** (cabecera del último bloque); si el RPC falla, degrada al reloj de la
   máquina y lo registra.
3. Toma un cerrojo **por día natural** (una sola instancia quema aunque haya varias réplicas) y lo
   libera si el ciclo no se completó, para poder reintentar tras recargar gas.
4. Consulta las noches caducadas y no vendidas (comparación `<`, igual que el contrato) y **simula**
   `burnExpired` por lotes de `burnBatchMax()`, con reintento **token a token** si una noche no es
   quemable.
5. Espera el recibo y marca en la base **solo** los tokens que declaran los eventos `Burn`; deja
   `skippedTokens` en el log y en el resultado del ciclo.
6. Avisa a DevOps si el saldo de la hot-wallet cae del umbral (`BURNER_MIN_BALANCE_NATIVE`) y encola
   el aviso `BURN_EXECUTED` por la **cola única** de correo.

**Deuda declarada**: la quema **no alerta** cuando descarta tokens no quemables, solo lo registra; el
monitor mantiene su **propio canal SMTP** a propósito (una alerta de operación no debe depender de la
infraestructura que vigila).

## 6. Decisiones normativas (registro de ADR)

Toda decisión nueva entra en [`docs/adr/`](../../../docs/adr/README.md) **antes** de tocar el código. Las 26
vigentes:

| ADR | Qué fija |
|---|---|
| [ADR-01](../../../docs/adr/ADR-01-red-y-contrato-canonicos.md) | Red canónica local (`chainId 81234`) y contrato único |
| [ADR-02](../../../docs/adr/ADR-02-contrato-unico-hotel-nights.md) | `HotelNights` es el único contrato; `HotelNFT`+`HotelMarketplace` fuera del runtime (retirados del árbol en M9) |
| [ADR-03](../../../docs/adr/ADR-03-postgresql-unica-persistencia.md) | PostgreSQL como única persistencia |
| [ADR-04](../../../docs/adr/ADR-04-autenticacion-password-totp-jwt.md) | Contraseña + TOTP obligatorio + JWT 15 min con rotación y blocklist |
| [ADR-05](../../../docs/adr/ADR-05-check-in-on-chain.md) | Check-in anclado on-chain y resguardo de un solo uso |
| [ADR-06](../../../docs/adr/ADR-06-bootstrap-roles-y-revocacion.md) | Bootstrap de roles en el despliegue y revocación del desplegador |
| [ADR-07](../../../docs/adr/ADR-07-guardas-transferencia-y-cei.md) | Guardas de transferencia (solo mercado propio) y CEI |
| [ADR-08](../../../docs/adr/ADR-08-fechas-utc-y-calendario.md) | Fechas `AAAAMMDD` en UTC; zona del hotel solo off-chain |
| [ADR-09](../../../docs/adr/ADR-09-bloque-despliegue-fuente-unica.md) | El bloque de despliegue es el inicio del escaneo |
| [ADR-10](../../../docs/adr/ADR-10-confirmaciones-y-getlogs.md) | Confirmaciones y rango de `getLogs` |
| [ADR-11](../../../docs/adr/ADR-11-nunca-firmar-tx-no-verificada.md) | Nunca se firma una transacción no verificada |
| [ADR-12](../../../docs/adr/ADR-12-metadatos-ipfs-y-cdn.md) | Metadatos en IPFS con gateway/CDN propio |
| [ADR-13](../../../docs/adr/ADR-13-faucet-de-pruebas.md) | Faucet solo en red local y con `DEPLOY_FAUCET=true` |
| [ADR-14](../../../docs/adr/ADR-14-cotizacion-eur.md) | Cotización EUR desde la cadena con respaldo declarado |
| [ADR-15](../../../docs/adr/ADR-15-pull-over-push.md) | Cobros por *pull* (`claim`) |
| [ADR-16](../../../docs/adr/ADR-16-venta-primaria-unica.md) | Una sola venta primaria por noche (`soldOnce`) |
| [ADR-17](../../../docs/adr/ADR-17-espejo-besu.md) | La red local es espejo de la Besu de laboratorio |
| [ADR-18](../../../docs/adr/ADR-18-royalty-por-tipo-inmutable.md) | Royalty por tipo, fijado en el mint e inmutable |
| [ADR-19](../../../docs/adr/ADR-19-suelo-de-precio-de-listado.md) | Suelo de precio de listado, gobernable y nunca nulo |
| [ADR-20](../../../docs/adr/ADR-20-registro-de-viajeros-fuera.md) | El registro de viajeros (RD 933/2021) queda fuera de la plataforma |
| [ADR-21](../../../docs/adr/ADR-21-una-cola-y-un-planificador.md) | Una cola única de correo y un planificador en el worker |
| [ADR-22](../../../docs/adr/ADR-22-contrato-inmutable-redeploy.md) | El contrato no se actualiza: un cambio es un redespliegue |
| [ADR-23](../../../docs/adr/ADR-23-verificacion-reproducible-y-gates.md) | Verificación reproducible y gates de CI bloqueantes |
| [ADR-24](../../../docs/adr/ADR-24-privacidad-y-minimizacion-pii.md) | Minimización de PII y textos legales conformes |
| [ADR-25](../../../docs/adr/ADR-25-dashboard-fuente-unica.md) | El dashboard lee una fuente única (agregados del worker) |
| [ADR-26](../../../docs/adr/ADR-26-resiliencia-y-observabilidad.md) | Resiliencia y observabilidad sin Sentry ni failover multi-RPC |

## 7. Resiliencia (resumen operativo)

| Asunto | Comportamiento real |
|---|---|
| Fallo de RPC | Degradación declarada; la titularidad no verificable responde **503**, no 401 |
| Silencio de la cadena | Una alerta por episodio, rearmada al volver un bloque |
| Checkpoint adelantado | Rebobina al bloque de despliegue y **degrada** la salud (`lag` negativo) |
| Correo caído | La cola persiste el trabajo; la reconciliación recupera lo atascado; al agotar intentos avisa a DevOps |
| Redis caído | El logout **propaga** el fallo en vez de simular éxito |
| Secreto ausente | `requireSecret` lanza `MissingSecretError` y el proceso **no arranca** |
| Errores en producción | Logging estructurado JSON; Sentry **no** se usa (ADR-26) |

---

*Siguiente: [Mapa del monorepo](01-monorepo.md) · Detalle de datos: [`../../diccionario_datos.md`](../../diccionario_datos.md)*

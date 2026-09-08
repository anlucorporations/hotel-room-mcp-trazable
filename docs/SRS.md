# SRS — Especificación de Requisitos de Software
## Hotel Marina del Sol: Plataforma NFT de Reservas

> **Versión**: 1.2.0  
> **Estado**: Aprobado — Post-Auditoría Plan y Backlog (17 hallazgos resueltos)  
> **Fecha**: 2026-09-08  
> **Referencia**: PRD v1.1.0  

---

## 1. Introducción

### 1.1 Propósito
Este documento define formalmente la arquitectura técnica, interfaces de contratos inteligentes, especificación de APIs, modelo de base de datos off-chain y criterios de resiliencia para el desarrollo de la plataforma NFT del Hotel Marina del Sol.

### 1.2 Alcance del MVP
El sistema abarca el catálogo público reactivo, filtrado optimizado, compra primaria anónima con MetaMask / WalletConnect v2, marketplace de reventa propio con enforcing inmutable de royalties (5% y 10%), entrega de resguardo QR criptográfico con secreto off-chain cifrado (AES-256-GCM), validación segura en recepción (RECEPTION_ROLE), panel de analítica para el propietario con MFA y JWT blocklist, sincronizador de eventos on-chain con cola asíncrona de correos (BullMQ), quema programada desatendida por lotes (con Redis Redlock) e histórico público de ventas.

### 1.3 Definiciones Técnicas

| Término | Definición Técnica |
|---------|---------------------|
| **NFT (ERC-721)** | Token no fungible que representa el derecho de ocupación de una habitación específica en una fecha determinada. |
| **Token ID** | Identificador único uint256 generado on-chain: `keccak256(roomNumber, checkInDate)`. |
| **EIP-2981** | Estándar Ethereum para declaración de royalties on-chain en mercados secundarios. |
| **checkInSecret** | Token criptográfico aleatorio de 32 bytes generado off-chain, almacenado cifrado con AES-256-GCM, para el check-in seguro de un solo uso. |
| **AccessControl** | Patrón OpenZeppelin de roles granulares: `DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`, `BURNER_ROLE` y `RECEPTION_ROLE`. |
| **Event Listener** | Worker persistente conectado vía WebSocket RPC a Polygon para replicar eventos on-chain en la base de datos. |
| **Listing** | Oferta activa de venta de un NFT en el mercado secundario con precio fijado por su poseedor. |
| **JWT Blocklist** | Lista negra en Redis de JWTs revocados activamente al hacer logout, con TTL igual al tiempo de expiración restante del token. |
| **Redlock** | Algoritmo de exclusión mutua distribuida sobre Redis para garantizar ejecución única del bot burner. |

---

## 2. Arquitectura del Sistema

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (SPA Web3)                             │
│   Catálogo Reactivo · Búsqueda & Filtros (<500ms)                      │
│   Compra Anónima (MetaMask / WalletConnect v2)                         │
│   Marketplace Reventa · Resguardo QR Descargable (PNG/PDF + Wallet)    │
│   Back-office Propietario (MFA + Dashboard) · Web Recepción            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS (REST API)
┌───────────────────────────────────▼────────────────────────────────────┐
│                           BACKEND API                                  │
│   Entorno: Node.js (TypeScript) / Python (FastAPI) [Abierto]           │
│   Auth Admin: JWT RS256 + MFA + RTR + JWT Blocklist (Redis)            │
│   Re-confirmación MFA para operaciones de alto impacto (mintBatch)     │
│   Worker Caché EUR (CoinGecko / Fallback Binance) - latencia <5ms      │
│   Cola Asíncrona (BullMQ / Celery): Emails (SendGrid / Resend)         │
│   Servicio Web Push (FCM)                                              │
└───────────────┬───────────────────────────────┬────────────────────────┘
                │ RPC Failover (Alchemy/Infura) │ Pool Conexiones
┌───────────────▼───────────────┐     ┌─────────▼────────────────────────┐
│      SMART CONTRACTS          │     │     BASE DE DATOS OFF-CHAIN      │
│   Polygon PoS (Mainnet 137)   │     │   PostgreSQL / MongoDB           │
│   Polygon Amoy (Testnet 80002)│     │   Tablas Indexadas:              │
│   HotelNFT (AccessControl)    │     │   nfts · listings · sale_events  │
│   HotelMarketplace (Pausable) │     │   push_subscriptions · sessions  │
└───────────────▲───────────────┘     └─────────────────▲────────────────┘
                │                                       │
                └──────────────[ EVENT LISTENER ]───────┘
                     Sincronizador WebSocket con Heartbeat
                     Alerta email si sin eventos > 10 min
                     Reconciliación con eth_getLogs
                     Worker Burn Scheduler (burnBatch + Redlock)
```

---

## 3. Especificación de Smart Contracts (Solidity)

### 3.1 Contrato `HotelNFT.sol` (ERC-721 + EIP-2981 + AccessControl + Pausable)

Implementa el estándar ERC-721 con metadata extensible, declaración de royalties EIP-2981, gobernanza delegada mediante OpenZeppelin `AccessControl` y pausado de emergencia con `PausableUpgradeable`.

#### Roles de Seguridad
- `DEFAULT_ADMIN_ROLE`: Asignado a la multisig **Gnosis Safe 2-of-3**. Controla configuración global, `setMarketplaceContract()`, actualización de royalties y pausado de emergencia con `pause()`/`unpause()`.
- `MINTER_ROLE`: Asignado a la **wallet caliente de servicio del backend** (relayer). Autorizado para invocar `mintBatch()` desde el back-office de Carlos, con cuota máxima configurable (≤50 tokens/lote).
- `BURNER_ROLE`: Asignado a la **wallet de bot burner del backend**. Autorizado exclusivamente para invocar `burn()` y `burnBatch()` sobre habitaciones no vendidas.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract HotelNFT is ERC721, ERC2981, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    uint256 public constant MAX_BATCH_MINT = 50; // Cuota máxima por lote
    
    enum RoomType { SIMPLE, DOBLE, SUITE }

    struct RoomInfo {
        uint256 roomNumber;
        uint256 checkInTimestamp;
        RoomType roomType;
        uint256 basePriceWei;
    }

    mapping(uint256 => RoomInfo) public rooms;
    address public marketplaceContract;

    event NFTMinted(uint256 indexed tokenId, uint256 roomNumber, uint256 checkInTimestamp, RoomType roomType, uint256 basePrice);
    event NFTBurned(uint256 indexed tokenId, uint256 roomNumber, uint256 checkInTimestamp);
    event BatchBurned(uint256[] tokenIds);
    event MarketplaceContractUpdated(address indexed oldAddress, address indexed newAddress);

    // Setter para actualizar la dirección del marketplace sin redesplegar
    function setMarketplaceContract(address _marketplace)
        external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit MarketplaceContractUpdated(marketplaceContract, _marketplace);
        marketplaceContract = _marketplace;
    }

    // Pausado de emergencia (solo DEFAULT_ADMIN_ROLE)
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // Minteo por lote desde Back-office (relayer con MINTER_ROLE)
    function mintBatch(
        address to,
        uint256[] calldata roomNumbers,
        uint256[] calldata checkInTimestamps,
        RoomType[] calldata roomTypes,
        uint256[] calldata pricesWei
    ) external onlyRole(MINTER_ROLE) whenNotPaused {
        require(roomNumbers.length <= MAX_BATCH_MINT, "HotelNFT: Exceeds max batch size");
        // ... implementación
    }

    // Quema individual de habitación no vendida
    function burn(uint256 tokenId) external onlyRole(BURNER_ROLE) whenNotPaused;

    // Quema masiva desatendida para optimizar gas
    function burnBatch(uint256[] calldata tokenIds) external onlyRole(BURNER_ROLE) whenNotPaused;

    // EIP-2981: Consulta de royalties (5% simple/doble = 500bp, 10% suite = 1000bp)
    function royaltyInfo(uint256 tokenId, uint256 salePrice) 
        external view override returns (address receiver, uint256 royaltyAmount);

    // Bloqueo de operador: canaliza transferencias obligatoriamente por el Marketplace
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        // Permite minting (from == address(0)) y burning (to == address(0)) libremente
        if (from != address(0) && to != address(0)) {
            require(!paused(), "HotelNFT: Contract is paused");
            require(msg.sender == marketplaceContract, "HotelNFT: Transfers restricted to HotelMarketplace");
        }
        return super._update(to, tokenId, auth);
    }
}
```

---

### 3.2 Contrato `HotelMarketplace.sol` (+ Pausable + Pull-over-Push)

Marketplace exclusivo que gestiona compras primarias y reventas con liquidación atómica mediante **patrón Pull-over-Push** (los fondos se acumulan en mappings y se retiran con `withdraw()`) y protección anti-reentrancy.

```solidity
contract HotelMarketplace is ReentrancyGuard, AccessControl, Pausable {
    struct Listing {
        address seller;
        uint256 priceInWei;
        bool active;
    }

    HotelNFT public immutable nftContract;
    mapping(uint256 => Listing) public listings;

    // Pull-over-Push: fondos pendientes de retiro
    mapping(address => uint256) public pendingWithdrawals;

    event NFTListed(uint256 indexed tokenId, address indexed seller, uint256 priceInWei);
    event ListingCancelled(uint256 indexed tokenId, address indexed seller);
    event NFTSold(
        uint256 indexed tokenId, 
        address indexed seller, 
        address indexed buyer, 
        uint256 priceInWei, 
        uint256 royaltyAmount,
        bool isSecondary
    );
    event Withdrawal(address indexed recipient, uint256 amount);

    // Pausado de emergencia (solo DEFAULT_ADMIN_ROLE)
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // Listar NFT para reventa (requiere approve() previo en el NFT)
    function listForSale(uint256 tokenId, uint256 priceInWei) external nonReentrant whenNotPaused {
        require(nftContract.ownerOf(tokenId) == msg.sender, "Marketplace: Not the owner");
        require(priceInWei > 0, "Marketplace: Price must be > 0");
        (, uint256 checkInTimestamp, , ) = nftContract.rooms(tokenId);
        require(block.timestamp < checkInTimestamp, "Marketplace: Cannot list expired night");

        listings[tokenId] = Listing(msg.sender, priceInWei, true);
        emit NFTListed(tokenId, msg.sender, priceInWei);
    }

    // Cancelar listing (solo vendedor o admin de gobernanza)
    function cancelListing(uint256 tokenId) external nonReentrant whenNotPaused {
        Listing memory item = listings[tokenId];
        require(item.active, "Marketplace: Listing not active");
        require(
            msg.sender == item.seller || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), 
            "Marketplace: Unauthorized"
        );
        delete listings[tokenId];
        emit ListingCancelled(tokenId, item.seller);
    }

    // Compra atómica con Pull-over-Push: acumula fondos en pendingWithdrawals
    function buy(uint256 tokenId) external payable nonReentrant whenNotPaused {
        Listing memory item = listings[tokenId];
        require(item.active, "Marketplace: Not listed");
        require(msg.value == item.priceInWei, "Marketplace: Incorrect payment");

        delete listings[tokenId];

        (address royaltyReceiver, uint256 royaltyAmount) = 
            nftContract.royaltyInfo(tokenId, item.priceInWei);

        // Acumular royalty (a multisig) y remanente (al vendedor) para retiro
        pendingWithdrawals[royaltyReceiver] += royaltyAmount;
        pendingWithdrawals[item.seller] += (item.priceInWei - royaltyAmount);

        nftContract.safeTransferFrom(item.seller, msg.sender, tokenId);
        emit NFTSold(tokenId, item.seller, msg.sender, item.priceInWei, royaltyAmount, item.seller != address(nftContract));
    }

    // Retiro de fondos acumulados (Pull-over-Push)
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Marketplace: Nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Marketplace: Withdrawal failed");
        emit Withdrawal(msg.sender, amount);
    }
}
```

---

### 3.3 Bot Burner Desatendido (Scheduler con Redlock)

- **Frecuencia de Ejecución**: Cron job ejecutado a las **12:00 PM (mediodía) hora `Europe/Madrid`** diariamente.
- **Exclusión Mutua**: Antes de ejecutar, el bot adquiere un **Redis Redlock** con clave `hotel:burn:lock` y TTL de 30 segundos. Si no puede adquirir el lock (otra instancia activa), aborta silenciosamente y registra en log.
- **Alerta de Gas**: Si el saldo de la wallet con `BURNER_ROLE` cae por debajo de **5 POL**, el bot envía un email de alerta a Carlos **antes** de intentar `burnBatch()` y aborta la quema.
- **Criterio de Selección**:
  1. Consultar en la BD off-chain tokens con `status = 'AVAILABLE'` y `checkInDate < hoy`.
  2. Verificar on-chain que `ownerOf(tokenId) == address(HotelNFT)` (asegurando que no pertenece a ningún huésped).
  3. Si hay más de un token caducado, invocar `HotelNFT.burnBatch(tokenIds)` mediante la hot-wallet con `BURNER_ROLE`.
  4. Actualizar estado a `BURNED` en la base de datos y emitir métrica operacional.
- **Custodia de Clave**: La clave privada de la wallet con `BURNER_ROLE` se almacena en el **vault del servidor** (HashiCorp Vault o AWS Secrets Manager). Nunca se escribe en variables de entorno en texto plano en producción.

---

### 3.4 Entornos de Despliegue y Pruebas

**Toolchain de despliegue**: [Foundry](https://book.getfoundry.sh/) (`forge script`) ejecutado en instancia **GCP** del equipo para testnet y producción.

| Parámetro | Desarrollo Local | Testnet Oficial | Producción |
|-----------|------------------|-----------------|------------|
| **Red** | Anvil / Hardhat Node | **Polygon Amoy** | **Polygon PoS** |
| **Chain ID** | 31337 | **80002** | **137** |
| **Moneda** | ETH / Test POL | Test MATIC/POL | POL / MATIC |
| **Owner Admin** | Wallet 0 de Anvil | Cuenta de Prueba QA | Multisig Gnosis Safe 2-of-3 |
| **MINTER_ROLE** | Wallet 1 de Anvil | Wallet Minter Testnet | Hot-wallet Relayer Backend |
| **BURNER_ROLE** | Wallet 2 de Anvil | Wallet Bot Testnet | Hot-wallet Servicio Backend |
| **Herramienta deploy** | `forge script` local | `forge script` en GCP | `forge script` en GCP |

---

## 4. Especificación de la API Backend

### 4.1 Autenticación Administrativa (Back-office)

```
POST /auth/login
Body: { "email": "carlos@hotel.es", "password": "..." }
Response: { "challengeRequired": true, "sessionToken": "..." }

POST /auth/mfa/verify
Body: { "sessionToken": "...", "totpCode": "123456" }
Response: { "accessToken": "...", "refreshToken": "..." }

POST /auth/refresh
Headers: Authorization: Bearer <refreshToken>
Response: { "accessToken": "...", "newRefreshToken": "..." }
// RTR: invalida el anterior y guarda hash SHA-256 del nuevo en BD

POST /auth/logout
Headers: Authorization: Bearer <accessToken>
Response: { "success": true }
// Añade el JWT a la blocklist en Redis (TTL = tiempo restante del token)
// Revoca de inmediato la sesión eliminando el registro en admin_sessions

POST /auth/mfa/recovery
Body: { "email": "...", "recoveryCode": "..." }
Response: { "accessToken": "...", "refreshToken": "..." }
// Valida uno de los 8 códigos de rescate bcrypt; lo marca como usado
```

#### Operaciones de Alto Impacto (Re-confirmación MFA)
Las siguientes operaciones requieren re-verificación del código TOTP actual antes de ejecutarse:
- `POST /admin/nfts/mint-batch` — Minteo masivo de NFTs

```
POST /admin/nfts/mint-batch
Headers: Authorization: Bearer <accessToken>
Body: {
  "confirmTotpCode": "456789",  // Re-confirmación MFA obligatoria
  "rooms": [...]
}
```

---

### 4.2 Catálogo y Mercado Público (Anónimo)

```
GET /api/nfts
Query Params:
  - status: AVAILABLE | LISTED_RESALE
  - roomType: SIMPLE | DOBLE | SUITE
  - dateFrom: YYYY-MM-DD
  - dateTo: YYYY-MM-DD
  - priceMinWei: string
  - priceMaxWei: string
  - page: integer (default 1)
  - limit: integer (default 20, max 50)
Response:
{
  "items": [
    {
      "tokenId": "0x1a2b...",
      "roomNumber": 102,
      "roomType": "SIMPLE",
      "checkInDate": "2026-07-15",
      "priceWei": "5000000000000000000",
      "priceEur": 8.50,
      "status": "AVAILABLE",
      "imageUrl": "https://hotel.com/assets/simple.jpg",
      "isResale": false,
      "listing": null
    }
  ],
  "total": 45,
  "eurExchangeRate": 1.70,
  "exchangeRateUpdatedAt": "2026-09-07T21:00:00Z"
}

GET /api/nfts/:tokenId/metadata
Response: JSON conforme a ERC-721 Metadata Standard (name, description, image, attributes)

GET /api/sales/history
Query Params: page, limit, eventType (PRIMARY_SALE | RESALE), dateFrom, dateTo
Response: Listado público paginado de ventas y reventas (excluye BURN)
Exportación: GET /api/sales/history?format=csv → descarga directa en CSV

GET /admin/dashboard
GET /admin/dashboard/export?format=csv
```

---

### 4.3 Check-in Criptográfico y Validación en Recepción

```
GET /api/qr/:tokenId
Headers:
  x-wallet-address: 0x...
  x-signature: 0x... (Firma EIP-712 con { tokenId, nonce, expiresAt })
// Verifica on-chain ownerOf(tokenId) == x-wallet-address
// Si el secreto existe en BD (check_in_secret_enc), lo descifra con AES-256-GCM
// Si no existe (primera generación), genera 32 bytes aleatorios, los cifra y guarda
Response:
{
  "qrPayload": "https://hotel.com/checkin?t=0x1a2b&s=e7c8d9...",
  "tokenId": "0x1a2b...",
  "roomNumber": 201,
  "checkInDate": "2026-07-20",
  "expiresAt": "2026-07-21T23:59:59Z"
}

POST /admin/qr/validate (Protegido - RECEPTION_ROLE)
Body:
{
  "tokenId": "0x1a2b...",
  "checkInSecret": "e7c8d9f0..."
}
Response:
{
  "status": "SUCCESS", // SUCCESS | ALREADY_CHECKED_IN | EXPIRED | INVALID_SECRET
  "roomNumber": 201,
  "roomType": "SUITE",
  "guestWallet": "0x1234...abcd",
  "checkInDate": "2026-07-20"
}
```

---

### 4.4 Suscripción Web Push (Opt-in)

```
POST /api/push/subscribe
Body: { "endpoint": "...", "p256dh": "...", "auth": "..." }

DELETE /api/push/unsubscribe
Body: { "endpoint": "..." }
```

---

## 5. Esquema de Base de Datos Off-chain

### 5.0 Máquina de Estados Unificada

La coherencia entre `nfts.status` y `listings.status` se rige por las siguientes transiciones y reglas de invariante:

```
                    ┌─────────────────────────────────────────────┐
                    │             nfts.status                      │
                    │                                             │
                    │  [AVAILABLE] ──buy()──────────────────────> [SOLD]
                    │      │                                       │
                    │  burnBatch()                         checkIn validated
                    │      │                                       │
                    │      ▼                                       ▼
                    │   [BURNED]                           [CHECKED_IN]
                    │                                             │
                    │                              (burn bloqueado; estado final)
                    └─────────────────────────────────────────────┘

                    ┌─────────────────────────────────────────────┐
                    │             listings.status                  │
                    │                                             │
                    │  [ACTIVE] ──buy()──────────────────────> [COMPLETED]
                    │      │
                    │  cancelListing()
                    │      │
                    │      ▼
                    │  [CANCELLED]
                    └─────────────────────────────────────────────┘
```

**Reglas de invariante obligatorias (aplicadas por el Event Listener):**

| Evento on-chain | Acción en `nfts` | Acción en `listings` |
|----------------|-------------------|----------------------|
| `NFTSold` | `status` → `SOLD`, `current_owner` → buyer, rotar `check_in_secret_enc` | listing activo del token → `status = COMPLETED`, `sold_at = now()` |
| `ListingCancelled` | Sin cambio | listing activo → `status = CANCELLED`, `cancelled_at = now()` |
| `NFTBurned` | `status` → `BURNED`, `burned_at = now()` | listing activo (si existe) → forzar `CANCELLED` (race condition resuelta) |
| `NFTCheckedIn` (BD) | `status` → `CHECKED_IN`, `checked_in_at = now()` | Bloquear `listForSale()` on-chain (verificar `checkInTimestamp < now`) |

**Precondición en `listForSale()`:** El contrato requiere `block.timestamp < checkInTimestamp`, lo que implícitamente bloquea el listado de tokens ya validados en check-in.

---

### Tabla: `nfts`
```sql
CREATE TABLE nfts (
    token_id VARCHAR(66) PRIMARY KEY,
    room_number INT NOT NULL,
    room_type VARCHAR(10) NOT NULL, -- SIMPLE, DOBLE, SUITE
    check_in_date DATE NOT NULL,
    base_price_wei VARCHAR(78) NOT NULL,
    status VARCHAR(20) NOT NULL,    -- AVAILABLE, SOLD, BURNED, CHECKED_IN
    current_owner VARCHAR(42) NOT NULL,
    check_in_secret_enc TEXT NULL,  -- Secreto cifrado con AES-256-GCM (clave en vault)
    minted_at TIMESTAMP NOT NULL,
    checked_in_at TIMESTAMP NULL,
    burned_at TIMESTAMP NULL,
    tx_hash_mint VARCHAR(66) NOT NULL
);

-- Índices obligatorios para soportar 200 usuarios concurrentes y consultas reactivas (<500ms)
CREATE INDEX idx_nfts_query ON nfts(status, check_in_date, room_type);
CREATE INDEX idx_nfts_room ON nfts(room_number);
```

### Tabla: `listings` (Marketplace de Reventa)
```sql
CREATE TABLE listings (
    listing_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id VARCHAR(66) NOT NULL REFERENCES nfts(token_id),
    seller_address VARCHAR(42) NOT NULL,
    price_wei VARCHAR(78) NOT NULL,
    status VARCHAR(20) NOT NULL, -- ACTIVE, COMPLETED, CANCELLED
    listed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMP NULL,
    sold_at TIMESTAMP NULL,
    tx_hash VARCHAR(66) NOT NULL
);

CREATE INDEX idx_listings_active ON listings(status, token_id);
```

### Tabla: `sale_events`
```sql
CREATE TABLE sale_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id VARCHAR(66) NOT NULL REFERENCES nfts(token_id),
    event_type VARCHAR(20) NOT NULL, -- PRIMARY_SALE, RESALE, BURN
    from_address VARCHAR(42),
    to_address VARCHAR(42),
    price_wei VARCHAR(78),
    royalty_wei VARCHAR(78),
    price_eur DECIMAL(10, 2),
    block_number BIGINT NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    timestamp TIMESTAMP NOT NULL
);

CREATE INDEX idx_sales_dashboard ON sale_events(event_type, timestamp);
```

### Tabla: `admin_sessions`
```sql
CREATE TABLE admin_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(64) NOT NULL, -- Hash SHA-256, nunca texto plano
    is_mfa_verified BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_rotated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Tabla: `mfa_recovery_codes`
```sql
CREATE TABLE mfa_recovery_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    code_hash VARCHAR(60) NOT NULL,  -- Hash bcrypt del código de 8 caracteres
    used_at TIMESTAMP NULL,          -- NULL = no usado; timestamp = usado y consumido
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Se generan 8 registros al activar MFA por primera vez
```

### Tabla: `push_subscriptions`
```sql
CREATE TABLE push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## 6. Event Listener y Resiliencia

### 6.1 Sincronización y Reconciliación Transaccional
- **Conexión**: WebSocket RPC primario (Alchemy) con conmutación automática al secundario (Infura) en caso de caída.
- **Heartbeat Activo**: Ping/pong técnico cada 30 segundos. Si falla 2 veces consecutivas, se activa la reconexión inmediata.
- **Persistencia de Bloque**: El listener guarda atómicamente en BD el `lastBlockProcessed`.
- **Reconciliación Retroactiva**: Al reconectar tras cualquier fallo de red, se invoca `eth_getLogs(fromBlock = lastBlockProcessed + 1)` para procesar todas las transacciones intermedias sin pérdida de datos.
- **Alerta de Silencio**: Si el listener no procesa ningún evento en **10 minutos**, envía un email de alerta a Carlos (posible nodo caído, desconexión silenciosa o red inactiva). El umbral es configurable por variable de entorno.

### 6.2 Cola Asíncrona de Correos (BullMQ / Celery)
- Ante el evento `NFTSold`, el listener encola una tarea de notificación en memoria (Redis).
- El worker de correo procesa el envío a Carlos mediante SendGrid / Resend en < 60s con 3 reintentos y backoff exponencial (10s, 30s, 90s).

---

## 7. Conversión de Precios EUR Resiliente

- **Worker de Fondo**: Un proceso backend independiente consulta el tipo de cambio MATIC/EUR cada 5 minutos a CoinGecko.
- **Caché en Memoria**: El valor obtenido se almacena en memoria/Redis con TTL de 10 minutos.
- **Failover a Fuente Secundaria**: Si CoinGecko retorna error 429 (Rate Limit) o timeout, el worker consulta automáticamente la API de Binance o CryptoCompare.
- **Respuesta a Clientes**: Todos los endpoints del catálogo (`/api/nfts`) leen la cotización desde la caché interna, respondiendo en **< 5ms** sin consumir llamadas a APIs externas.

---

## 8. Plan Integral de Pruebas y Criterios de Aceptación (DoD)

### 8.1 Pruebas de Smart Contracts (Foundry + Slither)
1. **Minting batch**: Ejecución correcta de lotes de ≤50 habitaciones por relayer con `MINTER_ROLE`.
2. **AccessControl**: `BURNER_ROLE` quema tokens no vendidos; terceros reciben revert `AccessControlUnauthorizedAccount`.
3. **Royalties EIP-2981**: 5% deducido en habitaciones simples/dobles y 10% en suite.
4. **Enforcing de Marketplace**: Transferencias directas fuera del contrato marketplace revierten.
5. **Reentrancy**: Comprobación exhaustiva con fuzzer en la función `buy()`.
6. **Pull-over-Push**: Verificación de que `buy()` no transfiere ETH directamente; acumula en `pendingWithdrawals`.
7. **Pausable**: Verificación de que operaciones fallan con `EnforcedPause()` cuando el contrato está pausado.
8. **Análisis estático**: `slither .` sin vulnerabilidades de severidad alta o crítica en CI.

### 8.2 Pruebas de Backend y Rendimiento
1. **Flujo Check-in**: Verificación de `checkInSecret` y rechazo inmediato de intentos de reutilización (`ALREADY_CHECKED_IN`).
2. **Re-descarga QR**: Verificación de que el QR puede re-descargarse con firma EIP-712 válida y es rechazado con firma inválida.
3. **Rotación de secreto en reventa**: Al procesar `NFTSold`, el `check_in_secret_enc` se regenera en BD.
4. **Pruebas de Carga k6**: Escenario de **200 usuarios concurrentes** navegando y filtrando el catálogo, con tiempo de respuesta **p95 < 500ms** y 0% de errores HTTP 5xx.
5. **JWT Blocklist**: Verificación de que un JWT en logout no es aceptado tras ser añadido a la blocklist de Redis.
6. **Códigos de rescate MFA**: Cada código solo puede usarse una vez; el segundo intento es rechazado.
7. **Redis Redlock**: Verificación de que dos instancias concurrentes del bot burner no ejecutan `burnBatch()` simultáneamente.

### 8.3 Definición de Hecho (DoD) — Global
Todos los criterios siguientes deben cumplirse para considerar una historia como **Hecha**:

- [ ] Código revisado en merge request por al menos 1 par (code review).
- [ ] Tests unitarios y de integración escritos y pasando en CI.
- [ ] **Cobertura de código ≥ 80%** medida por el pipeline CI (contratos: Foundry lcov; backend: Jest/Pytest).
- [ ] Análisis estático de contratos con `slither .` sin hallazgos críticos o altos.
- [ ] Despliegue verificado en entorno de desarrollo local (Anvil) o testnet según sprint.
- [ ] Criterios de aceptación de la historia validados manualmente o con test E2E.
- [ ] Documentación técnica actualizada si el cambio modifica una interfaz pública.
- [ ] Despliegue verificado en testnet **Polygon Amoy (chainId 80002)** a partir de Sprint 3.

---
*SRS v1.2.0 — Aprobado formalmente tras resolución de 17 hallazgos de auditoría del Plan y Backlog.*

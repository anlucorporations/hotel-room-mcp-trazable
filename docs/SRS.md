# SRS — Especificación de Requisitos de Software
## Hotel Marina del Sol: Plataforma NFT de Reservas

> **Versión**: 1.3.0  
> **Estado**: Aprobado — Post-Auditoría v3 (21 hallazgos resueltos)  
> **Fecha**: 2026-09-08  
> **Referencia**: PRD v1.1.0  

---

## 1. Introducción

### 1.1 Propósito
Este documento define formalmente la arquitectura técnica, interfaces de contratos inteligentes, especificación de APIs, modelo de base de datos off-chain y criterios de resiliencia para el desarrollo de la plataforma NFT del Hotel Marina del Sol.

### 1.2 Alcance del MVP
El sistema abarca el catálogo público reactivo, filtrado optimizado, compra primaria anónima con MetaMask / WalletConnect v2, marketplace de reventa propio con enforcing inmutable de royalties (5% y 10%) y precio mínimo anti-evasión (`minListingPrice`), entrega de resguardo QR criptográfico con secreto off-chain cifrado (AES-256-GCM) y pases Apple/Google Wallet, validación segura en recepción asistida por MFA y anclaje on-chain (`markCheckedIn`), panel de analítica para el propietario con MFA y JWT blocklist, observabilidad centralizada con Sentry y Cloud Logging, sincronizador de eventos on-chain con cola asíncrona de correos (BullMQ) respaldada en BD, quema programada desatendida por lotes (con Redis Redlock) e histórico público de ventas.

> **Cumplimiento Normativo (RD 933/2021)**: La compraventa on-chain se mantiene 100% anónima. La captura e inscripción de los datos del viajero (DNI/Pasaporte, nombre) exigida por ley se delega físicamente al software de gestión hotelera (PMS) en el mostrador de recepción al entregar las llaves; la plataforma no almacena datos de filiación personal.

### 1.3 Definiciones Técnicas

| Término | Definición Técnica |
|---------|---------------------|
| **NFT (ERC-721)** | Token no fungible que representa el derecho de ocupación de una habitación específica en una fecha determinada. |
| **Token ID** | Identificador único uint256 generado on-chain: `keccak256(roomNumber, checkInDate)`. |
| **EIP-2981** | Estándar Ethereum para declaración de royalties on-chain en mercados secundarios. |
| **checkInSecret** | Token criptográfico aleatorio de 32 bytes generado off-chain, almacenado cifrado con AES-256-GCM en base de datos. |
| **AccessControl On-chain** | Patrón OpenZeppelin de roles en contratos: `DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`, `BURNER_ROLE` y `RECEPTION_ROLE`. |
| **RECEPTION_ROLE Off-chain** | Claim RBAC en JWT emitido por la API tras login con contraseña y verificación obligatoria de MFA TOTP. |
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
│   Marketplace Reventa · Resguardo QR Descargable (PNG/PDF/Passes)      │
│   Back-office Propietario (MFA + Dashboard) · Web Recepción (MFA)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS (REST API)
┌───────────────────────────────────▼────────────────────────────────────┐
│                           BACKEND API                                  │
│   Entorno: Node.js (TypeScript) / Python (FastAPI)                     │
│   Auth Admin/Recepción: JWT RS256 + MFA Obligatorio + RTR + Blocklist  │
│   Re-confirmación MFA exclusiva para mintBatch                         │
│   Worker Caché EUR (CoinGecko / Fallback Binance) - latencia <5ms      │
│   Cola Asíncrona (BullMQ): Emails con persistencia en BD               │
│   Pases Digitales: passkit-generator (.pkpass) / Google Wallet API     │
│   Observabilidad: Sentry (errores) + Cloud Logging (JSON estructurado) │
│   Health Checks: /health/live y /health/ready                          │
└───────────────┬───────────────────────────────┬────────────────────────┘
                │ RPC Failover (Alchemy/Infura) │ Pool Conexiones
┌───────────────▼───────────────┐     ┌─────────▼────────────────────────┐
│      SMART CONTRACTS          │     │     BASE DE DATOS OFF-CHAIN      │
│   Polygon PoS (Mainnet 137)   │     │   PostgreSQL Clúster             │
│   Polygon Amoy (Testnet 80002)│     │   Tablas Indexadas:              │
│   HotelNFT (markCheckedIn)    │     │   nfts · listings · sale_events  │
│   HotelMarketplace (minPrice) │     │   email_notifications · sessions │
└───────────────▲───────────────┘     └─────────────────▲────────────────┘
                │                                       │
                └──────────────[ EVENT LISTENER ]───────┘
                     Sincronizador WebSocket con Heartbeat (5000ms)
                     Alerta DevOps si sin eventos > 10 min
                     Reconciliación con eth_getLogs
                     Worker Burn Scheduler (burnBatch + Redlock)
```

---

## 3. Especificación de Smart Contracts (Solidity)

### 3.1 Contrato `HotelNFT.sol` (ERC-721 + EIP-2981 + AccessControl + Pausable)

Implementa el estándar ERC-721 con metadata extensible, declaración de royalties EIP-2981, gobernanza delegada mediante OpenZeppelin `AccessControl`, función de marcado de estancia y pausado de emergencia.

#### Roles de Seguridad On-chain
- `DEFAULT_ADMIN_ROLE`: Asignado a la multisig **Gnosis Safe 2-of-3** en producción. Controla configuración global, `setMarketplaceContract()`, actualización de royalties y pausado de emergencia (`pause()` / `unpause()`).
- `MINTER_ROLE`: Asignado a la **wallet caliente de servicio del backend** (relayer). Autorizado para invocar `mintBatch()` con cuota máxima (≤50 tokens/lote).
- `BURNER_ROLE`: Asignado a la **wallet de bot burner del backend**. Autorizado exclusivamente para invocar `burn()` y `burnBatch()` sobre habitaciones no vendidas.
- `RECEPTION_ROLE`: Asignado a la **wallet operativa del backend para recepción**. Autorizado para invocar `markCheckedIn(tokenId)` al validar la estancia del huésped.

#### Flujo Transaccional de Venta Primaria
1. El backend (mediante Carlos en Back-office) invoca `mintBatch(address(HotelNFT), ...)` acuñando los tokens a nombre del propio contrato `HotelNFT`.
2. En la misma secuencia orquestada, el relayer con permisos ejecuta `HotelNFT.approve(address(marketplaceContract), tokenId)` para cada token minteado.
3. El relayer invoca `HotelMarketplace.listForSale(tokenId, priceWei)`, dejando la habitación activa para compra primaria en el catálogo.

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
    bytes32 public constant RECEPTION_ROLE = keccak256("RECEPTION_ROLE");

    uint256 public constant MAX_BATCH_MINT = 50;
    
    enum RoomType { SIMPLE, DOBLE, SUITE }

    struct RoomInfo {
        uint256 roomNumber;
        uint256 checkInTimestamp;
        RoomType roomType;
        uint256 basePriceWei;
        bool isCheckedIn;
    }

    mapping(uint256 => RoomInfo) public rooms;
    address public marketplaceContract;

    event NFTMinted(uint256 indexed tokenId, uint256 roomNumber, uint256 checkInTimestamp, RoomType roomType, uint256 basePrice);
    event NFTBurned(uint256 indexed tokenId, uint256 roomNumber, uint256 checkInTimestamp);
    event BatchBurned(uint256[] tokenIds);
    event NFTCheckedInOnChain(uint256 indexed tokenId, uint256 timestamp);
    event MarketplaceContractUpdated(address indexed oldAddress, address indexed newAddress);

    function setMarketplaceContract(address _marketplace) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit MarketplaceContractUpdated(marketplaceContract, _marketplace);
        marketplaceContract = _marketplace;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function mintBatch(
        address to,
        uint256[] calldata roomNumbers,
        uint256[] calldata checkInTimestamps,
        RoomType[] calldata roomTypes,
        uint256[] calldata pricesWei
    ) external onlyRole(MINTER_ROLE) whenNotPaused {
        require(roomNumbers.length <= MAX_BATCH_MINT, "HotelNFT: Exceeds max batch size");
        // ... inicialización de tokens y almacenamiento en struct rooms
    }

    // Marcado on-chain para prevenir reventa posterior a check-in
    function markCheckedIn(uint256 tokenId) external onlyRole(RECEPTION_ROLE) whenNotPaused {
        require(!rooms[tokenId].isCheckedIn, "HotelNFT: Already checked in");
        rooms[tokenId].isCheckedIn = true;
        emit NFTCheckedInOnChain(tokenId, block.timestamp);
    }

    function burn(uint256 tokenId) external onlyRole(BURNER_ROLE) whenNotPaused;
    function burnBatch(uint256[] calldata tokenIds) external onlyRole(BURNER_ROLE) whenNotPaused;

    function royaltyInfo(uint256 tokenId, uint256 salePrice) 
        external view override returns (address receiver, uint256 royaltyAmount);

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            require(!paused(), "HotelNFT: Contract paused");
            require(!rooms[tokenId].isCheckedIn, "HotelNFT: Cannot transfer checked-in room");
            require(msg.sender == marketplaceContract, "HotelNFT: Transfers restricted to Marketplace");
        }
        return super._update(to, tokenId, auth);
    }
}
```

---

### 3.2 Contrato `HotelMarketplace.sol` (+ Pull-over-Push + Anti-evasión)

Marketplace exclusivo que gestiona compras primarias y reventas con liquidación mediante **Pull-over-Push**, control anti-evasión de royalties (`minListingPrice`) y protección anti-reentrancy.

> **Limitación Técnica de Retiro**: El método `withdraw()` transfiere nativo mediante `call{value}`. Está diseñado para clientes operando con wallets de tipo EOA (Externally Owned Accounts). Si un vendedor utiliza un contrato intermediario, este debe implementar `receive()` o `fallback()` adecuadamente para recibir los fondos acumulados.

```solidity
contract HotelMarketplace is ReentrancyGuard, AccessControl, Pausable {
    struct Listing {
        address seller;
        uint256 priceInWei;
        bool active;
    }

    HotelNFT public immutable nftContract;
    uint256 public minListingPrice; // Precio mínimo contra wash trading (1 wei)
    mapping(uint256 => Listing) public listings;
    mapping(address => uint256) public pendingWithdrawals;

    event NFTListed(uint256 indexed tokenId, address indexed seller, uint256 priceInWei);
    event ListingCancelled(uint256 indexed tokenId, address indexed seller);
    event NFTSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 priceInWei, uint256 royaltyAmount, bool isSecondary);
    event Withdrawal(address indexed recipient, uint256 amount);
    event MinListingPriceUpdated(uint256 newMinPrice);

    constructor(address _nftContract, uint256 _initialMinPrice) {
        nftContract = HotelNFT(_nftContract);
        minListingPrice = _initialMinPrice;
    }

    function setMinListingPrice(uint256 _newMinPrice) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minListingPrice = _newMinPrice;
        emit MinListingPriceUpdated(_newMinPrice);
    }

    function listForSale(uint256 tokenId, uint256 priceInWei) external nonReentrant whenNotPaused {
        require(nftContract.ownerOf(tokenId) == msg.sender, "Marketplace: Not owner");
        require(priceInWei >= minListingPrice, "Marketplace: Price below minimum floor");
        (, uint256 checkInTimestamp, , , bool isCheckedIn) = nftContract.rooms(tokenId);
        require(!isCheckedIn, "Marketplace: Room already checked in");
        require(block.timestamp < checkInTimestamp, "Marketplace: Expired night");

        listings[tokenId] = Listing(msg.sender, priceInWei, true);
        emit NFTListed(tokenId, msg.sender, priceInWei);
    }

    function cancelListing(uint256 tokenId) external nonReentrant whenNotPaused {
        Listing memory item = listings[tokenId];
        require(item.active, "Marketplace: Listing not active");
        require(msg.sender == item.seller || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Marketplace: Unauthorized");
        delete listings[tokenId];
        emit ListingCancelled(tokenId, item.seller);
    }

    function buy(uint256 tokenId) external payable nonReentrant whenNotPaused {
        Listing memory item = listings[tokenId];
        require(item.active, "Marketplace: Not listed");
        require(msg.value == item.priceInWei, "Marketplace: Incorrect payment");

        delete listings[tokenId];

        (address royaltyReceiver, uint256 royaltyAmount) = nftContract.royaltyInfo(tokenId, item.priceInWei);

        pendingWithdrawals[royaltyReceiver] += royaltyAmount;
        pendingWithdrawals[item.seller] += (item.priceInWei - royaltyAmount);

        nftContract.safeTransferFrom(item.seller, msg.sender, tokenId);
        emit NFTSold(tokenId, item.seller, msg.sender, item.priceInWei, royaltyAmount, item.seller != address(nftContract));
    }

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

- **Frecuencia**: Cron ejecutado a las **12:00 PM (mediodía) hora `Europe/Madrid`**.
- **Exclusión Mutua**: Redis Redlock (`hotel:burn:lock`, TTL 30s).
- **Alerta de Saldo**: Si el balance de la wallet con `BURNER_ROLE` es `< 5 POL`, se remite alerta inmediata al canal técnico (`DEVOPS_ALERT_EMAIL`) y la ejecución se suspende.
- **Custodia de Claves**: La clave del bot se gestiona mediante Google Cloud Secret Manager o HashiCorp Vault.

---

## 4. Especificación de la API Backend

### 4.1 Autenticación (Admin y Recepción)

Tanto las cuentas de Carlos (Admin) como las del personal de recepción exigen autenticación multifactor (MFA TOTP) obligatoria:

```
POST /auth/login
Body: { "email": "recepcion@hotel.es", "password": "..." }
Response: { "challengeRequired": true, "sessionToken": "..." }

POST /auth/mfa/verify
Body: { "sessionToken": "...", "totpCode": "123456" }
Response: { "accessToken": "...", "refreshToken": "...", "roles": ["RECEPTION_ROLE"] }

POST /auth/logout
Headers: Authorization: Bearer <accessToken>
Response: { "success": true }
// Agrega el JWT a la Blocklist en Redis por el tiempo restante de expiración
```

> **Operaciones de Alto Impacto**: En el MVP, la única operación catalogada como de alto impacto que exige re-confirmación obligatoria de TOTP en el cuerpo de la petición (`confirmTotpCode`) es `POST /admin/nfts/mint-batch`.

---

### 4.2 Catálogo, Metadatos y Salud del Sistema

```
GET /api/nfts
Query Params: status, roomType, dateFrom, dateTo, priceMinWei, priceMaxWei, page, limit
Response: { "items": [...], "total": 45, "eurExchangeRate": 1.70, "exchangeRateUpdatedAt": "..." }

GET /api/nfts/:tokenId/metadata
Response: Formato ERC-721 Metadata Standard con atributos de habitación.

GET /health/live
Response: 200 OK { "status": "ALIVE" }

GET /health/ready
Response: 200 OK { 
  "status": "READY", 
  "dependencies": { "postgres": "UP", "redis": "UP", "polygonRPC": "UP" } 
}
```

---

### 4.3 Check-in, Contingencia y Pases Digitales

```
GET /api/qr/:tokenId
Headers: x-wallet-address, x-signature (EIP-712 con tokenId, nonce, expiresAt)
Response: { "qrPayload": "https://hotel.com/checkin?t=0x1a...&s=e7c8...", "tokenId": "0x1a...", ... }

POST /admin/qr/validate (Protegido - RECEPTION_ROLE con MFA)
Body: { "tokenId": "0x1a2b...", "checkInSecret": "e7c8d9f0..." }
Response: { "status": "SUCCESS", "roomNumber": 201, "roomType": "SUITE", "guestWallet": "0x123..." }
// Ejecuta llamada on-chain markCheckedIn(tokenId) y marca status='CHECKED_IN' en BD

POST /admin/qr/contingency-checkin (Protegido - RECEPTION_ROLE con MFA)
Body: { "roomNumber": 201, "checkInDate": "2026-07-20", "reason": "Huésped sin dispositivo móvil" }
Response: { "status": "SUCCESS", "tokenId": "0x1a2b..." }
// Permite check-in manual asistido tras validación física de identidad en PMS

GET /api/wallet/pass/:tokenId?type=apple|google
Headers: x-wallet-address, x-signature (EIP-712)
Response: Binario firmado .pkpass (Apple) o URL de objeto Pass (Google Wallet)
// Generado con passkit-generator utilizando Pass Type ID Certificate oficial
```

---

## 5. Esquema de Base de Datos Off-chain

### Tabla: `nfts`
```sql
CREATE TABLE nfts (
    token_id VARCHAR(66) PRIMARY KEY,
    room_number INT NOT NULL,
    room_type VARCHAR(10) NOT NULL,
    check_in_date DATE NOT NULL,
    base_price_wei VARCHAR(78) NOT NULL,
    status VARCHAR(20) NOT NULL, -- AVAILABLE, SOLD, BURNED, CHECKED_IN
    current_owner VARCHAR(42) NOT NULL,
    check_in_secret_enc TEXT NULL, -- AES-256-GCM (clave administrada en Secret Manager)
    minted_at TIMESTAMP NOT NULL,
    checked_in_at TIMESTAMP NULL,
    burned_at TIMESTAMP NULL,
    tx_hash_mint VARCHAR(66) NOT NULL
);
CREATE INDEX idx_nfts_query ON nfts(status, check_in_date, room_type);
CREATE INDEX idx_nfts_room ON nfts(room_number);
```

### Tabla: `email_notifications` (Resiliencia de BullMQ)
```sql
CREATE TABLE email_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, SENT, FAILED
    attempts INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP NULL
);
CREATE INDEX idx_notifications_pending ON email_notifications(status, created_at);
```

---

## 6. Sincronización y Resiliencia del Event Listener

- **WebSocket Heartbeat**: Ping/pong cada 30 segundos con timeout estricto de **5000ms**. Tras 2 fallos consecutivos, conmuta inmediatamente al RPC de respaldo (Infura).
- **Alerta de Silencio**: Si no se procesan eventos en 10 minutos, se despacha notificación de advertencia a `DEVOPS_ALERT_EMAIL`.
- **Reconciliación de Notificaciones**: Un cron backend consulta periódicamente registros con `status = 'PENDING'` en `email_notifications` con antigüedad > 5 minutos para re-encolarlos automáticamente ante caídas imprevistas de Redis.

---

## 7. Plan de Pruebas y Compuertas de Calidad (DoD)

- [ ] Cobertura de código unitario e integración **≥ 80%** unificada.
- [ ] Ejecución en pipeline CI de `slither .` sin vulnerabilidades de severidad **HIGH** o **CRITICAL** para todo commit o pull request que incluya contratos inteligentes.
- [ ] Validación de compilación y despliegues mediante Foundry en GCP.
- [ ] Health checks funcionales `/health/live` y `/health/ready` respondiendo en staging.
- [ ] Prevención de reventa confirmada en pruebas Foundry tras invocar `markCheckedIn()`.

---
*SRS v1.3.0 — Aprobado formalmente tras incorporar las 21 resoluciones de auditoría.*

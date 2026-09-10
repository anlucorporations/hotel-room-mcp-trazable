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
                     Alerta DevOps si sin bloques newHeads > 10 min
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
1. El backend (mediante Carlos en Back-office) invoca `mintBatch(address(HotelNFT), ...)` acuñando los tokens a nombre del propio contrato `HotelNFT` (que implementa `ERC721Holder`).
2. `HotelNFT` autoriza implícitamente al `marketplaceContract` en `_isAuthorized()` para transferir inventario primario.
3. El relayer (`MINTER_ROLE`) o admin invoca `HotelMarketplace.listForSale(tokenId, priceWei)`, reconociendo el inventario del hotel y activando la habitación en el catálogo.
4. Al ejecutarse `buy(tokenId)`, el 100% de los fondos de la venta primaria se acredita de forma directa y segura en `pendingWithdrawals` a favor de la tesorería del hotel (`royaltyReceiver`), sin atrapar fondos en el contrato `HotelNFT`.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {RoomMaster} from "./libraries/RoomMaster.sol";

contract HotelNFT is ERC721, ERC2981, AccessControl, Pausable, ERC721Holder {
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
    address public treasury;

    event NFTMinted(uint256 indexed tokenId, uint256 roomNumber, uint256 checkInTimestamp, RoomType roomType, uint256 basePriceWei);
    event NFTBurned(uint256 indexed tokenId, uint256 roomNumber, uint256 checkInTimestamp);
    event BatchBurned(uint256[] tokenIds);
    event NFTCheckedInOnChain(uint256 indexed tokenId, uint256 timestamp);
    event MarketplaceContractUpdated(address indexed oldAddress, address indexed newAddress);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    constructor(address _admin, address _treasury) ERC721("Hotel Marina del Sol Room Night", "HROOM") {
        require(_admin != address(0), "HotelNFT: Zero admin address");
        require(_treasury != address(0), "HotelNFT: Zero treasury address");
        treasury = _treasury;
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    function setMarketplaceContract(address _marketplace) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_marketplace != address(0), "HotelNFT: Zero marketplace address");
        emit MarketplaceContractUpdated(marketplaceContract, _marketplace);
        marketplaceContract = _marketplace;
    }

    function setTreasury(address _newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newTreasury != address(0), "HotelNFT: Zero treasury address");
        emit TreasuryUpdated(treasury, _newTreasury);
        treasury = _newTreasury;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function computeTokenId(uint256 roomNumber, uint256 checkInTimestamp) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(roomNumber, checkInTimestamp)));
    }

    function mintBatch(
        address to,
        uint256[] calldata roomNumbers,
        uint256[] calldata checkInTimestamps,
        RoomType[] calldata roomTypes,
        uint256[] calldata pricesWei
    ) external onlyRole(MINTER_ROLE) whenNotPaused {
        uint256 count = roomNumbers.length;
        require(count > 0, "HotelNFT: Empty batch");
        require(count <= MAX_BATCH_MINT, "HotelNFT: Exceeds max batch size");
        require(
            count == checkInTimestamps.length &&
            count == roomTypes.length &&
            count == pricesWei.length,
            "HotelNFT: Array lengths mismatch"
        );
        require(to != address(0), "HotelNFT: Mint to zero address");

        for (uint256 i = 0; i < count; i++) {
            _mintSingle(to, roomNumbers[i], checkInTimestamps[i], roomTypes[i], pricesWei[i]);
        }
    }

    function _mintSingle(address to, uint256 roomNumber, uint256 checkInTimestamp, RoomType rType, uint256 priceWei) internal {
        require(RoomMaster.isInMaster(roomNumber), "HotelNFT: Room not in master");
        require(checkInTimestamp > block.timestamp, "HotelNFT: Check-in date in the past");
        require(priceWei > 0, "HotelNFT: Price must be greater than zero");

        uint256 tokenId = computeTokenId(roomNumber, checkInTimestamp);
        require(rooms[tokenId].roomNumber == 0, "HotelNFT: Token already minted");

        rooms[tokenId] = RoomInfo({
            roomNumber: roomNumber,
            checkInTimestamp: checkInTimestamp,
            roomType: rType,
            basePriceWei: priceWei,
            isCheckedIn: false
        });

        _safeMint(to, tokenId);
        emit NFTMinted(tokenId, roomNumber, checkInTimestamp, rType, priceWei);
    }

    function markCheckedIn(uint256 tokenId) external onlyRole(RECEPTION_ROLE) whenNotPaused {
        require(_ownerOf(tokenId) != address(0), "HotelNFT: Nonexistent token");
        RoomInfo storage room = rooms[tokenId];
        require(!room.isCheckedIn, "HotelNFT: Already checked in");
        room.isCheckedIn = true;
        emit NFTCheckedInOnChain(tokenId, block.timestamp);
    }

    function burn(uint256 tokenId) external onlyRole(BURNER_ROLE) whenNotPaused { _burnToken(tokenId); }
    function burnBatch(uint256[] calldata tokenIds) external onlyRole(BURNER_ROLE) whenNotPaused {
        uint256 count = tokenIds.length;
        require(count > 0, "HotelNFT: Empty batch");
        for (uint256 i = 0; i < count; i++) { _burnToken(tokenIds[i]); }
        emit BatchBurned(tokenIds);
    }

    function _burnToken(uint256 tokenId) internal {
        require(_ownerOf(tokenId) != address(0), "HotelNFT: Nonexistent token");
        RoomInfo memory room = rooms[tokenId];
        require(block.timestamp >= room.checkInTimestamp, "HotelNFT: Cannot burn before check-in");
        emit NFTBurned(tokenId, room.roomNumber, room.checkInTimestamp);
        delete rooms[tokenId];
        _burn(tokenId);
    }

    function royaltyInfo(uint256 tokenId, uint256 salePrice) public view override returns (address receiver, uint256 royaltyAmount) {
        receiver = treasury;
        RoomType rType = rooms[tokenId].roomType;
        if (rType == RoomType.SUITE) {
            royaltyAmount = (salePrice * 1000) / 10000; // 10%
        } else {
            royaltyAmount = (salePrice * 500) / 10000; // 5%
        }
    }

    function _isAuthorized(address owner, address spender, uint256 tokenId) internal view override returns (bool) {
        if (owner == address(this) && spender == marketplaceContract && marketplaceContract != address(0)) {
            return true;
        }
        return super._isAuthorized(owner, spender, tokenId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            require(!paused(), "HotelNFT: Contract paused");
            require(!rooms[tokenId].isCheckedIn, "HotelNFT: Cannot transfer checked-in room");
            require(msg.sender == marketplaceContract, "HotelNFT: Transfers restricted to Marketplace");
        }
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
```

---

### 3.2 Contrato `HotelMarketplace.sol` (+ Pull-over-Push + Anti-evasión)

Marketplace exclusivo que gestiona compras primarias y reventas con liquidación mediante **Pull-over-Push**, control anti-evasión de royalties (`minListingPrice`) y protección anti-reentrancy.

> **Limitación Técnica de Retiro**: El método `withdraw()` transfiere nativo mediante `call{value}`. Está diseñado para clientes operando con wallets de tipo EOA (Externally Owned Accounts). Si un vendedor utiliza un contrato intermediario, este debe implementar `receive()` o `fallback()` adecuadamente para recibir los fondos acumulados.

> **Protección Anti-evasión de Royalties (`minListingPrice`)**: Para evitar ataques de wash-trading y transferencias encubiertas donde dos partes acuerdan un pago privado off-chain y listan on-chain por importes simbólicos (ej. `1 wei`) eludiendo la recaudación de royalties del hotel (5%/10%), el contrato exige `priceInWei >= minListingPrice`. En el script de despliegue (`Deploy.s.sol`) se establece un suelo inicial representativo de `0.01 ether` (POL), configurable en tiempo de ejecución exclusivamente por el `DEFAULT_ADMIN_ROLE` (custodios multisig Gnosis Safe) mediante la función `setMinListingPrice(uint256)`.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {HotelNFT} from "./HotelNFT.sol";

contract HotelMarketplace is ReentrancyGuard, AccessControl, Pausable {
    struct Listing {
        address seller;
        uint256 priceInWei;
        bool active;
    }

    HotelNFT public immutable nftContract;
    uint256 public minListingPrice;

    mapping(uint256 => Listing) public listings;
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
    event MinListingPriceUpdated(uint256 newMinPrice);

    constructor(address _admin, address _nftContract, uint256 _initialMinPrice) {
        require(_admin != address(0), "Marketplace: Zero admin address");
        require(_nftContract != address(0), "Marketplace: Zero NFT address");
        nftContract = HotelNFT(_nftContract);
        minListingPrice = _initialMinPrice;
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    function setMinListingPrice(uint256 _newMinPrice) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minListingPrice = _newMinPrice;
        emit MinListingPriceUpdated(_newMinPrice);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function listForSale(uint256 tokenId, uint256 priceInWei) external nonReentrant whenNotPaused {
        address owner = nftContract.ownerOf(tokenId);
        bool isPrimary = (owner == address(nftContract) &&
            (hasRole(DEFAULT_ADMIN_ROLE, msg.sender) ||
                nftContract.hasRole(nftContract.MINTER_ROLE(), msg.sender) ||
                msg.sender == address(nftContract)));

        if (!isPrimary) {
            require(owner == msg.sender, "Marketplace: Not owner");
            require(
                nftContract.getApproved(tokenId) == address(this) ||
                    nftContract.isApprovedForAll(msg.sender, address(this)),
                "Marketplace: Not approved"
            );
        }

        require(priceInWei >= minListingPrice, "Marketplace: Price below minimum floor");

        (, uint256 checkInTimestamp, , , bool isCheckedIn) = nftContract.rooms(tokenId);
        require(!isCheckedIn, "Marketplace: Room already checked in");
        require(block.timestamp < checkInTimestamp, "Marketplace: Expired night");

        address seller = isPrimary ? address(nftContract) : msg.sender;

        listings[tokenId] = Listing({
            seller: seller,
            priceInWei: priceInWei,
            active: true
        });

        emit NFTListed(tokenId, seller, priceInWei);
    }

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

    function buy(uint256 tokenId) external payable nonReentrant whenNotPaused {
        Listing memory item = listings[tokenId];
        require(item.active, "Marketplace: Not listed");
        require(msg.value == item.priceInWei, "Marketplace: Incorrect payment");

        (, uint256 checkInTimestamp, , , ) = nftContract.rooms(tokenId);
        require(block.timestamp < checkInTimestamp, "Marketplace: Expired night");

        delete listings[tokenId];

        (address royaltyReceiver, uint256 royaltyAmount) = nftContract.royaltyInfo(tokenId, item.priceInWei);

        bool isSecondary = (item.seller != address(nftContract));

        if (isSecondary) {
            pendingWithdrawals[royaltyReceiver] += royaltyAmount;
            pendingWithdrawals[item.seller] += (item.priceInWei - royaltyAmount);
        } else {
            // Venta primaria: el 100% de los ingresos va a la tesorería del hotel
            pendingWithdrawals[royaltyReceiver] += item.priceInWei;
        }

        nftContract.safeTransferFrom(item.seller, msg.sender, tokenId);

        emit NFTSold(tokenId, item.seller, msg.sender, item.priceInWei, isSecondary ? royaltyAmount : item.priceInWei, isSecondary);
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
- **Alerta de Saldo**: Si el balance de la wallet de operador con `BURNER_ROLE` (`HOTEL_OPERATOR_HOT_WALLET`) es `< 5 POL`, se remite alerta inmediata al canal técnico (`DEVOPS_ALERT_EMAIL`) y la ejecución se suspende.
- **Custodia de Claves**: La hot-wallet del operador de servicio (unificando `MINTER_ROLE` y `BURNER_ROLE`) se administra de forma segura en Google Cloud Secret Manager o HashiCorp Vault.

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

> **Protección Anti-Fuerza Bruta y Rate Limiting**: Los endpoints `/auth/login` y `/auth/mfa/verify` implementan un limitador de tasa estricto en Redis con ventana deslizante. Se permite un máximo de **5 intentos fallidos consecutivos en un intervalo de 15 minutos** por combinación de dirección IP y cuenta de usuario. Superado este umbral, el endpoint responde HTTP `429 Too Many Requests` y la cuenta queda bloqueada temporalmente durante 15 minutos, mitigando ataques de fuerza bruta sobre credenciales y códigos numéricos TOTP.

> **Planificación de Endpoints Detallados**: La especificación técnica detallada (payloads JSON y validaciones OpenAPI) de los endpoints pendientes (`POST /auth/mfa/setup` en US-05, `POST /admin/nfts/mint-batch` en US-04/US-16, `GET /admin/analytics` en US-16 y `GET /api/sales/history` en US-17) se formalizará durante el diseño técnico de sus respectivas historias en los Sprints 2 y 3.

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
Response: { 
  "qrPayload": "https://hotel.com/checkin#ticket=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", 
  "tokenId": "0x1a...",
  "expiresAt": "2026-07-21T12:00:00Z" 
}
// El payload utiliza un fragmento hash (#ticket) que no se envía al servidor web y encapsula un JWS compacto
// firmado por el backend con el checkInSecret y tokenId, previniendo fugas en query strings y logs de red.

POST /admin/qr/validate (Protegido - RECEPTION_ROLE con MFA)
Body: { "ticketToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
Response: { "status": "SUCCESS", "roomNumber": 201, "roomType": "SUITE", "guestWallet": "0x123..." }
// Validación Optimista (< 500ms, SLA RNF-03 < 3s): El backend verifica la firma del ticket JWS y el estado en BD
// (status='SOLD' y !isCheckedIn), actualiza atómicamente a 'CHECKED_IN' en PostgreSQL y responde HTTP 200 de inmediato.
// La transacción on-chain markCheckedIn(tokenId) se encola asíncronamente; si revierte, se emite una alerta WebSocket urgente a recepción.

POST /admin/qr/contingency-checkin (Protegido - RECEPTION_ROLE con MFA)
Body: { 
  "roomNumber": 201, 
  "checkInDate": "2026-07-20", 
  "possessionProofType": "WALLET_ADDRESS" | "TX_HASH" | "VOUCHER_CODE",
  "possessionProofValue": "0x71C... o 0xabc...", 
  "reason": "Huésped sin dispositivo móvil / resguardo físico verificado" 
}
Response: { "status": "SUCCESS", "tokenId": "0x1a2b...", "roomNumber": 201 }
// Requiere verificar un factor de posesión (wallet compradora, hash tx Polygonscan o resguardo) antes de marcar check-in on-chain y registrar físicamente en el PMS oficial (RD 933/2021)

GET /api/wallet/pass/:tokenId?type=apple|google
Headers: x-wallet-address, x-signature (EIP-712)
Response: Binario firmado .pkpass (Apple) o URL de objeto Pass (Google Wallet)
// Generado con passkit-generator utilizando Pass Type ID Certificate oficial

POST /api/qr/:tokenId/send-email
Headers: x-wallet-address, x-signature (EIP-712 demostrando posesión del tokenId)
Body: { "email": "huesped@ejemplo.com" }
Response: { "status": "QUEUED", "message": "Resguardo enviado satisfactoriamente" }
// Cumplimiento RGPD (art. 5.1.c): El correo se procesa exclusivamente en memoria para la entrega del PDF/PNG
// y se descarta de forma inmediata, sin persistirse en la base de datos PostgreSQL ni asociarse a la wallet.
```

---

## 5. Esquema de Base de Datos Off-chain

### Tabla: `nfts`
```sql
CREATE TABLE nfts (
    token_id VARCHAR(66) PRIMARY KEY,
    room_number INT NOT NULL,
    room_type VARCHAR(10) NOT NULL, -- SIMPLE, SUITE
    check_in_date DATE NOT NULL,
    base_price_wei NUMERIC(78, 0) NOT NULL,
    status VARCHAR(20) NOT NULL, -- AVAILABLE, CONFIRMING, SOLD, BURNED, CHECKED_IN
    current_owner VARCHAR(42) NOT NULL,
    check_in_secret_enc TEXT NULL, -- AES-256-GCM (clave administrada en Secret Manager)
    minted_at TIMESTAMP NOT NULL,
    checked_in_at TIMESTAMP NULL,
    burned_at TIMESTAMP NULL,
    tx_hash_mint VARCHAR(66) NOT NULL
);
CREATE INDEX idx_nfts_query ON nfts(status, check_in_date, room_type);
CREATE INDEX idx_nfts_room ON nfts(room_number);
CREATE INDEX idx_nfts_owner ON nfts(current_owner);
```

### Tabla: `listings` (Marketplace)
```sql
CREATE TABLE listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id VARCHAR(66) NOT NULL REFERENCES nfts(token_id),
    seller VARCHAR(42) NOT NULL,
    price_in_wei NUMERIC(78, 0) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    listed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMP NULL,
    tx_hash_list VARCHAR(66) NOT NULL
);
CREATE INDEX idx_listings_active_price ON listings(active, price_in_wei);
CREATE INDEX idx_listings_token ON listings(token_id);
```

### Tabla: `sale_events` (Histórico de Ventas y Royalties)
```sql
CREATE TABLE sale_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id VARCHAR(66) NOT NULL REFERENCES nfts(token_id),
    seller VARCHAR(42) NOT NULL,
    buyer VARCHAR(42) NOT NULL,
    price_in_wei NUMERIC(78, 0) NOT NULL,
    royalty_amount_wei NUMERIC(78, 0) NOT NULL DEFAULT 0,
    is_secondary BOOLEAN NOT NULL DEFAULT FALSE,
    tx_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sales_token ON sale_events(token_id);
CREATE INDEX idx_sales_buyer ON sale_events(buyer);
CREATE INDEX idx_sales_timestamp ON sale_events(block_timestamp DESC);
```

### Tabla: `admin_sessions` (Sesiones y Refresh Token Rotation)
```sql
CREATE TABLE admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL, -- DEFAULT_ADMIN_ROLE, RECEPTION_ROLE
    refresh_token_hash VARCHAR(64) NOT NULL, -- SHA-256 del refresh token (RTR)
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sessions_refresh ON admin_sessions(refresh_token_hash);
CREATE INDEX idx_sessions_user_active ON admin_sessions(username, revoked, expires_at);
```

### Tabla: `mfa_recovery_codes` (Códigos de Rescate de Respaldo)
```sql
CREATE TABLE mfa_recovery_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL,
    code_hash VARCHAR(60) NOT NULL, -- bcrypt hash de código de rescate
    used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mfa_codes_user ON mfa_recovery_codes(username, used);
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

### 5.1 Configuración del Pool de Conexiones y Mantenimiento de BD

- **Pool de Conexiones PostgreSQL (pg-pool)**:
  - `max`: **20 conexiones activas simultáneas** (dimensionado para atender los 200 usuarios concurrentes de k6 y los workers backend concurrentes sin saturar PostgreSQL en la VM).
  - `idleTimeoutMillis`: **30.000 ms** (30 segundos).
  - `connectionTimeoutMillis`: **5.000 ms** (5 segundos).
- **Política de Purga y Mantenimiento de Notificaciones**:
  - Un cron job mensual de mantenimiento ejecuta la purga de registros históricos procesados:
    ```sql
    DELETE FROM email_notifications WHERE status = 'SENT' AND created_at < NOW() - INTERVAL '90 days';
    ```
  - Esto garantiza el control del tamaño de almacenamiento y minimización de registros transaccionales en cumplimiento de buenas prácticas operativas y RGPD.

---

## 6. Sincronización y Resiliencia del Event Listener

- **WebSocket Heartbeat**: Ping/pong cada 30 segundos con timeout estricto de **5000ms**. Tras 2 fallos consecutivos, conmuta inmediatamente al RPC de respaldo (Infura).
- **Alerta de Silencio en Red**: Dado que la red Polygon produce bloques cada ~2 segundos y que un hotel de 50 habitaciones puede experimentar horas valle sin transacciones, el Event Listener monitorea la suscripción a cabeceras de bloques (`newHeads`). Si transcurren más de 10 minutos (~300 bloques omitidos) sin recibir un nuevo bloque, se considera congelada la conexión RPC y se despacha una notificación de alerta crítica a `DEVOPS_ALERT_EMAIL` forzando la reconexión al nodo de respaldo.
- **Profundidad de Confirmaciones y Protección contra Reorganizaciones (Reorgs)**: Para prevenir asentar reservas basadas en bloques huérfanos producidos por reorganizaciones de cadena en Polygon PoS, el Event Listener procesa eventos transaccionales con una profundidad de **32 confirmaciones de bloque** (~64 segundos). En el frontend y API, la reserva se reporta transitoriamente en estado `CONFIRMING` para brindar retroalimentación inmediata al comprador, transitando formalmente a `SOLD` y generando el `checkInSecret` definitivo únicamente al alcanzar los 32 bloques de profundidad.
- **Paginación y Chunking de Reconciliación (`eth_getLogs`)**: Tras caídas de servicio o paradas de mantenimiento prolongadas, la reconciliación histórica desde `lastBlockProcessed` hasta el bloque actual divide el rango en fragmentos (chunks) de un **máximo estricto de 2.000 bloques por llamada**. Cada llamada implementa reintentos con retroceso exponencial (backoff de 500ms, 1s, 2s, 4s) para cumplir con los límites de peticiones (rate limits) y restricciones de respuesta de proveedores RPC (Alchemy/Infura).
- **Reconciliación y Deduplicación de Notificaciones (BullMQ)**: Un cron backend consulta periódicamente registros con `status = 'PENDING'` en `email_notifications` con antigüedad > 5 minutos para re-encolarlos automáticamente ante caídas imprevistas de Redis. Para garantizar idempotencia y prevenir envíos duplicados de correo, todos los trabajos se encolan con `jobId = notification.id` (UUID de base de datos), asegurando deduplicación nativa en BullMQ.

---

## 7. Plan de Pruebas y Compuertas de Calidad (DoD)

- [ ] Cobertura de código unitario e integración **≥ 80%** unificada.
- [ ] Ejecución en pipeline CI de `slither .` sin vulnerabilidades de severidad **HIGH** o **CRITICAL** para todo commit o pull request que incluya contratos inteligentes.
- [ ] Validación de compilación y despliegues mediante Foundry en GCP.
- [ ] Health checks funcionales `/health/live` y `/health/ready` respondiendo en staging.
- [ ] Prevención de reventa confirmada en pruebas Foundry tras invocar `markCheckedIn()`.

---
*SRS v1.3.0 — Aprobado formalmente tras incorporar las 21 resoluciones de auditoría.*

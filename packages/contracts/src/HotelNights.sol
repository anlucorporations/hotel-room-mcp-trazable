// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {
    ERC721URIStorage
} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

import {IHotelNights} from "./IHotelNights.sol";
import {DateLib} from "./libraries/DateLib.sol";
import {RoomMaster} from "./libraries/RoomMaster.sol";

/**
 * @title HotelNights — noches de hotel como NFTs (Hotel Marina del Sol)
 * @notice Cada NFT es una noche (habitación × fecha). FASE 1: minteo al inventario del hotel
 *         y venta primaria (100 % a tesorería, sin royalty). El mercado secundario con
 *         royalty (pull payments), pausa, withdraw y burn llegan en FASE 2.
 *
 * Seguridad (RNF-14): CEI + `nonReentrant` en `buy`; guard de transferencias con transient
 * storage (EIP-1153, ADR-07) que bloquea `transferFrom` directos (`DirectTransferDisabled`);
 * validación de inputs en `mint`; `Pausable`.
 *
 * @dev D-06 (royalty inmutable por construcción): `royaltyInfo` NO lee configuración alguna;
 *      deriva el tipo de la habitación del `tokenId` con `RoomMaster` y aplica 500 bps (5 %) a
 *      simple/doble (101–130) y 1000 bps (10 %) a suite (201–220), con `treasury` como
 *      receptor. No existe almacenamiento, setter ni rol de royalty: nadie puede alterarlo.
 *      El suelo de reventa (`minListingPrice`) sí es gobernable por `DEFAULT_ADMIN_ROLE`.
 *
 * @dev AUTORIDAD (MAJOR#1, opción B): `owner()` (de `Ownable2Step`) es **meramente
 *      informativo** y NO gobierna ninguna función de negocio — ninguna usa el modificador
 *      `onlyOwner`. El control real recae en `AccessControl`: `DEFAULT_ADMIN_ROLE` administra
 *      todos los roles, `setTreasury` y `setMinListingPrice`, y cada operación restringida
 *      exige su rol específico (`MINTER_ROLE`, `RECEPTION_ROLE`, `PAUSER_ROLE`,
 *      `BURNER_ROLE`, `TREASURER_ROLE`).
 *      Por tanto, `transferOwnership`/`acceptOwnership` NO ceden el control del contrato: la
 *      cesión REAL de gobernanza se hace concediendo `DEFAULT_ADMIN_ROLE` al nuevo admin
 *      (`grantRole`) y renunciando el antiguo (`renounceRole`). Se conserva `Ownable2Step`
 *      por compatibilidad con herramientas/marketplaces que leen `owner()`; la UI aclara su
 *      carácter informativo en otra ola de trabajo.
 */
contract HotelNights is
    IHotelNights,
    ERC721URIStorage,
    ERC2981,
    AccessControl,
    Pausable,
    ReentrancyGuard,
    Ownable2Step
{
    using RoomMaster for uint256;

    // ── Roles (ADR-06) ────────────────────────────────────────────────────────
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant RECEPTION_ROLE = keccak256("RECEPTION_ROLE"); // D-05: check-in
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");

    // ── Límites de configuración ───────────────────────────────────────────────
    uint256 public constant BURN_BATCH_MAX = 50; // CU-13 (docs/SRS.md §9)

    /// @dev D-06: suelo inicial de reventa, fijado por construcción. El valor vigente
    ///      (`minListingPrice`) arranca aquí; `DEFAULT_ADMIN_ROLE` puede ajustarlo después.
    uint256 public constant DEFAULT_MIN_LISTING_PRICE = 0.01 ether;

    /// @dev D-06: royalty por TIPO de habitación (RF-08), inmutable por construcción.
    uint96 private constant ROYALTY_BPS_STANDARD = 500; // 5 %: simple y doble (101–130)
    uint96 private constant ROYALTY_BPS_SUITE = 1000; // 10 %: suite (201–220)

    /// @dev Tipo "suite" del maestro (RF-18a/ADR-02), resuelto vía `RoomMaster.roomType`.
    bytes32 private constant SUITE_TYPE_HASH = keccak256("suite");

    /// @dev `tokenId = room · ROOM_MULTIPLIER + AAAAMMDD` (Decisión 3).
    uint256 private constant ROOM_MULTIPLIER = 100_000_000;

    /// @dev Slot de almacenamiento transitorio (EIP-1153) del guard de transferencias.
    ///      Literal = keccak256("hotelnights.transfer.guard.v1") (el assembly exige constante numérica).
    uint256 private constant TRANSFER_GUARD_SLOT =
        0x313242c84e2cbee060723c1ebf1632290121b39b24413eed484819ba30f22f9c;

    // ── Estado ─────────────────────────────────────────────────────────────────
    /// @inheritdoc IHotelNights
    address public override treasury;

    /// @inheritdoc IHotelNights
    uint256 public override minListingPrice = DEFAULT_MIN_LISTING_PRICE;

    mapping(uint256 tokenId => uint256 priceWei) private _price;
    mapping(uint256 tokenId => bool sold) private _soldOnce;

    /// @dev D-05: noche consumida por check-in on-chain (RECEPTION). Una vez marcada no se
    ///      puede listar ni revender: es el ancla irreversible anti-doble-gasto del hotel.
    mapping(uint256 tokenId => bool checkedIn) private _checkedIn;

    // Mercado secundario (FASE 2)
    mapping(uint256 tokenId => Listing) private _listings;
    mapping(address account => uint256 amount) private _pending; // pull payments (ADR-15)
    uint256 private _totalPending; // suma de _pending: protege los fondos de usuarios en withdraw

    /**
     * @param treasury_ Receptor de la venta primaria y del royalty ERC-2981.
     * @dev El segundo argumento (bps de royalty) que existía por compatibilidad **se eliminó**:
     *      el royalty se deriva del tipo de habitación y es inmutable (D-06), así que un
     *      parámetro que no hacía nada era una trampa para quien leyera el despliegue.
     */
    constructor(address treasury_)
        ERC721("Hotel Marina del Sol Nights", "HMSN")
        Ownable(msg.sender)
    {
        if (treasury_ == address(0)) {
            revert ZeroAddress();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        treasury = treasury_;
        emit TreasuryUpdated(address(0), treasury_);
    }

    // ── Minteo (CU-02) ──────────────────────────────────────────────────────────
    /// @inheritdoc IHotelNights
    function mint(uint256 room, uint256 dateYYYYMMDD, uint256 price, string calldata metadataURI)
        external
        override
        onlyRole(MINTER_ROLE)
        whenNotPaused
        returns (uint256 tokenId)
    {
        if (!room.isInMaster()) revert RoomNotInMaster(room);
        if (!DateLib.isInRange(dateYYYYMMDD)) revert InvalidDate();
        if (price == 0) revert InvalidPrice();
        if (dateYYYYMMDD < _todayYYYYMMDD()) revert PastDate();

        tokenId = room * ROOM_MULTIPLIER + dateYYYYMMDD;
        if (_ownerOf(tokenId) != address(0)) revert DuplicateNight(tokenId);

        _price[tokenId] = price;
        _mint(treasury, tokenId); // inventario del hotel (ADR-16); `_mint` evita el receiver check
        _setTokenURI(tokenId, metadataURI); // CID fijado: `tokenURI` resoluble desde este bloque

        emit Mint(tokenId, room, dateYYYYMMDD, room.roomType(), price);
    }

    // ── Compra primaria (CU-05) ──────────────────────────────────────────────────
    /// @inheritdoc IHotelNights
    function buy(uint256 tokenId) external payable override nonReentrant whenNotPaused {
        address seller = _ownerOf(tokenId);
        if (seller == address(0) || _soldOnce[tokenId]) revert NightNotAvailable(tokenId);
        // D-05: una noche ya consumida (check-in) no vuelve a venderse ni siquiera como primaria.
        // Sin este guard, recepción podía cerrar una noche de inventario (walk-in) y esa misma
        // noche seguía siendo comprable en la tienda: la garantía de "no doble uso" quedaba a
        // medias. `list`/`buyResale` ya la bloquean por la vía secundaria.
        if (_checkedIn[tokenId]) revert NightNotAvailable(tokenId);
        if (_isExpired(tokenId)) revert NightExpired(tokenId);

        uint256 price = _price[tokenId];
        if (msg.value != price) revert IncorrectPayment(price, msg.value);

        // Effects (CEI): marcar vendida antes de cualquier interacción.
        _soldOnce[tokenId] = true;
        // Higiene de estado (MINOR#1): el inventario del hotel no debería tener listados, pero
        // si alguno sobreviviera no debe persistir tras la primaria — el nuevo dueño no hereda
        // un listado ajeno. `list()` ya exige `soldOnce`, así que esto es defensa en profundidad.
        delete _listings[tokenId];
        emit Sale(tokenId, seller, msg.sender, price, SaleType.PRIMARY);

        // Interaction 1: transferir el NFT (autorizado por el guard transient).
        _unlockTransfer();
        _safeTransfer(seller, msg.sender, tokenId, "");

        // Interaction 2: 100 % del importe a tesorería (la primaria no paga royalty).
        // `treasury` DEBE poder recibir ETH (EOA o Safe); un contrato que revierta en
        // `receive` bloquearía la primaria hasta un `setTreasury` (riesgo bajo: es el hotel).
        (bool ok,) = payable(treasury).call{value: price}("");
        if (!ok) revert EthTransferFailed();
    }

    // ── Check-in on-chain (D-05) ───────────────────────────────────────────────
    /**
     * @inheritdoc IHotelNights
     * @dev Ancla irreversible: recepción marca la noche como consumida. A partir de ahí la
     *      noche no puede listarse ni revenderse (ver `list`/`buyResale`). El token debe
     *      existir (mismo patrón que `buy`: `NightNotAvailable` si no hay dueño) **y haber
     *      tenido venta primaria**: el check-in acredita el consumo de una noche vendida, no es
     *      una vía para bloquear inventario del hotel, que quedaría invendible para siempre
     *      porque el marcado es irreversible.
     */
    function markCheckedIn(uint256 tokenId)
        external
        override
        onlyRole(RECEPTION_ROLE)
        whenNotPaused
    {
        if (_ownerOf(tokenId) == address(0)) revert NightNotAvailable(tokenId);
        if (!_soldOnce[tokenId]) revert NightNotSold(tokenId);
        if (_checkedIn[tokenId]) revert AlreadyCheckedIn(tokenId);

        _checkedIn[tokenId] = true;
        emit CheckedIn(tokenId, msg.sender, block.timestamp);
    }

    // ── Mercado secundario (CU-06/07) ─────────────────────────────────────────
    /// @inheritdoc IHotelNights
    function list(uint256 tokenId, uint256 price) external override {
        if (_ownerOf(tokenId) != msg.sender) revert NotOwner();
        // D-05: una noche ya consumida (check-in) no vuelve al mercado.
        if (_checkedIn[tokenId]) revert NightNotResellable(tokenId);
        // Solo se revende desde EN_PODER_CLIENTE (MINOR#5, docs/SRS.md §9): una noche que aún no tuvo
        // venta primaria es inventario DISPONIBLE del hotel y NO debe entrar por la vía SECONDARY.
        if (!_soldOnce[tokenId]) revert NightNotResellable(tokenId);
        if (price == 0) revert InvalidPrice();
        // D-06: suelo anti-evasión de royalty. Se evalúa al listar (el precio del listado queda
        // congelado hasta que el vendedor lo sobrescriba).
        if (price < minListingPrice) revert PriceBelowMinimum(price, minListingPrice);
        if (_isExpired(tokenId)) revert NightExpired(tokenId);

        _listings[tokenId] = Listing({price: price, active: true});
        emit Listed(tokenId, msg.sender, price);
    }

    /// @inheritdoc IHotelNights
    function unlist(uint256 tokenId) external override {
        if (_ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (!_listings[tokenId].active) revert NotListed(tokenId);

        delete _listings[tokenId];
        emit Unlisted(tokenId);
    }

    /// @inheritdoc IHotelNights
    function buyResale(uint256 tokenId) external payable override nonReentrant whenNotPaused {
        Listing memory listing = _listings[tokenId];
        if (!listing.active) revert NotListed(tokenId);
        // D-05: si la noche se consumió (check-in) después de listarse, la reventa se bloquea
        // (mismo error que `list`: la noche ha dejado de ser revendible).
        if (_checkedIn[tokenId]) revert NightNotResellable(tokenId);
        if (_isExpired(tokenId)) revert NightExpired(tokenId);
        if (msg.value != listing.price) revert IncorrectPayment(listing.price, msg.value);

        address seller = _ownerOf(tokenId);
        // Royalty fuente única (ERC-2981, D-06): la MISMA función pública `royaltyInfo` que
        // consultan los marketplaces externos. `buyResale` no duplica la fórmula ni el tipo.
        (address royaltyReceiver, uint256 royaltyAmount) = royaltyInfo(tokenId, listing.price);
        uint256 sellerProceeds = listing.price - royaltyAmount;

        // Effects (CEI): cerrar listado, marcar vendida y acreditar pagos (pull, ADR-15).
        delete _listings[tokenId];
        _soldOnce[tokenId] = true; // ya cambió de manos: nunca burnable como inventario del hotel
        _credit(seller, sellerProceeds);
        _credit(royaltyReceiver, royaltyAmount);
        emit Sale(tokenId, seller, msg.sender, listing.price, SaleType.SECONDARY);
        emit RoyaltyPaid(tokenId, royaltyReceiver, royaltyAmount);

        // Interaction: transferir el NFT (autorizado por el guard transient).
        _unlockTransfer();
        _safeTransfer(seller, msg.sender, tokenId, "");
    }

    /// @inheritdoc IHotelNights
    function claim() external override nonReentrant {
        uint256 amount = _pending[msg.sender];
        if (amount == 0) revert NoFunds();

        _pending[msg.sender] = 0; // effects antes de la interacción (CEI)
        _totalPending -= amount;

        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }

    // ── Caducidad y burn (CU-13) ──────────────────────────────────────────────
    /// @inheritdoc IHotelNights
    function burnExpired(uint256[] calldata tokenIds)
        external
        override
        onlyRole(BURNER_ROLE)
        whenNotPaused
    {
        uint256 count = tokenIds.length;
        if (count > BURN_BATCH_MAX) revert BatchTooLarge(count, BURN_BATCH_MAX);

        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = tokenIds[i];
            if (_soldOnce[tokenId]) revert AlreadySold(tokenId); // noche de cliente: no se quema
            if (!_isExpired(tokenId)) revert NotExpired(tokenId);

            delete _listings[tokenId];
            _burn(tokenId);
            emit Burn(tokenId);
        }
    }

    // ── Administración (CU-12/14/15/16) ───────────────────────────────────────
    /// @inheritdoc IHotelNights
    function setMinListingPrice(uint256 newPrice) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        // Cota inferior: un suelo de 0 equivaldría a desactivar la protección anti-elusión de
        // royalties (D-06) con una sola transacción, que es justo lo que se quiere evitar.
        if (newPrice == 0) revert InvalidPrice();
        minListingPrice = newPrice;
        emit MinListingPriceUpdated(newPrice);
    }

    /// @inheritdoc IHotelNights
    function pause() external override onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @inheritdoc IHotelNights
    function unpause() external override onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /// @inheritdoc IHotelNights
    function withdraw() external override onlyRole(TREASURER_ROLE) nonReentrant {
        // Solo el saldo residual: los fondos de reventas (pull) quedan reservados a sus dueños.
        uint256 amount = address(this).balance - _totalPending;
        if (amount == 0) revert NoFunds();

        (bool ok,) = payable(treasury).call{value: amount}("");
        if (!ok) revert EthTransferFailed();
        emit Withdrawn(treasury, amount);
    }

    /// @inheritdoc IHotelNights
    function setTreasury(address newTreasury) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        address oldTreasury = treasury;
        treasury = newTreasury;
        // El royalty no se almacena: `royaltyInfo` lee `treasury` en cada consulta, así que el
        // cambio de receptor es inmediato y no requiere sincronizar nada (D-06).
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    function _credit(address account, uint256 amount) private {
        if (amount == 0) return;
        _pending[account] += amount;
        _totalPending += amount;
    }

    // ── Vistas ────────────────────────────────────────────────────────────────
    /// @inheritdoc IHotelNights
    function priceOf(uint256 tokenId) external view override returns (uint256) {
        return _price[tokenId];
    }

    /// @inheritdoc IHotelNights
    function soldOnce(uint256 tokenId) external view override returns (bool) {
        return _soldOnce[tokenId];
    }

    /// @inheritdoc IHotelNights
    function isCheckedIn(uint256 tokenId) external view override returns (bool) {
        return _checkedIn[tokenId];
    }

    /// @inheritdoc IHotelNights
    function isExpired(uint256 tokenId) external view override returns (bool) {
        return _isExpired(tokenId);
    }

    /// @inheritdoc IHotelNights
    function listingOf(uint256 tokenId) external view override returns (Listing memory) {
        return _listings[tokenId];
    }

    /// @inheritdoc IHotelNights
    function pendingWithdrawals(address account) external view override returns (uint256) {
        return _pending[account];
    }

    /// @inheritdoc IHotelNights
    function totalPending() external view override returns (uint256) {
        return _totalPending;
    }

    /// @inheritdoc IHotelNights
    function burnBatchMax() public pure override returns (uint256) {
        return BURN_BATCH_MAX;
    }

    /// @inheritdoc IHotelNights
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        public
        view
        override(ERC2981, IHotelNights)
        returns (address receiver, uint256 royaltyAmount)
    {
        receiver = treasury;
        royaltyAmount = (salePrice * _royaltyBpsOf(tokenId)) / _feeDenominator();
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, ERC2981, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // ── Internos ─────────────────────────────────────────────────────────────────
    /**
     * @dev Guard de transferencias (ADR-07). Mint (`from==0`) y burn (`to==0`) se permiten;
     *      una transferencia real exige que `buy`/`buyResale` hayan puesto la marca transient
     *      justo antes (se consume aquí, de modo que cada desbloqueo autoriza un único
     *      movimiento). Al ser transient, se autolimpia al final de la tx incluso si revierte.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721)
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            if (!_isTransferUnlocked()) revert DirectTransferDisabled();
            _consumeTransferUnlock();
        }
        return super._update(to, tokenId, auth);
    }

    function _todayYYYYMMDD() private view returns (uint256) {
        return DateLib.todayYYYYMMDD(block.timestamp);
    }

    function _isExpired(uint256 tokenId) private view returns (bool) {
        return (tokenId % ROOM_MULTIPLIER) < _todayYYYYMMDD();
    }

    /**
     * @dev D-06: bps del royalty derivados del TIPO de la habitación, con `RoomMaster` como
     *      fuente única del maestro (no se duplican rangos). Un `tokenId` cuya habitación no
     *      pertenece al maestro (p. ej. inexistente) devuelve 0 bps en vez de revertir:
     *      `royaltyInfo` es una vista ERC-2981 que los marketplaces pueden consultar con
     *      cualquier id.
     */
    function _royaltyBpsOf(uint256 tokenId) private pure returns (uint96) {
        uint256 room = tokenId / ROOM_MULTIPLIER;
        if (!room.isInMaster()) return 0;
        if (keccak256(bytes(room.roomType())) == SUITE_TYPE_HASH) return ROYALTY_BPS_SUITE;
        return ROYALTY_BPS_STANDARD; // simple y doble comparten 5 % (RF-08/D-06)
    }

    function _unlockTransfer() private {
        assembly {
            tstore(TRANSFER_GUARD_SLOT, 1)
        }
    }

    function _consumeTransferUnlock() private {
        assembly {
            tstore(TRANSFER_GUARD_SLOT, 0)
        }
    }

    function _isTransferUnlocked() private view returns (bool unlocked) {
        assembly {
            unlocked := tload(TRANSFER_GUARD_SLOT)
        }
    }
}

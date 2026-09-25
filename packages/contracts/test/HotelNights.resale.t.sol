// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {HotelNights} from "../src/HotelNights.sol";
import {IHotelNights} from "../src/IHotelNights.sol";

/// @notice Reintenta `buyResale` al recibir el NFT (CU-07 reentrancy, docs/SRS.md §9).
contract ReentrantResaleBuyer is IERC721Receiver {
    HotelNights private immutable NFT;
    uint256 private tokenId;
    uint256 private price;

    constructor(HotelNights nft_) {
        NFT = nft_;
    }

    function attack(uint256 tokenId_, uint256 price_) external {
        tokenId = tokenId_;
        price = price_;
        NFT.buyResale{value: price_}(tokenId_);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        NFT.buyResale{value: price}(tokenId);
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {}
}

/// @notice Receptor de royalty que rechaza ETH (CU-07: no debe bloquear la reventa con pull).
contract RejectingReceiver {
    receive() external payable {
        revert("rechazo ETH");
    }
}

/// @notice Vendedor hostil: posee y revende el NFT pero rechaza ETH en `claim` (MINOR#7).
///         Implementa `onERC721Received` para poder recibir el NFT vía `buy`.
contract HostileClaimer is IERC721Receiver {
    HotelNights private immutable NFT;
    bool public reject = true;

    constructor(HotelNights nft_) {
        NFT = nft_;
    }

    function doBuy(uint256 tokenId, uint256 price) external payable {
        NFT.buy{value: price}(tokenId);
    }

    function doList(uint256 tokenId, uint256 price) external {
        NFT.list(tokenId, price);
    }

    function doClaim() external {
        NFT.claim();
    }

    /// @notice Permite desactivar el rechazo para verificar que el saldo seguía intacto.
    function allowEth() external {
        reject = false;
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {
        if (reject) revert("claim rechazado");
    }
}

/// @notice CU-06/07 — Listar/cancelar reventa y comprar reventa con royalty (pull).
contract HotelNightsResaleTest is Test {
    HotelNights internal nft;

    address internal treasury = makeAddr("treasury");
    address internal minter = makeAddr("minter");
    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");
    address internal stranger = makeAddr("stranger");
    uint256 internal constant ROOM = 102;
    uint256 internal constant DATE = 20_260_615;
    uint256 internal constant PRICE = 0.5 ether;
    uint256 internal constant RESALE = 1 ether;
    uint256 internal constant TOKEN_ID = 10_220_260_615;
    uint256 internal constant BASE_TS = 1_780_272_000; // 2026-06-01
    uint256 internal constant AFTER_TS = 1_781_913_600; // 2026-06-20
    string internal constant URI = "ipfs://x";

    function setUp() public {
        vm.warp(BASE_TS);
        nft = new HotelNights(treasury);
        nft.grantRole(nft.MINTER_ROLE(), minter);
        vm.prank(minter);
        nft.mint(ROOM, DATE, PRICE, URI);
        // `seller` compra la primaria y queda como propietario.
        vm.deal(seller, PRICE);
        vm.prank(seller);
        nft.buy{value: PRICE}(TOKEN_ID);
    }

    function _list(uint256 price) internal {
        vm.prank(seller);
        nft.list(TOKEN_ID, price);
    }

    // ── CU-06: listar / cancelar ──────────────────────────────────────────────
    function test_ListAndUnlist() public {
        vm.expectEmit(true, true, false, true, address(nft));
        emit IHotelNights.Listed(TOKEN_ID, seller, RESALE);
        _list(RESALE);

        IHotelNights.Listing memory l = nft.listingOf(TOKEN_ID);
        assertTrue(l.active);
        assertEq(l.price, RESALE);

        vm.expectEmit(true, false, false, false, address(nft));
        emit IHotelNights.Unlisted(TOKEN_ID);
        vm.prank(seller);
        nft.unlist(TOKEN_ID);
        assertFalse(nft.listingOf(TOKEN_ID).active);
    }

    function test_ListNotOwnerReverts() public {
        vm.prank(stranger);
        vm.expectRevert(IHotelNights.NotOwner.selector);
        nft.list(TOKEN_ID, RESALE);
    }

    function test_ListZeroPriceReverts() public {
        vm.prank(seller);
        vm.expectRevert(IHotelNights.InvalidPrice.selector);
        nft.list(TOKEN_ID, 0);
    }

    // ── D-06: suelo de precio en reventa ──────────────────────────────────────
    function test_MinListingPriceStartsAtDefaultConstant() public view {
        assertEq(nft.minListingPrice(), nft.DEFAULT_MIN_LISTING_PRICE());
        assertEq(nft.minListingPrice(), 0.01 ether);
    }

    function test_ListBelowMinListingPriceReverts() public {
        uint256 min = nft.minListingPrice();
        vm.prank(seller);
        vm.expectRevert(
            abi.encodeWithSelector(IHotelNights.PriceBelowMinimum.selector, min - 1, min)
        );
        nft.list(TOKEN_ID, min - 1);
        assertFalse(nft.listingOf(TOKEN_ID).active);
    }

    function test_ListAtMinListingPriceSucceeds() public {
        uint256 min = nft.minListingPrice();
        _list(min); // el suelo es inclusivo (price >= minListingPrice)
        assertEq(nft.listingOf(TOKEN_ID).price, min);
    }

    function test_AdminCanChangeMinListingPrice() public {
        uint256 newMin = 0.25 ether; // address(this) es DEFAULT_ADMIN
        vm.expectEmit(false, false, false, true, address(nft));
        emit IHotelNights.MinListingPriceUpdated(newMin);
        nft.setMinListingPrice(newMin);
        assertEq(nft.minListingPrice(), newMin);
    }

    /// @notice D-06: el suelo no puede bajarse a 0, porque desactivaría con una sola transacción
    ///         la protección anti-elusión de royalties que el propio suelo existe para dar.
    function test_SetMinListingPriceRejectsZero() public {
        uint256 before = nft.minListingPrice();

        vm.expectRevert(IHotelNights.InvalidPrice.selector);
        nft.setMinListingPrice(0);

        assertEq(nft.minListingPrice(), before, "el suelo no cambia");
    }

    function test_SetMinListingPriceRequiresAdmin() public {
        bytes32 role = nft.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role
            )
        );
        nft.setMinListingPrice(1 ether);
    }

    function test_PreviouslyValidPriceRevertsAfterRaise() public {
        _list(RESALE); // 1 ether: válido con el suelo inicial (0.01 ether)

        uint256 newMin = 2 ether;
        nft.setMinListingPrice(newMin);

        // Un precio antes válido (1 ether) queda por debajo del nuevo suelo.
        vm.prank(seller);
        vm.expectRevert(
            abi.encodeWithSelector(IHotelNights.PriceBelowMinimum.selector, RESALE, newMin)
        );
        nft.list(TOKEN_ID, RESALE);

        // El revert no altera el listado vigente (sigue a 1 ether).
        assertEq(nft.listingOf(TOKEN_ID).price, RESALE);
        assertTrue(nft.listingOf(TOKEN_ID).active);
    }

    function test_ListExpiredReverts() public {
        vm.warp(AFTER_TS);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.NightExpired.selector, TOKEN_ID));
        nft.list(TOKEN_ID, RESALE);
    }

    // ── MINOR#5: solo se revende desde EN_PODER_CLIENTE (soldOnce) ─────────────
    function test_ListRequiresSoldOnce() public {
        // Noche recién minteada en el inventario del hotel (DISPONIBLE, sin venta primaria):
        // el tesoro NO puede listarla por la vía SECONDARY.
        uint256 freshDate = 20_260_616;
        uint256 freshTokenId = ROOM * 100_000_000 + freshDate;
        vm.prank(minter);
        nft.mint(ROOM, freshDate, PRICE, URI);

        assertFalse(nft.soldOnce(freshTokenId));
        vm.prank(treasury);
        vm.expectRevert(
            abi.encodeWithSelector(IHotelNights.NightNotResellable.selector, freshTokenId)
        );
        nft.list(freshTokenId, RESALE);
    }

    // ── MINOR#1: ningún listado sobrevive a la compra primaria ────────────────
    function test_PrimaryBuyClearsAnyStaleListing() public {
        // Noche fresca: tras la primaria, su listado debe quedar inactivo (defensa en profundidad).
        uint256 freshDate = 20_260_617;
        uint256 freshTokenId = ROOM * 100_000_000 + freshDate;
        vm.prank(minter);
        nft.mint(ROOM, freshDate, PRICE, URI);

        address client = makeAddr("clientFresh");
        vm.deal(client, PRICE);
        vm.prank(client);
        nft.buy{value: PRICE}(freshTokenId);

        // El nuevo dueño no hereda ningún listado.
        assertFalse(nft.listingOf(freshTokenId).active);
        // Y ahora sí, como EN_PODER_CLIENTE, puede listar.
        vm.prank(client);
        nft.list(freshTokenId, RESALE);
        assertTrue(nft.listingOf(freshTokenId).active);
    }

    // ── MINOR#8: re-listar (sobrescribir listado) y royalty inmutable entre list y buyResale ──
    function test_RelistOverwritesPrice() public {
        _list(RESALE);
        assertEq(nft.listingOf(TOKEN_ID).price, RESALE);

        // Re-listar sin cancelar: sobrescribe el precio del listado activo.
        uint256 newPrice = 2 ether;
        vm.expectEmit(true, true, false, true, address(nft));
        emit IHotelNights.Listed(TOKEN_ID, seller, newPrice);
        vm.prank(seller);
        nft.list(TOKEN_ID, newPrice);

        IHotelNights.Listing memory l = nft.listingOf(TOKEN_ID);
        assertTrue(l.active);
        assertEq(l.price, newPrice);

        // El comprador paga el precio vigente (el antiguo ya no es válido).
        vm.deal(buyer, RESALE);
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(IHotelNights.IncorrectPayment.selector, newPrice, RESALE)
        );
        nft.buyResale{value: RESALE}(TOKEN_ID);
    }

    /// @notice D-06: el royalty ya no es gobernable, así que no puede cambiar entre `list` y
    ///         `buyResale`: lo fija el tipo de la habitación (102 ⇒ simple ⇒ 5 %).
    function test_RoyaltyCannotBeChangedBetweenListAndBuyResale() public {
        _list(RESALE);

        // No queda ninguna superficie de gobernanza del royalty que un admin pueda invocar.
        (bool setterOk,) =
            address(nft).call(abi.encodeWithSignature("setRoyaltyBps(uint96)", uint96(2000)));
        assertFalse(setterOk, "setRoyaltyBps no debe existir");

        vm.deal(buyer, RESALE);
        vm.expectEmit(true, true, false, true, address(nft));
        emit IHotelNights.RoyaltyPaid(TOKEN_ID, treasury, 0.05 ether); // 5 % de 1 ether
        vm.prank(buyer);
        nft.buyResale{value: RESALE}(TOKEN_ID);

        assertEq(nft.pendingWithdrawals(treasury), 0.05 ether);
        assertEq(nft.pendingWithdrawals(seller), 0.95 ether);
        assertEq(nft.pendingWithdrawals(treasury) + nft.pendingWithdrawals(seller), RESALE);
    }

    function test_UnlistNotListedReverts() public {
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.NotListed.selector, TOKEN_ID));
        nft.unlist(TOKEN_ID);
    }

    // ── CU-07: comprar reventa ────────────────────────────────────────────────
    function test_BuyResaleSplitsRoyaltyViaPull() public {
        _list(RESALE);
        vm.deal(buyer, RESALE);

        vm.expectEmit(true, true, true, true, address(nft));
        emit IHotelNights.Sale(TOKEN_ID, seller, buyer, RESALE, IHotelNights.SaleType.SECONDARY);
        vm.expectEmit(true, true, false, true, address(nft));
        emit IHotelNights.RoyaltyPaid(TOKEN_ID, treasury, 0.05 ether); // 5 % (hab. 102 = simple)

        vm.prank(buyer);
        nft.buyResale{value: RESALE}(TOKEN_ID);

        assertEq(nft.ownerOf(TOKEN_ID), buyer);
        assertTrue(nft.soldOnce(TOKEN_ID));
        assertFalse(nft.listingOf(TOKEN_ID).active);
        // Pull: acreditado, no enviado.
        assertEq(nft.pendingWithdrawals(seller), 0.95 ether);
        assertEq(nft.pendingWithdrawals(treasury), 0.05 ether);
        assertEq(address(nft).balance, RESALE);

        // claim del vendedor.
        uint256 before = seller.balance;
        vm.prank(seller);
        nft.claim();
        assertEq(seller.balance, before + 0.95 ether);
        assertEq(nft.pendingWithdrawals(seller), 0);
    }

    /// @notice MAJOR#2 — Fuzz del reparto: para cualquier precio, royalty + proceeds == price
    ///         (incluidos precios en wei no divisibles por bps). Sin wei atrapados.
    function testFuzz_BuyResaleSplit(uint256 price) public {
        price = bound(price, nft.minListingPrice(), 1_000_000 ether);
        _list(price);

        (, uint256 expectedRoyalty) = nft.royaltyInfo(TOKEN_ID, price);
        vm.deal(buyer, price);
        vm.prank(buyer);
        nft.buyResale{value: price}(TOKEN_ID);

        uint256 royalty = nft.pendingWithdrawals(treasury);
        uint256 proceeds = nft.pendingWithdrawals(seller);
        assertEq(royalty, expectedRoyalty);
        assertEq(royalty + proceeds, price); // reparto exacto, sin residuo
        assertEq(nft.totalPending(), price); // agregado coherente
        assertEq(address(nft).balance, price); // balance cubre los fondos pull
    }

    function test_RoyaltyNonDivisibleKeepsExactSum() public {
        // Precio por encima del suelo y NO divisible exactamente por 20 (5 % en simple): el
        // truncado debe dejar el reparto exacto, sin wei atrapados en el contrato.
        uint256 price = nft.minListingPrice() + 1; // 0.01 ether + 1 wei
        _list(price);
        vm.deal(buyer, price);
        vm.prank(buyer);
        nft.buyResale{value: price}(TOKEN_ID);

        uint256 royalty = nft.pendingWithdrawals(treasury);
        uint256 proceeds = nft.pendingWithdrawals(seller);
        assertEq(royalty, (price * 500) / 10_000); // truncado
        assertEq(royalty, 500_000_000_000_000); // (1e16 + 1) / 20 ⇒ se descarta 1 wei
        assertEq(proceeds, price - royalty);
        assertEq(royalty + proceeds, price); // sin wei atrapados
        assertEq(address(nft).balance, price);
    }

    function test_BuyResaleIncorrectPaymentReverts() public {
        _list(RESALE);
        vm.deal(buyer, RESALE);
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(IHotelNights.IncorrectPayment.selector, RESALE, 0.5 ether)
        );
        nft.buyResale{value: 0.5 ether}(TOKEN_ID);
    }

    function test_BuyResaleNotListedReverts() public {
        vm.deal(buyer, RESALE);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.NotListed.selector, TOKEN_ID));
        nft.buyResale{value: RESALE}(TOKEN_ID);
    }

    function test_BuyResaleExpiredReverts() public {
        _list(RESALE);
        vm.warp(AFTER_TS);
        vm.deal(buyer, RESALE);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.NightExpired.selector, TOKEN_ID));
        nft.buyResale{value: RESALE}(TOKEN_ID);
    }

    function test_BuyResaleReentrancyReverts() public {
        _list(RESALE);
        ReentrantResaleBuyer attacker = new ReentrantResaleBuyer(nft);
        vm.deal(address(attacker), RESALE * 3);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        attacker.attack(TOKEN_ID, RESALE);
        // No se materializó: sigue siendo del vendedor y listada.
        assertEq(nft.ownerOf(TOKEN_ID), seller);
    }

    function test_ClaimNoFundsReverts() public {
        vm.prank(stranger);
        vm.expectRevert(IHotelNights.NoFunds.selector);
        nft.claim();
    }

    function test_ClaimEthTransferFailedForHostileReceiver() public {
        // MINOR#7: un vendedor-contrato que rechaza ETH en `claim` revierte `EthTransferFailed`
        // y conserva su saldo pull intacto (CEI: el estado se restaura por el revert atómico).
        HostileClaimer hostile = new HostileClaimer(nft);

        // El hostil compra una noche fresca (queda EN_PODER_CLIENTE) y la lista.
        uint256 freshDate = 20_260_618;
        uint256 freshTokenId = ROOM * 100_000_000 + freshDate;
        vm.prank(minter);
        nft.mint(ROOM, freshDate, PRICE, URI);
        vm.deal(address(hostile), PRICE);
        hostile.doBuy(freshTokenId, PRICE);
        hostile.doList(freshTokenId, RESALE);

        // Otro comprador adquiere la reventa: acredita los proceeds al hostil (pull).
        vm.deal(buyer, RESALE);
        vm.prank(buyer);
        nft.buyResale{value: RESALE}(freshTokenId);
        uint256 owed = nft.pendingWithdrawals(address(hostile));
        assertGt(owed, 0);

        // `totalPending` incluye también el royalty del treasury (0.05) además del proceeds (0.95).
        uint256 totalBefore = nft.totalPending();
        assertEq(totalBefore, owed + nft.pendingWithdrawals(treasury));

        // `claim` falla porque el receptor revierte; el saldo NO se pierde.
        vm.expectRevert(IHotelNights.EthTransferFailed.selector);
        hostile.doClaim();
        assertEq(nft.pendingWithdrawals(address(hostile)), owed);
        assertEq(nft.totalPending(), totalBefore); // intacto

        // Si el receptor deja de rechazar, puede cobrar (el saldo seguía reservado).
        hostile.allowEth();
        hostile.doClaim();
        assertEq(nft.pendingWithdrawals(address(hostile)), 0);
        assertEq(address(hostile).balance, owed);
        assertEq(nft.totalPending(), totalBefore - owed); // solo queda el royalty del treasury
    }

    function test_DirectTransferStillBlockedAfterResale() public {
        _list(RESALE);
        vm.deal(buyer, RESALE);
        vm.prank(buyer);
        nft.buyResale{value: RESALE}(TOKEN_ID);

        vm.prank(buyer);
        vm.expectRevert(IHotelNights.DirectTransferDisabled.selector);
        nft.transferFrom(buyer, stranger, TOKEN_ID);
    }

    function test_RejectingRoyaltyReceiverDoesNotBlockResale() public {
        // El receptor de royalty rechaza ETH; con pull, la reventa NO se bloquea (ADR-15).
        RejectingReceiver rejecter = new RejectingReceiver();
        nft.setTreasury(address(rejecter)); // address(this) es DEFAULT_ADMIN

        _list(RESALE);
        vm.deal(buyer, RESALE);
        vm.prank(buyer);
        nft.buyResale{value: RESALE}(TOKEN_ID); // no revierte

        assertEq(nft.ownerOf(TOKEN_ID), buyer);
        // Acreditado (aunque no pueda cobrar): 5 % de 1 ether (hab. 102 = simple).
        assertEq(nft.pendingWithdrawals(address(rejecter)), 0.05 ether);
    }
}

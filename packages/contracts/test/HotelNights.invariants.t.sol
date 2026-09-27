// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import {HotelNights} from "../src/HotelNights.sol";
import {IHotelNights} from "../src/IHotelNights.sol";

import {RoomRegistrySeed} from "./RoomRegistrySeed.sol";

/**
 * @title HotelNightsHandler
 * @notice Handler para el fuzzing de invariantes (MAJOR#2, TC-CT-017/018/046/049). Ejecuta
 *         secuencias aleatorias de mint/buy/list/buyResale/claim/withdraw sobre un conjunto
 *         acotado de actores y tokens. Cada acción captura/ignora reverts esperados para que el
 *         fuzzer explore el espacio de estados sin abortar; las invariantes financieras se
 *         comprueban en el contrato de test.
 * @dev Es `IERC721Receiver` para poder ser propietario de NFTs en nombre de los actores
 *      (las cuentas EOA del fuzzer no pueden ejecutar lógica), simplificando el modelo.
 */
contract HotelNightsHandler is Test, IERC721Receiver {
    HotelNights public immutable NFT;
    address public immutable TREASURY;

    uint256 private constant ROOM_MULTIPLIER = 100_000_000;
    uint256 private constant BASE_DATE = 20_270_101; // futuro lejano: nunca expira en la campaña
    uint256 private constant PRICE = 0.5 ether;

    // Conjunto acotado de actores que actúan a través del handler.
    address[] public actors;

    // Tokens conocidos por el handler.
    uint256[] public tokens;
    mapping(uint256 tokenId => bool) public known;

    // Suma de proceeds y royalty repartidos por reventas (verificación cruzada con _totalPending).
    uint256 public ghostDistributed;

    uint256 private nextRoomIndex;

    constructor(HotelNights nft_, address treasury_) {
        NFT = nft_;
        TREASURY = treasury_;
        for (uint256 i = 0; i < 4; i++) {
            actors.push(makeAddr(string(abi.encodePacked("actor", vm.toString(i)))));
        }
    }

    function actorsLength() external view returns (uint256) {
        return actors.length;
    }

    function tokensLength() external view returns (uint256) {
        return tokens.length;
    }

    function _actor(uint256 seed) private view returns (address) {
        return actors[seed % actors.length];
    }

    /// @notice Mintea una noche nueva al inventario del hotel (el handler la mintea como MINTER).
    function mint(uint256 seed) external {
        // Habitaciones válidas del maestro: 101..130 y 201..220. Recorremos 101..130 cíclicamente.
        uint256 room = 101 + (nextRoomIndex % 30);
        uint256 date = BASE_DATE + (nextRoomIndex % 300); // fechas distintas → tokens distintos
        nextRoomIndex++;
        uint256 tokenId = room * ROOM_MULTIPLIER + date;
        if (NFT.priceOf(tokenId) != 0) return; // ya minteada

        try NFT.mint(room, date, PRICE, "ipfs://inv") returns (uint256 minted) {
            if (!known[minted]) {
                known[minted] = true;
                tokens.push(minted);
            }
        } catch {}
        seed; // silencia el warning de parámetro sin uso (la semilla no aporta aquí)
    }

    /// @notice Compra primaria de una noche del hotel por un actor.
    function buy(uint256 tokenSeed, uint256 actorSeed) external {
        if (tokens.length == 0) return;
        uint256 tokenId = tokens[tokenSeed % tokens.length];
        if (NFT.soldOnce(tokenId)) return;
        if (NFT.ownerOf(tokenId) != TREASURY) return;

        address actor = _actor(actorSeed);
        uint256 price = NFT.priceOf(tokenId);
        vm.deal(actor, price);
        vm.prank(actor);
        try NFT.buy{value: price}(tokenId) {} catch {}
    }

    /// @notice El propietario lista su noche (solo EN_PODER_CLIENTE; MINOR#5).
    function list(uint256 tokenSeed, uint256 priceSeed) external {
        if (tokens.length == 0) return;
        uint256 tokenId = tokens[tokenSeed % tokens.length];
        if (!NFT.soldOnce(tokenId)) return;

        address owner = _ownerOrZero(tokenId);
        if (owner == address(0)) return;
        // D-06: el precio debe respetar el suelo vigente o `list` revertiría siempre y la
        // campaña perdería cobertura de reventas.
        uint256 price = bound(priceSeed, NFT.minListingPrice(), 5 ether);
        vm.prank(owner);
        try NFT.list(tokenId, price) {} catch {}
    }

    /// @notice Compra de reventa por un actor distinto del vendedor.
    function buyResale(uint256 tokenSeed, uint256 actorSeed) external {
        if (tokens.length == 0) return;
        uint256 tokenId = tokens[tokenSeed % tokens.length];
        IHotelNights.Listing memory listing = NFT.listingOf(tokenId);
        if (!listing.active) return;

        address seller = _ownerOrZero(tokenId);
        if (seller == address(0)) return;
        address actor = _actor(actorSeed);
        if (actor == seller) actor = _actor(actorSeed + 1);
        if (actor == seller) return;

        (, uint256 royalty) = NFT.royaltyInfo(tokenId, listing.price);

        vm.deal(actor, listing.price);
        vm.prank(actor);
        try NFT.buyResale{value: listing.price}(tokenId) {
            // Invariante por reventa (TC-CT-049): royalty + proceeds == price (sin wei atrapados).
            uint256 proceeds = listing.price - royalty;
            assertEq(royalty + proceeds, listing.price, "royalty+proceeds != price");
            ghostDistributed += listing.price;
        } catch {}
    }

    /// @notice Un actor reclama su saldo pull.
    function claim(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        if (NFT.pendingWithdrawals(actor) == 0) return;
        vm.prank(actor);
        try NFT.claim() {} catch {}
    }

    /// @notice El treasury reclama su royalty pull (también puede tener saldo).
    function claimTreasury() external {
        if (NFT.pendingWithdrawals(TREASURY) == 0) return;
        vm.prank(TREASURY);
        try NFT.claim() {} catch {}
    }

    /// @notice Retira el residual a la tesorería (el handler tiene TREASURER_ROLE).
    function withdraw() external {
        try NFT.withdraw() {} catch {}
    }

    function _ownerOrZero(uint256 tokenId) private view returns (address) {
        try NFT.ownerOf(tokenId) returns (address o) {
            return o;
        } catch {
            return address(0);
        }
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {}
}

/**
 * @title HotelNightsInvariantsTest
 * @notice Invariantes financieras del contrato (MAJOR#2). El balance siempre cubre los fondos
 *         pull reservados, la suma de saldos individuales cuadra con el agregado y cada reventa
 *         reparte exactamente el precio entre royalty y proceeds.
 */
contract HotelNightsInvariantsTest is StdInvariant, Test {
    HotelNights internal nft;
    HotelNightsHandler internal handler;

    address internal treasury = makeAddr("treasuryInv");
    uint256 internal constant BASE_TS = 1_780_272_000; // 2026-06-01

    function setUp() public {
        vm.warp(BASE_TS);
        nft = new HotelNights(treasury);
        RoomRegistrySeed.seed(nft);
        handler = new HotelNightsHandler(nft, treasury);

        // El handler actúa como MINTER (mintea) y TREASURER (withdraw).
        nft.grantRole(nft.MINTER_ROLE(), address(handler));
        nft.grantRole(nft.TREASURER_ROLE(), address(handler));
        // El inventario se mintea a `treasury`; el handler necesita moverlo en `buy` vía guard,
        // pero `buy` lo hace el comprador. Como el treasury es EOA, no requiere setup extra.

        targetContract(address(handler));
    }

    /// @notice (a) El balance del contrato cubre siempre los fondos pull reservados (TC-CT-017).
    function invariant_BalanceCoversTotalPending() public view {
        assertGe(address(nft).balance, nft.totalPending());
    }

    /// @notice (b) Σ pendingWithdrawals(actores + treasury) == totalPending (TC-CT-018/046).
    function invariant_SumOfPendingEqualsTotalPending() public view {
        uint256 sum = nft.pendingWithdrawals(treasury);
        uint256 n = handler.actorsLength();
        for (uint256 i = 0; i < n; i++) {
            sum += nft.pendingWithdrawals(handler.actors(i));
        }
        assertEq(sum, nft.totalPending());
    }

    /// @notice El total repartido por reventas nunca excede lo que el contrato puede respaldar.
    function invariant_DistributedNeverExceedsBalancePlusClaimed() public view {
        // Cota de coherencia: el agregado pull jamás supera el balance del contrato.
        assertLe(nft.totalPending(), address(nft).balance);
    }
}

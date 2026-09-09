// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {HotelNFT} from "./HotelNFT.sol";

/**
 * @title HotelMarketplace
 * @notice Mercado exclusivo para compra primaria y reventa de noches de Hotel Marina del Sol.
 *         Implementa liquidación financiera mediante Pull-over-Push (pendingWithdrawals),
 *         precio mínimo anti-evasión de royalties (minListingPrice) y protección anti-reentrancy.
 */
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

    constructor(
        address _admin,
        address _nftContract,
        uint256 _initialMinPrice
    ) {
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

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Pone a la venta una noche. Valida que el NFT pertenezca al remitente (o sea inventario primario),
     *         que el precio cumpla el umbral anti-evasión y que la estancia no haya caducado ni sido disfrutada.
     */
    function listForSale(
        uint256 tokenId,
        uint256 priceInWei
    ) external nonReentrant whenNotPaused {
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

    /**
     * @notice Cancela un listing activo. Solo el vendedor o el admin pueden cancelarlo.
     */
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

    /**
     * @notice Compra de un NFT listado. Liquida fondos mediante Pull-over-Push acreditando
     *         en pendingWithdrawals y transfiere el NFT de forma atómica.
     */
    function buy(uint256 tokenId) external payable nonReentrant whenNotPaused {
        Listing memory item = listings[tokenId];
        require(item.active, "Marketplace: Not listed");
        require(msg.value == item.priceInWei, "Marketplace: Incorrect payment");

        delete listings[tokenId];

        (address royaltyReceiver, uint256 royaltyAmount) = nftContract.royaltyInfo(
            tokenId,
            item.priceInWei
        );

        bool isSecondary = (item.seller != address(nftContract));

        if (isSecondary) {
            pendingWithdrawals[royaltyReceiver] += royaltyAmount;
            pendingWithdrawals[item.seller] += (item.priceInWei - royaltyAmount);
        } else {
            // Venta primaria: el 100% de los ingresos va a la tesorería del hotel
            pendingWithdrawals[royaltyReceiver] += item.priceInWei;
        }

        // Transferencia segura del NFT hacia el comprador
        nftContract.safeTransferFrom(item.seller, msg.sender, tokenId);

        emit NFTSold(
            tokenId,
            item.seller,
            msg.sender,
            item.priceInWei,
            isSecondary ? royaltyAmount : item.priceInWei,
            isSecondary
        );
    }

    /**
     * @notice Retiro seguro de fondos acumulados por ventas o royalties (Pull-over-Push).
     */
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Marketplace: Nothing to withdraw");

        pendingWithdrawals[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Marketplace: Withdrawal failed");

        emit Withdrawal(msg.sender, amount);
    }
}

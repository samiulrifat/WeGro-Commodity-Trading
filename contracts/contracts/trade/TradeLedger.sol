// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessGuarded} from "../access/AccessGuarded.sol";
import {AccessRegistry} from "../access/AccessRegistry.sol";
import {Roles} from "../access/Roles.sol";
import {ProjectLedger} from "../projects/ProjectLedger.sol";
import {WarehouseReceipt} from "../warehouse/WarehouseReceipt.sol";

/// @title TradeLedger
/// @notice The platform marketplace: listings, offers, buyer payment and delivery.
/// A listing comes from a warehouse receipt (owner's side lists it) or, for
/// perishables, straight from a project (WeGro or the farmer's officer lists it).
/// Buyers offer their own quantity and unit price; a WeGro admin approves or rejects
/// each offer. An approved offer is a deal that reserves its quantity. Per deal,
/// Accounts confirms the buyer paid (hash only; a receipt splits off to the buyer),
/// then the buyer and the handler (issuing warehouse site, or the farmer's field
/// officer) each confirm delivery. Delivered deals add to the project's sale income.
/// A listing whose whole quantity is paid for closes as SoldOut. The final payout waits
/// until a project has no open listing and no undelivered deal. Amounts are in poisha.
contract TradeLedger is AccessGuarded {
    enum ListingStatus {
        None,
        Open,
        Cancelled,
        SoldOut // every unit paid for
    }

    enum OfferStatus {
        None,
        Pending,
        Withdrawn,
        Rejected,
        Approved, // a deal: quantity reserved, awaiting payment
        Cancelled, // an approved deal the buyer never paid
        Paid,
        Delivered
    }

    struct Listing {
        bytes32 projectId;
        bytes32 farmerId;
        bytes32 receiptId; // 0 = perishable, listed from the project
        bytes32 seller; // farmer's participant id, or WEGRO
        bytes32 produceCode;
        bytes32 grade;
        uint256 quantity; // listed in total
        uint256 available; // not yet reserved by an approved offer
        uint256 askingUnitPrice;
        uint32 unpaidDeals;
        ListingStatus status;
        uint64 createdAt;
    }

    struct Offer {
        uint256 listingId;
        bytes32 buyerId;
        uint256 quantity;
        uint256 unitPrice;
        OfferStatus status;
        uint64 madeAt;
        bytes32 paymentRefHash;
        bytes32 receiptPartId; // receipt split off to the buyer on payment
    }

    struct Delivery {
        uint256 buyerQuantity;
        bytes32 buyerQualityHash;
        uint256 handlerQuantity;
        bytes32 handlerQualityHash;
        bytes32 handlerId;
    }

    struct BuyerRequest {
        bytes32 buyerId;
        bytes32 produceCode;
        uint256 quantity;
        bytes32 grade; // 0 = any grade
        uint256 maxUnitPrice;
        uint64 validUntil;
        bool cancelled;
    }

    ProjectLedger public immutable projectLedger;
    WarehouseReceipt public immutable receipts;
    bytes32 public immutable WEGRO;

    uint256 public nextListingId = 1;
    uint256 public nextOfferId = 1;
    uint256 public nextRequestId = 1;

    mapping(uint256 listingId => Listing) private _listings;
    mapping(uint256 offerId => Offer) private _offers;
    mapping(uint256 offerId => Delivery) private _deliveries;
    mapping(uint256 requestId => BuyerRequest) private _requests;
    mapping(bytes32 paymentRefHash => bool) public paymentRefUsed;
    /// @notice Sum of delivered deal amounts per project, for settlement.
    mapping(bytes32 projectId => uint256) public saleIncome;
    /// @notice Open listings plus approved-but-undelivered deals per project.
    mapping(bytes32 projectId => uint256) public openTrades;

    event ListingCreated(
        uint256 indexed listingId,
        bytes32 indexed projectId,
        bytes32 indexed receiptId,
        bytes32 seller,
        bytes32 produceCode,
        uint256 quantity,
        bytes32 grade,
        uint256 askingUnitPrice,
        address listedBy
    );
    event ListingCancelled(uint256 indexed listingId, uint256 unsold, address indexed cancelledBy);
    event ListingSoldOut(uint256 indexed listingId);
    event OfferMade(
        uint256 indexed offerId, uint256 indexed listingId, bytes32 indexed buyerId, uint256 quantity, uint256 unitPrice
    );
    event OfferWithdrawn(uint256 indexed offerId);
    event OfferRejected(uint256 indexed offerId, address indexed rejectedBy);
    event OfferApproved(uint256 indexed offerId, uint256 indexed listingId, address indexed approvedBy);
    event DealCancelled(uint256 indexed offerId, address indexed cancelledBy);
    event BuyerPaymentConfirmed(uint256 indexed offerId, bytes32 paymentRefHash, bytes32 receiptPartId, address confirmedBy);
    event DeliveryConfirmed(
        uint256 indexed offerId, bytes32 indexed confirmedBy, bool isBuyer, uint256 quantity, bytes32 qualityHash
    );
    event DealDelivered(uint256 indexed offerId, bytes32 indexed projectId, uint256 amount);
    event RequestPosted(
        uint256 indexed requestId,
        bytes32 indexed buyerId,
        bytes32 produceCode,
        uint256 quantity,
        bytes32 grade,
        uint256 maxUnitPrice,
        uint64 validUntil
    );
    event RequestCancelled(uint256 indexed requestId);

    error ZeroValue();
    error ZeroDependency();
    error WrongProjectStage(bytes32 projectId, ProjectLedger.Stage stage);
    error NotPerishable(bytes32 projectId);
    error ListingNotFound(uint256 listingId);
    error ListingClosed(uint256 listingId);
    error ExceedsAvailable(uint256 requested, uint256 available);
    error DealsPending(uint256 listingId, uint32 unpaidDeals);
    error OfferNotFound(uint256 offerId);
    error WrongOfferStatus(uint256 offerId, OfferStatus status);
    error RequestNotFound(uint256 requestId);
    error RequestClosed(uint256 requestId);
    error InvalidValidUntil(uint64 validUntil);
    error PaymentRefAlreadyUsed(bytes32 paymentRefHash);
    error AlreadyConfirmed(uint256 offerId);
    error NotAuthorized(address account);

    constructor(AccessRegistry registry_, ProjectLedger projectLedger_, WarehouseReceipt receipts_)
        AccessGuarded(registry_)
    {
        if (address(projectLedger_) == address(0) || address(receipts_) == address(0)) revert ZeroDependency();
        projectLedger = projectLedger_;
        receipts = receipts_;
        WEGRO = receipts_.WEGRO();
    }

    // --- Listings (FR-17) ---

    /// @notice List a warehouse receipt. Caller must act for its owner: an admin
    /// for WeGro, the farmer's field officer for a farmer. Locks the receipt.
    function listReceipt(bytes32 receiptId, uint256 askingUnitPrice) external returns (uint256 listingId) {
        if (askingUnitPrice == 0) revert ZeroValue();
        WarehouseReceipt.Receipt memory r = receipts.getReceipt(receiptId);
        if (!receipts.isOwnerSide(r.owner, msg.sender)) revert NotAuthorized(msg.sender);
        ProjectLedger.Project memory p = _activeProject(r.projectId);

        receipts.setListed(receiptId, true); // must be Issued and not expired
        listingId = _createListing(
            r.projectId, p.terms.farmerId, receiptId, r.owner, r.produceCode, r.quantity, r.grade, askingUnitPrice
        );
    }

    /// @notice List perishable produce straight from a project: as WeGro (admin)
    /// or for the farmer (their field officer).
    function listProduce(bytes32 projectId, uint256 quantity, bytes32 grade, uint256 askingUnitPrice)
        external
        returns (uint256 listingId)
    {
        if (quantity == 0 || grade == bytes32(0) || askingUnitPrice == 0) revert ZeroValue();
        ProjectLedger.Project memory p = _activeProject(projectId);
        if (p.terms.category != ProjectLedger.ProduceCategory.Perishable) revert NotPerishable(projectId);

        bytes32 seller;
        if (_hasRole(Roles.ADMIN)) {
            seller = WEGRO;
        } else if (_isFarmersOfficer(p.terms.farmerId)) {
            seller = p.terms.farmerId;
        } else {
            revert NotAuthorized(msg.sender);
        }
        listingId = _createListing(
            projectId, p.terms.farmerId, bytes32(0), seller, p.terms.produceCode, quantity, grade, askingUnitPrice
        );
    }

    /// @notice Stop selling what is left: the seller's side or an admin. Needs no
    /// unpaid deals (an admin cancels those first). An unsold receipt goes back to
    /// its owner with the remaining quantity; paid deals carry on to delivery.
    function cancelListing(uint256 listingId) external {
        Listing storage l = _openListing(listingId);
        if (!_hasRole(Roles.ADMIN) && !_isSellerSide(l)) revert NotAuthorized(msg.sender);
        if (l.unpaidDeals != 0) revert DealsPending(listingId, l.unpaidDeals);

        l.status = ListingStatus.Cancelled;
        openTrades[l.projectId]--;
        if (l.receiptId != bytes32(0)) receipts.setListed(l.receiptId, false);
        emit ListingCancelled(listingId, l.available, msg.sender);
    }

    // --- Offers ---

    /// @notice A buyer offers a quantity (all or part of what is available) at their own unit price.
    function makeOffer(uint256 listingId, uint256 quantity, uint256 unitPrice)
        external
        onlyRole(Roles.BUYER)
        returns (uint256 offerId)
    {
        if (quantity == 0 || unitPrice == 0) revert ZeroValue();
        Listing storage l = _openListing(listingId);
        if (quantity > l.available) revert ExceedsAvailable(quantity, l.available);

        bytes32 buyerId = _callerId();
        offerId = nextOfferId++;
        _offers[offerId] = Offer({
            listingId: listingId,
            buyerId: buyerId,
            quantity: quantity,
            unitPrice: unitPrice,
            status: OfferStatus.Pending,
            madeAt: uint64(block.timestamp),
            paymentRefHash: bytes32(0),
            receiptPartId: bytes32(0)
        });
        emit OfferMade(offerId, listingId, buyerId, quantity, unitPrice);
    }

    function withdrawOffer(uint256 offerId) external onlyRole(Roles.BUYER) {
        Offer storage o = _offerIn(offerId, OfferStatus.Pending);
        if (o.buyerId != _callerId()) revert NotAuthorized(msg.sender);
        o.status = OfferStatus.Withdrawn;
        emit OfferWithdrawn(offerId);
    }

    function rejectOffer(uint256 offerId) external onlyRole(Roles.ADMIN) {
        Offer storage o = _offerIn(offerId, OfferStatus.Pending);
        o.status = OfferStatus.Rejected;
        emit OfferRejected(offerId, msg.sender);
    }

    /// @notice A WeGro admin approves an offer: its quantity is reserved for that buyer.
    function approveOffer(uint256 offerId) external onlyRole(Roles.ADMIN) {
        Offer storage o = _offerIn(offerId, OfferStatus.Pending);
        Listing storage l = _openListing(o.listingId);
        if (o.quantity > l.available) revert ExceedsAvailable(o.quantity, l.available);

        l.available -= o.quantity;
        l.unpaidDeals++;
        openTrades[l.projectId]++;
        o.status = OfferStatus.Approved;
        emit OfferApproved(offerId, o.listingId, msg.sender);
    }

    /// @notice An admin cancels an approved deal the buyer never paid; its
    /// quantity returns to the listing.
    function cancelDeal(uint256 offerId) external onlyRole(Roles.ADMIN) {
        Offer storage o = _offerIn(offerId, OfferStatus.Approved);
        Listing storage l = _listings[o.listingId];
        l.available += o.quantity;
        l.unpaidDeals--;
        openTrades[l.projectId]--;
        o.status = OfferStatus.Cancelled;
        emit DealCancelled(offerId, msg.sender);
    }

    // --- Payment and delivery (FR-18) ---

    /// @notice Accounts saw the buyer pay for a deal. For a receipt, the sold
    /// quantity splits off into a receipt owned by the buyer.
    function confirmBuyerPayment(uint256 offerId, bytes32 paymentRefHash) external onlyRole(Roles.ACCOUNTS) {
        Offer storage o = _offerIn(offerId, OfferStatus.Approved);
        if (paymentRefHash == bytes32(0)) revert ZeroValue();
        if (paymentRefUsed[paymentRefHash]) revert PaymentRefAlreadyUsed(paymentRefHash);
        paymentRefUsed[paymentRefHash] = true;

        Listing storage l = _listings[o.listingId];
        l.unpaidDeals--;
        o.status = OfferStatus.Paid;
        o.paymentRefHash = paymentRefHash;
        if (l.receiptId != bytes32(0)) o.receiptPartId = receipts.sellPart(l.receiptId, o.quantity, o.buyerId);
        emit BuyerPaymentConfirmed(offerId, paymentRefHash, o.receiptPartId, msg.sender);

        if (l.available == 0 && l.unpaidDeals == 0) {
            l.status = ListingStatus.SoldOut;
            openTrades[l.projectId]--;
            emit ListingSoldOut(o.listingId);
        }
    }

    /// @notice The buyer, and the handler (an operator of the receipt's warehouse
    /// site, or the farmer's field officer for perishables), each confirm the
    /// quantity and quality delivered. Both done: Delivered, receipt part Collected.
    function confirmDelivery(uint256 offerId, uint256 quantity, bytes32 qualityHash) external {
        if (quantity == 0 || qualityHash == bytes32(0)) revert ZeroValue();
        Offer storage o = _offerIn(offerId, OfferStatus.Paid);
        Listing storage l = _listings[o.listingId];
        Delivery storage d = _deliveries[offerId];
        bytes32 caller = _callerId();

        bool isBuyer = _hasRole(Roles.BUYER) && caller == o.buyerId;
        if (isBuyer) {
            if (d.buyerQuantity != 0) revert AlreadyConfirmed(offerId);
            d.buyerQuantity = quantity;
            d.buyerQualityHash = qualityHash;
        } else if (_isHandler(l, caller)) {
            if (d.handlerQuantity != 0) revert AlreadyConfirmed(offerId);
            d.handlerQuantity = quantity;
            d.handlerQualityHash = qualityHash;
            d.handlerId = caller;
        } else {
            revert NotAuthorized(msg.sender);
        }
        emit DeliveryConfirmed(offerId, caller, isBuyer, quantity, qualityHash);

        if (d.buyerQuantity != 0 && d.handlerQuantity != 0) {
            o.status = OfferStatus.Delivered;
            uint256 amount = o.quantity * o.unitPrice;
            saleIncome[l.projectId] += amount;
            openTrades[l.projectId]--;
            if (o.receiptPartId != bytes32(0)) receipts.collectSold(o.receiptPartId, d.handlerId);
            emit DealDelivered(offerId, l.projectId, amount);
        }
    }

    // --- Buyer requests (FR-19) ---

    function postRequest(bytes32 produceCode, uint256 quantity, bytes32 grade, uint256 maxUnitPrice, uint64 validUntil)
        external
        onlyRole(Roles.BUYER)
        returns (uint256 requestId)
    {
        if (produceCode == bytes32(0) || quantity == 0 || maxUnitPrice == 0) revert ZeroValue();
        if (validUntil <= block.timestamp) revert InvalidValidUntil(validUntil);
        bytes32 buyerId = _callerId();
        requestId = nextRequestId++;
        _requests[requestId] = BuyerRequest({
            buyerId: buyerId,
            produceCode: produceCode,
            quantity: quantity,
            grade: grade,
            maxUnitPrice: maxUnitPrice,
            validUntil: validUntil,
            cancelled: false
        });
        emit RequestPosted(requestId, buyerId, produceCode, quantity, grade, maxUnitPrice, validUntil);
    }

    function cancelRequest(uint256 requestId) external onlyRole(Roles.BUYER) {
        BuyerRequest storage q = _requests[requestId];
        if (q.buyerId == bytes32(0)) revert RequestNotFound(requestId);
        if (q.buyerId != _callerId()) revert NotAuthorized(msg.sender);
        if (q.cancelled) revert RequestClosed(requestId);
        q.cancelled = true;
        emit RequestCancelled(requestId);
    }

    // --- Views ---

    function getListing(uint256 listingId) external view returns (Listing memory) {
        return _listings[listingId];
    }

    function getOffer(uint256 offerId) external view returns (Offer memory) {
        return _offers[offerId];
    }

    function getDelivery(uint256 offerId) external view returns (Delivery memory) {
        return _deliveries[offerId];
    }

    function getRequest(uint256 requestId) external view returns (BuyerRequest memory) {
        return _requests[requestId];
    }

    /// @notice True while a request can still be answered.
    function isRequestOpen(uint256 requestId) external view returns (bool) {
        BuyerRequest storage q = _requests[requestId];
        return q.buyerId != bytes32(0) && !q.cancelled && block.timestamp < q.validUntil;
    }

    // --- Internals ---

    function _createListing(
        bytes32 projectId,
        bytes32 farmerId,
        bytes32 receiptId,
        bytes32 seller,
        bytes32 produceCode,
        uint256 quantity,
        bytes32 grade,
        uint256 askingUnitPrice
    ) private returns (uint256 listingId) {
        listingId = nextListingId++;
        _listings[listingId] = Listing({
            projectId: projectId,
            farmerId: farmerId,
            receiptId: receiptId,
            seller: seller,
            produceCode: produceCode,
            grade: grade,
            quantity: quantity,
            available: quantity,
            askingUnitPrice: askingUnitPrice,
            unpaidDeals: 0,
            status: ListingStatus.Open,
            createdAt: uint64(block.timestamp)
        });
        openTrades[projectId]++;
        emit ListingCreated(listingId, projectId, receiptId, seller, produceCode, quantity, grade, askingUnitPrice, msg.sender);
    }

    function _activeProject(bytes32 projectId) private view returns (ProjectLedger.Project memory p) {
        p = projectLedger.getProject(projectId);
        if (p.stage != ProjectLedger.Stage.Active) revert WrongProjectStage(projectId, p.stage);
    }

    function _isFarmersOfficer(bytes32 farmerId) private view returns (bool) {
        return _hasRole(Roles.FIELD_OFFICER) && registry.fieldOfficerOf(farmerId) == _callerId();
    }

    function _isSellerSide(Listing storage l) private view returns (bool) {
        return l.seller == WEGRO ? _hasRole(Roles.ADMIN) : _isFarmersOfficer(l.farmerId);
    }

    /// @dev Receipt: an operator of the issuing site. Perishable: the farmer's officer.
    function _isHandler(Listing storage l, bytes32 caller) private view returns (bool) {
        if (l.receiptId == bytes32(0)) return _isFarmersOfficer(l.farmerId);
        bytes32 siteId = receipts.getReceipt(l.receiptId).siteId;
        return _hasRole(Roles.WAREHOUSE) && receipts.siteOf(caller) == siteId;
    }

    function _openListing(uint256 listingId) private view returns (Listing storage l) {
        l = _listings[listingId];
        if (l.status == ListingStatus.None) revert ListingNotFound(listingId);
        if (l.status != ListingStatus.Open) revert ListingClosed(listingId);
    }

    function _offerIn(uint256 offerId, OfferStatus expected) private view returns (Offer storage o) {
        o = _offers[offerId];
        if (o.status == OfferStatus.None) revert OfferNotFound(offerId);
        if (o.status != expected) revert WrongOfferStatus(offerId, o.status);
    }
}

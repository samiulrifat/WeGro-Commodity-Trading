// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessGuarded} from "../access/AccessGuarded.sol";
import {AccessRegistry} from "../access/AccessRegistry.sol";
import {Roles} from "../access/Roles.sol";
import {ProjectLedger} from "../projects/ProjectLedger.sol";

/// @title WarehouseReceipt
/// @notice One-of-a-kind receipts for stored crops and spices. A warehouse site
/// issues a receipt to the project's farmer. Ownership moves only by the buy-back
/// handover to WeGro (farmer's officer offers, admin accepts) or through a sale in
/// TradeLedger (a linked contract). A paid sale splits off a child receipt for the
/// sold quantity, owned by the buyer; the listed receipt shrinks, and is SoldOut at 0.
/// Only an operator of the issuing site can extend a receipt or collect an unsold
/// one; a sold receipt is collected through TradeLedger's delivery. Collected is final.
/// The final payout waits until every issued receipt is sold out or collected.
contract WarehouseReceipt is AccessGuarded {
    enum Status {
        None,
        Issued,
        PendingHandover,
        Listed,
        Sold,
        Collected,
        SoldOut // every unit was split off to buyers
    }

    struct Receipt {
        bytes32 projectId;
        bytes32 siteId;
        bytes32 owner; // participant id, or WEGRO
        bytes32 produceCode;
        uint256 quantity; // in the catalog unit for produceCode
        bytes32 grade;
        bytes32 detailsHash; // intake record: quality, moisture, etc.
        uint64 issuedAt;
        uint64 expiresAt;
        Status status;
        bytes32 pendingTo; // recipient of a pending handover
        bytes32 parentId; // the receipt this was split from, or 0
    }

    /// @notice Owner id for WeGro itself; admins act for it.
    bytes32 public constant WEGRO = keccak256("WEGRO");

    ProjectLedger public immutable projectLedger;

    /// @notice Contracts allowed to list and sell receipts (TradeLedger).
    mapping(address => bool) public isLinkedContract;
    mapping(bytes32 siteId => bytes32 detailsHash) public siteDetails;
    /// @notice Warehouse site an operator works at, or zero.
    mapping(bytes32 operatorId => bytes32 siteId) public siteOf;
    mapping(bytes32 receiptId => Receipt) private _receipts;
    mapping(bytes32 receiptId => uint256) public splitCount;
    /// @notice Issued receipts per project not yet sold out or collected: crop still stored.
    mapping(bytes32 projectId => uint256) public openReceipts;

    event SiteRegistered(bytes32 indexed siteId, bytes32 detailsHash);
    event OperatorAssigned(bytes32 indexed operatorId, bytes32 indexed siteId);
    event LinkedContractSet(address indexed account, bool allowed);
    event ReceiptIssued(
        bytes32 indexed receiptId,
        bytes32 indexed projectId,
        bytes32 indexed siteId,
        bytes32 owner,
        bytes32 produceCode,
        uint256 quantity,
        bytes32 grade,
        uint64 expiresAt,
        bytes32 detailsHash,
        bytes32 issuedBy
    );
    event HandoverOffered(bytes32 indexed receiptId, bytes32 indexed from, bytes32 indexed to, address offeredBy);
    event HandoverCancelled(bytes32 indexed receiptId, address indexed cancelledBy);
    event ReceiptTransferred(bytes32 indexed receiptId, bytes32 indexed from, bytes32 indexed to, address by);
    event ExpiryExtended(bytes32 indexed receiptId, uint64 newExpiresAt, bytes32 recheckHash, bytes32 extendedBy);
    event ReceiptListed(bytes32 indexed receiptId, bool listed);
    event ReceiptSplit(bytes32 indexed parentId, bytes32 indexed childId, bytes32 indexed buyerId, uint256 quantity);
    event ReceiptCollected(bytes32 indexed receiptId, bytes32 collectedBy);

    error ZeroValue();
    error ZeroProjectLedger();
    error SiteExists(bytes32 siteId);
    error SiteNotFound(bytes32 siteId);
    error NotAWarehouseOperator(bytes32 participantId);
    error NotSiteOperator(address account);
    error ReceiptExists(bytes32 receiptId);
    error ReceiptNotFound(bytes32 receiptId);
    error WrongStatus(bytes32 receiptId, Status status);
    error ReceiptExpired(bytes32 receiptId);
    error NotStorable(bytes32 projectId);
    error WrongProjectStage(bytes32 projectId, ProjectLedger.Stage stage);
    error ProduceMismatch(bytes32 expected, bytes32 given);
    error InvalidExpiry(uint64 expiresAt);
    error InvalidRecipient(bytes32 to);
    error InvalidQuantity(uint256 requested, uint256 available);
    error NotAuthorized(address account);

    constructor(AccessRegistry registry_, ProjectLedger projectLedger_) AccessGuarded(registry_) {
        if (address(projectLedger_) == address(0)) revert ZeroProjectLedger();
        projectLedger = projectLedger_;
    }

    // --- Setup ---

    function setLinkedContract(address account, bool allowed) external onlyRole(registry.DEFAULT_ADMIN_ROLE()) {
        if (account == address(0)) revert ZeroValue();
        isLinkedContract[account] = allowed;
        emit LinkedContractSet(account, allowed);
    }

    function registerSite(bytes32 siteId, bytes32 detailsHash) external onlyRole(Roles.ADMIN) {
        if (siteId == bytes32(0) || detailsHash == bytes32(0)) revert ZeroValue();
        if (siteDetails[siteId] != bytes32(0)) revert SiteExists(siteId);
        siteDetails[siteId] = detailsHash;
        emit SiteRegistered(siteId, detailsHash);
    }

    /// @notice Assign a warehouse operator to a site; zero removes them.
    function assignOperator(bytes32 operatorId, bytes32 siteId) external onlyRole(Roles.ADMIN) {
        if (!registry.isVerifiedAs(operatorId, Roles.WAREHOUSE)) revert NotAWarehouseOperator(operatorId);
        if (siteId != bytes32(0) && siteDetails[siteId] == bytes32(0)) revert SiteNotFound(siteId);
        siteOf[operatorId] = siteId;
        emit OperatorAssigned(operatorId, siteId);
    }

    // --- Issuing ---

    /// @notice Record intake and issue a receipt to the project's farmer.
    function issueReceipt(
        bytes32 receiptId,
        bytes32 projectId,
        bytes32 produceCode,
        uint256 quantity,
        bytes32 grade,
        uint64 expiresAt,
        bytes32 detailsHash
    ) external onlyRole(Roles.WAREHOUSE) {
        if (receiptId == bytes32(0) || quantity == 0 || grade == bytes32(0) || detailsHash == bytes32(0)) {
            revert ZeroValue();
        }
        if (_receipts[receiptId].status != Status.None) revert ReceiptExists(receiptId);
        if (expiresAt <= block.timestamp) revert InvalidExpiry(expiresAt);
        bytes32 operatorId = _callerId();
        bytes32 siteId = siteOf[operatorId];
        if (siteId == bytes32(0)) revert NotSiteOperator(msg.sender);

        ProjectLedger.Project memory p = projectLedger.getProject(projectId);
        if (p.stage != ProjectLedger.Stage.Active) revert WrongProjectStage(projectId, p.stage);
        if (p.terms.category == ProjectLedger.ProduceCategory.Perishable) revert NotStorable(projectId);
        if (p.terms.produceCode != produceCode) revert ProduceMismatch(p.terms.produceCode, produceCode);

        _receipts[receiptId] = Receipt({
            projectId: projectId,
            siteId: siteId,
            owner: p.terms.farmerId,
            produceCode: produceCode,
            quantity: quantity,
            grade: grade,
            detailsHash: detailsHash,
            issuedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            status: Status.Issued,
            pendingTo: bytes32(0),
            parentId: bytes32(0)
        });
        openReceipts[projectId]++;
        emit ReceiptIssued(
            receiptId, projectId, siteId, p.terms.farmerId, produceCode, quantity, grade, expiresAt, detailsHash, operatorId
        );
    }

    /// @notice Extend the storage term after a quality re-check.
    function extendExpiry(bytes32 receiptId, uint64 newExpiresAt, bytes32 recheckHash) external {
        Receipt storage r = _existing(receiptId);
        bytes32 operatorId = _siteOperator(r.siteId);
        if (r.status == Status.Collected || r.status == Status.SoldOut) revert WrongStatus(receiptId, r.status);
        if (recheckHash == bytes32(0)) revert ZeroValue();
        if (newExpiresAt <= r.expiresAt || newExpiresAt <= block.timestamp) revert InvalidExpiry(newExpiresAt);
        r.expiresAt = newExpiresAt;
        emit ExpiryExtended(receiptId, newExpiresAt, recheckHash, operatorId);
    }

    // --- Handover ---

    /// @notice Buy-back: the farmer's field officer offers the farmer's receipt to
    /// WeGro. The owner is unchanged until an admin accepts. Buyers get receipts
    /// only through a sale.
    function offerHandover(bytes32 receiptId, bytes32 to) external {
        Receipt storage r = _transferable(receiptId);
        _requireOwnerSide(r.owner);
        if (to != WEGRO || r.owner == WEGRO) revert InvalidRecipient(to);

        r.status = Status.PendingHandover;
        r.pendingTo = to;
        emit HandoverOffered(receiptId, r.owner, to, msg.sender);
    }

    /// @notice An admin accepts the buy-back for WeGro.
    function acceptHandover(bytes32 receiptId) external {
        Receipt storage r = _existing(receiptId);
        if (r.status != Status.PendingHandover) revert WrongStatus(receiptId, r.status);
        if (block.timestamp >= r.expiresAt) revert ReceiptExpired(receiptId);
        if (!_hasRole(Roles.ADMIN)) revert NotAuthorized(msg.sender);

        _transfer(receiptId, r, r.pendingTo);
        r.status = Status.Issued;
    }

    /// @notice Withdraw (farmer's officer) or decline (admin) a pending buy-back.
    function cancelHandover(bytes32 receiptId) external {
        Receipt storage r = _existing(receiptId);
        if (r.status != Status.PendingHandover) revert WrongStatus(receiptId, r.status);
        if (!_hasRole(Roles.ADMIN) && !_isOwnerSide(r.owner)) revert NotAuthorized(msg.sender);

        r.status = Status.Issued;
        r.pendingTo = bytes32(0);
        emit HandoverCancelled(receiptId, msg.sender);
    }

    // --- Sales (linked contracts) ---

    /// @notice Lock a receipt for a sale listing, or release it.
    function setListed(bytes32 receiptId, bool listed) external {
        if (!isLinkedContract[msg.sender]) revert NotAuthorized(msg.sender);
        Receipt storage r = listed ? _transferable(receiptId) : _existing(receiptId);
        if (!listed && r.status != Status.Listed) revert WrongStatus(receiptId, r.status);
        r.status = listed ? Status.Listed : Status.Issued;
        emit ReceiptListed(receiptId, listed);
    }

    /// @notice A paid sale of `quantity` from a listed receipt: split off a child
    /// receipt owned by the buyer (status Sold). The parent is SoldOut at 0.
    function sellPart(bytes32 receiptId, uint256 quantity, bytes32 buyerId) external returns (bytes32 childId) {
        if (!isLinkedContract[msg.sender]) revert NotAuthorized(msg.sender);
        Receipt storage parent = _existing(receiptId);
        if (parent.status != Status.Listed) revert WrongStatus(receiptId, parent.status);
        if (buyerId == bytes32(0) || buyerId == parent.owner) revert InvalidRecipient(buyerId);
        if (quantity == 0 || quantity > parent.quantity) revert InvalidQuantity(quantity, parent.quantity);

        childId = keccak256(abi.encode(receiptId, ++splitCount[receiptId]));
        _receipts[childId] = Receipt({
            projectId: parent.projectId,
            siteId: parent.siteId,
            owner: buyerId,
            produceCode: parent.produceCode,
            quantity: quantity,
            grade: parent.grade,
            detailsHash: parent.detailsHash,
            issuedAt: uint64(block.timestamp),
            expiresAt: parent.expiresAt,
            status: Status.Sold,
            pendingTo: bytes32(0),
            parentId: receiptId
        });
        parent.quantity -= quantity;
        if (parent.quantity == 0) {
            parent.status = Status.SoldOut;
            openReceipts[parent.projectId]--;
        }

        emit ReceiptSplit(receiptId, childId, buyerId, quantity);
        emit ReceiptTransferred(childId, parent.owner, buyerId, msg.sender);
    }

    // --- Collection ---

    /// @notice Unsold goods left the warehouse (e.g. withdrawn by the owner). Final.
    function markCollected(bytes32 receiptId) external {
        Receipt storage r = _existing(receiptId);
        bytes32 operatorId = _siteOperator(r.siteId);
        if (r.status != Status.Issued) revert WrongStatus(receiptId, r.status);
        r.status = Status.Collected;
        openReceipts[r.projectId]--;
        emit ReceiptCollected(receiptId, operatorId);
    }

    /// @notice Sold goods were delivered, confirmed by `operatorId` of the issuing
    /// site and the buyer in TradeLedger. Final.
    function collectSold(bytes32 receiptId, bytes32 operatorId) external {
        if (!isLinkedContract[msg.sender]) revert NotAuthorized(msg.sender);
        Receipt storage r = _existing(receiptId);
        if (r.status != Status.Sold) revert WrongStatus(receiptId, r.status);
        r.status = Status.Collected;
        emit ReceiptCollected(receiptId, operatorId);
    }

    // --- Views ---

    function getReceipt(bytes32 receiptId) external view returns (Receipt memory) {
        return _receipts[receiptId];
    }

    function ownerOf(bytes32 receiptId) external view returns (bytes32) {
        return _receipts[receiptId].owner;
    }

    // --- Internals ---

    function _transfer(bytes32 receiptId, Receipt storage r, bytes32 to) private {
        bytes32 from = r.owner;
        r.owner = to;
        r.pendingTo = bytes32(0);
        emit ReceiptTransferred(receiptId, from, to, msg.sender);
    }

    /// @notice True if the caller acts for `owner`: an admin for WeGro, the
    /// farmer's field officer for a farmer. Buyers own only sold receipts.
    function isOwnerSide(bytes32 owner, address caller) public view returns (bool) {
        if (owner == WEGRO) return registry.hasRole(Roles.ADMIN, caller);
        return registry.hasRole(Roles.FIELD_OFFICER, caller)
            && registry.fieldOfficerOf(owner) == registry.participantOf(caller);
    }

    function _isOwnerSide(bytes32 owner) private view returns (bool) {
        return isOwnerSide(owner, msg.sender);
    }

    function _requireOwnerSide(bytes32 owner) private view {
        if (!_isOwnerSide(owner)) revert NotAuthorized(msg.sender);
    }

    /// @dev Caller must be an operator of `siteId`. Returns their participant id.
    function _siteOperator(bytes32 siteId) private view returns (bytes32 operatorId) {
        operatorId = _callerId();
        if (!_hasRole(Roles.WAREHOUSE) || siteOf[operatorId] != siteId) revert NotSiteOperator(msg.sender);
    }

    /// @dev Issued (not pending, listed, sold or collected) and not expired.
    function _transferable(bytes32 receiptId) private view returns (Receipt storage r) {
        r = _existing(receiptId);
        if (r.status != Status.Issued) revert WrongStatus(receiptId, r.status);
        if (block.timestamp >= r.expiresAt) revert ReceiptExpired(receiptId);
    }

    function _existing(bytes32 receiptId) private view returns (Receipt storage r) {
        r = _receipts[receiptId];
        if (r.status == Status.None) revert ReceiptNotFound(receiptId);
    }
}

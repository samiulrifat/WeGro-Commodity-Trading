// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessGuarded} from "../access/AccessGuarded.sol";
import {AccessRegistry} from "../access/AccessRegistry.sol";
import {Roles} from "../access/Roles.sol";
import {ProjectLedger} from "../projects/ProjectLedger.sol";

/// @title VoucherRegistry
/// @notice Input vouchers, supplier input batches, and voucher sales.
/// Operations proposes a voucher (quantity at a market unit price); Accounts approves it.
/// An approved supplier records a sale (quantity x unit price is held); the farmer's
/// field officer confirms it within `saleTtl`, or it expires. Amounts are in poisha.
/// The first approved voucher moves a Funded project to Active; total voucher value
/// on a project never exceeds its funding target. Sales happen only while the project
/// is Active; the final payout waits until no sale is pending.
contract VoucherRegistry is AccessGuarded {
    enum VoucherStatus {
        None,
        Proposed,
        Active,
        Rejected,
        Cancelled
    }

    enum SaleStatus {
        None,
        Pending,
        Confirmed,
        Cancelled,
        Expired
    }

    struct Voucher {
        bytes32 projectId;
        bytes32 farmerId;
        bytes32 inputType; // e.g. "SEED_MAIZE"
        uint256 quantity; // in the catalog unit for inputType
        uint256 unitPrice;
        uint256 value; // quantity x unitPrice
        uint256 spentQuantity; // confirmed sales
        uint256 heldQuantity; // pending sales
        VoucherStatus status;
        uint64 proposedAt;
        uint64 lastActivityAt; // approval, sale recorded or confirmed
    }

    struct Batch {
        bytes32 supplierId;
        bytes32 productCode;
        bytes32 detailsHash; // hash of the full batch record
        uint64 producedAt;
        uint64 expiresAt; // 0 = no expiry
        uint64 registeredAt;
    }

    struct Sale {
        bytes32 voucherId;
        bytes32 supplierId;
        uint256 quantity;
        uint256 amount; // quantity x voucher unit price
        SaleStatus status;
        uint64 recordedAt;
        uint64 expiresAt;
    }

    uint256 public constant MAX_SUPPLIERS_PER_VOUCHER = 20;
    uint256 public constant MAX_BATCHES_PER_SALE = 20;

    ProjectLedger public immutable projectLedger;
    uint64 public saleTtl;
    uint256 public nextSaleId = 1;

    mapping(bytes32 voucherId => Voucher) private _vouchers;
    mapping(bytes32 voucherId => bytes32[]) private _voucherSuppliers;
    mapping(bytes32 voucherId => mapping(bytes32 supplierId => bool)) public isApprovedSupplier;
    /// @notice Voucher value a project has committed (proposed or approved, minus voided).
    mapping(bytes32 projectId => uint256) public committedValue;
    /// @notice Confirmed voucher spending per project: the project's input cost.
    mapping(bytes32 projectId => uint256) public spentValue;
    /// @notice Value of sales recorded but not yet confirmed, cancelled or expired.
    mapping(bytes32 projectId => uint256) public pendingSaleValue;
    mapping(bytes32 batchId => Batch) private _batches;
    mapping(uint256 saleId => Sale) private _sales;
    mapping(uint256 saleId => bytes32[]) private _saleBatches;

    event VoucherProposed(
        bytes32 indexed voucherId,
        bytes32 indexed projectId,
        bytes32 indexed farmerId,
        bytes32 inputType,
        uint256 quantity,
        uint256 unitPrice,
        bytes32[] supplierIds,
        address proposedBy
    );
    event VoucherApproved(bytes32 indexed voucherId, address indexed approvedBy);
    event VoucherRejected(bytes32 indexed voucherId, address indexed rejectedBy);
    event VoucherCancelled(bytes32 indexed voucherId, uint256 voidedAmount, address indexed cancelledBy);
    event BatchRegistered(
        bytes32 indexed batchId,
        bytes32 indexed supplierId,
        bytes32 productCode,
        uint64 producedAt,
        uint64 expiresAt,
        bytes32 detailsHash
    );
    event SaleRecorded(
        uint256 indexed saleId,
        bytes32 indexed voucherId,
        bytes32 indexed supplierId,
        uint256 quantity,
        uint256 amount,
        uint64 expiresAt,
        bytes32[] batchIds
    );
    event SaleConfirmed(uint256 indexed saleId, bytes32 indexed voucherId, bytes32 confirmedBy);
    event SaleCancelled(uint256 indexed saleId, bytes32 indexed voucherId, address indexed cancelledBy);
    event SaleExpired(uint256 indexed saleId, bytes32 indexed voucherId);
    event SaleTtlUpdated(uint64 previousTtl, uint64 newTtl);

    error ZeroValue();
    error ZeroProjectLedger();
    error VoucherExists(bytes32 voucherId);
    error VoucherNotFound(bytes32 voucherId);
    error WrongVoucherStatus(bytes32 voucherId, VoucherStatus status);
    error WrongProjectStage(bytes32 projectId, ProjectLedger.Stage stage);
    error ExceedsFundingTarget(uint256 requested, uint256 available);
    error BadSupplierList();
    error SupplierNotVerified(bytes32 supplierId);
    error SupplierNotApproved(bytes32 voucherId, bytes32 supplierId);
    error ExceedsVoucherQuantity(uint256 requested, uint256 available);
    error BatchExists(bytes32 batchId);
    error BatchNotFound(bytes32 batchId);
    error BatchNotOwned(bytes32 batchId, bytes32 supplierId);
    error BatchExpired(bytes32 batchId);
    error BadBatchList();
    error InvalidDates();
    error SaleNotFound(uint256 saleId);
    error SaleNotPending(uint256 saleId, SaleStatus status);
    error SaleHasExpired(uint256 saleId);
    error SaleNotYetExpired(uint256 saleId, uint64 expiresAt);
    error NotAuthorized(address account);

    constructor(AccessRegistry registry_, ProjectLedger projectLedger_, uint64 saleTtl_) AccessGuarded(registry_) {
        if (address(projectLedger_) == address(0)) revert ZeroProjectLedger();
        if (saleTtl_ == 0) revert ZeroValue();
        projectLedger = projectLedger_;
        saleTtl = saleTtl_;
    }

    function setSaleTtl(uint64 newTtl) external onlyRole(Roles.ADMIN) {
        if (newTtl == 0) revert ZeroValue();
        emit SaleTtlUpdated(saleTtl, newTtl);
        saleTtl = newTtl;
    }

    // --- Vouchers (FR-12) ---

    /// @notice Operations proposes a voucher for the project's farmer at today's
    /// market unit price, usable only at the listed suppliers.
    function proposeVoucher(
        bytes32 voucherId,
        bytes32 projectId,
        bytes32 inputType,
        uint256 quantity,
        uint256 unitPrice,
        bytes32[] calldata supplierIds
    ) external onlyRole(Roles.OPERATIONS) {
        if (voucherId == bytes32(0) || inputType == bytes32(0) || quantity == 0 || unitPrice == 0) revert ZeroValue();
        if (_vouchers[voucherId].status != VoucherStatus.None) revert VoucherExists(voucherId);
        if (supplierIds.length == 0 || supplierIds.length > MAX_SUPPLIERS_PER_VOUCHER) revert BadSupplierList();

        ProjectLedger.Project memory p = _fundedOrActive(projectId);
        uint256 value = quantity * unitPrice;
        uint256 room = p.terms.fundingTarget - committedValue[projectId];
        if (value > room) revert ExceedsFundingTarget(value, room);

        for (uint256 i = 0; i < supplierIds.length; i++) {
            bytes32 s = supplierIds[i];
            if (isApprovedSupplier[voucherId][s]) revert BadSupplierList(); // duplicate
            if (!registry.isVerifiedAs(s, Roles.SUPPLIER)) revert SupplierNotVerified(s);
            isApprovedSupplier[voucherId][s] = true;
        }

        committedValue[projectId] += value;
        _voucherSuppliers[voucherId] = supplierIds;
        _vouchers[voucherId] = Voucher({
            projectId: projectId,
            farmerId: p.terms.farmerId,
            inputType: inputType,
            quantity: quantity,
            unitPrice: unitPrice,
            value: value,
            spentQuantity: 0,
            heldQuantity: 0,
            status: VoucherStatus.Proposed,
            proposedAt: uint64(block.timestamp),
            lastActivityAt: uint64(block.timestamp)
        });

        emit VoucherProposed(voucherId, projectId, p.terms.farmerId, inputType, quantity, unitPrice, supplierIds, msg.sender);
    }

    /// @notice Accounts approves a proposed voucher; it becomes usable. Moves a
    /// Funded project to Active.
    function approveVoucher(bytes32 voucherId) external onlyRole(Roles.ACCOUNTS) {
        Voucher storage v = _voucherIn(voucherId, VoucherStatus.Proposed);
        ProjectLedger.Project memory p = _fundedOrActive(v.projectId);

        v.status = VoucherStatus.Active;
        v.lastActivityAt = uint64(block.timestamp);
        emit VoucherApproved(voucherId, msg.sender);

        if (p.stage == ProjectLedger.Stage.Funded) projectLedger.activate(v.projectId);
    }

    /// @notice Accounts rejects a proposed voucher; its value is released.
    function rejectVoucher(bytes32 voucherId) external onlyRole(Roles.ACCOUNTS) {
        Voucher storage v = _voucherIn(voucherId, VoucherStatus.Proposed);
        v.status = VoucherStatus.Rejected;
        committedValue[v.projectId] -= v.value;
        emit VoucherRejected(voucherId, msg.sender);
    }

    /// @notice Admin voids a voucher's unused balance (e.g. unused for 4 weeks and
    /// the farmer declines it). Pending sales can still be confirmed, cancelled or expire.
    function cancelVoucher(bytes32 voucherId) external onlyRole(Roles.ADMIN) {
        Voucher storage v = _existingVoucher(voucherId);
        if (v.status != VoucherStatus.Proposed && v.status != VoucherStatus.Active) {
            revert WrongVoucherStatus(voucherId, v.status);
        }
        uint256 voided = (v.quantity - v.spentQuantity - v.heldQuantity) * v.unitPrice;
        v.status = VoucherStatus.Cancelled;
        committedValue[v.projectId] -= voided;
        emit VoucherCancelled(voucherId, voided, msg.sender);
    }

    // --- Input batches (FR-24) ---

    /// @notice Supplier registers a batch; `batchId` is what its QR code encodes.
    function registerBatch(
        bytes32 batchId,
        bytes32 productCode,
        uint64 producedAt,
        uint64 expiresAt,
        bytes32 detailsHash
    ) external onlyRole(Roles.SUPPLIER) {
        if (batchId == bytes32(0) || productCode == bytes32(0) || detailsHash == bytes32(0)) revert ZeroValue();
        if (_batches[batchId].registeredAt != 0) revert BatchExists(batchId);
        if (producedAt == 0 || (expiresAt != 0 && expiresAt <= producedAt)) revert InvalidDates();

        bytes32 supplierId = _callerId();
        _batches[batchId] = Batch({
            supplierId: supplierId,
            productCode: productCode,
            detailsHash: detailsHash,
            producedAt: producedAt,
            expiresAt: expiresAt,
            registeredAt: uint64(block.timestamp)
        });
        emit BatchRegistered(batchId, supplierId, productCode, producedAt, expiresAt, detailsHash);
    }

    // --- Sales ---

    /// @notice Supplier records a sale at the voucher's unit price. Batches are
    /// optional (none for services). The amount is held until confirmed or expired.
    function recordSale(bytes32 voucherId, uint256 quantity, bytes32[] calldata batchIds)
        external
        onlyRole(Roles.SUPPLIER)
        returns (uint256 saleId)
    {
        if (quantity == 0) revert ZeroValue();
        Voucher storage v = _voucherIn(voucherId, VoucherStatus.Active);
        bytes32 supplierId = _callerId();
        if (!isApprovedSupplier[voucherId][supplierId]) revert SupplierNotApproved(voucherId, supplierId);

        _requireActive(v.projectId);

        uint256 available = v.quantity - v.spentQuantity - v.heldQuantity;
        if (quantity > available) revert ExceedsVoucherQuantity(quantity, available);

        if (batchIds.length > MAX_BATCHES_PER_SALE) revert BadBatchList();
        for (uint256 i = 0; i < batchIds.length; i++) {
            Batch storage b = _batches[batchIds[i]];
            if (b.registeredAt == 0) revert BatchNotFound(batchIds[i]);
            if (b.supplierId != supplierId) revert BatchNotOwned(batchIds[i], supplierId);
            if (b.expiresAt != 0 && block.timestamp >= b.expiresAt) revert BatchExpired(batchIds[i]);
        }

        uint256 amount = quantity * v.unitPrice;
        uint64 expiresAt = uint64(block.timestamp) + saleTtl;
        v.heldQuantity += quantity;
        v.lastActivityAt = uint64(block.timestamp);
        pendingSaleValue[v.projectId] += amount;
        saleId = nextSaleId++;
        _sales[saleId] = Sale({
            voucherId: voucherId,
            supplierId: supplierId,
            quantity: quantity,
            amount: amount,
            status: SaleStatus.Pending,
            recordedAt: uint64(block.timestamp),
            expiresAt: expiresAt
        });
        _saleBatches[saleId] = batchIds;

        emit SaleRecorded(saleId, voucherId, supplierId, quantity, amount, expiresAt, batchIds);
    }

    /// @notice The farmer's own field officer confirms the goods were received,
    /// before the sale expires. The held quantity becomes spent.
    function confirmSale(uint256 saleId) external onlyRole(Roles.FIELD_OFFICER) {
        Sale storage s = _pendingSale(saleId);
        if (block.timestamp >= s.expiresAt) revert SaleHasExpired(saleId);
        Voucher storage v = _vouchers[s.voucherId];
        bytes32 officerId = _callerId();
        if (registry.fieldOfficerOf(v.farmerId) != officerId) revert NotAuthorized(msg.sender);

        s.status = SaleStatus.Confirmed;
        v.heldQuantity -= s.quantity;
        v.spentQuantity += s.quantity;
        spentValue[v.projectId] += s.amount;
        pendingSaleValue[v.projectId] -= s.amount;
        v.lastActivityAt = uint64(block.timestamp);
        emit SaleConfirmed(saleId, s.voucherId, officerId);
    }

    /// @notice Cancel a pending sale: by the supplier who recorded it, the
    /// voucher's farmer, the farmer's field officer or the admin.
    function cancelSale(uint256 saleId) external {
        Sale storage s = _pendingSale(saleId);
        Voucher storage v = _vouchers[s.voucherId];
        bytes32 caller = _callerId();
        bool allowed = _hasRole(Roles.ADMIN)
            || (_hasRole(Roles.FIELD_OFFICER) && caller == registry.fieldOfficerOf(v.farmerId))
            || (_hasRole(Roles.SUPPLIER) && caller == s.supplierId)
            || (_hasRole(Roles.FARMER) && caller == v.farmerId);
        if (!allowed) revert NotAuthorized(msg.sender);

        s.status = SaleStatus.Cancelled;
        _releaseHold(v, s);
        emit SaleCancelled(saleId, s.voucherId, msg.sender);
    }

    /// @notice Release an unconfirmed sale past its expiry. Callable by anyone.
    function expireSale(uint256 saleId) external {
        Sale storage s = _pendingSale(saleId);
        if (block.timestamp < s.expiresAt) revert SaleNotYetExpired(saleId, s.expiresAt);
        s.status = SaleStatus.Expired;
        _releaseHold(_vouchers[s.voucherId], s);
        emit SaleExpired(saleId, s.voucherId);
    }

    // --- Views ---

    function getVoucher(bytes32 voucherId) external view returns (Voucher memory) {
        return _vouchers[voucherId];
    }

    function getVoucherSuppliers(bytes32 voucherId) external view returns (bytes32[] memory) {
        return _voucherSuppliers[voucherId];
    }

    /// @notice Quantity still usable; zero unless the voucher is Active.
    function availableQuantity(bytes32 voucherId) public view returns (uint256) {
        Voucher storage v = _vouchers[voucherId];
        if (v.status != VoucherStatus.Active) return 0;
        return v.quantity - v.spentQuantity - v.heldQuantity;
    }

    function availableBalance(bytes32 voucherId) external view returns (uint256) {
        return availableQuantity(voucherId) * _vouchers[voucherId].unitPrice;
    }

    function getBatch(bytes32 batchId) external view returns (Batch memory) {
        return _batches[batchId];
    }

    /// @notice QR check: true if the batch was registered by a supplier.
    function isGenuine(bytes32 batchId) external view returns (bool) {
        return _batches[batchId].registeredAt != 0;
    }

    function getSale(uint256 saleId) external view returns (Sale memory) {
        return _sales[saleId];
    }

    function getSaleBatches(uint256 saleId) external view returns (bytes32[] memory) {
        return _saleBatches[saleId];
    }

    // --- Internals ---

    /// @dev Released quantity returns to the voucher, or is voided if it was cancelled.
    function _releaseHold(Voucher storage v, Sale storage s) private {
        v.heldQuantity -= s.quantity;
        pendingSaleValue[v.projectId] -= s.amount;
        if (v.status == VoucherStatus.Cancelled) committedValue[v.projectId] -= s.amount;
    }

    function _requireActive(bytes32 projectId) private view {
        ProjectLedger.Stage stage = projectLedger.getProject(projectId).stage;
        if (stage != ProjectLedger.Stage.Active) revert WrongProjectStage(projectId, stage);
    }

    function _fundedOrActive(bytes32 projectId) private view returns (ProjectLedger.Project memory p) {
        p = projectLedger.getProject(projectId);
        if (p.stage != ProjectLedger.Stage.Funded && p.stage != ProjectLedger.Stage.Active) {
            revert WrongProjectStage(projectId, p.stage);
        }
    }

    function _existingVoucher(bytes32 voucherId) private view returns (Voucher storage v) {
        v = _vouchers[voucherId];
        if (v.status == VoucherStatus.None) revert VoucherNotFound(voucherId);
    }

    function _voucherIn(bytes32 voucherId, VoucherStatus expected) private view returns (Voucher storage v) {
        v = _existingVoucher(voucherId);
        if (v.status != expected) revert WrongVoucherStatus(voucherId, v.status);
    }

    function _pendingSale(uint256 saleId) private view returns (Sale storage s) {
        s = _sales[saleId];
        if (s.status == SaleStatus.None) revert SaleNotFound(saleId);
        if (s.status != SaleStatus.Pending) revert SaleNotPending(saleId, s.status);
    }
}

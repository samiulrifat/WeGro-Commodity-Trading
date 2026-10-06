// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessGuarded} from "../access/AccessGuarded.sol";
import {AccessRegistry} from "../access/AccessRegistry.sol";
import {Roles} from "../access/Roles.sol";

/// @title ProjectLedger
/// @notice Projects, stages, slot reservations and holdings.
/// Slots are issued only after Accounts confirms an off-platform payment.
/// Amounts are in poisha (Tk 1.25 = 125); payment details appear only as hashes.
/// Stages: Draft -> OpenForFunding -> Funded -> Active -> ReadyForSale -> PaidOut
/// -> Closed; Cancelled is possible before Active.
contract ProjectLedger is AccessGuarded {
    enum Stage {
        None,
        Draft,
        OpenForFunding,
        Funded,
        Active,
        ReadyForSale,
        PaidOut,
        Closed,
        Cancelled
    }

    /// @dev Post-harvest path: crops/spices -> warehouse, perishable -> direct sale,
    /// livestock -> animal records.
    enum ProduceCategory {
        StorableCrop,
        Spice,
        Perishable,
        Livestock
    }

    enum DurationType {
        ShortTerm,
        LongTerm
    }

    enum ReservationStatus {
        None,
        Pending,
        Confirmed,
        Expired,
        Cancelled
    }

    struct ProjectTerms {
        bytes32 farmerId; // participant id
        bytes32 produceCode; // e.g. "MAIZE"
        ProduceCategory category;
        bytes32 regionCode; // district code
        DurationType durationType;
        uint8 durationMonths;
        uint8 payoutIntervalMonths; // 0 = single final payout
        uint256 fundingTarget; // poisha
        uint256 slotPrice; // poisha
        uint16 farmerBps;
        uint16 investorBps;
        uint16 wegroBps;
        bool insured;
        bytes32 termsHash; // hash of full off-chain terms
    }

    struct Project {
        ProjectTerms terms;
        Stage stage;
        uint32 totalSlots;
        uint32 issuedSlots;
        uint32 reservedSlots; // pending, unpaid
        uint64 createdAt;
    }

    struct Reservation {
        bytes32 projectId;
        bytes32 investorId;
        uint32 slots;
        uint64 expiresAt;
        ReservationStatus status;
        bytes32 paymentRefHash;
    }

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint8 public constant SHORT_TERM_MAX_MONTHS = 6;
    /// @dev Bounds holder lists.
    uint32 public constant MAX_SLOTS = 10_000;

    uint64 public reservationTtl;
    uint256 public nextReservationId = 1;

    /// @notice Contracts allowed to advance stages (e.g. VoucherRegistry, TradeLedger).
    mapping(address => bool) public isLinkedContract;

    mapping(bytes32 projectId => Project) private _projects;
    mapping(uint256 reservationId => Reservation) private _reservations;
    mapping(bytes32 projectId => mapping(bytes32 investorId => uint32)) private _holdings;
    mapping(bytes32 projectId => bytes32[]) private _holders;
    mapping(bytes32 projectId => mapping(bytes32 investorId => bool)) private _refunded;
    mapping(bytes32 paymentRefHash => bool) public paymentRefUsed;

    event ProjectCreated(
        bytes32 indexed projectId,
        bytes32 indexed farmerId,
        ProduceCategory category,
        uint32 totalSlots,
        uint256 slotPrice,
        bytes32 termsHash,
        address indexed createdBy
    );
    event ProjectStageChanged(bytes32 indexed projectId, Stage previousStage, Stage newStage, address indexed changedBy);
    event SlotsReserved(
        uint256 indexed reservationId,
        bytes32 indexed projectId,
        bytes32 indexed investorId,
        uint32 slots,
        uint64 expiresAt
    );
    event ReservationConfirmed(
        uint256 indexed reservationId,
        bytes32 indexed projectId,
        bytes32 indexed investorId,
        uint32 slots,
        bytes32 paymentRefHash
    );
    event ReservationExpired(uint256 indexed reservationId, bytes32 indexed projectId);
    event ReservationCancelled(uint256 indexed reservationId, bytes32 indexed projectId, address indexed cancelledBy);
    /// @notice Refund instruction for Accounts on cancellation.
    event RefundsRequired(bytes32 indexed projectId, uint32 issuedSlots, uint256 totalRefund);
    event RefundRecorded(bytes32 indexed projectId, bytes32 indexed investorId, bytes32 paymentRefHash);
    event LinkedContractSet(address indexed account, bool allowed);
    event ReservationTtlUpdated(uint64 previousTtl, uint64 newTtl);

    error ZeroValue();
    error ProjectExists(bytes32 projectId);
    error ProjectNotFound(bytes32 projectId);
    error WrongStage(bytes32 projectId, Stage current);
    error FarmerNotVerified(bytes32 farmerId);
    error InvalidSlotPricing();
    error TooManySlots(uint256 slots);
    error InvalidSplit();
    error InvalidDuration();
    error NotEnoughSlots(uint32 requested, uint32 available);
    error ReservationNotFound(uint256 reservationId);
    error ReservationNotPending(uint256 reservationId, ReservationStatus status);
    error ReservationHasExpired(uint256 reservationId);
    error ReservationNotYetExpired(uint256 reservationId, uint64 expiresAt);
    error PaymentRefAlreadyUsed(bytes32 paymentRefHash);
    error NothingToRefund(bytes32 projectId, bytes32 investorId);
    error AlreadyRefunded(bytes32 projectId, bytes32 investorId);
    error NotAuthorized(address account);

    constructor(AccessRegistry registry_, uint64 reservationTtl_) AccessGuarded(registry_) {
        if (reservationTtl_ == 0) revert ZeroValue();
        reservationTtl = reservationTtl_;
    }

    // --- Settings ---

    function setLinkedContract(address account, bool allowed) external onlyRole(registry.DEFAULT_ADMIN_ROLE()) {
        if (account == address(0)) revert ZeroValue();
        isLinkedContract[account] = allowed;
        emit LinkedContractSet(account, allowed);
    }

    function setReservationTtl(uint64 newTtl) external onlyRole(Roles.ADMIN) {
        if (newTtl == 0) revert ZeroValue();
        emit ReservationTtlUpdated(reservationTtl, newTtl);
        reservationTtl = newTtl;
    }

    // --- Project setup (FR-5, FR-6) ---

    function createProject(bytes32 projectId, ProjectTerms calldata terms) external onlyRole(Roles.ADMIN) {
        if (projectId == bytes32(0) || terms.produceCode == bytes32(0) || terms.termsHash == bytes32(0)) {
            revert ZeroValue();
        }
        if (_projects[projectId].stage != Stage.None) revert ProjectExists(projectId);
        if (!registry.isVerifiedAs(terms.farmerId, Roles.FARMER)) revert FarmerNotVerified(terms.farmerId);

        if (terms.slotPrice == 0 || terms.fundingTarget == 0 || terms.fundingTarget % terms.slotPrice != 0) {
            revert InvalidSlotPricing();
        }
        uint256 slots = terms.fundingTarget / terms.slotPrice;
        if (slots > MAX_SLOTS) revert TooManySlots(slots);

        if (uint256(terms.farmerBps) + terms.investorBps + terms.wegroBps != BPS_DENOMINATOR) {
            revert InvalidSplit();
        }
        _checkDuration(terms);

        Project storage p = _projects[projectId];
        p.terms = terms;
        p.stage = Stage.Draft;
        p.totalSlots = uint32(slots);
        p.createdAt = uint64(block.timestamp);

        emit ProjectCreated(projectId, terms.farmerId, terms.category, uint32(slots), terms.slotPrice, terms.termsHash, msg.sender);
        emit ProjectStageChanged(projectId, Stage.None, Stage.Draft, msg.sender);
    }

    function openForFunding(bytes32 projectId) external onlyRole(Roles.ADMIN) {
        _advance(projectId, Stage.Draft, Stage.OpenForFunding);
    }

    /// @notice Funded -> Active (first voucher issued).
    function activate(bytes32 projectId) external {
        _requireAdminOrLinked();
        _advance(projectId, Stage.Funded, Stage.Active);
    }

    /// @notice Active -> ReadyForSale (delivery confirmed).
    function markReadyForSale(bytes32 projectId) external {
        _requireAdminOrLinked();
        _advance(projectId, Stage.Active, Stage.ReadyForSale);
    }

    /// @notice ReadyForSale -> PaidOut (final payout paid).
    function markPaidOut(bytes32 projectId) external {
        if (!_hasRole(Roles.ACCOUNTS) && !isLinkedContract[msg.sender]) revert NotAuthorized(msg.sender);
        _advance(projectId, Stage.ReadyForSale, Stage.PaidOut);
    }

    function close(bytes32 projectId) external onlyRole(Roles.ADMIN) {
        _advance(projectId, Stage.PaidOut, Stage.Closed);
    }

    /// @notice Cancel before Active. Slot holders are owed refunds, recorded via `recordRefund`.
    function cancelProject(bytes32 projectId) external onlyRole(Roles.ADMIN) {
        Project storage p = _existing(projectId);
        Stage current = p.stage;
        if (current != Stage.Draft && current != Stage.OpenForFunding && current != Stage.Funded) {
            revert WrongStage(projectId, current);
        }
        p.stage = Stage.Cancelled;
        emit ProjectStageChanged(projectId, current, Stage.Cancelled, msg.sender);
        if (p.issuedSlots > 0) {
            emit RefundsRequired(projectId, p.issuedSlots, uint256(p.issuedSlots) * p.terms.slotPrice);
        }
    }

    function recordRefund(bytes32 projectId, bytes32 investorId, bytes32 paymentRefHash)
        external
        onlyRole(Roles.ACCOUNTS)
    {
        if (refundDue(projectId, investorId) == 0) {
            if (_refunded[projectId][investorId]) revert AlreadyRefunded(projectId, investorId);
            revert NothingToRefund(projectId, investorId);
        }
        _useRef(paymentRefHash);
        _refunded[projectId][investorId] = true;
        emit RefundRecorded(projectId, investorId, paymentRefHash);
    }

    // --- Slots (FR-7) ---

    /// @notice Reserve slots for the calling investor; expires after `reservationTtl` if unpaid.
    function reserveSlots(bytes32 projectId, uint32 slots)
        external
        onlyRole(Roles.INVESTOR)
        returns (uint256 reservationId)
    {
        if (slots == 0) revert ZeroValue();
        Project storage p = _existing(projectId);
        if (p.stage != Stage.OpenForFunding) revert WrongStage(projectId, p.stage);
        bytes32 investorId = _callerId();

        uint32 free = p.totalSlots - p.issuedSlots - p.reservedSlots;
        if (slots > free) revert NotEnoughSlots(slots, free);

        p.reservedSlots += slots;
        reservationId = nextReservationId++;
        uint64 expiresAt = uint64(block.timestamp) + reservationTtl;
        _reservations[reservationId] = Reservation({
            projectId: projectId,
            investorId: investorId,
            slots: slots,
            expiresAt: expiresAt,
            status: ReservationStatus.Pending,
            paymentRefHash: bytes32(0)
        });

        emit SlotsReserved(reservationId, projectId, investorId, slots, expiresAt);
    }

    /// @notice Issue reserved slots after payment. Funded once all slots are issued.
    function confirmPayment(uint256 reservationId, bytes32 paymentRefHash) external onlyRole(Roles.ACCOUNTS) {
        Reservation storage r = _pending(reservationId);
        if (block.timestamp >= r.expiresAt) revert ReservationHasExpired(reservationId);
        Project storage p = _projects[r.projectId];
        if (p.stage != Stage.OpenForFunding) revert WrongStage(r.projectId, p.stage);
        _useRef(paymentRefHash);

        r.status = ReservationStatus.Confirmed;
        r.paymentRefHash = paymentRefHash;
        p.reservedSlots -= r.slots;
        p.issuedSlots += r.slots;
        if (_holdings[r.projectId][r.investorId] == 0) _holders[r.projectId].push(r.investorId);
        _holdings[r.projectId][r.investorId] += r.slots;

        emit ReservationConfirmed(reservationId, r.projectId, r.investorId, r.slots, paymentRefHash);

        if (p.issuedSlots == p.totalSlots) {
            p.stage = Stage.Funded;
            emit ProjectStageChanged(r.projectId, Stage.OpenForFunding, Stage.Funded, msg.sender);
        }
    }

    /// @notice Release an expired reservation. Callable by anyone.
    function expireReservation(uint256 reservationId) external {
        Reservation storage r = _pending(reservationId);
        if (block.timestamp < r.expiresAt) revert ReservationNotYetExpired(reservationId, r.expiresAt);
        r.status = ReservationStatus.Expired;
        _projects[r.projectId].reservedSlots -= r.slots;
        emit ReservationExpired(reservationId, r.projectId);
    }

    /// @notice Investor cancels their own pending reservation; admin can cancel any.
    function cancelReservation(uint256 reservationId) external {
        Reservation storage r = _pending(reservationId);
        bool ownReservation = _hasRole(Roles.INVESTOR) && r.investorId == _callerId();
        if (!ownReservation && !_hasRole(Roles.ADMIN)) revert NotAuthorized(msg.sender);
        r.status = ReservationStatus.Cancelled;
        _projects[r.projectId].reservedSlots -= r.slots;
        emit ReservationCancelled(reservationId, r.projectId, msg.sender);
    }

    // --- Views ---

    function getProject(bytes32 projectId) external view returns (Project memory) {
        return _projects[projectId];
    }

    function getReservation(uint256 reservationId) external view returns (Reservation memory) {
        return _reservations[reservationId];
    }

    function holdingOf(bytes32 projectId, bytes32 investorId) external view returns (uint32) {
        return _holdings[projectId][investorId];
    }

    /// @notice Slot holders in order of first purchase.
    function getHolders(bytes32 projectId) external view returns (bytes32[] memory) {
        return _holders[projectId];
    }

    /// @dev Expired reservations count as taken until `expireReservation` is called.
    function availableSlots(bytes32 projectId) external view returns (uint32) {
        Project storage p = _projects[projectId];
        return p.totalSlots - p.issuedSlots - p.reservedSlots;
    }

    function refundDue(bytes32 projectId, bytes32 investorId) public view returns (uint256) {
        Project storage p = _projects[projectId];
        if (p.stage != Stage.Cancelled || _refunded[projectId][investorId]) return 0;
        return uint256(_holdings[projectId][investorId]) * p.terms.slotPrice;
    }

    // --- Internals ---

    function _checkDuration(ProjectTerms calldata t) private pure {
        if (t.durationMonths == 0) revert InvalidDuration();
        if (t.durationType == DurationType.ShortTerm) {
            if (t.durationMonths > SHORT_TERM_MAX_MONTHS || t.payoutIntervalMonths != 0) revert InvalidDuration();
        } else {
            if (t.durationMonths <= SHORT_TERM_MAX_MONTHS || t.payoutIntervalMonths > t.durationMonths) {
                revert InvalidDuration();
            }
        }
    }

    function _advance(bytes32 projectId, Stage from, Stage to) private {
        Project storage p = _existing(projectId);
        if (p.stage != from) revert WrongStage(projectId, p.stage);
        p.stage = to;
        emit ProjectStageChanged(projectId, from, to, msg.sender);
    }

    function _requireAdminOrLinked() private view {
        if (!_hasRole(Roles.ADMIN) && !isLinkedContract[msg.sender]) revert NotAuthorized(msg.sender);
    }

    function _useRef(bytes32 paymentRefHash) private {
        if (paymentRefHash == bytes32(0)) revert ZeroValue();
        if (paymentRefUsed[paymentRefHash]) revert PaymentRefAlreadyUsed(paymentRefHash);
        paymentRefUsed[paymentRefHash] = true;
    }

    function _existing(bytes32 projectId) private view returns (Project storage p) {
        p = _projects[projectId];
        if (p.stage == Stage.None) revert ProjectNotFound(projectId);
    }

    function _pending(uint256 reservationId) private view returns (Reservation storage r) {
        r = _reservations[reservationId];
        if (r.status == ReservationStatus.None) revert ReservationNotFound(reservationId);
        if (r.status != ReservationStatus.Pending) revert ReservationNotPending(reservationId, r.status);
    }
}

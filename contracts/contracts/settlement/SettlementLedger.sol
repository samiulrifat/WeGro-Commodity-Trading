// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessGuarded} from "../access/AccessGuarded.sol";
import {AccessRegistry} from "../access/AccessRegistry.sol";
import {Roles} from "../access/Roles.sol";
import {ProjectLedger} from "../projects/ProjectLedger.sol";
import {VoucherRegistry} from "../inputs/VoucherRegistry.sol";
import {TradeLedger} from "../trade/TradeLedger.sol";
import {InsuranceRegistry} from "../insurance/InsuranceRegistry.sol";
import {WarehouseReceipt} from "../warehouse/WarehouseReceipt.sol";

/// @title SettlementLedger
/// @notice Staged and final payouts (FR-20..22). The ledger works out the figures
/// itself: income = delivered sales + approved insurance; costs = confirmed voucher
/// spending + costs Accounts enters; profit = income - costs. Each round splits the
/// profit not yet distributed by the project's percentages, and the investors' part
/// by slots held (rounded down; the remainder is recorded). Staged rounds (long
/// projects, on the payout interval) pay only profit; the final round also returns
/// investors' capital, reduced by any loss. Per-person amounts appear only as hashes.
/// The final round needs everything that feeds it finished: no stored crop left, no
/// open listing or undelivered deal, no pending voucher sale, no undecided claim; costs
/// are frozen while it is open. One Accounts person prepares, a different one approves;
/// each payment is then recorded with a payment-reference hash. Returns are never guaranteed.
contract SettlementLedger is AccessGuarded {
    enum RoundStatus {
        None,
        Prepared,
        Approved,
        Rejected,
        Paid
    }

    struct Round {
        bytes32 projectId;
        bool isFinal;
        RoundStatus status;
        uint256 income; // cumulative, when prepared
        uint256 costs; // cumulative, when prepared
        uint256 profit; // split in this round
        uint256 farmerShare;
        uint256 investorShare;
        uint256 wegroShare;
        uint256 capitalReturn; // final round only
        uint256 leftover; // rounding remainder, kept by WeGro
        bytes32 fingerprint; // hash of the figures above
        bytes32 preparedBy;
        bytes32 approvedBy;
        uint32 payeeCount;
        uint32 paidCount;
        uint64 preparedAt;
    }

    struct Cost {
        bytes32 projectId;
        bytes32 category; // e.g. "TRANSPORT", "SERVICES"
        uint256 amount;
        bytes32 detailsHash;
        bytes32 enteredBy;
        bool voided;
    }

    uint16 public constant BPS = 10_000;
    uint64 public constant MONTH = 30 days;

    ProjectLedger public immutable projectLedger;
    VoucherRegistry public immutable vouchers;
    TradeLedger public immutable trade;
    InsuranceRegistry public immutable insurance;
    WarehouseReceipt public immutable receipts;

    uint256 public nextRoundId = 1;
    uint256 public nextCostId = 1;

    mapping(uint256 roundId => Round) private _rounds;
    mapping(uint256 roundId => bytes32[]) private _payees;
    mapping(uint256 roundId => mapping(bytes32 payeeId => bytes32 lineHash)) public payoutLineHash;
    mapping(uint256 roundId => mapping(bytes32 payeeId => bool)) public linePaid;
    mapping(uint256 costId => Cost) private _costs;
    mapping(bytes32 paymentRefHash => bool) public paymentRefUsed;

    mapping(bytes32 projectId => uint256) public otherCosts;
    mapping(bytes32 projectId => uint256) public distributedProfit;
    mapping(bytes32 projectId => uint256) public openRound; // Prepared or Approved, 0 = none
    mapping(bytes32 projectId => uint64) public lastRoundAt;
    mapping(bytes32 projectId => bool) public finalApproved;

    event CostAdded(uint256 indexed costId, bytes32 indexed projectId, bytes32 category, uint256 amount, bytes32 detailsHash);
    event CostVoided(uint256 indexed costId, address indexed voidedBy);
    event RoundPrepared(
        uint256 indexed roundId,
        bytes32 indexed projectId,
        bool isFinal,
        uint256 income,
        uint256 costs,
        uint256 profit,
        uint256 capitalReturn,
        bytes32 fingerprint,
        bytes32 preparedBy
    );
    event PayoutLine(uint256 indexed roundId, bytes32 indexed payeeId, bytes32 lineHash);
    event RoundApproved(uint256 indexed roundId, bytes32 approvedBy);
    event RoundRejected(uint256 indexed roundId, bytes32 reasonHash, address indexed rejectedBy);
    event PaymentRecorded(uint256 indexed roundId, bytes32 indexed payeeId, bytes32 paymentRefHash, address recordedBy);
    event RoundPaid(uint256 indexed roundId, bytes32 indexed projectId);

    error ZeroValue();
    error ZeroDependency();
    error WrongProjectStage(bytes32 projectId, ProjectLedger.Stage stage);
    error NotStaged(bytes32 projectId);
    error TooEarly(bytes32 projectId, uint64 nextAllowedAt);
    error RoundOpen(bytes32 projectId, uint256 roundId);
    error AlreadySettled(bytes32 projectId);
    error NothingToDistribute(bytes32 projectId);
    error StillOutstanding(bytes32 projectId, bytes32 what);
    error RoundNotFound(uint256 roundId);
    error WrongRoundStatus(uint256 roundId, RoundStatus status);
    error SameAccountant(bytes32 accountantId);
    error NotAPayee(uint256 roundId, bytes32 payeeId);
    error AlreadyPaid(uint256 roundId, bytes32 payeeId);
    error PaymentRefAlreadyUsed(bytes32 paymentRefHash);
    error CostNotFound(uint256 costId);
    error CostAlreadyVoided(uint256 costId);

    constructor(
        AccessRegistry registry_,
        ProjectLedger projectLedger_,
        VoucherRegistry vouchers_,
        TradeLedger trade_,
        InsuranceRegistry insurance_,
        WarehouseReceipt receipts_
    ) AccessGuarded(registry_) {
        if (
            address(projectLedger_) == address(0) || address(vouchers_) == address(0) || address(trade_) == address(0)
                || address(insurance_) == address(0) || address(receipts_) == address(0)
        ) revert ZeroDependency();
        projectLedger = projectLedger_;
        vouchers = vouchers_;
        trade = trade_;
        insurance = insurance_;
        receipts = receipts_;
    }

    // --- Costs (FR-9) ---

    /// @notice Accounts enters a non-input cost (inputs come from voucher spending).
    function addCost(bytes32 projectId, bytes32 category, uint256 amount, bytes32 detailsHash)
        external
        onlyRole(Roles.ACCOUNTS)
        returns (uint256 costId)
    {
        if (category == bytes32(0) || amount == 0 || detailsHash == bytes32(0)) revert ZeroValue();
        _requireOpenProject(projectId);
        costId = nextCostId++;
        _costs[costId] = Cost({
            projectId: projectId,
            category: category,
            amount: amount,
            detailsHash: detailsHash,
            enteredBy: _callerId(),
            voided: false
        });
        otherCosts[projectId] += amount;
        emit CostAdded(costId, projectId, category, amount, detailsHash);
    }

    /// @notice Void a wrongly entered cost (corrections are new entries).
    function voidCost(uint256 costId) external onlyRole(Roles.ACCOUNTS) {
        Cost storage c = _costs[costId];
        if (c.projectId == bytes32(0)) revert CostNotFound(costId);
        if (c.voided) revert CostAlreadyVoided(costId);
        _requireOpenProject(c.projectId);
        c.voided = true;
        otherCosts[c.projectId] -= c.amount;
        emit CostVoided(costId, msg.sender);
    }

    // --- Rounds (FR-20, FR-21) ---

    /// @notice Accounts prepares a payout round. Staged: an Active long project, at
    /// least one payout interval after the last round, with new profit to split.
    /// Final: a ReadyForSale project; also returns investors' capital.
    function prepareRound(bytes32 projectId, bool isFinal) external onlyRole(Roles.ACCOUNTS) returns (uint256 roundId) {
        if (openRound[projectId] != 0) revert RoundOpen(projectId, openRound[projectId]);
        if (finalApproved[projectId]) revert AlreadySettled(projectId);
        ProjectLedger.Project memory p = projectLedger.getProject(projectId);
        if (isFinal) {
            if (p.stage != ProjectLedger.Stage.ReadyForSale) revert WrongProjectStage(projectId, p.stage);
            _requireNothingOutstanding(projectId);
        } else {
            _checkStagedRound(projectId, p);
        }

        roundId = nextRoundId++;
        Round storage r = _rounds[roundId];
        r.projectId = projectId;
        r.isFinal = isFinal;
        r.status = RoundStatus.Prepared;
        r.preparedBy = _callerId();
        r.preparedAt = uint64(block.timestamp);
        _computeFigures(r, p);
        if (!isFinal && r.profit == 0) revert NothingToDistribute(projectId);
        _writeLines(roundId, r, p);

        r.fingerprint = keccak256(
            abi.encode(
                roundId,
                projectId,
                r.income,
                r.costs,
                r.profit,
                r.farmerShare,
                r.investorShare,
                r.wegroShare,
                r.capitalReturn,
                r.leftover
            )
        );
        openRound[projectId] = roundId;
        emit RoundPrepared(
            roundId, projectId, isFinal, r.income, r.costs, r.profit, r.capitalReturn, r.fingerprint, r.preparedBy
        );
    }

    /// @notice A second Accounts person approves (FR-10). Nothing can be marked
    /// paid before this.
    function approveRound(uint256 roundId) external onlyRole(Roles.ACCOUNTS) {
        Round storage r = _roundIn(roundId, RoundStatus.Prepared);
        bytes32 approver = _callerId();
        if (approver == r.preparedBy) revert SameAccountant(approver);

        r.status = RoundStatus.Approved;
        r.approvedBy = approver;
        distributedProfit[r.projectId] += r.profit;
        lastRoundAt[r.projectId] = uint64(block.timestamp);
        if (r.isFinal) finalApproved[r.projectId] = true;
        emit RoundApproved(roundId, approver);

        if (r.payeeCount == 0) _complete(roundId, r);
    }

    /// @notice Send a prepared round back; it is corrected and prepared again.
    function rejectRound(uint256 roundId, bytes32 reasonHash) external onlyRole(Roles.ACCOUNTS) {
        if (reasonHash == bytes32(0)) revert ZeroValue();
        Round storage r = _roundIn(roundId, RoundStatus.Prepared);
        r.status = RoundStatus.Rejected;
        openRound[r.projectId] = 0;
        emit RoundRejected(roundId, reasonHash, msg.sender);
    }

    /// @notice Accounts paid a payee outside the platform; record the reference.
    function recordPayment(uint256 roundId, bytes32 payeeId, bytes32 paymentRefHash)
        external
        onlyRole(Roles.ACCOUNTS)
    {
        Round storage r = _roundIn(roundId, RoundStatus.Approved);
        if (payoutLineHash[roundId][payeeId] == bytes32(0)) revert NotAPayee(roundId, payeeId);
        if (linePaid[roundId][payeeId]) revert AlreadyPaid(roundId, payeeId);
        if (paymentRefHash == bytes32(0)) revert ZeroValue();
        if (paymentRefUsed[paymentRefHash]) revert PaymentRefAlreadyUsed(paymentRefHash);

        paymentRefUsed[paymentRefHash] = true;
        linePaid[roundId][payeeId] = true;
        r.paidCount++;
        emit PaymentRecorded(roundId, payeeId, paymentRefHash, msg.sender);

        if (r.paidCount == r.payeeCount) _complete(roundId, r);
    }

    // --- Views ---

    function getRound(uint256 roundId) external view returns (Round memory) {
        return _rounds[roundId];
    }

    function getPayees(uint256 roundId) external view returns (bytes32[] memory) {
        return _payees[roundId];
    }

    function getCost(uint256 costId) external view returns (Cost memory) {
        return _costs[costId];
    }

    /// @notice Cumulative income and costs the next round would use.
    function currentTotals(bytes32 projectId) public view returns (uint256 income, uint256 costs) {
        income = trade.saleIncome(projectId) + insurance.approvedTotal(projectId);
        costs = vouchers.spentValue(projectId) + otherCosts[projectId];
    }

    /// @notice Hash a payout line as stored: lets a payee or auditor check their amount.
    function lineHash(uint256 roundId, bytes32 payeeId, uint256 amount) public pure returns (bytes32) {
        return keccak256(abi.encode(roundId, payeeId, amount));
    }

    // --- Internals ---

    function _checkStagedRound(bytes32 projectId, ProjectLedger.Project memory p) private view {
        if (p.stage != ProjectLedger.Stage.Active) revert WrongProjectStage(projectId, p.stage);
        if (p.terms.payoutIntervalMonths == 0) revert NotStaged(projectId);
        uint64 since = lastRoundAt[projectId] == 0 ? p.createdAt : lastRoundAt[projectId];
        uint64 nextAllowedAt = since + uint64(p.terms.payoutIntervalMonths) * MONTH;
        if (block.timestamp < nextAllowedAt) revert TooEarly(projectId, nextAllowedAt);
    }

    /// @dev Profit not yet distributed is split; a final round also returns capital
    /// minus any overall loss.
    function _computeFigures(Round storage r, ProjectLedger.Project memory p) private {
        (uint256 income, uint256 costs) = currentTotals(r.projectId);
        r.income = income;
        r.costs = costs;
        uint256 alreadySplit = distributedProfit[r.projectId];

        if (income > costs + alreadySplit) {
            uint256 profit = income - costs - alreadySplit;
            r.profit = profit;
            r.farmerShare = profit * p.terms.farmerBps / BPS;
            r.investorShare = profit * p.terms.investorBps / BPS;
            r.wegroShare = profit * p.terms.wegroBps / BPS;
            r.leftover = profit - r.farmerShare - r.investorShare - r.wegroShare;
        }
        if (r.isFinal) {
            uint256 capital = uint256(p.issuedSlots) * p.terms.slotPrice;
            uint256 shortfall = costs + alreadySplit > income ? costs + alreadySplit - income : 0;
            r.capitalReturn = capital > shortfall ? capital - shortfall : 0;
        }
    }

    /// @dev One hashed line per payee: the farmer's share, and each investor's part of
    /// the investor share plus capital, pro rata to slots and rounded down.
    function _writeLines(uint256 roundId, Round storage r, ProjectLedger.Project memory p) private {
        if (r.farmerShare != 0) _addLine(roundId, r, p.terms.farmerId, r.farmerShare);

        uint256 pool = r.investorShare + r.capitalReturn;
        if (pool == 0) return;
        bytes32[] memory holders = projectLedger.getHolders(r.projectId);
        uint256 paidOut;
        for (uint256 i = 0; i < holders.length; i++) {
            uint256 slots = projectLedger.holdingOf(r.projectId, holders[i]);
            uint256 amount = r.investorShare * slots / p.issuedSlots + r.capitalReturn * slots / p.issuedSlots;
            if (amount == 0) continue;
            paidOut += amount;
            _addLine(roundId, r, holders[i], amount);
        }
        r.leftover += pool - paidOut;
    }

    function _addLine(uint256 roundId, Round storage r, bytes32 payeeId, uint256 amount) private {
        bytes32 h = lineHash(roundId, payeeId, amount);
        payoutLineHash[roundId][payeeId] = h;
        _payees[roundId].push(payeeId);
        r.payeeCount++;
        emit PayoutLine(roundId, payeeId, h);
    }

    function _complete(uint256 roundId, Round storage r) private {
        r.status = RoundStatus.Paid;
        openRound[r.projectId] = 0;
        emit RoundPaid(roundId, r.projectId);
        if (r.isFinal) projectLedger.markPaidOut(r.projectId);
    }

    /// @dev Everything feeding the final figures must be finished, or it would be missed.
    function _requireNothingOutstanding(bytes32 projectId) private view {
        if (receipts.openReceipts(projectId) != 0) revert StillOutstanding(projectId, "STORED_CROP");
        if (trade.openTrades(projectId) != 0) revert StillOutstanding(projectId, "TRADES");
        if (vouchers.pendingSaleValue(projectId) != 0) revert StillOutstanding(projectId, "VOUCHER_SALES");
        if (insurance.openClaims(projectId) != 0) revert StillOutstanding(projectId, "CLAIMS");
    }

    /// @dev Costs can change until a final round is prepared.
    function _requireOpenProject(bytes32 projectId) private view {
        if (finalApproved[projectId]) revert AlreadySettled(projectId);
        uint256 open = openRound[projectId];
        if (open != 0 && _rounds[open].isFinal) revert RoundOpen(projectId, open);
        ProjectLedger.Stage s = projectLedger.getProject(projectId).stage;
        if (s != ProjectLedger.Stage.Funded && s != ProjectLedger.Stage.Active && s != ProjectLedger.Stage.ReadyForSale) {
            revert WrongProjectStage(projectId, s);
        }
    }

    function _roundIn(uint256 roundId, RoundStatus expected) private view returns (Round storage r) {
        r = _rounds[roundId];
        if (r.status == RoundStatus.None) revert RoundNotFound(roundId);
        if (r.status != expected) revert WrongRoundStatus(roundId, r.status);
    }
}

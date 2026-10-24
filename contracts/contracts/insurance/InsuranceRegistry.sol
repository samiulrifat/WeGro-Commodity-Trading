// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessGuarded} from "../access/AccessGuarded.sol";
import {AccessRegistry} from "../access/AccessRegistry.sol";
import {Roles} from "../access/Roles.sol";
import {ProjectLedger} from "../projects/ProjectLedger.sol";

/// @title InsuranceRegistry
/// @notice Pretend crop insurance. An admin assigns an insurer to an insured project
/// (and may switch insurers until its first claim); only that insurer sets its cover
/// and reviews its claims. Admins or insurers record weather events per district.
/// When a farmer suffers damage, their field officer (or an admin) opens a claim
/// citing a recorded event in the project's district, with a fingerprint of the claim
/// evidence (Triggered -> UnderReview -> Approved or Rejected; Approved -> Paid once
/// Accounts records the insurer's payment). Cover and claims are set while the crop
/// is in the field (Funded or Active); the final payout waits until every claim is
/// decided and every approved one paid. Paid amounts count as project income at
/// settlement. No money moves on-chain. Amounts in poisha.
contract InsuranceRegistry is AccessGuarded {
    enum ClaimStatus {
        None,
        Triggered,
        UnderReview,
        Approved,
        Rejected,
        Paid
    }

    struct Coverage {
        bytes32 insurerId;
        uint256 maxAmount;
        bytes32 termsHash; // what is covered
    }

    struct WeatherEvent {
        bytes32 regionCode;
        bytes32 eventType; // e.g. "FLOOD"
        bytes32 detailsHash;
        uint64 recordedAt;
    }

    struct Claim {
        bytes32 projectId;
        bytes32 eventId;
        ClaimStatus status;
        uint256 approvedAmount;
        bytes32 claimHash; // the officer's evidence: damage, notes, photos
        bytes32 openedBy; // participant id
        bytes32 assessmentHash;
        uint64 openedAt;
        bytes32 paymentRefHash; // the insurer's payment to WeGro, once recorded
    }

    ProjectLedger public immutable projectLedger;

    mapping(bytes32 projectId => Coverage) private _coverage;
    mapping(bytes32 eventId => WeatherEvent) private _events;
    mapping(bytes32 claimId => Claim) private _claims;
    mapping(bytes32 projectId => mapping(bytes32 eventId => bool)) public hasClaim;
    /// @notice The insurer an admin assigned to each project.
    mapping(bytes32 projectId => bytes32 insurerId) public assignedInsurer;
    /// @notice Claims ever opened per project; the insurer is fixed after the first.
    mapping(bytes32 projectId => uint256) public claimCount;
    /// @notice Sum of approved claims per project (paid or not): what the cover has used.
    mapping(bytes32 projectId => uint256) public approvedTotal;
    /// @notice Sum of claims the insurer has paid per project, read by SettlementLedger.
    mapping(bytes32 projectId => uint256) public paidTotal;
    /// @notice Claims still Triggered or UnderReview per project.
    mapping(bytes32 projectId => uint256) public openClaims;
    /// @notice Approved claims whose payment is not recorded yet, per project.
    mapping(bytes32 projectId => uint256) public unpaidClaims;
    /// @notice Payment references already used (hashes), so one payment is recorded once.
    mapping(bytes32 paymentRefHash => bool) public paymentRefUsed;

    event InsurerAssigned(bytes32 indexed projectId, bytes32 indexed insurerId, bytes32 previousInsurerId);
    event CoverageSet(bytes32 indexed projectId, bytes32 indexed insurerId, uint256 maxAmount, bytes32 termsHash);
    event WeatherEventRecorded(
        bytes32 indexed eventId, bytes32 indexed regionCode, bytes32 eventType, bytes32 detailsHash, address recordedBy
    );
    event ClaimOpened(
        bytes32 indexed claimId, bytes32 indexed projectId, bytes32 indexed eventId, bytes32 claimHash, bytes32 openedBy
    );
    event ClaimStatusChanged(bytes32 indexed claimId, ClaimStatus status, uint256 approvedAmount, bytes32 assessmentHash);
    event ClaimPaid(bytes32 indexed claimId, bytes32 indexed projectId, uint256 amount, bytes32 paymentRefHash);

    error ZeroValue();
    error ZeroProjectLedger();
    error NotInsured(bytes32 projectId);
    error NoCoverage(bytes32 projectId);
    error WrongProjectStage(bytes32 projectId, ProjectLedger.Stage stage);
    error CoverageBelowApproved(uint256 maxAmount, uint256 approved);
    error EventExists(bytes32 eventId);
    error EventNotFound(bytes32 eventId);
    error RegionMismatch(bytes32 projectRegion, bytes32 eventRegion);
    error ClaimExists(bytes32 claimId);
    error AlreadyClaimed(bytes32 projectId, bytes32 eventId);
    error ClaimNotFound(bytes32 claimId);
    error WrongClaimStatus(bytes32 claimId, ClaimStatus status);
    error ExceedsCoverage(uint256 requested, uint256 available);
    error NotProjectInsurer(bytes32 projectId, bytes32 insurerId);
    error NotAuthorized(address account);
    error NotAnInsurer(bytes32 participantId);
    error NoInsurerAssigned(bytes32 projectId);
    error InsurerAlreadyAssigned(bytes32 projectId, bytes32 insurerId);
    error InsurerFixed(bytes32 projectId);
    error PaymentRefUsed(bytes32 paymentRefHash);

    constructor(AccessRegistry registry_, ProjectLedger projectLedger_) AccessGuarded(registry_) {
        if (address(projectLedger_) == address(0)) revert ZeroProjectLedger();
        projectLedger = projectLedger_;
    }

    /// @notice An admin assigns a verified insurer to an insured project. Until the
    /// project's first claim the admin may switch insurers; the old cover is cleared and
    /// the new insurer sets their own.
    function assignInsurer(bytes32 projectId, bytes32 insurerId) external onlyRole(Roles.ADMIN) {
        if (insurerId == bytes32(0)) revert ZeroValue();
        _insuredProject(projectId);
        if (!registry.isVerifiedAs(insurerId, Roles.INSURER)) revert NotAnInsurer(insurerId);
        bytes32 previous = assignedInsurer[projectId];
        if (previous == insurerId) revert InsurerAlreadyAssigned(projectId, insurerId);
        if (claimCount[projectId] != 0) revert InsurerFixed(projectId);
        assignedInsurer[projectId] = insurerId;
        delete _coverage[projectId];
        emit InsurerAssigned(projectId, insurerId, previous);
    }

    /// @notice The project's assigned insurer sets (or changes) what it is covered for.
    function setCoverage(bytes32 projectId, uint256 maxAmount, bytes32 termsHash) external onlyRole(Roles.INSURER) {
        if (maxAmount == 0 || termsHash == bytes32(0)) revert ZeroValue();
        _insuredProject(projectId);
        bytes32 insurerId = _callerId();
        bytes32 assigned = assignedInsurer[projectId];
        if (assigned == bytes32(0)) revert NoInsurerAssigned(projectId);
        if (assigned != insurerId) revert NotProjectInsurer(projectId, assigned);
        if (maxAmount < approvedTotal[projectId]) revert CoverageBelowApproved(maxAmount, approvedTotal[projectId]);
        _coverage[projectId] = Coverage({insurerId: insurerId, maxAmount: maxAmount, termsHash: termsHash});
        emit CoverageSet(projectId, insurerId, maxAmount, termsHash);
    }

    /// @notice Admin or insurer records a (pretend) weather event for a district.
    function recordWeatherEvent(bytes32 eventId, bytes32 regionCode, bytes32 eventType, bytes32 detailsHash) external {
        _requireAdminOrInsurer();
        if (eventId == bytes32(0) || regionCode == bytes32(0) || eventType == bytes32(0) || detailsHash == bytes32(0)) {
            revert ZeroValue();
        }
        if (_events[eventId].recordedAt != 0) revert EventExists(eventId);
        _events[eventId] = WeatherEvent({
            regionCode: regionCode,
            eventType: eventType,
            detailsHash: detailsHash,
            recordedAt: uint64(block.timestamp)
        });
        emit WeatherEventRecorded(eventId, regionCode, eventType, detailsHash, msg.sender);
    }

    /// @notice The farmer's field officer (or an admin) claims for damage from a
    /// recorded weather event in the project's district. `claimHash` fingerprints the
    /// evidence. One claim per project per event.
    function openClaim(bytes32 claimId, bytes32 projectId, bytes32 eventId, bytes32 claimHash) external {
        if (claimId == bytes32(0) || claimHash == bytes32(0)) revert ZeroValue();
        if (_claims[claimId].status != ClaimStatus.None) revert ClaimExists(claimId);
        WeatherEvent storage e = _events[eventId];
        if (e.recordedAt == 0) revert EventNotFound(eventId);
        ProjectLedger.Project memory p = _insuredProject(projectId);
        bytes32 openedBy = _callerId();
        bool farmersOfficer =
            _hasRole(Roles.FIELD_OFFICER) && registry.fieldOfficerOf(p.terms.farmerId) == openedBy;
        if (!farmersOfficer && !_hasRole(Roles.ADMIN)) revert NotAuthorized(msg.sender);
        if (_coverage[projectId].maxAmount == 0) revert NoCoverage(projectId);
        if (p.terms.regionCode != e.regionCode) revert RegionMismatch(p.terms.regionCode, e.regionCode);
        if (hasClaim[projectId][eventId]) revert AlreadyClaimed(projectId, eventId);

        hasClaim[projectId][eventId] = true;
        claimCount[projectId]++;
        openClaims[projectId]++;
        _claims[claimId] = Claim({
            projectId: projectId,
            eventId: eventId,
            status: ClaimStatus.Triggered,
            approvedAmount: 0,
            claimHash: claimHash,
            openedBy: openedBy,
            assessmentHash: bytes32(0),
            openedAt: uint64(block.timestamp),
            paymentRefHash: bytes32(0)
        });
        emit ClaimOpened(claimId, projectId, eventId, claimHash, openedBy);
    }

    function startReview(bytes32 claimId) external onlyRole(Roles.INSURER) {
        Claim storage c = _claimIn(claimId, ClaimStatus.Triggered);
        _requireProjectInsurer(c.projectId);
        c.status = ClaimStatus.UnderReview;
        emit ClaimStatusChanged(claimId, ClaimStatus.UnderReview, 0, bytes32(0));
    }

    /// @notice Approve a claim for `amount`, within the project's remaining cover.
    function approveClaim(bytes32 claimId, uint256 amount, bytes32 assessmentHash) external onlyRole(Roles.INSURER) {
        if (amount == 0 || assessmentHash == bytes32(0)) revert ZeroValue();
        Claim storage c = _claimIn(claimId, ClaimStatus.UnderReview);
        _requireProjectInsurer(c.projectId);
        uint256 room = _coverage[c.projectId].maxAmount - approvedTotal[c.projectId];
        if (amount > room) revert ExceedsCoverage(amount, room);

        c.status = ClaimStatus.Approved;
        openClaims[c.projectId]--;
        unpaidClaims[c.projectId]++;
        c.approvedAmount = amount;
        c.assessmentHash = assessmentHash;
        approvedTotal[c.projectId] += amount;
        emit ClaimStatusChanged(claimId, ClaimStatus.Approved, amount, assessmentHash);
    }

    /// @notice Accounts records that the insurer paid an approved claim to WeGro; only
    /// then does it count as project income. The reference is kept as a hash.
    function recordClaimPayment(bytes32 claimId, bytes32 paymentRefHash) external onlyRole(Roles.ACCOUNTS) {
        if (paymentRefHash == bytes32(0)) revert ZeroValue();
        if (paymentRefUsed[paymentRefHash]) revert PaymentRefUsed(paymentRefHash);
        Claim storage c = _claimIn(claimId, ClaimStatus.Approved);
        paymentRefUsed[paymentRefHash] = true;
        c.status = ClaimStatus.Paid;
        c.paymentRefHash = paymentRefHash;
        unpaidClaims[c.projectId]--;
        paidTotal[c.projectId] += c.approvedAmount;
        emit ClaimPaid(claimId, c.projectId, c.approvedAmount, paymentRefHash);
    }

    function rejectClaim(bytes32 claimId, bytes32 assessmentHash) external onlyRole(Roles.INSURER) {
        if (assessmentHash == bytes32(0)) revert ZeroValue();
        Claim storage c = _claims[claimId];
        if (c.status != ClaimStatus.Triggered && c.status != ClaimStatus.UnderReview) {
            if (c.status == ClaimStatus.None) revert ClaimNotFound(claimId);
            revert WrongClaimStatus(claimId, c.status);
        }
        _requireProjectInsurer(c.projectId);
        c.status = ClaimStatus.Rejected;
        openClaims[c.projectId]--;
        c.assessmentHash = assessmentHash;
        emit ClaimStatusChanged(claimId, ClaimStatus.Rejected, 0, assessmentHash);
    }

    // --- Views ---

    function getCoverage(bytes32 projectId) external view returns (Coverage memory) {
        return _coverage[projectId];
    }

    function getWeatherEvent(bytes32 eventId) external view returns (WeatherEvent memory) {
        return _events[eventId];
    }

    function getClaim(bytes32 claimId) external view returns (Claim memory) {
        return _claims[claimId];
    }

    // --- Internals ---

    /// @dev An insured project whose crop is in the field: Funded or Active.
    function _insuredProject(bytes32 projectId) private view returns (ProjectLedger.Project memory p) {
        p = projectLedger.getProject(projectId);
        if (p.stage != ProjectLedger.Stage.Funded && p.stage != ProjectLedger.Stage.Active) {
            revert WrongProjectStage(projectId, p.stage);
        }
        if (!p.terms.insured) revert NotInsured(projectId);
    }

    /// @dev Only the insurer who covers the project reviews its claims.
    function _requireProjectInsurer(bytes32 projectId) private view {
        bytes32 insurerId = _coverage[projectId].insurerId;
        if (_callerId() != insurerId) revert NotProjectInsurer(projectId, insurerId);
    }

    function _requireAdminOrInsurer() private view {
        if (!_hasRole(Roles.ADMIN) && !_hasRole(Roles.INSURER)) revert NotAuthorized(msg.sender);
    }

    function _claimIn(bytes32 claimId, ClaimStatus expected) private view returns (Claim storage c) {
        c = _claims[claimId];
        if (c.status == ClaimStatus.None) revert ClaimNotFound(claimId);
        if (c.status != expected) revert WrongClaimStatus(claimId, c.status);
    }
}

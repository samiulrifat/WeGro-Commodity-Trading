// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessGuarded} from "../access/AccessGuarded.sol";
import {AccessRegistry} from "../access/AccessRegistry.sol";
import {Roles} from "../access/Roles.sol";
import {ProjectLedger} from "../projects/ProjectLedger.sol";

/// @title InsuranceRegistry
/// @notice Pretend crop insurance (FR-25). An insurer sets cover on an insured
/// project; a recorded weather event opens a claim on insured projects in that
/// district (Triggered -> UnderReview -> Approved or Rejected). Cover and claims are
/// set while the crop is in the field (Funded or Active); the final payout waits until
/// every claim is decided. Approved amounts count as project income at settlement.
/// No money moves. Amounts in poisha.
contract InsuranceRegistry is AccessGuarded {
    enum ClaimStatus {
        None,
        Triggered,
        UnderReview,
        Approved,
        Rejected
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
        bytes32 assessmentHash;
        uint64 openedAt;
    }

    ProjectLedger public immutable projectLedger;

    mapping(bytes32 projectId => Coverage) private _coverage;
    mapping(bytes32 eventId => WeatherEvent) private _events;
    mapping(bytes32 claimId => Claim) private _claims;
    mapping(bytes32 projectId => mapping(bytes32 eventId => bool)) public hasClaim;
    /// @notice Sum of approved claims per project, read by SettlementLedger.
    mapping(bytes32 projectId => uint256) public approvedTotal;
    /// @notice Claims still Triggered or UnderReview per project.
    mapping(bytes32 projectId => uint256) public openClaims;

    event CoverageSet(bytes32 indexed projectId, bytes32 indexed insurerId, uint256 maxAmount, bytes32 termsHash);
    event WeatherEventRecorded(
        bytes32 indexed eventId, bytes32 indexed regionCode, bytes32 eventType, bytes32 detailsHash, address recordedBy
    );
    event ClaimOpened(bytes32 indexed claimId, bytes32 indexed projectId, bytes32 indexed eventId);
    event ClaimStatusChanged(bytes32 indexed claimId, ClaimStatus status, uint256 approvedAmount, bytes32 assessmentHash);

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
    error NotAuthorized(address account);

    constructor(AccessRegistry registry_, ProjectLedger projectLedger_) AccessGuarded(registry_) {
        if (address(projectLedger_) == address(0)) revert ZeroProjectLedger();
        projectLedger = projectLedger_;
    }

    /// @notice The insurer sets (or changes) what an insured project is covered for.
    function setCoverage(bytes32 projectId, uint256 maxAmount, bytes32 termsHash) external onlyRole(Roles.INSURER) {
        if (maxAmount == 0 || termsHash == bytes32(0)) revert ZeroValue();
        _insuredProject(projectId);
        if (maxAmount < approvedTotal[projectId]) revert CoverageBelowApproved(maxAmount, approvedTotal[projectId]);
        bytes32 insurerId = _callerId();
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

    /// @notice Open a claim on a covered project in the event's district.
    /// The backend calls this for each insured project in the region.
    function openClaim(bytes32 claimId, bytes32 projectId, bytes32 eventId) external {
        _requireAdminOrInsurer();
        if (claimId == bytes32(0)) revert ZeroValue();
        if (_claims[claimId].status != ClaimStatus.None) revert ClaimExists(claimId);
        WeatherEvent storage e = _events[eventId];
        if (e.recordedAt == 0) revert EventNotFound(eventId);
        ProjectLedger.Project memory p = _insuredProject(projectId);
        if (_coverage[projectId].maxAmount == 0) revert NoCoverage(projectId);
        if (p.terms.regionCode != e.regionCode) revert RegionMismatch(p.terms.regionCode, e.regionCode);
        if (hasClaim[projectId][eventId]) revert AlreadyClaimed(projectId, eventId);

        hasClaim[projectId][eventId] = true;
        openClaims[projectId]++;
        _claims[claimId] = Claim({
            projectId: projectId,
            eventId: eventId,
            status: ClaimStatus.Triggered,
            approvedAmount: 0,
            assessmentHash: bytes32(0),
            openedAt: uint64(block.timestamp)
        });
        emit ClaimOpened(claimId, projectId, eventId);
    }

    function startReview(bytes32 claimId) external onlyRole(Roles.INSURER) {
        Claim storage c = _claimIn(claimId, ClaimStatus.Triggered);
        c.status = ClaimStatus.UnderReview;
        emit ClaimStatusChanged(claimId, ClaimStatus.UnderReview, 0, bytes32(0));
    }

    /// @notice Approve a claim for `amount`, within the project's remaining cover.
    function approveClaim(bytes32 claimId, uint256 amount, bytes32 assessmentHash) external onlyRole(Roles.INSURER) {
        if (amount == 0 || assessmentHash == bytes32(0)) revert ZeroValue();
        Claim storage c = _claimIn(claimId, ClaimStatus.UnderReview);
        uint256 room = _coverage[c.projectId].maxAmount - approvedTotal[c.projectId];
        if (amount > room) revert ExceedsCoverage(amount, room);

        c.status = ClaimStatus.Approved;
        openClaims[c.projectId]--;
        c.approvedAmount = amount;
        c.assessmentHash = assessmentHash;
        approvedTotal[c.projectId] += amount;
        emit ClaimStatusChanged(claimId, ClaimStatus.Approved, amount, assessmentHash);
    }

    function rejectClaim(bytes32 claimId, bytes32 assessmentHash) external onlyRole(Roles.INSURER) {
        if (assessmentHash == bytes32(0)) revert ZeroValue();
        Claim storage c = _claims[claimId];
        if (c.status != ClaimStatus.Triggered && c.status != ClaimStatus.UnderReview) {
            if (c.status == ClaimStatus.None) revert ClaimNotFound(claimId);
            revert WrongClaimStatus(claimId, c.status);
        }
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

    function _requireAdminOrInsurer() private view {
        if (!_hasRole(Roles.ADMIN) && !_hasRole(Roles.INSURER)) revert NotAuthorized(msg.sender);
    }

    function _claimIn(bytes32 claimId, ClaimStatus expected) private view returns (Claim storage c) {
        c = _claims[claimId];
        if (c.status == ClaimStatus.None) revert ClaimNotFound(claimId);
        if (c.status != expected) revert WrongClaimStatus(claimId, c.status);
    }
}

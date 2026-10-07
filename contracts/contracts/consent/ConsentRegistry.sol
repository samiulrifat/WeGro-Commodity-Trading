// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessGuarded} from "../access/AccessGuarded.sol";
import {AccessRegistry} from "../access/AccessRegistry.sol";
import {Roles} from "../access/Roles.sol";
import {ProjectLedger} from "../projects/ProjectLedger.sol";

/// @title ConsentRegistry
/// @notice Farmer track records and bank permissions (FR-26). The farmer's field
/// officer publishes a track record built from the farmer's finished projects (only
/// its hash goes on-chain) and grants or withdraws a bank's permission on the
/// farmer's behalf. Permission covers a whole bank; any officer assigned to that
/// bank can view the summary while it is active, and every view is logged.
contract ConsentRegistry is AccessGuarded {
    struct TrackRecord {
        bytes32 summaryHash; // paid on time, harvest vs target, etc.
        bytes32 publishedBy;
        uint64 publishedAt;
    }

    struct Consent {
        bytes32 grantedBy;
        uint64 grantedAt;
        uint64 expiresAt; // 0 = until withdrawn
        bool revoked;
    }

    uint256 public constant MAX_PROJECTS_PER_RECORD = 50;

    ProjectLedger public immutable projectLedger;

    mapping(bytes32 bankId => bytes32 detailsHash) public bankDetails;
    /// @notice Bank an officer works for, or zero.
    mapping(bytes32 officerId => bytes32 bankId) public bankOf;
    /// @notice Latest track record version per farmer; 0 = none yet.
    mapping(bytes32 farmerId => uint32) public latestVersion;
    mapping(bytes32 farmerId => mapping(uint32 version => TrackRecord)) private _records;
    mapping(bytes32 farmerId => mapping(uint32 version => bytes32[])) private _recordProjects;
    mapping(bytes32 farmerId => mapping(bytes32 bankId => Consent)) private _consents;
    mapping(bytes32 farmerId => mapping(bytes32 bankId => uint256)) public viewCount;

    event BankRegistered(bytes32 indexed bankId, bytes32 detailsHash);
    event BankOfficerAssigned(bytes32 indexed officerId, bytes32 indexed bankId);
    event TrackRecordPublished(
        bytes32 indexed farmerId, uint32 indexed version, bytes32 summaryHash, bytes32[] projectIds, bytes32 publishedBy
    );
    event ConsentGranted(bytes32 indexed farmerId, bytes32 indexed bankId, uint64 expiresAt, bytes32 grantedBy);
    event ConsentRevoked(bytes32 indexed farmerId, bytes32 indexed bankId, bytes32 revokedBy);
    event SummaryViewed(bytes32 indexed farmerId, bytes32 indexed bankId, bytes32 indexed viewerId, uint32 version);

    error ZeroValue();
    error ZeroProjectLedger();
    error BankExists(bytes32 bankId);
    error BankNotFound(bytes32 bankId);
    error NotABankOfficer(bytes32 participantId);
    error NotFarmersOfficer(address account);
    error BadProjectList();
    error NotFarmersProject(bytes32 projectId);
    error ProjectNotFinished(bytes32 projectId, ProjectLedger.Stage stage);
    error InvalidExpiry(uint64 expiresAt);
    error NoActiveConsent(bytes32 farmerId, bytes32 bankId);
    error NoTrackRecord(bytes32 farmerId);
    error NotAssignedToBank(address account);

    constructor(AccessRegistry registry_, ProjectLedger projectLedger_) AccessGuarded(registry_) {
        if (address(projectLedger_) == address(0)) revert ZeroProjectLedger();
        projectLedger = projectLedger_;
    }

    // --- Banks ---

    function registerBank(bytes32 bankId, bytes32 detailsHash) external onlyRole(Roles.ADMIN) {
        if (bankId == bytes32(0) || detailsHash == bytes32(0)) revert ZeroValue();
        if (bankDetails[bankId] != bytes32(0)) revert BankExists(bankId);
        bankDetails[bankId] = detailsHash;
        emit BankRegistered(bankId, detailsHash);
    }

    /// @notice Assign a bank officer to a bank; zero removes them.
    function assignBankOfficer(bytes32 officerId, bytes32 bankId) external onlyRole(Roles.ADMIN) {
        if (!registry.isVerifiedAs(officerId, Roles.BANK)) revert NotABankOfficer(officerId);
        if (bankId != bytes32(0) && bankDetails[bankId] == bytes32(0)) revert BankNotFound(bankId);
        bankOf[officerId] = bankId;
        emit BankOfficerAssigned(officerId, bankId);
    }

    // --- Track records ---

    /// @notice Publish a new version of a farmer's track record. Every project
    /// listed (in ascending id order, no repeats) must be the farmer's and finished.
    function publishTrackRecord(bytes32 farmerId, bytes32[] calldata projectIds, bytes32 summaryHash) external {
        bytes32 officerId = _farmersOfficer(farmerId);
        if (summaryHash == bytes32(0)) revert ZeroValue();
        if (projectIds.length == 0 || projectIds.length > MAX_PROJECTS_PER_RECORD) revert BadProjectList();

        for (uint256 i = 0; i < projectIds.length; i++) {
            if (i > 0 && projectIds[i] <= projectIds[i - 1]) revert BadProjectList();
            ProjectLedger.Project memory p = projectLedger.getProject(projectIds[i]);
            if (p.terms.farmerId != farmerId) revert NotFarmersProject(projectIds[i]);
            if (p.stage != ProjectLedger.Stage.PaidOut && p.stage != ProjectLedger.Stage.Closed) {
                revert ProjectNotFinished(projectIds[i], p.stage);
            }
        }

        uint32 version = ++latestVersion[farmerId];
        _records[farmerId][version] =
            TrackRecord({summaryHash: summaryHash, publishedBy: officerId, publishedAt: uint64(block.timestamp)});
        _recordProjects[farmerId][version] = projectIds;
        emit TrackRecordPublished(farmerId, version, summaryHash, projectIds, officerId);
    }

    // --- Consent ---

    /// @notice Record (or renew) the farmer's permission for a bank to view their summary.
    function grantConsent(bytes32 farmerId, bytes32 bankId, uint64 expiresAt) external {
        bytes32 officerId = _farmersOfficer(farmerId);
        if (bankDetails[bankId] == bytes32(0)) revert BankNotFound(bankId);
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert InvalidExpiry(expiresAt);

        _consents[farmerId][bankId] =
            Consent({grantedBy: officerId, grantedAt: uint64(block.timestamp), expiresAt: expiresAt, revoked: false});
        emit ConsentGranted(farmerId, bankId, expiresAt, officerId);
    }

    /// @notice The farmer withdraws permission; the bank's access ends at once.
    function revokeConsent(bytes32 farmerId, bytes32 bankId) external {
        bytes32 officerId = _farmersOfficer(farmerId);
        if (!hasConsent(farmerId, bankId)) revert NoActiveConsent(farmerId, bankId);
        _consents[farmerId][bankId].revoked = true;
        emit ConsentRevoked(farmerId, bankId, officerId);
    }

    // --- Bank access ---

    /// @notice A bank officer views a farmer's latest summary. Refused without active
    /// permission for their bank; every view is logged. Returns what to check the
    /// summary against.
    function viewSummary(bytes32 farmerId)
        external
        onlyRole(Roles.BANK)
        returns (uint32 version, bytes32 summaryHash)
    {
        bytes32 viewerId = _callerId();
        bytes32 bankId = bankOf[viewerId];
        if (bankId == bytes32(0)) revert NotAssignedToBank(msg.sender);
        if (!hasConsent(farmerId, bankId)) revert NoActiveConsent(farmerId, bankId);
        version = latestVersion[farmerId];
        if (version == 0) revert NoTrackRecord(farmerId);

        summaryHash = _records[farmerId][version].summaryHash;
        viewCount[farmerId][bankId]++;
        emit SummaryViewed(farmerId, bankId, viewerId, version);
    }

    // --- Views ---

    /// @notice True while the bank's permission is granted, not withdrawn and not expired.
    function hasConsent(bytes32 farmerId, bytes32 bankId) public view returns (bool) {
        Consent storage c = _consents[farmerId][bankId];
        return c.grantedAt != 0 && !c.revoked && (c.expiresAt == 0 || block.timestamp < c.expiresAt);
    }

    function getConsent(bytes32 farmerId, bytes32 bankId) external view returns (Consent memory) {
        return _consents[farmerId][bankId];
    }

    function getTrackRecord(bytes32 farmerId, uint32 version) external view returns (TrackRecord memory) {
        return _records[farmerId][version];
    }

    function getTrackRecordProjects(bytes32 farmerId, uint32 version) external view returns (bytes32[] memory) {
        return _recordProjects[farmerId][version];
    }

    // --- Internals ---

    /// @dev Caller must be the farmer's field officer. Returns the officer's id.
    function _farmersOfficer(bytes32 farmerId) private view returns (bytes32 officerId) {
        officerId = _callerId();
        if (!_hasRole(Roles.FIELD_OFFICER) || registry.fieldOfficerOf(farmerId) != officerId) {
            revert NotFarmersOfficer(msg.sender);
        }
    }
}

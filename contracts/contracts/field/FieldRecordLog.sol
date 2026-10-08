// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessGuarded} from "../access/AccessGuarded.sol";
import {AccessRegistry} from "../access/AccessRegistry.sol";
import {Roles} from "../access/Roles.sol";
import {ProjectLedger} from "../projects/ProjectLedger.sol";

/// @title FieldRecordLog
/// @notice Append-only farm records. Only hashes go on-chain (notes, measurements,
/// location, photo); the data stays off-chain. Entries are never edited: a
/// correction is a new entry pointing at the one it corrects.
/// Only the farmer's own field officer records, from Funded until ReadyForSale.
/// Entry ids come from the device, so re-sending an offline draft cannot duplicate it.
contract FieldRecordLog is AccessGuarded {
    struct EntryInput {
        bytes32 entryId; // generated on the device
        bytes32 projectId;
        bytes32 entryType; // e.g. "GROWTH_CHECK", from the app's record-type list
        bytes32 dataHash; // notes, measurements, location
        bytes32 photoHash; // 0 = no photo
        bytes32 correctsEntryId; // 0 = not a correction
        uint64 observedAt; // device time, may be earlier than recordedAt when offline
    }

    struct Entry {
        bytes32 projectId;
        bytes32 entryType;
        bytes32 dataHash;
        bytes32 photoHash;
        bytes32 correctsEntryId;
        bytes32 recordedBy;
        uint64 observedAt;
        uint64 recordedAt;
    }

    ProjectLedger public immutable projectLedger;

    mapping(bytes32 entryId => Entry) private _entries;
    mapping(bytes32 projectId => uint256) public entryCount;

    event EntryAdded(
        bytes32 indexed entryId,
        bytes32 indexed projectId,
        bytes32 entryType,
        bytes32 dataHash,
        bytes32 photoHash,
        bytes32 correctsEntryId,
        bytes32 indexed recordedBy,
        uint64 observedAt
    );

    error ZeroValue();
    error ZeroProjectLedger();
    error EntryExists(bytes32 entryId);
    error EntryNotFound(bytes32 entryId);
    error CorrectionMismatch(bytes32 correctsEntryId);
    error WrongProjectStage(bytes32 projectId, ProjectLedger.Stage stage);
    error InvalidObservedAt(uint64 observedAt);
    error NotFarmersOfficer(address account);

    constructor(AccessRegistry registry_, ProjectLedger projectLedger_) AccessGuarded(registry_) {
        if (address(projectLedger_) == address(0)) revert ZeroProjectLedger();
        projectLedger = projectLedger_;
    }

    // --- Farm updates ---

    function addEntry(EntryInput calldata e) external onlyRole(Roles.FIELD_OFFICER) {
        if (e.entryId == bytes32(0) || e.entryType == bytes32(0) || e.dataHash == bytes32(0)) revert ZeroValue();
        if (_entries[e.entryId].recordedAt != 0) revert EntryExists(e.entryId);
        if (e.observedAt == 0 || e.observedAt > block.timestamp) revert InvalidObservedAt(e.observedAt);

        bytes32 officerId = _openProjectOfficer(e.projectId);

        if (e.correctsEntryId != bytes32(0)) {
            Entry storage original = _entries[e.correctsEntryId];
            if (original.recordedAt == 0) revert EntryNotFound(e.correctsEntryId);
            if (original.projectId != e.projectId) revert CorrectionMismatch(e.correctsEntryId);
        }

        _entries[e.entryId] = Entry({
            projectId: e.projectId,
            entryType: e.entryType,
            dataHash: e.dataHash,
            photoHash: e.photoHash,
            correctsEntryId: e.correctsEntryId,
            recordedBy: officerId,
            observedAt: e.observedAt,
            recordedAt: uint64(block.timestamp)
        });
        entryCount[e.projectId]++;

        emit EntryAdded(
            e.entryId, e.projectId, e.entryType, e.dataHash, e.photoHash, e.correctsEntryId, officerId, e.observedAt
        );
    }

    // --- Views ---

    function getEntry(bytes32 entryId) external view returns (Entry memory) {
        return _entries[entryId];
    }

    /// @notice Verify: true if re-computed hashes match the stored entry.
    function verifyEntry(bytes32 entryId, bytes32 dataHash, bytes32 photoHash) external view returns (bool) {
        Entry storage e = _entries[entryId];
        return e.recordedAt != 0 && e.dataHash == dataHash && e.photoHash == photoHash;
    }

    // --- Internals ---

    /// @dev Project must be Funded, Active or ReadyForSale, and the caller its farmer's
    /// field officer. Returns the officer's participant id.
    function _openProjectOfficer(bytes32 projectId) private view returns (bytes32 officerId) {
        ProjectLedger.Project memory p = projectLedger.getProject(projectId);
        if (
            p.stage != ProjectLedger.Stage.Funded && p.stage != ProjectLedger.Stage.Active
                && p.stage != ProjectLedger.Stage.ReadyForSale
        ) revert WrongProjectStage(projectId, p.stage);

        officerId = _callerId();
        if (registry.fieldOfficerOf(p.terms.farmerId) != officerId) revert NotFarmersOfficer(msg.sender);
    }
}

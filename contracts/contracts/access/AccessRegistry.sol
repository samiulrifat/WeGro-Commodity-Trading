// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title AccessRegistry
/// @notice Who is allowed to do what on the platform. Every other contract asks
/// this registry whether the caller holds a role.
///
/// Two separate things live here:
/// - Roles, granted to signer addresses. The backend holds one signing key per
///   role and sends transactions with it.
/// - Participants: the people behind those roles (farmers, investors, ...).
///   Only a code number and a fingerprint (hash) of the person's details are
///   stored. Names and other personal details stay in the backend database.
contract AccessRegistry is AccessControl {
    bytes32 public constant INVESTOR_ROLE = keccak256("INVESTOR_ROLE");
    bytes32 public constant FARMER_ROLE = keccak256("FARMER_ROLE");
    bytes32 public constant FIELD_OFFICER_ROLE = keccak256("FIELD_OFFICER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ACCOUNTS_ROLE = keccak256("ACCOUNTS_ROLE");
    bytes32 public constant WAREHOUSE_ROLE = keccak256("WAREHOUSE_ROLE");
    bytes32 public constant BANK_ROLE = keccak256("BANK_ROLE");
    bytes32 public constant SUPPLIER_ROLE = keccak256("SUPPLIER_ROLE");
    bytes32 public constant BUYER_ROLE = keccak256("BUYER_ROLE");
    bytes32 public constant INSURER_ROLE = keccak256("INSURER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    /// @dev `None` means the participant id has never been registered.
    enum Status {
        None,
        Pending,
        Verified,
        Rejected
    }

    struct Participant {
        bytes32 role;
        bytes32 detailsHash;
        Status status;
        uint64 registeredAt;
        uint64 updatedAt;
    }

    mapping(bytes32 participantId => Participant) private _participants;

    event ParticipantRegistered(
        bytes32 indexed participantId,
        bytes32 indexed role,
        bytes32 detailsHash,
        address indexed registeredBy
    );
    event ParticipantStatusChanged(
        bytes32 indexed participantId,
        Status previousStatus,
        Status newStatus,
        address indexed changedBy
    );
    event ParticipantDetailsUpdated(
        bytes32 indexed participantId,
        bytes32 previousHash,
        bytes32 newHash,
        address indexed updatedBy
    );

    error ZeroAddress();
    error ZeroValue();
    error UnknownRole(bytes32 role);
    error NotRegistrar(address account);
    error ParticipantAlreadyRegistered(bytes32 participantId);
    error ParticipantNotFound(bytes32 participantId);
    error StatusUnchanged(bytes32 participantId, Status status);

    /// @param superAdmin Address that can grant and revoke roles. This is the
    /// platform operator key, not the WeGro admin role.
    constructor(address superAdmin) {
        if (superAdmin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, superAdmin);
    }

    // ---------------------------------------------------------------------
    // Roles
    // ---------------------------------------------------------------------

    /// @notice True for the eleven platform roles. DEFAULT_ADMIN_ROLE is not
    /// a platform role.
    function isPlatformRole(bytes32 role) public pure returns (bool) {
        return
            role == INVESTOR_ROLE ||
            role == FARMER_ROLE ||
            role == FIELD_OFFICER_ROLE ||
            role == ADMIN_ROLE ||
            role == ACCOUNTS_ROLE ||
            role == WAREHOUSE_ROLE ||
            role == BANK_ROLE ||
            role == SUPPLIER_ROLE ||
            role == BUYER_ROLE ||
            role == INSURER_ROLE ||
            role == AUDITOR_ROLE;
    }

    /// @dev Only the eleven platform roles (and DEFAULT_ADMIN_ROLE itself) can
    /// be granted, so a typo in a role name fails loudly instead of creating
    /// a role nobody checks.
    function _grantRole(bytes32 role, address account) internal override returns (bool) {
        if (role != DEFAULT_ADMIN_ROLE && !isPlatformRole(role)) revert UnknownRole(role);
        if (account == address(0)) revert ZeroAddress();
        return super._grantRole(role, account);
    }

    // ---------------------------------------------------------------------
    // Participants (practice ID check, FR-2)
    // ---------------------------------------------------------------------

    /// @notice Register a person under a code number. Starts as Pending.
    /// @dev Callable by the field officer or admin signer.
    function registerParticipant(bytes32 participantId, bytes32 role, bytes32 detailsHash) external {
        if (!hasRole(FIELD_OFFICER_ROLE, msg.sender) && !hasRole(ADMIN_ROLE, msg.sender)) {
            revert NotRegistrar(msg.sender);
        }
        if (participantId == bytes32(0) || detailsHash == bytes32(0)) revert ZeroValue();
        if (!isPlatformRole(role)) revert UnknownRole(role);
        if (_participants[participantId].status != Status.None) {
            revert ParticipantAlreadyRegistered(participantId);
        }

        uint64 now_ = uint64(block.timestamp);
        _participants[participantId] = Participant({
            role: role,
            detailsHash: detailsHash,
            status: Status.Pending,
            registeredAt: now_,
            updatedAt: now_
        });

        emit ParticipantRegistered(participantId, role, detailsHash, msg.sender);
    }

    /// @notice Mark a participant as having passed the ID check. Also used to
    /// re-verify someone who was rejected earlier.
    function verifyParticipant(bytes32 participantId) external onlyRole(ADMIN_ROLE) {
        _setStatus(participantId, Status.Verified);
    }

    /// @notice Mark a participant as having failed the ID check. Also used to
    /// withdraw an earlier verification.
    function rejectParticipant(bytes32 participantId) external onlyRole(ADMIN_ROLE) {
        _setStatus(participantId, Status.Rejected);
    }

    /// @notice Replace the details fingerprint after a correction to the
    /// person's details in the database. The old hash stays in the event log.
    function updateDetailsHash(bytes32 participantId, bytes32 newHash) external onlyRole(ADMIN_ROLE) {
        if (newHash == bytes32(0)) revert ZeroValue();
        Participant storage p = _existing(participantId);
        bytes32 previous = p.detailsHash;
        p.detailsHash = newHash;
        p.updatedAt = uint64(block.timestamp);
        emit ParticipantDetailsUpdated(participantId, previous, newHash, msg.sender);
    }

    function getParticipant(bytes32 participantId) external view returns (Participant memory) {
        return _participants[participantId];
    }

    function isVerified(bytes32 participantId) public view returns (bool) {
        return _participants[participantId].status == Status.Verified;
    }

    /// @notice True if the participant is verified and registered under `role`.
    /// Other contracts use this, for example to check a project's farmer.
    function isVerifiedAs(bytes32 participantId, bytes32 role) external view returns (bool) {
        Participant storage p = _participants[participantId];
        return p.status == Status.Verified && p.role == role;
    }

    function _setStatus(bytes32 participantId, Status newStatus) private {
        Participant storage p = _existing(participantId);
        Status previous = p.status;
        if (previous == newStatus) revert StatusUnchanged(participantId, newStatus);
        p.status = newStatus;
        p.updatedAt = uint64(block.timestamp);
        emit ParticipantStatusChanged(participantId, previous, newStatus, msg.sender);
    }

    function _existing(bytes32 participantId) private view returns (Participant storage p) {
        p = _participants[participantId];
        if (p.status == Status.None) revert ParticipantNotFound(participantId);
    }
}

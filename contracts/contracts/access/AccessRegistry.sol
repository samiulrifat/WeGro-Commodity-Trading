// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Roles} from "./Roles.sol";

/// @title AccessRegistry
/// @notice Roles and identities for every contract. Each person (participant) has
/// a stable code number, one role, their own key, and a hash of their details;
/// personal data stays off-chain.
/// Roles are granted only by verifying a participant and revoked by rejecting
/// them. Staff roles are managed only by the super admin.
contract AccessRegistry is AccessControl {
    bytes32 public constant INVESTOR_ROLE = Roles.INVESTOR;
    bytes32 public constant FARMER_ROLE = Roles.FARMER;
    bytes32 public constant FIELD_OFFICER_ROLE = Roles.FIELD_OFFICER;
    bytes32 public constant ADMIN_ROLE = Roles.ADMIN;
    bytes32 public constant ACCOUNTS_ROLE = Roles.ACCOUNTS;
    bytes32 public constant WAREHOUSE_ROLE = Roles.WAREHOUSE;
    bytes32 public constant BANK_ROLE = Roles.BANK;
    bytes32 public constant SUPPLIER_ROLE = Roles.SUPPLIER;
    bytes32 public constant BUYER_ROLE = Roles.BUYER;
    bytes32 public constant INSURER_ROLE = Roles.INSURER;
    bytes32 public constant AUDITOR_ROLE = Roles.AUDITOR;
    bytes32 public constant OPERATIONS_ROLE = Roles.OPERATIONS;

    /// @dev None = never registered.
    enum Status {
        None,
        Pending,
        Verified,
        Rejected
    }

    struct Participant {
        bytes32 role;
        address account;
        bytes32 detailsHash;
        Status status;
        uint64 registeredAt;
        uint64 updatedAt;
    }

    mapping(bytes32 participantId => Participant) private _participants;

    /// @notice Participant id for a current key, or zero.
    mapping(address account => bytes32 participantId) public participantOf;

    /// @notice Keys are single-use: once assigned, never reassigned (even after replacement).
    mapping(address account => bool) public accountUsed;

    /// @notice A farmer's field officer: who onboarded them, or whom the admin assigned.
    mapping(bytes32 farmerId => bytes32 officerId) public fieldOfficerOf;

    event ParticipantRegistered(
        bytes32 indexed participantId,
        bytes32 indexed role,
        address indexed account,
        bytes32 detailsHash,
        address registeredBy
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
    event FieldOfficerAssigned(bytes32 indexed farmerId, bytes32 indexed officerId, address indexed assignedBy);
    event ParticipantAccountChanged(
        bytes32 indexed participantId,
        address indexed previousAccount,
        address indexed newAccount,
        address changedBy
    );

    error ZeroAddress();
    error ZeroValue();
    error UnknownRole(bytes32 role);
    error NotAuthorized(address account);
    error RoleManagedByRegistry(bytes32 role);
    error ParticipantAlreadyRegistered(bytes32 participantId);
    error ParticipantNotFound(bytes32 participantId);
    error AccountAlreadyUsed(address account);
    error StatusUnchanged(bytes32 participantId, Status status);
    error NotAFarmer(bytes32 participantId);
    error NotAFieldOfficer(bytes32 participantId);

    /// @param superAdmin Platform operator key; manages staff, cannot be a participant.
    constructor(address superAdmin) {
        if (superAdmin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, superAdmin);
    }

    // --- Roles ---

    function isPlatformRole(bytes32 role) public pure returns (bool) {
        return
            isStaffRole(role) ||
            role == INVESTOR_ROLE ||
            role == FARMER_ROLE ||
            role == WAREHOUSE_ROLE ||
            role == BANK_ROLE ||
            role == SUPPLIER_ROLE ||
            role == BUYER_ROLE ||
            role == INSURER_ROLE;
    }

    /// @notice Staff roles, managed only by the super admin.
    function isStaffRole(bytes32 role) public pure returns (bool) {
        return role == ADMIN_ROLE || role == ACCOUNTS_ROLE || role == FIELD_OFFICER_ROLE || role == AUDITOR_ROLE
            || role == OPERATIONS_ROLE;
    }

    /// @dev Platform roles follow participant status; only DEFAULT_ADMIN_ROLE is set directly.
    function grantRole(bytes32 role, address account) public override {
        if (isPlatformRole(role)) revert RoleManagedByRegistry(role);
        if (accountUsed[account]) revert AccountAlreadyUsed(account);
        super.grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) public override {
        if (isPlatformRole(role)) revert RoleManagedByRegistry(role);
        super.revokeRole(role, account);
    }

    function renounceRole(bytes32 role, address callerConfirmation) public override {
        if (isPlatformRole(role)) revert RoleManagedByRegistry(role);
        super.renounceRole(role, callerConfirmation);
    }

    /// @dev Rejects unknown roles so typos fail loudly.
    function _grantRole(bytes32 role, address account) internal override returns (bool) {
        if (role != DEFAULT_ADMIN_ROLE && !isPlatformRole(role)) revert UnknownRole(role);
        if (account == address(0)) revert ZeroAddress();
        return super._grantRole(role, account);
    }

    // --- Participants (practice ID check, FR-2) ---

    /// @notice Register a person as Pending (no role yet). Staff: super admin only;
    /// others: field officer or admin. A farmer registered by a field officer is
    /// assigned to that officer.
    function registerParticipant(bytes32 participantId, bytes32 role, address account, bytes32 detailsHash)
        external
    {
        if (!isPlatformRole(role)) revert UnknownRole(role);
        if (isStaffRole(role)) {
            _requireSuperAdmin();
        } else if (!hasRole(FIELD_OFFICER_ROLE, msg.sender) && !hasRole(ADMIN_ROLE, msg.sender)) {
            revert NotAuthorized(msg.sender);
        }
        if (participantId == bytes32(0) || detailsHash == bytes32(0)) revert ZeroValue();
        if (_participants[participantId].status != Status.None) {
            revert ParticipantAlreadyRegistered(participantId);
        }
        _claimAccount(account);

        uint64 now_ = uint64(block.timestamp);
        _participants[participantId] = Participant({
            role: role,
            account: account,
            detailsHash: detailsHash,
            status: Status.Pending,
            registeredAt: now_,
            updatedAt: now_
        });
        participantOf[account] = participantId;

        emit ParticipantRegistered(participantId, role, account, detailsHash, msg.sender);

        if (role == FARMER_ROLE && hasRole(FIELD_OFFICER_ROLE, msg.sender)) {
            bytes32 officerId = participantOf[msg.sender];
            fieldOfficerOf[participantId] = officerId;
            emit FieldOfficerAssigned(participantId, officerId, msg.sender);
        }
    }

    /// @notice Admin assigns or reassigns a farmer's field officer.
    function assignFieldOfficer(bytes32 farmerId, bytes32 officerId) external onlyRole(ADMIN_ROLE) {
        Participant storage farmer = _participants[farmerId];
        if (farmer.status == Status.None) revert ParticipantNotFound(farmerId);
        if (farmer.role != FARMER_ROLE) revert NotAFarmer(farmerId);
        Participant storage officer = _participants[officerId];
        if (officer.status != Status.Verified || officer.role != FIELD_OFFICER_ROLE) revert NotAFieldOfficer(officerId);

        fieldOfficerOf[farmerId] = officerId;
        emit FieldOfficerAssigned(farmerId, officerId, msg.sender);
    }

    /// @notice Verify (or re-verify) and grant the role to their key.
    function verifyParticipant(bytes32 participantId) external {
        Participant storage p = _managed(participantId);
        _setStatus(participantId, p, Status.Verified);
        _grantRole(p.role, p.account);
    }

    /// @notice Reject (or withdraw verification) and revoke the role.
    function rejectParticipant(bytes32 participantId) external {
        Participant storage p = _managed(participantId);
        _setStatus(participantId, p, Status.Rejected);
        _revokeRole(p.role, p.account);
    }

    /// @notice Replace the details hash after a correction. Status is unchanged.
    function updateDetailsHash(bytes32 participantId, bytes32 newHash) external {
        if (newHash == bytes32(0)) revert ZeroValue();
        Participant storage p = _managed(participantId);
        bytes32 previous = p.detailsHash;
        p.detailsHash = newHash;
        p.updatedAt = uint64(block.timestamp);
        emit ParticipantDetailsUpdated(participantId, previous, newHash, msg.sender);
    }

    /// @notice Replace a lost or leaked key; the role moves and the old key is retired.
    function changeAccount(bytes32 participantId, address newAccount) external {
        Participant storage p = _managed(participantId);
        _claimAccount(newAccount);

        address previous = p.account;
        if (p.status == Status.Verified) {
            _revokeRole(p.role, previous);
            _grantRole(p.role, newAccount);
        }
        delete participantOf[previous];
        participantOf[newAccount] = participantId;
        p.account = newAccount;
        p.updatedAt = uint64(block.timestamp);

        emit ParticipantAccountChanged(participantId, previous, newAccount, msg.sender);
    }

    function getParticipant(bytes32 participantId) external view returns (Participant memory) {
        return _participants[participantId];
    }

    function isVerified(bytes32 participantId) external view returns (bool) {
        return _participants[participantId].status == Status.Verified;
    }

    /// @notice True if verified and registered under `role`.
    function isVerifiedAs(bytes32 participantId, bytes32 role) external view returns (bool) {
        Participant storage p = _participants[participantId];
        return p.status == Status.Verified && p.role == role;
    }

    // --- Internals ---

    /// @dev Loads a participant; caller must be super admin (staff) or admin (others).
    function _managed(bytes32 participantId) private view returns (Participant storage p) {
        p = _participants[participantId];
        if (p.status == Status.None) revert ParticipantNotFound(participantId);
        if (isStaffRole(p.role)) {
            _requireSuperAdmin();
        } else if (!hasRole(ADMIN_ROLE, msg.sender)) {
            revert NotAuthorized(msg.sender);
        }
    }

    function _setStatus(bytes32 participantId, Participant storage p, Status newStatus) private {
        Status previous = p.status;
        if (previous == newStatus) revert StatusUnchanged(participantId, newStatus);
        p.status = newStatus;
        p.updatedAt = uint64(block.timestamp);
        emit ParticipantStatusChanged(participantId, previous, newStatus, msg.sender);
    }

    /// @dev One participant per key, ever; never a super admin's key.
    function _claimAccount(address account) private {
        if (account == address(0)) revert ZeroAddress();
        if (accountUsed[account] || hasRole(DEFAULT_ADMIN_ROLE, account)) revert AccountAlreadyUsed(account);
        accountUsed[account] = true;
    }

    function _requireSuperAdmin() private view {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotAuthorized(msg.sender);
    }
}

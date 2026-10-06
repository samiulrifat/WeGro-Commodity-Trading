// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Roles} from "./Roles.sol";

/// @title AccessRegistry
/// @notice Who is allowed to do what on the platform. Every other contract asks
/// this registry whether the caller holds a role, and who the caller is.
///
/// Every person has their own key (address). The backend holds the keys and
/// signs on each person's behalf, so the ledger records who did what.
///
/// A person is a participant: a code number (the stable id other contracts
/// store), one platform role, their current key, and a fingerprint (hash) of
/// their details. Names and other personal details stay in the backend
/// database. The key can be replaced if it is lost; the code number cannot.
///
/// Platform roles are never granted by hand. Verifying a participant gives
/// their key the role; rejecting them takes it away. So holding a role always
/// means "verified person".
///
/// Staff roles (admin, accounts, field officer, auditor) are managed only by
/// the super admin, so an admin cannot create or verify another admin.
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

    /// @dev `None` means the participant id has never been registered.
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

    /// @notice The participant whose current key is `account`, or zero.
    mapping(address account => bytes32 participantId) public participantOf;

    /// @notice True once a key has belonged to any participant. A key is never
    /// reused, even after it is replaced, since it may have been leaked.
    mapping(address account => bool) public accountUsed;

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

    /// @param superAdmin The platform operator key. It manages staff and can
    /// appoint further super admins. It is not a platform role and cannot
    /// also be a participant.
    constructor(address superAdmin) {
        if (superAdmin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, superAdmin);
    }

    // ---------------------------------------------------------------------
    // Roles
    // ---------------------------------------------------------------------

    /// @notice True for the eleven platform roles.
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

    /// @notice WeGro staff roles, managed only by the super admin.
    function isStaffRole(bytes32 role) public pure returns (bool) {
        return role == ADMIN_ROLE || role == ACCOUNTS_ROLE || role == FIELD_OFFICER_ROLE || role == AUDITOR_ROLE;
    }

    /// @dev Platform roles follow participant status, so they cannot be
    /// granted, revoked or renounced directly. Only DEFAULT_ADMIN_ROLE can.
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

    /// @dev Rejects unknown roles, so a typo fails loudly instead of creating
    /// a role nobody checks.
    function _grantRole(bytes32 role, address account) internal override returns (bool) {
        if (role != DEFAULT_ADMIN_ROLE && !isPlatformRole(role)) revert UnknownRole(role);
        if (account == address(0)) revert ZeroAddress();
        return super._grantRole(role, account);
    }

    // ---------------------------------------------------------------------
    // Participants (practice ID check, FR-2)
    // ---------------------------------------------------------------------

    /// @notice Register a person and their key. Starts as Pending, with no
    /// role until verified. Staff are registered by the super admin; everyone
    /// else by a field officer or admin.
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
    }

    /// @notice Mark a participant as having passed the ID check and give their
    /// key the role. Also re-verifies someone who was rejected earlier.
    function verifyParticipant(bytes32 participantId) external {
        Participant storage p = _managed(participantId);
        _setStatus(participantId, p, Status.Verified);
        _grantRole(p.role, p.account);
    }

    /// @notice Mark a participant as having failed the ID check, or withdraw
    /// an earlier verification. Their key loses the role immediately.
    function rejectParticipant(bytes32 participantId) external {
        Participant storage p = _managed(participantId);
        _setStatus(participantId, p, Status.Rejected);
        _revokeRole(p.role, p.account);
    }

    /// @notice Replace the details fingerprint after a correction to the
    /// person's details in the database. Status is unchanged; the old hash
    /// stays in the event log.
    function updateDetailsHash(bytes32 participantId, bytes32 newHash) external {
        if (newHash == bytes32(0)) revert ZeroValue();
        Participant storage p = _managed(participantId);
        bytes32 previous = p.detailsHash;
        p.detailsHash = newHash;
        p.updatedAt = uint64(block.timestamp);
        emit ParticipantDetailsUpdated(participantId, previous, newHash, msg.sender);
    }

    /// @notice Replace a lost or leaked key. The role moves to the new key;
    /// the old key is retired for good. Holdings and history are tied to the
    /// participant id, so nothing else changes.
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

    /// @notice True if the participant is verified and registered under `role`.
    /// Other contracts use this, for example to check a project's farmer.
    function isVerifiedAs(bytes32 participantId, bytes32 role) external view returns (bool) {
        Participant storage p = _participants[participantId];
        return p.status == Status.Verified && p.role == role;
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// @dev Loads a participant and checks the caller may manage them: the
    /// super admin for staff, the admin for everyone else.
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

    /// @dev A key belongs to one participant, ever, and never to a super admin.
    function _claimAccount(address account) private {
        if (account == address(0)) revert ZeroAddress();
        if (accountUsed[account] || hasRole(DEFAULT_ADMIN_ROLE, account)) revert AccountAlreadyUsed(account);
        accountUsed[account] = true;
    }

    function _requireSuperAdmin() private view {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotAuthorized(msg.sender);
    }
}

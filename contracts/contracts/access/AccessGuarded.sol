// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessRegistry} from "./AccessRegistry.sol";
import {Roles} from "./Roles.sol";

/// @title AccessGuarded
/// @notice Base for platform contracts: role checks via the shared AccessRegistry.
abstract contract AccessGuarded {
    AccessRegistry public immutable registry;

    error MissingRole(address account, bytes32 role);
    error ZeroRegistry();

    constructor(AccessRegistry registry_) {
        if (address(registry_) == address(0)) revert ZeroRegistry();
        registry = registry_;
    }

    modifier onlyRole(bytes32 role) {
        _checkRole(role);
        _;
    }

    function _checkRole(bytes32 role) internal view {
        if (!_hasRole(role)) revert MissingRole(msg.sender, role);
    }

    /// @dev The role itself, or the super admin for an office role: the super
    /// admin holds every office power (admin, operations, accounts, auditor),
    /// never the roles of people outside the office.
    function _hasRole(bytes32 role) internal view returns (bool) {
        if (registry.hasRole(role, msg.sender)) return true;
        return Roles.isOffice(role) && _isSuperAdmin();
    }

    function _isSuperAdmin() internal view returns (bool) {
        return registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), msg.sender);
    }

    /// @dev An admin, or the super admin.
    modifier onlyAdmin() {
        if (!_isAdmin()) revert MissingRole(msg.sender, Roles.ADMIN);
        _;
    }

    function _isAdmin() internal view returns (bool) {
        return _hasRole(Roles.ADMIN);
    }

    /// @dev Caller's participant id; the super admin, who is not a
    /// participant, acts as SUPER_ADMIN_ID. Use only after a role check.
    function _callerId() internal view returns (bytes32) {
        bytes32 id = registry.participantOf(msg.sender);
        if (id == bytes32(0) && _isSuperAdmin()) return Roles.SUPER_ADMIN_ID;
        return id;
    }
}

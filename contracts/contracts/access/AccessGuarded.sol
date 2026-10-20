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

    function _hasRole(bytes32 role) internal view returns (bool) {
        return registry.hasRole(role, msg.sender);
    }

    /// @dev An admin, or the super admin (who may do what admins do here).
    modifier onlyAdmin() {
        if (!_isAdmin()) revert MissingRole(msg.sender, Roles.ADMIN);
        _;
    }

    function _isAdmin() internal view returns (bool) {
        return _hasRole(Roles.ADMIN) || _hasRole(registry.DEFAULT_ADMIN_ROLE());
    }

    /// @dev Caller's participant id. Use only after a role check.
    function _callerId() internal view returns (bytes32) {
        return registry.participantOf(msg.sender);
    }
}

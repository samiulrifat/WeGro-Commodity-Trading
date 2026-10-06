// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessRegistry} from "./AccessRegistry.sol";

/// @title AccessGuarded
/// @notice Base for the other platform contracts: role checks go through the
/// shared AccessRegistry instead of each contract keeping its own roles.
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
        if (!registry.hasRole(role, msg.sender)) revert MissingRole(msg.sender, role);
    }
}

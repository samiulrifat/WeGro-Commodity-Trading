// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

/// @title Roles
/// @notice The twelve platform roles.
library Roles {
    bytes32 internal constant INVESTOR = keccak256("INVESTOR_ROLE");
    bytes32 internal constant FARMER = keccak256("FARMER_ROLE");
    bytes32 internal constant FIELD_OFFICER = keccak256("FIELD_OFFICER_ROLE");
    bytes32 internal constant ADMIN = keccak256("ADMIN_ROLE");
    bytes32 internal constant ACCOUNTS = keccak256("ACCOUNTS_ROLE");
    bytes32 internal constant WAREHOUSE = keccak256("WAREHOUSE_ROLE");
    bytes32 internal constant BANK = keccak256("BANK_ROLE");
    bytes32 internal constant SUPPLIER = keccak256("SUPPLIER_ROLE");
    bytes32 internal constant BUYER = keccak256("BUYER_ROLE");
    bytes32 internal constant INSURER = keccak256("INSURER_ROLE");
    bytes32 internal constant AUDITOR = keccak256("AUDITOR_ROLE");
    bytes32 internal constant OPERATIONS = keccak256("OPERATIONS_ROLE");
    /// @notice An external seller listing produce in the marketplace.
    bytes32 internal constant SELLER = keccak256("SELLER_ROLE");

    /// @notice Who the super admin is in records that keep a participant id
    /// (who prepared, approved, entered): it is not a registered participant.
    bytes32 internal constant SUPER_ADMIN_ID = keccak256("SUPER_ADMIN");

    /// @notice Office roles, whose powers the super admin also holds.
    function isOffice(bytes32 role) internal pure returns (bool) {
        return role == ADMIN || role == OPERATIONS || role == ACCOUNTS || role == AUDITOR;
    }
}

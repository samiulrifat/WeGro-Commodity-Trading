// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {AccessRegistry} from "../contracts/access/AccessRegistry.sol";
import {AccessGuarded} from "../contracts/access/AccessGuarded.sol";

contract GuardedMock is AccessGuarded {
    uint256 public calls;

    constructor(AccessRegistry registry_) AccessGuarded(registry_) {}

    function adminOnly() external onlyRole(registry.ADMIN_ROLE()) {
        calls++;
    }
}

contract AccessRegistryTest is Test {
    AccessRegistry registry;

    address superAdmin = makeAddr("superAdmin");
    address admin = makeAddr("admin");
    address officer = makeAddr("officer");
    address accounts = makeAddr("accounts");
    address stranger = makeAddr("stranger");

    bytes32 constant RAHIM = keccak256("FARMER-0001");
    bytes32 constant RAHIM_DETAILS = keccak256("rahim-details-v1");

    bytes32 FARMER;
    bytes32 ADMIN;
    bytes32 OFFICER;

    function setUp() public {
        registry = new AccessRegistry(superAdmin);
        FARMER = registry.FARMER_ROLE();
        ADMIN = registry.ADMIN_ROLE();
        OFFICER = registry.FIELD_OFFICER_ROLE();

        vm.startPrank(superAdmin);
        registry.grantRole(ADMIN, admin);
        registry.grantRole(OFFICER, officer);
        registry.grantRole(registry.ACCOUNTS_ROLE(), accounts);
        vm.stopPrank();
    }

    function _registerRahim() internal {
        vm.prank(officer);
        registry.registerParticipant(RAHIM, FARMER, RAHIM_DETAILS);
    }

    // --- constructor and roles ------------------------------------------

    function test_ConstructorRejectsZeroAddress() public {
        vm.expectRevert(AccessRegistry.ZeroAddress.selector);
        new AccessRegistry(address(0));
    }

    function test_SuperAdminHoldsDefaultAdminRole() public view {
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), superAdmin));
        assertFalse(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));
    }

    function test_ElevenDistinctPlatformRoles() public view {
        bytes32[11] memory roles = [
            registry.INVESTOR_ROLE(),
            registry.FARMER_ROLE(),
            registry.FIELD_OFFICER_ROLE(),
            registry.ADMIN_ROLE(),
            registry.ACCOUNTS_ROLE(),
            registry.WAREHOUSE_ROLE(),
            registry.BANK_ROLE(),
            registry.SUPPLIER_ROLE(),
            registry.BUYER_ROLE(),
            registry.INSURER_ROLE(),
            registry.AUDITOR_ROLE()
        ];
        for (uint256 i = 0; i < roles.length; i++) {
            assertTrue(registry.isPlatformRole(roles[i]));
            for (uint256 j = i + 1; j < roles.length; j++) {
                assertTrue(roles[i] != roles[j]);
            }
        }
        assertFalse(registry.isPlatformRole(registry.DEFAULT_ADMIN_ROLE()));
        assertFalse(registry.isPlatformRole(keccak256("ADMN_ROLE")));
    }

    function test_GrantUnknownRoleReverts() public {
        bytes32 typo = keccak256("ADMN_ROLE");
        vm.prank(superAdmin);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.UnknownRole.selector, typo));
        registry.grantRole(typo, admin);
    }

    function test_GrantToZeroAddressReverts() public {
        vm.prank(superAdmin);
        vm.expectRevert(AccessRegistry.ZeroAddress.selector);
        registry.grantRole(ADMIN, address(0));
    }

    function test_OnlySuperAdminGrantsRoles() public {
        bytes32 defaultAdmin = registry.DEFAULT_ADMIN_ROLE();
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, admin, defaultAdmin)
        );
        registry.grantRole(OFFICER, stranger);
    }

    function test_SuperAdminRevokesRole() public {
        vm.prank(superAdmin);
        registry.revokeRole(ADMIN, admin);
        assertFalse(registry.hasRole(ADMIN, admin));
    }

    // --- registration -----------------------------------------------------

    function test_OfficerRegistersParticipantAsPending() public {
        vm.expectEmit(address(registry));
        emit AccessRegistry.ParticipantRegistered(RAHIM, FARMER, RAHIM_DETAILS, officer);
        _registerRahim();

        AccessRegistry.Participant memory p = registry.getParticipant(RAHIM);
        assertEq(p.role, FARMER);
        assertEq(p.detailsHash, RAHIM_DETAILS);
        assertEq(uint8(p.status), uint8(AccessRegistry.Status.Pending));
        assertEq(p.registeredAt, block.timestamp);
        assertFalse(registry.isVerified(RAHIM));
    }

    function test_AdminCanRegister() public {
        vm.prank(admin);
        registry.registerParticipant(RAHIM, FARMER, RAHIM_DETAILS);
        assertEq(uint8(registry.getParticipant(RAHIM).status), uint8(AccessRegistry.Status.Pending));
    }

    function test_OtherRolesCannotRegister() public {
        vm.prank(accounts);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotRegistrar.selector, accounts));
        registry.registerParticipant(RAHIM, FARMER, RAHIM_DETAILS);
    }

    function test_RegisterTwiceReverts() public {
        _registerRahim();
        vm.prank(officer);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.ParticipantAlreadyRegistered.selector, RAHIM));
        registry.registerParticipant(RAHIM, FARMER, keccak256("other"));
    }

    function test_RegisterRejectsZeroIdOrHash() public {
        vm.startPrank(officer);
        vm.expectRevert(AccessRegistry.ZeroValue.selector);
        registry.registerParticipant(bytes32(0), FARMER, RAHIM_DETAILS);
        vm.expectRevert(AccessRegistry.ZeroValue.selector);
        registry.registerParticipant(RAHIM, FARMER, bytes32(0));
        vm.stopPrank();
    }

    function test_RegisterRejectsUnknownRole() public {
        bytes32 defaultAdmin = registry.DEFAULT_ADMIN_ROLE();
        vm.prank(officer);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.UnknownRole.selector, defaultAdmin));
        registry.registerParticipant(RAHIM, defaultAdmin, RAHIM_DETAILS);
    }

    // --- verification -----------------------------------------------------

    function test_AdminVerifies() public {
        _registerRahim();
        vm.expectEmit(address(registry));
        emit AccessRegistry.ParticipantStatusChanged(
            RAHIM, AccessRegistry.Status.Pending, AccessRegistry.Status.Verified, admin
        );
        vm.prank(admin);
        registry.verifyParticipant(RAHIM);

        assertTrue(registry.isVerified(RAHIM));
        assertTrue(registry.isVerifiedAs(RAHIM, FARMER));
        assertFalse(registry.isVerifiedAs(RAHIM, registry.INVESTOR_ROLE()));
    }

    function test_OfficerCannotVerify() public {
        _registerRahim();
        vm.prank(officer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, officer, ADMIN)
        );
        registry.verifyParticipant(RAHIM);
    }

    function test_RejectThenReverify() public {
        _registerRahim();
        vm.startPrank(admin);
        registry.rejectParticipant(RAHIM);
        assertEq(uint8(registry.getParticipant(RAHIM).status), uint8(AccessRegistry.Status.Rejected));
        assertFalse(registry.isVerifiedAs(RAHIM, FARMER));

        registry.verifyParticipant(RAHIM);
        assertTrue(registry.isVerified(RAHIM));
        vm.stopPrank();
    }

    function test_WithdrawVerification() public {
        _registerRahim();
        vm.startPrank(admin);
        registry.verifyParticipant(RAHIM);
        registry.rejectParticipant(RAHIM);
        vm.stopPrank();
        assertFalse(registry.isVerified(RAHIM));
    }

    function test_SameStatusReverts() public {
        _registerRahim();
        vm.startPrank(admin);
        registry.verifyParticipant(RAHIM);
        vm.expectRevert(
            abi.encodeWithSelector(AccessRegistry.StatusUnchanged.selector, RAHIM, AccessRegistry.Status.Verified)
        );
        registry.verifyParticipant(RAHIM);
        vm.stopPrank();
    }

    function test_VerifyUnknownParticipantReverts() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.ParticipantNotFound.selector, RAHIM));
        registry.verifyParticipant(RAHIM);
    }

    function test_UnknownParticipantIsNotVerified() public view {
        assertFalse(registry.isVerified(RAHIM));
        assertEq(uint8(registry.getParticipant(RAHIM).status), uint8(AccessRegistry.Status.None));
    }

    // --- details hash -------------------------------------------------------

    function test_AdminUpdatesDetailsHash() public {
        _registerRahim();
        bytes32 v2 = keccak256("rahim-details-v2");
        vm.warp(block.timestamp + 1 days);

        vm.expectEmit(address(registry));
        emit AccessRegistry.ParticipantDetailsUpdated(RAHIM, RAHIM_DETAILS, v2, admin);
        vm.prank(admin);
        registry.updateDetailsHash(RAHIM, v2);

        AccessRegistry.Participant memory p = registry.getParticipant(RAHIM);
        assertEq(p.detailsHash, v2);
        assertEq(p.updatedAt, block.timestamp);
        assertLt(p.registeredAt, p.updatedAt);
    }

    function test_UpdateDetailsHashGuards() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.ParticipantNotFound.selector, RAHIM));
        registry.updateDetailsHash(RAHIM, keccak256("x"));

        _registerRahim();
        vm.prank(admin);
        vm.expectRevert(AccessRegistry.ZeroValue.selector);
        registry.updateDetailsHash(RAHIM, bytes32(0));

        vm.prank(officer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, officer, ADMIN)
        );
        registry.updateDetailsHash(RAHIM, keccak256("x"));
    }

    // --- AccessGuarded ------------------------------------------------------

    function test_GuardedAllowsRoleHolder() public {
        GuardedMock guarded = new GuardedMock(registry);
        vm.prank(admin);
        guarded.adminOnly();
        assertEq(guarded.calls(), 1);
    }

    function test_GuardedBlocksOthers() public {
        GuardedMock guarded = new GuardedMock(registry);
        vm.prank(officer);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, officer, ADMIN));
        guarded.adminOnly();
    }

    function test_GuardedFollowsRevocation() public {
        GuardedMock guarded = new GuardedMock(registry);
        vm.prank(superAdmin);
        registry.revokeRole(ADMIN, admin);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, admin, ADMIN));
        guarded.adminOnly();
    }

    function test_GuardedRejectsZeroRegistry() public {
        vm.expectRevert(AccessGuarded.ZeroRegistry.selector);
        new GuardedMock(AccessRegistry(address(0)));
    }

    function testFuzz_OnlyPlatformRolesGrantable(bytes32 role) public {
        vm.assume(role != registry.DEFAULT_ADMIN_ROLE() && !registry.isPlatformRole(role));
        vm.prank(superAdmin);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.UnknownRole.selector, role));
        registry.grantRole(role, stranger);
    }
}

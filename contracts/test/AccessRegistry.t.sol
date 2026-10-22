// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {AccessRegistry} from "../contracts/access/AccessRegistry.sol";
import {AccessGuarded} from "../contracts/access/AccessGuarded.sol";

contract GuardedMock is AccessGuarded {
    bytes32 public lastCaller;

    constructor(AccessRegistry registry_) AccessGuarded(registry_) {}

    function farmerOnly() external onlyRole(registry.FARMER_ROLE()) {
        lastCaller = _callerId();
    }
}

contract AccessRegistryTest is Test {
    AccessRegistry registry;

    address superAdmin = makeAddr("superAdmin");
    address tania = makeAddr("tania"); // admin
    address imran = makeAddr("imran"); // field officer
    address farhana = makeAddr("farhana"); // accounts
    address rahim = makeAddr("rahim"); // farmer
    address stranger = makeAddr("stranger");

    bytes32 constant TANIA = keccak256("STAFF-0001");
    bytes32 constant IMRAN = keccak256("STAFF-0002");
    bytes32 constant FARHANA = keccak256("STAFF-0003");
    bytes32 constant RAHIM = keccak256("FARMER-0001");
    bytes32 constant RAHIM_DETAILS = keccak256("rahim-details-v1");

    bytes32 FARMER;
    bytes32 ADMIN;
    bytes32 OFFICER;
    bytes32 ACCOUNTS;
    bytes32 SUPER;

    function setUp() public {
        registry = new AccessRegistry(superAdmin);
        FARMER = registry.FARMER_ROLE();
        ADMIN = registry.ADMIN_ROLE();
        OFFICER = registry.FIELD_OFFICER_ROLE();
        ACCOUNTS = registry.ACCOUNTS_ROLE();
        SUPER = registry.DEFAULT_ADMIN_ROLE();

        _staff(TANIA, ADMIN, tania);
        _staff(IMRAN, OFFICER, imran);
        _staff(FARHANA, ACCOUNTS, farhana);
    }

    function _staff(bytes32 id, bytes32 role, address account) internal {
        vm.startPrank(superAdmin);
        registry.registerParticipant(id, role, account, keccak256(abi.encode(id)));
        registry.verifyParticipant(id);
        vm.stopPrank();
    }

    function _registerRahim() internal {
        vm.prank(imran);
        registry.registerParticipant(RAHIM, FARMER, rahim, RAHIM_DETAILS);
    }

    function _status(bytes32 id) internal view returns (uint8) {
        return uint8(registry.getParticipant(id).status);
    }

    // --- constructor and roles ------------------------------------------

    function test_ConstructorRejectsZeroAddress() public {
        vm.expectRevert(AccessRegistry.ZeroAddress.selector);
        new AccessRegistry(address(0));
    }

    function test_SuperAdminSetup() public view {
        assertTrue(registry.hasRole(SUPER, superAdmin));
        assertFalse(registry.hasRole(SUPER, tania));
        assertTrue(registry.hasRole(ADMIN, tania));
        assertEq(registry.participantOf(tania), TANIA);
    }

    function test_TwelveDistinctPlatformRoles() public view {
        bytes32[12] memory roles = [
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
            registry.AUDITOR_ROLE(),
            registry.OPERATIONS_ROLE()
        ];
        uint256 staff;
        for (uint256 i = 0; i < roles.length; i++) {
            assertTrue(registry.isPlatformRole(roles[i]));
            if (registry.isStaffRole(roles[i])) staff++;
            for (uint256 j = i + 1; j < roles.length; j++) {
                assertTrue(roles[i] != roles[j]);
            }
        }
        assertEq(staff, 5);
        assertFalse(registry.isPlatformRole(SUPER));
        assertFalse(registry.isPlatformRole(keccak256("ADMN_ROLE")));
    }

    function test_PlatformRolesCannotBeGrantedByHand() public {
        vm.startPrank(superAdmin);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.RoleManagedByRegistry.selector, ADMIN));
        registry.grantRole(ADMIN, stranger);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.RoleManagedByRegistry.selector, ADMIN));
        registry.revokeRole(ADMIN, tania);
        vm.stopPrank();

        vm.prank(tania);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.RoleManagedByRegistry.selector, ADMIN));
        registry.renounceRole(ADMIN, tania);
    }

    function test_GrantUnknownRoleReverts() public {
        bytes32 typo = keccak256("ADMN_ROLE");
        vm.prank(superAdmin);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.UnknownRole.selector, typo));
        registry.grantRole(typo, stranger);
    }

    function test_SuperAdminAppointsAnotherSuperAdmin() public {
        vm.prank(superAdmin);
        registry.grantRole(SUPER, stranger);
        assertTrue(registry.hasRole(SUPER, stranger));

        vm.prank(stranger);
        registry.renounceRole(SUPER, stranger);
        assertFalse(registry.hasRole(SUPER, stranger));

        address other = makeAddr("other");
        vm.startPrank(superAdmin);
        registry.grantRole(SUPER, other);
        registry.revokeRole(SUPER, other);
        vm.stopPrank();
        assertFalse(registry.hasRole(SUPER, other));
    }

    function test_SuperAdminRoleGuards() public {
        vm.startPrank(superAdmin);
        vm.expectRevert(AccessRegistry.ZeroAddress.selector);
        registry.grantRole(SUPER, address(0));

        // A participant's key cannot also be a super admin.
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.AccountAlreadyUsed.selector, tania));
        registry.grantRole(SUPER, tania);
        vm.stopPrank();
    }

    function testFuzz_OnlyKnownRolesGrantable(bytes32 role) public {
        vm.assume(role != SUPER && !registry.isPlatformRole(role));
        vm.prank(superAdmin);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.UnknownRole.selector, role));
        registry.grantRole(role, stranger);
    }

    // --- registration -----------------------------------------------------

    function test_OfficerRegistersFarmerAsPending() public {
        vm.expectEmit(address(registry));
        emit AccessRegistry.ParticipantRegistered(RAHIM, FARMER, rahim, RAHIM_DETAILS, imran);
        _registerRahim();

        AccessRegistry.Participant memory p = registry.getParticipant(RAHIM);
        assertEq(p.role, FARMER);
        assertEq(p.account, rahim);
        assertEq(p.detailsHash, RAHIM_DETAILS);
        assertEq(uint8(p.status), uint8(AccessRegistry.Status.Pending));
        assertEq(p.registeredAt, block.timestamp);
        assertEq(registry.participantOf(rahim), RAHIM);
        assertTrue(registry.accountUsed(rahim));
        assertFalse(registry.isVerified(RAHIM));
        assertFalse(registry.hasRole(FARMER, rahim)); // no role until verified
    }

    function test_AdminCanRegisterNonStaff() public {
        vm.prank(tania);
        registry.registerParticipant(RAHIM, FARMER, rahim, RAHIM_DETAILS);
        assertEq(_status(RAHIM), uint8(AccessRegistry.Status.Pending));
    }

    function test_OtherRolesCannotRegister() public {
        vm.prank(farhana);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAuthorized.selector, farhana));
        registry.registerParticipant(RAHIM, FARMER, rahim, RAHIM_DETAILS);

        vm.prank(rahim); // not a participant yet, and no role
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAuthorized.selector, rahim));
        registry.registerParticipant(RAHIM, FARMER, rahim, RAHIM_DETAILS);
    }

    function test_SuperAdminDoesWhatAdminsDo() public {
        vm.prank(superAdmin); // every office power, staff and the rest
        registry.registerParticipant(RAHIM, FARMER, rahim, RAHIM_DETAILS);
        vm.startPrank(superAdmin);
        registry.verifyParticipant(RAHIM);
        registry.assignFieldOfficer(RAHIM, IMRAN);
        registry.updateDetailsHash(RAHIM, keccak256("rahim, corrected"));
        vm.stopPrank();
        assertTrue(registry.isVerified(RAHIM));
        assertEq(registry.fieldOfficerOf(RAHIM), IMRAN);
    }

    function test_FieldOfficerRegistersFarmersOnly() public {
        bytes32 investor = registry.INVESTOR_ROLE();
        bytes32 supplier = registry.SUPPLIER_ROLE();
        vm.startPrank(imran);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAuthorized.selector, imran));
        registry.registerParticipant(keccak256("INV-1"), investor, stranger, keccak256("x"));
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAuthorized.selector, imran));
        registry.registerParticipant(keccak256("SUP-1"), supplier, stranger, keccak256("x"));
        vm.stopPrank();

        // An admin registers any non-staff role.
        vm.prank(tania);
        registry.registerParticipant(keccak256("SUP-1"), supplier, stranger, keccak256("x"));
        assertEq(_status(keccak256("SUP-1")), uint8(AccessRegistry.Status.Pending));
    }

    function test_SelfRegistrationIsVerifiedAtOnce() public {
        bytes32 investor = registry.INVESTOR_ROLE();
        bytes32 id = keccak256("INV-SELF");
        address salma = makeAddr("salma");

        vm.expectEmit(true, true, true, true, address(registry));
        emit AccessRegistry.ParticipantRegistered(id, investor, salma, keccak256("salma"), superAdmin);
        vm.expectEmit(true, true, true, true, address(registry));
        emit AccessRegistry.ParticipantStatusChanged(
            id, AccessRegistry.Status.Pending, AccessRegistry.Status.Verified, superAdmin
        );
        vm.prank(superAdmin);
        registry.selfRegisterParticipant(id, investor, salma, keccak256("salma"));

        assertTrue(registry.isVerifiedAs(id, investor));
        assertTrue(registry.hasRole(investor, salma));
        assertEq(registry.participantOf(salma), id);

        bytes32 buyer = registry.BUYER_ROLE();
        vm.prank(superAdmin);
        registry.selfRegisterParticipant(keccak256("BUY-SELF"), buyer, makeAddr("karim"), keccak256("karim"));
        assertTrue(registry.isVerifiedAs(keccak256("BUY-SELF"), buyer));
    }

    function test_SellersSignUpThemselvesToo() public {
        bytes32 seller = registry.SELLER_ROLE();
        bytes32 id = keccak256("SELLER-SELF");
        address karim = makeAddr("karim");
        vm.expectEmit(address(registry));
        emit AccessRegistry.ParticipantSelfRegistered(id);
        vm.prank(superAdmin);
        registry.selfRegisterParticipant(id, seller, karim, keccak256("karim"));
        assertTrue(registry.isVerifiedAs(id, seller));
        assertTrue(registry.isPlatformRole(seller));
        assertFalse(registry.isStaffRole(seller));
    }

    function test_SelfRegistrationGuards() public {
        bytes32 investor = registry.INVESTOR_ROLE();
        // Only investors, buyers and sellers.
        vm.startPrank(superAdmin);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotSelfRegistrable.selector, FARMER));
        registry.selfRegisterParticipant(RAHIM, FARMER, rahim, RAHIM_DETAILS);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotSelfRegistrable.selector, ADMIN));
        registry.selfRegisterParticipant(RAHIM, ADMIN, rahim, RAHIM_DETAILS);
        vm.stopPrank();

        // Only the platform's key.
        vm.prank(tania);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAuthorized.selector, tania));
        registry.selfRegisterParticipant(keccak256("INV-1"), investor, stranger, keccak256("x"));

        // The same guards as any registration.
        vm.startPrank(superAdmin);
        vm.expectRevert(AccessRegistry.ZeroValue.selector);
        registry.selfRegisterParticipant(keccak256("INV-1"), investor, stranger, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.AccountAlreadyUsed.selector, tania));
        registry.selfRegisterParticipant(keccak256("INV-1"), investor, tania, keccak256("x"));
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.ParticipantAlreadyRegistered.selector, TANIA));
        registry.selfRegisterParticipant(TANIA, investor, stranger, keccak256("x"));
        vm.stopPrank();
    }

    function test_OnlySuperAdminRegistersStaff() public {
        bytes32 id = keccak256("STAFF-0099");
        vm.prank(tania);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAuthorized.selector, tania));
        registry.registerParticipant(id, ADMIN, stranger, keccak256("x"));

        bytes32 auditor = registry.AUDITOR_ROLE();
        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAuthorized.selector, imran));
        registry.registerParticipant(id, auditor, stranger, keccak256("x"));

        bytes32 operations = registry.OPERATIONS_ROLE();
        vm.prank(tania);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAuthorized.selector, tania));
        registry.registerParticipant(id, operations, stranger, keccak256("x"));
    }

    function test_RegisterTwiceReverts() public {
        _registerRahim();
        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.ParticipantAlreadyRegistered.selector, RAHIM));
        registry.registerParticipant(RAHIM, FARMER, stranger, keccak256("other"));
    }

    function test_OneKeyPerPerson() public {
        _registerRahim();
        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.AccountAlreadyUsed.selector, rahim));
        registry.registerParticipant(keccak256("FARMER-0002"), FARMER, rahim, keccak256("x"));

        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.AccountAlreadyUsed.selector, superAdmin));
        registry.registerParticipant(keccak256("FARMER-0002"), FARMER, superAdmin, keccak256("x"));
    }

    function test_RegisterGuards() public {
        vm.startPrank(imran);
        vm.expectRevert(AccessRegistry.ZeroValue.selector);
        registry.registerParticipant(bytes32(0), FARMER, rahim, RAHIM_DETAILS);
        vm.expectRevert(AccessRegistry.ZeroValue.selector);
        registry.registerParticipant(RAHIM, FARMER, rahim, bytes32(0));
        vm.expectRevert(AccessRegistry.ZeroAddress.selector);
        registry.registerParticipant(RAHIM, FARMER, address(0), RAHIM_DETAILS);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.UnknownRole.selector, SUPER));
        registry.registerParticipant(RAHIM, SUPER, rahim, RAHIM_DETAILS);
        vm.stopPrank();
    }

    // --- verification -----------------------------------------------------

    function test_VerifyGrantsRole() public {
        _registerRahim();
        vm.expectEmit(address(registry));
        emit AccessRegistry.ParticipantStatusChanged(
            RAHIM, AccessRegistry.Status.Pending, AccessRegistry.Status.Verified, tania
        );
        vm.prank(tania);
        registry.verifyParticipant(RAHIM);

        assertTrue(registry.isVerified(RAHIM));
        assertTrue(registry.isVerifiedAs(RAHIM, FARMER));
        assertFalse(registry.isVerifiedAs(RAHIM, registry.INVESTOR_ROLE()));
        assertTrue(registry.hasRole(FARMER, rahim));
    }

    function test_OnlyAdminVerifiesNonStaff() public {
        _registerRahim();
        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAuthorized.selector, imran));
        registry.verifyParticipant(RAHIM);

        vm.prank(tania);
        registry.verifyParticipant(RAHIM);
        assertTrue(registry.isVerified(RAHIM));
    }

    function test_AdminCannotManageStaff() public {
        vm.startPrank(tania);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAuthorized.selector, tania));
        registry.rejectParticipant(FARHANA);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAuthorized.selector, tania));
        registry.updateDetailsHash(FARHANA, keccak256("x"));
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAuthorized.selector, tania));
        registry.changeAccount(FARHANA, stranger);
        vm.stopPrank();
    }

    function test_RejectRevokesRoleAndReverifyRestores() public {
        _registerRahim();
        vm.startPrank(tania);
        registry.verifyParticipant(RAHIM);
        registry.rejectParticipant(RAHIM);
        assertEq(_status(RAHIM), uint8(AccessRegistry.Status.Rejected));
        assertFalse(registry.hasRole(FARMER, rahim));
        assertFalse(registry.isVerifiedAs(RAHIM, FARMER));

        registry.verifyParticipant(RAHIM);
        assertTrue(registry.hasRole(FARMER, rahim));
        vm.stopPrank();
    }

    function test_RejectPendingParticipant() public {
        _registerRahim();
        vm.prank(tania);
        registry.rejectParticipant(RAHIM);
        assertEq(_status(RAHIM), uint8(AccessRegistry.Status.Rejected));
        assertFalse(registry.hasRole(FARMER, rahim));
    }

    function test_SuperAdminRemovesStaff() public {
        vm.prank(superAdmin);
        registry.rejectParticipant(TANIA);
        assertFalse(registry.hasRole(ADMIN, tania));
    }

    function test_SameStatusReverts() public {
        _registerRahim();
        vm.startPrank(tania);
        registry.verifyParticipant(RAHIM);
        vm.expectRevert(
            abi.encodeWithSelector(AccessRegistry.StatusUnchanged.selector, RAHIM, AccessRegistry.Status.Verified)
        );
        registry.verifyParticipant(RAHIM);
        vm.stopPrank();
    }

    function test_UnknownParticipant() public {
        vm.prank(tania);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.ParticipantNotFound.selector, RAHIM));
        registry.verifyParticipant(RAHIM);
        assertFalse(registry.isVerified(RAHIM));
        assertEq(_status(RAHIM), uint8(AccessRegistry.Status.None));
        assertEq(registry.participantOf(rahim), bytes32(0));
    }

    // --- details hash -------------------------------------------------------

    function test_AdminUpdatesDetailsHash() public {
        _registerRahim();
        bytes32 v2 = keccak256("rahim-details-v2");
        vm.warp(block.timestamp + 1 days);

        vm.expectEmit(address(registry));
        emit AccessRegistry.ParticipantDetailsUpdated(RAHIM, RAHIM_DETAILS, v2, tania);
        vm.prank(tania);
        registry.updateDetailsHash(RAHIM, v2);

        AccessRegistry.Participant memory p = registry.getParticipant(RAHIM);
        assertEq(p.detailsHash, v2);
        assertEq(uint8(p.status), uint8(AccessRegistry.Status.Pending)); // unchanged
        assertEq(p.updatedAt, block.timestamp);
        assertLt(p.registeredAt, p.updatedAt);
    }

    function test_UpdateDetailsHashGuards() public {
        vm.prank(tania);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.ParticipantNotFound.selector, RAHIM));
        registry.updateDetailsHash(RAHIM, keccak256("x"));

        _registerRahim();
        vm.prank(tania);
        vm.expectRevert(AccessRegistry.ZeroValue.selector);
        registry.updateDetailsHash(RAHIM, bytes32(0));

        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAuthorized.selector, imran));
        registry.updateDetailsHash(RAHIM, keccak256("x"));
    }

    // --- key replacement ------------------------------------------------------

    function test_ChangeAccountMovesRole() public {
        _registerRahim();
        vm.prank(tania);
        registry.verifyParticipant(RAHIM);

        address newKey = makeAddr("rahim-new");
        vm.expectEmit(address(registry));
        emit AccessRegistry.ParticipantAccountChanged(RAHIM, rahim, newKey, tania);
        vm.prank(tania);
        registry.changeAccount(RAHIM, newKey);

        assertEq(registry.getParticipant(RAHIM).account, newKey);
        assertEq(registry.participantOf(newKey), RAHIM);
        assertEq(registry.participantOf(rahim), bytes32(0));
        assertTrue(registry.hasRole(FARMER, newKey));
        assertFalse(registry.hasRole(FARMER, rahim));
    }

    function test_ChangeAccountWhilePendingGrantsNothing() public {
        _registerRahim();
        address newKey = makeAddr("rahim-new");
        vm.prank(tania);
        registry.changeAccount(RAHIM, newKey);
        assertFalse(registry.hasRole(FARMER, newKey));

        vm.prank(tania);
        registry.verifyParticipant(RAHIM);
        assertTrue(registry.hasRole(FARMER, newKey));
    }

    function test_RetiredKeyCannotBeReused() public {
        _registerRahim();
        vm.prank(tania);
        registry.changeAccount(RAHIM, makeAddr("rahim-new"));

        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.AccountAlreadyUsed.selector, rahim));
        registry.registerParticipant(keccak256("FARMER-0002"), FARMER, rahim, keccak256("x"));

        vm.prank(tania);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.AccountAlreadyUsed.selector, rahim));
        registry.changeAccount(RAHIM, rahim);
    }

    function test_SuperAdminReplacesStaffKey() public {
        address newKey = makeAddr("tania-new");
        vm.prank(superAdmin);
        registry.changeAccount(TANIA, newKey);
        assertTrue(registry.hasRole(ADMIN, newKey));
        assertFalse(registry.hasRole(ADMIN, tania));
    }

    // --- field officer mapping -----------------------------------------------

    function test_OnboardingOfficerIsAssigned() public {
        vm.expectEmit(address(registry));
        emit AccessRegistry.FieldOfficerAssigned(RAHIM, IMRAN, imran);
        _registerRahim();
        assertEq(registry.fieldOfficerOf(RAHIM), IMRAN);
    }

    function test_AdminRegisteredFarmerHasNoOfficer() public {
        vm.prank(tania);
        registry.registerParticipant(RAHIM, FARMER, rahim, RAHIM_DETAILS);
        assertEq(registry.fieldOfficerOf(RAHIM), bytes32(0));
    }

    function test_AdminAssignsFieldOfficer() public {
        vm.prank(tania);
        registry.registerParticipant(RAHIM, FARMER, rahim, RAHIM_DETAILS);

        vm.expectEmit(address(registry));
        emit AccessRegistry.FieldOfficerAssigned(RAHIM, IMRAN, tania);
        vm.prank(tania);
        registry.assignFieldOfficer(RAHIM, IMRAN);
        assertEq(registry.fieldOfficerOf(RAHIM), IMRAN);
    }

    function test_AssignFieldOfficerGuards() public {
        vm.prank(tania);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.ParticipantNotFound.selector, RAHIM));
        registry.assignFieldOfficer(RAHIM, IMRAN);

        _registerRahim();
        vm.startPrank(tania);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAFarmer.selector, FARHANA));
        registry.assignFieldOfficer(FARHANA, IMRAN);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAFieldOfficer.selector, FARHANA));
        registry.assignFieldOfficer(RAHIM, FARHANA);
        vm.stopPrank();

        address sumon = makeAddr("sumon");
        bytes32 SUMON = keccak256("STAFF-0004");
        _staff(SUMON, OFFICER, sumon);
        vm.prank(superAdmin);
        registry.rejectParticipant(SUMON);
        vm.prank(tania);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAFieldOfficer.selector, SUMON));
        registry.assignFieldOfficer(RAHIM, SUMON);

        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAuthorized.selector, imran));
        registry.assignFieldOfficer(RAHIM, IMRAN);
    }

    // --- officers leaving: farmer counts and hand-over --------------------

    address sumon = makeAddr("sumon"); // second field officer
    bytes32 constant SUMON = keccak256("STAFF-0004");

    function _farmer(bytes32 id, address account) internal {
        vm.prank(imran);
        registry.registerParticipant(id, FARMER, account, keccak256(abi.encode(id)));
    }

    function _farmers(uint256 n) internal returns (bytes32[] memory ids) {
        ids = new bytes32[](n);
        for (uint256 i = 0; i < n; ++i) {
            ids[i] = keccak256(abi.encode("FARMER", i));
            _farmer(ids[i], makeAddr(string(abi.encode("farmer", i))));
        }
    }

    function test_FarmerCountsFollowAssignments() public {
        _staff(SUMON, OFFICER, sumon);
        _registerRahim();
        assertEq(registry.farmerCountOf(IMRAN), 1);
        vm.startPrank(tania);
        registry.assignFieldOfficer(RAHIM, SUMON);
        assertEq(registry.farmerCountOf(IMRAN), 0);
        assertEq(registry.farmerCountOf(SUMON), 1);
        // The same officer again changes nothing.
        registry.assignFieldOfficer(RAHIM, SUMON);
        assertEq(registry.farmerCountOf(SUMON), 1);
        vm.stopPrank();
    }

    function test_OfficerWithFarmersKeepsRoleUntilMoved() public {
        _staff(SUMON, OFFICER, sumon);
        bytes32[] memory ids = _farmers(3);
        vm.prank(superAdmin);
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.OfficerHasFarmers.selector, IMRAN, 3));
        registry.rejectParticipant(IMRAN);

        vm.expectEmit(address(registry));
        emit AccessRegistry.FieldOfficerAssigned(ids[0], SUMON, superAdmin);
        vm.prank(superAdmin);
        registry.reassignFarmers(IMRAN, SUMON, ids);
        assertEq(registry.farmerCountOf(IMRAN), 0);
        assertEq(registry.farmerCountOf(SUMON), 3);
        for (uint256 i = 0; i < ids.length; ++i) {
            assertEq(registry.fieldOfficerOf(ids[i]), SUMON);
        }

        vm.prank(superAdmin);
        registry.rejectParticipant(IMRAN);
        assertFalse(registry.hasRole(OFFICER, imran));
        // Restored, they start with no farmers.
        vm.prank(superAdmin);
        registry.verifyParticipant(IMRAN);
        assertTrue(registry.hasRole(OFFICER, imran));
        assertEq(registry.farmerCountOf(IMRAN), 0);
    }

    function test_AdminReassignsFarmersToo() public {
        _staff(SUMON, OFFICER, sumon);
        bytes32[] memory ids = _farmers(2);
        vm.prank(tania);
        registry.reassignFarmers(IMRAN, SUMON, ids);
        assertEq(registry.farmerCountOf(SUMON), 2);
    }

    function test_ReassignFarmersGuards() public {
        _staff(SUMON, OFFICER, sumon);
        bytes32[] memory ids = _farmers(2);

        address[3] memory refused = [stranger, imran, farhana];
        for (uint256 i = 0; i < refused.length; ++i) {
            vm.prank(refused[i]);
            vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAuthorized.selector, refused[i]));
            registry.reassignFarmers(IMRAN, SUMON, ids);
        }

        vm.startPrank(superAdmin);
        vm.expectRevert(AccessRegistry.ZeroValue.selector);
        registry.reassignFarmers(IMRAN, SUMON, new bytes32[](0));

        uint256 max = registry.MAX_REASSIGN();
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.TooManyFarmers.selector, max + 1, max));
        registry.reassignFarmers(IMRAN, SUMON, new bytes32[](max + 1));

        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.SameFieldOfficer.selector, IMRAN));
        registry.reassignFarmers(IMRAN, IMRAN, ids);

        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.NotAFieldOfficer.selector, FARHANA));
        registry.reassignFarmers(IMRAN, FARHANA, ids);

        // Every farmer must be with the officer they are moved from: none moves otherwise.
        bytes32[] memory wrong = new bytes32[](2);
        wrong[0] = ids[0];
        wrong[1] = TANIA;
        vm.expectRevert(abi.encodeWithSelector(AccessRegistry.FarmerNotWithOfficer.selector, TANIA, IMRAN));
        registry.reassignFarmers(IMRAN, SUMON, wrong);
        assertEq(registry.fieldOfficerOf(ids[0]), IMRAN);
        assertEq(registry.farmerCountOf(IMRAN), 2);
        vm.stopPrank();
    }

    function test_ReassignAtTheLimit() public {
        _staff(SUMON, OFFICER, sumon);
        bytes32[] memory ids = _farmers(registry.MAX_REASSIGN());
        vm.prank(superAdmin);
        registry.reassignFarmers(IMRAN, SUMON, ids);
        assertEq(registry.farmerCountOf(SUMON), ids.length);
    }

    // --- AccessGuarded ------------------------------------------------------

    function test_GuardedIdentifiesCaller() public {
        GuardedMock guarded = new GuardedMock(registry);
        _registerRahim();
        vm.prank(tania);
        registry.verifyParticipant(RAHIM);

        vm.prank(rahim);
        guarded.farmerOnly();
        assertEq(guarded.lastCaller(), RAHIM);
    }

    function test_GuardedBlocksUnverified() public {
        GuardedMock guarded = new GuardedMock(registry);
        _registerRahim(); // pending: key has no role yet
        vm.prank(rahim);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, rahim, FARMER));
        guarded.farmerOnly();
    }

    function test_GuardedFollowsRejection() public {
        GuardedMock guarded = new GuardedMock(registry);
        _registerRahim();
        vm.startPrank(tania);
        registry.verifyParticipant(RAHIM);
        registry.rejectParticipant(RAHIM);
        vm.stopPrank();

        vm.prank(rahim);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, rahim, FARMER));
        guarded.farmerOnly();
    }

    function test_GuardedRejectsZeroRegistry() public {
        vm.expectRevert(AccessGuarded.ZeroRegistry.selector);
        new GuardedMock(AccessRegistry(address(0)));
    }
}

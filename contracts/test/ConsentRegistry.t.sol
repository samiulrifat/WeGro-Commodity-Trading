// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AccessRegistry} from "../contracts/access/AccessRegistry.sol";
import {AccessGuarded} from "../contracts/access/AccessGuarded.sol";
import {ProjectLedger} from "../contracts/projects/ProjectLedger.sol";
import {ConsentRegistry} from "../contracts/consent/ConsentRegistry.sol";

contract ConsentRegistryTest is Test {
    AccessRegistry registry;
    ProjectLedger ledger;
    ConsentRegistry consent;

    address superAdmin = makeAddr("superAdmin");
    address settlement = makeAddr("settlementLedger"); // stands in for SettlementLedger
    address admin = makeAddr("tania");
    address imran = makeAddr("imran"); // Rahim's field officer
    address sumon = makeAddr("sumon"); // Karim's field officer
    address accounts = makeAddr("farhana");
    address rahim = makeAddr("rahim");
    address karim = makeAddr("karim");
    address nasrin = makeAddr("nasrin");
    address alam = makeAddr("alam"); // bank officer, BRAC
    address rina = makeAddr("rina"); // bank officer, BRAC
    address zaman = makeAddr("zaman"); // bank officer, City Bank
    address loose = makeAddr("loose"); // bank officer with no bank

    uint256 constant TK = 100;

    bytes32 constant RAHIM = keccak256("FARMER-0001");
    bytes32 constant KARIM = keccak256("FARMER-0002");
    bytes32 constant NASRIN = keccak256("INVESTOR-0001");
    bytes32 constant ALAM = keccak256("BANK-0001");
    bytes32 constant RINA = keccak256("BANK-0002");
    bytes32 constant ZAMAN = keccak256("BANK-0003");
    bytes32 constant LOOSE = keccak256("BANK-0004");

    bytes32 constant BRAC = "BRAC-BOGURA";
    bytes32 constant CITY = "CITY-BOGURA";

    // Ascending ids, as the contract requires.
    bytes32 constant P1 = bytes32(uint256(1));
    bytes32 constant P2 = bytes32(uint256(2));
    bytes32 constant P_ACTIVE = bytes32(uint256(3));
    bytes32 constant P_KARIM = bytes32(uint256(4));

    bytes32 BANK;
    uint256 refCount;

    function setUp() public {
        vm.warp(1_780_000_000);
        registry = new AccessRegistry(superAdmin);
        ledger = new ProjectLedger(registry, 120 hours);
        consent = new ConsentRegistry(registry, ledger);
        BANK = registry.BANK_ROLE();

        vm.startPrank(superAdmin);
        _person(keccak256("STAFF-ADMIN"), registry.ADMIN_ROLE(), admin);
        _person(keccak256("STAFF-OFFICER-1"), registry.FIELD_OFFICER_ROLE(), imran);
        _person(keccak256("STAFF-OFFICER-2"), registry.FIELD_OFFICER_ROLE(), sumon);
        _person(keccak256("STAFF-ACCOUNTS"), registry.ACCOUNTS_ROLE(), accounts);
        ledger.setLinkedContract(settlement, true);
        vm.stopPrank();

        bytes32 farmerRole = registry.FARMER_ROLE();
        vm.prank(imran);
        registry.registerParticipant(RAHIM, farmerRole, rahim, keccak256("rahim"));
        vm.prank(sumon);
        registry.registerParticipant(KARIM, farmerRole, karim, keccak256("karim"));

        vm.startPrank(admin);
        registry.verifyParticipant(RAHIM);
        registry.verifyParticipant(KARIM);
        _person(NASRIN, registry.INVESTOR_ROLE(), nasrin);
        _person(ALAM, BANK, alam);
        _person(RINA, BANK, rina);
        _person(ZAMAN, BANK, zaman);
        _person(LOOSE, BANK, loose);
        consent.registerBank(BRAC, keccak256("brac bank bogura branch"));
        consent.registerBank(CITY, keccak256("city bank bogura branch"));
        consent.assignBankOfficer(ALAM, BRAC);
        consent.assignBankOfficer(RINA, BRAC);
        consent.assignBankOfficer(ZAMAN, CITY);
        vm.stopPrank();

        _finishedProject(P1, RAHIM);
        _finishedProject(P2, RAHIM);
        _fund(P_ACTIVE, RAHIM); // still running
        _finishedProject(P_KARIM, KARIM);
    }

    // --- helpers ---------------------------------------------------------------

    function _person(bytes32 id, bytes32 role, address account) internal {
        registry.registerParticipant(id, role, account, keccak256(abi.encode(id)));
        registry.verifyParticipant(id);
    }

    function _fund(bytes32 id, bytes32 farmer) internal {
        ProjectLedger.ProjectTerms memory t = ProjectLedger.ProjectTerms({
            farmerId: farmer,
            produceCode: "MAIZE",
            category: ProjectLedger.ProduceCategory.StorableCrop,
            regionCode: "BOGURA",
            durationType: ProjectLedger.DurationType.ShortTerm,
            durationMonths: 6,
            payoutIntervalMonths: 0,
            fundingTarget: 100_000 * TK,
            slotPrice: 10_000 * TK,
            farmerBps: 4000,
            investorBps: 4000,
            wegroBps: 2000,
            insured: false,
            termsHash: keccak256("terms")
        });
        vm.startPrank(admin);
        ledger.createProject(id, t);
        ledger.openForFunding(id);
        vm.stopPrank();
        vm.prank(nasrin);
        uint256 r = ledger.reserveSlots(id, 10);
        vm.prank(accounts);
        ledger.confirmPayment(r, bytes32(++refCount));
    }

    function _finishedProject(bytes32 id, bytes32 farmer) internal {
        _fund(id, farmer);
        vm.startPrank(admin);
        ledger.activate(id);
        ledger.markReadyForSale(id);
        vm.stopPrank();
        vm.prank(settlement);
        ledger.markPaidOut(id);
    }

    function _two() internal pure returns (bytes32[] memory p) {
        p = new bytes32[](2);
        p[0] = P1;
        p[1] = P2;
    }

    function _publish() internal {
        vm.prank(imran);
        consent.publishTrackRecord(RAHIM, _two(), keccak256("2 projects, paid on time, 104% of target"));
    }

    function _grant(uint64 expiresAt) internal {
        vm.prank(imran);
        consent.grantConsent(RAHIM, BRAC, expiresAt);
    }

    // --- setup ---------------------------------------------------------------------

    function test_ConstructorRejectsZeroLedger() public {
        vm.expectRevert(ConsentRegistry.ZeroProjectLedger.selector);
        new ConsentRegistry(registry, ProjectLedger(address(0)));
    }

    function test_BankGuards() public {
        vm.startPrank(admin);
        vm.expectRevert(ConsentRegistry.ZeroValue.selector);
        consent.registerBank(bytes32(0), keccak256("x"));
        vm.expectRevert(ConsentRegistry.ZeroValue.selector);
        consent.registerBank("NEW", bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.BankExists.selector, BRAC));
        consent.registerBank(BRAC, keccak256("x"));
        vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.BankNotFound.selector, bytes32("NONE")));
        consent.assignBankOfficer(LOOSE, "NONE");
        vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.NotABankOfficer.selector, NASRIN));
        consent.assignBankOfficer(NASRIN, BRAC);
        vm.stopPrank();

        bytes32 adminRole = registry.ADMIN_ROLE();
        vm.prank(alam);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, alam, adminRole));
        consent.registerBank("NEW", keccak256("x"));
        assertEq(consent.bankOf(ALAM), BRAC);
    }

    // --- track records -------------------------------------------------------------

    function test_OfficerPublishesTrackRecord() public {
        vm.expectEmit(address(consent));
        emit ConsentRegistry.TrackRecordPublished(
            RAHIM, 1, keccak256("2 projects, paid on time, 104% of target"), _two(), keccak256("STAFF-OFFICER-1")
        );
        _publish();

        assertEq(consent.latestVersion(RAHIM), 1);
        ConsentRegistry.TrackRecord memory r = consent.getTrackRecord(RAHIM, 1);
        assertEq(r.summaryHash, keccak256("2 projects, paid on time, 104% of target"));
        assertEq(r.publishedAt, block.timestamp);
        assertEq(consent.getTrackRecordProjects(RAHIM, 1).length, 2);
    }

    function test_NewVersionKeepsTheOld() public {
        _publish();
        bytes32[] memory one = new bytes32[](1);
        one[0] = P1;
        vm.prank(imran);
        consent.publishTrackRecord(RAHIM, one, keccak256("v2"));
        assertEq(consent.latestVersion(RAHIM), 2);
        assertEq(consent.getTrackRecord(RAHIM, 1).summaryHash, keccak256("2 projects, paid on time, 104% of target"));
        assertEq(consent.getTrackRecord(RAHIM, 2).summaryHash, keccak256("v2"));
    }

    function test_OnlyFinishedProjectsOfThisFarmer() public {
        bytes32[] memory p = new bytes32[](1);
        vm.startPrank(imran);
        p[0] = P_ACTIVE;
        vm.expectRevert(
            abi.encodeWithSelector(ConsentRegistry.ProjectNotFinished.selector, P_ACTIVE, ProjectLedger.Stage.Funded)
        );
        consent.publishTrackRecord(RAHIM, p, keccak256("x"));

        p[0] = P_KARIM; // Karim's project in Rahim's record
        vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.NotFarmersProject.selector, P_KARIM));
        consent.publishTrackRecord(RAHIM, p, keccak256("x"));
        vm.stopPrank();
    }

    function test_ClosedProjectCounts() public {
        vm.prank(admin);
        ledger.close(P1);
        bytes32[] memory p = new bytes32[](1);
        p[0] = P1;
        vm.prank(imran);
        consent.publishTrackRecord(RAHIM, p, keccak256("x"));
        assertEq(consent.latestVersion(RAHIM), 1);
    }

    function test_PublishGuards() public {
        vm.startPrank(imran);
        vm.expectRevert(ConsentRegistry.ZeroValue.selector);
        consent.publishTrackRecord(RAHIM, _two(), bytes32(0));
        vm.expectRevert(ConsentRegistry.BadProjectList.selector);
        consent.publishTrackRecord(RAHIM, new bytes32[](0), keccak256("x"));
        vm.expectRevert(ConsentRegistry.BadProjectList.selector);
        consent.publishTrackRecord(RAHIM, new bytes32[](51), keccak256("x"));

        bytes32[] memory dup = new bytes32[](2);
        dup[0] = P1;
        dup[1] = P1;
        vm.expectRevert(ConsentRegistry.BadProjectList.selector);
        consent.publishTrackRecord(RAHIM, dup, keccak256("x"));
        vm.stopPrank();

        address[3] memory others = [sumon, rahim, admin]; // other officer, the farmer, admin
        for (uint256 i = 0; i < others.length; i++) {
            vm.prank(others[i]);
            vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.NotFarmersOfficer.selector, others[i]));
            consent.publishTrackRecord(RAHIM, _two(), keccak256("x"));
        }
    }

    // --- consent and viewing (Stage 8) -----------------------------------------------------

    function test_BankViewsOnlyWithPermission() public {
        _publish();
        vm.prank(alam);
        vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.NoActiveConsent.selector, RAHIM, BRAC));
        consent.viewSummary(RAHIM);

        vm.expectEmit(address(consent));
        emit ConsentRegistry.ConsentGranted(RAHIM, BRAC, 0, keccak256("STAFF-OFFICER-1"));
        _grant(0);
        assertTrue(consent.hasConsent(RAHIM, BRAC));

        vm.expectEmit(address(consent));
        emit ConsentRegistry.SummaryViewed(RAHIM, BRAC, ALAM, 1);
        vm.prank(alam);
        (uint32 version, bytes32 summary) = consent.viewSummary(RAHIM);
        assertEq(version, 1);
        assertEq(summary, keccak256("2 projects, paid on time, 104% of target"));

        vm.prank(rina); // a colleague at the same bank
        consent.viewSummary(RAHIM);
        assertEq(consent.viewCount(RAHIM, BRAC), 2);
    }

    function test_OtherBanksHaveNoAccess() public {
        _publish();
        _grant(0);
        vm.prank(zaman);
        vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.NoActiveConsent.selector, RAHIM, CITY));
        consent.viewSummary(RAHIM);
        vm.prank(loose);
        vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.NotAssignedToBank.selector, loose));
        consent.viewSummary(RAHIM);
        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, imran, BANK));
        consent.viewSummary(RAHIM);
    }

    function test_WithdrawingEndsAccess() public {
        _publish();
        _grant(0);
        vm.expectEmit(address(consent));
        emit ConsentRegistry.ConsentRevoked(RAHIM, BRAC, keccak256("STAFF-OFFICER-1"));
        vm.prank(imran);
        consent.revokeConsent(RAHIM, BRAC);

        assertFalse(consent.hasConsent(RAHIM, BRAC));
        vm.prank(alam);
        vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.NoActiveConsent.selector, RAHIM, BRAC));
        consent.viewSummary(RAHIM);

        vm.prank(imran); // nothing left to withdraw
        vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.NoActiveConsent.selector, RAHIM, BRAC));
        consent.revokeConsent(RAHIM, BRAC);

        _grant(0); // Rahim can change his mind again
        vm.prank(alam);
        consent.viewSummary(RAHIM);
    }

    function test_PermissionExpires() public {
        _publish();
        uint64 until = uint64(block.timestamp + 90 days);
        _grant(until);
        assertEq(consent.getConsent(RAHIM, BRAC).expiresAt, until);
        vm.warp(until);
        assertFalse(consent.hasConsent(RAHIM, BRAC));
        vm.prank(alam);
        vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.NoActiveConsent.selector, RAHIM, BRAC));
        consent.viewSummary(RAHIM);
    }

    function test_RemovedBankOfficerLosesAccess() public {
        _publish();
        _grant(0);
        vm.prank(admin);
        consent.assignBankOfficer(ALAM, bytes32(0));
        vm.prank(alam);
        vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.NotAssignedToBank.selector, alam));
        consent.viewSummary(RAHIM);
    }

    function test_NoSummaryBeforeTrackRecord() public {
        _grant(0);
        vm.prank(alam);
        vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.NoTrackRecord.selector, RAHIM));
        consent.viewSummary(RAHIM);
    }

    function test_ConsentGuards() public {
        vm.startPrank(imran);
        vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.BankNotFound.selector, bytes32("NONE")));
        consent.grantConsent(RAHIM, "NONE", 0);
        vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.InvalidExpiry.selector, block.timestamp));
        consent.grantConsent(RAHIM, BRAC, uint64(block.timestamp));
        vm.stopPrank();

        address[3] memory others = [sumon, rahim, alam];
        for (uint256 i = 0; i < others.length; i++) {
            vm.prank(others[i]);
            vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.NotFarmersOfficer.selector, others[i]));
            consent.grantConsent(RAHIM, BRAC, 0);
        }
        _grant(0);
        vm.prank(sumon);
        vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.NotFarmersOfficer.selector, sumon));
        consent.revokeConsent(RAHIM, BRAC);
    }

    function test_ConsentIsPerFarmer() public {
        _publish();
        _grant(0);
        // Karim gave no permission, even though his officer could.
        vm.prank(alam);
        vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.NoActiveConsent.selector, KARIM, BRAC));
        consent.viewSummary(KARIM);
        assertFalse(consent.hasConsent(KARIM, BRAC));
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AccessRegistry} from "../contracts/access/AccessRegistry.sol";
import {AccessGuarded} from "../contracts/access/AccessGuarded.sol";
import {ProjectLedger} from "../contracts/projects/ProjectLedger.sol";
import {FieldRecordLog} from "../contracts/field/FieldRecordLog.sol";

contract FieldRecordLogTest is Test {
    AccessRegistry registry;
    ProjectLedger ledger;
    FieldRecordLog records;

    address superAdmin = makeAddr("superAdmin");
    address settlement = makeAddr("settlementLedger"); // stands in for SettlementLedger
    address admin = makeAddr("tania");
    address imran = makeAddr("imran"); // Rahim's field officer
    address sumon = makeAddr("sumon"); // Karim's field officer
    address accounts = makeAddr("farhana");
    address rahim = makeAddr("rahim");
    address karim = makeAddr("karim");
    address nasrin = makeAddr("nasrin");

    uint256 constant TK = 100;

    bytes32 constant IMRAN = keccak256("STAFF-OFFICER-1");
    bytes32 constant SUMON = keccak256("STAFF-OFFICER-2");
    bytes32 constant RAHIM = keccak256("FARMER-0001");
    bytes32 constant KARIM = keccak256("FARMER-0002");
    bytes32 constant NASRIN = keccak256("INVESTOR-0001");

    bytes32 constant MAIZE = keccak256("PRJ-MAIZE-BOGURA-01"); // Rahim
    bytes32 constant ONION = keccak256("PRJ-ONION-PABNA-01"); // Karim

    bytes32 OFFICER;
    uint256 confirmCount;

    function setUp() public {
        vm.warp(1_780_000_000);
        registry = new AccessRegistry(superAdmin);
        ledger = new ProjectLedger(registry, 120 hours);
        records = new FieldRecordLog(registry, ledger);
        OFFICER = registry.FIELD_OFFICER_ROLE();

        vm.startPrank(superAdmin);
        _person(keccak256("STAFF-ADMIN"), registry.ADMIN_ROLE(), admin);
        _person(IMRAN, OFFICER, imran);
        _person(SUMON, OFFICER, sumon);
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
        vm.stopPrank();

        _fund(MAIZE, RAHIM, ProjectLedger.ProduceCategory.StorableCrop);
        _fund(ONION, KARIM, ProjectLedger.ProduceCategory.Perishable);
    }

    // --- helpers ---------------------------------------------------------------

    function _person(bytes32 id, bytes32 role, address account) internal {
        registry.registerParticipant(id, role, account, keccak256(abi.encode(id)));
        registry.verifyParticipant(id);
    }

    function _terms(bytes32 farmer, ProjectLedger.ProduceCategory category)
        internal
        pure
        returns (ProjectLedger.ProjectTerms memory)
    {
        return ProjectLedger.ProjectTerms({
            farmerId: farmer,
            produceCode: "PRODUCE",
            category: category,
            regionCode: "BOGURA",
            durationType: ProjectLedger.DurationType.LongTerm,
            durationMonths: 12,
            payoutIntervalMonths: 0,
            fundingTarget: 100_000 * TK,
            slotPrice: 10_000 * TK,
            farmerBps: 4000,
            investorBps: 4000,
            wegroBps: 2000,
            insured: false,
            termsHash: keccak256("terms")
        });
    }

    /// Create, open and fully fund a project (stage: Funded).
    function _fund(bytes32 id, bytes32 farmer, ProjectLedger.ProduceCategory category) internal {
        vm.startPrank(admin);
        ledger.createProject(id, _terms(farmer, category));
        ledger.openForFunding(id);
        vm.stopPrank();
        vm.prank(nasrin);
        uint256 r = ledger.reserveSlots(id, 10);
        vm.prank(accounts);
        ledger.confirmPayment(r, bytes32(++confirmCount));
    }

    function _entry(bytes32 id) internal view returns (FieldRecordLog.EntryInput memory) {
        return FieldRecordLog.EntryInput({
            entryId: id,
            projectId: MAIZE,
            entryType: "GROWTH_CHECK",
            dataHash: keccak256(abi.encode("notes", id)),
            photoHash: keccak256(abi.encode("photo", id)),
            correctsEntryId: bytes32(0),
            observedAt: uint64(block.timestamp)
        });
    }

    function _add(address officer, FieldRecordLog.EntryInput memory e) internal {
        vm.prank(officer);
        records.addEntry(e);
    }

    // --- constructor ------------------------------------------------------------

    function test_ConstructorRejectsZeroLedger() public {
        vm.expectRevert(FieldRecordLog.ZeroProjectLedger.selector);
        new FieldRecordLog(registry, ProjectLedger(address(0)));
    }

    // --- farm entries -------------------------------------------------------------

    function test_OfficerAddsGrowthCheck() public {
        FieldRecordLog.EntryInput memory e = _entry("E1");
        vm.expectEmit(address(records));
        emit FieldRecordLog.EntryAdded(
            "E1", MAIZE, "GROWTH_CHECK", e.dataHash, e.photoHash, bytes32(0), IMRAN, e.observedAt
        );
        _add(imran, e);

        FieldRecordLog.Entry memory stored = records.getEntry("E1");
        assertEq(stored.projectId, MAIZE);
        assertEq(stored.entryType, bytes32("GROWTH_CHECK"));
        assertEq(stored.dataHash, e.dataHash);
        assertEq(stored.photoHash, e.photoHash);
        assertEq(stored.recordedBy, IMRAN);
        assertEq(stored.recordedAt, block.timestamp);
        assertEq(records.entryCount(MAIZE), 1);
    }

    function test_EntryWithoutPhoto() public {
        FieldRecordLog.EntryInput memory e = _entry("E1");
        e.photoHash = bytes32(0);
        _add(imran, e);
        assertEq(records.getEntry("E1").photoHash, bytes32(0));
    }

    function test_OfflineDraftKeepsDeviceTime() public {
        FieldRecordLog.EntryInput memory e = _entry("E1");
        vm.warp(block.timestamp + 3 days); // signal returns three days later
        _add(imran, e);

        FieldRecordLog.Entry memory stored = records.getEntry("E1");
        assertEq(stored.observedAt, block.timestamp - 3 days);
        assertEq(stored.recordedAt, block.timestamp);
    }

    function test_ResendingDraftCannotDuplicate() public {
        _add(imran, _entry("E1"));
        FieldRecordLog.EntryInput memory again = _entry("E1");
        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(FieldRecordLog.EntryExists.selector, bytes32("E1")));
        records.addEntry(again);
        assertEq(records.entryCount(MAIZE), 1);
    }

    function test_EntryGuards() public {
        vm.startPrank(imran);
        FieldRecordLog.EntryInput memory e = _entry(bytes32(0));
        vm.expectRevert(FieldRecordLog.ZeroValue.selector);
        records.addEntry(e);

        e = _entry("E1");
        e.entryType = bytes32(0);
        vm.expectRevert(FieldRecordLog.ZeroValue.selector);
        records.addEntry(e);

        e = _entry("E1");
        e.dataHash = bytes32(0);
        vm.expectRevert(FieldRecordLog.ZeroValue.selector);
        records.addEntry(e);

        e = _entry("E1");
        e.observedAt = 0;
        vm.expectRevert(abi.encodeWithSelector(FieldRecordLog.InvalidObservedAt.selector, 0));
        records.addEntry(e);

        e.observedAt = uint64(block.timestamp + 1); // future device time
        vm.expectRevert(abi.encodeWithSelector(FieldRecordLog.InvalidObservedAt.selector, block.timestamp + 1));
        records.addEntry(e);
        vm.stopPrank();
    }

    // --- who can record --------------------------------------------------------------

    function test_OnlyFarmersOwnOfficer() public {
        FieldRecordLog.EntryInput memory e = _entry("E1");
        vm.prank(sumon); // Karim's officer, not Rahim's
        vm.expectRevert(abi.encodeWithSelector(FieldRecordLog.NotFarmersOfficer.selector, sumon));
        records.addEntry(e);

        address[3] memory nonOfficers = [rahim, admin, accounts];
        for (uint256 i = 0; i < nonOfficers.length; i++) {
            vm.prank(nonOfficers[i]);
            vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, nonOfficers[i], OFFICER));
            records.addEntry(e);
        }
    }

    function test_EachOfficerRecordsOwnFarmer() public {
        _add(imran, _entry("E1"));
        FieldRecordLog.EntryInput memory onion = _entry("E2");
        onion.projectId = ONION;
        _add(sumon, onion);
        assertEq(records.entryCount(MAIZE), 1);
        assertEq(records.entryCount(ONION), 1);
        assertEq(records.getEntry("E2").recordedBy, SUMON);
    }

    function test_ReassignedOfficerTakesOver() public {
        vm.prank(admin);
        registry.assignFieldOfficer(RAHIM, SUMON);

        FieldRecordLog.EntryInput memory e = _entry("E1");
        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(FieldRecordLog.NotFarmersOfficer.selector, imran));
        records.addEntry(e);

        _add(sumon, e);
        assertEq(records.getEntry("E1").recordedBy, SUMON);
    }

    // --- project stages ----------------------------------------------------------------

    function test_RecordsFromFundedToReadyForSale() public {
        _add(imran, _entry("FUNDED"));
        vm.prank(admin);
        ledger.activate(MAIZE);
        _add(imran, _entry("ACTIVE"));
        vm.prank(admin);
        ledger.markReadyForSale(MAIZE);
        _add(imran, _entry("READY"));
        assertEq(records.entryCount(MAIZE), 3);

        vm.prank(settlement);
        ledger.markPaidOut(MAIZE);
        FieldRecordLog.EntryInput memory late = _entry("PAID");
        vm.prank(imran);
        vm.expectRevert(
            abi.encodeWithSelector(FieldRecordLog.WrongProjectStage.selector, MAIZE, ProjectLedger.Stage.PaidOut)
        );
        records.addEntry(late);
    }

    function test_NoRecordsBeforeFunding() public {
        bytes32 open = keccak256("PRJ-OPEN");
        vm.startPrank(admin);
        ledger.createProject(open, _terms(RAHIM, ProjectLedger.ProduceCategory.StorableCrop));
        ledger.openForFunding(open);
        vm.stopPrank();

        FieldRecordLog.EntryInput memory e = _entry("E1");
        e.projectId = open;
        vm.prank(imran);
        vm.expectRevert(
            abi.encodeWithSelector(FieldRecordLog.WrongProjectStage.selector, open, ProjectLedger.Stage.OpenForFunding)
        );
        records.addEntry(e);

        e.projectId = "UNKNOWN";
        vm.prank(imran);
        vm.expectRevert(
            abi.encodeWithSelector(FieldRecordLog.WrongProjectStage.selector, bytes32("UNKNOWN"), ProjectLedger.Stage.None)
        );
        records.addEntry(e);
    }

    // --- corrections ---------------------------------------------------------------------

    function test_CorrectionIsANewEntry() public {
        FieldRecordLog.EntryInput memory original = _entry("E1");
        _add(imran, original);

        FieldRecordLog.EntryInput memory fix = _entry("E2");
        fix.correctsEntryId = "E1";
        _add(imran, fix);

        // The original is untouched; the correction points at it.
        assertEq(records.getEntry("E1").dataHash, original.dataHash);
        assertEq(records.getEntry("E2").correctsEntryId, bytes32("E1"));
        assertEq(records.entryCount(MAIZE), 2);
    }

    function test_CorrectionGuards() public {
        FieldRecordLog.EntryInput memory fix = _entry("E2");
        fix.correctsEntryId = "MISSING";
        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(FieldRecordLog.EntryNotFound.selector, bytes32("MISSING")));
        records.addEntry(fix);

        // A correction must stay on the same project.
        FieldRecordLog.EntryInput memory onion = _entry("ONION-1");
        onion.projectId = ONION;
        _add(sumon, onion);

        fix = _entry("E3");
        fix.correctsEntryId = "ONION-1";
        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(FieldRecordLog.CorrectionMismatch.selector, bytes32("ONION-1")));
        records.addEntry(fix);
    }

    // --- verify (FR-28) ----------------------------------------------------------------------

    function test_VerifyEntry() public {
        FieldRecordLog.EntryInput memory e = _entry("E1");
        _add(imran, e);

        assertTrue(records.verifyEntry("E1", e.dataHash, e.photoHash));
        assertFalse(records.verifyEntry("E1", e.dataHash, keccak256("edited photo")));
        assertFalse(records.verifyEntry("E1", keccak256("edited notes"), e.photoHash));
        assertFalse(records.verifyEntry("NOPE", bytes32(0), bytes32(0)));
    }
}

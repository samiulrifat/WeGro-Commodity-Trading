// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AccessRegistry} from "../contracts/access/AccessRegistry.sol";
import {AccessGuarded} from "../contracts/access/AccessGuarded.sol";
import {ProjectLedger} from "../contracts/projects/ProjectLedger.sol";

contract ProjectLedgerTest is Test {
    AccessRegistry registry;
    ProjectLedger ledger;

    address superAdmin = makeAddr("superAdmin");
    address admin = makeAddr("admin");
    address officer = makeAddr("officer");
    address accounts = makeAddr("accounts");
    address linked = makeAddr("voucherRegistry");
    address stranger = makeAddr("stranger");

    uint64 constant TTL = 120 hours;
    uint256 constant TK = 100; // poisha per taka

    bytes32 constant RAHIM = keccak256("FARMER-0001");
    bytes32 constant NASRIN = keccak256("INVESTOR-0001");
    bytes32 constant KARIM = keccak256("INVESTOR-0002");
    bytes32 constant UNVERIFIED = keccak256("INVESTOR-0003");
    bytes32 constant PROJECT = keccak256("PRJ-MAIZE-BOGURA-01");

    bytes32 ADMIN;
    bytes32 ACCOUNTS;
    bytes32 INVESTOR;

    function setUp() public {
        registry = new AccessRegistry(superAdmin);
        ledger = new ProjectLedger(registry, TTL);
        ADMIN = registry.ADMIN_ROLE();
        ACCOUNTS = registry.ACCOUNTS_ROLE();
        INVESTOR = registry.INVESTOR_ROLE();

        vm.startPrank(superAdmin);
        _person(keccak256("STAFF-ADMIN"), ADMIN, admin);
        _person(keccak256("STAFF-OFFICER"), registry.FIELD_OFFICER_ROLE(), officer);
        _person(keccak256("STAFF-ACCOUNTS"), ACCOUNTS, accounts);
        ledger.setLinkedContract(linked, true);
        vm.stopPrank();

        vm.startPrank(admin);
        _person(RAHIM, registry.FARMER_ROLE(), makeAddr("rahim"));
        _person(NASRIN, INVESTOR, makeAddr("nasrin"));
        _person(KARIM, INVESTOR, makeAddr("karim"));
        registry.registerParticipant(UNVERIFIED, INVESTOR, makeAddr("unverified"), keccak256("x"));
        vm.stopPrank();
    }

    /// Register and verify a person with their own key (caller must be pranked).
    function _person(bytes32 id, bytes32 role, address account) internal {
        registry.registerParticipant(id, role, account, keccak256(abi.encode(id)));
        registry.verifyParticipant(id);
    }

    function _keyOf(bytes32 participantId) internal view returns (address) {
        return registry.getParticipant(participantId).account;
    }

    // --- helpers -------------------------------------------------------------

    /// The doc's example: long-term maize in Bogura, 100 slots x Tk 20,000, 40-40-20.
    function _maizeTerms() internal pure returns (ProjectLedger.ProjectTerms memory) {
        return ProjectLedger.ProjectTerms({
            farmerId: RAHIM,
            produceCode: "MAIZE",
            category: ProjectLedger.ProduceCategory.StorableCrop,
            regionCode: "BOGURA",
            durationType: ProjectLedger.DurationType.LongTerm,
            durationMonths: 12,
            payoutIntervalMonths: 4,
            fundingTarget: 2_000_000 * TK,
            slotPrice: 20_000 * TK,
            farmerBps: 4000,
            investorBps: 4000,
            wegroBps: 2000,
            insured: true,
            termsHash: keccak256("terms-v1")
        });
    }

    function _create(ProjectLedger.ProjectTerms memory t) internal {
        vm.prank(admin);
        ledger.createProject(PROJECT, t);
    }

    function _open() internal {
        _create(_maizeTerms());
        vm.prank(admin);
        ledger.openForFunding(PROJECT);
    }

    function _reserve(bytes32 investorId, uint32 slots) internal returns (uint256) {
        vm.prank(_keyOf(investorId));
        return ledger.reserveSlots(PROJECT, slots);
    }

    function _confirm(uint256 reservationId, bytes32 ref) internal {
        vm.prank(accounts);
        ledger.confirmPayment(reservationId, ref);
    }

    function _funded() internal {
        _open();
        _confirm(_reserve(NASRIN, 4), "REF-1");
        _confirm(_reserve(KARIM, 96), "REF-2");
    }

    function _stage() internal view returns (ProjectLedger.Stage) {
        return ledger.getProject(PROJECT).stage;
    }

    // --- settings --------------------------------------------------------------

    function test_ConstructorRejectsZeroTtl() public {
        vm.expectRevert(ProjectLedger.ZeroValue.selector);
        new ProjectLedger(registry, 0);
    }

    function test_OnlySuperAdminLinksContracts() public {
        bytes32 defaultAdmin = registry.DEFAULT_ADMIN_ROLE();
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, admin, defaultAdmin));
        ledger.setLinkedContract(stranger, true);

        vm.prank(superAdmin);
        vm.expectRevert(ProjectLedger.ZeroValue.selector);
        ledger.setLinkedContract(address(0), true);

        vm.prank(superAdmin);
        ledger.setLinkedContract(linked, false);
        assertFalse(ledger.isLinkedContract(linked));
    }

    function test_AdminSetsReservationTtl() public {
        vm.prank(admin);
        ledger.setReservationTtl(1 days);
        assertEq(ledger.reservationTtl(), 1 days);

        vm.prank(admin);
        vm.expectRevert(ProjectLedger.ZeroValue.selector);
        ledger.setReservationTtl(0);

        vm.prank(accounts);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, accounts, ADMIN));
        ledger.setReservationTtl(1 days);
    }

    // --- creation ----------------------------------------------------------------

    function test_CreateProjectWorksOutSlots() public {
        _create(_maizeTerms());
        ProjectLedger.Project memory p = ledger.getProject(PROJECT);
        assertEq(uint8(p.stage), uint8(ProjectLedger.Stage.Draft));
        assertEq(p.totalSlots, 100);
        assertEq(p.terms.farmerId, RAHIM);
        assertEq(p.createdAt, block.timestamp);
        assertTrue(p.terms.insured);
    }

    function test_CreateEmitsEvents() public {
        vm.expectEmit(address(ledger));
        emit ProjectLedger.ProjectCreated(
            PROJECT, RAHIM, ProjectLedger.ProduceCategory.StorableCrop, 100, 20_000 * TK, keccak256("terms-v1"), admin
        );
        vm.expectEmit(address(ledger));
        emit ProjectLedger.ProjectStageChanged(PROJECT, ProjectLedger.Stage.None, ProjectLedger.Stage.Draft, admin);
        _create(_maizeTerms());
    }

    function test_OnlyAdminCreates() public {
        ProjectLedger.ProjectTerms memory t = _maizeTerms();
        vm.prank(officer);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, officer, ADMIN));
        ledger.createProject(PROJECT, t);
    }

    function test_CreateTwiceReverts() public {
        _create(_maizeTerms());
        ProjectLedger.ProjectTerms memory t = _maizeTerms();
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.ProjectExists.selector, PROJECT));
        ledger.createProject(PROJECT, t);
    }

    function test_CreateRejectsZeroFields() public {
        ProjectLedger.ProjectTerms memory t = _maizeTerms();
        vm.startPrank(admin);
        vm.expectRevert(ProjectLedger.ZeroValue.selector);
        ledger.createProject(bytes32(0), t);

        t.produceCode = bytes32(0);
        vm.expectRevert(ProjectLedger.ZeroValue.selector);
        ledger.createProject(PROJECT, t);

        t = _maizeTerms();
        t.termsHash = bytes32(0);
        vm.expectRevert(ProjectLedger.ZeroValue.selector);
        ledger.createProject(PROJECT, t);
        vm.stopPrank();
    }

    function test_CreateRequiresVerifiedFarmer() public {
        ProjectLedger.ProjectTerms memory t = _maizeTerms();
        t.farmerId = NASRIN; // verified, but as an investor
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.FarmerNotVerified.selector, NASRIN));
        ledger.createProject(PROJECT, t);

        vm.prank(admin);
        registry.rejectParticipant(RAHIM);
        t.farmerId = RAHIM;
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.FarmerNotVerified.selector, RAHIM));
        ledger.createProject(PROJECT, t);
    }

    function test_CreateRejectsBadSlotPricing() public {
        ProjectLedger.ProjectTerms memory t = _maizeTerms();
        vm.startPrank(admin);

        t.slotPrice = 0;
        vm.expectRevert(ProjectLedger.InvalidSlotPricing.selector);
        ledger.createProject(PROJECT, t);

        t = _maizeTerms();
        t.fundingTarget = 0;
        vm.expectRevert(ProjectLedger.InvalidSlotPricing.selector);
        ledger.createProject(PROJECT, t);

        t = _maizeTerms();
        t.fundingTarget = 2_000_000 * TK + 1; // not a whole number of slots
        vm.expectRevert(ProjectLedger.InvalidSlotPricing.selector);
        ledger.createProject(PROJECT, t);

        t = _maizeTerms();
        t.slotPrice = 1;
        t.fundingTarget = 10_001;
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.TooManySlots.selector, 10_001));
        ledger.createProject(PROJECT, t);
        vm.stopPrank();
    }

    function test_CreateRejectsBadSplit() public {
        ProjectLedger.ProjectTerms memory t = _maizeTerms();
        t.wegroBps = 1999;
        vm.prank(admin);
        vm.expectRevert(ProjectLedger.InvalidSplit.selector);
        ledger.createProject(PROJECT, t);
    }

    function test_CustomSplitAccepted() public {
        ProjectLedger.ProjectTerms memory t = _maizeTerms();
        (t.farmerBps, t.investorBps, t.wegroBps) = (5000, 3500, 1500);
        _create(t);
        assertEq(ledger.getProject(PROJECT).terms.farmerBps, 5000);
    }

    function test_DurationRules() public {
        ProjectLedger.ProjectTerms memory t = _maizeTerms();
        vm.startPrank(admin);

        t.durationMonths = 0;
        vm.expectRevert(ProjectLedger.InvalidDuration.selector);
        ledger.createProject(PROJECT, t);

        t.durationMonths = 6; // long term needs more than 6 months
        vm.expectRevert(ProjectLedger.InvalidDuration.selector);
        ledger.createProject(PROJECT, t);

        t.durationMonths = 12;
        t.payoutIntervalMonths = 13;
        vm.expectRevert(ProjectLedger.InvalidDuration.selector);
        ledger.createProject(PROJECT, t);

        t.durationType = ProjectLedger.DurationType.ShortTerm;
        t.durationMonths = 7; // short term is at most 6
        t.payoutIntervalMonths = 0;
        vm.expectRevert(ProjectLedger.InvalidDuration.selector);
        ledger.createProject(PROJECT, t);

        t.durationMonths = 4;
        t.payoutIntervalMonths = 2; // no staged payouts on short term
        vm.expectRevert(ProjectLedger.InvalidDuration.selector);
        ledger.createProject(PROJECT, t);

        t.payoutIntervalMonths = 0;
        ledger.createProject(PROJECT, t);
        vm.stopPrank();
    }

    function test_FarmerCanHaveSeveralProjects() public {
        _create(_maizeTerms());
        bytes32 second = keccak256("PRJ-MAIZE-BOGURA-02");
        ProjectLedger.ProjectTerms memory t = _maizeTerms();
        vm.prank(admin);
        ledger.createProject(second, t);
        assertEq(ledger.getProject(PROJECT).terms.farmerId, RAHIM);
        assertEq(ledger.getProject(second).terms.farmerId, RAHIM);
    }

    // --- funding -------------------------------------------------------------------

    function test_ReserveOnlyWhenOpen() public {
        _create(_maizeTerms());
        vm.prank(_keyOf(NASRIN));
        vm.expectRevert(
            abi.encodeWithSelector(ProjectLedger.WrongStage.selector, PROJECT, ProjectLedger.Stage.Draft)
        );
        ledger.reserveSlots(PROJECT, 4);
    }

    function test_ReserveUnknownProjectReverts() public {
        vm.prank(_keyOf(NASRIN));
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.ProjectNotFound.selector, PROJECT));
        ledger.reserveSlots(PROJECT, 4);
    }

    function test_NasrinReservesFourSlots() public {
        _open();
        vm.expectEmit(address(ledger));
        emit ProjectLedger.SlotsReserved(1, PROJECT, NASRIN, 4, uint64(block.timestamp) + TTL);
        uint256 id = _reserve(NASRIN, 4);

        assertEq(id, 1);
        assertEq(ledger.availableSlots(PROJECT), 96);
        assertEq(ledger.holdingOf(PROJECT, NASRIN), 0); // nothing issued before payment
        ProjectLedger.Reservation memory r = ledger.getReservation(id);
        assertEq(uint8(r.status), uint8(ProjectLedger.ReservationStatus.Pending));
        assertEq(r.slots, 4);
    }

    function test_ReserveGuards() public {
        _open();
        vm.startPrank(_keyOf(NASRIN));
        vm.expectRevert(ProjectLedger.ZeroValue.selector);
        ledger.reserveSlots(PROJECT, 0);
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.NotEnoughSlots.selector, 101, 100));
        ledger.reserveSlots(PROJECT, 101);
        vm.stopPrank();

        // Not yet verified: the key has no investor role.
        address pending = _keyOf(UNVERIFIED);
        vm.prank(pending);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, pending, INVESTOR));
        ledger.reserveSlots(PROJECT, 1);

        // A verified farmer is not an investor.
        address farmer = _keyOf(RAHIM);
        vm.prank(farmer);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, farmer, INVESTOR));
        ledger.reserveSlots(PROJECT, 1);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, admin, INVESTOR));
        ledger.reserveSlots(PROJECT, 1);
    }

    function test_ReservationRecordsTheSigner() public {
        _open();
        uint256 id = _reserve(KARIM, 3);
        assertEq(ledger.getReservation(id).investorId, KARIM);

        // An investor who loses their role cannot reserve any more.
        vm.prank(admin);
        registry.rejectParticipant(KARIM);
        address karim = _keyOf(KARIM);
        vm.prank(karim);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, karim, INVESTOR));
        ledger.reserveSlots(PROJECT, 1);
    }

    function test_PendingReservationsBlockSlots() public {
        _open();
        _reserve(NASRIN, 60);
        vm.prank(_keyOf(KARIM));
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.NotEnoughSlots.selector, 41, 40));
        ledger.reserveSlots(PROJECT, 41);
    }

    function test_ConfirmPaymentIssuesSlots() public {
        _open();
        uint256 id = _reserve(NASRIN, 4);

        vm.expectEmit(address(ledger));
        emit ProjectLedger.ReservationConfirmed(id, PROJECT, NASRIN, 4, "REF-1");
        _confirm(id, "REF-1");

        assertEq(ledger.holdingOf(PROJECT, NASRIN), 4);
        assertEq(ledger.getProject(PROJECT).issuedSlots, 4);
        assertEq(ledger.availableSlots(PROJECT), 96);
        assertTrue(ledger.paymentRefUsed("REF-1"));
        assertEq(ledger.getReservation(id).paymentRefHash, bytes32("REF-1"));
        assertEq(uint8(_stage()), uint8(ProjectLedger.Stage.OpenForFunding));
    }

    function test_OnlyAccountsConfirms() public {
        _open();
        uint256 id = _reserve(NASRIN, 4);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, admin, ACCOUNTS));
        ledger.confirmPayment(id, "REF-1");
    }

    function test_ConfirmGuards() public {
        _open();
        uint256 a = _reserve(NASRIN, 4);
        uint256 b = _reserve(KARIM, 4);

        vm.startPrank(accounts);
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.ReservationNotFound.selector, 99));
        ledger.confirmPayment(99, "REF-1");

        vm.expectRevert(ProjectLedger.ZeroValue.selector);
        ledger.confirmPayment(a, bytes32(0));

        ledger.confirmPayment(a, "REF-1");
        vm.expectRevert(
            abi.encodeWithSelector(
                ProjectLedger.ReservationNotPending.selector, a, ProjectLedger.ReservationStatus.Confirmed
            )
        );
        ledger.confirmPayment(a, "REF-9");

        // One bank payment cannot pay for two reservations.
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.PaymentRefAlreadyUsed.selector, bytes32("REF-1")));
        ledger.confirmPayment(b, "REF-1");
        vm.stopPrank();
    }

    function test_ExpiredReservationCannotBeConfirmed() public {
        _open();
        uint256 id = _reserve(NASRIN, 4);
        vm.warp(block.timestamp + TTL);
        vm.prank(accounts);
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.ReservationHasExpired.selector, id));
        ledger.confirmPayment(id, "REF-1");
    }

    function test_ExpireReleasesSlots() public {
        _open();
        uint256 id = _reserve(NASRIN, 4);
        uint64 expiresAt = ledger.getReservation(id).expiresAt;

        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.ReservationNotYetExpired.selector, id, expiresAt));
        ledger.expireReservation(id);

        vm.warp(expiresAt);
        vm.expectEmit(address(ledger));
        emit ProjectLedger.ReservationExpired(id, PROJECT);
        vm.prank(stranger); // anyone may release an expired hold
        ledger.expireReservation(id);

        assertEq(ledger.availableSlots(PROJECT), 100);
        assertEq(uint8(ledger.getReservation(id).status), uint8(ProjectLedger.ReservationStatus.Expired));
        assertEq(ledger.holdingOf(PROJECT, NASRIN), 0);
    }

    function test_CancelReservation() public {
        _open();
        uint256 a = _reserve(NASRIN, 4);
        uint256 b = _reserve(KARIM, 4);

        // Nasrin cannot cancel Karim's reservation.
        address nasrin = _keyOf(NASRIN);
        vm.prank(nasrin);
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.NotAuthorized.selector, nasrin));
        ledger.cancelReservation(b);

        vm.prank(nasrin);
        ledger.cancelReservation(a);
        vm.prank(admin);
        ledger.cancelReservation(b);
        assertEq(ledger.availableSlots(PROJECT), 100);
        assertEq(uint8(ledger.getReservation(a).status), uint8(ProjectLedger.ReservationStatus.Cancelled));

        uint256 c = _reserve(NASRIN, 1);
        vm.prank(accounts);
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.NotAuthorized.selector, accounts));
        ledger.cancelReservation(c);

        vm.prank(nasrin);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProjectLedger.ReservationNotPending.selector, a, ProjectLedger.ReservationStatus.Cancelled
            )
        );
        ledger.cancelReservation(a);
    }

    function test_FullyIssuedProjectBecomesFunded() public {
        _open();
        _confirm(_reserve(NASRIN, 4), "REF-1");
        uint256 last = _reserve(KARIM, 96);

        vm.expectEmit(address(ledger));
        emit ProjectLedger.ProjectStageChanged(
            PROJECT, ProjectLedger.Stage.OpenForFunding, ProjectLedger.Stage.Funded, accounts
        );
        _confirm(last, "REF-2");

        assertEq(uint8(_stage()), uint8(ProjectLedger.Stage.Funded));
        assertEq(ledger.availableSlots(PROJECT), 0);
        bytes32[] memory holders = ledger.getHolders(PROJECT);
        assertEq(holders.length, 2);
        assertEq(holders[0], NASRIN);
        assertEq(holders[1], KARIM);
    }

    function test_RepeatInvestorListedOnce() public {
        _open();
        _confirm(_reserve(NASRIN, 4), "REF-1");
        _confirm(_reserve(NASRIN, 6), "REF-2");
        assertEq(ledger.holdingOf(PROJECT, NASRIN), 10);
        assertEq(ledger.getHolders(PROJECT).length, 1);
    }

    function test_NoMoreReservationsOnceFunded() public {
        _funded();
        vm.prank(_keyOf(NASRIN));
        vm.expectRevert(
            abi.encodeWithSelector(ProjectLedger.WrongStage.selector, PROJECT, ProjectLedger.Stage.Funded)
        );
        ledger.reserveSlots(PROJECT, 1);
    }

    function test_SlotsHaveNoTransferFunction() public {
        // FR-7: slots cannot be handed to someone else. Nothing in the ABI moves holdings.
        (bool ok,) = address(ledger).call(
            abi.encodeWithSignature("transferSlots(bytes32,bytes32,bytes32,uint32)", PROJECT, NASRIN, KARIM, 1)
        );
        assertFalse(ok);
    }

    // --- lifecycle -------------------------------------------------------------------

    function test_FullLifecycle() public {
        _funded();

        vm.prank(linked); // VoucherRegistry, on the first voucher
        ledger.activate(PROJECT);
        assertEq(uint8(_stage()), uint8(ProjectLedger.Stage.Active));

        vm.prank(linked); // TradeLedger, on delivery
        ledger.markReadyForSale(PROJECT);
        assertEq(uint8(_stage()), uint8(ProjectLedger.Stage.ReadyForSale));

        vm.prank(accounts);
        ledger.markPaidOut(PROJECT);
        assertEq(uint8(_stage()), uint8(ProjectLedger.Stage.PaidOut));

        vm.prank(admin);
        ledger.close(PROJECT);
        assertEq(uint8(_stage()), uint8(ProjectLedger.Stage.Closed));
    }

    function test_AdminCanAdvanceManually() public {
        _funded();
        vm.startPrank(admin);
        ledger.activate(PROJECT);
        ledger.markReadyForSale(PROJECT);
        vm.stopPrank();
        vm.prank(linked);
        ledger.markPaidOut(PROJECT);
        assertEq(uint8(_stage()), uint8(ProjectLedger.Stage.PaidOut));
    }

    function test_StagesCannotBeSkipped() public {
        _open();
        vm.startPrank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(ProjectLedger.WrongStage.selector, PROJECT, ProjectLedger.Stage.OpenForFunding)
        );
        ledger.activate(PROJECT);
        vm.expectRevert(
            abi.encodeWithSelector(ProjectLedger.WrongStage.selector, PROJECT, ProjectLedger.Stage.OpenForFunding)
        );
        ledger.openForFunding(PROJECT);
        vm.expectRevert(
            abi.encodeWithSelector(ProjectLedger.WrongStage.selector, PROJECT, ProjectLedger.Stage.OpenForFunding)
        );
        ledger.close(PROJECT);
        vm.stopPrank();

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.ProjectNotFound.selector, bytes32("nope")));
        ledger.openForFunding("nope");
    }

    function test_StageTransitionsCheckCaller() public {
        _funded();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.NotAuthorized.selector, stranger));
        ledger.activate(PROJECT);

        vm.prank(admin);
        ledger.activate(PROJECT);
        vm.prank(accounts);
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.NotAuthorized.selector, accounts));
        ledger.markReadyForSale(PROJECT);

        vm.prank(admin);
        ledger.markReadyForSale(PROJECT);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.NotAuthorized.selector, admin));
        ledger.markPaidOut(PROJECT);

        vm.prank(accounts);
        ledger.markPaidOut(PROJECT);
        vm.prank(linked);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, linked, ADMIN));
        ledger.close(PROJECT);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, stranger, ADMIN));
        ledger.openForFunding(PROJECT);
    }

    // --- cancellation and refunds -------------------------------------------------------

    function test_CancelDraftNeedsNoRefund() public {
        _create(_maizeTerms());
        vm.recordLogs();
        vm.prank(admin);
        ledger.cancelProject(PROJECT);
        assertEq(vm.getRecordedLogs().length, 1); // only the stage change
        assertEq(uint8(_stage()), uint8(ProjectLedger.Stage.Cancelled));
    }

    function test_CancelFundedCreatesRefundInstruction() public {
        _funded();
        vm.expectEmit(address(ledger));
        emit ProjectLedger.ProjectStageChanged(PROJECT, ProjectLedger.Stage.Funded, ProjectLedger.Stage.Cancelled, admin);
        vm.expectEmit(address(ledger));
        emit ProjectLedger.RefundsRequired(PROJECT, 100, 2_000_000 * TK);
        vm.prank(admin);
        ledger.cancelProject(PROJECT);

        assertEq(ledger.refundDue(PROJECT, NASRIN), 80_000 * TK);
        assertEq(ledger.refundDue(PROJECT, KARIM), 1_920_000 * TK);
    }

    function test_CannotCancelOnceActive() public {
        _funded();
        vm.startPrank(admin);
        ledger.activate(PROJECT);
        vm.expectRevert(
            abi.encodeWithSelector(ProjectLedger.WrongStage.selector, PROJECT, ProjectLedger.Stage.Active)
        );
        ledger.cancelProject(PROJECT);
        vm.stopPrank();
    }

    function test_CancelledProjectRejectsPendingPayments() public {
        _open();
        uint256 id = _reserve(NASRIN, 4);
        vm.prank(admin);
        ledger.cancelProject(PROJECT);
        vm.prank(accounts);
        vm.expectRevert(
            abi.encodeWithSelector(ProjectLedger.WrongStage.selector, PROJECT, ProjectLedger.Stage.Cancelled)
        );
        ledger.confirmPayment(id, "REF-1");
    }

    function test_RecordRefund() public {
        _funded();
        vm.prank(admin);
        ledger.cancelProject(PROJECT);

        vm.expectEmit(address(ledger));
        emit ProjectLedger.RefundRecorded(PROJECT, NASRIN, "REFUND-1");
        vm.prank(accounts);
        ledger.recordRefund(PROJECT, NASRIN, "REFUND-1");
        assertEq(ledger.refundDue(PROJECT, NASRIN), 0);

        vm.startPrank(accounts);
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.AlreadyRefunded.selector, PROJECT, NASRIN));
        ledger.recordRefund(PROJECT, NASRIN, "REFUND-2");

        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.NothingToRefund.selector, PROJECT, RAHIM));
        ledger.recordRefund(PROJECT, RAHIM, "REFUND-3");

        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.PaymentRefAlreadyUsed.selector, bytes32("REFUND-1")));
        ledger.recordRefund(PROJECT, KARIM, "REFUND-1");
        vm.stopPrank();

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, admin, ACCOUNTS));
        ledger.recordRefund(PROJECT, KARIM, "REFUND-4");
    }

    function test_NoRefundUnlessCancelled() public {
        _funded();
        assertEq(ledger.refundDue(PROJECT, NASRIN), 0);
        vm.prank(accounts);
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.NothingToRefund.selector, PROJECT, NASRIN));
        ledger.recordRefund(PROJECT, NASRIN, "REFUND-1");
    }

    // --- invariant-style fuzz ------------------------------------------------------------

    /// Issued + reserved + available always equals the total, and issuing never exceeds it.
    function testFuzz_SlotAccounting(uint32 a, uint32 b, bool confirmA, bool expireB) public {
        _open();
        a = uint32(bound(a, 1, 100));
        b = uint32(bound(b, 1, 100 - a + 1));
        uint256 idA = _reserve(NASRIN, a);

        if (b > 100 - a) {
            vm.prank(_keyOf(KARIM));
            vm.expectRevert(abi.encodeWithSelector(ProjectLedger.NotEnoughSlots.selector, b, 100 - a));
            ledger.reserveSlots(PROJECT, b);
            return;
        }
        uint256 idB = _reserve(KARIM, b);

        if (confirmA) _confirm(idA, "REF-A");
        if (expireB) {
            vm.warp(block.timestamp + TTL);
            ledger.expireReservation(idB);
        }

        ProjectLedger.Project memory p = ledger.getProject(PROJECT);
        assertEq(uint256(p.issuedSlots) + p.reservedSlots + ledger.availableSlots(PROJECT), p.totalSlots);
        assertEq(p.issuedSlots, confirmA ? a : 0);
        assertEq(p.reservedSlots, (confirmA ? 0 : a) + (expireB ? 0 : b));
    }
}

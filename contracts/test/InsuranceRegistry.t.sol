// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AccessRegistry} from "../contracts/access/AccessRegistry.sol";
import {AccessGuarded} from "../contracts/access/AccessGuarded.sol";
import {ProjectLedger} from "../contracts/projects/ProjectLedger.sol";
import {InsuranceRegistry} from "../contracts/insurance/InsuranceRegistry.sol";

contract InsuranceRegistryTest is Test {
    AccessRegistry registry;
    ProjectLedger ledger;
    InsuranceRegistry insurance;

    address superAdmin = makeAddr("superAdmin");
    address admin = makeAddr("tania");
    address accounts = makeAddr("farhana");
    address jui = makeAddr("jui"); // insurer
    address nasrin = makeAddr("nasrin");
    address rahim = makeAddr("rahim");
    address imran = makeAddr("imran"); // Rahim's field officer
    address sumon = makeAddr("sumon"); // another officer
    address mitu = makeAddr("mitu"); // another insurer

    uint256 constant TK = 100;
    bytes32 constant RAHIM = keccak256("FARMER-0001");
    bytes32 constant NASRIN = keccak256("INVESTOR-0001");
    bytes32 constant JUI = keccak256("INSURER-0001");
    bytes32 constant MAIZE = keccak256("PRJ-MAIZE-BOGURA-01"); // insured, Bogura
    bytes32 constant RICE = keccak256("PRJ-RICE-BOGURA-02"); // not insured
    bytes32 constant FLOOD = "FLOOD-BOGURA-2026-07";
    bytes32 constant CLAIM = "CLM-0001";
    bytes32 constant OFFICER = keccak256("STAFF-OFFICER-1");
    bytes32 constant MITU = keccak256("INSURER-0002");
    bytes32 constant EVIDENCE = keccak256("damage 40%, photos of flooded field");

    bytes32 INSURER;
    uint256 refCount;

    function setUp() public {
        vm.warp(1_780_000_000);
        registry = new AccessRegistry(superAdmin);
        ledger = new ProjectLedger(registry, 120 hours);
        insurance = new InsuranceRegistry(registry, ledger);
        INSURER = registry.INSURER_ROLE();

        vm.startPrank(superAdmin);
        _person(keccak256("STAFF-ADMIN"), registry.ADMIN_ROLE(), admin);
        _person(keccak256("STAFF-ACCOUNTS"), registry.ACCOUNTS_ROLE(), accounts);
        _person(OFFICER, registry.FIELD_OFFICER_ROLE(), imran);
        _person(keccak256("STAFF-OFFICER-2"), registry.FIELD_OFFICER_ROLE(), sumon);
        vm.stopPrank();
        vm.startPrank(admin);
        _person(RAHIM, registry.FARMER_ROLE(), rahim);
        _person(NASRIN, registry.INVESTOR_ROLE(), nasrin);
        _person(JUI, INSURER, jui);
        _person(MITU, INSURER, mitu);
        registry.assignFieldOfficer(RAHIM, OFFICER);
        vm.stopPrank();

        _fund(MAIZE, true);
        _fund(RICE, false);
        vm.prank(admin);
        insurance.assignInsurer(MAIZE, JUI);
        vm.prank(jui);
        insurance.setCoverage(MAIZE, 300_000 * TK, keccak256("flood and drought cover"));
        vm.prank(admin);
        insurance.recordWeatherEvent(FLOOD, "BOGURA", "FLOOD", keccak256("river level report"));
    }

    function _person(bytes32 id, bytes32 role, address account) internal {
        registry.registerParticipant(id, role, account, keccak256(abi.encode(id)));
        registry.verifyParticipant(id);
    }

    function _fund(bytes32 id, bool insured) internal {
        ProjectLedger.ProjectTerms memory t = ProjectLedger.ProjectTerms({
            farmerId: RAHIM,
            produceCode: "MAIZE",
            category: ProjectLedger.ProduceCategory.StorableCrop,
            regionCode: "BOGURA",
            durationType: ProjectLedger.DurationType.LongTerm,
            durationMonths: 12,
            payoutIntervalMonths: 0,
            fundingTarget: 100_000 * TK,
            slotPrice: 10_000 * TK,
            farmerBps: 4000,
            investorBps: 4000,
            wegroBps: 2000,
            insured: insured,
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

    function _open() internal {
        vm.prank(imran);
        insurance.openClaim(CLAIM, MAIZE, FLOOD, EVIDENCE);
    }

    function _approve(uint256 amount) internal {
        _open();
        vm.startPrank(jui);
        insurance.startReview(CLAIM);
        insurance.approveClaim(CLAIM, amount, keccak256("field assessment"));
        vm.stopPrank();
    }

    function _status() internal view returns (uint8) {
        return uint8(insurance.getClaim(CLAIM).status);
    }

    function test_ConstructorRejectsZeroLedger() public {
        vm.expectRevert(InsuranceRegistry.ZeroProjectLedger.selector);
        new InsuranceRegistry(registry, ProjectLedger(address(0)));
    }

    // --- the doc's flood: Triggered -> Under review -> Approved ---------------------------

    function test_FloodClaimApproved() public {
        vm.expectEmit(address(insurance));
        emit InsuranceRegistry.ClaimOpened(CLAIM, MAIZE, FLOOD, EVIDENCE, OFFICER);
        _open();
        assertEq(_status(), uint8(InsuranceRegistry.ClaimStatus.Triggered));
        assertTrue(insurance.hasClaim(MAIZE, FLOOD));

        vm.prank(jui);
        insurance.startReview(CLAIM);
        assertEq(_status(), uint8(InsuranceRegistry.ClaimStatus.UnderReview));

        vm.expectEmit(address(insurance));
        emit InsuranceRegistry.ClaimStatusChanged(
            CLAIM, InsuranceRegistry.ClaimStatus.Approved, 120_000 * TK, keccak256("field assessment")
        );
        vm.prank(jui);
        insurance.approveClaim(CLAIM, 120_000 * TK, keccak256("field assessment"));

        InsuranceRegistry.Claim memory c = insurance.getClaim(CLAIM);
        assertEq(c.approvedAmount, 120_000 * TK);
        assertEq(c.claimHash, EVIDENCE);
        assertEq(c.openedBy, OFFICER);
        assertEq(insurance.approvedTotal(MAIZE), 120_000 * TK);
    }

    function test_RejectClaim() public {
        _open();
        vm.prank(jui);
        insurance.rejectClaim(CLAIM, keccak256("no damage found")); // straight from Triggered
        assertEq(_status(), uint8(InsuranceRegistry.ClaimStatus.Rejected));
        assertEq(insurance.approvedTotal(MAIZE), 0);

        vm.prank(jui);
        vm.expectRevert(
            abi.encodeWithSelector(
                InsuranceRegistry.WrongClaimStatus.selector, CLAIM, InsuranceRegistry.ClaimStatus.Rejected
            )
        );
        insurance.rejectClaim(CLAIM, keccak256("again"));
    }

    function test_ApprovalCappedByCover() public {
        _open();
        vm.startPrank(jui);
        insurance.startReview(CLAIM);
        vm.expectRevert(
            abi.encodeWithSelector(InsuranceRegistry.ExceedsCoverage.selector, 300_001 * TK, 300_000 * TK)
        );
        insurance.approveClaim(CLAIM, 300_001 * TK, keccak256("a"));
        insurance.approveClaim(CLAIM, 200_000 * TK, keccak256("a"));

        // Cover cannot drop below what is already approved.
        vm.expectRevert(
            abi.encodeWithSelector(InsuranceRegistry.CoverageBelowApproved.selector, 100_000 * TK, 200_000 * TK)
        );
        insurance.setCoverage(MAIZE, 100_000 * TK, keccak256("less"));
        vm.stopPrank();

        // A second event can only use the remaining Tk 100,000.
        vm.prank(admin);
        insurance.recordWeatherEvent("DROUGHT-2026", "BOGURA", "DROUGHT", keccak256("r"));
        vm.prank(imran); // Rahim's officer claims; the insurer reviews
        insurance.openClaim("CLM-0002", MAIZE, "DROUGHT-2026", EVIDENCE);
        vm.startPrank(jui);
        insurance.startReview("CLM-0002");
        vm.expectRevert(
            abi.encodeWithSelector(InsuranceRegistry.ExceedsCoverage.selector, 100_001 * TK, 100_000 * TK)
        );
        insurance.approveClaim("CLM-0002", 100_001 * TK, keccak256("a"));
        vm.stopPrank();
    }

    // --- guards --------------------------------------------------------------------------

    function test_CoverageGuards() public {
        vm.startPrank(jui);
        vm.expectRevert(InsuranceRegistry.ZeroValue.selector);
        insurance.setCoverage(MAIZE, 0, keccak256("x"));
        vm.expectRevert(InsuranceRegistry.ZeroValue.selector);
        insurance.setCoverage(MAIZE, 1, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.NotInsured.selector, RICE));
        insurance.setCoverage(RICE, 1, keccak256("x"));
        vm.expectRevert(
            abi.encodeWithSelector(InsuranceRegistry.WrongProjectStage.selector, bytes32("NONE"), ProjectLedger.Stage.None)
        );
        insurance.setCoverage("NONE", 1, keccak256("x"));
        vm.stopPrank();

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, admin, INSURER));
        insurance.setCoverage(MAIZE, 1, keccak256("x"));
        assertEq(insurance.getCoverage(MAIZE).insurerId, JUI);
    }

    function test_EventGuards() public {
        vm.startPrank(jui);
        vm.expectRevert(InsuranceRegistry.ZeroValue.selector);
        insurance.recordWeatherEvent(bytes32(0), "BOGURA", "FLOOD", keccak256("x"));
        vm.expectRevert(InsuranceRegistry.ZeroValue.selector);
        insurance.recordWeatherEvent("E", bytes32(0), "FLOOD", keccak256("x"));
        vm.expectRevert(InsuranceRegistry.ZeroValue.selector);
        insurance.recordWeatherEvent("E", "BOGURA", bytes32(0), keccak256("x"));
        vm.expectRevert(InsuranceRegistry.ZeroValue.selector);
        insurance.recordWeatherEvent("E", "BOGURA", "FLOOD", bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.EventExists.selector, FLOOD));
        insurance.recordWeatherEvent(FLOOD, "BOGURA", "FLOOD", keccak256("x"));
        vm.stopPrank();

        vm.prank(accounts);
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.NotAuthorized.selector, accounts));
        insurance.recordWeatherEvent("E", "BOGURA", "FLOOD", keccak256("x"));
        assertEq(insurance.getWeatherEvent(FLOOD).regionCode, bytes32("BOGURA"));
    }

    function test_OpenClaimGuards() public {
        vm.startPrank(admin);
        vm.expectRevert(InsuranceRegistry.ZeroValue.selector);
        insurance.openClaim(bytes32(0), MAIZE, FLOOD, EVIDENCE);
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.EventNotFound.selector, bytes32("NOPE")));
        insurance.openClaim(CLAIM, MAIZE, "NOPE", EVIDENCE);
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.NotInsured.selector, RICE));
        insurance.openClaim(CLAIM, RICE, FLOOD, EVIDENCE);

        insurance.recordWeatherEvent("FLOOD-SYLHET", "SYLHET", "FLOOD", keccak256("x"));
        vm.expectRevert(
            abi.encodeWithSelector(InsuranceRegistry.RegionMismatch.selector, bytes32("BOGURA"), bytes32("SYLHET"))
        );
        insurance.openClaim(CLAIM, MAIZE, "FLOOD-SYLHET", EVIDENCE);

        insurance.openClaim(CLAIM, MAIZE, FLOOD, EVIDENCE);
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.ClaimExists.selector, CLAIM));
        insurance.openClaim(CLAIM, MAIZE, FLOOD, EVIDENCE);
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.AlreadyClaimed.selector, MAIZE, FLOOD));
        insurance.openClaim("CLM-0002", MAIZE, FLOOD, EVIDENCE);
        vm.stopPrank();

        vm.prank(imran);
        vm.expectRevert(InsuranceRegistry.ZeroValue.selector);
        insurance.openClaim("CLM-0004", MAIZE, FLOOD, bytes32(0));

        vm.prank(nasrin);
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.NotAuthorized.selector, nasrin));
        insurance.openClaim("CLM-0003", MAIZE, FLOOD, EVIDENCE);
    }

    function test_ClaimNeedsCoverage() public {
        bytes32 other = keccak256("PRJ-MAIZE-03");
        _fund(other, true); // insured, but no cover set yet
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.NoCoverage.selector, other));
        insurance.openClaim(CLAIM, other, FLOOD, EVIDENCE);
    }

    function test_ReviewGuards() public {
        vm.startPrank(jui);
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.ClaimNotFound.selector, CLAIM));
        insurance.startReview(CLAIM);
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.ClaimNotFound.selector, CLAIM));
        insurance.rejectClaim(CLAIM, keccak256("x"));
        vm.stopPrank();

        _open();
        vm.startPrank(jui);
        vm.expectRevert(
            abi.encodeWithSelector(
                InsuranceRegistry.WrongClaimStatus.selector, CLAIM, InsuranceRegistry.ClaimStatus.Triggered
            )
        );
        insurance.approveClaim(CLAIM, 1, keccak256("x")); // must be under review first
        insurance.startReview(CLAIM);
        vm.expectRevert(InsuranceRegistry.ZeroValue.selector);
        insurance.approveClaim(CLAIM, 0, keccak256("x"));
        vm.expectRevert(InsuranceRegistry.ZeroValue.selector);
        insurance.approveClaim(CLAIM, 1, bytes32(0));
        vm.expectRevert(InsuranceRegistry.ZeroValue.selector);
        insurance.rejectClaim(CLAIM, bytes32(0));
        vm.stopPrank();

        vm.prank(admin); // reviewing is the insurer's job
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, admin, INSURER));
        insurance.approveClaim(CLAIM, 1, keccak256("x"));
    }

    function test_NoNewClaimsOnceCropIsSold() public {
        vm.startPrank(admin);
        ledger.activate(MAIZE);
        ledger.markReadyForSale(MAIZE);
        vm.expectRevert(
            abi.encodeWithSelector(InsuranceRegistry.WrongProjectStage.selector, MAIZE, ProjectLedger.Stage.ReadyForSale)
        );
        insurance.openClaim(CLAIM, MAIZE, FLOOD, EVIDENCE);
        vm.stopPrank();

        vm.prank(jui);
        vm.expectRevert(
            abi.encodeWithSelector(InsuranceRegistry.WrongProjectStage.selector, MAIZE, ProjectLedger.Stage.ReadyForSale)
        );
        insurance.setCoverage(MAIZE, 1, keccak256("x"));
    }

    function test_OpenClaimsAreCounted() public {
        _open();
        assertEq(insurance.openClaims(MAIZE), 1);

        vm.prank(admin);
        insurance.recordWeatherEvent("DROUGHT-2026", "BOGURA", "DROUGHT", keccak256("r"));
        vm.prank(admin);
        insurance.openClaim("CLM-0002", MAIZE, "DROUGHT-2026", EVIDENCE);
        assertEq(insurance.openClaims(MAIZE), 2);

        vm.startPrank(jui);
        insurance.startReview(CLAIM);
        assertEq(insurance.openClaims(MAIZE), 2); // under review is still open
        insurance.approveClaim(CLAIM, 1_000 * TK, keccak256("a"));
        insurance.rejectClaim("CLM-0002", keccak256("no damage"));
        vm.stopPrank();
        assertEq(insurance.openClaims(MAIZE), 0);
    }

    function test_OpenClaimCanBeDecidedAfterHarvest() public {
        _open();
        vm.startPrank(admin);
        ledger.activate(MAIZE);
        ledger.markReadyForSale(MAIZE);
        vm.stopPrank();
        vm.startPrank(jui); // a claim opened in the field is still reviewed
        insurance.startReview(CLAIM);
        insurance.approveClaim(CLAIM, 50_000 * TK, keccak256("a"));
        vm.stopPrank();
        assertEq(insurance.approvedTotal(MAIZE), 50_000 * TK);
        assertEq(insurance.openClaims(MAIZE), 0);
    }

    // --- who claims, who reviews -----------------------------------------------------

    function test_OnlyTheFarmersOfficerOrAnAdminClaims() public {
        vm.prank(sumon); // an officer, but not Rahim's
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.NotAuthorized.selector, sumon));
        insurance.openClaim(CLAIM, MAIZE, FLOOD, EVIDENCE);
        vm.prank(jui); // insurers review, they do not claim
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.NotAuthorized.selector, jui));
        insurance.openClaim(CLAIM, MAIZE, FLOOD, EVIDENCE);

        vm.prank(admin);
        insurance.openClaim(CLAIM, MAIZE, FLOOD, EVIDENCE);
        assertEq(insurance.getClaim(CLAIM).openedBy, keccak256("STAFF-ADMIN"));
    }

    function test_OnlyTheCoveringInsurerChangesCoverOrReviews() public {
        vm.prank(mitu);
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.NotProjectInsurer.selector, MAIZE, JUI));
        insurance.setCoverage(MAIZE, 400_000 * TK, keccak256("x"));
        vm.prank(jui); // the covering insurer can change it
        insurance.setCoverage(MAIZE, 400_000 * TK, keccak256("wider cover"));
        assertEq(insurance.getCoverage(MAIZE).maxAmount, 400_000 * TK);

        _open();
        vm.startPrank(mitu);
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.NotProjectInsurer.selector, MAIZE, JUI));
        insurance.startReview(CLAIM);
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.NotProjectInsurer.selector, MAIZE, JUI));
        insurance.rejectClaim(CLAIM, keccak256("x"));
        vm.stopPrank();
        vm.prank(jui);
        insurance.startReview(CLAIM);
        vm.prank(mitu);
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.NotProjectInsurer.selector, MAIZE, JUI));
        insurance.approveClaim(CLAIM, 1, keccak256("x"));
    }

    // --- the admin assigns the insurer -------------------------------------------------

    function test_AdminAssignsTheInsurer() public {
        bytes32 other = keccak256("PRJ-MAIZE-03");
        _fund(other, true);

        vm.prank(jui); // no insurer assigned yet: nobody sets cover
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.NoInsurerAssigned.selector, other));
        insurance.setCoverage(other, 1, keccak256("x"));

        bytes32 adminRole = registry.ADMIN_ROLE();
        vm.prank(jui); // insurers do not pick projects themselves
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, jui, adminRole));
        insurance.assignInsurer(other, JUI);

        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.NotAnInsurer.selector, RAHIM));
        insurance.assignInsurer(other, RAHIM);
        vm.expectRevert(InsuranceRegistry.ZeroValue.selector);
        insurance.assignInsurer(other, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.NotInsured.selector, RICE));
        insurance.assignInsurer(RICE, JUI);
        vm.expectEmit(address(insurance));
        emit InsuranceRegistry.InsurerAssigned(other, MITU, bytes32(0));
        insurance.assignInsurer(other, MITU);
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.InsurerAlreadyAssigned.selector, other, MITU));
        insurance.assignInsurer(other, MITU);
        vm.stopPrank();
        assertEq(insurance.assignedInsurer(other), MITU);

        vm.prank(jui); // only the assigned insurer sets the cover
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.NotProjectInsurer.selector, other, MITU));
        insurance.setCoverage(other, 1, keccak256("x"));
        vm.prank(mitu);
        insurance.setCoverage(other, 50_000 * TK, keccak256("mitu's cover"));
        assertEq(insurance.getCoverage(other).insurerId, MITU);
    }

    function test_SuperAdminAssignsToo() public {
        bytes32 other = keccak256("PRJ-MAIZE-03");
        _fund(other, true);
        vm.prank(superAdmin);
        insurance.assignInsurer(other, JUI);
        assertEq(insurance.assignedInsurer(other), JUI);
    }

    function test_SwitchingInsurersClearsCoverUntilTheFirstClaim() public {
        vm.prank(admin);
        vm.expectEmit(address(insurance));
        emit InsuranceRegistry.InsurerAssigned(MAIZE, MITU, JUI);
        insurance.assignInsurer(MAIZE, MITU);
        assertEq(insurance.getCoverage(MAIZE).maxAmount, 0); // Jui's terms are gone

        vm.prank(admin); // no cover now, so no claim
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.NoCoverage.selector, MAIZE));
        insurance.openClaim(CLAIM, MAIZE, FLOOD, EVIDENCE);
        vm.prank(jui);
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.NotProjectInsurer.selector, MAIZE, MITU));
        insurance.setCoverage(MAIZE, 1, keccak256("x"));
        vm.prank(mitu);
        insurance.setCoverage(MAIZE, 200_000 * TK, keccak256("mitu's cover"));

        _open();
        vm.prank(admin); // the first claim fixes the insurer
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.InsurerFixed.selector, MAIZE));
        insurance.assignInsurer(MAIZE, JUI);
        assertEq(insurance.claimCount(MAIZE), 1);
    }

    // --- Accounts records the insurer's payment -------------------------------------------

    function test_PaymentMakesAnApprovedClaimIncome() public {
        _approve(120_000 * TK);
        assertEq(insurance.unpaidClaims(MAIZE), 1);
        assertEq(insurance.paidTotal(MAIZE), 0); // approved is not yet money

        bytes32 ref = keccak256("TRX 77120");
        vm.expectEmit(address(insurance));
        emit InsuranceRegistry.ClaimPaid(CLAIM, MAIZE, 120_000 * TK, ref);
        vm.prank(accounts);
        insurance.recordClaimPayment(CLAIM, ref);

        assertEq(_status(), uint8(InsuranceRegistry.ClaimStatus.Paid));
        assertEq(insurance.getClaim(CLAIM).paymentRefHash, ref);
        assertEq(insurance.paidTotal(MAIZE), 120_000 * TK);
        assertEq(insurance.approvedTotal(MAIZE), 120_000 * TK);
        assertEq(insurance.unpaidClaims(MAIZE), 0);
    }

    function test_PaymentGuards() public {
        vm.prank(accounts);
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.ClaimNotFound.selector, CLAIM));
        insurance.recordClaimPayment(CLAIM, keccak256("r"));

        _open();
        vm.prank(accounts); // only an approved claim is paid
        vm.expectRevert(
            abi.encodeWithSelector(
                InsuranceRegistry.WrongClaimStatus.selector, CLAIM, InsuranceRegistry.ClaimStatus.Triggered
            )
        );
        insurance.recordClaimPayment(CLAIM, keccak256("r"));
        vm.startPrank(jui);
        insurance.startReview(CLAIM);
        insurance.approveClaim(CLAIM, 1_000 * TK, keccak256("a"));
        vm.stopPrank();

        bytes32 accountsRole = registry.ACCOUNTS_ROLE();
        vm.prank(admin); // paying is Accounts' job
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, admin, accountsRole));
        insurance.recordClaimPayment(CLAIM, keccak256("r"));
        vm.startPrank(accounts);
        vm.expectRevert(InsuranceRegistry.ZeroValue.selector);
        insurance.recordClaimPayment(CLAIM, bytes32(0));
        insurance.recordClaimPayment(CLAIM, keccak256("r"));
        vm.expectRevert(
            abi.encodeWithSelector(InsuranceRegistry.WrongClaimStatus.selector, CLAIM, InsuranceRegistry.ClaimStatus.Paid)
        );
        insurance.recordClaimPayment(CLAIM, keccak256("r2"));
        vm.stopPrank();

        // One payment reference is recorded once.
        vm.prank(admin);
        insurance.recordWeatherEvent("DROUGHT-2026", "BOGURA", "DROUGHT", keccak256("r"));
        vm.prank(imran);
        insurance.openClaim("CLM-0002", MAIZE, "DROUGHT-2026", EVIDENCE);
        vm.startPrank(jui);
        insurance.startReview("CLM-0002");
        insurance.approveClaim("CLM-0002", 1_000 * TK, keccak256("a"));
        vm.stopPrank();
        vm.prank(accounts);
        vm.expectRevert(abi.encodeWithSelector(InsuranceRegistry.PaymentRefUsed.selector, keccak256("r")));
        insurance.recordClaimPayment("CLM-0002", keccak256("r"));
    }

    function test_SuperAdminRecordsPaymentToo() public {
        _approve(1_000 * TK);
        vm.prank(superAdmin);
        insurance.recordClaimPayment(CLAIM, keccak256("r"));
        assertEq(insurance.paidTotal(MAIZE), 1_000 * TK);
    }
}

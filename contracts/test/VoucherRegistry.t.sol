// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AccessRegistry} from "../contracts/access/AccessRegistry.sol";
import {AccessGuarded} from "../contracts/access/AccessGuarded.sol";
import {ProjectLedger} from "../contracts/projects/ProjectLedger.sol";
import {VoucherRegistry} from "../contracts/inputs/VoucherRegistry.sol";

contract VoucherRegistryTest is Test {
    AccessRegistry registry;
    ProjectLedger ledger;
    VoucherRegistry vouchers;

    address superAdmin = makeAddr("superAdmin");
    address admin = makeAddr("tania");
    address imran = makeAddr("imran"); // Rahim's field officer
    address otherOfficer = makeAddr("sumon");
    address accounts = makeAddr("farhana");
    address operations = makeAddr("ops"); // calculates and proposes vouchers
    address rahim = makeAddr("rahim");
    address otherFarmer = makeAddr("karim");
    address nasrin = makeAddr("nasrin");
    address kamal = makeAddr("kamal");
    address jamal = makeAddr("jamal");
    address rupa = makeAddr("rupa");

    uint256 constant TK = 100; // poisha per taka
    uint256 constant PRICE = 300 * TK; // Tk 300 per kg
    uint64 constant SALE_TTL = 7 days;

    bytes32 constant IMRAN = keccak256("STAFF-OFFICER-1");
    bytes32 constant SUMON = keccak256("STAFF-OFFICER-2");
    bytes32 constant RAHIM = keccak256("FARMER-0001");
    bytes32 constant KARIM = keccak256("FARMER-0002");
    bytes32 constant NASRIN = keccak256("INVESTOR-0001");
    bytes32 constant KAMAL = keccak256("SUPPLIER-0001");
    bytes32 constant JAMAL = keccak256("SUPPLIER-0002");
    bytes32 constant RUPA = keccak256("SUPPLIER-0003"); // verified, but not on the voucher
    bytes32 constant UNVERIFIED_SUPPLIER = keccak256("SUPPLIER-0004");

    bytes32 constant PROJECT = keccak256("PRJ-MAIZE-BOGURA-01");
    bytes32 constant VOUCHER = keccak256("VCH-0001");
    bytes32 constant SEED = "SEED_MAIZE";
    bytes32 constant BATCH_A = keccak256("KAMAL-SEED-2026-A");
    bytes32 constant BATCH_B = keccak256("KAMAL-SEED-2026-B");
    bytes32 constant JAMAL_BATCH = keccak256("JAMAL-UREA-2026-A");

    bytes32 ADMIN;
    bytes32 ACCOUNTS;
    bytes32 SUPPLIER;
    bytes32 OFFICER;
    bytes32 OPERATIONS;

    function setUp() public {
        vm.warp(1_780_000_000); // a realistic 2026 timestamp
        registry = new AccessRegistry(superAdmin);
        ledger = new ProjectLedger(registry, 120 hours);
        vouchers = new VoucherRegistry(registry, ledger, SALE_TTL);
        ADMIN = registry.ADMIN_ROLE();
        ACCOUNTS = registry.ACCOUNTS_ROLE();
        SUPPLIER = registry.SUPPLIER_ROLE();
        OFFICER = registry.FIELD_OFFICER_ROLE();
        OPERATIONS = registry.OPERATIONS_ROLE();

        vm.startPrank(superAdmin);
        _person(keccak256("STAFF-ADMIN"), ADMIN, admin);
        _person(IMRAN, OFFICER, imran);
        _person(SUMON, OFFICER, otherOfficer);
        _person(keccak256("STAFF-ACCOUNTS"), ACCOUNTS, accounts);
        _person(keccak256("STAFF-OPERATIONS"), OPERATIONS, operations);
        ledger.setLinkedContract(address(vouchers), true);
        vm.stopPrank();

        // Imran onboards Rahim, so he is Rahim's field officer.
        bytes32 farmerRole = registry.FARMER_ROLE();
        vm.prank(imran);
        registry.registerParticipant(RAHIM, farmerRole, rahim, keccak256("rahim"));

        vm.startPrank(admin);
        registry.verifyParticipant(RAHIM);
        _person(KARIM, registry.FARMER_ROLE(), otherFarmer);
        _person(NASRIN, registry.INVESTOR_ROLE(), nasrin);
        _person(KAMAL, SUPPLIER, kamal);
        _person(JAMAL, SUPPLIER, jamal);
        _person(RUPA, SUPPLIER, rupa);
        registry.registerParticipant(UNVERIFIED_SUPPLIER, SUPPLIER, makeAddr("pending"), keccak256("x"));
        vm.stopPrank();

        _fundProject();

        vm.startPrank(kamal);
        vouchers.registerBatch(BATCH_A, SEED, uint64(block.timestamp - 30 days), uint64(block.timestamp + 365 days), keccak256("a"));
        vouchers.registerBatch(BATCH_B, SEED, uint64(block.timestamp - 10 days), 0, keccak256("b"));
        vm.stopPrank();
        vm.prank(jamal);
        vouchers.registerBatch(JAMAL_BATCH, "UREA", uint64(block.timestamp - 5 days), 0, keccak256("j"));
    }

    // --- helpers ---------------------------------------------------------------

    function _person(bytes32 id, bytes32 role, address account) internal {
        registry.registerParticipant(id, role, account, keccak256(abi.encode(id)));
        registry.verifyParticipant(id);
    }

    /// The doc's maize project, fully funded: Tk 2,000,000 target, 100 slots.
    function _fundProject() internal {
        ProjectLedger.ProjectTerms memory t = ProjectLedger.ProjectTerms({
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
            termsHash: keccak256("terms")
        });
        vm.startPrank(admin);
        ledger.createProject(PROJECT, t);
        ledger.openForFunding(PROJECT);
        vm.stopPrank();
        vm.prank(nasrin);
        uint256 id = ledger.reserveSlots(PROJECT, 100);
        vm.prank(accounts);
        ledger.confirmPayment(id, "REF-1");
    }

    function _suppliers() internal pure returns (bytes32[] memory s) {
        s = new bytes32[](2);
        s[0] = KAMAL;
        s[1] = JAMAL;
    }

    function _one(bytes32 x) internal pure returns (bytes32[] memory a) {
        a = new bytes32[](1);
        a[0] = x;
    }

    /// Operations proposes 500 kg of seed at Tk 300/kg (Tk 150,000), valid at Kamal and Jamal.
    function _propose() internal {
        vm.prank(operations);
        vouchers.proposeVoucher(VOUCHER, PROJECT, SEED, 500, PRICE, _suppliers());
    }

    /// Proposed and approved by Farhana.
    function _issue() internal {
        _propose();
        vm.prank(accounts);
        vouchers.approveVoucher(VOUCHER);
    }

    function _sale(uint256 kg) internal returns (uint256) {
        vm.prank(kamal);
        return vouchers.recordSale(VOUCHER, kg, _one(BATCH_A));
    }

    function _stage() internal view returns (ProjectLedger.Stage) {
        return ledger.getProject(PROJECT).stage;
    }

    function _status() internal view returns (uint8) {
        return uint8(vouchers.getVoucher(VOUCHER).status);
    }

    // --- constructor and settings --------------------------------------------------

    function test_ConstructorGuards() public {
        vm.expectRevert(VoucherRegistry.ZeroProjectLedger.selector);
        new VoucherRegistry(registry, ProjectLedger(address(0)), SALE_TTL);
        vm.expectRevert(VoucherRegistry.ZeroValue.selector);
        new VoucherRegistry(registry, ledger, 0);
    }

    function test_AdminSetsSaleTtl() public {
        vm.expectEmit(address(vouchers));
        emit VoucherRegistry.SaleTtlUpdated(SALE_TTL, 3 days);
        vm.prank(admin);
        vouchers.setSaleTtl(3 days);
        assertEq(vouchers.saleTtl(), 3 days);

        vm.prank(admin);
        vm.expectRevert(VoucherRegistry.ZeroValue.selector);
        vouchers.setSaleTtl(0);

        vm.prank(accounts);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, accounts, ADMIN));
        vouchers.setSaleTtl(1 days);
    }

    // --- proposing -------------------------------------------------------------------

    function test_ProposeVoucher() public {
        vm.expectEmit(address(vouchers));
        emit VoucherRegistry.VoucherProposed(VOUCHER, PROJECT, RAHIM, SEED, 500, PRICE, _suppliers(), operations);
        _propose();

        VoucherRegistry.Voucher memory v = vouchers.getVoucher(VOUCHER);
        assertEq(v.projectId, PROJECT);
        assertEq(v.farmerId, RAHIM); // taken from the project
        assertEq(v.unitPrice, PRICE);
        assertEq(v.value, 150_000 * TK);
        assertEq(uint8(v.status), uint8(VoucherRegistry.VoucherStatus.Proposed));
        assertEq(v.proposedAt, block.timestamp);
        assertEq(vouchers.committedValue(PROJECT), 150_000 * TK); // reserved under the cap already
        assertEq(vouchers.availableQuantity(VOUCHER), 0); // not usable until approved
        assertTrue(vouchers.isApprovedSupplier(VOUCHER, KAMAL));
        assertFalse(vouchers.isApprovedSupplier(VOUCHER, RUPA));
        assertEq(vouchers.getVoucherSuppliers(VOUCHER).length, 2);
        assertEq(uint8(_stage()), uint8(ProjectLedger.Stage.Funded)); // not yet Active
    }

    function test_OnlyOperationsProposes() public {
        bytes32[] memory s = _suppliers();
        address[2] memory others = [admin, accounts];
        for (uint256 i = 0; i < others.length; i++) {
            vm.prank(others[i]);
            vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, others[i], OPERATIONS));
            vouchers.proposeVoucher(VOUCHER, PROJECT, SEED, 500, PRICE, s);
        }
    }

    function test_ProposeRejectsBadInput() public {
        bytes32[] memory s = _suppliers();
        vm.startPrank(operations);
        vm.expectRevert(VoucherRegistry.ZeroValue.selector);
        vouchers.proposeVoucher(bytes32(0), PROJECT, SEED, 500, PRICE, s);
        vm.expectRevert(VoucherRegistry.ZeroValue.selector);
        vouchers.proposeVoucher(VOUCHER, PROJECT, bytes32(0), 500, PRICE, s);
        vm.expectRevert(VoucherRegistry.ZeroValue.selector);
        vouchers.proposeVoucher(VOUCHER, PROJECT, SEED, 0, PRICE, s);
        vm.expectRevert(VoucherRegistry.ZeroValue.selector);
        vouchers.proposeVoucher(VOUCHER, PROJECT, SEED, 500, 0, s);

        vm.expectRevert(VoucherRegistry.BadSupplierList.selector);
        vouchers.proposeVoucher(VOUCHER, PROJECT, SEED, 500, PRICE, new bytes32[](0));
        vm.expectRevert(VoucherRegistry.BadSupplierList.selector);
        vouchers.proposeVoucher(VOUCHER, PROJECT, SEED, 500, PRICE, new bytes32[](21));

        bytes32[] memory dup = new bytes32[](2);
        dup[0] = KAMAL;
        dup[1] = KAMAL;
        vm.expectRevert(VoucherRegistry.BadSupplierList.selector);
        vouchers.proposeVoucher(VOUCHER, PROJECT, SEED, 500, PRICE, dup);
        vm.stopPrank();
    }

    function test_ProposeTwiceReverts() public {
        _propose();
        bytes32[] memory s = _suppliers();
        vm.prank(operations);
        vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.VoucherExists.selector, VOUCHER));
        vouchers.proposeVoucher(VOUCHER, PROJECT, SEED, 1, PRICE, s);
    }

    function test_SuppliersMustBeVerifiedSuppliers() public {
        vm.startPrank(operations);
        vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.SupplierNotVerified.selector, UNVERIFIED_SUPPLIER));
        vouchers.proposeVoucher(VOUCHER, PROJECT, SEED, 1, PRICE, _one(UNVERIFIED_SUPPLIER));
        vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.SupplierNotVerified.selector, KARIM));
        vouchers.proposeVoucher(VOUCHER, PROJECT, SEED, 1, PRICE, _one(KARIM)); // a farmer
        vm.stopPrank();
    }

    function test_ProposeOnlyWhenFundedOrActive() public {
        bytes32 draft = keccak256("PRJ-DRAFT");
        ProjectLedger.ProjectTerms memory t = ledger.getProject(PROJECT).terms;
        vm.prank(admin);
        ledger.createProject(draft, t);
        vm.startPrank(operations);
        vm.expectRevert(
            abi.encodeWithSelector(VoucherRegistry.WrongProjectStage.selector, draft, ProjectLedger.Stage.Draft)
        );
        vouchers.proposeVoucher(VOUCHER, draft, SEED, 1, PRICE, _suppliers());
        vm.stopPrank();
    }

    function test_CannotExceedFundingTarget() public {
        vm.startPrank(operations);
        // 6,000 kg x Tk 300 = Tk 1,800,000; Tk 200,000 room left.
        vouchers.proposeVoucher(VOUCHER, PROJECT, SEED, 6_000, PRICE, _suppliers());
        vm.expectRevert(
            abi.encodeWithSelector(VoucherRegistry.ExceedsFundingTarget.selector, 201_000 * TK, 200_000 * TK)
        );
        vouchers.proposeVoucher(keccak256("VCH-0002"), PROJECT, SEED, 670, PRICE, _suppliers());

        vouchers.proposeVoucher(keccak256("VCH-0002"), PROJECT, SEED, 1, 200_000 * TK, _suppliers());
        assertEq(vouchers.committedValue(PROJECT), 2_000_000 * TK);
        vm.stopPrank();
    }

    // --- approving and rejecting --------------------------------------------------------

    function test_AccountsApprovalActivatesProject() public {
        _propose();
        vm.warp(block.timestamp + 1 days);
        vm.expectEmit(address(vouchers));
        emit VoucherRegistry.VoucherApproved(VOUCHER, accounts);
        vm.prank(accounts);
        vouchers.approveVoucher(VOUCHER);

        assertEq(_status(), uint8(VoucherRegistry.VoucherStatus.Active));
        assertEq(vouchers.getVoucher(VOUCHER).lastActivityAt, block.timestamp);
        assertEq(vouchers.availableQuantity(VOUCHER), 500);
        assertEq(vouchers.availableBalance(VOUCHER), 150_000 * TK);
        assertEq(uint8(_stage()), uint8(ProjectLedger.Stage.Active));
    }

    function test_SecondApprovalOnActiveProject() public {
        _issue();
        bytes32 second = keccak256("VCH-0002");
        vm.prank(operations);
        vouchers.proposeVoucher(second, PROJECT, "UREA", 50, 1_200 * TK, _one(JAMAL));
        vm.prank(accounts);
        vouchers.approveVoucher(second);
        assertEq(vouchers.committedValue(PROJECT), 210_000 * TK);
        assertEq(uint8(_stage()), uint8(ProjectLedger.Stage.Active));
    }

    function test_OnlyAccountsApprovesOrRejects() public {
        _propose();
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, admin, ACCOUNTS));
        vouchers.approveVoucher(VOUCHER);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, admin, ACCOUNTS));
        vouchers.rejectVoucher(VOUCHER);
        vm.stopPrank();
    }

    function test_ApproveGuards() public {
        vm.startPrank(accounts);
        vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.VoucherNotFound.selector, VOUCHER));
        vouchers.approveVoucher(VOUCHER);
        vm.stopPrank();

        _issue();
        vm.prank(accounts);
        vm.expectRevert(
            abi.encodeWithSelector(
                VoucherRegistry.WrongVoucherStatus.selector, VOUCHER, VoucherRegistry.VoucherStatus.Active
            )
        );
        vouchers.approveVoucher(VOUCHER);
    }

    function test_ApproveFailsIfProjectCancelledMeanwhile() public {
        _propose();
        vm.prank(admin);
        ledger.cancelProject(PROJECT); // still Funded, so cancelling is allowed
        vm.prank(accounts);
        vm.expectRevert(
            abi.encodeWithSelector(VoucherRegistry.WrongProjectStage.selector, PROJECT, ProjectLedger.Stage.Cancelled)
        );
        vouchers.approveVoucher(VOUCHER);
    }

    function test_ApproveNeedsLinkedLedgerOnFirstVoucher() public {
        _propose();
        vm.prank(superAdmin);
        ledger.setLinkedContract(address(vouchers), false);
        vm.prank(accounts);
        vm.expectRevert(abi.encodeWithSelector(ProjectLedger.NotAuthorized.selector, address(vouchers)));
        vouchers.approveVoucher(VOUCHER);
    }

    function test_RejectReleasesValue() public {
        _propose();
        vm.expectEmit(address(vouchers));
        emit VoucherRegistry.VoucherRejected(VOUCHER, accounts);
        vm.prank(accounts);
        vouchers.rejectVoucher(VOUCHER);

        assertEq(_status(), uint8(VoucherRegistry.VoucherStatus.Rejected));
        assertEq(vouchers.committedValue(PROJECT), 0);
        assertEq(uint8(_stage()), uint8(ProjectLedger.Stage.Funded));

        vm.prank(kamal);
        vm.expectRevert(
            abi.encodeWithSelector(
                VoucherRegistry.WrongVoucherStatus.selector, VOUCHER, VoucherRegistry.VoucherStatus.Rejected
            )
        );
        vouchers.recordSale(VOUCHER, 1, _one(BATCH_A));
    }

    // --- batches ---------------------------------------------------------------------

    function test_RegisterBatch() public view {
        VoucherRegistry.Batch memory b = vouchers.getBatch(BATCH_A);
        assertEq(b.supplierId, KAMAL);
        assertEq(b.productCode, SEED);
        assertEq(b.detailsHash, keccak256("a"));
        assertEq(b.registeredAt, block.timestamp);
        assertTrue(vouchers.isGenuine(BATCH_A));
        assertFalse(vouchers.isGenuine(keccak256("FAKE-QR")));
    }

    function test_RegisterBatchEmits() public {
        bytes32 id = keccak256("KAMAL-SEED-2026-C");
        uint64 produced = uint64(block.timestamp - 1 days);
        vm.expectEmit(address(vouchers));
        emit VoucherRegistry.BatchRegistered(id, KAMAL, SEED, produced, 0, keccak256("c"));
        vm.prank(kamal);
        vouchers.registerBatch(id, SEED, produced, 0, keccak256("c"));
    }

    function test_RegisterBatchGuards() public {
        uint64 t = uint64(block.timestamp);
        vm.startPrank(kamal);
        vm.expectRevert(VoucherRegistry.ZeroValue.selector);
        vouchers.registerBatch(bytes32(0), SEED, t, 0, keccak256("x"));
        vm.expectRevert(VoucherRegistry.ZeroValue.selector);
        vouchers.registerBatch("NEW", bytes32(0), t, 0, keccak256("x"));
        vm.expectRevert(VoucherRegistry.ZeroValue.selector);
        vouchers.registerBatch("NEW", SEED, t, 0, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.BatchExists.selector, BATCH_A));
        vouchers.registerBatch(BATCH_A, SEED, t, 0, keccak256("x"));
        vm.expectRevert(VoucherRegistry.InvalidDates.selector);
        vouchers.registerBatch("NEW", SEED, 0, 0, keccak256("x"));
        vm.expectRevert(VoucherRegistry.InvalidDates.selector);
        vouchers.registerBatch("NEW", SEED, t, t, keccak256("x"));
        vm.stopPrank();

        vm.prank(rahim);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, rahim, SUPPLIER));
        vouchers.registerBatch("NEW", SEED, t, 0, keccak256("x"));
    }

    // --- recording sales --------------------------------------------------------------

    function test_RecordSaleAtVoucherPrice() public {
        _issue();
        vm.warp(block.timestamp + 2 days);
        bytes32[] memory batches = new bytes32[](2);
        batches[0] = BATCH_A;
        batches[1] = BATCH_B;
        uint64 expiresAt = uint64(block.timestamp) + SALE_TTL;

        vm.expectEmit(address(vouchers));
        emit VoucherRegistry.SaleRecorded(1, VOUCHER, KAMAL, 120, 36_000 * TK, expiresAt, batches);
        vm.prank(kamal);
        uint256 id = vouchers.recordSale(VOUCHER, 120, batches);

        assertEq(id, 1);
        VoucherRegistry.Voucher memory v = vouchers.getVoucher(VOUCHER);
        assertEq(v.heldQuantity, 120);
        assertEq(v.spentQuantity, 0);
        assertEq(v.lastActivityAt, block.timestamp);
        assertEq(vouchers.availableQuantity(VOUCHER), 380);
        assertEq(vouchers.availableBalance(VOUCHER), 114_000 * TK);

        VoucherRegistry.Sale memory s = vouchers.getSale(id);
        assertEq(s.supplierId, KAMAL);
        assertEq(s.amount, 36_000 * TK); // 120 kg x Tk 300, set by the ledger
        assertEq(s.expiresAt, expiresAt);
        assertEq(uint8(s.status), uint8(VoucherRegistry.SaleStatus.Pending));
        assertEq(vouchers.getSaleBatches(id).length, 2);
    }

    function test_SaleWithoutBatches() public {
        _issue();
        vm.prank(kamal);
        uint256 id = vouchers.recordSale(VOUCHER, 10, new bytes32[](0)); // e.g. a service
        assertEq(vouchers.getSale(id).amount, 3_000 * TK);
        assertEq(vouchers.getSaleBatches(id).length, 0);
    }

    function test_UnapprovedSupplierRejected() public {
        _issue();
        vm.prank(rupa);
        vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.SupplierNotApproved.selector, VOUCHER, RUPA));
        vouchers.recordSale(VOUCHER, 1, _one(BATCH_A));
    }

    function test_CannotSellMoreThanVoucherQuantity() public {
        _issue();
        _sale(400);
        vm.prank(kamal);
        vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.ExceedsVoucherQuantity.selector, 101, 100));
        vouchers.recordSale(VOUCHER, 101, _one(BATCH_A));

        _sale(100); // exactly the rest is fine
        assertEq(vouchers.availableQuantity(VOUCHER), 0);
        assertEq(vouchers.availableBalance(VOUCHER), 0);
    }

    function test_CannotSellOnProposedVoucher() public {
        _propose();
        vm.prank(kamal);
        vm.expectRevert(
            abi.encodeWithSelector(
                VoucherRegistry.WrongVoucherStatus.selector, VOUCHER, VoucherRegistry.VoucherStatus.Proposed
            )
        );
        vouchers.recordSale(VOUCHER, 1, _one(BATCH_A));
    }

    function test_RecordSaleGuards() public {
        _issue();
        vm.startPrank(kamal);
        vm.expectRevert(VoucherRegistry.ZeroValue.selector);
        vouchers.recordSale(VOUCHER, 0, _one(BATCH_A));
        vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.VoucherNotFound.selector, bytes32("NOPE")));
        vouchers.recordSale("NOPE", 1, _one(BATCH_A));
        vm.expectRevert(VoucherRegistry.BadBatchList.selector);
        vouchers.recordSale(VOUCHER, 1, new bytes32[](21));
        vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.BatchNotFound.selector, bytes32("FAKE")));
        vouchers.recordSale(VOUCHER, 1, _one("FAKE"));
        // Kamal cannot pass off Jamal's batch as his own.
        vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.BatchNotOwned.selector, JAMAL_BATCH, KAMAL));
        vouchers.recordSale(VOUCHER, 1, _one(JAMAL_BATCH));
        vm.stopPrank();

        vm.prank(rahim);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, rahim, SUPPLIER));
        vouchers.recordSale(VOUCHER, 1, _one(BATCH_A));
    }

    function test_ExpiredBatchRejected() public {
        _issue();
        vm.warp(vouchers.getBatch(BATCH_A).expiresAt);
        vm.prank(kamal);
        vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.BatchExpired.selector, BATCH_A));
        vouchers.recordSale(VOUCHER, 1, _one(BATCH_A));
    }

    function test_RejectedSupplierLosesAccess() public {
        _issue();
        vm.prank(admin);
        registry.rejectParticipant(KAMAL);
        vm.prank(kamal);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, kamal, SUPPLIER));
        vouchers.recordSale(VOUCHER, 1, _one(BATCH_A));
    }

    function test_PendingSaleValueTracksHolds() public {
        _issue();
        uint256 a = _sale(100);
        uint256 b = _sale(50);
        uint256 c = _sale(10);
        assertEq(vouchers.pendingSaleValue(PROJECT), 160 * PRICE);

        vm.prank(imran);
        vouchers.confirmSale(a);
        assertEq(vouchers.pendingSaleValue(PROJECT), 60 * PRICE);
        assertEq(vouchers.spentValue(PROJECT), 100 * PRICE);

        vm.prank(kamal);
        vouchers.cancelSale(b);
        vm.warp(vouchers.getSale(c).expiresAt);
        vouchers.expireSale(c);
        assertEq(vouchers.pendingSaleValue(PROJECT), 0);
    }

    function test_NoSalesOnceFarmingEnds() public {
        _issue();
        vm.prank(admin);
        ledger.markReadyForSale(PROJECT);
        vm.prank(kamal);
        vm.expectRevert(
            abi.encodeWithSelector(VoucherRegistry.WrongProjectStage.selector, PROJECT, ProjectLedger.Stage.ReadyForSale)
        );
        vouchers.recordSale(VOUCHER, 1, _one(BATCH_A));
    }

    // --- confirming --------------------------------------------------------------------

    function test_FarmersOfficerConfirmsSale() public {
        _issue();
        uint256 id = _sale(120);
        vm.warp(block.timestamp + 3 days);

        vm.expectEmit(address(vouchers));
        emit VoucherRegistry.SaleConfirmed(id, VOUCHER, IMRAN);
        vm.prank(imran);
        vouchers.confirmSale(id);

        VoucherRegistry.Voucher memory v = vouchers.getVoucher(VOUCHER);
        assertEq(v.spentQuantity, 120);
        assertEq(v.heldQuantity, 0);
        assertEq(vouchers.spentValue(PROJECT), 36_000 * TK); // 120 kg x Tk 300
        assertEq(v.lastActivityAt, block.timestamp);
        assertEq(vouchers.availableQuantity(VOUCHER), 380);
        assertEq(uint8(vouchers.getSale(id).status), uint8(VoucherRegistry.SaleStatus.Confirmed));
    }

    function test_OnlyFarmersOwnOfficerConfirms() public {
        _issue();
        uint256 id = _sale(120);

        vm.prank(otherOfficer);
        vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.NotAuthorized.selector, otherOfficer));
        vouchers.confirmSale(id);

        address[3] memory nonOfficers = [rahim, kamal, admin];
        for (uint256 i = 0; i < nonOfficers.length; i++) {
            vm.prank(nonOfficers[i]);
            vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, nonOfficers[i], OFFICER));
            vouchers.confirmSale(id);
        }
    }

    function test_ReassignedOfficerConfirms() public {
        _issue();
        uint256 id = _sale(120);
        vm.prank(admin);
        registry.assignFieldOfficer(RAHIM, SUMON);

        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.NotAuthorized.selector, imran));
        vouchers.confirmSale(id);

        vm.prank(otherOfficer);
        vouchers.confirmSale(id);
        assertEq(vouchers.getVoucher(VOUCHER).spentQuantity, 120);
    }

    function test_ConfirmOnlyPendingAndUnexpired() public {
        _issue();
        uint256 a = _sale(10);
        uint256 b = _sale(10);

        vm.startPrank(imran);
        vouchers.confirmSale(a);
        vm.expectRevert(
            abi.encodeWithSelector(VoucherRegistry.SaleNotPending.selector, a, VoucherRegistry.SaleStatus.Confirmed)
        );
        vouchers.confirmSale(a);
        vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.SaleNotFound.selector, 99));
        vouchers.confirmSale(99);

        vm.warp(vouchers.getSale(b).expiresAt);
        vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.SaleHasExpired.selector, b));
        vouchers.confirmSale(b);
        vm.stopPrank();
    }

    // --- expiring and cancelling sales -----------------------------------------------------

    function test_UnconfirmedSaleExpires() public {
        _issue();
        uint256 id = _sale(120);
        uint64 expiresAt = vouchers.getSale(id).expiresAt;

        vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.SaleNotYetExpired.selector, id, expiresAt));
        vouchers.expireSale(id);

        vm.warp(expiresAt);
        vm.expectEmit(address(vouchers));
        emit VoucherRegistry.SaleExpired(id, VOUCHER);
        vm.prank(makeAddr("anyone"));
        vouchers.expireSale(id);

        assertEq(uint8(vouchers.getSale(id).status), uint8(VoucherRegistry.SaleStatus.Expired));
        assertEq(vouchers.availableQuantity(VOUCHER), 500);
    }

    function test_CancelSaleReleasesHold() public {
        _issue();
        uint256 id = _sale(120);
        vm.expectEmit(address(vouchers));
        emit VoucherRegistry.SaleCancelled(id, VOUCHER, kamal);
        vm.prank(kamal);
        vouchers.cancelSale(id);

        assertEq(vouchers.getVoucher(VOUCHER).heldQuantity, 0);
        assertEq(vouchers.availableQuantity(VOUCHER), 500);
        assertEq(uint8(vouchers.getSale(id).status), uint8(VoucherRegistry.SaleStatus.Cancelled));
    }

    function test_WhoCanCancelSale() public {
        _issue();
        address[4] memory allowed = [kamal, rahim, imran, admin];
        for (uint256 i = 0; i < allowed.length; i++) {
            uint256 id = _sale(1);
            vm.prank(allowed[i]);
            vouchers.cancelSale(id);
        }

        uint256 sale = _sale(1);
        // Other supplier, other farmer, other officer, accounts.
        address[4] memory denied = [jamal, otherFarmer, otherOfficer, accounts];
        for (uint256 i = 0; i < denied.length; i++) {
            vm.prank(denied[i]);
            vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.NotAuthorized.selector, denied[i]));
            vouchers.cancelSale(sale);
        }
    }

    // --- cancelling vouchers ----------------------------------------------------------------

    function test_CancelVoucherVoidsUnusedBalance() public {
        _issue();
        uint256 confirmed = _sale(100);
        vm.prank(imran);
        vouchers.confirmSale(confirmed);
        _sale(50); // still pending

        // 350 kg unused x Tk 300 = Tk 105,000 voided.
        vm.expectEmit(address(vouchers));
        emit VoucherRegistry.VoucherCancelled(VOUCHER, 105_000 * TK, admin);
        vm.prank(admin);
        vouchers.cancelVoucher(VOUCHER);

        assertEq(_status(), uint8(VoucherRegistry.VoucherStatus.Cancelled));
        assertEq(vouchers.availableQuantity(VOUCHER), 0);
        assertEq(vouchers.committedValue(PROJECT), 45_000 * TK); // 150 kg spent or held

        vm.prank(kamal);
        vm.expectRevert(
            abi.encodeWithSelector(
                VoucherRegistry.WrongVoucherStatus.selector, VOUCHER, VoucherRegistry.VoucherStatus.Cancelled
            )
        );
        vouchers.recordSale(VOUCHER, 1, _one(BATCH_A));
    }

    function test_PendingSalesAfterVoucherCancel() public {
        _issue();
        uint256 keep = _sale(10);
        uint256 drop = _sale(5);
        uint256 lapse = _sale(5);
        vm.prank(admin);
        vouchers.cancelVoucher(VOUCHER);
        assertEq(vouchers.committedValue(PROJECT), 6_000 * TK);

        vm.prank(imran);
        vouchers.confirmSale(keep); // still allowed
        vm.prank(kamal);
        vouchers.cancelSale(drop); // released quantity is voided, not returned
        vm.warp(vouchers.getSale(lapse).expiresAt);
        vouchers.expireSale(lapse); // same for an expired sale

        assertEq(vouchers.committedValue(PROJECT), 3_000 * TK);
        assertEq(vouchers.availableQuantity(VOUCHER), 0);
        assertEq(vouchers.pendingSaleValue(PROJECT), 0);
        assertEq(vouchers.getVoucher(VOUCHER).spentQuantity, 10);
    }

    function test_CancelProposedVoucher() public {
        _propose();
        vm.prank(admin);
        vouchers.cancelVoucher(VOUCHER);
        assertEq(vouchers.committedValue(PROJECT), 0);
        vm.prank(accounts);
        vm.expectRevert(
            abi.encodeWithSelector(
                VoucherRegistry.WrongVoucherStatus.selector, VOUCHER, VoucherRegistry.VoucherStatus.Cancelled
            )
        );
        vouchers.approveVoucher(VOUCHER);
    }

    function test_CancelVoucherFreesRoomUnderCap() public {
        vm.prank(operations);
        vouchers.proposeVoucher(VOUCHER, PROJECT, SEED, 1, 2_000_000 * TK, _suppliers());
        vm.prank(admin);
        vouchers.cancelVoucher(VOUCHER);
        vm.prank(operations);
        vouchers.proposeVoucher(keccak256("VCH-0002"), PROJECT, SEED, 1, 2_000_000 * TK, _suppliers());
        assertEq(vouchers.committedValue(PROJECT), 2_000_000 * TK);
    }

    function test_CancelVoucherGuards() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.VoucherNotFound.selector, VOUCHER));
        vouchers.cancelVoucher(VOUCHER);

        _issue();
        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, imran, ADMIN));
        vouchers.cancelVoucher(VOUCHER);

        vm.startPrank(admin);
        vouchers.cancelVoucher(VOUCHER);
        vm.expectRevert(
            abi.encodeWithSelector(
                VoucherRegistry.WrongVoucherStatus.selector, VOUCHER, VoucherRegistry.VoucherStatus.Cancelled
            )
        );
        vouchers.cancelVoucher(VOUCHER);
        vm.stopPrank();
    }

    // --- invariant-style fuzz -----------------------------------------------------------------

    /// spent + held + available always equals the voucher quantity, and every sale is priced at the unit price.
    function testFuzz_VoucherAccounting(uint256 a, uint256 b, bool confirmA, uint8 endB) public {
        _issue();
        a = bound(a, 1, 500);
        b = bound(b, 1, 500);

        vm.prank(kamal);
        uint256 idA = vouchers.recordSale(VOUCHER, a, _one(BATCH_A));
        assertEq(vouchers.getSale(idA).amount, a * PRICE);
        if (b > 500 - a) {
            vm.prank(jamal);
            vm.expectRevert(abi.encodeWithSelector(VoucherRegistry.ExceedsVoucherQuantity.selector, b, 500 - a));
            vouchers.recordSale(VOUCHER, b, _one(JAMAL_BATCH));
            return;
        }
        vm.prank(jamal);
        uint256 idB = vouchers.recordSale(VOUCHER, b, _one(JAMAL_BATCH));

        if (confirmA) {
            vm.prank(imran);
            vouchers.confirmSale(idA);
        }
        bool releasedB = endB % 3 != 0;
        if (endB % 3 == 1) {
            vm.prank(jamal);
            vouchers.cancelSale(idB);
        } else if (endB % 3 == 2) {
            vm.warp(vouchers.getSale(idB).expiresAt);
            vouchers.expireSale(idB);
        }

        VoucherRegistry.Voucher memory v = vouchers.getVoucher(VOUCHER);
        assertEq(v.spentQuantity + v.heldQuantity + vouchers.availableQuantity(VOUCHER), 500);
        assertEq(v.spentQuantity, confirmA ? a : 0);
        assertEq(v.heldQuantity, (confirmA ? 0 : a) + (releasedB ? 0 : b));
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AccessRegistry} from "../contracts/access/AccessRegistry.sol";
import {AccessGuarded} from "../contracts/access/AccessGuarded.sol";
import {ProjectLedger} from "../contracts/projects/ProjectLedger.sol";
import {VoucherRegistry} from "../contracts/inputs/VoucherRegistry.sol";
import {WarehouseReceipt} from "../contracts/warehouse/WarehouseReceipt.sol";
import {TradeLedger} from "../contracts/trade/TradeLedger.sol";
import {InsuranceRegistry} from "../contracts/insurance/InsuranceRegistry.sol";
import {SettlementLedger} from "../contracts/settlement/SettlementLedger.sol";

/// The whole platform, end to end, ending in the doc's Stage 7 payout.
contract SettlementLedgerTest is Test {
    AccessRegistry registry;
    ProjectLedger ledger;
    VoucherRegistry vouchers;
    WarehouseReceipt receipts;
    TradeLedger trade;
    InsuranceRegistry insurance;
    SettlementLedger settlement;

    address superAdmin = makeAddr("superAdmin");
    address admin = makeAddr("tania");
    address imran = makeAddr("imran");
    address farhana = makeAddr("farhana"); // accounts, prepares
    address rafiq = makeAddr("rafiq"); // accounts, approves
    address ops = makeAddr("ops");
    address rahim = makeAddr("rahim");
    address nasrin = makeAddr("nasrin");
    address karim = makeAddr("karim"); // investor
    address kamal = makeAddr("kamal"); // supplier
    address habib = makeAddr("habib"); // warehouse
    address sabbir = makeAddr("sabbir"); // buyer
    address jui = makeAddr("jui"); // insurer

    uint256 constant TK = 100;

    bytes32 constant FARHANA = keccak256("STAFF-ACCOUNTS-1");
    bytes32 constant RAFIQ = keccak256("STAFF-ACCOUNTS-2");
    bytes32 constant RAHIM = keccak256("FARMER-0001");
    bytes32 constant NASRIN = keccak256("INVESTOR-0001");
    bytes32 constant KARIM = keccak256("INVESTOR-0002");
    bytes32 constant KAMAL = keccak256("SUPPLIER-0001");
    bytes32 constant HABIB = keccak256("WAREHOUSE-0001");
    bytes32 constant SABBIR = keccak256("BUYER-0001");
    bytes32 constant JUI = keccak256("INSURER-0001");
    bytes32 constant MAIZE = keccak256("PRJ-MAIZE-BOGURA-01");
    bytes32 constant SITE = "WH-BOGURA-01";

    bytes32 ACCOUNTS;
    uint256 refCount;
    uint256 receiptCount;

    function setUp() public {
        vm.warp(1_780_000_000);
        registry = new AccessRegistry(superAdmin);
        ledger = new ProjectLedger(registry, 120 hours);
        vouchers = new VoucherRegistry(registry, ledger, 7 days);
        receipts = new WarehouseReceipt(registry, ledger);
        trade = new TradeLedger(registry, ledger, receipts);
        insurance = new InsuranceRegistry(registry, ledger);
        settlement = new SettlementLedger(registry, ledger, vouchers, trade, insurance, receipts);
        ACCOUNTS = registry.ACCOUNTS_ROLE();

        vm.startPrank(superAdmin);
        _person(keccak256("STAFF-ADMIN"), registry.ADMIN_ROLE(), admin);
        _person(keccak256("STAFF-OFFICER"), registry.FIELD_OFFICER_ROLE(), imran);
        _person(FARHANA, ACCOUNTS, farhana);
        _person(RAFIQ, ACCOUNTS, rafiq);
        _person(keccak256("STAFF-OPS"), registry.OPERATIONS_ROLE(), ops);
        ledger.setLinkedContract(address(vouchers), true);
        ledger.setLinkedContract(address(settlement), true);
        receipts.setLinkedContract(address(trade), true);
        vm.stopPrank();

        bytes32 farmerRole = registry.FARMER_ROLE();
        vm.prank(imran);
        registry.registerParticipant(RAHIM, farmerRole, rahim, keccak256("rahim"));
        vm.startPrank(admin);
        registry.verifyParticipant(RAHIM);
        _person(NASRIN, registry.INVESTOR_ROLE(), nasrin);
        _person(KARIM, registry.INVESTOR_ROLE(), karim);
        _person(KAMAL, registry.SUPPLIER_ROLE(), kamal);
        _person(HABIB, registry.WAREHOUSE_ROLE(), habib);
        _person(SABBIR, registry.BUYER_ROLE(), sabbir);
        _person(JUI, registry.INSURER_ROLE(), jui);
        receipts.registerSite(SITE, keccak256("site"));
        receipts.assignOperator(HABIB, SITE);
        vm.stopPrank();

        _createProject(4); // long term, payouts every 4 months
    }

    // --- helpers ---------------------------------------------------------------

    function _person(bytes32 id, bytes32 role, address account) internal {
        registry.registerParticipant(id, role, account, keccak256(abi.encode(id)));
        registry.verifyParticipant(id);
    }

    /// The doc's project: 100 slots x Tk 20,000, 40-40-20, insured. Nasrin 4 slots, Karim 96.
    function _createProject(uint8 interval) internal {
        ProjectLedger.ProjectTerms memory t = ProjectLedger.ProjectTerms({
            farmerId: RAHIM,
            produceCode: "MAIZE",
            category: ProjectLedger.ProduceCategory.StorableCrop,
            regionCode: "BOGURA",
            durationType: ProjectLedger.DurationType.LongTerm,
            durationMonths: 12,
            payoutIntervalMonths: interval,
            fundingTarget: 2_000_000 * TK,
            slotPrice: 20_000 * TK,
            farmerBps: 4000,
            investorBps: 4000,
            wegroBps: 2000,
            insured: true,
            termsHash: keccak256("terms")
        });
        vm.startPrank(admin);
        ledger.createProject(MAIZE, t);
        ledger.openForFunding(MAIZE);
        vm.stopPrank();
        _invest(nasrin, 4);
        _invest(karim, 96);
    }

    function _invest(address investor, uint32 slots) internal {
        vm.prank(investor);
        uint256 r = ledger.reserveSlots(MAIZE, slots);
        vm.prank(farhana);
        ledger.confirmPayment(r, bytes32(++refCount));
    }

    /// Inputs: 500 kg seed at Tk 300 (Tk 150,000), approved and fully used. Project becomes Active.
    function _inputs() internal {
        bytes32[] memory s = new bytes32[](1);
        s[0] = KAMAL;
        vm.prank(ops);
        vouchers.proposeVoucher("VCH-1", MAIZE, "SEED", 500, 300 * TK, s);
        vm.prank(farhana);
        vouchers.approveVoucher("VCH-1");
        vm.prank(kamal);
        uint256 sale = vouchers.recordSale("VCH-1", 500, new bytes32[](0));
        vm.prank(imran);
        vouchers.confirmSale(sale);
    }

    /// One full sale through the marketplace: receipt, buy-back, listing, deal, payment, delivery.
    function _sell(uint256 kg, uint256 unitPrice) internal {
        bytes32 id = bytes32(++receiptCount);
        vm.prank(habib);
        receipts.issueReceipt(id, MAIZE, "MAIZE", kg, "A", uint64(block.timestamp + 365 days), keccak256("i"));
        bytes32 wegro = receipts.WEGRO();
        vm.prank(imran);
        receipts.offerHandover(id, wegro);
        vm.prank(admin);
        receipts.acceptHandover(id);
        vm.prank(admin);
        uint256 listing = trade.listReceipt(id, unitPrice);
        vm.prank(sabbir);
        uint256 offer = trade.makeOffer(listing, kg, unitPrice);
        vm.prank(admin);
        trade.approveOffer(offer);
        vm.prank(farhana);
        trade.confirmBuyerPayment(offer, bytes32(++refCount));
        vm.prank(habib);
        trade.confirmDelivery(offer, kg, keccak256("q"));
        vm.prank(sabbir);
        trade.confirmDelivery(offer, kg, keccak256("q"));
    }

    function _addCost(uint256 amountTk) internal returns (uint256) {
        vm.prank(farhana);
        return settlement.addCost(MAIZE, "TRANSPORT", amountTk * TK, keccak256("truck invoices"));
    }

    function _readyForSale() internal {
        vm.prank(admin);
        ledger.markReadyForSale(MAIZE);
    }

    function _prepare(bool isFinal) internal returns (uint256) {
        vm.prank(farhana);
        return settlement.prepareRound(MAIZE, isFinal);
    }

    function _approve(uint256 roundId) internal {
        vm.prank(rafiq);
        settlement.approveRound(roundId);
    }

    function _payAll(uint256 roundId) internal {
        bytes32[] memory payees = settlement.getPayees(roundId);
        for (uint256 i = 0; i < payees.length; i++) {
            vm.prank(farhana);
            settlement.recordPayment(roundId, payees[i], bytes32(++refCount));
        }
    }

    function _line(uint256 roundId, bytes32 payee) internal view returns (bytes32) {
        return settlement.payoutLineHash(roundId, payee);
    }

    /// Stage 7 setup: Tk 600,000 sales, Tk 150,000 inputs + Tk 50,000 transport = Tk 400,000 profit.
    function _docScenario() internal {
        _inputs();
        _sell(20_000, 30 * TK);
        _addCost(50_000);
        _readyForSale();
    }

    // --- constructor --------------------------------------------------------------

    function test_ConstructorGuards() public {
        vm.expectRevert(SettlementLedger.ZeroDependency.selector);
        new SettlementLedger(registry, ProjectLedger(address(0)), vouchers, trade, insurance, receipts);
        vm.expectRevert(SettlementLedger.ZeroDependency.selector);
        new SettlementLedger(registry, ledger, VoucherRegistry(address(0)), trade, insurance, receipts);
        vm.expectRevert(SettlementLedger.ZeroDependency.selector);
        new SettlementLedger(registry, ledger, vouchers, TradeLedger(address(0)), insurance, receipts);
        vm.expectRevert(SettlementLedger.ZeroDependency.selector);
        new SettlementLedger(registry, ledger, vouchers, trade, InsuranceRegistry(address(0)), receipts);
        vm.expectRevert(SettlementLedger.ZeroDependency.selector);
        new SettlementLedger(registry, ledger, vouchers, trade, insurance, WarehouseReceipt(address(0)));
    }

    // --- Stage 7: the doc's figures ---------------------------------------------------------

    function test_DocExampleFinalPayout() public {
        _docScenario();
        (uint256 income, uint256 costs) = settlement.currentTotals(MAIZE);
        assertEq(income, 600_000 * TK);
        assertEq(costs, 200_000 * TK);

        uint256 id = _prepare(true);
        SettlementLedger.Round memory r = settlement.getRound(id);
        assertEq(r.profit, 400_000 * TK);
        assertEq(r.farmerShare, 160_000 * TK);
        assertEq(r.investorShare, 160_000 * TK);
        assertEq(r.wegroShare, 80_000 * TK);
        assertEq(r.capitalReturn, 2_000_000 * TK);
        assertEq(r.leftover, 0);
        assertEq(r.preparedBy, FARHANA);
        assertEq(r.payeeCount, 3);

        // Nasrin: 4% of Tk 160,000 = Tk 6,400, plus her Tk 80,000 back. Only the hash is on the ledger.
        assertEq(_line(id, NASRIN), settlement.lineHash(id, NASRIN, 86_400 * TK));
        assertEq(_line(id, KARIM), settlement.lineHash(id, KARIM, (153_600 + 1_920_000) * TK));
        assertEq(_line(id, RAHIM), settlement.lineHash(id, RAHIM, 160_000 * TK));
        assertTrue(_line(id, NASRIN) != settlement.lineHash(id, NASRIN, 86_401 * TK));

        _approve(id);
        assertEq(uint8(settlement.getRound(id).status), uint8(SettlementLedger.RoundStatus.Approved));
        assertEq(settlement.getRound(id).approvedBy, RAFIQ);

        _payAll(id);
        assertEq(uint8(settlement.getRound(id).status), uint8(SettlementLedger.RoundStatus.Paid));
        assertEq(uint8(ledger.getProject(MAIZE).stage), uint8(ProjectLedger.Stage.PaidOut));
        assertTrue(settlement.linePaid(id, NASRIN));
    }

    function test_FingerprintCoversTheFigures() public {
        _docScenario();
        uint256 id = _prepare(true);
        SettlementLedger.Round memory r = settlement.getRound(id);
        bytes32 expected = keccak256(
            abi.encode(
                id, MAIZE, r.income, r.costs, r.profit, r.farmerShare, r.investorShare, r.wegroShare, r.capitalReturn, r.leftover
            )
        );
        assertEq(r.fingerprint, expected);
    }

    function test_InsuranceCountsAsIncome() public {
        _inputs();
        vm.prank(jui);
        insurance.setCoverage(MAIZE, 500_000 * TK, keccak256("cover"));
        vm.prank(admin);
        insurance.recordWeatherEvent("FLOOD", "BOGURA", "FLOOD", keccak256("e"));
        vm.prank(admin);
        insurance.openClaim("CLM", MAIZE, "FLOOD");
        vm.startPrank(jui);
        insurance.startReview("CLM");
        insurance.approveClaim("CLM", 250_000 * TK, keccak256("assessment"));
        vm.stopPrank();

        _sell(5_000, 30 * TK); // the crop that survived: Tk 150,000
        _readyForSale();
        uint256 id = _prepare(true);
        SettlementLedger.Round memory r = settlement.getRound(id);
        assertEq(r.income, 400_000 * TK); // 250,000 insurance + 150,000 sales
        assertEq(r.profit, 250_000 * TK); // minus 150,000 inputs
        assertEq(r.farmerShare, 100_000 * TK);
    }

    // --- the final payout waits for everything that feeds it ------------------------------

    function _outstanding(bytes32 what) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(SettlementLedger.StillOutstanding.selector, MAIZE, what);
    }

    function test_FinalWaitsForStoredCrop() public {
        _inputs();
        vm.prank(habib); // maize still in the warehouse, unsold
        receipts.issueReceipt("UNSOLD", MAIZE, "MAIZE", 1_000, "A", uint64(block.timestamp + 365 days), keccak256("i"));
        _readyForSale();
        vm.prank(farhana);
        vm.expectRevert(_outstanding("STORED_CROP"));
        settlement.prepareRound(MAIZE, true);

        vm.prank(habib); // taken out (or sold) first
        receipts.markCollected("UNSOLD");
        _prepare(true);
    }

    function test_FinalWaitsForDelivery() public {
        _inputs();
        vm.prank(habib);
        receipts.issueReceipt("R", MAIZE, "MAIZE", 1_000, "A", uint64(block.timestamp + 365 days), keccak256("i"));
        bytes32 wegro = receipts.WEGRO();
        vm.prank(imran);
        receipts.offerHandover("R", wegro);
        vm.startPrank(admin);
        receipts.acceptHandover("R");
        uint256 listing = trade.listReceipt("R", 30 * TK);
        vm.stopPrank();
        vm.prank(sabbir);
        uint256 offer = trade.makeOffer(listing, 1_000, 30 * TK);
        vm.prank(admin);
        trade.approveOffer(offer);
        vm.prank(farhana);
        trade.confirmBuyerPayment(offer, "BUYER-REF");
        _readyForSale();

        vm.prank(farhana); // paid but not delivered: its income isn't in yet
        vm.expectRevert(_outstanding("TRADES"));
        settlement.prepareRound(MAIZE, true);

        vm.prank(habib);
        trade.confirmDelivery(offer, 1_000, keccak256("q"));
        vm.prank(sabbir);
        trade.confirmDelivery(offer, 1_000, keccak256("q"));
        uint256 id = _prepare(true);
        assertEq(settlement.getRound(id).income, 30_000 * TK);
    }

    function test_FinalWaitsForVoucherSales() public {
        _inputs();
        bytes32[] memory s = new bytes32[](1);
        s[0] = KAMAL;
        vm.prank(ops);
        vouchers.proposeVoucher("VCH-2", MAIZE, "UREA", 100, 50 * TK, s);
        vm.prank(farhana);
        vouchers.approveVoucher("VCH-2");
        vm.prank(kamal);
        uint256 sale = vouchers.recordSale("VCH-2", 100, new bytes32[](0));
        _readyForSale();

        vm.prank(farhana);
        vm.expectRevert(_outstanding("VOUCHER_SALES"));
        settlement.prepareRound(MAIZE, true);

        vm.prank(imran);
        vouchers.confirmSale(sale);
        uint256 id = _prepare(true);
        assertEq(settlement.getRound(id).costs, 155_000 * TK); // the late input is counted
    }

    function test_FinalWaitsForClaims() public {
        _inputs();
        vm.prank(jui);
        insurance.setCoverage(MAIZE, 100_000 * TK, keccak256("cover"));
        vm.startPrank(admin);
        insurance.recordWeatherEvent("FLOOD", "BOGURA", "FLOOD", keccak256("e"));
        insurance.openClaim("CLM", MAIZE, "FLOOD");
        vm.stopPrank();
        _readyForSale();

        vm.prank(farhana);
        vm.expectRevert(_outstanding("CLAIMS"));
        settlement.prepareRound(MAIZE, true);

        vm.prank(jui);
        insurance.rejectClaim("CLM", keccak256("no damage"));
        _prepare(true);
    }

    function test_CostsFrozenWhileFinalRoundOpen() public {
        _docScenario();
        uint256 id = _prepare(true);
        vm.prank(farhana);
        vm.expectRevert(abi.encodeWithSelector(SettlementLedger.RoundOpen.selector, MAIZE, id));
        settlement.addCost(MAIZE, "LATE", 1, keccak256("x"));
        vm.prank(farhana);
        vm.expectRevert(abi.encodeWithSelector(SettlementLedger.RoundOpen.selector, MAIZE, id));
        settlement.voidCost(1);

        vm.prank(rafiq);
        settlement.rejectRound(id, keccak256("redo"));
        _addCost(1_000); // open again once the round is sent back
    }

    function test_CostsAllowedWhileStagedRoundOpen() public {
        _inputs();
        _sell(10_000, 30 * TK);
        vm.warp(ledger.getProject(MAIZE).createdAt + 4 * 30 days);
        _prepare(false);
        _addCost(1_000); // counted in the next round
        assertEq(settlement.otherCosts(MAIZE), 1_000 * TK);
    }

    // --- losses -----------------------------------------------------------------------------

    function test_LossReducesCapitalNoProfitShares() public {
        _inputs(); // Tk 150,000 costs
        _sell(1_000, 50 * TK); // Tk 50,000 income: a Tk 100,000 loss
        _readyForSale();
        uint256 id = _prepare(true);
        SettlementLedger.Round memory r = settlement.getRound(id);
        assertEq(r.profit, 0);
        assertEq(r.farmerShare, 0);
        assertEq(r.capitalReturn, 1_900_000 * TK);
        assertEq(r.payeeCount, 2); // investors only; the farmer gets nothing
        assertEq(_line(id, RAHIM), bytes32(0));
        assertEq(_line(id, NASRIN), settlement.lineHash(id, NASRIN, 76_000 * TK)); // 4% of 1,900,000
    }

    function test_TotalLossPaysNothingAndCloses() public {
        _inputs();
        _addCost(1_900_000); // costs Tk 2,050,000, no sales
        _readyForSale();
        uint256 id = _prepare(true);
        assertEq(settlement.getRound(id).capitalReturn, 0);
        assertEq(settlement.getRound(id).payeeCount, 0);

        _approve(id); // nothing to pay: the round completes at once
        assertEq(uint8(settlement.getRound(id).status), uint8(SettlementLedger.RoundStatus.Paid));
        assertEq(uint8(ledger.getProject(MAIZE).stage), uint8(ProjectLedger.Stage.PaidOut));
    }

    // --- rounding ----------------------------------------------------------------------------

    function test_RoundingLeftoverIsRecorded() public {
        _inputs();
        _sell(1, 150_000 * TK + 7); // profit of 7 poisha
        _readyForSale();
        uint256 id = _prepare(true);
        SettlementLedger.Round memory r = settlement.getRound(id);
        assertEq(r.profit, 7);
        assertEq(r.farmerShare, 2); // 2.8 -> 2
        assertEq(r.investorShare, 2);
        assertEq(r.wegroShare, 1); // 1.4 -> 1
        // 2 left from the split; investors' 2 poisha + capital split 4/96 rounds down too.
        uint256 share = r.investorShare;
        uint256 capital = r.capitalReturn;
        uint256 nasrinAmt = share * 4 / 100 + capital * 4 / 100;
        uint256 karimAmt = share * 96 / 100 + capital * 96 / 100;
        assertEq(_line(id, NASRIN), settlement.lineHash(id, NASRIN, nasrinAmt));
        assertEq(_line(id, KARIM), settlement.lineHash(id, KARIM, karimAmt));
        uint256 investorPool = share + capital;
        assertEq(r.leftover, 2 + investorPool - nasrinAmt - karimAmt);
    }

    function test_ZeroAmountInvestorGetsNoLine() public {
        _inputs();
        _sell(1, 150_000 * TK + 7); // a staged round with 7 poisha of profit
        vm.warp(ledger.getProject(MAIZE).createdAt + 4 * 30 days);
        uint256 id = _prepare(false);
        SettlementLedger.Round memory r = settlement.getRound(id);
        assertEq(r.investorShare, 2);
        assertEq(_line(id, NASRIN), bytes32(0)); // 2 x 4% rounds to 0: no line
        assertEq(_line(id, KARIM), settlement.lineHash(id, KARIM, 1)); // 2 x 96% -> 1
        assertEq(r.payeeCount, 2); // farmer + Karim
    }

    // --- four eyes (FR-10) ---------------------------------------------------------------------

    function test_PreparerCannotApprove() public {
        _docScenario();
        uint256 id = _prepare(true);
        vm.prank(farhana);
        vm.expectRevert(abi.encodeWithSelector(SettlementLedger.SameAccountant.selector, FARHANA));
        settlement.approveRound(id);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, admin, ACCOUNTS));
        settlement.approveRound(id);
    }

    function test_NothingPaidBeforeApproval() public {
        _docScenario();
        uint256 id = _prepare(true);
        vm.prank(farhana);
        vm.expectRevert(
            abi.encodeWithSelector(SettlementLedger.WrongRoundStatus.selector, id, SettlementLedger.RoundStatus.Prepared)
        );
        settlement.recordPayment(id, NASRIN, "REF");
    }

    function test_RejectedRoundIsCorrectedAndPreparedAgain() public {
        _docScenario();
        uint256 first = _prepare(true);
        vm.prank(farhana); // a project can have only one open round
        vm.expectRevert(abi.encodeWithSelector(SettlementLedger.RoundOpen.selector, MAIZE, first));
        settlement.prepareRound(MAIZE, true);

        vm.expectEmit(address(settlement));
        emit SettlementLedger.RoundRejected(first, keccak256("transport overstated"), rafiq);
        vm.prank(rafiq);
        settlement.rejectRound(first, keccak256("transport overstated"));
        assertEq(settlement.openRound(MAIZE), 0);

        vm.prank(farhana);
        settlement.voidCost(1); // the Tk 50,000 transport cost
        _addCost(30_000);
        uint256 second = _prepare(true);
        assertEq(settlement.getRound(second).profit, 420_000 * TK);

        vm.prank(rafiq);
        vm.expectRevert(abi.encodeWithSelector(SettlementLedger.ZeroValue.selector));
        settlement.rejectRound(second, bytes32(0));
    }

    // --- payments --------------------------------------------------------------------------

    function test_PaymentGuards() public {
        _docScenario();
        uint256 id = _prepare(true);
        _approve(id);
        vm.startPrank(farhana);
        vm.expectRevert(abi.encodeWithSelector(SettlementLedger.NotAPayee.selector, id, bytes32("NOBODY")));
        settlement.recordPayment(id, "NOBODY", "REF");
        vm.expectRevert(SettlementLedger.ZeroValue.selector);
        settlement.recordPayment(id, NASRIN, bytes32(0));

        vm.expectEmit(address(settlement));
        emit SettlementLedger.PaymentRecorded(id, NASRIN, "REF", farhana);
        settlement.recordPayment(id, NASRIN, "REF");
        vm.expectRevert(abi.encodeWithSelector(SettlementLedger.AlreadyPaid.selector, id, NASRIN));
        settlement.recordPayment(id, NASRIN, "REF-2");
        vm.expectRevert(abi.encodeWithSelector(SettlementLedger.PaymentRefAlreadyUsed.selector, bytes32("REF")));
        settlement.recordPayment(id, KARIM, "REF");
        vm.stopPrank();

        assertEq(settlement.getRound(id).paidCount, 1);
        assertEq(uint8(ledger.getProject(MAIZE).stage), uint8(ProjectLedger.Stage.ReadyForSale)); // not all paid yet
    }

    function test_RoundGuards() public {
        vm.prank(rafiq);
        vm.expectRevert(abi.encodeWithSelector(SettlementLedger.RoundNotFound.selector, 9));
        settlement.approveRound(9);

        _inputs();
        vm.prank(farhana); // final needs ReadyForSale
        vm.expectRevert(
            abi.encodeWithSelector(SettlementLedger.WrongProjectStage.selector, MAIZE, ProjectLedger.Stage.Active)
        );
        settlement.prepareRound(MAIZE, true);
    }

    function test_NothingAfterFinalApproval() public {
        _docScenario();
        uint256 id = _prepare(true);
        _approve(id);
        _payAll(id);
        vm.prank(farhana);
        vm.expectRevert(abi.encodeWithSelector(SettlementLedger.AlreadySettled.selector, MAIZE));
        settlement.prepareRound(MAIZE, true);
        vm.prank(farhana);
        vm.expectRevert(abi.encodeWithSelector(SettlementLedger.AlreadySettled.selector, MAIZE));
        settlement.addCost(MAIZE, "LATE", 1, keccak256("x"));
    }

    // --- staged payouts (FR-21) ---------------------------------------------------------------

    function test_StagedRoundsThenFinal() public {
        _inputs(); // Tk 150,000 costs
        _sell(10_000, 30 * TK); // Tk 300,000

        // The first stage is 4 months after the project was created.
        uint64 due = ledger.getProject(MAIZE).createdAt + 4 * 30 days;
        vm.prank(farhana);
        vm.expectRevert(abi.encodeWithSelector(SettlementLedger.TooEarly.selector, MAIZE, due));
        settlement.prepareRound(MAIZE, false);

        vm.warp(due);
        uint256 s1 = _prepare(false);
        SettlementLedger.Round memory r1 = settlement.getRound(s1);
        assertEq(r1.profit, 150_000 * TK);
        assertEq(r1.capitalReturn, 0); // capital only comes back at the end
        _approve(s1);
        _payAll(s1);
        assertEq(settlement.distributedProfit(MAIZE), 150_000 * TK);

        // Stage 2: four months on, no new sales -> nothing to split.
        vm.warp(block.timestamp + 4 * 30 days);
        vm.prank(farhana);
        vm.expectRevert(abi.encodeWithSelector(SettlementLedger.NothingToDistribute.selector, MAIZE));
        settlement.prepareRound(MAIZE, false);

        // More sales, then the final round splits only the new profit and returns capital.
        _sell(5_000, 30 * TK);
        _addCost(20_000);
        _readyForSale();
        uint256 fin = _prepare(true);
        SettlementLedger.Round memory rf = settlement.getRound(fin);
        assertEq(rf.profit, 130_000 * TK); // 450,000 - 170,000 - 150,000 already split
        assertEq(rf.capitalReturn, 2_000_000 * TK);
        _approve(fin);
        _payAll(fin);
        assertEq(uint8(ledger.getProject(MAIZE).stage), uint8(ProjectLedger.Stage.PaidOut));
    }

    function test_LaterLossEatsIntoCapital() public {
        _inputs();
        _sell(10_000, 30 * TK); // profit 150,000 so far
        vm.warp(ledger.getProject(MAIZE).createdAt + 4 * 30 days);
        uint256 s1 = _prepare(false);
        _approve(s1);
        _payAll(s1);

        _addCost(200_000); // a big cost after the stage was paid
        _readyForSale();
        uint256 fin = _prepare(true);
        // Overall: 300,000 - 350,000 = -50,000, and 150,000 was already split: shortfall 200,000.
        assertEq(settlement.getRound(fin).profit, 0);
        assertEq(settlement.getRound(fin).capitalReturn, 1_800_000 * TK);
    }

    function test_StagedNeedsActiveProjectWithInterval() public {
        vm.prank(farhana); // still Funded
        vm.expectRevert(
            abi.encodeWithSelector(SettlementLedger.WrongProjectStage.selector, MAIZE, ProjectLedger.Stage.Funded)
        );
        settlement.prepareRound(MAIZE, false);
    }

    function test_SingleStageProjectsCannotStage() public {
        vm.prank(admin);
        ledger.cancelProject(MAIZE);
        bytes32 other = keccak256("PRJ-NO-STAGES");
        ProjectLedger.ProjectTerms memory t = ledger.getProject(MAIZE).terms;
        t.payoutIntervalMonths = 0;
        vm.startPrank(admin);
        ledger.createProject(other, t);
        ledger.openForFunding(other);
        vm.stopPrank();
        vm.prank(nasrin);
        uint256 r = ledger.reserveSlots(other, 100);
        vm.prank(farhana);
        ledger.confirmPayment(r, "REF-X");
        vm.prank(admin);
        ledger.activate(other);

        vm.prank(farhana);
        vm.expectRevert(abi.encodeWithSelector(SettlementLedger.NotStaged.selector, other));
        settlement.prepareRound(other, false);
    }

    // --- costs ---------------------------------------------------------------------------------

    function test_CostsAddAndVoid() public {
        _inputs();
        uint256 c = _addCost(50_000);
        SettlementLedger.Cost memory cost = settlement.getCost(c);
        assertEq(cost.amount, 50_000 * TK);
        assertEq(cost.enteredBy, FARHANA);
        assertEq(settlement.otherCosts(MAIZE), 50_000 * TK);
        (, uint256 costs) = settlement.currentTotals(MAIZE);
        assertEq(costs, 200_000 * TK); // 150,000 vouchers + 50,000 entered

        vm.prank(rafiq);
        settlement.voidCost(c);
        assertEq(settlement.otherCosts(MAIZE), 0);
        assertTrue(settlement.getCost(c).voided);
        vm.prank(rafiq);
        vm.expectRevert(abi.encodeWithSelector(SettlementLedger.CostAlreadyVoided.selector, c));
        settlement.voidCost(c);
        vm.prank(rafiq);
        vm.expectRevert(abi.encodeWithSelector(SettlementLedger.CostNotFound.selector, 99));
        settlement.voidCost(99);
    }

    function test_CostGuards() public {
        vm.startPrank(farhana);
        vm.expectRevert(SettlementLedger.ZeroValue.selector);
        settlement.addCost(MAIZE, bytes32(0), 1, keccak256("x"));
        vm.expectRevert(SettlementLedger.ZeroValue.selector);
        settlement.addCost(MAIZE, "T", 0, keccak256("x"));
        vm.expectRevert(SettlementLedger.ZeroValue.selector);
        settlement.addCost(MAIZE, "T", 1, bytes32(0));
        vm.expectRevert(
            abi.encodeWithSelector(SettlementLedger.WrongProjectStage.selector, bytes32("NONE"), ProjectLedger.Stage.None)
        );
        settlement.addCost("NONE", "T", 1, keccak256("x"));
        vm.stopPrank();

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, admin, ACCOUNTS));
        settlement.addCost(MAIZE, "T", 1, keccak256("x"));
    }

    // --- invariant-style fuzz --------------------------------------------------------------------

    /// Every poisha of profit + capital is accounted for: payee lines + WeGro share + leftover.
    function testFuzz_SplitAccountsForEverything(uint256 saleAmount, uint256 extraCost) public {
        _inputs();
        saleAmount = bound(saleAmount, 1, 10_000_000 * TK);
        extraCost = bound(extraCost, 0, 1_000_000 * TK);
        _sell(1, saleAmount);
        if (extraCost > 0) {
            vm.prank(farhana);
            settlement.addCost(MAIZE, "T", extraCost, keccak256("x"));
        }
        _readyForSale();
        uint256 id = _prepare(true);
        SettlementLedger.Round memory r = settlement.getRound(id);

        uint256 nasrinAmt = r.investorShare * 4 / 100 + r.capitalReturn * 4 / 100;
        uint256 karimAmt = r.investorShare * 96 / 100 + r.capitalReturn * 96 / 100;
        if (nasrinAmt != 0) assertEq(_line(id, NASRIN), settlement.lineHash(id, NASRIN, nasrinAmt));
        if (karimAmt != 0) assertEq(_line(id, KARIM), settlement.lineHash(id, KARIM, karimAmt));
        assertEq(r.farmerShare + nasrinAmt + karimAmt + r.wegroShare + r.leftover, r.profit + r.capitalReturn);
        assertLe(r.capitalReturn, 2_000_000 * TK);
    }
}

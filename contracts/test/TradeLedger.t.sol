// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AccessRegistry} from "../contracts/access/AccessRegistry.sol";
import {AccessGuarded} from "../contracts/access/AccessGuarded.sol";
import {ProjectLedger} from "../contracts/projects/ProjectLedger.sol";
import {WarehouseReceipt} from "../contracts/warehouse/WarehouseReceipt.sol";
import {TradeLedger} from "../contracts/trade/TradeLedger.sol";

contract TradeLedgerTest is Test {
    AccessRegistry registry;
    ProjectLedger ledger;
    WarehouseReceipt receipts;
    TradeLedger trade;

    address superAdmin = makeAddr("superAdmin");
    address admin = makeAddr("tania");
    address imran = makeAddr("imran"); // Rahim's field officer
    address sumon = makeAddr("sumon"); // another field officer
    address accounts = makeAddr("farhana");
    address rahim = makeAddr("rahim");
    address nasrin = makeAddr("nasrin");
    address habib = makeAddr("habib"); // Bogura site
    address dalia = makeAddr("dalia"); // Dhaka site
    address sabbir = makeAddr("sabbir"); // buyer
    address mitu = makeAddr("mitu"); // buyer

    uint256 constant TK = 100;

    bytes32 constant RAHIM = keccak256("FARMER-0001");
    bytes32 constant NASRIN = keccak256("INVESTOR-0001");
    bytes32 constant HABIB = keccak256("WAREHOUSE-0001");
    bytes32 constant DALIA = keccak256("WAREHOUSE-0002");
    bytes32 constant SABBIR = keccak256("BUYER-0001");
    bytes32 constant MITU = keccak256("BUYER-0002");

    bytes32 constant BOGURA = "WH-BOGURA-01";
    bytes32 constant DHAKA = "WH-DHAKA-02";
    bytes32 constant MAIZE = keccak256("PRJ-MAIZE-BOGURA-01");
    bytes32 constant ONION = keccak256("PRJ-ONION-PABNA-01");
    bytes32 constant R1 = "RCPT-0001"; // 5,000 kg
    uint256 constant ASK = 30 * TK; // Tk 30/kg

    bytes32 WEGRO;
    bytes32 BUYER;
    bytes32 ADMIN_ROLE;
    bytes32 ACCOUNTS_ROLE;
    uint256 refCount;

    function setUp() public {
        vm.warp(1_780_000_000);
        registry = new AccessRegistry(superAdmin);
        ledger = new ProjectLedger(registry, 120 hours);
        receipts = new WarehouseReceipt(registry, ledger);
        trade = new TradeLedger(registry, ledger, receipts);
        WEGRO = receipts.WEGRO();
        BUYER = registry.BUYER_ROLE();
        ADMIN_ROLE = registry.ADMIN_ROLE();
        ACCOUNTS_ROLE = registry.ACCOUNTS_ROLE();

        vm.startPrank(superAdmin);
        _person(keccak256("STAFF-ADMIN"), ADMIN_ROLE, admin);
        _person(keccak256("STAFF-OFFICER-1"), registry.FIELD_OFFICER_ROLE(), imran);
        _person(keccak256("STAFF-OFFICER-2"), registry.FIELD_OFFICER_ROLE(), sumon);
        _person(keccak256("STAFF-ACCOUNTS"), ACCOUNTS_ROLE, accounts);
        receipts.setLinkedContract(address(trade), true);
        vm.stopPrank();

        bytes32 farmerRole = registry.FARMER_ROLE();
        vm.prank(imran);
        registry.registerParticipant(RAHIM, farmerRole, rahim, keccak256("rahim"));

        vm.startPrank(admin);
        registry.verifyParticipant(RAHIM);
        _person(NASRIN, registry.INVESTOR_ROLE(), nasrin);
        _person(HABIB, registry.WAREHOUSE_ROLE(), habib);
        _person(DALIA, registry.WAREHOUSE_ROLE(), dalia);
        _person(SABBIR, BUYER, sabbir);
        _person(MITU, BUYER, mitu);
        receipts.registerSite(BOGURA, keccak256("bogura"));
        receipts.registerSite(DHAKA, keccak256("dhaka"));
        receipts.assignOperator(HABIB, BOGURA);
        receipts.assignOperator(DALIA, DHAKA);
        vm.stopPrank();

        _activeProject(MAIZE, "MAIZE", ProjectLedger.ProduceCategory.StorableCrop);
        _activeProject(ONION, "ONION", ProjectLedger.ProduceCategory.Perishable);

        vm.prank(habib);
        receipts.issueReceipt(R1, MAIZE, "MAIZE", 5_000, "A", uint64(block.timestamp + 180 days), keccak256("intake"));
    }

    // --- helpers ---------------------------------------------------------------

    function _person(bytes32 id, bytes32 role, address account) internal {
        registry.registerParticipant(id, role, account, keccak256(abi.encode(id)));
        registry.verifyParticipant(id);
    }

    function _activeProject(bytes32 id, bytes32 produce, ProjectLedger.ProduceCategory category) internal {
        ProjectLedger.ProjectTerms memory t = ProjectLedger.ProjectTerms({
            farmerId: RAHIM,
            produceCode: produce,
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
        vm.startPrank(admin);
        ledger.createProject(id, t);
        ledger.openForFunding(id);
        vm.stopPrank();
        vm.prank(nasrin);
        uint256 r = ledger.reserveSlots(id, 10);
        vm.prank(accounts);
        ledger.confirmPayment(r, bytes32(++refCount));
        vm.prank(admin);
        ledger.activate(id);
    }

    /// WeGro buys R1 back and lists all 5,000 kg at Tk 30/kg.
    function _weGroListing() internal returns (uint256) {
        vm.prank(imran);
        receipts.offerHandover(R1, WEGRO);
        vm.prank(admin);
        receipts.acceptHandover(R1);
        vm.prank(admin);
        return trade.listReceipt(R1, ASK);
    }

    function _offer(address buyer, uint256 listingId, uint256 kg, uint256 price) internal returns (uint256) {
        vm.prank(buyer);
        return trade.makeOffer(listingId, kg, price);
    }

    function _approve(uint256 offerId) internal {
        vm.prank(admin);
        trade.approveOffer(offerId);
    }

    function _pay(uint256 offerId) internal {
        vm.prank(accounts);
        trade.confirmBuyerPayment(offerId, bytes32(++refCount));
    }

    function _deliver(uint256 offerId, address handler, address buyer, uint256 kg) internal {
        vm.prank(handler);
        trade.confirmDelivery(offerId, kg, keccak256("handler check"));
        vm.prank(buyer);
        trade.confirmDelivery(offerId, kg, keccak256("buyer check"));
    }

    function _offerStatus(uint256 id) internal view returns (uint8) {
        return uint8(trade.getOffer(id).status);
    }

    function _wrongOffer(uint256 id, TradeLedger.OfferStatus s) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(TradeLedger.WrongOfferStatus.selector, id, s);
    }

    // --- constructor --------------------------------------------------------------

    function test_ConstructorGuards() public {
        vm.expectRevert(TradeLedger.ZeroDependency.selector);
        new TradeLedger(registry, ProjectLedger(address(0)), receipts);
        vm.expectRevert(TradeLedger.ZeroDependency.selector);
        new TradeLedger(registry, ledger, WarehouseReceipt(address(0)));
    }

    // --- Stage 6, with two partial buyers -----------------------------------------------------

    function test_TwoBuyersSplitAListing() public {
        uint256 id = _weGroListing();
        TradeLedger.Listing memory l = trade.getListing(id);
        assertEq(l.seller, WEGRO);
        assertEq(l.quantity, 5_000);
        assertEq(l.available, 5_000);

        // Sabbir wants 2,000 kg at Tk 29; Mitu 3,000 kg at Tk 31.
        uint256 a = _offer(sabbir, id, 2_000, 29 * TK);
        uint256 b = _offer(mitu, id, 3_000, 31 * TK);
        _approve(a);
        assertEq(trade.getListing(id).available, 3_000);
        _approve(b);
        assertEq(trade.getListing(id).available, 0);
        assertEq(trade.getListing(id).unpaidDeals, 2);

        _pay(a);
        bytes32 partA = trade.getOffer(a).receiptPartId;
        assertEq(receipts.ownerOf(partA), SABBIR);
        assertEq(receipts.getReceipt(partA).quantity, 2_000);
        assertEq(receipts.getReceipt(R1).quantity, 3_000);

        _pay(b);
        bytes32 partB = trade.getOffer(b).receiptPartId;
        assertEq(receipts.ownerOf(partB), MITU);
        assertEq(uint8(receipts.getReceipt(R1).status), uint8(WarehouseReceipt.Status.SoldOut));

        vm.prank(habib);
        trade.confirmDelivery(a, 2_000, keccak256("handler check"));
        vm.expectEmit(address(trade));
        emit TradeLedger.DealDelivered(a, MAIZE, 58_000 * TK); // 2,000 x Tk 29
        vm.prank(sabbir);
        trade.confirmDelivery(a, 2_000, keccak256("buyer check"));
        _deliver(b, habib, mitu, 3_000);

        assertEq(trade.saleIncome(MAIZE), (58_000 + 93_000) * TK);
        assertEq(uint8(receipts.getReceipt(partA).status), uint8(WarehouseReceipt.Status.Collected));
        assertEq(uint8(receipts.getReceipt(partB).status), uint8(WarehouseReceipt.Status.Collected));
        assertEq(_offerStatus(a), uint8(TradeLedger.OfferStatus.Delivered));
        assertEq(trade.getDelivery(a).handlerId, HABIB);
        assertEq(uint8(ledger.getProject(MAIZE).stage), uint8(ProjectLedger.Stage.Active)); // admin's call
    }

    function test_FarmerSellsOwnReceiptWithAdminApproval() public {
        vm.prank(imran); // Rahim's officer lists Rahim's receipt
        uint256 id = trade.listReceipt(R1, ASK);
        assertEq(trade.getListing(id).seller, RAHIM);

        uint256 offerId = _offer(mitu, id, 1_000, ASK);
        vm.prank(imran); // the farmer's side cannot approve its own deal
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, imran, ADMIN_ROLE));
        trade.approveOffer(offerId);
        _approve(offerId);
        _pay(offerId);
        assertEq(receipts.ownerOf(trade.getOffer(offerId).receiptPartId), MITU);
        assertEq(receipts.ownerOf(R1), RAHIM); // Rahim keeps the other 4,000 kg
    }

    // --- offers -----------------------------------------------------------------------------

    function test_OfferRecordsQuantityAndPrice() public {
        uint256 id = _weGroListing();
        vm.expectEmit(address(trade));
        emit TradeLedger.OfferMade(1, id, SABBIR, 1_200, 28 * TK);
        uint256 o = _offer(sabbir, id, 1_200, 28 * TK);
        TradeLedger.Offer memory offer = trade.getOffer(o);
        assertEq(offer.quantity, 1_200);
        assertEq(offer.unitPrice, 28 * TK);
        assertEq(offer.buyerId, SABBIR);
        assertEq(_offerStatus(o), uint8(TradeLedger.OfferStatus.Pending));
    }

    function test_OfferCannotExceedAvailable() public {
        uint256 id = _weGroListing();
        vm.prank(sabbir);
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.ExceedsAvailable.selector, 5_001, 5_000));
        trade.makeOffer(id, 5_001, ASK);

        _approve(_offer(sabbir, id, 4_000, ASK));
        vm.prank(mitu);
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.ExceedsAvailable.selector, 1_001, 1_000));
        trade.makeOffer(id, 1_001, ASK);
    }

    function test_ApprovalChecksWhatIsStillAvailable() public {
        uint256 id = _weGroListing();
        uint256 a = _offer(sabbir, id, 3_000, ASK);
        uint256 b = _offer(mitu, id, 3_000, ASK); // made while 5,000 kg were free
        _approve(a);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.ExceedsAvailable.selector, 3_000, 2_000));
        trade.approveOffer(b);
    }

    function test_RejectOffer() public {
        uint256 id = _weGroListing();
        uint256 o = _offer(sabbir, id, 1_000, 20 * TK);
        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, imran, ADMIN_ROLE));
        trade.rejectOffer(o);

        vm.expectEmit(address(trade));
        emit TradeLedger.OfferRejected(o, admin);
        vm.prank(admin);
        trade.rejectOffer(o);
        assertEq(_offerStatus(o), uint8(TradeLedger.OfferStatus.Rejected));

        vm.prank(admin);
        vm.expectRevert(_wrongOffer(o, TradeLedger.OfferStatus.Rejected));
        trade.approveOffer(o);
        assertEq(trade.getListing(id).available, 5_000);
    }

    function test_WithdrawOffer() public {
        uint256 id = _weGroListing();
        uint256 o = _offer(sabbir, id, 1_000, ASK);
        vm.prank(mitu);
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.NotAuthorized.selector, mitu));
        trade.withdrawOffer(o);

        vm.prank(sabbir);
        trade.withdrawOffer(o);
        assertEq(_offerStatus(o), uint8(TradeLedger.OfferStatus.Withdrawn));
        vm.prank(sabbir);
        vm.expectRevert(_wrongOffer(o, TradeLedger.OfferStatus.Withdrawn));
        trade.withdrawOffer(o);
    }

    function test_OffersDoNotExpire() public {
        uint256 id = _weGroListing();
        uint256 o = _offer(sabbir, id, 1_000, ASK);
        vm.warp(block.timestamp + 150 days);
        _approve(o);
        assertEq(_offerStatus(o), uint8(TradeLedger.OfferStatus.Approved));
    }

    function test_OfferGuards() public {
        uint256 id = _weGroListing();
        vm.startPrank(sabbir);
        vm.expectRevert(TradeLedger.ZeroValue.selector);
        trade.makeOffer(id, 0, ASK);
        vm.expectRevert(TradeLedger.ZeroValue.selector);
        trade.makeOffer(id, 1, 0);
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.ListingNotFound.selector, 99));
        trade.makeOffer(99, 1, ASK);
        vm.stopPrank();

        vm.prank(nasrin);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, nasrin, BUYER));
        trade.makeOffer(id, 1, ASK);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.OfferNotFound.selector, 99));
        trade.approveOffer(99);
    }

    // --- listings ---------------------------------------------------------------------------

    function test_ListReceiptGuards() public {
        vm.prank(imran);
        vm.expectRevert(TradeLedger.ZeroValue.selector);
        trade.listReceipt(R1, 0);

        address[3] memory others = [rahim, sumon, admin]; // Rahim still owns it
        for (uint256 i = 0; i < others.length; i++) {
            vm.prank(others[i]);
            vm.expectRevert(abi.encodeWithSelector(TradeLedger.NotAuthorized.selector, others[i]));
            trade.listReceipt(R1, ASK);
        }
    }

    function test_ReceiptCannotBeListedTwice() public {
        _weGroListing();
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.WrongStatus.selector, R1, WarehouseReceipt.Status.Listed));
        trade.listReceipt(R1, ASK);
    }

    function test_FarmerCannotListAfterBuyBack() public {
        _weGroListing();
        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.NotAuthorized.selector, imran));
        trade.listReceipt(R1, ASK);
    }

    function test_ListOnlyOnActiveProject() public {
        vm.prank(admin);
        ledger.markReadyForSale(MAIZE);
        vm.prank(imran);
        vm.expectRevert(
            abi.encodeWithSelector(TradeLedger.WrongProjectStage.selector, MAIZE, ProjectLedger.Stage.ReadyForSale)
        );
        trade.listReceipt(R1, ASK);
    }

    // --- cancelling ------------------------------------------------------------------------

    function test_CancelListingReturnsRemainder() public {
        vm.prank(imran);
        uint256 id = trade.listReceipt(R1, ASK);
        uint256 o = _offer(sabbir, id, 2_000, ASK);
        _approve(o);
        _pay(o);

        vm.prank(sumon);
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.NotAuthorized.selector, sumon));
        trade.cancelListing(id);

        vm.expectEmit(address(trade));
        emit TradeLedger.ListingCancelled(id, 3_000, imran);
        vm.prank(imran);
        trade.cancelListing(id);

        assertEq(uint8(trade.getListing(id).status), uint8(TradeLedger.ListingStatus.Cancelled));
        WarehouseReceipt.Receipt memory r = receipts.getReceipt(R1);
        assertEq(r.quantity, 3_000);
        assertEq(uint8(r.status), uint8(WarehouseReceipt.Status.Issued));

        // The paid deal still completes.
        _deliver(o, habib, sabbir, 2_000);
        assertEq(trade.saleIncome(MAIZE), 60_000 * TK);

        vm.prank(sabbir); // no new offers on a cancelled listing
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.ListingClosed.selector, id));
        trade.makeOffer(id, 1, ASK);
    }

    function test_UnpaidDealsBlockCancel() public {
        uint256 id = _weGroListing();
        uint256 o = _offer(sabbir, id, 2_000, ASK);
        _approve(o);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.DealsPending.selector, id, 1));
        trade.cancelListing(id);

        vm.expectEmit(address(trade));
        emit TradeLedger.DealCancelled(o, admin);
        vm.prank(admin);
        trade.cancelDeal(o); // buyer never paid
        assertEq(_offerStatus(o), uint8(TradeLedger.OfferStatus.Cancelled));
        assertEq(trade.getListing(id).available, 5_000);

        vm.prank(admin);
        trade.cancelListing(id);
        assertEq(receipts.ownerOf(R1), WEGRO);
        assertEq(receipts.getReceipt(R1).quantity, 5_000);
    }

    function test_CancelDealGuards() public {
        uint256 id = _weGroListing();
        uint256 o = _offer(sabbir, id, 2_000, ASK);
        vm.prank(admin);
        vm.expectRevert(_wrongOffer(o, TradeLedger.OfferStatus.Pending));
        trade.cancelDeal(o);
        _approve(o);
        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, imran, ADMIN_ROLE));
        trade.cancelDeal(o);
        _pay(o);
        vm.prank(admin); // paid deals cannot be cancelled
        vm.expectRevert(_wrongOffer(o, TradeLedger.OfferStatus.Paid));
        trade.cancelDeal(o);
    }

    function test_FullySoldListingClosesAsSoldOut() public {
        uint256 id = _weGroListing();
        uint256 o = _offer(sabbir, id, 5_000, ASK);
        _approve(o);
        vm.expectEmit(address(trade));
        emit TradeLedger.ListingSoldOut(id);
        _pay(o);
        assertEq(uint8(trade.getListing(id).status), uint8(TradeLedger.ListingStatus.SoldOut));

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.ListingClosed.selector, id));
        trade.cancelListing(id);
        vm.prank(mitu);
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.ListingClosed.selector, id));
        trade.makeOffer(id, 1, ASK);
    }

    function test_OpenTradesCountListingsAndUndeliveredDeals() public {
        uint256 id = _weGroListing();
        assertEq(trade.openTrades(MAIZE), 1); // the listing

        uint256 a = _offer(sabbir, id, 2_000, ASK);
        uint256 b = _offer(mitu, id, 3_000, ASK);
        _approve(a);
        _approve(b);
        assertEq(trade.openTrades(MAIZE), 3); // listing + 2 deals

        vm.prank(admin);
        trade.cancelDeal(b);
        assertEq(trade.openTrades(MAIZE), 2);
        uint256 c = _offer(mitu, id, 3_000, ASK); // Mitu tries again
        _approve(c);
        _pay(a);
        _pay(c); // the listing sells out
        assertEq(trade.openTrades(MAIZE), 2); // two deals awaiting delivery

        _deliver(a, habib, sabbir, 2_000);
        _deliver(c, habib, mitu, 3_000);
        assertEq(trade.openTrades(MAIZE), 0);
    }

    function test_CancelledListingClearsOpenTrades() public {
        vm.prank(admin);
        uint256 id = trade.listProduce(ONION, 1_000, "A", ASK);
        assertEq(trade.openTrades(ONION), 1);
        vm.prank(admin);
        trade.cancelListing(id);
        assertEq(trade.openTrades(ONION), 0);
    }

    function test_CancelledListingCannotBeCancelledAgain() public {
        uint256 id = _weGroListing();
        vm.prank(admin);
        trade.cancelListing(id);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.ListingClosed.selector, id));
        trade.cancelListing(id);
    }

    // --- perishables -----------------------------------------------------------------------

    function test_PerishablesPartialSale() public {
        vm.prank(imran);
        uint256 id = trade.listProduce(ONION, 1_000, "A", 45 * TK);
        assertEq(trade.getListing(id).seller, RAHIM);
        assertEq(trade.getListing(id).receiptId, bytes32(0));

        uint256 o = _offer(sabbir, id, 600, 44 * TK);
        _approve(o);
        _pay(o);
        assertEq(trade.getOffer(o).receiptPartId, bytes32(0)); // no receipt for perishables

        vm.prank(habib); // no warehouse involved
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.NotAuthorized.selector, habib));
        trade.confirmDelivery(o, 600, keccak256("q"));
        vm.prank(sumon);
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.NotAuthorized.selector, sumon));
        trade.confirmDelivery(o, 600, keccak256("q"));

        _deliver(o, imran, sabbir, 600);
        assertEq(trade.saleIncome(ONION), 26_400 * TK);
        assertEq(trade.getListing(id).available, 400);

        vm.prank(admin); // a perishable listing can be closed with produce left
        trade.cancelListing(id);
    }

    function test_ListPerishableAsWeGro() public {
        vm.prank(admin);
        uint256 id = trade.listProduce(ONION, 2_000, "B", 40 * TK);
        assertEq(trade.getListing(id).seller, WEGRO);
        assertEq(trade.getListing(id).produceCode, bytes32("ONION"));
    }

    function test_ListProduceGuards() public {
        vm.startPrank(admin);
        vm.expectRevert(TradeLedger.ZeroValue.selector);
        trade.listProduce(ONION, 0, "B", ASK);
        vm.expectRevert(TradeLedger.ZeroValue.selector);
        trade.listProduce(ONION, 1, bytes32(0), ASK);
        vm.expectRevert(TradeLedger.ZeroValue.selector);
        trade.listProduce(ONION, 1, "B", 0);
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.NotPerishable.selector, MAIZE));
        trade.listProduce(MAIZE, 1, "B", ASK);
        vm.stopPrank();

        address[3] memory others = [sumon, rahim, sabbir];
        for (uint256 i = 0; i < others.length; i++) {
            vm.prank(others[i]);
            vm.expectRevert(abi.encodeWithSelector(TradeLedger.NotAuthorized.selector, others[i]));
            trade.listProduce(ONION, 1, "B", ASK);
        }
    }

    // --- payment ---------------------------------------------------------------------------

    function test_PaymentGuards() public {
        uint256 id = _weGroListing();
        uint256 o = _offer(sabbir, id, 1_000, ASK);
        vm.prank(accounts); // not approved yet
        vm.expectRevert(_wrongOffer(o, TradeLedger.OfferStatus.Pending));
        trade.confirmBuyerPayment(o, "REF");
        _approve(o);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, admin, ACCOUNTS_ROLE));
        trade.confirmBuyerPayment(o, "REF");
        vm.prank(accounts);
        vm.expectRevert(TradeLedger.ZeroValue.selector);
        trade.confirmBuyerPayment(o, bytes32(0));

        vm.prank(accounts);
        trade.confirmBuyerPayment(o, "REF");
        assertTrue(trade.paymentRefUsed("REF"));
        assertEq(trade.getOffer(o).paymentRefHash, bytes32("REF"));
        assertEq(trade.getListing(id).unpaidDeals, 0);

        uint256 o2 = _offer(mitu, id, 1_000, ASK);
        _approve(o2);
        vm.prank(accounts);
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.PaymentRefAlreadyUsed.selector, bytes32("REF")));
        trade.confirmBuyerPayment(o2, "REF");
    }

    // --- delivery --------------------------------------------------------------------------

    function test_NoDeliveryBeforePayment() public {
        uint256 id = _weGroListing();
        uint256 o = _offer(sabbir, id, 1_000, ASK);
        _approve(o);
        vm.prank(habib);
        vm.expectRevert(_wrongOffer(o, TradeLedger.OfferStatus.Approved));
        trade.confirmDelivery(o, 1_000, keccak256("q"));
    }

    function test_DeliveryParties() public {
        uint256 id = _weGroListing();
        uint256 o = _offer(sabbir, id, 1_000, ASK);
        _approve(o);
        _pay(o);
        address[4] memory others = [dalia, mitu, imran, admin]; // other site, other buyer, officer, admin
        for (uint256 i = 0; i < others.length; i++) {
            vm.prank(others[i]);
            vm.expectRevert(abi.encodeWithSelector(TradeLedger.NotAuthorized.selector, others[i]));
            trade.confirmDelivery(o, 1_000, keccak256("q"));
        }
    }

    function test_EachSideConfirmsOnceAndDifferencesAreKept() public {
        uint256 id = _weGroListing();
        uint256 o = _offer(sabbir, id, 2_000, ASK);
        _approve(o);
        _pay(o);

        vm.startPrank(habib);
        vm.expectRevert(TradeLedger.ZeroValue.selector);
        trade.confirmDelivery(o, 0, keccak256("q"));
        vm.expectRevert(TradeLedger.ZeroValue.selector);
        trade.confirmDelivery(o, 2_000, bytes32(0));
        trade.confirmDelivery(o, 2_000, keccak256("q"));
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.AlreadyConfirmed.selector, o));
        trade.confirmDelivery(o, 2_000, keccak256("q"));
        vm.stopPrank();

        vm.prank(sabbir);
        trade.confirmDelivery(o, 1_950, keccak256("50 kg short"));
        TradeLedger.Delivery memory d = trade.getDelivery(o);
        assertEq(d.buyerQuantity, 1_950);
        assertEq(d.handlerQuantity, 2_000);
        assertEq(trade.saleIncome(MAIZE), 60_000 * TK); // agreed amount; shortfall settled by Accounts

        vm.prank(sabbir);
        vm.expectRevert(_wrongOffer(o, TradeLedger.OfferStatus.Delivered));
        trade.confirmDelivery(o, 1, keccak256("q"));
    }

    function test_BuyerFirstThenHandler() public {
        uint256 id = _weGroListing();
        uint256 o = _offer(sabbir, id, 1_000, ASK);
        _approve(o);
        _pay(o);
        vm.startPrank(sabbir);
        trade.confirmDelivery(o, 1_000, keccak256("q"));
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.AlreadyConfirmed.selector, o));
        trade.confirmDelivery(o, 1_000, keccak256("q"));
        vm.stopPrank();
        vm.prank(habib);
        trade.confirmDelivery(o, 1_000, keccak256("q"));
        assertEq(_offerStatus(o), uint8(TradeLedger.OfferStatus.Delivered));
    }

    function test_BuyerRequests() public {
        uint64 until = uint64(block.timestamp + 30 days);
        vm.expectEmit(address(trade));
        emit TradeLedger.RequestPosted(1, SABBIR, "MAIZE", 20_000, "A", 32 * TK, until);
        vm.prank(sabbir);
        uint256 id = trade.postRequest("MAIZE", 20_000, "A", 32 * TK, until);

        assertTrue(trade.isRequestOpen(id));
        assertEq(trade.getRequest(id).buyerId, SABBIR);

        vm.prank(mitu);
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.NotAuthorized.selector, mitu));
        trade.cancelRequest(id);

        vm.prank(sabbir);
        trade.cancelRequest(id);
        assertFalse(trade.isRequestOpen(id));
        vm.prank(sabbir);
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.RequestClosed.selector, id));
        trade.cancelRequest(id);
    }

    function test_RequestExpires() public {
        vm.prank(sabbir);
        uint256 id = trade.postRequest("MAIZE", 1, bytes32(0), 1, uint64(block.timestamp + 1 days));
        vm.warp(block.timestamp + 1 days);
        assertFalse(trade.isRequestOpen(id));
        assertFalse(trade.isRequestOpen(99));
    }

    function test_RequestGuards() public {
        uint64 until = uint64(block.timestamp + 1 days);
        vm.startPrank(sabbir);
        vm.expectRevert(TradeLedger.ZeroValue.selector);
        trade.postRequest(bytes32(0), 1, "A", 1, until);
        vm.expectRevert(TradeLedger.ZeroValue.selector);
        trade.postRequest("MAIZE", 0, "A", 1, until);
        vm.expectRevert(TradeLedger.ZeroValue.selector);
        trade.postRequest("MAIZE", 1, "A", 0, until);
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.InvalidValidUntil.selector, block.timestamp));
        trade.postRequest("MAIZE", 1, "A", 1, uint64(block.timestamp));
        vm.expectRevert(abi.encodeWithSelector(TradeLedger.RequestNotFound.selector, 7));
        trade.cancelRequest(7);
        vm.stopPrank();

        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, imran, BUYER));
        trade.postRequest("MAIZE", 1, "A", 1, until);
    }

    // --- invariant-style fuzz ----------------------------------------------------------------

    /// available + reserved-or-sold always equals the listed quantity, and the receipt shrinks only on payment.
    function testFuzz_PartialAccounting(uint256 a, uint256 b, bool payA, bool cancelB) public {
        uint256 id = _weGroListing();
        a = bound(a, 1, 5_000);
        b = bound(b, 1, 5_000);

        uint256 oa = _offer(sabbir, id, a, ASK);
        _approve(oa);
        if (b > 5_000 - a) {
            vm.prank(mitu);
            vm.expectRevert(abi.encodeWithSelector(TradeLedger.ExceedsAvailable.selector, b, 5_000 - a));
            trade.makeOffer(id, b, ASK);
            return;
        }
        uint256 ob = _offer(mitu, id, b, ASK);
        _approve(ob);
        if (payA) _pay(oa);
        if (cancelB) {
            vm.prank(admin);
            trade.cancelDeal(ob);
        }

        TradeLedger.Listing memory l = trade.getListing(id);
        uint256 reserved = a + (cancelB ? 0 : b);
        assertEq(l.available + reserved, 5_000);
        assertEq(receipts.getReceipt(R1).quantity, 5_000 - (payA ? a : 0));
        assertEq(l.unpaidDeals, (payA ? 0 : 1) + (cancelB ? 0 : 1));
    }
}

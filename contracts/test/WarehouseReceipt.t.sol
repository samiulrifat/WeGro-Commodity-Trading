// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AccessRegistry} from "../contracts/access/AccessRegistry.sol";
import {AccessGuarded} from "../contracts/access/AccessGuarded.sol";
import {ProjectLedger} from "../contracts/projects/ProjectLedger.sol";
import {WarehouseReceipt} from "../contracts/warehouse/WarehouseReceipt.sol";

contract WarehouseReceiptTest is Test {
    AccessRegistry registry;
    ProjectLedger ledger;
    WarehouseReceipt receipts;

    address superAdmin = makeAddr("superAdmin");
    address admin = makeAddr("tania");
    address imran = makeAddr("imran"); // Rahim's field officer
    address sumon = makeAddr("sumon"); // another field officer
    address accounts = makeAddr("farhana");
    address rahim = makeAddr("rahim");
    address nasrin = makeAddr("nasrin");
    address habib = makeAddr("habib"); // operator, Bogura site
    address rafiq = makeAddr("rafiq"); // operator, Bogura site
    address dalia = makeAddr("dalia"); // operator, Dhaka site
    address floating = makeAddr("floating"); // operator with no site
    address sabbir = makeAddr("sabbir"); // buyer
    address mitu = makeAddr("mitu"); // buyer
    address trade = makeAddr("tradeLedger"); // stands in for TradeLedger

    uint256 constant TK = 100;

    bytes32 constant RAHIM = keccak256("FARMER-0001");
    bytes32 constant NASRIN = keccak256("INVESTOR-0001");
    bytes32 constant HABIB = keccak256("WAREHOUSE-0001");
    bytes32 constant RAFIQ = keccak256("WAREHOUSE-0002");
    bytes32 constant DALIA = keccak256("WAREHOUSE-0003");
    bytes32 constant FLOATING = keccak256("WAREHOUSE-0004");
    bytes32 constant SABBIR = keccak256("BUYER-0001");
    bytes32 constant MITU = keccak256("BUYER-0002");

    bytes32 constant BOGURA = "WH-BOGURA-01";
    bytes32 constant DHAKA = "WH-DHAKA-02";
    bytes32 constant MAIZE = keccak256("PRJ-MAIZE-BOGURA-01");
    bytes32 constant ONION = keccak256("PRJ-ONION-PABNA-01");
    bytes32 constant R1 = "RCPT-0001";

    bytes32 WEGRO;
    bytes32 ADMIN;
    bytes32 WAREHOUSE;
    uint256 refCount;

    function setUp() public {
        vm.warp(1_780_000_000);
        registry = new AccessRegistry(superAdmin);
        ledger = new ProjectLedger(registry, 120 hours);
        receipts = new WarehouseReceipt(registry, ledger);
        WEGRO = receipts.WEGRO();
        ADMIN = registry.ADMIN_ROLE();
        WAREHOUSE = registry.WAREHOUSE_ROLE();

        vm.startPrank(superAdmin);
        _person(keccak256("STAFF-ADMIN"), ADMIN, admin);
        _person(keccak256("STAFF-OFFICER-1"), registry.FIELD_OFFICER_ROLE(), imran);
        _person(keccak256("STAFF-OFFICER-2"), registry.FIELD_OFFICER_ROLE(), sumon);
        _person(keccak256("STAFF-ACCOUNTS"), registry.ACCOUNTS_ROLE(), accounts);
        receipts.setLinkedContract(trade, true);
        vm.stopPrank();

        bytes32 farmerRole = registry.FARMER_ROLE();
        vm.prank(imran);
        registry.registerParticipant(RAHIM, farmerRole, rahim, keccak256("rahim"));

        vm.startPrank(admin);
        registry.verifyParticipant(RAHIM);
        _person(NASRIN, registry.INVESTOR_ROLE(), nasrin);
        _person(HABIB, WAREHOUSE, habib);
        _person(RAFIQ, WAREHOUSE, rafiq);
        _person(DALIA, WAREHOUSE, dalia);
        _person(FLOATING, WAREHOUSE, floating);
        _person(SABBIR, registry.BUYER_ROLE(), sabbir);
        _person(MITU, registry.BUYER_ROLE(), mitu);

        receipts.registerSite(BOGURA, keccak256("bogura licensed warehouse"));
        receipts.registerSite(DHAKA, keccak256("dhaka warehouse"));
        receipts.assignOperator(HABIB, BOGURA);
        receipts.assignOperator(RAFIQ, BOGURA);
        receipts.assignOperator(DALIA, DHAKA);
        vm.stopPrank();

        _activeProject(MAIZE, "MAIZE", ProjectLedger.ProduceCategory.StorableCrop);
        _activeProject(ONION, "ONION", ProjectLedger.ProduceCategory.Perishable);
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

    /// Habib stores 5,000 kg of grade-A maize for 6 months.
    function _issue(bytes32 id) internal {
        vm.prank(habib);
        receipts.issueReceipt(id, MAIZE, "MAIZE", 5_000, "A", uint64(block.timestamp + 180 days), keccak256("intake"));
    }

    /// Imran offers Rahim's receipt to WeGro and Tania accepts.
    function _buyBack(bytes32 id) internal {
        vm.prank(imran);
        receipts.offerHandover(id, WEGRO);
        vm.prank(admin);
        receipts.acceptHandover(id);
    }

    function _status(bytes32 id) internal view returns (uint8) {
        return uint8(receipts.getReceipt(id).status);
    }

    function _err(bytes32 id, WarehouseReceipt.Status s) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(WarehouseReceipt.WrongStatus.selector, id, s);
    }

    // --- setup -------------------------------------------------------------------

    function test_ConstructorRejectsZeroLedger() public {
        vm.expectRevert(WarehouseReceipt.ZeroProjectLedger.selector);
        new WarehouseReceipt(registry, ProjectLedger(address(0)));
    }

    function test_SitesAndOperators() public view {
        assertEq(receipts.siteDetails(BOGURA), keccak256("bogura licensed warehouse"));
        assertEq(receipts.siteOf(HABIB), BOGURA);
        assertEq(receipts.siteOf(DALIA), DHAKA);
        assertEq(receipts.siteOf(FLOATING), bytes32(0));
    }

    function test_SiteGuards() public {
        vm.startPrank(admin);
        vm.expectRevert(WarehouseReceipt.ZeroValue.selector);
        receipts.registerSite(bytes32(0), keccak256("x"));
        vm.expectRevert(WarehouseReceipt.ZeroValue.selector);
        receipts.registerSite("WH-NEW", bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.SiteExists.selector, BOGURA));
        receipts.registerSite(BOGURA, keccak256("x"));

        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.SiteNotFound.selector, bytes32("WH-NONE")));
        receipts.assignOperator(FLOATING, "WH-NONE");
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.NotAWarehouseOperator.selector, SABBIR));
        receipts.assignOperator(SABBIR, BOGURA);

        receipts.assignOperator(RAFIQ, bytes32(0)); // removes Rafiq from the site
        assertEq(receipts.siteOf(RAFIQ), bytes32(0));
        vm.stopPrank();

        vm.prank(habib);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, habib, ADMIN));
        receipts.registerSite("WH-NEW", keccak256("x"));
    }

    function test_OnlySuperAdminLinksContracts() public {
        bytes32 superRole = registry.DEFAULT_ADMIN_ROLE();
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, admin, superRole));
        receipts.setLinkedContract(admin, true);

        vm.startPrank(superAdmin);
        vm.expectRevert(WarehouseReceipt.ZeroValue.selector);
        receipts.setLinkedContract(address(0), true);
        receipts.setLinkedContract(trade, false);
        vm.stopPrank();
        assertFalse(receipts.isLinkedContract(trade));
    }

    // --- issuing -------------------------------------------------------------------

    function test_IssueReceiptToFarmer() public {
        uint64 expiry = uint64(block.timestamp + 180 days);
        vm.expectEmit(address(receipts));
        emit WarehouseReceipt.ReceiptIssued(R1, MAIZE, BOGURA, RAHIM, "MAIZE", 5_000, "A", expiry, keccak256("intake"), HABIB);
        _issue(R1);

        WarehouseReceipt.Receipt memory r = receipts.getReceipt(R1);
        assertEq(r.owner, RAHIM);
        assertEq(r.siteId, BOGURA);
        assertEq(r.quantity, 5_000);
        assertEq(r.grade, bytes32("A"));
        assertEq(r.issuedAt, block.timestamp);
        assertEq(uint8(r.status), uint8(WarehouseReceipt.Status.Issued));
        assertEq(receipts.ownerOf(R1), RAHIM);
    }

    function test_IssueGuards() public {
        uint64 expiry = uint64(block.timestamp + 180 days);
        vm.startPrank(habib);
        vm.expectRevert(WarehouseReceipt.ZeroValue.selector);
        receipts.issueReceipt(bytes32(0), MAIZE, "MAIZE", 1, "A", expiry, keccak256("x"));
        vm.expectRevert(WarehouseReceipt.ZeroValue.selector);
        receipts.issueReceipt(R1, MAIZE, "MAIZE", 0, "A", expiry, keccak256("x"));
        vm.expectRevert(WarehouseReceipt.ZeroValue.selector);
        receipts.issueReceipt(R1, MAIZE, "MAIZE", 1, bytes32(0), expiry, keccak256("x"));
        vm.expectRevert(WarehouseReceipt.ZeroValue.selector);
        receipts.issueReceipt(R1, MAIZE, "MAIZE", 1, "A", expiry, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.InvalidExpiry.selector, block.timestamp));
        receipts.issueReceipt(R1, MAIZE, "MAIZE", 1, "A", uint64(block.timestamp), keccak256("x"));
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.ProduceMismatch.selector, bytes32("MAIZE"), bytes32("RICE")));
        receipts.issueReceipt(R1, MAIZE, "RICE", 1, "A", expiry, keccak256("x"));
        vm.stopPrank();

        _issue(R1);
        vm.prank(habib);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.ReceiptExists.selector, R1));
        receipts.issueReceipt(R1, MAIZE, "MAIZE", 1, "A", expiry, keccak256("x"));
    }

    function test_OnlySiteOperatorsIssue() public {
        uint64 expiry = uint64(block.timestamp + 180 days);
        vm.prank(floating);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.NotSiteOperator.selector, floating));
        receipts.issueReceipt(R1, MAIZE, "MAIZE", 1, "A", expiry, keccak256("x"));

        vm.prank(rahim);
        vm.expectRevert(abi.encodeWithSelector(AccessGuarded.MissingRole.selector, rahim, WAREHOUSE));
        receipts.issueReceipt(R1, MAIZE, "MAIZE", 1, "A", expiry, keccak256("x"));
    }

    function test_NoReceiptForPerishables() public {
        vm.prank(habib);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.NotStorable.selector, ONION));
        receipts.issueReceipt(R1, ONION, "ONION", 1, "A", uint64(block.timestamp + 30 days), keccak256("x"));
    }

    function test_IssueOnlyOnActiveProject() public {
        vm.prank(admin);
        ledger.markReadyForSale(MAIZE);
        vm.prank(habib);
        vm.expectRevert(
            abi.encodeWithSelector(WarehouseReceipt.WrongProjectStage.selector, MAIZE, ProjectLedger.Stage.ReadyForSale)
        );
        receipts.issueReceipt(R1, MAIZE, "MAIZE", 1, "A", uint64(block.timestamp + 1 days), keccak256("x"));
    }

    // --- buy-back (Stage 5) -------------------------------------------------------------

    function test_BuyBackToWeGro() public {
        _issue(R1);
        vm.expectEmit(address(receipts));
        emit WarehouseReceipt.HandoverOffered(R1, RAHIM, WEGRO, imran);
        vm.prank(imran);
        receipts.offerHandover(R1, WEGRO);

        // Still Rahim's until WeGro accepts.
        assertEq(receipts.ownerOf(R1), RAHIM);
        assertEq(_status(R1), uint8(WarehouseReceipt.Status.PendingHandover));

        vm.expectEmit(address(receipts));
        emit WarehouseReceipt.ReceiptTransferred(R1, RAHIM, WEGRO, admin);
        vm.prank(admin);
        receipts.acceptHandover(R1);

        assertEq(receipts.ownerOf(R1), WEGRO);
        assertEq(_status(R1), uint8(WarehouseReceipt.Status.Issued));
        assertEq(receipts.getReceipt(R1).pendingTo, bytes32(0));
    }

    function test_FarmerCannotResellAfterBuyBack() public {
        _issue(R1);
        _buyBack(R1);
        // Rahim's officer no longer speaks for the receipt.
        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.NotAuthorized.selector, imran));
        receipts.offerHandover(R1, SABBIR);
    }

    function test_OnlyFarmersOfficerOffers() public {
        _issue(R1);
        address[4] memory others = [rahim, sumon, admin, habib];
        for (uint256 i = 0; i < others.length; i++) {
            vm.prank(others[i]);
            vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.NotAuthorized.selector, others[i]));
            receipts.offerHandover(R1, WEGRO);
        }
    }

    function test_OnlyAdminAcceptsForWeGro() public {
        _issue(R1);
        vm.prank(imran);
        receipts.offerHandover(R1, WEGRO);
        address[3] memory others = [imran, sabbir, accounts];
        for (uint256 i = 0; i < others.length; i++) {
            vm.prank(others[i]);
            vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.NotAuthorized.selector, others[i]));
            receipts.acceptHandover(R1);
        }
    }

    // --- handover goes only to WeGro ------------------------------------------------------

    function test_OnlyWeGroCanReceiveHandover() public {
        _issue(R1);
        vm.startPrank(imran);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.InvalidRecipient.selector, SABBIR));
        receipts.offerHandover(R1, SABBIR); // buyers get receipts only through a sale
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.InvalidRecipient.selector, RAHIM));
        receipts.offerHandover(R1, RAHIM);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.InvalidRecipient.selector, NASRIN));
        receipts.offerHandover(R1, NASRIN);
        vm.stopPrank();

        _buyBack(R1);
        vm.prank(admin); // WeGro cannot hand it to itself
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.InvalidRecipient.selector, WEGRO));
        receipts.offerHandover(R1, WEGRO);
    }

    function test_IsOwnerSide() public view {
        assertTrue(receipts.isOwnerSide(RAHIM, imran));
        assertFalse(receipts.isOwnerSide(RAHIM, sumon));
        assertFalse(receipts.isOwnerSide(RAHIM, rahim));
        assertTrue(receipts.isOwnerSide(WEGRO, admin));
        assertFalse(receipts.isOwnerSide(WEGRO, imran));
        assertFalse(receipts.isOwnerSide(SABBIR, sabbir));
    }

    // --- cancelling handovers ---------------------------------------------------------------

    function test_OwnerSideWithdrawsOffer() public {
        _issue(R1);
        vm.prank(imran);
        receipts.offerHandover(R1, WEGRO);
        vm.expectEmit(address(receipts));
        emit WarehouseReceipt.HandoverCancelled(R1, imran);
        vm.prank(imran);
        receipts.cancelHandover(R1);

        assertEq(_status(R1), uint8(WarehouseReceipt.Status.Issued));
        assertEq(receipts.getReceipt(R1).pendingTo, bytes32(0));
        assertEq(receipts.ownerOf(R1), RAHIM);
    }

    function test_AdminDeclinesBuyBack() public {
        _issue(R1);
        vm.prank(imran);
        receipts.offerHandover(R1, WEGRO);
        vm.prank(admin);
        receipts.cancelHandover(R1);
        assertEq(_status(R1), uint8(WarehouseReceipt.Status.Issued));
        assertEq(receipts.ownerOf(R1), RAHIM);
    }

    function test_CancelHandoverGuards() public {
        _issue(R1);
        vm.prank(imran);
        vm.expectRevert(_err(R1, WarehouseReceipt.Status.Issued));
        receipts.cancelHandover(R1);

        vm.prank(imran);
        receipts.offerHandover(R1, WEGRO);
        vm.prank(sumon);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.NotAuthorized.selector, sumon));
        receipts.cancelHandover(R1);

        vm.prank(imran); // a second offer while one is pending
        vm.expectRevert(_err(R1, WarehouseReceipt.Status.PendingHandover));
        receipts.offerHandover(R1, WEGRO);
    }

    function test_AcceptGuards() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.ReceiptNotFound.selector, R1));
        receipts.acceptHandover(R1);

        _issue(R1);
        vm.prank(admin);
        vm.expectRevert(_err(R1, WarehouseReceipt.Status.Issued));
        receipts.acceptHandover(R1);
    }

    // --- expiry -----------------------------------------------------------------------------

    function test_ExpiredReceiptCannotMove() public {
        _issue(R1);
        vm.prank(imran);
        receipts.offerHandover(R1, WEGRO);
        vm.warp(receipts.getReceipt(R1).expiresAt);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.ReceiptExpired.selector, R1));
        receipts.acceptHandover(R1);

        vm.prank(imran);
        receipts.cancelHandover(R1);
        vm.prank(imran);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.ReceiptExpired.selector, R1));
        receipts.offerHandover(R1, WEGRO);
        vm.prank(trade);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.ReceiptExpired.selector, R1));
        receipts.setListed(R1, true);

        // Still collectable.
        vm.prank(habib);
        receipts.markCollected(R1);
        assertEq(_status(R1), uint8(WarehouseReceipt.Status.Collected));
    }

    function test_SiteExtendsExpiryAfterRecheck() public {
        _issue(R1);
        uint64 later = uint64(block.timestamp + 365 days);
        vm.expectEmit(address(receipts));
        emit WarehouseReceipt.ExpiryExtended(R1, later, keccak256("recheck"), RAFIQ);
        vm.prank(rafiq); // a colleague at the same site
        receipts.extendExpiry(R1, later, keccak256("recheck"));
        assertEq(receipts.getReceipt(R1).expiresAt, later);

        vm.warp(block.timestamp + 200 days); // past the original expiry
        _buyBack(R1);
        assertEq(receipts.ownerOf(R1), WEGRO);
    }

    function test_ExtendExpiryGuards() public {
        _issue(R1);
        uint64 current = receipts.getReceipt(R1).expiresAt;

        vm.prank(dalia); // other site
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.NotSiteOperator.selector, dalia));
        receipts.extendExpiry(R1, current + 1, keccak256("x"));

        vm.startPrank(habib);
        vm.expectRevert(WarehouseReceipt.ZeroValue.selector);
        receipts.extendExpiry(R1, current + 1, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.InvalidExpiry.selector, current));
        receipts.extendExpiry(R1, current, keccak256("x"));
        vm.warp(current + 10);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.InvalidExpiry.selector, current + 5));
        receipts.extendExpiry(R1, current + 5, keccak256("x")); // already in the past
        receipts.markCollected(R1);
        vm.expectRevert(_err(R1, WarehouseReceipt.Status.Collected));
        receipts.extendExpiry(R1, current + 1 days, keccak256("x"));
        vm.stopPrank();
    }

    // --- listing and sale (TradeLedger hooks) -------------------------------------------------

    function test_ListedReceiptIsLocked() public {
        _issue(R1);
        _buyBack(R1);
        vm.expectEmit(address(receipts));
        emit WarehouseReceipt.ReceiptListed(R1, true);
        vm.prank(trade);
        receipts.setListed(R1, true);
        assertEq(_status(R1), uint8(WarehouseReceipt.Status.Listed));

        vm.prank(admin);
        vm.expectRevert(_err(R1, WarehouseReceipt.Status.Listed));
        receipts.offerHandover(R1, SABBIR);
        vm.prank(trade);
        vm.expectRevert(_err(R1, WarehouseReceipt.Status.Listed));
        receipts.setListed(R1, true); // cannot be listed twice
        vm.prank(habib);
        vm.expectRevert(_err(R1, WarehouseReceipt.Status.Listed));
        receipts.markCollected(R1);

        vm.prank(trade);
        receipts.setListed(R1, false); // listing withdrawn
        assertEq(_status(R1), uint8(WarehouseReceipt.Status.Issued));
    }

    function test_PartialSaleSplitsReceipt() public {
        _issue(R1);
        _buyBack(R1);
        vm.prank(trade);
        receipts.setListed(R1, true);

        bytes32 expectedChild = keccak256(abi.encode(R1, uint256(1)));
        vm.expectEmit(address(receipts));
        emit WarehouseReceipt.ReceiptSplit(R1, expectedChild, SABBIR, 2_000);
        vm.prank(trade);
        bytes32 child = receipts.sellPart(R1, 2_000, SABBIR);
        assertEq(child, expectedChild);

        WarehouseReceipt.Receipt memory c = receipts.getReceipt(child);
        assertEq(c.owner, SABBIR);
        assertEq(c.quantity, 2_000);
        assertEq(c.parentId, R1);
        assertEq(c.siteId, BOGURA);
        assertEq(c.grade, bytes32("A"));
        assertEq(uint8(c.status), uint8(WarehouseReceipt.Status.Sold));

        // The parent keeps the rest, still WeGro's and still listed.
        WarehouseReceipt.Receipt memory p = receipts.getReceipt(R1);
        assertEq(p.quantity, 3_000);
        assertEq(p.owner, WEGRO);
        assertEq(uint8(p.status), uint8(WarehouseReceipt.Status.Listed));
        assertEq(receipts.splitCount(R1), 1);
    }

    function test_SellingEverythingSoldOut() public {
        _issue(R1);
        _buyBack(R1);
        vm.startPrank(trade);
        receipts.setListed(R1, true);
        receipts.sellPart(R1, 2_000, SABBIR);
        bytes32 last = receipts.sellPart(R1, 3_000, MITU);
        vm.stopPrank();

        assertEq(receipts.getReceipt(R1).quantity, 0);
        assertEq(_status(R1), uint8(WarehouseReceipt.Status.SoldOut));
        assertEq(receipts.ownerOf(last), MITU);

        vm.prank(trade); // nothing left to relist
        vm.expectRevert(_err(R1, WarehouseReceipt.Status.SoldOut));
        receipts.setListed(R1, true);
        vm.prank(habib); // or to extend
        vm.expectRevert(_err(R1, WarehouseReceipt.Status.SoldOut));
        receipts.extendExpiry(R1, uint64(block.timestamp + 400 days), keccak256("x"));
    }

    function test_OpenReceiptsCountStoredCrop() public {
        bytes32 r2 = "RCPT-0002";
        _issue(R1);
        _issue(r2);
        assertEq(receipts.openReceipts(MAIZE), 2);

        vm.prank(habib); // R1 taken out unsold
        receipts.markCollected(R1);
        assertEq(receipts.openReceipts(MAIZE), 1);

        vm.startPrank(trade); // R2 sold in two parts
        receipts.setListed(r2, true);
        receipts.sellPart(r2, 2_000, SABBIR);
        assertEq(receipts.openReceipts(MAIZE), 1); // 3,000 kg still stored
        receipts.sellPart(r2, 3_000, MITU);
        vm.stopPrank();
        assertEq(receipts.openReceipts(MAIZE), 0); // split-off buyer receipts don't count
    }

    function test_SoldPartIsCollectedThroughTrade() public {
        _issue(R1);
        _buyBack(R1);
        vm.startPrank(trade);
        receipts.setListed(R1, true);
        bytes32 child = receipts.sellPart(R1, 2_000, SABBIR);
        vm.stopPrank();

        // Sold: no handover, no relisting, no direct collection by the operator.
        vm.prank(sabbir);
        vm.expectRevert(_err(child, WarehouseReceipt.Status.Sold));
        receipts.offerHandover(child, WEGRO);
        vm.prank(trade);
        vm.expectRevert(_err(child, WarehouseReceipt.Status.Sold));
        receipts.setListed(child, true);
        vm.prank(habib);
        vm.expectRevert(_err(child, WarehouseReceipt.Status.Sold));
        receipts.markCollected(child);

        vm.expectEmit(address(receipts));
        emit WarehouseReceipt.ReceiptCollected(child, HABIB);
        vm.prank(trade);
        receipts.collectSold(child, HABIB);
        assertEq(_status(child), uint8(WarehouseReceipt.Status.Collected));
    }

    function test_UnsoldRemainderReturnsToOwner() public {
        _issue(R1);
        vm.startPrank(trade);
        receipts.setListed(R1, true);
        receipts.sellPart(R1, 1_500, SABBIR);
        receipts.setListed(R1, false); // listing cancelled
        vm.stopPrank();

        WarehouseReceipt.Receipt memory p = receipts.getReceipt(R1);
        assertEq(p.owner, RAHIM);
        assertEq(p.quantity, 3_500);
        assertEq(uint8(p.status), uint8(WarehouseReceipt.Status.Issued));
        vm.prank(habib); // Rahim can take the rest out of the warehouse
        receipts.markCollected(R1);
    }

    function test_CollectSoldGuards() public {
        _issue(R1);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.NotAuthorized.selector, admin));
        receipts.collectSold(R1, HABIB);
        vm.prank(trade);
        vm.expectRevert(_err(R1, WarehouseReceipt.Status.Issued));
        receipts.collectSold(R1, HABIB); // not sold
    }

    function test_SaleHookGuards() public {
        _issue(R1);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.NotAuthorized.selector, admin));
        receipts.setListed(R1, true);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.NotAuthorized.selector, admin));
        receipts.sellPart(R1, 1, SABBIR);

        vm.startPrank(trade);
        vm.expectRevert(_err(R1, WarehouseReceipt.Status.Issued));
        receipts.setListed(R1, false); // not listed
        vm.expectRevert(_err(R1, WarehouseReceipt.Status.Issued));
        receipts.sellPart(R1, 1, SABBIR); // must be listed first

        receipts.setListed(R1, true);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.InvalidRecipient.selector, bytes32(0)));
        receipts.sellPart(R1, 1, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.InvalidRecipient.selector, RAHIM));
        receipts.sellPart(R1, 1, RAHIM); // current owner
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.InvalidQuantity.selector, 0, 5_000));
        receipts.sellPart(R1, 0, SABBIR);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.InvalidQuantity.selector, 5_001, 5_000));
        receipts.sellPart(R1, 5_001, SABBIR);
        vm.stopPrank();
    }

    // --- collection --------------------------------------------------------------------------

    function test_CollectionIsFinal() public {
        _issue(R1);
        vm.prank(rafiq);
        receipts.markCollected(R1);

        vm.prank(habib);
        vm.expectRevert(_err(R1, WarehouseReceipt.Status.Collected));
        receipts.markCollected(R1);
        vm.prank(imran);
        vm.expectRevert(_err(R1, WarehouseReceipt.Status.Collected));
        receipts.offerHandover(R1, WEGRO);
        vm.prank(trade);
        vm.expectRevert(_err(R1, WarehouseReceipt.Status.Collected));
        receipts.setListed(R1, true);
    }

    function test_OnlyIssuingSiteCollects() public {
        _issue(R1);
        address[3] memory others = [dalia, floating, admin];
        for (uint256 i = 0; i < others.length; i++) {
            vm.prank(others[i]);
            vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.NotSiteOperator.selector, others[i]));
            receipts.markCollected(R1);
        }

        vm.prank(imran);
        receipts.offerHandover(R1, WEGRO);
        vm.prank(habib); // pending handover blocks collection
        vm.expectRevert(_err(R1, WarehouseReceipt.Status.PendingHandover));
        receipts.markCollected(R1);
    }

    function test_RemovedOperatorLosesAccess() public {
        _issue(R1);
        vm.prank(admin);
        receipts.assignOperator(HABIB, DHAKA); // Habib moves to Dhaka
        vm.prank(habib);
        vm.expectRevert(abi.encodeWithSelector(WarehouseReceipt.NotSiteOperator.selector, habib));
        receipts.markCollected(R1);
        vm.prank(rafiq);
        receipts.markCollected(R1);
    }
}

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Unpaid reservations hold slots for 7 days; unconfirmed voucher sales
// release their hold after 7 days too.
const SEVEN_DAYS = 7n * 24n * 60n * 60n;
// Approved deals the buyer has not paid for can be expired after 7 days.
const DEAL_TTL = SEVEN_DAYS;

export default buildModule("PlatformModule", (m) => {
  // The deploying account is the super admin; it also links the contracts.
  const superAdmin = m.getAccount(0);
  const reservationTtl = m.getParameter("reservationTtl", SEVEN_DAYS);
  const saleTtl = m.getParameter("saleTtl", SEVEN_DAYS);
  const dealTtl = m.getParameter("dealTtl", DEAL_TTL);

  const registry = m.contract("AccessRegistry", [superAdmin]);
  const projectLedger = m.contract("ProjectLedger", [registry, reservationTtl]);
  const voucherRegistry = m.contract("VoucherRegistry", [registry, projectLedger, saleTtl]);
  const fieldRecordLog = m.contract("FieldRecordLog", [registry, projectLedger]);
  const warehouseReceipt = m.contract("WarehouseReceipt", [registry, projectLedger]);
  const tradeLedger = m.contract("TradeLedger", [registry, projectLedger, warehouseReceipt, dealTtl]);
  const insuranceRegistry = m.contract("InsuranceRegistry", [registry, projectLedger]);
  const settlementLedger = m.contract("SettlementLedger", [
    registry,
    projectLedger,
    voucherRegistry,
    tradeLedger,
    insuranceRegistry,
    warehouseReceipt,
  ]);
  const consentRegistry = m.contract("ConsentRegistry", [registry, projectLedger]);

  // VoucherRegistry moves a project to Active on its first approved voucher.
  m.call(projectLedger, "setLinkedContract", [voucherRegistry, true], { from: superAdmin });

  // TradeLedger locks, sells and collects receipts.
  m.call(warehouseReceipt, "setLinkedContract", [tradeLedger, true], { from: superAdmin });
  // SettlementLedger marks a project PaidOut once its final payout is paid.
  m.call(projectLedger, "setLinkedContract", [settlementLedger, true], {
    from: superAdmin,
    id: "linkSettlementLedger",
  });

  return {
    registry,
    projectLedger,
    voucherRegistry,
    fieldRecordLog,
    warehouseReceipt,
    tradeLedger,
    insuranceRegistry,
    settlementLedger,
    consentRegistry,
  };
});

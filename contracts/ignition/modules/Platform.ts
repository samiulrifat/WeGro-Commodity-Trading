import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Unpaid reservations hold slots for 5 days (120 hours).
const FIVE_DAYS = 120n * 60n * 60n;

export default buildModule("PlatformModule", (m) => {
  const superAdmin = m.getParameter("superAdmin", m.getAccount(0));
  const reservationTtl = m.getParameter("reservationTtl", FIVE_DAYS);

  const registry = m.contract("AccessRegistry", [superAdmin]);
  const projectLedger = m.contract("ProjectLedger", [registry, reservationTtl]);

  return { registry, projectLedger };
});

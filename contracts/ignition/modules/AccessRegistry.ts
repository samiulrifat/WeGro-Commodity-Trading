import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("AccessRegistryModule", (m) => {
  const superAdmin = m.getParameter("superAdmin", m.getAccount(0));
  const registry = m.contract("AccessRegistry", [superAdmin]);
  return { registry };
});

import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

// Pinned to "paris" (no PUSH0/MCOPY/transient storage) so the same bytecode
// runs on Hardhat and on a Besu network regardless of its fork schedule (NFR-9).
const EVM_VERSION = "paris";

/**
 * A little more than the sample data moves the clock forward (90 days and a
 * minute), so bookings and deals it leaves open do not expire on the last step.
 */
const DEV_CHAIN_HEAD_START_MS = (90 * 24 * 60 + 5) * 60 * 1000;
const DEV_CHAIN_BLOCK_MS = 5000;

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.34",
        settings: {
          evmVersion: EVM_VERSION,
        },
      },
      production: {
        version: "0.8.34",
        settings: {
          evmVersion: EVM_VERSION,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    // The dev chain: `npx hardhat node --network devChain`. Its clock follows
    // real time, a block a few seconds apart (Hardhat otherwise moves its
    // clock only when a block is made). It starts in the past so the sample
    // data, whose stories need 90 days on the ledger, can finish without
    // leaving it in the future; a data reset then brings it up to now.
    devChain: {
      type: "edr-simulated",
      chainType: "l1",
      initialDate: new Date(Date.now() - DEV_CHAIN_HEAD_START_MS),
      mining: { auto: true, interval: DEV_CHAIN_BLOCK_MS },
    },
    // A node started with `npx hardhat node` (chain id 31337), used by the backend.
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    // The backend's chain tests start their own node here, apart from the dev one.
    chainTests: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8546",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
});

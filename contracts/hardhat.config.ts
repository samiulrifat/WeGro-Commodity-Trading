import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

// Pinned to "paris" (no PUSH0/MCOPY/transient storage) so the same bytecode
// runs on Hardhat and on a Besu network regardless of its fork schedule (NFR-9).
const EVM_VERSION = "paris";

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

# Contracts

The ledger behind the WeGro platform: nine Solidity contracts that hold every business fact the backend records (who is registered in which role, projects and their stages, investments, vouchers, farm records, warehouse receipts, sales, insurance, payouts, and bank permissions). Personal details, notes and photos never go on-chain, only their fingerprints. No real money or cryptocurrency moves; amounts are taka in poisha.

- Solidity 0.8.34, compiled for the `paris` EVM so the same bytecode also runs on a Besu network
- Hardhat 3 with Ignition for deployment; tests are Solidity (Foundry-style `.t.sol`)
- OpenZeppelin for access control

## The contracts

| Contract | Holds |
|---|---|
| `AccessRegistry` | People: role, status (pending, verified, rejected), account and details fingerprint; field officers of farmers |
| `ProjectLedger` | Projects and their stages, slot reservations, confirmed investments and refunds |
| `VoucherRegistry` | Input vouchers, suppliers' input batches, and sales against vouchers |
| `FieldRecordLog` | Append-only farm records (fingerprints of the data and photo) |
| `WarehouseReceipt` | Warehouse sites and their operators, and one-of-a-kind receipts for stored produce |
| `TradeLedger` | Marketplace listings, offers, deals, buyer payment and delivery, buyer requests |
| `InsuranceRegistry` | Cover on insured projects, weather events, and claims |
| `SettlementLedger` | Project costs, staged and final payout rounds, and payment of each line |
| `ConsentRegistry` | Banks and their officers, farmers' track records, and bank permissions with every view logged |

`AccessGuarded` is the base each contract uses to check roles through `AccessRegistry`. `Roles` lists the twelve roles: investor, farmer, field officer, admin, accounts, operations, warehouse, bank, supplier, buyer, insurer and auditor. The deploying account holds the super admin role and registers staff.

## Commands

```bash
npm install
npx hardhat build                       # compile, and write TypeScript bindings to types/
npx hardhat test                        # every test
npx hardhat test solidity --coverage    # with line and statement coverage (currently 100%)
npx hardhat node                        # a local chain on http://127.0.0.1:8545 (chain id 31337)
npx hardhat ignition deploy ignition/modules/Platform.ts --network localhost
```

Add `--reset` to the deploy command to deploy again on a node that already has a deployment.

## Deployment

`ignition/modules/Platform.ts` deploys all nine contracts in order, passing each the addresses it depends on, and links the ones that act on each other:

- `VoucherRegistry` moves a project to active when its first voucher is approved.
- `SettlementLedger` marks a project paid out when its final payout is paid.
- `TradeLedger` locks, sells and collects warehouse receipts.

Three timeouts can be changed as Ignition parameters:

| Parameter | Default | Meaning |
|---|---|---|
| `reservationTtl` | 5 days | How long an unpaid reservation holds slots |
| `saleTtl` | 7 days | How long an unconfirmed voucher sale holds its quantity |
| `dealTtl` | 7 days | How long an approved deal waits for the buyer's payment |

The addresses land in `ignition/deployments/chain-31337/`, where the backend reads them (`CONTRACTS_DEPLOYMENT_DIR`). At startup the backend checks that each contract is there and linked, and refuses to run against a mismatched deployment.

Restarting the Hardhat node erases the chain, so deploy again afterwards. The backend's `npm run data:reset` does that, together with resetting the database.

## After changing a contract

```bash
npx hardhat test                                          # here
cd ../backend && npm run contracts:sync                   # rebuild and copy the bindings into the backend
cd ../contracts && npx hardhat ignition deploy ignition/modules/Platform.ts --network localhost --reset
```

Then reset the backend's data (`npm run data:reset -- --yes …` in `backend/`), since the old records refer to the old contracts.

## Other networks

The contracts target an EVM chain where blocks are final when mined (Hardhat locally; Besu is the intended private network). `hardhat.config.ts` still contains the `sepolia` network from the Hardhat template, and `.env.example` holds its two settings; the platform does not use it.

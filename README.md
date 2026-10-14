# Commodity Trading Platform (prototype)

A blockchain-backed agricultural investment and commodity trading platform, modelled on WeGro Global. Investors fund farming projects by buying slots. Farmers' field officers record inputs and farm updates, warehouses issue receipts for stored crops, and produce is sold on a marketplace. Profits are split and paid out, insurance covers weather damage, and banks may view a farmer's track record with permission. Every business fact is written to smart contracts, so any record can be checked against the ledger.

It uses made-up data only: no real money, no cryptocurrency.

| Folder | What | Stack |
|---|---|---|
| [`backend/`](backend/README.md) | REST API, ledger connection, event copy, background jobs, data tools | NestJS, TypeORM, PostgreSQL, ethers |
| [`contracts/`](contracts/README.md) | The nine ledger contracts and their tests | Solidity, Hardhat 3, OpenZeppelin |
| `frontend/` | Web app (not built yet: Vite starter) | React, Vite, Tailwind, shadcn/ui, i18next |

[`Technical_Report.pdf`](Technical_Report.pdf) explains how everything works, module by module.

## Quick start

Requires Node.js 22 or newer and PostgreSQL, installed directly (no Docker).

```bash
# 1. Database
sudo -u postgres psql -c "CREATE USER commodity_user WITH PASSWORD 'choose_a_password';"
sudo -u postgres psql -c "CREATE DATABASE commodity_db OWNER commodity_user;"

# 2. Dependencies
(cd contracts && npm install)
(cd backend && npm install)
(cd frontend && npm install)

# 3. Settings: copy, then fill in the database URL, the three secrets and the
#    key phrase, as described in backend/README.md
cp backend/.env.example backend/.env

# 4. Local chain (own terminal; leave it running)
cd contracts && npx hardhat node

# 5. Deploy, build the database, create the super admin, load sample data
cd backend && npm run data:reset -- --yes --name "Your Name" --phone 01711000000 --seed

# 6. Run
cd backend && npm run start:dev      # API on http://localhost:3000/api, docs on /docs
cd frontend && npm run dev           # http://localhost:5173
```

Signing in: step 5 writes every sample person's one-time password to `backend/sample-credentials-<time>.csv` (readable only by you, ignored by git). For quick demos, set `DEMO_MODE=true` in `backend/.env` as well; it adds one ready-made account per role with password-free sign-in.

## Tests

| Where | Command | Needs |
|---|---|---|
| contracts | `npx hardhat test` | nothing |
| backend | `npm test` (unit), `npm run test:e2e` (HTTP pipeline) | nothing |
| backend | `npm run test:chain` (every module end to end) | the local node with the contracts deployed, and the database |

## Where things are explained

- Setting up and running the backend, every setting, importing WeGro's records, sample data, resets, jobs, audits, troubleshooting: [backend/README.md](backend/README.md)
- The contracts, deploying them, and changing them: [contracts/README.md](contracts/README.md)
- Every API route with its request and response: the interactive docs at http://localhost:3000/docs while the backend runs
- Internals: [Technical_Report.pdf](Technical_Report.pdf)

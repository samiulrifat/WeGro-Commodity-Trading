# Commodity Trading Platform (prototype)

Blockchain-based commodity trading prototype modeled on WeGro Global. Uses made-up data only: no real money, no cryptocurrency. See the requirements PDF for the full spec.

| Folder | What | Stack |
|---|---|---|
| `backend/` | REST API, chain connection, event sync | NestJS, TypeORM, PostgreSQL, ethers |
| `contracts/` | Smart contracts and tests | Solidity, Hardhat 3, OpenZeppelin |
| `frontend/` | Web app | React, Vite, Tailwind, shadcn/ui, i18next |

## Setup

Requires Node 22+ and PostgreSQL (installed directly, no Docker).

```bash
sudo -u postgres psql -c "CREATE USER commodity_user WITH PASSWORD 'choose_a_password';"
sudo -u postgres psql -c "CREATE DATABASE commodity_db OWNER commodity_user;"

cp backend/.env.example backend/.env   # then edit the values
(cd backend && npm install)
(cd contracts && npm install)
(cd frontend && npm install)
```

## Common commands

```bash
cd backend   && npm run start:dev   # API on :3000
cd backend   && npm test
cd contracts && npx hardhat test
cd frontend  && npm run dev
```

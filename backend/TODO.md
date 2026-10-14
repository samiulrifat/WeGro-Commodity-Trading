# Backend build plan

NestJS, module-based MVC. Each business module holds its own:

- **Model**: TypeORM entities (the database's read copy and the data the ledger never sees) and the calls to its smart contract.
- **Controller**: the REST endpoints, with role guards and input validation.
- **View**: response DTOs that shape what the API returns (the React app renders it).
- **Service**: the business logic between them.

Module layout (matches WeGro's main codebase):

```
src/
  modules/
    projects/
      projects.module.ts
      projects.controller.ts
      projects.service.ts
      entities/project.entity.ts
      dto/create-project.dto.ts
      dto/project-response.dto.ts
  common/      guards, filters, pipes, interceptors
  config/      env schema and typed config
  blockchain/  contracts, keys, transactions, event indexer
```

Build in order: each phase depends on the ones above it.

## Phase 0: Foundation

- [x] 1. Config: `@nestjs/config` with a validated env schema; rewrite `.env.example` (database, JWT, chain RPC, master key seed, contract addresses)
- [x] 2. Database: TypeORM + PostgreSQL, migrations (no auto-sync), a base entity (uuid id, created/updated timestamps)
- [x] 3. Common layer: global validation pipe, error filter (turns contract reverts into clear HTTP errors), response envelope, pagination, logging with sensitive fields removed
- [x] 4. API docs: Swagger/OpenAPI at `/docs`
- [x] 5. Security basics: helmet, CORS, rate limiting

## Phase 1: Blockchain connection

- [x] 6. Contracts: load ABIs and deployed addresses from the `contracts` workspace
- [x] 7. Keys: derive each person's key from one master seed (an index per user), sign as that user, fund new keys with test currency on Hardhat
- [x] 8. Transactions: send as a user, queue per key (nonces), wait for the receipt, decode custom errors
- [x] 9. Shared helpers: fingerprints (canonical JSON hash), payment-reference hashing, bytes32 ids, taka to poisha conversion
- [x] 10. Event indexer: copy every contract event into the database, with a block checkpoint and a full replay for reset

## Phase 2: Identity

- [x] 11. Auth: users table (personal details stay here, encrypted), Argon2id passwords, JWT login with rotating refresh tokens, roles guard, demo mode with one account per role
- [x] 12. Participants (AccessRegistry): practice ID check (register, verify, reject), field officer assignment, key replacement

## Phase 3: Business modules

- [x] 13. Catalog: produce types and categories, units, input types, field-record types (the officer's dropdown); database only
- [x] 14. Projects (ProjectLedger): create, open, list and filter, reservations, payment confirmation, expiry, cancel and refunds, estimated return range, project timeline
- [x] 15. Vouchers (VoucherRegistry): propose, approve, reject, cancel; supplier batches with QR codes; sales, confirmation, expiry; per-voucher inactivity limit set by the super admin
- [x] 16. Field records (FieldRecordLog): offline sync that is safe to resend, photo upload to a local folder, fingerprints, verify
- [x] 17. Warehouse (WarehouseReceipt): sites and operators, issue receipts, buy-back handover, extend expiry, collect
- [x] 18. Marketplace (TradeLedger): listings, offers, approve or reject, cancel deals, buyer payment, delivery, buyer requests
- [x] 19. Insurance (InsuranceRegistry): cover set by the project's insurer, weather events, claims opened by the farmer's field officer (or an admin) citing a recorded event, claim review
- [x] 20. Settlement (SettlementLedger): costs with bills, prepare, approve (second Accounts person) or reject rounds, verified payout lines, payment references, payees' bank accounts (admin-verified), CSV reports, statements
- [x] 21. Track record (ConsentRegistry): banks and officers, summary built from finished projects, publish, grant (signed form, max 1 year) or revoke bank permission, logged and verified bank view

## Phase 4: Cross-cutting

- [x] 22. History and audit: full history per record from indexed events (with each transaction's sender), Verify per record and full sweep, append-only audit log of write requests, auditor read-only access
- [x] 23. Admin dashboard: funding progress, active projects, stages, role-tailored approval queues (count + oldest 5), all-time figures and 12-month trends (cached 60 s)
- [x] 24. Notifications: in-app reminders (deadlines 24 h before, voucher inactivity, receipt storage and bank permission 7 days before), action-needed and outcome notices from ledger events and bank details, inbox with unread count, kept forever
- [x] 25. Scheduled jobs: one scheduler for all jobs (expiries every minute, reminders every 5 minutes, env-tunable, backlogs cleared in one run), job status, history and run-now, indexer watchdog
- [x] 26. Data: CSV import of real WeGro data (people, catalog, live projects and investments, finished history; dry run by default, resumable), sample-data seeder (showcase or large, every story through the real services), local-only reset and reload

## Phase 5: Quality and handover

- [ ] 27. Tests: unit tests per service, end-to-end tests with Supertest against a local Hardhat node
- [ ] 28. Docs: setup notes and README

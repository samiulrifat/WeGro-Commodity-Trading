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

- [ ] 6. Contracts: load ABIs and deployed addresses from the `contracts` workspace
- [ ] 7. Keys: derive each person's key from one master seed (an index per user), sign as that user, fund new keys with test currency on Hardhat
- [ ] 8. Transactions: send as a user, queue per key (nonces), wait for the receipt, decode custom errors
- [ ] 9. Shared helpers: fingerprints (canonical JSON hash), payment-reference hashing, bytes32 ids, taka to poisha conversion
- [ ] 10. Event indexer: copy every contract event into the database, with a block checkpoint and a full replay for reset

## Phase 2: Identity

- [ ] 11. Auth: users table (personal details stay here), bcrypt passwords, JWT login, roles guard, demo mode with one account per role
- [ ] 12. Participants (AccessRegistry): practice ID check (register, verify, reject), field officer assignment, key replacement

## Phase 3: Business modules

- [ ] 13. Catalog: produce types and categories, units, input types, field-record types (the officer's dropdown); database only
- [ ] 14. Projects (ProjectLedger): create, open, list and filter, reservations, payment confirmation, expiry, cancel and refunds, estimated return range, project timeline
- [ ] 15. Vouchers (VoucherRegistry): propose, approve, reject, cancel; supplier batches with QR codes; sales, confirmation, expiry; 4-week inactivity reminder
- [ ] 16. Field records (FieldRecordLog): offline sync that is safe to resend, photo upload to a local folder, fingerprints, verify
- [ ] 17. Warehouse (WarehouseReceipt): sites and operators, issue receipts, buy-back handover, extend expiry, collect
- [ ] 18. Marketplace (TradeLedger): listings, offers, approve or reject, cancel deals, buyer payment, delivery, buyer requests
- [ ] 19. Insurance (InsuranceRegistry): cover, weather events (open claims on every insured project in the district), claim review
- [ ] 20. Settlement (SettlementLedger): costs, prepare, approve or reject rounds, payout lines, payment references, CSV reports, investor statements
- [ ] 21. Track record (ConsentRegistry): build the summary from finished projects, publish, grant or revoke bank permission, bank view

## Phase 4: Cross-cutting

- [ ] 22. History and audit: full history per record from indexed events, Verify endpoint, auditor read-only access
- [ ] 23. Admin dashboard: funding progress, active projects, approvals waiting
- [ ] 24. Notifications: in-app reminders (voucher inactivity, reservations about to expire)
- [ ] 25. Scheduled jobs: expire reservations and voucher sales, send reminders
- [ ] 26. Data: one ingestion entry point for real WeGro data later, a repeatable sample-data seeder, full reset and reload script

## Phase 5: Quality and handover

- [ ] 27. Tests: unit tests per service, end-to-end tests with Supertest against a local Hardhat node
- [ ] 28. Docs: setup notes and README

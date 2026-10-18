# Backend

The WeGro platform's API. It keeps the working data in PostgreSQL, writes every business fact to the smart contracts on the local chain, and copies the ledger's events back into the database so pages read fast and every record can be checked against the ledger.

- NestJS 11, TypeORM on PostgreSQL, ethers 6
- One custodial key per person, derived from one seed; the operator (key 0) is the super admin
- Money in poisha (whole numbers); payment references go to the ledger only as keyed hashes
- Prototype: made-up data, no real money

The [technical report](../Technical_Report.pdf) explains the internals module by module. This file covers setting the backend up and running it.

## Requirements

- Node.js 22 or newer (developed on 24)
- PostgreSQL (developed on 18), installed directly
- The contracts workspace next to this folder (`../contracts`), with its dependencies installed

## First-time setup

1. **Database.** Create a user and a database:

   ```bash
   sudo -u postgres psql -c "CREATE USER commodity_user WITH PASSWORD 'choose_a_password';"
   sudo -u postgres psql -c "CREATE DATABASE commodity_db OWNER commodity_user;"
   ```

2. **Settings.** Copy the example and fill in the four secrets:

   ```bash
   cp .env.example .env
   openssl rand -hex 32      # IDENTITY_MASTER_KEY
   openssl rand -base64 48   # JWT_SECRET
   openssl rand -base64 48   # PAYMENT_REF_SECRET
   ```

   Set `DATABASE_URL` to the database above. For local work, set `KEY_MASTER_MNEMONIC` to the phrase the Hardhat node's accounts come from, `test test test test test test test test test test test junk`. That phrase is public and only ever holds test currency, so never use it anywhere else. Keep a copy of `IDENTITY_MASTER_KEY`: without it, stored personal details cannot be read.

   The example file holds no usable values, and `.env` itself is ignored by git.

3. **Dependencies:** `npm install`

4. **Local chain.** In a separate terminal, start the node and leave it running:

   ```bash
   cd ../contracts && npx hardhat node
   ```

5. **Contracts, database and super admin in one step:**

   ```bash
   npm run data:reset -- --yes --name "Your Name" --phone 01711000000 --seed
   ```

   This deploys the contracts, builds the database schema, empties the photo folder, creates the super admin (you type the password twice), and loads the sample data, writing its people's one-time passwords to `sample-credentials-<time>.csv`. Leave out `--seed` for an empty platform. It works only against the local Hardhat chain and never in production.

   The same steps by hand:

   ```bash
   (cd ../contracts && npx hardhat ignition deploy ignition/modules/Platform.ts --network localhost)
   npm run migration:run
   npm run user:super-admin -- --name "Your Name" --phone 01711000000
   ```

6. **Start:** `npm run start:dev`

   | | |
   |---|---|
   | API | http://localhost:3000/api |
   | Interactive docs | http://localhost:3000/docs |
   | Health | http://localhost:3000/api/health |

   Responses are wrapped as `{ data }` (pages: `{ data, meta }`); errors as `{ statusCode, error, message, code?, details?, path, requestId, timestamp }`. `code` is a stable reason (e.g. `ACCOUNT_LOCKED`) and `details` its values (`{ minutes: 2 }`): the app words the error from them in the reader's language, and `message` stays the English wording. Notifications likewise carry `params` beside their English `title` and `body`.

   - Codes come from one list, [src/common/errors/error-code.ts](src/common/errors/error-code.ts), published in the API docs with `LedgerErrorCode` (a ledger refusal keeps the contract's error name) and `ValidationRule`. A test fails if anything is thrown without a code, if a code is written as text, or if a listed code is never used.
   - Input checks answer `INVALID_INPUT` with `details.fields`: `[{ field, rule, limit? }]`. Several problems at once (project terms, a farm update, batches, intake details) answer with `details.problems`, each `{ code, message, details }`.
   - A value with a Bengali form travels as `x` and `xBn` (a measurement's `label` and `labelBn`, a produce's name).
   - Adding an error: add the code to the list, throw `{ message, code: ErrorCode.X, details }`, and add its English and Bengali wording in the frontend (`frontend/src/i18n`). Adding a notification: add its kind to `NotificationKind`, send `params`, and word it in the frontend. The frontend's type check fails until both languages have it.

### Demo mode

With `DEMO_MODE=true`, startup creates one verified account for every role. `POST /api/auth/demo/login` with `{ "role": "farmer" }` signs in as that account without a password. Use it for demos only; the app refuses to start with it in production.

### Forgotten passwords

Someone who forgot their password asks for a 6-digit code by SMS (`POST /api/auth/password-reset/request`), checks it (`…/verify`) and sets a new password with it (`…/complete`), which clears a lockout, ends every other session and signs them in. The answer is the same whether or not the number is registered. A code lasts 10 minutes and allows 5 wrong tries; a new one can be asked for after 60 seconds, at most 5 an hour per number. Only a keyed hash of the code is stored.

With `SMS_PROVIDER=log` (local work) the text is written to the backend log instead of being sent: look for `SMS` there to read the code. A real SMS provider is added behind the `SmsSender` interface (`src/modules/auth/sms/sms-sender.ts`) with its credentials in `.env`; production refuses to start without one.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run start:dev` | API with reload on change |
| `npm run build` / `npm run start:prod` | Compile, then run the compiled API |
| `npm run lint` | oxlint with type information |
| `npm run format` | Prettier over `src/` and `test/` |
| `npm run migration:run` | Apply new migrations |
| `npm run migration:generate --name=Thing` | Write a migration from entity changes (read it before running: TypeORM drops and re-adds columns it could alter) |
| `npm run migration:revert` | Undo the last migration |
| `npm run contracts:sync` | After a contract change: rebuild the contracts and copy their TypeScript bindings into `src/blockchain/generated` |
| `npm run user:super-admin -- --name … --phone …` | Create the super admin (once) |

## Settings

Every setting is in [`.env.example`](.env.example) with its default and what it does; the app checks them at startup and names any that are missing or malformed. The ones you may want to change:

| Setting | When to change it |
|---|---|
| `DEMO_MODE` | `true` for demos with ready-made accounts |
| `SMS_PROVIDER` | `log` locally (reset codes in the log); a real provider in production |
| `CORS_ORIGINS`, `PUBLIC_APP_URL` | The frontend runs somewhere other than `http://localhost:5173` |
| `INDEXER_BATCH_BLOCKS` | A node limits how many blocks or logs one request may cover |
| `INDEXER_CONFIRMATIONS` | A chain without instant finality: stay this many blocks behind |
| `KEY_FUNDING_WEI` | `0` on a network with free gas |
| `EXPIRY_SWEEP_MS`, `REMINDER_SWEEP_MS`, `WATCHDOG_*` | How often the background jobs run |

## Data tools

All three build the code first and run as command-line scripts.

### Importing WeGro's records

```bash
npm run data:import -- <folder>           # check only: nothing is written
npm run data:import -- <folder> --apply   # check, then import
```

The folder holds any of the CSV files below (UTF-8, a header row, as Excel saves them). The dry run reports every problem with its file and line. `--apply` brings the rows in through the same services the API uses, so the ledger receives everything. A second `--apply` skips rows already imported, so an interrupted import can be re-run. The import writes `import-report-<time>.csv` next to the files; with `--apply` it also writes `credentials-<time>.csv`, holding each new person's temporary password. Only you can read that file: hand the passwords out, then delete it.

Bold columns are required. Rows refer to each other by the `id` column (for example `projects.csv`'s `farmer_id` is an `id` from `people.csv` or an earlier import).

| File | Columns |
|---|---|
| `units.csv` | **code**, **name**, **name_bn**, sort_order, **kind**, **symbol** |
| `produce-types.csv` | **code**, **name**, **name_bn**, sort_order, **category**, **unit_code**, typical_duration_months, description, description_bn |
| `input-types.csv` | **code**, **name**, **name_bn**, sort_order, **kind**, **unit_code**, produce_code, description |
| `field-record-types.csv` | **code**, **name**, **name_bn**, sort_order, requires_photo, requires_location, measurements |
| `weather-event-types.csv` | **code**, **name**, **name_bn**, sort_order, description |
| `people.csv` | **id**, **role**, **full_name**, **phone**, **nid**, **date_of_birth**, **district**, **address**, field_officer_id, acknowledge_flags |
| `projects.csv` | **id**, **title**, description, **produce_code**, **district**, **location**, **farmer_id**, **duration_type**, **duration_months**, payout_interval_months, **funding_target**, **slot_price**, farmer_bps, investor_bps, wegro_bps, insured, **estimated_return_min_bps**, **estimated_return_max_bps**, planned_start_date, stage |
| `investments.csv` | **id**, **project_id**, **investor_id**, **slots**, **payment_reference** |
| `history.csv` | **id**, **farmer_id**, **title**, **produce_code**, **district**, **started_on**, **finished_on**, **funding_raised**, **income**, **costs**, **farmer_received**, harvested, sold, notes |

Notes:

- Money is in taka (`50000` or `50000.50`); dates are `YYYY-MM-DD`; districts are codes such as `BOGURA`.
- `stage` is `draft`, `open_for_funding` (the default) or `active`. An active project's investments must fill it.
- People are run through the same ID check as registration. Any warnings it raises must be accepted with `acknowledge_flags` set to `true`.
- `--admin-phone` and `--accounts-phone` choose which verified admin and Accounts person act for the import (default: the first one).
- `history.csv` holds finished projects from before the platform. They appear in the farmer's track record, marked as imported (not from the ledger).

### Sample data

```bash
npm run data:seed                  # the showcase: about 45 people, 9 projects
npm run data:seed -- --size large  # five times as much
```

This loads made-up people and one project for every story: draft, open, funded, inputs with an insurance claim, stored and paid out, fresh-produce deals, buy-back, staged payouts, and cancelled with refunds. Everything goes through the real services. It runs only on the local chain, and it refuses to run a second time; reset first.

Each sample person gets a one-time password, written to `sample-credentials-<time>.csv` in this folder (readable only by you, ignored by git). Sign in with a phone and password from it; the platform then asks for a new password. Delete the file when you no longer need it.

### Starting over

```bash
npm run data:reset -- --yes --name "Your Name" --phone 01711000000 [--seed [large]] [--import <folder>]
```

This redeploys the contracts, rebuilds the database schema, empties `UPLOAD_DIR`, creates the super admin, then imports and/or seeds, writing the sign-in details files described above. It works only on the local chain (31337) and never when `NODE_ENV=production`. `--skip-deploy` keeps the deployed contracts; key numbering then carries on from where the old data stopped, because a key the ledger has seen cannot be reused. Name and phone may also come from `SUPER_ADMIN_NAME` and `SUPER_ADMIN_PHONE`, and the password from `SUPER_ADMIN_PASSWORD`.

## Running it

### The ledger copy (indexer)

The indexer copies every platform event from the chain into the database, one block range per pass, each pass in a single database transaction, and rebuilds the read models from them. It starts from the deployment block by itself. If a pass fails, the next one tries half the range, so a range the node will not serve cannot stall it. If the chain was rewritten below the last block it read (a restarted local node, for example), it rebuilds everything from the deployment block.

`GET /api/health` shows the chain head, the last indexed block and the lag between them.

### Background jobs

One scheduler runs every job, never two runs of the same job at once:

| Job | Default interval | Does |
|---|---|---|
| Reservation, sale and deal expiries | `EXPIRY_SWEEP_MS` (1 minute) | Releases what passed its ledger deadline, clearing any backlog in one run |
| Reminders | `REMINDER_SWEEP_MS` (5 minutes) | Payment deadlines, idle vouchers, expiring storage and permissions |
| Indexer watchdog | `WATCHDOG_INTERVAL_MS` (5 minutes) | Tells admins when the copy falls more than `WATCHDOG_LAG_BLOCKS` behind, the node is unreachable, or passes keep failing |

The super admin, admins and auditors see each job's state and recent runs at `GET /api/jobs` and `GET /api/jobs/:name/runs`; the super admin can run one at once with `POST /api/jobs/:name/run`.

### Checking records against the ledger

- `GET /api/audit/verify/:type/:id` recomputes one record's fingerprint from the database (and its photos from disk) and compares it with the ledger.
- `POST /api/audit/sweeps` checks every record in the background. `GET /api/audit/sweeps/:id/findings` lists those that differ.
- `GET /api/audit/history/:type/:id` gives a record's full ledger history with who sent each transaction.
- `GET /api/audit/log` lists every write request: who, which route, the outcome. Entries cannot be changed or deleted, and a request the client abandoned is logged as `aborted`.

## Tests

| Command | Needs | Covers |
|---|---|---|
| `npm test` | nothing | Unit tests: every service, the money and fingerprint maths, CSV, ID checks |
| `npm run test:cov` | nothing | The same, with coverage in `coverage/unit` |
| `npm run test:e2e` | nothing | The HTTP pipeline: validation, errors, security headers, rate limits |
| `npm run test:chain` | the Hardhat node with the contracts deployed, the database from `.env` | Every module end to end through HTTP, the real contracts and the database |
| `npm run test:chain:cov` | as above | The same, with coverage in `coverage/chain` |

Chain tests run one file at a time. Each file works in its own throwaway database schema, which it drops at the end, and indexes only the blocks it creates. Your own data is never touched. The full chain suite takes about five minutes.

The chain suite fails if code sends a second query on a database connection that is still busy with one, such as two queries at once inside a transaction. pg only warns about this today, and its next major version will make it an error.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Invalid environment configuration: …` at startup | A setting is missing or malformed; the message names it. Compare with `.env.example`. |
| `Contract deployment does not match the chain` at startup | The node was restarted without redeploying, so the contracts are gone. Run `npm run data:reset -- --yes …` (or redeploy, then reset the database). |
| `Blockchain node … is not reachable yet` in the log | Start it: `cd ../contracts && npx hardhat node`. The API starts anyway; ledger calls answer 503 until the node is up. |
| Health shows a growing `indexerLag` | Check the log for indexer errors. On a remote node, lower `INDEXER_BATCH_BLOCKS`. |
| Chain tests slow down over weeks of use | The local node keeps every block from every run. Stop it, start it again, then redeploy. |
| A registration answers 503 `REGISTRATION_UNCONFIRMED` | The ledger did not confirm in time. It is confirmed automatically when the transaction lands, or use the participant's sync action. |
| `PAYMENT_REF_ALREADY_USED` | That bank reference was already recorded for another payment. The ledger refuses a reference twice, even after the database was reset. |

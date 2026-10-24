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

The same codes confirm a new number when someone changes their own details (below); each code is for one purpose only.

With `SMS_PROVIDER=log` (local work) the text is written to the backend log instead of being sent: look for `SMS` there to read the code. A real SMS provider is added behind the `SmsSender` interface (`src/modules/auth/sms/sms-sender.ts`) with its credentials in `.env`; production refuses to start without one.

### The super admin

The super admin holds every office power: whatever an admin, Operations, Accounts or an auditor may do, including final approvals (approving vouchers, confirming payments, approving payout rounds). Staff approvals never need the super admin's on top. The super admin does not act as people outside the office (suppliers, buyers, farmers, investors, warehouse operators, banks, insurers) or as a farmer's field officer. Rules that a second person checks still apply: a round the super admin prepared is approved by someone else.

This is built in centrally, so new sections inherit it: the role guard lets the super admin through wherever an office role is listed (`actsAs` in `src/modules/users/roles.ts`), and on the ledger `AccessGuarded._hasRole` does the same for the super admin's key, which records itself as `SUPER_ADMIN_ID` where a participant id is kept.

### Registering people

Staff are registered by the super admin; farmers by their field officer (who is then theirs) or an admin; every other role by an admin. Field officers register farmers only, which the contract enforces too. `POST /api/participants/check` runs the ID check and the duplicate checks of a registration without saving anything, so the registrar confirms before it goes on the ledger. Each check carries a `reason` (the `IdCheckReason` list in the API docs) and its `params`, worded in the app. A registration answers with the temporary password once and texts it to the person in the language chosen for them (`smsSent` says whether the SMS went out); a reset does the same. If the ledger is slow to confirm, the person is saved as `submitted` all the same and the password still handed over; the indexer or sync confirms them.

### Revoking access

Someone verified who leaves (a member of staff who resigned or was dismissed, a business whose contract ended) has their access revoked, not deleted: their records and what they did stay, attributed to them. `GET /api/participants/:id/open-work` lists what they still have open (farmers they look after, vouchers they proposed, payout rounds they prepared, claims they opened, a farmer's running projects and so on). `POST /api/participants/:id/revoke` takes a `reason` (`RevocationReason`: resigned, dismissed, contract_ended, left_platform, terms_breach, other) and a `note` (required for other); the super admin revokes staff, an admin everyone else. Their role is revoked on the ledger, every session ends at once, and signing in answers `ACCESS_REVOKED`. A field officer who still looks after farmers needs `replacementOfficerId`: the farmers move to that officer on the ledger first (`reassignFarmers`, 200 per transaction), since the ledger refuses to revoke an officer who has any. Verifying them again restores access. `POST /api/participants/:id/reject` is only for registrations not yet verified.

### Finding people

Lists of people take `q`: a mobile number (phone index), an NID (NID index) or words of a name. Names stay encrypted; each word of a name is kept as a keyed hash (`person_name_tokens`), so typing any whole word finds them, every word typed must be in the name, and nothing is decrypted to search. A part of a word does not match. The words are rewritten whenever a name is saved or changed, and people saved before the index existed are indexed at startup. The same rule (`PersonSearch`) serves every list that shows people.

### Signing up

Investors, buyers and outside sellers sign up themselves: `POST /api/auth/sign-up/code` texts a code to a number not yet registered, and `POST /api/auth/sign-up` takes the same details as any registration, the code and their own password. They go through the ID check, are registered and verified on the ledger at once by the platform's key (`selfRegisterParticipant`, which the contract allows only for those three roles), and are signed in. If the ledger has not confirmed them yet, sign-up answers `REGISTRATION_CONFIRMING` like a sign-in would; the `sign-up-retry` job (every `SIGN_UP_RETRY_MS`) sends such registrations again by the platform key, so they can sign in within minutes without anyone stepping in. Every other role is registered for them.

### Email addresses

An email address is optional and signs in like the number (`POST /api/auth/login` with `email` instead of `phone`) once it is confirmed: `POST /api/auth/me/email/code` emails a code, `POST /api/auth/me/email` saves the address with it, `DELETE /api/auth/me/email` removes it. It is stored encrypted with a lookup index (one account per address) and is not part of the ledger fingerprint, so it needs no admin. With `EMAIL_PROVIDER=log` the email is written to the backend log (look for `Email`); production refuses to start without a real provider behind `EmailSender` (`src/modules/auth/email/email-sender.ts`). Codes by SMS and by email share one table, `verification_codes`, each for one purpose.

### Changing one's own details

Everyone sees their own details in full (`GET /api/me/details`) and can ask to change any of them (`POST /api/me/details/change`); the details go through the same ID check as at registration. A new number must first be confirmed by a code sent to it (`POST /api/me/details/phone-code`, then the code with the change). The request waits for an admin, or the super admin for staff (`GET /api/detail-changes`, `…/:id`, `…/:id/approve`, `…/:id/reject` with a reason); approving writes the new fingerprint to the ledger, signed by the approver, and the new number signs in from then on. A new request replaces one still waiting, and the person can take one back (`DELETE /api/me/details/change`). Nobody decides their own. The requested details are stored encrypted until decided. The super admin, who keeps only a name and a number, changes them at once.

### Paying for bookings

An investor books units (`POST /api/projects/:id/reservations`); they are held for 7 days (the ledger's `reservationTtl`). WeGro's accounts to pay into are kept by the super admin and Accounts (`/api/payment-accounts`: the branch picked from the bank list, one account per branch and number, retired rather than deleted) and shown to investors (`GET /api/payment-accounts`). The investor pays, in one transfer or several, and sends proof of each (`POST /api/reservations/:id/proofs`, multipart: 1 to 3 photos or PDFs up to 10 MB, the amount (at most what is left), the date, the method (bank deposit, cash or cheque), the bank paid from, and an optional reference and note). Proof files are encrypted at rest under `UPLOAD_DIR/proofs/`, bound to their row; only the investor and payment staff open them (`GET /api/payment-proofs/files/:id`).

A proof sent before the deadline stops the booking's clock on the ledger (`pauseReservation`, signed by the investor), so it cannot expire while Accounts reviews it. Accounts accepts a proof with the reference on the bank statement (each used once) or rejects it with a reason (`GET /api/payment-proofs?status=pending&q=`, `…/:id/accept`, `…/:id/reject`). With nothing left under review, the clock runs on for the time it had left (`resumeReservation`); when accepted proofs add up to the amount, the booking is confirmed on the ledger with their references combined. A booking paid without a proof in the app is confirmed directly (`POST /api/reservations/:id/confirm`), which is refused once proofs exist. Investors cancel their own booking only while nothing was sent; an admin can cancel any, and money accepted for a booking that ended unconfirmed is listed for Accounts to refund (`GET /api/payment-proofs?refund=due`, `POST /api/payment-proofs/:id/refund`).

Projects carry a cover photo (`POST /api/projects/:id/cover`, drafts only; `GET /api/projects/:id/cover`), how many investors hold units and how many booked today, and for investors whether they saved it (`PUT`/`DELETE /api/projects/:id/favourite`, `GET /api/projects?favourites=true`). The list is searched by words of the title, the place or the crop (`q`).

### Farm updates

Field officers record farm updates from their phones (`POST /api/field-records/sync`, up to 50 drafts at a time, each with its id made on the phone, so sending it again never makes a second record; one outcome per draft: recorded, already_recorded, pending or rejected with its code). Photos go first (`POST /api/photos`; the same photo always gets the same id). `GET /api/field-records/my-projects` gives an officer their farmers' projects that take updates now (funded to ready for sale), compact enough for the phone to keep for offline use; the app deletes it at sign-out. `GET /api/field-records` lists updates across projects, an officer's own or every one for staff, searched by words of the project title or the farmer (`q`); `GET /api/projects/:projectId/field-records` is one project's timeline, for everyone who sees the project (exact locations only for staff, the farmer and their officer). A correction is a new record with `correctsEntryId`; `GET /api/field-records/:id/verify` checks one against the ledger.

### Input vouchers

Once a project is funded, Operations, an admin or the super admin proposes vouchers for its farmer (`POST /api/projects/:projectId/vouchers`: an input from the catalog, whole units, today's unit price and 1 to 20 verified suppliers, picked from `GET /api/voucher-suppliers?q=`, which gives staff ids and names only); one the ledger never got stays as `submitted` and can be discarded (`DELETE /api/vouchers/:id`). Their value together never passes the funding target (`GET /api/projects/:projectId/voucher-summary` says what is committed, spent, in pending sales and still free). Accounts approves or rejects them (`…/vouchers/:id/approve`, `…/reject`); the first approval makes a funded project active. An admin cancels one, voiding what is unused; the super admin sets how many idle days flag one as inactive (`PUT /api/vouchers/:id/inactivity-limit`). Lists (`GET /api/vouchers`, `GET /api/voucher-sales`) are searched by words of the project title or the farmer, and sales also by number (`#12`) or supplier.

The farmer shows the voucher's QR (`GET /api/vouchers/:id/qr.svg`), which opens `PUBLIC_APP_URL/vouchers/:id`; a supplier named on it records the goods handed over (`POST /api/vouchers/:id/sales`, optionally from their batches), and the farmer's own field officer confirms (`POST /api/voucher-sales/:id/confirm`) before the sale counts as spent. Suppliers register lots of goods on the ledger (`POST /api/batches`; lists searched by lot number or manufacturer, and by supplier for staff); each lot's QR (`GET /api/verify/batches/:id/qr.svg`, printed in the app as A4 sheets of 21 labels) opens a public page that checks it against the ledger without signing in (`GET /api/verify/batches/:id`).

### Warehouse

Sites are the warehouses and cold stores WeGro works with. An admin adds one (`POST /api/warehouse-sites`), changes its details (`PATCH /api/warehouse-sites/:id`; the new fingerprint goes to the ledger, `updateSite`) and closes or reopens it (`…/:id/close`, `…/:id/reopen`; `setSiteClosed`). A closed site takes no new goods or operators; the receipts it holds stay valid and its operators still re-check and release them. Operators are put at a site with `PUT /api/warehouse-operators/:operatorId` (`siteId: null` removes them). Sites are searched by words of the name, the address or the district (`q`) and filtered by `state` (open, closed).

An operator records goods coming in and issues a receipt to the project's farmer (`POST /api/warehouse-receipts`; active projects of produce that can be stored). Receipts are searched by words of the project title, the farmer, or the printed number (`WR-` and the id's first eight characters; `q`), and `expiresBy` lists those still held that expire on or before a day (the app uses today + 14 for Expiring Soon). The issuing site re-checks and extends them (`…/:id/extend`) or marks unsold goods collected (`…/:id/collect`). Buy-back: the farmer's own field officer offers a receipt to WeGro (`…/:id/handover`), an admin accepts or declines it (`…/handover/accept`, `…/handover/cancel`). Anyone can check a receipt by its QR without signing in (`GET /api/verify/receipts/:id`, `…/qr.svg`).

### Marketplace

Three kinds of listing are for sale: a warehouse receipt (`POST /api/listings/receipt`, by an admin for WeGro's own or the farmer's officer for the farmer's), fresh produce from an active project (`POST /api/listings/produce`), and an outside seller's own produce (`POST /api/listings/external`). Outside sellers are a role of their own (`seller`) who sign up themselves; they list catalog produce only (its catalog unit, quantity, price per unit, district, a description and 1 to 3 photos from `POST /api/photos`). Their listing waits as `pending` until an admin approves it (`POST /api/listings/:id/approve`) or turns it down with a reason (`…/reject`); only staff and the seller see it until then. The details are kept off the ledger with their fingerprint on it (`listing_details`).

`GET /api/listings` gives open listings by default, filtered by `source` (warehouse, fresh, seller), `status` (pending and rejected for staff only), produce, district or project, and searched by words of the produce or project or by the seller (`q`); `mine=true` gives a seller every listing of their own. A buyer offers on all or part of what is left at their own price (`POST /api/listings/:id/offers`). Offers on WeGro's listings are decided by an admin; on an outside seller's listing by that seller (`…/offers/:id/approve`, `…/reject`). An approved offer is a deal: its quantity is held until Accounts confirms the buyer's payment before the deadline (`…/offers/:id/payment`, the reference encrypted with only its hash on the ledger) or an admin cancels it. Once paid, the buyer and the one handing over (the site's operator, the farmer's officer or the outside seller) each confirm what changed hands (`…/offers/:id/delivery`, with an optional photo); counts that differ from the deal are flagged (`GET /api/offers?discrepancy=true`). Accounts then pays an outside seller the deal amount less their fee (`GET /api/offers?payoutDue=true`, `POST /api/offers/:id/seller-payout`, the reference again kept as a hash on the ledger), and the deal ends `seller_paid`. Offers are searched by number (`#12`), produce, buyer or seller (`q`). Buyers post what they want (`POST /api/buyer-requests`), each shown with the open listings that match it.

The platform fee is a fixed amount per side, chosen by the deal total from slabs kept on the ledger (`TradeLedger.feeFor`, like a marketplace closing fee): up to ৳5,000 → ৳20, to ৳25,000 → ৳75, to ৳1,00,000 → ৳250, to ৳5,00,000 → ৳750, above → ৳1,500 to start. The buyer pays it on top of every deal; an outside seller also has it taken from their payout, while on WeGro's own listings the seller side pays none, so project income is not reduced. It is fixed when the offer is approved (`buyerFee`, `sellerFee`, `buyerPays`, `sellerReceives` on each offer). `GET /api/marketplace/fees` shows the slabs to everyone; the super admin changes them (`PUT /api/marketplace/fees`: rising limits, the last without one, at most 20), for offers approved from then on.

### Insurance

Projects marked insured are covered while the crop is in the field (funded or active). An admin assigns each one an insurer (`PUT /api/insurance/projects/:projectId/insurer`, a verified insurer). The admin can switch insurers until the project's first claim; switching clears the old insurer's terms on the ledger, and the new insurer sets their own. The assignments are kept as history (`insurer_assignments`). Only the assigned insurer sets the cover (`PUT …/coverage`): the most it pays in total, the weather event types it pays for, and the terms in words. Each change is a new version chained to the one before, and the cover can never drop below what is already approved. `GET /api/insurance/projects` lists insured projects in the field with their insurer and cover, filtered by `cover` (unassigned, no_cover, covered) and searched by title words or the farmer (`q`); an insurer sees only the projects assigned to them. `GET …/coverage` gives one project's insurer, cover, totals and claims for everyone involved.

Admins and insurers record weather events per district (`POST /api/insurance/weather-events`; searched by words of the event type or the district). The farmer's field officer, or an admin, opens a claim citing a recorded event of a covered type in the project's district: the damage seen, what happened and up to 5 photos (`POST /api/insurance/projects/:projectId/claims`; one claim per event). The project's insurer starts the review and approves an amount within the cover remaining, or rejects the claim, each with an assessment (`…/claims/:id/review`, `…/approve`, `…/reject`). The evidence and the assessment are fingerprinted on the ledger. An approved claim counts as project income only once Accounts records the insurer's payment to WeGro (`GET /api/insurance/claims?paymentDue=true`, `POST /api/insurance/claims/:id/payment`, the reference encrypted with only its hash on the ledger). Settlement uses the paid total (`InsuranceRegistry.paidTotal`), and the final payout waits for claims that are still open or approved but unpaid. Claims are searched by title words, event type or the farmer (`q`).

### Bank details and the bank list

Farmers, investors and outside sellers are paid into a bank account (no mobile wallets). They pick the bank, then the district, then the branch from the official list (`GET /api/bank-list/banks`, `…/banks/:bankCode/districts`, `…/banks/:bankCode/districts/:districtCode/branches`); the branch's routing number comes from the list (`GET /api/bank-list/branches/:routingNumber`), and they add the account number and the name on it. Only the routing number is sent (`PUT /api/me/bank-account`, or an admin's `PUT /api/participants/:id/bank-account`); the bank, branch and district names are taken from the list and kept, encrypted, with the details, so a later list does not change them. New details count once someone other than who entered them verifies them (`GET /api/bank-accounts/pending?q=`, `…/participants/:id/bank-account/verify` or `…/reject`).

The list comes from `src/database/bank seeds/` (`bank_branches.json`: banks, each with its branches; `districts.json`: the districts) and is loaded into an empty database at startup. An admin replaces the whole list by uploading new files of the same shape (`POST /api/bank-list/import`, fields `branches` and optionally `districts`); every entry is checked first and nothing changes if any is wrong. Routing numbers are 9 digits starting with the bank's code; those the files give as 8 digits (banks below 100, leading zero lost) get the zero back. `GET /api/bank-list` says how big the list is and who loaded it when; each import is recorded in `bank_list_imports` with the files' SHA-256.

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
| `SMS_PROVIDER` | `log` locally (codes in the log); a real provider in production |
| `EMAIL_PROVIDER` | `log` locally (email codes in the log); a real provider in production |
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
| `npm run test:chain` | the database from `.env` (the tests start their own chain) | Every module end to end through HTTP, the real contracts and the database |
| `npm run test:chain:cov` | as above | The same, with coverage in `coverage/chain` |

Chain tests run one file at a time. Each run starts its own Hardhat node on port 8546, deploys the contracts there (deployment id `chain-tests`) and stops the node at the end, so the tests never move your local chain's clock or compete with your running backend for its keys. Each file works in its own throwaway database schema, which it drops at the end, and indexes only the blocks it creates. Your own data is never touched. The full chain suite takes about ten minutes. Port 8546 must be free; a node left by a killed run is stopped at the next start.

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

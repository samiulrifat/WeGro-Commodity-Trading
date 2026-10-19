# Frontend build plan

React 19 and TypeScript (Vite), Tailwind CSS with shadcn/ui, TanStack Router, Redux Toolkit with RTK Query (as in WeGro's main codebase; no Axios in the app), i18next for English and Bengali, and an installable web app that keeps field officers' drafts without internet. It talks only to the backend's REST API (`/api`); the backend does everything with the ledger.

Feature-based layout: each business area keeps its pages, components, hooks and API calls together, as each backend module does.

```
src/
  app/          router, navigation map, shell, session guards, shared pages
  routes/       one file per page
  api/          RTK Query base API (its own fetch client), types generated from the backend's OpenAPI
  store/        Redux store and app-wide slices (session, language, offline drafts)
  features/
    projects/
      pages/        ProjectsPage.tsx, ProjectPage.tsx, ...
      components/   SlotPicker.tsx, StageBadge.tsx, ...
      api.ts        RTK Query endpoints for this area
  components/
    ui/         shadcn/ui primitives
    ...         shared pieces: data table, money, dates, status badges, file upload, QR
  i18n/         en and bn translations
  lib/          formatting (taka, Bangladesh dates), helpers
```

Requirements that shape every screen:

- **Roles**: each person sees only what their role allows (NFR-1); the backend enforces it, the UI hides what it would refuse.
- **Ease of use**: plain words, large buttons (at least 44 px), clear status labels, readable colours; a farm update in 5 steps or fewer (NFR-6).
- **Language**: English and Bengali on every Must and Should screen, taka amounts and local dates (FR-32, NFR-8).
- **Speed**: pages open in under 2 seconds (NFR-4).
- **Phones**: field officers, farmers and warehouse operators work on phones; office staff mostly on desktops.
- **Search on every list** (asked for 2026-10-19): each section's lists get a search box with a Find button besides the filters, so any record can be found (by its number or reference, and people by name words, phone or NID).
- **Section menus** (agreed 2026-10-18, built with each section's item): a section with several pages opens like a dropdown in the sidebar (one section open at a time, the current page's section open); on phones its pages are tabs under the page title. The page you are on is filled green (`nav-active`, #ADDB90, as in WeGro's admin product). Each role sees only the pages it can use:
  - Projects: All projects, Drafts, Payment confirmations, Refunds
  - People / Farmers: All people, Waiting for verification, Register new, Bank details to verify
  - Farm updates: New update, Drafts on this phone, Sent
  - Vouchers: All vouchers, Waiting for approval, Input sales, Batches
  - Warehouse: Receipts, Handovers, Sites
  - Marketplace: Listings, Offers & deals, Deliveries, Buyer requests
  - Insurance: Insured projects, Claims, Weather events
  - Payouts: Payout rounds, Costs, Reports
  - Track records: Farmers, Banks, Bank permissions
  - Catalog: Units, Produce, Inputs, Farm-update types, Weather events
  - History & audit: Record history, Ledger checks, Request log
  - System: Status, Scheduled jobs
  - Single links (no dropdown): Dashboard, My holdings, Statement, My offers, Requests, a supplier's Batches, a bank's Farmers

Build in order: each phase depends on the ones above it.

## Phase 0: Foundation

- [x] 1. Project setup: Vite starter removed, strict TypeScript, `@/` path alias, oxlint (type-aware) and Prettier as in the backend, environment settings, dev proxy to the backend, folder layout, WeGro logo (traced to SVG: full colour, on dark, mark as favicon)
- [x] 2. Design system: WeGro palette from the logo and the current product (darker shades of the same hues where text needed contrast), Manrope with Noto Sans Bengali, 44 px touch targets, 30 shadcn/ui components, WeGro pieces (stat card, status pill, approval step, page header, person cell, logo); light theme with every colour a token so dark mode can follow
- [x] 3. API layer: Redux store (session) and RTK Query with every endpoint generated from the backend's OpenAPI (one file per area, `npm run api:generate`); one fetch that adds the token and renews the session once on 401; responses exactly as sent (`{ data }`, pages `{ data, meta }`); error mapping; photo upload and file downloads. Backend docs now describe every response exactly, checked against real responses in the chain tests
- [x] 4. Language and formats: English by default with an EN | বাংলা switch; the choice is remembered on the device and saved to each person's account (backend: `users.language`, `PATCH /api/auth/me`, returned on sign-in); i18next with Bengali loaded only when chosen; taka (`৳ 1,234,567.50`), numbers and dates in Bangladesh time with Bengali digits in Bengali; calendar in the app's language; errors worded from the backend's code and values, notifications from their kind and values (sign-in and session errors and five notifications converted as proof)
- [x] 4b. Server text in every language: one central list of error codes in the backend (245, published in the API docs; a test fails if anything is thrown without one), input checks per field (rule and limit), lists of problems coded one by one, every notification and reminder saving its values under one of 61 kinds; English and Bengali wording for every code, rule and kind, checked by the type check against the backend's lists. The ledger's own errors keep their contract names and show a sentence for their kind
- [x] 5. App shell: TanStack Router with one file per page (each loads on its own); each role's menu and home from one map (`src/app/navigation.ts`), the same map guarding every page; session restored on load, signed-out people sent to sign-in and back, temporary passwords held to their change page, unverified people to their registration status; desktop sidebar, phone bottom bar (four places and More), top bar with language, notifications and account; loading, empty and error states, not-found and no-access pages; demo-mode role picker at /sign-in until item 7; the design preview at /design in development only
- [x] 6. Installable app: manifest and icons from the WeGro mark (including maskable and Apple touch), offline worker keeping the app's files and the catalog only (no personal data cached), "Install app" in the account menu and on sign-in (steps for iPhone), "new version, Reload" prompt, offline banner; an offline session for the person last signed in on the device (reconnects when online; a sign-out made offline is finished first next time); drafts in IndexedDB per person, with photos, kept until sent or deleted, storage kept by the browser

## Phase 1: Identity

- [x] 7. Sign-in: phone and password (Bengali digits accepted), first-sign-in password change, "your session has ended" when it lapses, lockout and other refusals worded from their codes, demo role picker on its own tab; forgotten password by SMS code (backend: codes stored as keyed hashes, 10 minutes, 5 tries, 60 s between and 5 an hour per number, the same answer for unregistered numbers, a pluggable SMS sender writing to the log locally). Signing out everywhere moved to item 8 (My account)
- [x] 8. My account: my details (changes by request, approved by an admin or for staff the super admin; a new number confirmed by SMS code; the super admin's apply at once), language, change password, ledger account for staff, sign out on every device. The admins' review of the requests comes with item 9 (People)
- [x] 9. Participants: register in steps with the ID check run first on the server (reasons worded en/bn, flags shown, duplicates caught, nothing saved), temporary password shown once and texted in the person's language; field officers register farmers only (also on the ledger); list with filters and search by phone or NID, waiting for verification, detail (masked for auditors) with verify (flags acknowledged), reject, assign field officer, replace key, reset password (texted), sync and a check against the ledger; review of details-change requests. People's section menu (sidebar dropdown, phone tabs). Search on every list: whole words of a name (keyed word index, names stay encrypted), a mobile number or an NID; field officers picked by search; details changes searched and paged; sign-ups the ledger has not confirmed are sent again by a job. Also: sign-in box redesigned (Email | Phone, Register below), investors and buyers sign up themselves (number confirmed by SMS code, registered and verified at once by the platform's key), email address confirmed by code signs in too (added at sign-up or in My account)
- [x] 10. Bank details: payees (farmers, investors) enter and see their own on My account, admins enter them on the person's page; bank, then district, then branch picked from the official list (searchable dropdowns), routing number filled in from the server, account number and account name; bank accounts only. Current, waiting and earlier versions with who entered and decided. Admins' queue "Bank details to verify" under People, searched by the payee's name words, number or NID, verify or reject in place (verified by someone other than who entered them). Backend: the official bank list (62 banks, 11,758 branches, 65 districts) loaded from `backend/src/database/bank seeds/` at startup, replaced whole by an admin's import (checked entry by entry, recorded with who and the files' hashes); bank details keep the bank, branch and district names they were entered with

## Phase 2: Business screens

- [ ] 11. Catalog: units, produce types, input types, field-record types (with their measurements), weather event types
- [ ] 12. Projects: browse and filter with estimated returns; admin drafts, publish and stage moves; project page with timeline and ledger check; reserve slots, my reservations and holdings; Accounts confirms payments; cancellation and refunds
- [ ] 13. Vouchers and inputs: propose (Operations), approve or reject (Accounts), cancel, inactivity limits; suppliers' batches with printable QR codes and sales; officer confirms; the public QR check page (no sign-in)
- [ ] 14. Farm updates (works offline): the officer's phone flow in 5 steps or fewer, camera photo, location, the record type's measurements, drafts saved on the phone and sent when online (one outcome per draft, never a duplicate), corrections, records on the project timeline, ledger check
- [ ] 15. Warehouse: sites and operators, intake and issued receipts, re-check and extend, collect, buy-back handover (offer, accept, cancel), the public receipt QR check page
- [ ] 16. Marketplace: listings to browse, list a receipt or fresh produce, offers and deals, buyer payment confirmation (Accounts), delivery confirmation by buyer and handler (with photo, mismatches flagged), buyer requests with matching listings
- [ ] 17. Insurance: insured projects, cover (insurer), weather events, claims with photos opened by the farmer's officer or an admin, review, approve or reject
- [ ] 18. Settlement: costs with bill photos, project summary with what blocks the next round and a preview of each, prepare, approve (second Accounts person) or reject rounds, payout lines and payments, CSV downloads, investors' and farmers' statements
- [ ] 19. Track record: preview and publish, versions, grant (signed-form photo, at most a year) or withdraw bank permission, who viewed; bank officers' farmer list and logged view; imported history

## Phase 3: Cross-cutting

- [ ] 20. Admin dashboard: funding progress, active projects, stages, the role's queues linking to their actions, all-time figures and 12-month trend charts
- [ ] 21. Notifications: bell with unread count, inbox, mark read, links to the record
- [ ] 22. History and audit: full history of any record, a Verify button with a clear result, sweeps and their findings, the write-request log; read-only screens for auditors
- [ ] 23. System status (super admin): health and indexer lag, scheduled jobs with their runs and run-now

## Phase 4: Quality and handover

- [ ] 24. Translations: every Must and Should screen in Bengali, ready for a native speaker's check (NFR-8)
- [ ] 25. Tests: component tests, end-to-end runs of the main stories with Playwright, accessibility checks
- [ ] 26. Speed and polish: code split per page, pages under 2 seconds, phone layouts checked
- [ ] 27. Docs: frontend README, root README updated

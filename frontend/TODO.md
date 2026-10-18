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

- [ ] 7. Sign-in: phone and password, first-sign-in password change, session refresh and expiry, lockout messages, sign out here or everywhere, demo-mode role picker
- [ ] 8. My account: my details, language, change password
- [ ] 9. Participants: register with the ID check (results and flags to acknowledge), list with filters and search by phone or NID, detail (masked for auditors), verify, reject, assign field officer, replace key, reset password, sync with the ledger
- [ ] 10. Bank details: payees enter and see their own; admins' verification queue (verified by someone other than who entered them)

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

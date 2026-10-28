# Frontend

The WeGro web app: every role's screens, in English and Bengali, on desktops and phones, installable and usable offline for field work. React 19 and TypeScript on Vite, Tailwind CSS with shadcn/ui (Base UI), TanStack Router, Redux Toolkit with RTK Query, i18next. It talks only to the backend's REST API (`/api`); the backend does everything with the ledger.

How it was built, item by item, is in [TODO.md](TODO.md).

## Running it

Requires Node.js 22 or newer and the backend running with its local chain (see the [root README](../README.md) and [../backend/README.md](../backend/README.md)).

```bash
npm install
npm run dev        # http://localhost:5173
```

The dev server passes `/api` to the backend at `http://localhost:3000`. To point elsewhere, copy `.env.example` to `.env.local` and change `BACKEND_URL` (development) or `VITE_API_ORIGIN` (a build served apart from the API). Nothing in these files is secret: every `VITE_` value ends up in the browser.

Signing in: with `DEMO_MODE=true` in `backend/.env`, the sign-in page has a **Demo** tab with one ready-made account per role and no password. The sample people loaded by `npm run data:reset … --seed` sign in with the one-time passwords in `backend/sample-credentials-<time>.csv`. The super admin signs in with the phone and password given to the reset.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server with instant reload (no offline worker) |
| `npm run build` | Type-check, then build into `dist/` |
| `npm run preview` | Serve the build on http://localhost:4173, same `/api` proxy, offline worker included |
| `npm run typecheck` | TypeScript only (the app, the e2e tests and the configs) |
| `npm run lint` | oxlint with type information |
| `npm run format` / `format:check` | Prettier (same settings as the backend) |
| `npm test` | Unit and page tests (Vitest) |
| `npm run e2e` | End-to-end tests in a real browser against the running dev stack (see [Tests](#tests)) |
| `npm run e2e:speed` | Builds the app, serves it on :4173 and times every role's pages |
| `npm run api:generate` / `api:check` | Regenerate the API client and code lists from the running backend / fail if they are out of date |
| `npm run i18n:review` | Rewrite `docs/translations-review.csv`, every string in both languages, for a native speaker |

Before a commit: `npm run typecheck && npm run lint && npm run format:check && npm test`.

## Layout

```
src/
  main.tsx      start-up: session and first page fetched at once, then the app
  app/          router, navigation map (who sees what), shell, session, start-up, offline
  routes/       one file per page; routeTree.gen.ts is generated from them (never edit)
  features/     one folder per business area: pages, components, hooks
  api/          base API and fetch (http.ts), errors, files; generated/ is generated (never edit)
  store/        Redux store; session and language slices and their listeners
  components/   shadcn/ui primitives (ui/) and shared pieces
  i18n/         en.ts, bn.ts, formatting of values inside sentences
  lib/          formats (taka, dates, digits), drafts on the device, helpers
  test/         page-test helpers (store, memory router, fake server)
e2e/            Playwright tests
docs/           Bengali glossary and the translation review sheet
```

Business areas in `src/features/`: account, people, sign-up, bank-details, catalog, projects, vouchers, farm-updates, warehouse, marketplace, insurance, payouts, track-records, dashboard, notifications, audit, system.

## Roles and pages

[src/app/navigation.ts](src/app/navigation.ts) is the one map of who sees what: each of the 14 roles' menu in order (the first entry is where the role lands), and each section's pages. The same map guards every page, and the backend checks every request again.

- A route names its area and, inside a section, its page: `staticData: { area: 'projects', page: '/projects/payments' }`. A role without them sees "not available for your role", and the page's data is never requested.
- A record page below a list (`/projects/:id`) needs only the section. `mayOpen(user, path)` answers the same question for links, so a link appears only where the reader may follow it.
- Desktop: a sidebar where a section with several pages opens as a dropdown. Phone: a top bar, a bottom bar (four places and More) and the section's pages as tabs under the title.
- The super admin has every office power (admin, Operations, Accounts, auditor) but does not act as people outside the office; `actsAs(role, 'accounts')` is how code asks.

Adding a page: a file under `src/routes/_app/…` with its `staticData`, the page component in its feature folder, an entry in `navigation.ts` if it belongs in a menu, its words in `en.ts` and `bn.ts`, and a page test. The router regenerates `routeTree.gen.ts` on `npm run dev` or `build`.

Every list has a search box with a Find button ([search-box.tsx](src/components/search-box.tsx)), with filters and pages kept in the address; people are found by any whole word of their name, a mobile number or an NID.

## Talking to the backend

Every backend route has a generated, typed RTK Query hook:

```ts
import { useProjectsListQuery } from '@/api/generated/projects';

const { data } = useProjectsListQuery({ page: 1, stage: 'open_for_funding' });
data?.data; // ProjectDto[]
data?.meta; // { page, limit, total, totalPages }
```

- Responses are exactly what the backend sends: `{ data }`, or `{ data, meta }` for pages. After changing the backend's API, run `npm run api:generate` with the backend running; `api:check` fails while `src/api/generated/` is out of date.
- [src/api/http.ts](src/api/http.ts) sends every request with the access token (kept in memory only). On a 401 it renews the session once through the httpOnly refresh cookie, shared by every request that failed together, and repeats the request. Only a 401 from the renewal ends the session: too many requests, a server error or no connection keep it.
- [src/api/errors.ts](src/api/errors.ts): `toApiError(error)` gives one shape for any failure (kind, messages, the server's `code`, `details`, `requestId`); show it with `errorText()` or `ErrorState`.
- [src/api/files.ts](src/api/files.ts): photo upload, `useApiFile(path)` for photos and QR codes, `downloadFile(path)` for CSV reports.
- Pages where several people act (deals, listings) fetch afresh when opened.

## Language

English by default; the `EN | বাংলা` switch changes the whole app at once. The choice is remembered on the device and, once signed in, saved to the account, where notifications and SMS use it too.

- Words live in [src/i18n/en.ts](src/i18n/en.ts) and [bn.ts](src/i18n/bn.ts). English is the source of every key: the type check fails if Bengali misses one, and a test checks both fill in the same values. Bengali is downloaded only when chosen.
- Every error code, input rule and notification kind from the backend must be worded: `npm run api:generate` writes the backend's lists to `src/api/generated/codes.ts`, and the type check fails until both languages have them.
- English labels (menus, titles, buttons, tabs, headings, fields, statuses) are in Title Case with formal wording; sentences are in sentence case.
- Values are formatted, never pasted: `{{n, number}}`, `{{amount, taka}}`, `{{at, date}}`, `{{at, datetime}}`, `{{role, role}}`. Any bare number filled into a sentence is shown in Bengali digits for Bengali readers; a `{{unit}}` is shown with the catalog's Bengali symbol (কেজি).
- Formats ([src/lib/format.ts](src/lib/format.ts), or `useFormat()`): taka as `৳ 1,234,567.50` with international grouping, exact for any amount (never through a float); dates in Bangladesh time (`১৭ অক্টোবর ২০২৬`). Phone numbers, NIDs, record numbers and ledger addresses stay in English digits; `latinDigits()` reads Bengali digits typed into a field.
- People's own writing (names, notes, addresses) and raw ledger values are marked `translate="no"`: they stay as written.
- One word per idea in each language (for example booking, not reservation; বীমা, not বিমা); a test rejects the retired words. The terms, the rules and open questions for the reviewer are in [docs/bengali-glossary.md](docs/bengali-glossary.md).

## Design

The theme is in [src/index.css](src/index.css): WeGro's palette as `--wegro-*` colours, and the tokens screens use (`primary`, `brand`, `success`, `warning`, `danger`, `neutral`, `muted`, and their `-soft` and `-on-soft` pairs). Use the tokens, never raw colours: each text colour is noted in the CSS with its contrast, at least 4.5:1 for normal text.

- Type: Manrope, with Noto Sans Bengali for Bengali letters.
- Touch: every control is at least 44 px each way on a phone, links inside running text excepted. A link that opens a card covers the whole card (`after:absolute after:inset-0`).
- Pieces in [src/components](src/components): `PageHeader`, `StatCard`, `StatusPill` (always a word with the colour), `StepIcon`, `PersonCell`, `SearchBox`, `Pager`, `PhotoPicker`, `LoadingState`, `EmptyState`, `ErrorState`, `Logo`. `/design` shows them in development.

## Offline and installable

The production build is an installable app (`vite-plugin-pwa`, configured in [vite.config.ts](vite.config.ts)). `npm run dev` leaves the offline worker out; check offline behaviour with `npm run build && npm run preview`.

- Without internet the app still opens: its own files are kept on the device, and so is the catalog, which farm updates need. Nothing else from the API is cached, so people's and money data never stay on a shared phone.
- Opening offline enters the account of the person last signed in on the device (their id, role and status only, no token) and reconnects once online. A sign-out made offline is completed the next time the device is online.
- Field officers' farm updates work offline: drafts with photos are kept per person in IndexedDB ([src/lib/drafts.ts](src/lib/drafts.ts)) and sent automatically once online, one outcome per draft and never a duplicate. Their open projects are kept on the phone for choosing, and cleared at sign-out.
- A new version shows "A new version of WeGro is ready" with Reload; open apps check every hour.

## Speed

NFR-4 asks for pages that open in under 2 seconds. `npm run e2e:speed` checks it on the production build, on desktop and on a phone slowed to 4G outside the cities (150 ms round trips, 1.6 Mbit/s) with a 4× slower processor. Last measured (28 Oct 2026): reopening the app took at most 0.6 s on desktop and 1.9 s on that phone (the staff dashboard is the slowest); moving between pages took at most 1 s.

What keeps it fast, and should be kept:

- Every page is its own chunk (TanStack Router `autoCodeSplitting`), loaded when first opened or when a link is pointed at.
- At start-up ([src/app/startup.ts](src/app/startup.ts)) the session is renewed while the language and the first page's code load, and the frame's data (who you are, the unread count, the catalog) is asked for as soon as the session is known. A route can ask for its page's data in a `loader` (the dashboard does).
- The backend compresses its answers (not sign-in and session answers).
- Formatters are made once, not per figure; long pages lay out lower sections only when scrolled near (`content-visibility: auto`).

## Tests

**Unit and page tests** (`npm test`, Vitest): page tests run in jsdom with Testing Library through [src/test/render.tsx](src/test/render.tsx) (the app's store, a memory router, a fake server per test); everything else runs in Node. They need nothing running.

**End-to-end** (`npm run e2e`, Playwright, [e2e/](e2e)): a real browser against the running dev stack, desktop (1280 px) and phone (390 px), one test at a time. About 32 minutes for the full run.

| File | What it checks |
|---|---|
| `invest.spec.ts` | A project's life: an admin drafts an insured project and publishes it; the investor books every unit and sends proof of a cash payment; Accounts accepts it; the officer sends the first farm update; Operations proposes a seed voucher and Accounts approves it; Accounts adds a cost with its bill photo; a flood is recorded, the insurer sets the cover, the officer claims, the insurer approves and Accounts records the payment |
| `onboard.spec.ts` | A field officer registers a farmer; an admin verifies them |
| `market.spec.ts` | A buyer offers on a WeGro listing; an admin approves; Accounts confirms the payment |
| `accessibility.spec.ts` | axe (WCAG 2.1 AA) on the sign-in page in both languages and on every role's menu pages and one record of each kind; on the phone also 44 px targets and no sideways scrolling |
| `bengali.spec.ts` | The same pages in Bengali: no English sentence or English dictionary string shows, nothing scrolls sideways |
| `speed.spec.ts` | Run by `npm run e2e:speed` only (above) |

Before running them:

1. The dev stack running (chain, backend, and `npm run dev`), with `DEMO_MODE=true` and the sample data loaded (`npm run data:reset … --seed`): the tests sign in as each role's demo account and use the sample listings.
2. The Playwright browser, once: `npx playwright install chromium`. On Ubuntu 26.04, which Playwright does not list yet, use `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx playwright install chromium`.
3. To include the super admin, export `E2E_SUPER_ADMIN_PASSWORD` (and `E2E_SUPER_ADMIN_PHONE` if not `01711000000`); without it those tests are skipped. Keep it out of the repository.

Notes:

- Sign-ins are paced under the backend's limit of 10 a minute, so runs take a while; that is why there is one worker.
- Each run adds its own records (projects named `E2E Maize <tag>`), so the tests can run again on the same data.
- Demo accounts remember their language; the tests set the one they expect at each sign-in.
- A failure leaves a screenshot, the page as text and a trace in `e2e-results/`; the HTML report is in `e2e-report/` (`npx playwright show-report e2e-report`). Both are ignored by git and by the dev server's reload.
- Run part: `npx playwright test e2e/invest.spec.ts --project=phone`, or `-g "farmer"`.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Every API call fails with 502 or "Can't reach WeGro" | The backend is not running on :3000, or `BACKEND_URL` points elsewhere |
| The type check fails after a backend change | Run `npm run api:generate` with the backend running, then word any new code in `en.ts` and `bn.ts` |
| e2e tests stop at sign-in | Demo mode is off, or the sample data was not loaded, or `E2E_SUPER_ADMIN_PASSWORD` is wrong |
| `npx playwright install` fails on Ubuntu 26.04 | Use the `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64` form above |
| The preview shows an old version | The offline worker kept it: Reload in the prompt, or clear the site's data in the browser |

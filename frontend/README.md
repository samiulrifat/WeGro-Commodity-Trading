# Frontend

The WeGro web app: React 19 and TypeScript on Vite, Tailwind CSS with shadcn/ui, TanStack Router, Redux Toolkit with RTK Query, and i18next for English and Bengali. It talks only to the backend's REST API.

The build plan is in [TODO.md](TODO.md).

## Setup

Requires Node.js 22 or newer and the backend running (see [../backend/README.md](../backend/README.md)).

```bash
npm install
npm run dev        # http://localhost:5173
```

The dev server passes `/api` to the backend at `http://localhost:3000`. To point elsewhere, copy `.env.example` to `.env.local` and change `BACKEND_URL`. Nothing in these files is secret: every `VITE_` value ends up in the browser.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server with instant reload |
| `npm run build` | Type-check, then build into `dist/` |
| `npm run preview` | Serve the built app locally |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | oxlint with type information |
| `npm run format` / `format:check` | Prettier (same settings as the backend) |
| `npm test` | Unit tests (Vitest) |
| `npm run api:generate` / `api:check` | Regenerate the API client from the running backend / check it is current |

## Design

The theme lives in [src/index.css](src/index.css): WeGro's palette as `--wegro-*` colours, and the semantic tokens screens use (`primary` for main actions, `brand`, `success`, `warning`, `danger`, `neutral`, `muted`). Use the tokens, never raw colours, so contrast stays right and dark mode can be added by redefining them.

- **Colours**: brand green `#045747` and logo orange from the logo; leaf green, amber and red from WeGro's product. Where a product colour is too faint for text on white, a darker shade of the same hue is used for text (each is noted in the CSS with its contrast).
- **Type**: Manrope; Bengali letters come from Noto Sans Bengali automatically.
- **Sizes**: buttons and inputs are at least 44 px wherever a finger may press; the `sm` sizes are for mouse-driven dense tables and grow on touch screens.
- **Components**: shadcn/ui primitives in `src/components/ui/`; WeGro pieces in `src/components/`: `StatCard`, `StatusPill` (always a word with the colour), `StepIcon`, `PageHeader`, `PersonCell`, `Logo`.

## API

Every backend route has a generated RTK Query hook, typed from the backend's OpenAPI document:

```ts
import { useProjectsListQuery } from '@/api/generated/projects';

const { data } = useProjectsListQuery({ page: 1, stage: 'open_for_funding' });
data?.data; // ProjectDto[]
data?.meta; // { page, limit, total, totalPages }
```

- Responses are exactly what the backend sends: `{ data }`, or `{ data, meta }` for pages.
- `npm run api:generate` (backend running) rewrites `src/api/generated/` from the backend's docs; never edit those files. `npm run api:check` fails if they are out of date. The backend's chain tests check every response against those same docs.
- [src/api/http.ts](src/api/http.ts) sends every request: it adds the access token and, on a 401, renews the session once (the refresh token is an httpOnly cookie) and repeats the request.
- [src/api/errors.ts](src/api/errors.ts): `toApiError(error)` gives one shape for any failure: kind (`invalid`, `conflict`, `unavailable`, `network`, ...), messages, the server's `code`, `details` and `requestId`. Show it with `errorText()` (see Language).
- [src/api/files.ts](src/api/files.ts): `usePhotoUploadMutation`, `useApiFile(path)` for photos and QR codes, `downloadFile(path)` for CSV reports.

## Language

English by default; the `EN | বাংলা` switch ([LanguageSwitch](src/components/language-switch.tsx)) changes the whole app at once. The choice is remembered on the device, and once signed in it is saved to the person's account (`PATCH /api/auth/me`) and follows them to other devices: signing in takes the account's language, or saves the one picked on the sign-in page if the account has none yet.

- Words live in [src/i18n/en.ts](src/i18n/en.ts) and [bn.ts](src/i18n/bn.ts). English is the source of every key; the type check fails if Bengali misses one, and a test checks both fill in the same values. Bengali is downloaded only when chosen.
- Numbers in sentences always take a format, so Bengali gets Bengali digits: `{{n, number}}`, `{{amount, taka}}`, `{{at, date}}`, `{{at, datetime}}`, `{{role, role}}`; counted words nest a plural, `$t(units.slot, {"count": {{slots}} })`.
- Formats ([src/lib/format.ts](src/lib/format.ts), or `useFormat()` in components): taka as `৳ 1,234,567.50`, poisha only when there are some, exact for any amount (never through a float); short figures `৳ 657.7M` (`৳ ৬৫৭.৭ মিলিয়ন`); dates `17 Oct 2026` (`১৭ অক্টোবর ২০২৬`), always in Bangladesh time, and `YYYY-MM-DD` days never shifted. Phone numbers, NIDs, record numbers and ledger addresses stay in English digits; `latinDigits()` turns Bengali digits typed into a field into ones the API reads.
- Server text: `errorText(apiError, i18n)` words an error by its `code` and `details`, including each input check (`details.fields`) and each problem of a list (`details.problems`); `fieldErrors(apiError, i18n)` gives a form one message per field. A ledger refusal shows the server's English to English readers and a sentence for its kind to others. `notificationText(n, i18n)` words a notification by its `kind` and `params`, keeping the English of ones saved before their values were. Where the server sends a Bengali form of a name (`labelBn`, `produceBn`), Bengali readers get it.
- Every error code, input rule and notification kind must have wording: `npm run api:generate` writes the backend's lists to `src/api/generated/codes.ts` and `notifications.ts`, and the type check fails if `en.ts` misses one (and `bn.ts` must match `en.ts`).

## App shell

Routes are files under [src/routes](src/routes): one per page, and each page's code loads only when it is opened. `npm run dev` and `npm run build` regenerate `src/routeTree.gen.ts` (never edit it).

- [src/app/navigation.ts](src/app/navigation.ts) is the one map of who sees what: each role's menu in order, its first entry being where the role lands. The same map guards pages: a page names its area (`staticData: { area: 'projects' }`) and a role without that area sees "not available for your role" instead (its data is never requested). Pages without an area (account, notifications) are open to everyone signed in.
- Every signed-in page sits under `_app`: on a page load the session is restored from the refresh cookie; signed-out people go to `/sign-in` and come back afterwards; a temporary password allows only `/change-password`; someone not verified yet sees only `/status`.
- Desktop: sidebar, top bar with language, notifications and account. Phone: the top bar and a bottom bar with up to five places (four and "More" when there are more).
- States for any page: `LoadingState`, `EmptyState`, `ErrorState` (worded in the reader's language, with the reference to quote) in [src/components/states.tsx](src/components/states.tsx); the router shows them while a page loads or if it fails, and not-found for unknown addresses.
- `/sign-in` offers the demo accounts when the backend runs in demo mode (`DEMO_MODE=true`); sign-in with phone and password comes in item 7. `/design` shows the design system, in development only.

## Signing in

- `/sign-in`: mobile number (any common form, Bengali digits too) and password; a "Demo" tab with the role picker when the backend runs in demo mode. Refusals are worded from their codes: wrong details, a lockout with its minutes, a registration still being confirmed. If a session ended on its own (it lapsed, or the password was changed elsewhere), the page says so.
- A temporary password (new accounts, admin resets) leads to `/change-password`, where the person chooses their own before anything else.
- `/forgot-password`: number, the 6-digit code from the SMS (locally, from the backend log), a new password; it ends signed in, every other device signed out.
- Password fields can show what was typed; new passwords need 10 to 128 characters, typed twice ([password-rules.ts](src/app/auth/password-rules.ts)).

## Signing up and People

- `/sign-in` is WeGro's sign-in box: Sign in | Demo, and inside Sign in, Email | Phone (an email signs in once confirmed). Below the button, "Don't have an account? Register" leads to `/register`.
- `/register`: investors and buyers sign up in steps (role, number confirmed by an SMS code, details as on the NID, password and an optional email), are registered and verified at once and signed in; an email given is then confirmed by a code, or later in My account. Farmers are registered by their field officer, everyone else by WeGro.
- Every list has a search box with a Find button ([search-box.tsx](src/components/search-box.tsx)) and pages ([pager.tsx](src/components/pager.tsx)); what it searches is kept in the address. People are found by any whole word of their name, a mobile number or an NID.
- People (`/people`, [src/features/people](src/features/people)): the list with search and filters kept in the address; waiting for verification; registering someone in steps, the details checked on the server before anything is saved (each rule worded in en/bn, warnings shown, duplicates caught), the temporary password shown once and texted; a person's page (details masked for auditors) with verify (warnings acknowledged), reject with a reason, assign field officer, reset password, replace key, sync and a check against the ledger; details-change requests reviewed side by side. Field officers see "Farmers": their own, and registering a farmer.
- Sections with several pages are a dropdown in the sidebar (one open at a time) and tabs under the page title on phones; the map is `pages` in [src/app/navigation.ts](src/app/navigation.ts), and a route names its page (`staticData: { area, page }`) so roles without it see "not available".
- Page tests run in jsdom with Testing Library ([src/test/render.tsx](src/test/render.tsx): the app's store, a memory router and a fake server); other tests run in Node.
- Shared pieces for a person's details: `PersonFields`, `ConfirmCodeBox` with `useConfirmCode` (a code to a number or address), `IdCheckList`.

## My account

`/account`, for everyone signed in ([src/app/account](src/app/account)):

- My details in full, and changing them: a new number is confirmed by a code sent to it, then the change waits for an admin (the super admin for staff); the page shows it waiting, with what was asked for and a way to take it back, or how it was decided and why. Changing again starts from the change still waiting. The super admin's name and number change at once.
- Language, saved to the account (the app, notifications and SMS use it everywhere).
- Change password: every other device is signed out, this one carries on.
- Staff see their ledger account (the address that signs what they do on the ledger), with copy.
- Sign out everywhere, after a confirmation.

## Installable and offline

The production build is an installable app (`vite-plugin-pwa`, config in [vite.config.ts](vite.config.ts)). `npm run dev` leaves the offline worker out, so development never serves stale files; check these features with `npm run build && npm run preview` (http://localhost:4173, same `/api` proxy).

- Without internet the app still opens: its own files are kept on the device, and so is the catalog (needed to fill in farm updates). Nothing else from the API is cached, so people's and money data never stay on a shared phone; those pages say the device is offline.
- Opening offline enters the account of the person last signed in on this device (only their id, role and status are remembered, no token); it reconnects when online and signs out properly if the server refuses. A sign-out made offline is finished first the next time the device is online.
- Drafts: [src/lib/drafts.ts](src/lib/drafts.ts) keeps unsent work in IndexedDB (photos included), per person, until it is sent or deleted, and asks the browser to keep its storage. `useDrafts(kind)` lists the signed-in person's drafts and stays current, across tabs too.
- A new version shows "A new version of WeGro is ready" with Reload; open apps check hourly. "Install app" appears in the account menu and on the sign-in page where the device allows it (on iPhone, the Add to Home Screen steps).
- Icons in `public/` are made from the WeGro mark: 192 and 512, maskable 512 (the mark inside the safe zone), Apple touch 180.

## Layout

```
src/
  app/          router, navigation map, shell, session guards, shared pages
  routes/       one file per page (routeTree.gen.ts is generated from them)
  api/          RTK Query base API, generated API types
  store/        Redux store and app-wide slices
  features/     one folder per business area: pages, components, api.ts
  components/   shadcn/ui primitives (ui/) and shared pieces
  i18n/         English and Bengali
  lib/          formatting and helpers
  assets/brand/ WeGro logo (full colour, on dark) and mark
```

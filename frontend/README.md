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
- [src/api/errors.ts](src/api/errors.ts): `toApiError(error)` gives one shape for any failure: kind (`invalid`, `conflict`, `unavailable`, `network`, ...), messages, the server's `code` and `requestId`.
- [src/api/files.ts](src/api/files.ts): `usePhotoUploadMutation`, `useApiFile(path)` for photos and QR codes, `downloadFile(path)` for CSV reports.

## Layout

```
src/
  app/          router, providers, layout shell, route guards
  api/          RTK Query base API, generated API types
  store/        Redux store and app-wide slices
  features/     one folder per business area: pages, components, api.ts
  components/   shadcn/ui primitives (ui/) and shared pieces
  i18n/         English and Bengali
  lib/          formatting and helpers
  assets/brand/ WeGro logo (full colour, on dark) and mark
```

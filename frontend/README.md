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

## Design

The theme lives in [src/index.css](src/index.css): WeGro's palette as `--wegro-*` colours, and the semantic tokens screens use (`primary` for main actions, `brand`, `success`, `warning`, `danger`, `neutral`, `muted`). Use the tokens, never raw colours, so contrast stays right and dark mode can be added by redefining them.

- **Colours**: brand green `#045747` and logo orange from the logo; leaf green, amber and red from WeGro's product. Where a product colour is too faint for text on white, a darker shade of the same hue is used for text (each is noted in the CSS with its contrast).
- **Type**: Manrope; Bengali letters come from Noto Sans Bengali automatically.
- **Sizes**: buttons and inputs are at least 44 px wherever a finger may press; the `sm` sizes are for mouse-driven dense tables and grow on touch screens.
- **Components**: shadcn/ui primitives in `src/components/ui/`; WeGro pieces in `src/components/`: `StatCard`, `StatusPill` (always a word with the colour), `StepIcon`, `PageHeader`, `PersonCell`, `Logo`.

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

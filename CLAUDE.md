# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**lll-experience** — a multi-app friend platform. Apps: **NFL Draft Predictor** and **UCSB Legacy** (Sleeper fantasy GM lab).

## Stack

- **Runtime**: Bun
- **Server**: Elysia v1.4 with TypeScript
- **Auth**: Clerk (via `elysia-clerk` + Clerk.js CDN on client)
- **Database**: Supabase (PostgreSQL) via Drizzle ORM + `postgres` driver
- **Frontend**: HTMX (CDN) + Tailwind CSS (CDN) + Sortable.js (CDN)
- **Templates**: TypeScript template literals in `src/views/templates.ts` — no build step

## Project Structure

```
src/
├── index.ts                    # Elysia server entry, route registration
├── db/
│   ├── index.ts                # DB singleton (Supabase via postgres-js + Drizzle)
│   └── schema.ts               # Drizzle schema: users, apps, draft_picks
├── config/
│   └── route-protection.ts     # isProtectedRoute() helper
├── middleware/
│   └── logger.middleware.ts    # Pino logger setup
├── guards/
│   └── auth-guard.ts           # Clerk auth guard for protected routes
├── models/
│   ├── base.model.ts           # Generic CRUD base class
│   └── users.model.ts          # Users model with findOrCreate
├── controllers/
│   └── draft.controller.ts     # All /draft/* HTMX routes
└── views/
    └── templates.ts            # All HTML template functions
```

## Key Patterns

- **Template functions** return HTML strings; every page/fragment is a named export in `templates.ts`
- **Auth flow**: Clerk.js loads on client → `window.__clerkToken` stores session token → `htmx:configRequest` injects `Authorization: Bearer` header for `/draft/*` and `/apps` → `authGuard` validates server-side
- **HTMX fragments**: routes under `/draft/picks` return HTML fragments (not full pages)
- **Sortable.js**: initialized via `htmx:afterSwap` when `#picks-list` is swapped in
- **No `.js` extensions** in imports — Bun resolves `.ts` directly

## Dev Commands

```bash
bun install          # install deps
bun run dev          # dev server with --watch
bun run lint         # tsc --noEmit
bun run db:generate  # generate Drizzle migrations
bun run db:studio    # open Drizzle Studio
```

## Environment Variables

Copy `.env.example` → `.env` and fill in:
- `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`
- `DATABASE_URL` (Supabase pooler, port 6543)
- `DIRECT_URL` (Supabase direct, port 5432 — for migrations)

## Database Schema

- `users` — Clerk-linked users
- `apps` — platform apps (seed: `nfl-draft`, `ucsb-legacy`)
- `draft_picks` — per-user pick list with pick order, player, team, position
- `fantasy_*` — Sleeper UCSB LEGACY history (leagues, managers, rosters, drafts, matchups, player weeks, transactions)

## UCSB Legacy (`/fantasy`)

Sleeper league **UCSB LEGACY** (current id `1386100455410528256`, walks `previous_league_id` back to 2023). Auction $200, FAAB $100, PPR best-ball, weekly median match. No playoff trophy — standings show W-L **and** points, never an invented champion.

```bash
bun run sleeper:ingest          # pull history + player cache
bun run sleeper:ingest -- --skip-players
```

Cron: `GET /api/cron/sync-sleeper` (Bearer `CRON_SECRET`). `?players=0` skips the 5MB player map.

## Adding New Apps

1. Add a row to `apps` table (slug, name, description)
2. Create `src/controllers/{app}.controller.ts`
3. Register the controller in `src/index.ts`
4. Add template functions to `src/views/templates.ts` (or a new templates file)

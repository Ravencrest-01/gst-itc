# gst-itc — GST ITC Recovery Platform

Reconciles purchase registers against GSTR-2B, ranks the input tax credit at risk before the Section 16(4) deadline, and drives vendor follow-up.

Stack: Next.js 15 (App Router) · React 19 · Tailwind v4 · Drizzle ORM · Neon Postgres · Vitest.

## Status

| Roadmap | State |
|---|---|
| Day 1 — schema, migrations, seed | Done (`src/db/schema.ts`, `drizzle/0000_init.sql`, `scripts/seed.ts`). Not yet applied to a database. |
| Day 3 — normalization & hash | Done (`src/lib/gst/`) |
| Day 4 — multi-pass matching | Done (`src/lib/reconciliation/engine.ts`) |
| Day 5 — 16(4) classifier & vendor aggregation | Done (`engine.ts`, `aggregate.ts`) |
| Day 2 — streaming ingestion | Next |

See [docs/SPEC-CHANGES.md](docs/SPEC-CHANGES.md) for where and why this departs from the original spec.

## Setup

```bash
pnpm install
cp .env.example .env    # fill in your Neon connection strings
pnpm db:migrate         # apply drizzle/ migrations
pnpm db:seed            # sample tenant covering every match status
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm test` | Unit tests (normalization, matching, 16(4), aggregation, 10k performance) |
| `pnpm benchmark [n]` | Engine benchmark on n synthetic invoices (default 50,000) |
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | Static checks and production build |
| `pnpm db:generate` | New migration after editing `src/db/schema.ts` |
| `pnpm db:migrate` / `pnpm db:check` | Apply / verify migrations |

## Engine usage

```ts
import { reconcile } from '@/lib/reconciliation/engine';
import { aggregateByVendor } from '@/lib/reconciliation/aggregate';

const { results, summary } = reconcile(prRows, gstr2bRows, { asOf: '2026-11-06' });
const vendors = aggregateByVendor(results); // sorted by ITC at risk; dunningEligible >= ₹5,000
```

The engine is pure and synchronous: callers load rows, call it, and persist `results` into `match_results`.

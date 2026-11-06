# gst-itc — GST ITC Recovery Platform

Reconciles purchase registers against GSTR-2B, ranks the input tax credit at risk before the Section 16(4) deadline, and drives vendor follow-up.

Stack: Next.js 15 (App Router) · React 19 · Tailwind v4 · Drizzle ORM · Neon Postgres · Vitest.

## Status

| Roadmap | State |
|---|---|
| Day 1 — schema, migrations, seed | Done (`src/db/schema.ts`, `drizzle/0000_init.sql`, `scripts/seed.ts`). Not yet applied to a Neon database; tested against PGlite. |
| Day 2 — streaming ingestion | Done (`src/lib/ingestion/`) |
| Day 3 — normalization & hash | Done (`src/lib/gst/`) |
| Day 4 — multi-pass matching | Done (`src/lib/reconciliation/engine.ts`) |
| Day 5 — 16(4) classifier & vendor aggregation | Done (`engine.ts`, `aggregate.ts`) |
| Day 6 — GSP mock & email dispatch | Next |

## Ingestion

`runIngestionJob(db, { organizationId, source, fileName, input })` in `src/lib/ingestion/db-sink.ts` streams a file into the invoice tables and records the upload in `ingestion_batches`.

- **Formats:** CSV, XLSX (streamed sheet by sheet), and the GST portal's GSTR-2B JSON (b2b, b2ba, cdnr, cdnra).
- **Header detection:** finds the header row under title blocks and merges two-row headers (the GSTR-2B Excel layout). Columns are mapped automatically from known Tally/Busy/portal names; the user's choices from the mapping UI override this.
- **Values:** Indian date formats, Excel serial dates, `1,23,456.78`, `(1,200)`, `Cr`/`Dr`. A row with all-negative amounts is treated as a credit note.
- **Errors:** rows are validated one by one. A malformed GSTIN or date rejects that row with its row number; a GSTIN that fails the check digit is kept with a warning.
- **Writes:** batches of 1,000, upserted on `(organization_id, normalization_hash)`, so re-uploading a file updates rows instead of duplicating them. Duplicate invoices in a purchase register are reported. GSTR-2B amendments replace the original document.
- **Speed:** about 1 s per 50,000 CSV rows.

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

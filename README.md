# gst-itc — GST ITC Recovery Platform

Reconciles purchase registers against GSTR-2B, ranks the input tax credit at risk before the Section 16(4) deadline, and drives vendor follow-up.

Stack: Next.js 15 (App Router) · React 19 · Tailwind v4 · Drizzle ORM · Neon Postgres · Vitest.

## Status

| Roadmap | State |
|---|---|
| Day 1 — schema, migrations, seed | Done (`src/db/schema.ts`, `drizzle/`, `scripts/seed.ts`). Runs on the embedded local Postgres; not yet applied to Neon. |
| Day 2 — streaming ingestion | Done (`src/lib/ingestion/`) |
| Day 3 — normalization & hash | Done (`src/lib/gst/`) |
| Day 4 — multi-pass matching | Done (`src/lib/reconciliation/engine.ts`) |
| Day 5 — 16(4) classifier & vendor aggregation | Done (`engine.ts`, `aggregate.ts`, `service.ts` saves runs) |
| Day 6 — mock GSP & email dunning | Done (`src/lib/gsp/`, `src/lib/notifications/`, `src/lib/dunning/`). Email goes to Mailpit; no external APIs until after MVP. |
| Day 7 — WhatsApp & delivery webhooks | Next |

## Quick start (no accounts needed)

```bash
pnpm install
docker compose up -d mailpit   # local inbox at http://localhost:8025
pnpm demo                      # seed → mock GSTR-2B → reconcile → vendor emails
```

`pnpm demo --as-of=2026-11-06` fixes the date. Running it again with `--as-of` set 5 and then 10 days later shows the escalation stages. `--dry-run` previews emails without sending. Without Docker, use `EMAIL_TRANSPORT=memory pnpm demo`.

The database defaults to an embedded Postgres in `./.data/pglite`. Set `DATABASE_URL` to a Neon connection string to use Neon instead.

## GSTR-2B sync (mock GSP)

`GspProvider` (`src/lib/gsp/provider.ts`) is the interface a licensed GSP integration will implement after MVP. For now, `MockGspProvider` does the following:
- If a real portal download exists at `<fixturesDir>/<GSTIN>/<MMYYYY>.json`, it returns that file.
- Otherwise, `createPurchaseBackedMockGsp` builds the month's GSTR-2B from the company's own purchases and adds realistic supplier errors (deterministic for a given seed). About 12% of invoices are left out, about 5% have wrong tax amounts, about 2% use the wrong tax head, some numbers are re-keyed, and a few extra documents the buyer never booked are added.

`syncFinancialYear` fetches each month and ingests it through the normal upload pipeline.

## Vendor dunning (email)

`dispatchDunningEmails(db, { organizationId, runId, transport, appBaseUrl, from })` in `src/lib/dunning/dispatcher.ts`:
- **Who gets an email:** vendors with at least ₹5,000 of ITC they can fix (missing in 2B, value mismatch, wrong tax head, wrong GSTIN). Lapsed and ineligible ITC are excluded.
- **Cadence:** T+0 reminder, T+5 detailed reminder, T+10 final notice that payments are on hold, with the buyer's finance managers in CC. The cadence follows each vendor across reconciliation runs (30-day window), so re-running reconciliation does not restart it. A vendor reply stops it.
- **Email contents:** an HTML and plain-text email with an itemised table, a CSV discrepancy statement attached, and a private statement link (random token, stored only as a SHA-256 hash, with an expiry date).
- **Records:** each email is logged in `vendor_communications`, one per vendor, run and stage. A failed send is retried in place on the next dispatch. An email that was actually sent is never marked failed.
- **Transport:** `EmailTransport` is the swap point. The MVP uses SMTP to Mailpit (`EMAIL_TRANSPORT=smtp`, `SMTP_HOST`, `SMTP_PORT`). Resend will be added after MVP.

## Ingestion

`runIngestionJob(db, { organizationId, source, fileName, input })` in `src/lib/ingestion/db-sink.ts` streams a file into the invoice tables and records the upload in `ingestion_batches`.

- **Formats:** CSV, XLSX (streamed sheet by sheet), and the GST portal's GSTR-2B JSON (b2b, b2ba, cdnr, cdnra).
- **Header detection:** finds the header row under title blocks and merges two-row headers (the GSTR-2B Excel layout). Columns are mapped automatically from known Tally/Busy/portal names; the user's choices from the mapping UI override this.
- **Values:** Indian date formats, Excel serial dates, `1,23,456.78`, `(1,200)`, `Cr`/`Dr`. A row with all-negative amounts is treated as a credit note.
- **Errors:** rows are validated one by one. A malformed GSTIN or date rejects that row with its row number; a GSTIN that fails the check digit is kept with a warning.
- **Writes:** batches of 1,000, upserted on `(organization_id, normalization_hash)`, so re-uploading a file updates rows instead of duplicating them. Duplicate invoices in a purchase register are reported. GSTR-2B amendments replace the original document.
- **Speed:** about 1 s per 50,000 CSV rows.

See [docs/SPEC-CHANGES.md](docs/SPEC-CHANGES.md) for where and why this departs from the original spec.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm demo` | Full pipeline demo into Mailpit (see Quick start) |
| `pnpm mailpit:up` | Start Mailpit (`docker compose up -d mailpit`) |
| `pnpm db:seed` | Demo organization, users, vendors and a year of purchases |
| `pnpm test` | Unit and integration tests (engine, ingestion, mock GSP, email, dispatch on PGlite) |
| `pnpm benchmark [n]` | Engine benchmark on n synthetic invoices (default 50,000) |
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | Static checks and production build |
| `pnpm db:generate` | New migration after editing `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations to the local database or Neon (based on `DATABASE_URL`) |
| `pnpm db:check` | Verify migration files are consistent |

## Engine usage

```ts
import { reconcile } from '@/lib/reconciliation/engine';
import { aggregateByVendor } from '@/lib/reconciliation/aggregate';

const { results, summary } = reconcile(prRows, gstr2bRows, { asOf: '2026-11-06' });
const vendors = aggregateByVendor(results); // sorted by ITC at risk; dunningEligible >= ₹5,000
```

The engine is pure and synchronous: callers load rows, call it, and persist `results` into `match_results`.

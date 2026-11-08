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
| Day 7 — WhatsApp & delivery webhooks | Done (`src/lib/notifications/whatsapp/`, `src/app/api/webhooks/whatsapp/route.ts`). Mirrored into Mailpit; no provider until after MVP. |
| Day 8 — REST API & exports | Done (`src/app/api/`, services in `src/lib/api/`) |
| Day 9 — Upload screen with column mapping | Done (`/upload`, `src/components/upload/`) |
| Day 10 — Reconciliation workbench | Done (`/reconciliation`, `src/components/reconciliation/`) |
| Day 11 — Vendor recovery centre | Next |

## Quick start (no accounts needed)

```bash
pnpm install
docker compose up -d mailpit   # local inbox at http://localhost:8025
pnpm demo                      # seed → mock GSTR-2B → reconcile → email + WhatsApp → receipts
```

`pnpm demo --as-of=2026-11-06` fixes the date. Running it again with `--as-of` set 5 and then 10 days later shows the escalation stages. `--dry-run` previews emails without sending. Without Docker, use `EMAIL_TRANSPORT=memory pnpm demo`.

The database defaults to an embedded Postgres in `./.data/pglite`. Set `DATABASE_URL` to a Neon connection string to use Neon instead.

### The app

```bash
pnpm db:seed    # demo company and a year of purchases (or start from your own upload)
pnpm dev        # http://localhost:3000
```

The upload screen (`/upload`) works in four steps:
1. **Choose and drop a file.** Pick purchase register or GSTR-2B, then drop a CSV, Excel or portal JSON file.
2. **Check the columns.** The detected columns are shown with sample values, and you can change any mapping. The first rows are re-checked live, so date or GSTIN problems show up before anything is saved.
3. **Import.** A progress bar runs while the file uploads. Afterwards you see row counts and every rejected row with the reason.
4. **Reconcile.** Run reconciliation from the same screen. For GSTR-2B you can skip files entirely: "Fetch 12 months" pulls a year from the mock portal.

The reconciliation screens (`/reconciliation`) work like this:
- **Runs list.** Lists every run with its totals; "New run" starts one for a chosen financial year.
- **Workbench (`/reconciliation/:id`).**
  - **Summary.** Tiles show invoices reconciled, invoices needing attention, ITC at risk (after manual changes) and credit you can still claim.
  - **Filtering.** Search by invoice number, GSTIN or vendor; filter with status chips (with counts) or the Section 16(4) risk toggle. Filters and sorting live in the URL, so a view can be bookmarked or shared.
  - **The table.** It loads 200 rows at a time as you scroll and draws only the visible rows (TanStack Table v9 + TanStack Virtual), so large runs stay fast. Sorting happens on the server (vendor, date, ITC at risk, status, deadline).
  - **Detail panel.** Click a row to see your books and GSTR-2B side by side with differences highlighted, the engine's reasons, the deadline countdown, and the audit history. You can change the status there with a required reason. Marking an item resolved clears its ITC at risk everywhere and stops reminders for it.
  - **Reminders.** Select invoices, then "Trigger vendor reminders" sends one message per vendor by email and/or WhatsApp. You can preview first, or escalate to the next stage right away.
  - **Export.** CSV and Excel downloads use the current filters.

The embedded database is single-process. Stop `pnpm dev` before running `pnpm demo` or `pnpm db:seed` against the same `.data` folder.

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
- **Channels:** email and WhatsApp each follow their own cadence; one statement link per vendor is shared by both.
- **Transport:** `EmailTransport` is the swap point. The MVP uses SMTP to Mailpit (`EMAIL_TRANSPORT=smtp`, `SMTP_HOST`, `SMTP_PORT`). Resend will be added after MVP.

## Ingestion

`runIngestionJob(db, { organizationId, source, fileName, input })` in `src/lib/ingestion/db-sink.ts` streams a file into the invoice tables and records the upload in `ingestion_batches`.

- **Formats:** CSV (streamed), XLSX (up to 20 MB, every sheet), and the GST portal's GSTR-2B JSON (b2b, b2ba, cdnr, cdnra).
- **Header detection:** finds the header row under title blocks and merges two-row headers (the GSTR-2B Excel layout). Columns are mapped automatically from known Tally/Busy/portal names; the user's choices from the mapping UI override this.
- **Values:** Indian date formats, Excel serial dates, `1,23,456.78`, `(1,200)`, `Cr`/`Dr`. A row with all-negative amounts is treated as a credit note.
- **Errors:** rows are validated one by one. A malformed GSTIN or date rejects that row with its row number; a GSTIN that fails the check digit is kept with a warning.
- **Writes:** batches of 1,000, upserted on `(organization_id, normalization_hash)`, so re-uploading a file updates rows instead of duplicating them. Duplicate invoices in a purchase register are reported. GSTR-2B amendments replace the original document.
- **Speed:** about 1 s per 50,000 CSV rows.

See [docs/SPEC-CHANGES.md](docs/SPEC-CHANGES.md) for where and why this departs from the original spec.

## WhatsApp

- **Messages:** built as exact Meta Cloud API template requests (`buildMetaTemplateMessage`), with one template per stage: `itc_reconciliation_alert`, `itc_reconciliation_reminder`, `itc_reconciliation_final_notice`. The body follows the spec's wording. Numbers are normalized to E.164; landlines and foreign numbers are skipped with a reason.
- **Local delivery:** `WHATSAPP_TRANSPORT=mailpit` (the default) mirrors each message into Mailpit as `<number>@whatsapp.local`, showing the phone text and the request that would be sent. `memory` keeps messages in-process; `none` turns the channel off.
- **Webhook:** `/api/webhooks/whatsapp` answers Meta's GET verification handshake. POST checks `X-Hub-Signature-256` (required in production) and applies delivery receipts in order. Statuses never move backwards (SENT → DELIVERED → READ), and a failure reported after delivery is ignored.
- **Replies:** a reply quoting our message, or a free-text reply from the same number, marks it RESPONDED. That stops escalation on email and WhatsApp for that vendor.
- **Demo:** `pnpm demo` simulates delivery and read receipts plus one vendor reply through the same processing code (`--no-simulate` skips this).

## API

Errors come back as JSON `{ error, details? }`: 400 for validation, 404, 409, and 422 for an unusable upload. There is no login until Day 13. Outside production, `AUTH_MODE=dev` takes the organization from the `x-organization-id` header, or uses the only one. In production the API refuses requests until authentication is configured.

| Method & path | Purpose |
|---|---|
| `POST /api/ingestion` | Multipart upload: `file`, `source` (`PURCHASE_REGISTER` or `GSTR2B`), optional `mapping` JSON. Returns row errors and the column mapping used. |
| `POST /api/ingestion/preview` | Same form fields; reads the file without saving and returns headers, sample rows, row counts, the column mapping and problems in the first rows |
| `GET /api/ingestion` | Recent uploads with status and error counts (`?source=`, `?limit=`) |
| `POST /api/gstr2b/sync` | `{ financialYear }` or `{ returnPeriod: "MM-YYYY" }` from the (mock) GSP |
| `POST /api/reconciliation/run` | `{ financialYear, asOf?, options? }` runs and stores a reconciliation |
| `GET /api/reconciliation/runs` | Recent runs |
| `GET /api/reconciliation/:id` | Run totals and breakdown by status |
| `GET /api/reconciliation/:id/results` | Paginated results. Filters: `status` (comma list), `risk164`, `lapsed`, `overridden`, `vendorId`, `q`, `minAtRisk`. Sorting: `sort` (`-itcAtRisk`, `invoiceDate`, `vendor`, `status`, `deadline`). Paging: `page`, `pageSize` (up to 500). Totals cover every row matching the filters. |
| `GET /api/reconciliation/:id/export?format=csv` or `xlsx` | Streams the same filtered results as CSV (UTF-8 with BOM) or Excel |
| `PATCH /api/reconciliation/results/:resultId` | `{ status or null, note }`: manual override with an audit note. Marking a result resolved clears its ITC at risk and stops reminders for it. |
| `GET /api/vendors/ledger` | Vendors ranked by recoverable ITC at risk, with compliance score, Section 16(4) exposure and the last message per channel |
| `POST /api/communications/dispatch` | `{ runId?, channels?, vendorIds?, force?, dryRun? }`. `vendorIds` with `force` is the one-click "remind now" |
| `GET /api/communications` | Message history with delivered, read and reply times |
| `GET /api/vendor/statement/:token` | Public statement behind the vendor link (no internal ids, never cached) |
| `GET`/`POST /api/webhooks/whatsapp` | Meta's verification handshake, then delivery and reply webhooks |

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

# Changes from the original specification

These are deliberate departures from *GST ITC Recovery Platform — Specification & 2-Week Roadmap*. Each one fixes a defect in the spec. Tests that enforce them are in `src/lib/**/*.test.ts`.

| # | Spec said | Problem | What we do instead | Where |
|---|-----------|---------|--------------------|-------|
| 1 | Hash = SHA256(GSTIN + InvNo + FY + Round(TaxableValue)) | Rounding to whole rupees splits ₹100.49 / ₹100.50 into different hashes, so the ₹1 tolerance never applies. The sample code also left out the FY. | Key = SHA256(GSTIN \| doc type \| canonical no. \| FY). Amounts are not in the key. The ₹1 tolerance is checked per tax head after lookup, so a same-reference invoice with different tax becomes `VALUE_MISMATCH` (as the spec defines it) instead of falling through. | `normalization.ts`, `engine.ts` Pass 1 |
| 2 | Regex `^(INV\|BILL\|FY\d{2}-\d{2})\/?` strips prefixes before hashing | Doesn't strip `FY24/` or `BILL-`, and it merges `INV123` with `123`, which causes false exact matches. | Two levels. **Canonical** (exact key): uppercase, leading zeros removed from each numeric run, separators removed, letters kept. **Core** (Pass 2): also strips INV/INVOICE/BILL/TAX INVOICE and real FY tokens (`FY24`, `2024-25`, `24-25`, which must be consecutive years) at the start or end. A core-number match still has to pass the date-window check. | `normalization.ts` |
| 3 | `SECTION_16_4_RISK` is both a match status and a boolean | Setting the status overwrites the real cause (e.g. `MISSING_IN_2B`). The Drizzle enum also left out `TAX_TYPE_MISMATCH`. | Section 16(4) is the `is_section_16_4_risk` flag plus `section_16_4_deadline`, `risk_tier` and `is_itc_lapsed`. The status enum matches between SQL and Drizzle, and adds `PROBABLE_MATCH` and `GSTIN_MISMATCH`. | `schema.ts` |
| 4 | Pass 2 matches IGST ↔ CGST+SGST shifts | Credit booked under the wrong tax head can't be claimed as-is. | Reported as `TAX_TYPE_MISMATCH`, with the full PR tax counted as at risk. This is checked per head in both passes. | `classifyPair` |
| 5 | `invoice_type` stored but not used | Credit/debit notes would match invoices with the same number and be added with the wrong sign. | `document_type` enum is part of the exact key and the Pass 2 grouping key. A missing or mismatched credit note is reported but not counted as ITC at risk, because it's a reversal exposure. | `engine.ts` |
| 6 | Schema gaps | `gstr2b_invoices` had no vendor link. No unique keys, so re-uploads duplicated rows. `match_results` had no tenant column. Statement links had no token store. | `gstr2b_invoices.vendor_id` (nullable). Unique `(organization_id, normalization_hash)` on both invoice tables, so uploads are idempotent upserts and B2BA amendments replace the original. `match_results.organization_id`/`vendor_id`, one result per invoice per run (partial unique indexes), CHECK that a result references at least one invoice. New tables: `vendor_statement_tokens` (hashed, expiring, revocable) and `ingestion_batches`. | `schema.ts` |
| 7 | 50MB uploads through route handlers | Vercel limits a function request body to about 4.5MB. | Files upload directly to blob storage (`ingestion_batches.blob_url`). A worker streams and parses them. To be built on Day 2 and Day 9. | — |
| 8 | Levenshtein over the remaining unmatched records | Comparing every record against every other blows the <5s per 10k target. | Pass 2 compares only within the same GSTIN and document type, uses a binary search to stay inside the ±30-day window, and skips pairs whose lengths differ too much to reach the threshold. A fuzzy number also needs the taxable value to agree. Measured: about 240 ms per 10k invoices. | `engine.ts` |
| 9 | `drizzle-kit push:pg` | Old command syntax. | `pnpm db:generate` / `pnpm db:migrate` (versioned SQL in `drizzle/`). | `package.json` |

## Additions

- **GSTIN checksum validation** (mod-36). Invalid GSTINs are listed in the run summary.
- **GSTIN_MISMATCH (Pass 2b)**: same PAN, different state GSTIN, same core number and value. This catches the "incorrect GSTIN tagging" loss that §1.1 mentions.
- **ITC opportunity**: credit that appears in 2B but isn't booked in the PR (`MISSING_IN_PR`, or 2B tax higher than PR tax). This is also subject to 16(4).
- **2B `itc_availability = N`** on a matched invoice counts as ITC at risk.
- **Lapsed ITC** (deadline passed) is reported separately and left out of the recoverable totals and dunning.
- **GSTR-9 filing date** can shorten the 16(4) deadline ("whichever is earlier").
- All money arithmetic is done in integer paise.

## Section 16(4) risk tiers (per result with exposure)

| Days to deadline | Tier |
|---|---|
| > risk window (default 60) | LOW |
| ≤ 60 | MEDIUM (flagged as 16(4) risk) |
| ≤ 30 | HIGH |
| ≤ 15, or lapsed | CRITICAL |

The vendor tier is the higher of the tier above and an amount-based tier: ≥ ₹25k MEDIUM, ≥ ₹1L HIGH, ≥ ₹10L CRITICAL. Dunning starts when a vendor has at least ₹5,000 of recoverable ITC at risk.

## Ingestion (Day 2)

- **CSV parser:** papaparse, not `csv-parser`. Its stream mode becomes quadratic when the file arrives as one large chunk (a 3 MB chunk took about 45 s), so input is re-cut into 64 KB chunks first.
- **ExcelJS streaming bug:** the reader crashes on workbooks whose sheets come before `workbook.xml` (the order ExcelJS itself writes). We work around it, but sheet names are lost for those files. GSTR-2B amendment sheets (B2BA/CDNRA) are therefore recognised by their duplicate "Invoice number" columns rather than by name, and skipped with a warning. Amendments should be ingested from the 2B JSON.
- **Database tests:** run against PGlite (in-process Postgres 17) using the real migration, so no Neon instance is needed.

## Mock GSP and email dunning (Day 6)

- **No external APIs before MVP.** Resend is replaced by SMTP to Mailpit, behind an `EmailTransport` interface, and the GSP is a mock behind `GspProvider`. Moving to Resend or a real GSP later means adding one implementation of each interface.
- **CSV instead of PDF.** The discrepancy ledger is attached as a CSV, not a PDF. Vendors can open it in Excel and correct their filings from it; a PDF can be added later.
- **Who gets dunned.** Only issues the vendor can fix by filing or amending GSTR-1 trigger emails. ITC that 2B marks ineligible, or that has already lapsed, is left out.
- **Cadence follows the vendor, not the run.** The spec's T+0/T+5/T+10 is measured from the first reminder within a 30-day window, so running reconciliation again does not send the first reminder again.
- **Payment hold.** The T+10 "finance hold" is recorded on the communication (`payload.paymentHold`), and the buyer's finance managers are copied. The payment-batch integration itself is outside the MVP.
- **Local database.** `DATABASE_URL` is optional. Without it, the app uses an embedded Postgres (PGlite) in `./.data/pglite`, so the full pipeline runs with no accounts.

## Still open (roadmap items, not done yet)

- GSP access for live GSTR-2B needs a licensed GSP/ASP agreement, so it stays mocked for now.
- Neon IP allowlisting needs Vercel Secure Compute (static egress IPs).
- Row-level security for tenant isolation (Day 13).

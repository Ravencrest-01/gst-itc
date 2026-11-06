/**
 * Engine benchmark (no database). Usage: pnpm benchmark [invoiceCount]
 */
import { gstinCheckDigit } from '../src/lib/gst/gstin';
import { aggregateByVendor } from '../src/lib/reconciliation/aggregate';
import { reconcile } from '../src/lib/reconciliation/engine';
import type { Gstr2bInvoiceInput, PrInvoiceInput } from '../src/lib/reconciliation/types';

const n = Number(process.argv[2] ?? 50_000);
const vendorCount = Math.max(50, Math.round(n / 50));
const vendors = Array.from({ length: vendorCount }, (_, i) => {
  const pan = `AAAC${String.fromCharCode(65 + (i % 26))}${String(i).padStart(4, '0').slice(-4)}R`;
  const first14 = `27${pan}1Z`;
  return first14 + gstinCheckDigit(first14);
});

const prs: PrInvoiceInput[] = [];
const b2bs: Gstr2bInvoiceInput[] = [];
for (let i = 0; i < n; i++) {
  const gstin = vendors[i % vendorCount];
  const date = `2025-${String(4 + (i % 9)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
  const taxableValue = 1_000 + (i % 977) * 13;
  const base = { gstin, invoiceDate: date, taxableValue, igst: Math.round(taxableValue * 18) / 100 };
  prs.push({ ...base, id: `p${i}`, invoiceNumber: `INV/${String(i).padStart(7, '0')}` });
  if (i % 10 === 0) continue; // 10% missing in 2B
  const typo = i % 7 === 0;
  b2bs.push({
    ...base,
    id: `b${i}`,
    invoiceNumber: typo ? `${i}9` : String(i),
    igst: i % 13 === 0 ? base.igst + 50 : base.igst, // some value mismatches
  });
}

const t0 = performance.now();
const { summary, results } = reconcile(prs, b2bs, { asOf: new Date().toISOString().slice(0, 10) });
const t1 = performance.now();
const vendorsOut = aggregateByVendor(results);
const t2 = performance.now();

console.log(`PR ${n.toLocaleString('en-IN')} × 2B ${b2bs.length.toLocaleString('en-IN')}`);
console.log(`reconcile: ${(t1 - t0).toFixed(0)} ms | aggregate: ${(t2 - t1).toFixed(0)} ms`);
console.log(`per 10k invoices: ${(((t1 - t0) / n) * 10_000).toFixed(0)} ms (target < 5000 ms)`);
console.table(summary.byStatus);
console.log({
  itcAtRisk: summary.totalItcAtRisk,
  opportunity: summary.totalItcOpportunity,
  section164: summary.section164RiskAmount,
  dunningVendors: vendorsOut.filter((v) => v.dunningEligible).length,
});
if (((t1 - t0) / n) * 10_000 > 5_000) process.exitCode = 1;

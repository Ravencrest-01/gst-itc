import { describe, expect, it } from 'vitest';
import { gstinCheckDigit } from '../gst/gstin';
import { aggregateByVendor } from './aggregate';
import { reconcile } from './engine';
import type { Gstr2bInvoiceInput, MatchResult, PrInvoiceInput } from './types';

const gstin = (state: string, pan: string) => {
  const first14 = `${state}${pan}1Z`;
  return first14 + gstinCheckDigit(first14);
};
const ACME = gstin('27', 'AAACB9812R'); // Maharashtra
const ACME_KA = gstin('29', 'AAACB9812R'); // same PAN, Karnataka
const ORION = gstin('33', 'AAACG1122R');

const AS_OF = '2026-11-06'; // 24 days before the FY 2025-26 deadline (2026-11-30)

let seq = 0;
function pr(p: Partial<PrInvoiceInput> = {}): PrInvoiceInput {
  return {
    id: `pr-${++seq}`,
    gstin: ACME,
    invoiceNumber: 'INV-1',
    invoiceDate: '2025-08-10',
    taxableValue: 10_000,
    igst: 1_800,
    ...p,
  };
}
function b2b(p: Partial<Gstr2bInvoiceInput> = {}): Gstr2bInvoiceInput {
  return {
    id: `2b-${++seq}`,
    gstin: ACME,
    invoiceNumber: 'INV-1',
    invoiceDate: '2025-08-10',
    taxableValue: 10_000,
    igst: 1_800,
    ...p,
  };
}

const run = (prs: PrInvoiceInput[], b2bs: Gstr2bInvoiceInput[], opts = {}) =>
  reconcile(prs, b2bs, { asOf: AS_OF, ...opts });

const only = (results: MatchResult[]) => {
  expect(results).toHaveLength(1);
  return results[0];
};

describe('Pass 1 — exact key', () => {
  it('matches identical invoices', () => {
    const r = only(run([pr()], [b2b()]).results);
    expect(r).toMatchObject({ status: 'EXACT_MATCH', pass: 1, itcAtRisk: 0, isSection164Risk: false });
  });

  it('treats separators/leading zeros as the same number', () => {
    const r = only(run([pr({ invoiceNumber: 'inv/0001' })], [b2b({ invoiceNumber: 'INV-1' })]).results);
    expect(r).toMatchObject({ status: 'EXACT_MATCH', pass: 1 });
  });

  it('applies the ₹1 tolerance even across a rounding boundary (spec bug #1)', () => {
    const r = only(
      run(
        [pr({ taxableValue: 1000.49, igst: 180.09 })],
        [b2b({ taxableValue: 1000.5, igst: 180.6 })],
      ).results,
    );
    expect(r.status).toBe('EXACT_MATCH');
  });

  it('reports VALUE_MISMATCH when the reference matches but tax differs by more than ₹1', () => {
    const r = only(run([pr({ igst: 12_800 })], [b2b({ igst: 12_000 })]).results);
    expect(r).toMatchObject({ status: 'VALUE_MISMATCH', pass: 1, taxDifference: 800, itcAtRisk: 800 });
  });

  it('records ITC opportunity when 2B shows more tax than booked', () => {
    const r = only(run([pr({ igst: 1_000 })], [b2b({ igst: 1_800 })]).results);
    expect(r).toMatchObject({ status: 'VALUE_MISMATCH', itcAtRisk: 0, itcOpportunity: 800 });
  });

  it('flags DATE_MISMATCH when only the date differs', () => {
    const r = only(run([pr()], [b2b({ invoiceDate: '2025-08-20' })]).results);
    expect(r.status).toBe('DATE_MISMATCH');
    expect(r.itcAtRisk).toBe(0);
  });

  it('flags IGST vs CGST+SGST as TAX_TYPE_MISMATCH, not a match (spec bug #4)', () => {
    const r = only(run([pr({ igst: 1_800 })], [b2b({ igst: 0, cgst: 900, sgst: 900 })]).results);
    expect(r).toMatchObject({ status: 'TAX_TYPE_MISMATCH', itcAtRisk: 1_800 });
  });

  it('pairs duplicates one-to-one', () => {
    const { results } = run([pr(), pr()], [b2b()]);
    expect(results.map((r) => r.status).sort()).toEqual(['EXACT_MATCH', 'MISSING_IN_2B']);
  });
});

describe('Pass 2 — heuristics', () => {
  it('matches prefixed numbers by core number (INV/000452 vs 452)', () => {
    const r = only(run([pr({ invoiceNumber: 'INV/000452' })], [b2b({ invoiceNumber: '452' })]).results);
    expect(r).toMatchObject({ status: 'EXACT_MATCH', pass: 2 });
  });

  it('matches FY-suffixed numbers (452/25-26 vs 452)', () => {
    const r = only(run([pr({ invoiceNumber: '452/25-26' })], [b2b({ invoiceNumber: '452' })]).results);
    expect(r.status).toBe('EXACT_MATCH');
  });

  it('marks a one-character typo as PROBABLE_MATCH', () => {
    const r = only(
      run([pr({ invoiceNumber: 'ABC1002345' })], [b2b({ invoiceNumber: 'ABC1002346' })]).results,
    );
    expect(r).toMatchObject({ status: 'PROBABLE_MATCH', pass: 2 });
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it('does not fuzzy-match when the taxable value disagrees', () => {
    const { results } = run(
      [pr({ invoiceNumber: 'ABC1002345' })],
      [b2b({ invoiceNumber: 'ABC1002346', taxableValue: 9_000 })],
    );
    expect(results.map((r) => r.status).sort()).toEqual(['MISSING_IN_2B', 'MISSING_IN_PR']);
  });

  it('respects the ±30 day window', () => {
    const near = run([pr({ invoiceNumber: 'INV/452' })], [b2b({ invoiceNumber: '452', invoiceDate: '2025-09-08' })]);
    expect(only(near.results).status).toBe('DATE_MISMATCH');
    const far = run([pr({ invoiceNumber: 'INV/452' })], [b2b({ invoiceNumber: '452', invoiceDate: '2025-09-20' })]);
    expect(far.results).toHaveLength(2);
  });

  it('matches across an FY boundary within the window and notes it', () => {
    const r = only(
      run(
        [pr({ invoiceDate: '2025-03-28' })],
        [b2b({ invoiceDate: '2025-04-02' })],
      ).results,
    );
    expect(r.status).toBe('DATE_MISMATCH');
    expect(r.notes.join(' ')).toMatch(/Financial year differs/);
  });

  it('prefers the closest candidate', () => {
    const { results } = run(
      [pr({ invoiceNumber: 'INV/452' })],
      [b2b({ id: 'far', invoiceNumber: '452', invoiceDate: '2025-08-30' }), b2b({ id: 'near', invoiceNumber: '452' })],
    );
    expect(results.find((r) => r.prId)?.gstr2bId).toBe('near');
  });

  it('detects a vendor GSTIN tagged to the wrong state (same PAN)', () => {
    const r = only(run([pr({ gstin: ACME })], [b2b({ gstin: ACME_KA })]).results);
    expect(r).toMatchObject({ status: 'GSTIN_MISMATCH', itcAtRisk: 1_800 });
  });
});

describe('Pass 3 & document types', () => {
  it('reports MISSING_IN_2B with full ITC at risk and 16(4) exposure', () => {
    const r = only(run([pr()], []).results);
    expect(r).toMatchObject({
      status: 'MISSING_IN_2B',
      itcAtRisk: 1_800,
      section164Deadline: '2026-11-30',
      daysToDeadline: 24,
      isSection164Risk: true,
      riskTier: 'HIGH',
    });
  });

  it('reports MISSING_IN_PR as ITC opportunity', () => {
    const r = only(run([], [b2b()]).results);
    expect(r).toMatchObject({ status: 'MISSING_IN_PR', itcOpportunity: 1_800, itcAtRisk: 0 });
  });

  it('does not treat ITC marked unavailable in 2B as opportunity', () => {
    const r = only(run([], [b2b({ itcAvailable: false })]).results);
    expect(r.itcOpportunity).toBe(0);
  });

  it('puts ITC at risk when 2B marks a matched invoice ineligible', () => {
    const r = only(run([pr()], [b2b({ itcAvailable: false })]).results);
    expect(r).toMatchObject({ status: 'EXACT_MATCH', itcAtRisk: 1_800 });
  });

  it('never matches a credit note against an invoice (spec bug #5)', () => {
    const { results } = run([pr({ documentType: 'CREDIT_NOTE' })], [b2b({ documentType: 'INVOICE' })]);
    expect(results.map((r) => r.status).sort()).toEqual(['MISSING_IN_2B', 'MISSING_IN_PR']);
    const cn = results.find((r) => r.prId)!;
    expect(cn.itcAtRisk).toBe(0);
  });

  it('matches credit notes with credit notes', () => {
    const r = only(run([pr({ documentType: 'CREDIT_NOTE' })], [b2b({ documentType: 'CREDIT_NOTE' })]).results);
    expect(r.status).toBe('EXACT_MATCH');
  });
});

describe('Section 16(4)', () => {
  it('marks ITC from an expired FY as lapsed and excludes it from recoverable totals', () => {
    const out = run([pr({ invoiceDate: '2024-06-01' })], []);
    const r = only(out.results);
    expect(r).toMatchObject({ isItcLapsed: true, isSection164Risk: false, riskTier: 'CRITICAL' });
    expect(out.summary.totalItcAtRisk).toBe(0);
    expect(out.summary.lapsedItc).toBe(1_800);
  });

  it('uses an earlier GSTR-9 filing date as the deadline', () => {
    const r = only(run([pr()], [], { annualReturnFiledOn: { '2025-2026': '2026-11-10' } }).results);
    expect(r).toMatchObject({ section164Deadline: '2026-11-10', daysToDeadline: 4, riskTier: 'CRITICAL' });
  });

  it('is not flagged far from the deadline', () => {
    const r = only(run([pr({ invoiceDate: '2026-05-01' })], []).results);
    expect(r).toMatchObject({ isSection164Risk: false, riskTier: 'LOW', itcAtRisk: 1_800 });
  });
});

describe('invariants & summary', () => {
  const prs = [
    pr({ invoiceNumber: 'A-1' }),
    pr({ invoiceNumber: 'A-2', igst: 900 }),
    pr({ invoiceNumber: 'INV/0003' }),
    pr({ invoiceNumber: 'A-4', gstin: ORION }),
    pr({ invoiceNumber: 'A-5' }),
  ];
  const b2bs = [
    b2b({ invoiceNumber: 'A-1' }),
    b2b({ invoiceNumber: 'A-2', igst: 500 }),
    b2b({ invoiceNumber: '3' }),
    b2b({ invoiceNumber: 'Z-9', gstin: ORION }),
  ];
  const out = run(prs, b2bs);

  it('places every input record in exactly one result', () => {
    const prIds = out.results.flatMap((r) => (r.prId ? [r.prId] : []));
    const bIds = out.results.flatMap((r) => (r.gstr2bId ? [r.gstr2bId] : []));
    expect(new Set(prIds).size).toBe(prIds.length);
    expect(new Set(bIds).size).toBe(bIds.length);
    expect(prIds.sort()).toEqual(prs.map((p) => p.id).sort());
    expect(bIds.sort()).toEqual(b2bs.map((b) => b.id).sort());
  });

  it('summarizes totals', () => {
    expect(out.summary).toMatchObject({
      totalPr: 5,
      total2b: 4,
      exactMatches: 2,
      totalItcAtRisk: 400 + 1_800 + 1_800,
      totalItcOpportunity: 1_800,
      invalidGstins: [],
    });
    expect(out.summary.byStatus).toMatchObject({ VALUE_MISMATCH: 1, MISSING_IN_2B: 2, MISSING_IN_PR: 1 });
  });

  it('collects invalid GSTINs', () => {
    expect(run([pr({ gstin: '27AAACB9812R1ZX' })], []).summary.invalidGstins).toEqual(['27AAACB9812R1ZX']);
  });

  it('reports the bad record id on an invalid date', () => {
    expect(() => run([pr({ id: 'bad-row', invoiceDate: '2025-02-30' })], [])).toThrow(/bad-row/);
  });
});

describe('aggregateByVendor', () => {
  const { results } = run(
    [
      pr({ invoiceNumber: '1', igst: 9_000 }),
      pr({ invoiceNumber: '2' }),
      pr({ invoiceNumber: '3', gstin: ORION, igst: 1_000 }),
      pr({ invoiceNumber: '4', gstin: ORION, igst: 1_000, invoiceDate: '2024-06-01' }),
    ],
    [b2b({ invoiceNumber: '2' })],
  );
  const vendors = aggregateByVendor(results);

  it('ranks vendors by ITC at risk and applies the dunning threshold', () => {
    expect(vendors.map((v) => v.gstin)).toEqual([ACME, ORION]);
    expect(vendors[0]).toMatchObject({ itcAtRisk: 9_000, dunningEligible: true, complianceScore: 50 });
    // Orion's lapsed invoice is excluded from recoverable exposure.
    expect(vendors[1]).toMatchObject({ itcAtRisk: 1_000, dunningEligible: false, complianceScore: 0 });
  });

  it('carries the nearest deadline and tier', () => {
    expect(vendors[0]).toMatchObject({ nearestDeadline: '2026-11-30', riskTier: 'HIGH' });
  });
});

describe('performance', () => {
  it('reconciles 10,000 × 10,000 invoices in under 5 seconds', () => {
    const vendors = Array.from({ length: 200 }, (_, i) =>
      gstin('27', `AAAC${String.fromCharCode(65 + (i % 26))}${String(1000 + i).slice(-4)}R`),
    );
    const prs: PrInvoiceInput[] = [];
    const b2bs: Gstr2bInvoiceInput[] = [];
    for (let i = 0; i < 10_000; i++) {
      const g = vendors[i % vendors.length];
      const day = 1 + (i % 28);
      const date = `2025-${String(4 + (i % 9)).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const amt = 1_000 + (i % 977) * 13;
      prs.push(pr({ id: `p${i}`, gstin: g, invoiceNumber: `INV/${String(i).padStart(6, '0')}`, invoiceDate: date, taxableValue: amt, igst: amt * 0.18 }));
      if (i % 10 !== 0) {
        // 90% present in 2B; every 7th with a typo in the number.
        const num = i % 7 === 0 ? `${i}9` : String(i);
        b2bs.push(b2b({ id: `b${i}`, gstin: g, invoiceNumber: num, invoiceDate: date, taxableValue: amt, igst: amt * 0.18 }));
      }
    }
    const t0 = performance.now();
    const out = reconcile(prs, b2bs, { asOf: AS_OF });
    const ms = performance.now() - t0;
    expect(out.summary.totalPr).toBe(10_000);
    expect(out.summary.byStatus.MISSING_IN_2B).toBeGreaterThanOrEqual(1_000);
    expect(ms).toBeLessThan(5_000);
  });
});

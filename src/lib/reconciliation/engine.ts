import { distance } from 'fastest-levenshtein';
import { financialYearOf, section164Deadline, toEpochDay } from '../gst/fiscal';
import { panFromGstin, validateGstin } from '../gst/gstin';
import {
  canonicalInvoiceNumber,
  coreInvoiceNumber,
  fromPaise,
  normalizationHash,
  toPaise,
} from '../gst/normalization';
import type {
  DocumentType,
  Gstr2bInvoiceInput,
  InvoiceInput,
  MatchResult,
  MatchStatus,
  PrInvoiceInput,
  ReconcileOptions,
  ReconcileOutput,
  ReconcileSummary,
  RiskTier,
} from './types';

/**
 * Multi-pass PR <-> GSTR-2B reconciliation.
 *
 *   Pass 1  exact key  SHA-256(GSTIN|doc type|canonical no.|FY); amounts compared after lookup
 *   Pass 2  heuristic  same GSTIN + doc type, ±N days, core-number equality or Levenshtein ≥ 0.85
 *   Pass 2b GSTIN      same PAN, different GSTIN, same core number & value  -> GSTIN_MISMATCH
 *   Pass 3  leftovers  MISSING_IN_2B / MISSING_IN_PR
 *
 * Section 16(4) exposure is evaluated for every result as a flag, never as a status.
 * Pure and synchronous: the DB layer loads rows, calls this, and persists the output.
 */

interface Rec {
  side: 'PR' | '2B';
  id: string;
  gstin: string;
  pan: string;
  docType: DocumentType;
  rawNo: string;
  canonical: string;
  core: string;
  fy: string;
  day: number;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  total: number;
  itcAvailable: boolean;
  matched: boolean;
}

interface Resolved {
  tol: number;
  fuzzyThreshold: number;
  window: number;
  riskWindow: number;
  asOfDay: number;
  annualReturnFiledOn: Record<string, string>;
}

const CLEAN: ReadonlySet<MatchStatus> = new Set(['EXACT_MATCH', 'DATE_MISMATCH', 'PROBABLE_MATCH']);

function normalize(input: InvoiceInput, side: 'PR' | '2B', invalid: Set<string>): Rec {
  const gst = validateGstin(input.gstin);
  if (!gst.valid) invalid.add(gst.gstin || '(empty)');
  let fy: string;
  let day: number;
  try {
    fy = financialYearOf(input.invoiceDate);
    day = toEpochDay(input.invoiceDate);
  } catch (err) {
    throw new Error(`${side} record ${input.id}: ${(err as Error).message}`);
  }
  const igst = toPaise(input.igst);
  const cgst = toPaise(input.cgst);
  const sgst = toPaise(input.sgst);
  const cess = toPaise(input.cess);
  return {
    side,
    id: input.id,
    gstin: gst.gstin,
    pan: panFromGstin(gst.gstin),
    docType: input.documentType ?? 'INVOICE',
    rawNo: input.invoiceNumber,
    canonical: canonicalInvoiceNumber(input.invoiceNumber),
    core: coreInvoiceNumber(input.invoiceNumber),
    fy,
    day,
    taxable: toPaise(input.taxableValue),
    igst,
    cgst,
    sgst,
    cess,
    total: igst + cgst + sgst + cess,
    itcAvailable: (input as Gstr2bInvoiceInput).itcAvailable ?? true,
    matched: false,
  };
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - distance(a, b) / Math.max(a.length, b.length);
}

/** IGST on one side vs CGST+SGST on the other (place-of-supply error). */
function isTaxHeadShift(pr: Rec, b: Rec): boolean {
  const prInter = pr.igst > 0;
  const prIntra = pr.cgst + pr.sgst > 0;
  const bInter = b.igst > 0;
  const bIntra = b.cgst + b.sgst > 0;
  return (prInter && !prIntra && bIntra && !bInter) || (prIntra && !prInter && bInter && !bIntra);
}

function classifyPair(
  pr: Rec,
  b: Rec,
  numberSame: boolean,
  tol: number,
): { status: MatchStatus; notes: string[] } {
  const notes: string[] = [];
  const headsOk =
    Math.abs(pr.igst - b.igst) <= tol &&
    Math.abs(pr.cgst - b.cgst) <= tol &&
    Math.abs(pr.sgst - b.sgst) <= tol &&
    Math.abs(pr.cess - b.cess) <= tol;

  if (headsOk) {
    if (Math.abs(pr.taxable - b.taxable) > tol) {
      notes.push('Taxable value differs although tax amounts agree');
    }
    if (!numberSame) {
      notes.push(`Invoice number differs: PR "${pr.rawNo}" vs 2B "${b.rawNo}"`);
      return { status: 'PROBABLE_MATCH', notes };
    }
    if (pr.day !== b.day) {
      notes.push(`Invoice date differs by ${Math.abs(pr.day - b.day)} day(s)`);
      return { status: 'DATE_MISMATCH', notes };
    }
    return { status: 'EXACT_MATCH', notes };
  }

  if (isTaxHeadShift(pr, b)) {
    notes.push(
      pr.igst > 0
        ? 'Booked as IGST in PR but supplier reported CGST+SGST'
        : 'Booked as CGST+SGST in PR but supplier reported IGST',
    );
    if (Math.abs(pr.total - b.total) > tol) notes.push('Total tax also differs');
    return { status: 'TAX_TYPE_MISMATCH', notes };
  }

  notes.push(
    `Tax differs by ₹${fromPaise(pr.total - b.total).toFixed(2)} (PR ₹${fromPaise(pr.total).toFixed(2)} vs 2B ₹${fromPaise(b.total).toFixed(2)})`,
  );
  return { status: 'VALUE_MISMATCH', notes };
}

function tierForDays(days: number, riskWindow: number): RiskTier {
  if (days < 0 || days <= 15) return 'CRITICAL';
  if (days <= 30) return 'HIGH';
  if (days <= riskWindow) return 'MEDIUM';
  return 'LOW';
}

function buildResult(
  pr: Rec | null,
  b: Rec | null,
  status: MatchStatus,
  pass: 1 | 2 | 3,
  confidence: number,
  notes: string[],
  opt: Resolved,
): MatchResult {
  const anchor = (pr ?? b)!;
  const fy = anchor.fy;
  const deadline = section164Deadline(fy, opt.annualReturnFiledOn[fy]);
  const daysToDeadline = toEpochDay(deadline) - opt.asOfDay;
  const prTotal = pr?.total ?? 0;
  const bTotal = b?.total ?? 0;

  let atRisk = 0;
  let opportunity = 0;
  switch (status) {
    case 'MISSING_IN_2B':
    case 'TAX_TYPE_MISMATCH':
    case 'GSTIN_MISMATCH':
      atRisk = prTotal;
      break;
    case 'VALUE_MISMATCH':
      // Claimable ITC is capped at what the supplier reported.
      atRisk = Math.max(0, prTotal - bTotal);
      opportunity = Math.max(0, bTotal - prTotal);
      break;
    case 'MISSING_IN_PR':
      if (b?.itcAvailable) opportunity = bTotal;
      break;
  }
  if (pr && b && !b.itcAvailable && CLEAN.has(status)) {
    atRisk = prTotal;
    notes.push('GSTR-2B marks this ITC as not available');
  }
  if (anchor.docType === 'CREDIT_NOTE' && (atRisk > 0 || opportunity > 0)) {
    // A credit note reduces ITC; a missing/mismatched one is a reversal exposure, not lost credit.
    notes.push('Credit note: ITC reversal exposure, excluded from ITC at risk');
    atRisk = 0;
    opportunity = 0;
  }

  const exposure = atRisk + opportunity;
  const isItcLapsed = exposure > 0 && daysToDeadline < 0;
  const isSection164Risk = exposure > 0 && !isItcLapsed && daysToDeadline <= opt.riskWindow;
  if (isItcLapsed) notes.push(`Section 16(4) deadline ${deadline} has passed; ITC has lapsed`);
  else if (isSection164Risk) notes.push(`${daysToDeadline} day(s) left before Section 16(4) deadline ${deadline}`);

  return {
    prId: pr?.id ?? null,
    gstr2bId: b?.id ?? null,
    gstin: anchor.gstin,
    status,
    pass,
    confidence: Math.round(confidence * 1000) / 1000,
    financialYear: fy,
    taxableDifference: fromPaise((pr?.taxable ?? 0) - (b?.taxable ?? 0)),
    taxDifference: fromPaise(prTotal - bTotal),
    itcAtRisk: fromPaise(atRisk),
    itcOpportunity: fromPaise(opportunity),
    section164Deadline: deadline,
    daysToDeadline,
    isSection164Risk,
    isItcLapsed,
    riskTier: exposure > 0 ? tierForDays(daysToDeadline, opt.riskWindow) : 'LOW',
    notes,
  };
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function reconcile(
  prInputs: PrInvoiceInput[],
  gstr2bInputs: Gstr2bInvoiceInput[],
  options: ReconcileOptions,
): ReconcileOutput {
  const opt: Resolved = {
    tol: toPaise(options.toleranceRupees ?? 1),
    fuzzyThreshold: options.fuzzyThreshold ?? 0.85,
    window: options.dateWindowDays ?? 30,
    riskWindow: options.section164WindowDays ?? 60,
    asOfDay: toEpochDay(options.asOf),
    annualReturnFiledOn: options.annualReturnFiledOn ?? {},
  };

  const invalid = new Set<string>();
  const prs = prInputs.map((r) => normalize(r, 'PR', invalid));
  const b2bs = gstr2bInputs.map((r) => normalize(r, '2B', invalid));
  const results: MatchResult[] = [];

  // ---- Pass 1: exact key ---------------------------------------------------
  const keyOf = (r: Rec) => normalizationHash(r.gstin, r.docType, r.canonical, r.fy);
  const b2bByKey = groupBy(b2bs, keyOf);
  for (const pr of prs) {
    const bucket = b2bByKey.get(keyOf(pr));
    if (!bucket) continue;
    let best: Rec | undefined;
    for (const b of bucket) {
      if (b.matched) continue;
      if (
        !best ||
        Math.abs(pr.total - b.total) < Math.abs(pr.total - best.total) ||
        (Math.abs(pr.total - b.total) === Math.abs(pr.total - best.total) &&
          Math.abs(pr.day - b.day) < Math.abs(pr.day - best.day))
      ) {
        best = b;
      }
    }
    if (!best) continue;
    pr.matched = best.matched = true;
    const { status, notes } = classifyPair(pr, best, true, opt.tol);
    results.push(buildResult(pr, best, status, 1, 1, notes, opt));
  }

  // ---- Pass 2: heuristic within GSTIN + document type ------------------------
  const blockKey = (r: Rec) => `${r.gstin}|${r.docType}`;
  const openB2bBlocks = groupBy(
    b2bs.filter((b) => !b.matched),
    blockKey,
  );
  for (const list of openB2bBlocks.values()) list.sort((x, y) => x.day - y.day);

  interface Edge {
    pr: Rec;
    b: Rec;
    score: number;
    sim: number;
    numberSame: boolean;
  }
  const edges: Edge[] = [];
  const maxLenRatioGap = 1 - opt.fuzzyThreshold;

  for (const pr of prs) {
    if (pr.matched) continue;
    const block = openB2bBlocks.get(blockKey(pr));
    if (!block) continue;
    // Binary search to the first candidate inside the date window.
    let lo = 0;
    let hi = block.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (block[mid].day < pr.day - opt.window) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < block.length && block[i].day <= pr.day + opt.window; i++) {
      const b = block[i];
      const numberSame = pr.core === b.core;
      let sim = 1;
      if (!numberSame) {
        const longest = Math.max(pr.core.length, b.core.length);
        if (Math.abs(pr.core.length - b.core.length) / longest > maxLenRatioGap) continue;
        sim = similarity(pr.core, b.core);
        if (sim < opt.fuzzyThreshold) continue;
        // A fuzzy number alone is weak evidence: also require the taxable value to agree.
        if (Math.abs(pr.taxable - b.taxable) > opt.tol) continue;
      }
      const dateScore = 1 - Math.abs(pr.day - b.day) / (opt.window + 1);
      const valueScore = Math.abs(pr.total - b.total) <= opt.tol ? 1 : 0;
      edges.push({ pr, b, sim, numberSame, score: sim * 0.6 + dateScore * 0.2 + valueScore * 0.2 });
    }
  }
  edges.sort((x, y) => y.score - x.score || Math.abs(x.pr.day - x.b.day) - Math.abs(y.pr.day - y.b.day));
  for (const e of edges) {
    if (e.pr.matched || e.b.matched) continue;
    e.pr.matched = e.b.matched = true;
    const { status, notes } = classifyPair(e.pr, e.b, e.numberSame, opt.tol);
    if (e.pr.fy !== e.b.fy) notes.push(`Financial year differs: PR ${e.pr.fy} vs 2B ${e.b.fy}`);
    results.push(buildResult(e.pr, e.b, status, 2, e.score, notes, opt));
  }

  // ---- Pass 2b: same PAN, wrong GSTIN tagged ---------------------------------
  const panKey = (r: Rec) => `${r.pan}|${r.docType}|${r.core}`;
  const openB2bByPan = groupBy(
    b2bs.filter((b) => !b.matched && b.pan),
    panKey,
  );
  for (const pr of prs) {
    if (pr.matched || !pr.pan) continue;
    const bucket = openB2bByPan.get(panKey(pr));
    if (!bucket) continue;
    let best: Rec | undefined;
    for (const b of bucket) {
      if (b.matched || b.gstin === pr.gstin) continue;
      if (Math.abs(pr.taxable - b.taxable) > opt.tol) continue;
      if (Math.abs(pr.day - b.day) > opt.window) continue;
      if (!best || Math.abs(pr.day - b.day) < Math.abs(pr.day - best.day)) best = b;
    }
    if (!best) continue;
    pr.matched = best.matched = true;
    results.push(
      buildResult(
        pr,
        best,
        'GSTIN_MISMATCH',
        2,
        0.7,
        [`Booked against ${pr.gstin} but supplier reported under ${best.gstin} (same PAN)`],
        opt,
      ),
    );
  }

  // ---- Pass 3: leftovers ------------------------------------------------------
  for (const pr of prs) {
    if (pr.matched) continue;
    results.push(
      buildResult(pr, null, 'MISSING_IN_2B', 3, 1, ['Supplier has not reported this invoice in GSTR-1/IFF'], opt),
    );
  }
  for (const b of b2bs) {
    if (b.matched) continue;
    results.push(
      buildResult(null, b, 'MISSING_IN_PR', 3, 1, ['Present in GSTR-2B but not booked in the purchase register'], opt),
    );
  }

  return { results, summary: summarize(results, prs.length, b2bs.length, [...invalid]) };
}

function summarize(
  results: MatchResult[],
  totalPr: number,
  total2b: number,
  invalidGstins: string[],
): ReconcileSummary {
  const byStatus = {
    EXACT_MATCH: 0,
    PROBABLE_MATCH: 0,
    DATE_MISMATCH: 0,
    VALUE_MISMATCH: 0,
    TAX_TYPE_MISMATCH: 0,
    GSTIN_MISMATCH: 0,
    MISSING_IN_2B: 0,
    MISSING_IN_PR: 0,
  } satisfies Record<MatchStatus, number>;
  let atRisk = 0;
  let opportunity = 0;
  let s164 = 0;
  let lapsed = 0;
  for (const r of results) {
    byStatus[r.status]++;
    const risk = toPaise(r.itcAtRisk);
    const opp = toPaise(r.itcOpportunity);
    if (r.isItcLapsed) {
      lapsed += risk + opp;
      continue;
    }
    atRisk += risk;
    opportunity += opp;
    if (r.isSection164Risk) s164 += risk + opp;
  }
  return {
    totalPr,
    total2b,
    byStatus,
    exactMatches: byStatus.EXACT_MATCH,
    mismatches: results.length - byStatus.EXACT_MATCH,
    totalItcAtRisk: fromPaise(atRisk),
    totalItcOpportunity: fromPaise(opportunity),
    section164RiskAmount: fromPaise(s164),
    lapsedItc: fromPaise(lapsed),
    invalidGstins,
  };
}

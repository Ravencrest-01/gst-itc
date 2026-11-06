import { fromPaise, toPaise } from '../gst/normalization';
import type { MatchResult, MatchStatus, RiskTier, VendorExposure } from './types';

const CLEAN: ReadonlySet<MatchStatus> = new Set(['EXACT_MATCH', 'DATE_MISMATCH', 'PROBABLE_MATCH']);
const TIER_ORDER: RiskTier[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const maxTier = (a: RiskTier, b: RiskTier): RiskTier =>
  TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b;

function tierForAmount(rupees: number): RiskTier {
  if (rupees >= 1_000_000) return 'CRITICAL';
  if (rupees >= 100_000) return 'HIGH';
  if (rupees >= 25_000) return 'MEDIUM';
  return 'LOW';
}

export interface AggregateOptions {
  /** Minimum unreconciled ITC (₹) before a vendor enters the dunning sequence. Default 5,000. */
  dunningThreshold?: number;
}

/** Per-vendor exposure, highest recoverable ITC first. Lapsed ITC is excluded (unrecoverable). */
export function aggregateByVendor(
  results: MatchResult[],
  options: AggregateOptions = {},
): VendorExposure[] {
  const threshold = options.dunningThreshold ?? 5_000;
  const acc = new Map<
    string,
    {
      prCount: number;
      clean: number;
      open: number;
      risk: number;
      opp: number;
      s164: number;
      nearest: string | null;
      tier: RiskTier;
    }
  >();

  for (const r of results) {
    let v = acc.get(r.gstin);
    if (!v) {
      v = { prCount: 0, clean: 0, open: 0, risk: 0, opp: 0, s164: 0, nearest: null, tier: 'LOW' };
      acc.set(r.gstin, v);
    }
    if (r.prId) {
      v.prCount++;
      if (CLEAN.has(r.status)) v.clean++;
    }
    if (!CLEAN.has(r.status)) v.open++;
    if (r.isItcLapsed) continue;
    const exposure = toPaise(r.itcAtRisk) + toPaise(r.itcOpportunity);
    v.risk += toPaise(r.itcAtRisk);
    v.opp += toPaise(r.itcOpportunity);
    if (r.isSection164Risk) v.s164 += exposure;
    if (exposure > 0) {
      v.tier = maxTier(v.tier, r.riskTier);
      if (!v.nearest || r.section164Deadline < v.nearest) v.nearest = r.section164Deadline;
    }
  }

  return [...acc.entries()]
    .map(([gstin, v]): VendorExposure => {
      const itcAtRisk = fromPaise(v.risk);
      return {
        gstin,
        prCount: v.prCount,
        cleanCount: v.clean,
        openIssues: v.open,
        itcAtRisk,
        itcOpportunity: fromPaise(v.opp),
        section164RiskAmount: fromPaise(v.s164),
        nearestDeadline: v.nearest,
        complianceScore: v.prCount ? Math.round((v.clean / v.prCount) * 10_000) / 100 : 100,
        riskTier: maxTier(v.tier, tierForAmount(itcAtRisk)),
        dunningEligible: itcAtRisk >= threshold,
      };
    })
    .sort((a, b) => b.itcAtRisk - a.itcAtRisk || b.itcOpportunity - a.itcOpportunity);
}

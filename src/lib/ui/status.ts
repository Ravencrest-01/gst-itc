import type { MatchStatus, RiskTier } from '@/lib/reconciliation/types';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export const STATUS_META: Record<MatchStatus, { label: string; short: string; tone: Tone; help: string }> = {
  EXACT_MATCH: { label: 'Exact match', short: 'Exact', tone: 'success', help: 'Books and GSTR-2B agree within ₹1 per tax head.' },
  PROBABLE_MATCH: { label: 'Probable match', short: 'Probable', tone: 'info', help: 'Amounts agree but the invoice number differs slightly. Confirm it is the same invoice.' },
  DATE_MISMATCH: { label: 'Date mismatch', short: 'Date', tone: 'info', help: 'Same invoice and amounts, different invoice date.' },
  VALUE_MISMATCH: { label: 'Value mismatch', short: 'Value', tone: 'warning', help: 'Same invoice, but the tax reported by the supplier differs by more than ₹1.' },
  TAX_TYPE_MISMATCH: { label: 'Wrong tax head', short: 'Tax head', tone: 'warning', help: 'IGST in one, CGST+SGST in the other. Credit cannot be claimed as booked.' },
  GSTIN_MISMATCH: { label: 'GSTIN mismatch', short: 'GSTIN', tone: 'warning', help: "Reported under the vendor's other GSTIN (same PAN)." },
  MISSING_IN_2B: { label: 'Missing in GSTR-2B', short: 'Missing 2B', tone: 'danger', help: 'In your books, but the supplier has not reported it in GSTR-1/IFF.' },
  MISSING_IN_PR: { label: 'Not in your books', short: 'Missing PR', tone: 'accent', help: 'In GSTR-2B but not booked: credit available to claim.' },
};

/** Order of the filter chips: what needs action first. */
export const STATUS_ORDER: MatchStatus[] = [
  'MISSING_IN_2B', 'VALUE_MISMATCH', 'TAX_TYPE_MISMATCH', 'GSTIN_MISMATCH', 'MISSING_IN_PR', 'PROBABLE_MATCH', 'DATE_MISMATCH', 'EXACT_MATCH',
];

/** Statuses a finance user can set as an override. */
export const OVERRIDE_CHOICES: MatchStatus[] = ['EXACT_MATCH', 'PROBABLE_MATCH', 'DATE_MISMATCH', 'VALUE_MISMATCH', 'TAX_TYPE_MISMATCH', 'GSTIN_MISMATCH', 'MISSING_IN_2B'];

export const TIER_TONE: Record<RiskTier, Tone> = { LOW: 'neutral', MEDIUM: 'warning', HIGH: 'danger', CRITICAL: 'danger' };

/** Days from today (local) to an ISO date. */
export function daysUntil(isoDate: string, now = new Date()): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

'use client';

import { History, Info } from 'lucide-react';
import { useState } from 'react';
import type { MatchStatus } from '@/lib/reconciliation/types';
import { ApiError } from '@/lib/ui/api';
import { formatInr } from '@/lib/ui/format';
import { daysUntil, formatIsoDate, OVERRIDE_CHOICES, STATUS_META, TIER_TONE } from '@/lib/ui/status';
import { Drawer } from '@/components/overlay';
import { Alert, Badge, Button, cx, Spinner } from '@/components/ui';
import type { ResultRow } from './use-results';

const PASS_LABEL: Record<number, string> = {
  1: 'Exact key (GSTIN, number, financial year)',
  2: 'Heuristic (fuzzy number, date window, or same PAN)',
  3: 'No counterpart found',
};

/** Engine notes are plain lines; override entries start with "[timestamp …]". */
function splitNotes(notes: string | null) {
  const lines = (notes ?? '').split('\n').filter(Boolean);
  const audit = lines
    .filter((l) => l.startsWith('['))
    .map((l) => {
      const m = /^\[([^\]\s]+)(?: user ([^\]]+))?\] (.*)$/.exec(l);
      return m ? { at: m[1], user: m[2] ?? null, text: m[3] } : { at: null, user: null, text: l };
    });
  return { engine: lines.filter((l) => !l.startsWith('[')), audit };
}

export function DetailDrawer({
  row,
  onClose,
  onOverride,
}: {
  row: ResultRow | null;
  onClose: () => void;
  onOverride: (row: ResultRow, status: MatchStatus | null, note: string) => Promise<void>;
}) {
  return (
    <Drawer
      open={Boolean(row)}
      onClose={onClose}
      title={row ? row.vendorName ?? 'Unknown vendor' : ''}
      subtitle={row && <span className="font-mono text-xs">{row.supplierGstin}</span>}
    >
      {row && <DrawerBody key={`${row.id}-${row.overriddenAt ?? ''}-${row.status}`} row={row} onOverride={onOverride} />}
    </Drawer>
  );
}

function DrawerBody({ row: r, onOverride }: { row: ResultRow; onOverride: (row: ResultRow, status: MatchStatus | null, note: string) => Promise<void> }) {
  const meta = STATUS_META[r.status];
  const { engine, audit } = splitNotes(r.notes);
  const days = daysUntil(r.section164Deadline);
  const exposure = r.itcAtRisk > 0 || r.itcOpportunity > 0;

  const compare: { label: string; books: string; b2b: string; differs: boolean }[] = [
    { label: 'Invoice number', books: r.prInvoiceNumber ?? '—', b2b: r.gstr2bInvoiceNumber ?? '—', differs: Boolean(r.prInvoiceNumber && r.gstr2bInvoiceNumber && r.prInvoiceNumber !== r.gstr2bInvoiceNumber) },
    { label: 'Invoice date', books: formatIsoDate(r.prInvoiceDate), b2b: formatIsoDate(r.gstr2bInvoiceDate), differs: Boolean(r.prInvoiceDate && r.gstr2bInvoiceDate && r.prInvoiceDate !== r.gstr2bInvoiceDate) },
    { label: 'Supplier GSTIN', books: r.prInvoiceId ? r.supplierGstin : '—', b2b: r.gstr2bSupplierGstin ?? '—', differs: Boolean(r.prInvoiceId && r.gstr2bSupplierGstin && r.gstr2bSupplierGstin !== r.supplierGstin) },
    { label: 'Taxable value', books: r.prTaxableValue === null ? '—' : formatInr(r.prTaxableValue), b2b: r.gstr2bTaxableValue === null ? '—' : formatInr(r.gstr2bTaxableValue), differs: Math.abs(r.taxableDifference) > 1 && r.prTaxableValue !== null && r.gstr2bTaxableValue !== null },
    { label: 'Total tax', books: r.prTotalTax === null ? '—' : formatInr(r.prTotalTax), b2b: r.gstr2bTotalTax === null ? '—' : formatInr(r.gstr2bTotalTax), differs: Math.abs(r.taxDifference) > 1 && r.prTotalTax !== null && r.gstr2bTotalTax !== null },
    { label: 'Return period', books: '—', b2b: r.gstr2bReturnPeriod ?? '—', differs: false },
  ];

  return (
    <div className="space-y-6 px-5 py-5">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {r.overrideStatus && <Badge>Overridden · engine said {STATUS_META[r.matchStatus].label}</Badge>}
          {r.prDocumentType && r.prDocumentType !== 'INVOICE' && <Badge>{r.prDocumentType === 'CREDIT_NOTE' ? 'Credit note' : 'Debit note'}</Badge>}
        </div>
        <p className="text-sm text-muted">{meta.help}</p>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <Figure label="ITC at risk" value={r.itcAtRisk > 0 ? formatInr(r.itcAtRisk) : '—'} tone={r.itcAtRisk > 0 ? 'text-danger' : undefined} />
        <Figure label="Claimable, not booked" value={r.itcOpportunity > 0 ? formatInr(r.itcOpportunity) : '—'} tone={r.itcOpportunity > 0 ? 'text-accent' : undefined} />
        <Figure
          label="Sec 16(4) deadline"
          value={formatIsoDate(r.section164Deadline)}
          extra={
            r.isItcLapsed ? <Badge>Lapsed</Badge> : exposure ? <Badge tone={r.isSection164Risk ? TIER_TONE[r.riskTier] : 'neutral'}>{days >= 0 ? `${days} days left` : 'Passed'}</Badge> : null
          }
        />
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Your books vs GSTR-2B</h3>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium" />
                <th scope="col" className="px-3 py-2 font-medium">Your books</th>
                <th scope="col" className="px-3 py-2 font-medium">GSTR-2B</th>
              </tr>
            </thead>
            <tbody>
              {compare.map((c) => (
                <tr key={c.label} className="border-t border-border">
                  <th scope="row" className="px-3 py-2 text-left text-xs font-medium text-muted">{c.label}</th>
                  <td className={cx('px-3 py-2 font-mono text-xs', c.differs && 'bg-warning-soft text-warning')}>{c.books}</td>
                  <td className={cx('px-3 py-2 font-mono text-xs', c.differs && 'bg-warning-soft text-warning')}>{c.b2b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-subtle">
          Matched by: {PASS_LABEL[r.matchPass] ?? '—'}
          {r.matchPass === 2 && ` · confidence ${Math.round(r.confidence * 100)}%`}
        </p>
      </section>

      {engine.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><Info className="size-3.5" aria-hidden />Why</h3>
          <ul className="space-y-1 text-sm">
            {engine.map((n, i) => <li key={i} className="rounded-md bg-surface-2 px-3 py-1.5">{n}</li>)}
          </ul>
        </section>
      )}

      <OverrideForm row={r} onOverride={onOverride} />

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><History className="size-3.5" aria-hidden />Audit history</h3>
        {audit.length ? (
          <ol className="space-y-2 border-l border-border pl-4">
            {[...audit].reverse().map((a, i) => (
              <li key={i} className="text-sm">
                <div className="text-xs text-muted">
                  {a.at ? new Date(a.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                  {a.user ? ` · user ${a.user.slice(0, 8)}` : ''}
                </div>
                <div>{a.text.replace(/[A-Z0-9_]{6,}/g, (code) => STATUS_META[code as MatchStatus]?.label ?? code)}</div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-subtle">No manual changes. The status above is the engine&apos;s.</p>
        )}
      </section>
    </div>
  );
}

function Figure({ label, value, tone, extra }: { label: string; value: string; tone?: string; extra?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className={cx('mt-0.5 text-sm font-semibold tabular-nums', tone)}>{value}</div>
      {extra && <div className="mt-1">{extra}</div>}
    </div>
  );
}

const REMOVE = '__remove__';

function OverrideForm({ row, onOverride }: { row: ResultRow; onOverride: (row: ResultRow, status: MatchStatus | null, note: string) => Promise<void> }) {
  const [choice, setChoice] = useState<string>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = OVERRIDE_CHOICES.filter((s) => s !== row.status);
  const canSave = choice !== '' && note.trim().length >= 3 && !busy;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await onOverride(row, choice === REMOVE ? null : (choice as MatchStatus), note.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the change');
      setBusy(false);
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Change status</h3>
      <form onSubmit={save} className="space-y-3 rounded-lg border border-border p-3">
        <p className="text-xs text-muted">
          Use when you know better than the engine, e.g. the vendor filed late or this is the same invoice under a typo. Marking it resolved clears its
          ITC at risk and stops reminders for it. The engine&apos;s result is kept for audit.
        </p>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium">New status</span>
          <select value={choice} onChange={(e) => setChoice(e.target.value)} className="h-9 w-full rounded-md border border-border-strong bg-surface px-2 text-sm">
            <option value="">Choose…</option>
            {row.overrideStatus && <option value={REMOVE}>Undo override (back to {STATUS_META[row.matchStatus].label})</option>}
            {options.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium">Reason (kept in the audit trail)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="e.g. Vendor confirmed it appears in GSTR-2B for Dec 2025"
            className="w-full rounded-md border border-border-strong bg-surface px-2.5 py-2 text-sm"
          />
        </label>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!canSave}>
            {busy && <Spinner />}
            Save change
          </Button>
        </div>
      </form>
    </section>
  );
}

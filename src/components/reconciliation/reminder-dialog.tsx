'use client';

import { Mail, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { apiPost, ApiError } from '@/lib/ui/api';
import { formatInr } from '@/lib/ui/format';
import { Dialog } from '@/components/overlay';
import { Alert, Badge, Button, Spinner } from '@/components/ui';

type Channel = 'EMAIL' | 'WHATSAPP';
interface DispatchReport {
  sent: { channel: Channel; vendorGstin: string; stage: number; to: string }[];
  skipped: { channel: Channel; vendorGstin: string; reason: string }[];
  failed: { channel: Channel; vendorGstin: string; error: string }[];
  previews: { channel: Channel; vendorGstin: string; stage: number; subject: string }[];
  nothingToRemind?: number;
}

export interface SelectedVendor {
  id: string;
  name: string;
  gstin: string;
  invoices: number;
  atRisk: number;
}

const STAGE = ['first reminder', 'second reminder', 'final notice'];

export function ReminderDialog({ open, onClose, runId, vendors }: { open: boolean; onClose: () => void; runId: string; vendors: SelectedVendor[] }) {
  const [channels, setChannels] = useState<Channel[]>(['EMAIL', 'WHATSAPP']);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null);
  const [report, setReport] = useState<{ dryRun: boolean; data: DispatchReport } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = (gstin: string) => vendors.find((v) => v.gstin === gstin)?.name ?? gstin;

  function close() {
    setReport(null);
    setError(null);
    setBusy(null);
    onClose();
  }

  async function dispatch(dryRun: boolean) {
    setBusy(dryRun ? 'preview' : 'send');
    setError(null);
    try {
      const data = await apiPost<DispatchReport>('/api/communications/dispatch', {
        runId,
        vendorIds: vendors.map((v) => v.id),
        channels,
        force,
        dryRun,
      });
      setReport({ dryRun, data });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send reminders');
    } finally {
      setBusy(null);
    }
  }

  const toggle = (c: Channel) => setChannels((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  const total = vendors.reduce((n, v) => n + v.atRisk, 0);
  const done = report && !report.dryRun;

  return (
    <Dialog
      open={open}
      onClose={close}
      title={done ? 'Reminders sent' : `Remind ${vendors.length} vendor${vendors.length === 1 ? '' : 's'}`}
      description={done ? undefined : `${formatInr(total)} of ITC at risk across the selected invoices. Each vendor gets one message listing all of their open invoices.`}
      footer={
        done ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => dispatch(true)} disabled={!channels.length || busy !== null}>
              {busy === 'preview' && <Spinner />}Preview
            </Button>
            <Button onClick={() => dispatch(false)} disabled={!channels.length || busy !== null}>
              {busy === 'send' && <Spinner />}Send reminders
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {!done && (
          <>
            <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
              {vendors.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{v.name}</span>
                    <span className="block font-mono text-xs text-muted">{v.gstin}</span>
                  </span>
                  <span className="whitespace-nowrap text-right text-xs text-muted">
                    {v.invoices} selected
                    <span className="block font-medium text-danger">{formatInr(v.atRisk)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <fieldset>
              <legend className="mb-2 text-xs font-medium">Send by</legend>
              <div className="flex gap-2">
                {([['EMAIL', 'Email', Mail], ['WHATSAPP', 'WhatsApp', MessageCircle]] as const).map(([c, label, Icon]) => (
                  <label key={c} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                    <input type="checkbox" className="accent-[var(--accent)]" checked={channels.includes(c)} onChange={() => toggle(c)} />
                    <Icon className="size-4 text-muted" aria-hidden />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={force} onChange={(e) => setForce(e.target.checked)} />
              <span>
                Send the next reminder now
                <span className="block text-xs text-muted">Normally the second reminder waits 5 days and the final notice 10. Tick to escalate immediately.</span>
              </span>
            </label>
          </>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        {report && <ReportView report={report.data} dryRun={report.dryRun} name={name} />}
      </div>
    </Dialog>
  );
}

function ReportView({ report, dryRun, name }: { report: DispatchReport; dryRun: boolean; name: (gstin: string) => string }) {
  const rows = [
    ...(dryRun ? report.previews : report.sent).map((s) => ({ key: `${s.vendorGstin}${s.channel}`, gstin: s.vendorGstin, channel: s.channel, tone: 'success' as const, text: dryRun ? `Would send ${STAGE[s.stage]}` : `Sent ${STAGE[s.stage]}` })),
    ...report.skipped.map((s) => ({ key: `${s.vendorGstin}${s.channel}s`, gstin: s.vendorGstin, channel: s.channel, tone: 'neutral' as const, text: `Skipped: ${s.reason}` })),
    ...report.failed.map((s) => ({ key: `${s.vendorGstin}${s.channel}f`, gstin: s.vendorGstin, channel: s.channel, tone: 'danger' as const, text: `Failed: ${s.error}` })),
  ];
  return (
    <div className="space-y-2">
      {dryRun && <p className="text-xs font-medium text-muted">Preview: nothing has been sent.</p>}
      {!rows.length && <Alert tone="info">Nothing to send for these vendors.</Alert>}
      <ul className="divide-y divide-border rounded-lg border border-border text-sm">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0 truncate">{name(r.gstin)}</span>
            <span className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-xs text-muted">{r.channel === 'EMAIL' ? 'Email' : 'WhatsApp'}</span>
              <Badge tone={r.tone}>{r.text}</Badge>
            </span>
          </li>
        ))}
      </ul>
      {!!report.nothingToRemind && <p className="text-xs text-muted">{report.nothingToRemind} vendor(s) had nothing open to remind about.</p>}
    </div>
  );
}

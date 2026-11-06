import type { MatchStatus } from '../../reconciliation/types';

export type DunningStage = 0 | 1 | 2;

export interface DunningItem {
  invoiceNumber: string;
  invoiceDate: string;
  status: MatchStatus;
  /** Tax per the buyer's books */
  bookedTax: number;
  /** Tax per the supplier's GSTR-1 (0 when not reported) */
  reportedTax: number;
  itcAtRisk: number;
  reportedUnderGstin?: string | null;
}

export interface DunningEmailInput {
  stage: DunningStage;
  buyer: { legalName: string; gstin: string };
  vendor: { legalName: string; gstin: string; contactName?: string | null };
  financialYear: string;
  /** Section 16(4) deadline (YYYY-MM-DD) for the earliest open item */
  deadline: string;
  daysToDeadline: number;
  items: DunningItem[];
  totalAtRisk: number;
  statementUrl: string;
  replyTo?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  csv: string;
}

const STATUS_TEXT: Partial<Record<MatchStatus, string>> = {
  MISSING_IN_2B: 'Not reported in your GSTR-1/IFF',
  VALUE_MISMATCH: 'Tax amount differs from our books',
  TAX_TYPE_MISMATCH: 'Reported under the wrong tax head (IGST vs CGST/SGST)',
  GSTIN_MISMATCH: 'Reported under a different GSTIN',
};

export const statusText = (s: MatchStatus) => STATUS_TEXT[s] ?? s;

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
export const formatInr = (n: number) => inr.format(n);

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const csvCell = (v: string | number) => {
  const s = String(v);
  // Quote when needed; prefix formula-like text so spreadsheets don't execute it.
  const safe = /^[=+\-@]/.test(s) && typeof v === 'string' ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function discrepancyCsv(items: DunningItem[]): string {
  const header = ['Invoice number', 'Invoice date', 'Issue', 'Tax as per buyer (INR)', 'Tax in your GSTR-1 (INR)', 'ITC at risk (INR)', 'Reported under GSTIN'];
  const lines = items.map((i) =>
    [i.invoiceNumber, i.invoiceDate, statusText(i.status), i.bookedTax.toFixed(2), i.reportedTax.toFixed(2), i.itcAtRisk.toFixed(2), i.reportedUnderGstin ?? '']
      .map(csvCell)
      .join(','),
  );
  return [header.map(csvCell).join(','), ...lines].join('\r\n') + '\r\n';
}

const STAGES: Record<DunningStage, { label: string; tone: string; color: string }> = {
  0: { label: 'Reminder', tone: 'friendly', color: '#2563eb' },
  1: { label: 'Second reminder', tone: 'detailed', color: '#d97706' },
  2: { label: 'Final notice', tone: 'escalation', color: '#dc2626' },
};

function subjectFor(input: DunningEmailInput): string {
  const n = input.items.length;
  const what = `${n} invoice${n === 1 ? '' : 's'} (${formatInr(input.totalAtRisk)} ITC)`;
  switch (input.stage) {
    case 0:
      return `[Action required] GST ITC reconciliation: ${what} pending in GSTR-1 – ${input.buyer.legalName}`;
    case 1:
      return `[Reminder 2] ${what} still not reflected in GSTR-2B – ${input.buyer.legalName}`;
    case 2:
      return `[Final notice] Payment hold: ${what} unresolved – ${input.buyer.legalName}`;
  }
}

function paragraphs(input: DunningEmailInput): string[] {
  const deadline = formatDate(input.deadline);
  const days = input.daysToDeadline;
  const when = days >= 0 ? `${deadline} (${days} day${days === 1 ? '' : 's'} from today)` : deadline;
  const intro = `Our reconciliation for financial year ${input.financialYear} found ${input.items.length} invoice(s) from ${input.vendor.legalName} (${input.vendor.gstin}) that do not appear correctly in our GSTR-2B. Input tax credit of ${formatInr(input.totalAtRisk)} is affected.`;
  const law = 'Under Section 16(2)(aa) of the CGST Act we can claim this credit only after the invoices are reported in your GSTR-1/IFF.';
  const ask = `Please file or correct these invoices on the GST portal before ${when}. Section 16(4) does not allow us to claim the credit after that date.`;
  switch (input.stage) {
    case 0:
      return [intro, law, ask];
    case 1:
      return [
        `This is a follow-up to our earlier reminder. ${intro}`,
        law,
        ask,
        'The attached statement lists each invoice with the tax amount in our books and in your GSTR-1. Where your filing differs, please file an amendment.',
      ];
    case 2:
      return [
        `This is our final notice. ${intro}`,
        law,
        `Until these invoices are reported correctly, payments against them are on hold. ${ask}`,
        'If you have already filed, please reply with the filing acknowledgement so we can release the hold.',
      ];
  }
}

export function renderDunningEmail(input: DunningEmailInput): RenderedEmail {
  const stage = STAGES[input.stage];
  const greeting = `Dear ${input.vendor.contactName || input.vendor.legalName},`;
  const body = paragraphs(input);
  const subject = subjectFor(input);
  const e = escapeHtml;

  const rows = input.items
    .map(
      (i) => `<tr>
  <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${e(i.invoiceNumber)}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${e(formatDate(i.invoiceDate))}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${e(statusText(i.status))}${i.reportedUnderGstin ? `<br><small>${e(i.reportedUnderGstin)}</small>` : ''}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${e(formatInr(i.bookedTax))}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${e(formatInr(i.reportedTax))}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${e(formatInr(i.itcAtRisk))}</td>
</tr>`,
    )
    .join('\n');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${e(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:Segoe UI,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" style="max-width:720px;margin:0 auto;background:#ffffff;border-radius:8px;border-top:4px solid ${stage.color}">
<tr><td style="padding:24px">
  <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:${stage.color};font-weight:700">${e(stage.label)} · GST ITC reconciliation</p>
  <h1 style="margin:0 0 16px;font-size:20px">${e(formatInr(input.totalAtRisk))} input tax credit pending</h1>
  <p>${e(greeting)}</p>
  ${body.map((p) => `<p style="line-height:1.5">${e(p)}</p>`).join('\n  ')}
  <table role="presentation" width="100%" style="border-collapse:collapse;font-size:13px;margin:16px 0">
    <thead><tr style="background:#f9fafb;text-align:left">
      <th style="padding:6px 8px">Invoice</th><th style="padding:6px 8px">Date</th><th style="padding:6px 8px">Issue</th>
      <th style="padding:6px 8px;text-align:right">Our books</th><th style="padding:6px 8px;text-align:right">Your GSTR-1</th><th style="padding:6px 8px;text-align:right">ITC at risk</th>
    </tr></thead>
    <tbody>
${rows}
    </tbody>
    <tfoot><tr><td colspan="5" style="padding:8px;text-align:right;font-weight:700">Total</td><td style="padding:8px;text-align:right;font-weight:700">${e(formatInr(input.totalAtRisk))}</td></tr></tfoot>
  </table>
  <p style="margin:24px 0"><a href="${e(input.statementUrl)}" style="background:${stage.color};color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">View discrepancy statement</a></p>
  <p style="font-size:12px;color:#6b7280">The statement is also attached as a CSV file. This link is private to ${e(input.vendor.legalName)}; please do not forward it.</p>
  <p style="margin-top:24px">GST Compliance Team<br>${e(input.buyer.legalName)} · GSTIN ${e(input.buyer.gstin)}</p>
</td></tr></table>
</body></html>`;

  const textRows = input.items.map(
    (i) => `- ${i.invoiceNumber} (${formatDate(i.invoiceDate)}): ${statusText(i.status)}; our books ${formatInr(i.bookedTax)}, your GSTR-1 ${formatInr(i.reportedTax)}, ITC at risk ${formatInr(i.itcAtRisk)}`,
  );
  const text = [
    `${stage.label.toUpperCase()} – GST ITC reconciliation`,
    '',
    greeting,
    '',
    ...body.flatMap((p) => [p, '']),
    ...textRows,
    `Total ITC at risk: ${formatInr(input.totalAtRisk)}`,
    '',
    `View the statement: ${input.statementUrl}`,
    '',
    'GST Compliance Team',
    `${input.buyer.legalName} · GSTIN ${input.buyer.gstin}`,
  ].join('\n');

  return { subject, html, text, csv: discrepancyCsv(input.items) };
}

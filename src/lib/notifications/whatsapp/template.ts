import type { DunningStage } from '../email/templates';
import { formatDate } from '../email/templates';

/**
 * Indian mobile numbers to E.164. Accepts "+91 98200 12345", "09820012345",
 * "919820012345", "9820012345". Returns null for anything that is not a valid
 * Indian mobile number (landlines cannot receive WhatsApp templates reliably).
 */
export function normalizeIndianMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    if (!digits.startsWith('+91')) return null;
    digits = digits.slice(3);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

/** One approved template per escalation stage (names as registered with Meta). */
export const WHATSAPP_TEMPLATES: Record<DunningStage, { name: string; language: string }> = {
  0: { name: 'itc_reconciliation_alert', language: 'en' },
  1: { name: 'itc_reconciliation_reminder', language: 'en' },
  2: { name: 'itc_reconciliation_final_notice', language: 'en' },
};

export interface WhatsAppTemplateInput {
  stage: DunningStage;
  buyerLegalName: string;
  vendorContactName: string;
  invoiceCount: number;
  totalAtRisk: number;
  financialYear: string;
  /** YYYY-MM-DD */
  deadline: string;
  /** Raw statement token: the button URL is https://<app>/vendor/statement/{{1}} */
  statementToken: string;
}

/**
 * Meta rejects template parameters containing newlines, tabs or more than four
 * consecutive spaces; header parameters are also length-limited.
 */
export function sanitizeParam(value: string, maxLength = 1024): string {
  const clean = value.replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

const amount = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The spec's 7 variables, grouped the way Meta numbers them (per component). */
export function templateParams(input: WhatsAppTemplateInput) {
  return {
    header: [sanitizeParam(input.buyerLegalName, 40)],
    body: [
      sanitizeParam(input.vendorContactName, 100),
      String(input.invoiceCount),
      amount(input.totalAtRisk),
      input.financialYear,
      formatDate(input.deadline),
    ],
    buttonUrlSuffix: input.statementToken,
  };
}

const BODY: Record<DunningStage, (p: string[]) => string> = {
  0: ([name, count, amt, fy, by]) =>
    `Dear ${name},\n\nOur system identified ${count} unreconciled invoices totaling ₹${amt} in Input Tax Credit for Financial Year ${fy}.\n\nUnder Section 16(2)(aa) of the CGST Act, we are unable to claim credit due to unfiled or mismatched GSTR-1 returns.\n\nPlease upload these invoices to the GSTN Portal or update your filings before ${by} to avoid payment holds.\n\nClick below to review the discrepancy list:`,
  1: ([name, count, amt, fy, by]) =>
    `Dear ${name},\n\nReminder: ${count} invoices (₹${amt} ITC, FY ${fy}) are still not reflected in our GSTR-2B.\n\nPlease file or amend them in your GSTR-1/IFF before ${by}. The full statement, with the amounts we have booked, is at the link below:`,
  2: ([name, count, amt, fy, by]) =>
    `Dear ${name},\n\nFinal notice: ${count} invoices (₹${amt} ITC, FY ${fy}) remain unreported in GSTR-1. Payments against these invoices are now on hold.\n\nPlease file before ${by}, or reply here with your filing acknowledgement to release the hold:`,
};

const HEADER: Record<DunningStage, string> = {
  0: '[ACTION REQUIRED] GST ITC Reconciliation Alert - {{1}}',
  1: '[REMINDER] GST ITC Reconciliation - {{1}}',
  2: '[FINAL NOTICE] Payment hold - {{1}}',
};

/** Footers cannot contain variables in WhatsApp templates, so it is static. */
export const TEMPLATE_FOOTER = 'GST Compliance Team';
export const TEMPLATE_BUTTON = 'View discrepancies';

/** What the vendor sees on their phone; used by the local mock and for audit. */
export function renderWhatsAppText(input: WhatsAppTemplateInput, appBaseUrl: string): string {
  const p = templateParams(input);
  return [
    `*${HEADER[input.stage].replace('{{1}}', p.header[0])}*`,
    '',
    BODY[input.stage](p.body),
    '',
    `[${TEMPLATE_BUTTON}] ${appBaseUrl.replace(/\/+$/, '')}/vendor/statement/${p.buttonUrlSuffix}`,
    '',
    `_${TEMPLATE_FOOTER}_`,
  ].join('\n');
}

/** Request body for Meta Cloud API `POST /{phone-number-id}/messages`. */
export interface MetaTemplateMessage {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: { code: string };
    components: (
      | { type: 'header' | 'body'; parameters: { type: 'text'; text: string }[] }
      | { type: 'button'; sub_type: 'url'; index: '0'; parameters: { type: 'text'; text: string }[] }
    )[];
  };
}

export function buildMetaTemplateMessage(toE164: string, input: WhatsAppTemplateInput): MetaTemplateMessage {
  const p = templateParams(input);
  const t = WHATSAPP_TEMPLATES[input.stage];
  const text = (s: string) => ({ type: 'text' as const, text: s });
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toE164.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: t.name,
      language: { code: t.language },
      components: [
        { type: 'header', parameters: p.header.map(text) },
        { type: 'body', parameters: p.body.map(text) },
        { type: 'button', sub_type: 'url', index: '0', parameters: [text(p.buttonUrlSuffix)] },
      ],
    },
  };
}

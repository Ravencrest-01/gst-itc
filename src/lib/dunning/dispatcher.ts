import { aliasedTable, and, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import * as schema from '../../db/schema';
import { toEpochDay } from '../gst/fiscal';
import type { EmailTransport } from '../notifications/email/transport';
import {
  renderDunningEmail,
  type DunningItem,
  type DunningStage,
} from '../notifications/email/templates';
import { createStatementToken, statementUrl } from '../notifications/tokens';
import {
  buildMetaTemplateMessage,
  normalizeIndianMobile,
  renderWhatsAppText,
  WHATSAPP_TEMPLATES,
} from '../notifications/whatsapp/template';
import type { WhatsAppTransport } from '../notifications/whatsapp/transport';
import type { MatchStatus } from '../reconciliation/types';

/** T+0 friendly reminder, T+5 detailed reminder, T+10 final notice with payment hold. */
export const CADENCE: readonly { stage: DunningStage; afterDays: number; templateId: string }[] = [
  { stage: 0, afterDays: 0, templateId: 'itc_dunning_email_reminder_1' },
  { stage: 1, afterDays: 5, templateId: 'itc_dunning_email_reminder_2' },
  { stage: 2, afterDays: 10, templateId: 'itc_dunning_email_final' },
];

/** Statuses a supplier can fix by filing or amending GSTR-1. */
export const ACTIONABLE: readonly MatchStatus[] = ['MISSING_IN_2B', 'VALUE_MISMATCH', 'TAX_TYPE_MISMATCH', 'GSTIN_MISMATCH'];

const DAY_MS = 86_400_000;

/**
 * Readable error text. Connecting to "localhost" tries IPv4 and IPv6; when both are
 * refused Node throws an AggregateError whose message is empty.
 */
export function describeError(err: unknown): string {
  if (err instanceof AggregateError && err.errors.length) {
    return [...new Set(err.errors.map(describeError))].join('; ');
  }
  if (err instanceof Error) {
    const e = err as Error & { code?: string; address?: string; port?: number };
    if (e.message) return e.message;
    if (e.code) return [e.code, e.address && `${e.address}:${e.port}`].filter(Boolean).join(' ');
    return e.name;
  }
  return String(err);
}

/** Messages older than this no longer count towards a vendor's escalation. */
export const CAMPAIGN_WINDOW_DAYS = 30;
type CommStatus = (typeof schema.commStatusEnum.enumValues)[number];

export interface CommHistory {
  stage: number;
  status: CommStatus;
  sentAt: Date | null;
}

/**
 * Next stage due for a vendor, or null. Escalation is measured from when stage 0 was
 * sent; a vendor reply (RESPONDED) stops it.
 */
export function nextDueStage(history: CommHistory[], now: Date, force = false): DunningStage | null {
  if (history.some((h) => h.status === 'RESPONDED')) return null;
  const sent = history.filter((h) => h.sentAt && h.status !== 'FAILED' && h.status !== 'QUEUED');
  if (!sent.length) return 0;
  const first = sent.find((h) => h.stage === 0)?.sentAt ?? sent[0].sentAt!;
  const next = Math.max(...sent.map((h) => h.stage)) + 1;
  const step = CADENCE.find((c) => c.stage === next);
  if (!step) return null;
  return force || now.getTime() - first.getTime() >= step.afterDays * DAY_MS ? step.stage : null;
}

export interface VendorNotice {
  vendorId: string;
  vendor: { legalName: string; gstin: string; contactName: string | null; contactEmail: string | null; contactPhone: string | null };
  items: (DunningItem & { matchResultId: string; deadline: string })[];
  totalAtRisk: number;
  deadline: string;
}

/** Groups a run's open, recoverable ITC by vendor; vendors under the threshold are dropped. */
export async function loadVendorNotices(
  db: Db,
  input: { organizationId: string; runId: string; threshold?: number },
): Promise<VendorNotice[]> {
  const threshold = input.threshold ?? 5_000;
  const pr = schema.purchaseRegisterInvoices;
  const b2b = aliasedTable(schema.gstr2bInvoices, 'b2b');
  const mr = schema.matchResults;
  const rows = await db
    .select({
      matchResultId: mr.id,
      // Manual overrides win: a result marked resolved by finance is never dunned.
      status: sql<MatchStatus>`coalesce(${mr.overrideStatus}, ${mr.matchStatus})`,
      itcAtRisk: mr.itcAtRisk,
      deadline: mr.section164Deadline,
      vendorId: schema.vendors.id,
      legalName: schema.vendors.legalName,
      vendorGstin: schema.vendors.gstin,
      contactName: schema.vendors.contactName,
      contactEmail: schema.vendors.contactEmail,
      contactPhone: schema.vendors.contactPhone,
      prNumber: pr.rawInvoiceNumber,
      prDate: pr.invoiceDate,
      prTax: pr.totalTax,
      b2bNumber: b2b.rawInvoiceNumber,
      b2bDate: b2b.invoiceDate,
      b2bTax: b2b.totalTax,
      b2bGstin: b2b.supplierGstin,
    })
    .from(mr)
    .innerJoin(schema.vendors, eq(schema.vendors.id, mr.vendorId))
    .leftJoin(pr, eq(pr.id, mr.prInvoiceId))
    .leftJoin(b2b, eq(b2b.id, mr.gstr2bInvoiceId))
    .where(
      and(
        eq(mr.organizationId, input.organizationId),
        eq(mr.reconciliationRunId, input.runId),
        eq(mr.isItcLapsed, false),
        gt(mr.itcAtRisk, 0),
        inArray(sql`coalesce(${mr.overrideStatus}, ${mr.matchStatus})`, [...ACTIONABLE]),
      ),
    )
    .orderBy(mr.section164Deadline, pr.invoiceDate);

  const byVendor = new Map<string, VendorNotice>();
  for (const r of rows) {
    let notice = byVendor.get(r.vendorId);
    if (!notice) {
      notice = {
        vendorId: r.vendorId,
        vendor: { legalName: r.legalName, gstin: r.vendorGstin, contactName: r.contactName, contactEmail: r.contactEmail, contactPhone: r.contactPhone },
        items: [],
        totalAtRisk: 0,
        deadline: r.deadline,
      };
      byVendor.set(r.vendorId, notice);
    }
    notice.items.push({
      matchResultId: r.matchResultId,
      invoiceNumber: r.prNumber ?? r.b2bNumber ?? '',
      invoiceDate: r.prDate ?? r.b2bDate ?? '',
      status: r.status,
      bookedTax: r.prTax ?? 0,
      reportedTax: r.b2bTax ?? 0,
      itcAtRisk: r.itcAtRisk,
      reportedUnderGstin: r.status === 'GSTIN_MISMATCH' ? r.b2bGstin : null,
      deadline: r.deadline,
    });
    notice.totalAtRisk = Math.round((notice.totalAtRisk + r.itcAtRisk) * 100) / 100;
    if (r.deadline < notice.deadline) notice.deadline = r.deadline;
  }
  return [...byVendor.values()]
    .filter((n) => n.totalAtRisk >= threshold)
    .sort((a, b) => b.totalAtRisk - a.totalAtRisk);
}

export type Channel = 'EMAIL' | 'WHATSAPP';

export interface DispatchOptions {
  organizationId: string;
  runId: string;
  /** Public app URL used in statement links. */
  appBaseUrl: string;
  /** Email channel; omit to disable it. */
  transport?: EmailTransport;
  from?: string;
  replyTo?: string;
  /** WhatsApp channel; omit to disable it. */
  whatsapp?: WhatsAppTransport;
  threshold?: number;
  /** Only these vendors (one-click reminders from the UI). */
  vendorIds?: string[];
  /** Send the next stage now instead of waiting for T+5 / T+10. */
  force?: boolean;
  now?: Date;
  /** Render and report without sending or writing anything. */
  dryRun?: boolean;
}

export interface DispatchReport {
  sent: { channel: Channel; vendorGstin: string; stage: DunningStage; to: string; communicationId: string; totalAtRisk: number }[];
  skipped: { channel: Channel; vendorGstin: string; reason: string }[];
  failed: { channel: Channel; vendorGstin: string; stage: DunningStage; error: string }[];
  previews: { channel: Channel; vendorGstin: string; stage: DunningStage; subject: string }[];
}

/**
 * Sends whichever escalation stage is due, on every configured channel, to each vendor
 * with enough recoverable ITC at risk. Each channel keeps its own T+0/T+5/T+10 cadence;
 * a vendor reply on any channel stops all of them.
 */
export async function dispatchDunning(db: Db, options: DispatchOptions): Promise<DispatchReport> {
  const now = options.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const report: DispatchReport = { sent: [], skipped: [], failed: [], previews: [] };

  const channels: Channel[] = [];
  if (options.transport) {
    if (!options.from) throw new Error('"from" is required for the email channel');
    channels.push('EMAIL');
  }
  if (options.whatsapp) channels.push('WHATSAPP');
  if (!channels.length) throw new Error('No dunning channel configured (email transport or WhatsApp transport)');

  const [run] = await db
    .select()
    .from(schema.reconciliationRuns)
    .where(and(eq(schema.reconciliationRuns.id, options.runId), eq(schema.reconciliationRuns.organizationId, options.organizationId)));
  if (!run) throw new Error('Reconciliation run not found for this organization');
  if (run.status !== 'COMPLETED') throw new Error(`Reconciliation run is ${run.status}, not COMPLETED`);

  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, options.organizationId));
  const financeCc = (
    await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.organizationId, options.organizationId),
          eq(schema.users.isActive, true),
          inArray(schema.users.role, ['ADMIN', 'FINANCE_MANAGER']),
        ),
      )
  ).map((u) => u.email);

  const notices = (await loadVendorNotices(db, { organizationId: options.organizationId, runId: options.runId, threshold: options.threshold })).filter(
    (n) => !options.vendorIds || options.vendorIds.includes(n.vendorId),
  );
  const comms = schema.vendorCommunications;
  const windowStart = new Date(now.getTime() - CAMPAIGN_WINDOW_DAYS * DAY_MS);

  for (const notice of notices) {
    const gstin = notice.vendor.gstin;
    const daysToDeadline = toEpochDay(notice.deadline) - toEpochDay(today);

    // Escalation follows the vendor across reconciliation runs, so re-running
    // reconciliation does not restart it. A new cycle starts once the window has passed.
    const allHistory = (
      await db
        .select({
          id: comms.id,
          channel: comms.channel,
          runId: comms.reconciliationRunId,
          stage: comms.escalationStage,
          status: comms.status,
          sentAt: comms.sentAt,
          createdAt: comms.createdAt,
        })
        .from(comms)
        .where(and(eq(comms.organizationId, options.organizationId), eq(comms.vendorId, notice.vendorId)))
    ).filter((h) => (h.sentAt ?? h.createdAt) >= windowStart || (h.runId === options.runId && !h.sentAt));
    const responded = allHistory.some((h) => h.status === 'RESPONDED');

    // One statement link per vendor per dispatch, shared by its channels.
    let token: { token: string; id: string } | undefined;
    const getToken = async () =>
      (token ??= await createStatementToken(db, {
        organizationId: options.organizationId,
        vendorId: notice.vendorId,
        reconciliationRunId: options.runId,
        expiresAt: new Date(Math.max(toEpochDay(notice.deadline) * DAY_MS + 30 * DAY_MS, now.getTime() + 60 * DAY_MS)),
      }));

    for (const channel of channels) {
      const to = channel === 'EMAIL' ? notice.vendor.contactEmail : normalizeIndianMobile(notice.vendor.contactPhone);
      if (!to) {
        const reason =
          channel === 'EMAIL'
            ? 'no contact email'
            : notice.vendor.contactPhone
              ? `invalid WhatsApp number "${notice.vendor.contactPhone}"`
              : 'no WhatsApp number';
        report.skipped.push({ channel, vendorGstin: gstin, reason });
        continue;
      }
      if (responded) {
        report.skipped.push({ channel, vendorGstin: gstin, reason: 'vendor responded' });
        continue;
      }

      const history = allHistory.filter((h) => h.channel === channel);
      const stage = nextDueStage(history, now, options.force);
      if (stage === null) {
        const reason = history.some((h) => h.stage === 2 && h.sentAt) ? 'escalation complete' : 'next stage not due yet';
        report.skipped.push({ channel, vendorGstin: gstin, reason });
        continue;
      }

      const waInput = (statementToken: string) => ({
        stage,
        buyerLegalName: org.legalName,
        vendorContactName: notice.vendor.contactName || notice.vendor.legalName,
        invoiceCount: notice.items.length,
        totalAtRisk: notice.totalAtRisk,
        financialYear: run.financialYear,
        deadline: notice.deadline,
        statementToken,
      });
      const renderEmail = (url: string) =>
        renderDunningEmail({
          stage,
          buyer: { legalName: org.legalName, gstin: org.primaryGstin },
          vendor: notice.vendor,
          financialYear: run.financialYear,
          deadline: notice.deadline,
          daysToDeadline,
          items: notice.items,
          totalAtRisk: notice.totalAtRisk,
          statementUrl: url,
        });

      if (options.dryRun) {
        const subject =
          channel === 'EMAIL'
            ? renderEmail(statementUrl(options.appBaseUrl, 'preview')).subject
            : `WhatsApp template ${WHATSAPP_TEMPLATES[stage].name}`;
        report.previews.push({ channel, vendorGstin: gstin, stage, subject });
        continue;
      }

      // Claim the (run, vendor, channel, stage) slot. A FAILED attempt in this run is retried.
      const existing = history.find((h) => h.stage === stage && h.runId === options.runId);
      if (existing && existing.status !== 'FAILED') {
        report.skipped.push({ channel, vendorGstin: gstin, reason: `stage ${stage} already ${existing.status.toLowerCase()}` });
        continue;
      }
      const templateId = channel === 'EMAIL' ? CADENCE[stage].templateId : WHATSAPP_TEMPLATES[stage].name;
      let communicationId: string;
      if (existing) {
        communicationId = existing.id;
        await db.update(comms).set({ status: 'QUEUED', failureReason: null, recipientAddress: to }).where(eq(comms.id, existing.id));
      } else {
        const [claimed] = await db
          .insert(comms)
          .values({
            organizationId: options.organizationId,
            vendorId: notice.vendorId,
            reconciliationRunId: options.runId,
            channel,
            escalationStage: stage,
            recipientAddress: to,
            templateId,
            payload: {},
          })
          .onConflictDoNothing()
          .returning({ id: comms.id });
        if (!claimed) {
          report.skipped.push({ channel, vendorGstin: gstin, reason: `stage ${stage} claimed by another dispatcher` });
          continue;
        }
        communicationId = claimed.id;
      }

      try {
        const { token: rawToken, id: tokenId } = await getToken();
        const common = {
          stage,
          itemCount: notice.items.length,
          totalAtRisk: notice.totalAtRisk,
          deadline: notice.deadline,
          statementTokenId: tokenId,
          matchResultIds: notice.items.map((i) => i.matchResultId),
          paymentHold: stage === 2,
        };
        let messageId: string;
        let payload: Record<string, unknown>;
        if (channel === 'EMAIL') {
          const email = renderEmail(statementUrl(options.appBaseUrl, rawToken));
          payload = { ...common, subject: email.subject, transport: options.transport!.name };
          ({ messageId } = await options.transport!.send({
            from: options.from!,
            to,
            cc: stage === 2 ? financeCc : undefined,
            replyTo: options.replyTo,
            subject: email.subject,
            html: email.html,
            text: email.text,
            attachments: [{ filename: `ITC-discrepancies-${gstin}-${run.financialYear}.csv`, content: email.csv, contentType: 'text/csv' }],
            headers: { 'X-GST-ITC-Communication-Id': communicationId, 'X-GST-ITC-Stage': String(stage) },
          }));
        } else {
          const input = waInput(rawToken);
          const request = buildMetaTemplateMessage(to, input);
          // The raw token is a secret: keep the request in the audit trail without it.
          const auditRequest = buildMetaTemplateMessage(to, { ...input, statementToken: '<token>' });
          payload = { ...common, template: request.template.name, request: auditRequest, transport: options.whatsapp!.name };
          ({ messageId } = await options.whatsapp!.send({
            to,
            request,
            previewText: renderWhatsAppText(input, options.appBaseUrl),
            communicationId,
          }));
        }
        // The message has left: from here on the row must end up SENT, never FAILED, or a
        // retry would contact the vendor twice.
        try {
          await db.update(comms).set({ status: 'SENT', sentAt: now, externalMessageId: messageId, payload }).where(eq(comms.id, communicationId));
        } catch (recordErr) {
          await db
            .update(comms)
            .set({ status: 'SENT', sentAt: now, payload, failureReason: `Sent, but recording the message id failed: ${String(recordErr).slice(0, 500)}` })
            .where(eq(comms.id, communicationId));
        }
        report.sent.push({ channel, vendorGstin: gstin, stage, to, communicationId, totalAtRisk: notice.totalAtRisk });
      } catch (err) {
        const error = describeError(err);
        await db.update(comms).set({ status: 'FAILED', failureReason: error.slice(0, 1_000) }).where(eq(comms.id, communicationId));
        report.failed.push({ channel, vendorGstin: gstin, stage, error });
      }
    }
  }
  return report;
}

/** Email-and-WhatsApp dispatcher; the old name is kept for existing call sites. */
export const dispatchDunningEmails = dispatchDunning;


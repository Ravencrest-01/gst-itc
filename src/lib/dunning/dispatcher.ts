import { aliasedTable, and, eq, gt, inArray } from 'drizzle-orm';
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
export function nextDueStage(history: CommHistory[], now: Date): DunningStage | null {
  if (history.some((h) => h.status === 'RESPONDED')) return null;
  const sent = history.filter((h) => h.sentAt && h.status !== 'FAILED' && h.status !== 'QUEUED');
  if (!sent.length) return 0;
  const first = sent.find((h) => h.stage === 0)?.sentAt ?? sent[0].sentAt!;
  const next = Math.max(...sent.map((h) => h.stage)) + 1;
  const step = CADENCE.find((c) => c.stage === next);
  if (!step) return null;
  return now.getTime() - first.getTime() >= step.afterDays * DAY_MS ? step.stage : null;
}

export interface VendorNotice {
  vendorId: string;
  vendor: { legalName: string; gstin: string; contactName: string | null; contactEmail: string | null };
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
      status: mr.matchStatus,
      itcAtRisk: mr.itcAtRisk,
      deadline: mr.section164Deadline,
      vendorId: schema.vendors.id,
      legalName: schema.vendors.legalName,
      vendorGstin: schema.vendors.gstin,
      contactName: schema.vendors.contactName,
      contactEmail: schema.vendors.contactEmail,
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
        inArray(mr.matchStatus, [...ACTIONABLE]),
      ),
    )
    .orderBy(mr.section164Deadline, pr.invoiceDate);

  const byVendor = new Map<string, VendorNotice>();
  for (const r of rows) {
    let notice = byVendor.get(r.vendorId);
    if (!notice) {
      notice = {
        vendorId: r.vendorId,
        vendor: { legalName: r.legalName, gstin: r.vendorGstin, contactName: r.contactName, contactEmail: r.contactEmail },
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

export interface DispatchOptions {
  organizationId: string;
  runId: string;
  transport: EmailTransport;
  /** Public app URL used in statement links. */
  appBaseUrl: string;
  from: string;
  replyTo?: string;
  threshold?: number;
  now?: Date;
  /** Render and report without sending or writing anything. */
  dryRun?: boolean;
}

export interface DispatchReport {
  sent: { vendorGstin: string; stage: DunningStage; to: string; communicationId: string; totalAtRisk: number }[];
  skipped: { vendorGstin: string; reason: string }[];
  failed: { vendorGstin: string; stage: DunningStage; error: string }[];
  previews: { vendorGstin: string; stage: DunningStage; subject: string }[];
}

/** Sends whichever escalation stage is due to every vendor with enough ITC at risk. */
export async function dispatchDunningEmails(db: Db, options: DispatchOptions): Promise<DispatchReport> {
  const now = options.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const report: DispatchReport = { sent: [], skipped: [], failed: [], previews: [] };

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

  const notices = await loadVendorNotices(db, { organizationId: options.organizationId, runId: options.runId, threshold: options.threshold });
  const comms = schema.vendorCommunications;

  for (const notice of notices) {
    const gstin = notice.vendor.gstin;
    const to = notice.vendor.contactEmail;
    if (!to) {
      report.skipped.push({ vendorGstin: gstin, reason: 'no contact email' });
      continue;
    }

    // Escalation follows the vendor across reconciliation runs, so re-running reconciliation
    // does not restart the sequence. A new cycle starts once the window has passed.
    const windowStart = new Date(now.getTime() - CAMPAIGN_WINDOW_DAYS * DAY_MS);
    const history = (
      await db
        .select({ id: comms.id, runId: comms.reconciliationRunId, stage: comms.escalationStage, status: comms.status, sentAt: comms.sentAt, createdAt: comms.createdAt })
        .from(comms)
        .where(and(eq(comms.organizationId, options.organizationId), eq(comms.vendorId, notice.vendorId), eq(comms.channel, 'EMAIL')))
    ).filter((h) => (h.sentAt ?? h.createdAt) >= windowStart || (h.runId === options.runId && !h.sentAt));
    const stage = nextDueStage(history, now);
    if (stage === null) {
      const done = history.some((h) => h.status === 'RESPONDED') ? 'vendor responded' : history.some((h) => h.stage === 2 && h.sentAt) ? 'escalation complete' : 'next stage not due yet';
      report.skipped.push({ vendorGstin: gstin, reason: done });
      continue;
    }
    const step = CADENCE[stage];
    const daysToDeadline = toEpochDay(notice.deadline) - toEpochDay(today);

    const renderFor = (url: string) =>
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
      const preview = renderFor(statementUrl(options.appBaseUrl, 'preview'));
      report.previews.push({ vendorGstin: gstin, stage, subject: preview.subject });
      continue;
    }

    // Claim the (run, vendor, channel, stage) slot. A FAILED attempt in this run is retried.
    const existing = history.find((h) => h.stage === stage && h.runId === options.runId);
    if (existing && existing.status !== 'FAILED') {
      report.skipped.push({ vendorGstin: gstin, reason: `stage ${stage} already ${existing.status.toLowerCase()}` });
      continue;
    }
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
          channel: 'EMAIL',
          escalationStage: stage,
          recipientAddress: to,
          templateId: step.templateId,
          payload: {},
        })
        .onConflictDoNothing()
        .returning({ id: comms.id });
      if (!claimed) {
        report.skipped.push({ vendorGstin: gstin, reason: `stage ${stage} claimed by another dispatcher` });
        continue;
      }
      communicationId = claimed.id;
    }

    try {
      const expiresAt = new Date(Math.max(toEpochDay(notice.deadline) * DAY_MS + 30 * DAY_MS, now.getTime() + 60 * DAY_MS));
      const token = await createStatementToken(db, {
        organizationId: options.organizationId,
        vendorId: notice.vendorId,
        reconciliationRunId: options.runId,
        expiresAt,
      });
      const email = renderFor(statementUrl(options.appBaseUrl, token.token));
      const payload = {
        subject: email.subject,
        stage,
        itemCount: notice.items.length,
        totalAtRisk: notice.totalAtRisk,
        deadline: notice.deadline,
        statementTokenId: token.id,
        matchResultIds: notice.items.map((i) => i.matchResultId),
        paymentHold: stage === 2,
        transport: options.transport.name,
      };
      const { messageId } = await options.transport.send({
        from: options.from,
        to,
        cc: stage === 2 ? financeCc : undefined,
        replyTo: options.replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: [{ filename: `ITC-discrepancies-${gstin}-${run.financialYear}.csv`, content: email.csv, contentType: 'text/csv' }],
        headers: { 'X-GST-ITC-Communication-Id': communicationId, 'X-GST-ITC-Stage': String(stage) },
      });
      // The email has left: from here on the row must end up SENT, never FAILED, or a
      // retry would email the vendor twice.
      try {
        await db
          .update(comms)
          .set({ status: 'SENT', sentAt: now, externalMessageId: messageId, payload })
          .where(eq(comms.id, communicationId));
      } catch (recordErr) {
        await db
          .update(comms)
          .set({
            status: 'SENT',
            sentAt: now,
            payload,
            failureReason: `Sent, but recording the message id failed: ${String(recordErr).slice(0, 500)}`,
          })
          .where(eq(comms.id, communicationId));
      }
      report.sent.push({ vendorGstin: gstin, stage, to, communicationId, totalAtRisk: notice.totalAtRisk });
    } catch (err) {
      const error = describeError(err);
      await db.update(comms).set({ status: 'FAILED', failureReason: error.slice(0, 1_000) }).where(eq(comms.id, communicationId));
      report.failed.push({ vendorGstin: gstin, stage, error });
    }
  }
  return report;
}

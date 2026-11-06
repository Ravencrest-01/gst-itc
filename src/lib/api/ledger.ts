import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client';
import * as schema from '../../db/schema';
import { ACTIONABLE } from '../dunning/dispatcher';
import { booleanParam, financialYearSchema, notFound, uuidSchema } from './http';
import { RESOLVED_STATUSES } from './results';
import { latestCompletedRun } from './runs';

export const ledgerQuerySchema = z.object({
  /** Defaults to the latest completed run (optionally of financialYear). */
  runId: uuidSchema.optional(),
  financialYear: financialYearSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  /** Only vendors that currently qualify for reminders */
  dunningOnly: booleanParam.optional(),
  threshold: z.coerce.number().min(0).default(5_000),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
});

const mr = schema.matchResults;
const v = schema.vendors;
const list = (items: readonly string[]) => sql.join(items.map((s) => sql`${s}`), sql`, `);
const effective = sql`coalesce(${mr.overrideStatus}, ${mr.matchStatus})`;
const effectiveAtRisk = sql`(case when ${mr.overrideStatus} in (${list(RESOLVED_STATUSES)}) then 0 else ${mr.itcAtRisk} end)`;

/** Vendors of one run ranked by recoverable ITC at risk, with their latest communication. */
export async function queryVendorLedger(db: Db, organizationId: string, q: z.infer<typeof ledgerQuerySchema>) {
  let run;
  if (q.runId) {
    [run] = await db
      .select()
      .from(schema.reconciliationRuns)
      .where(and(eq(schema.reconciliationRuns.id, q.runId), eq(schema.reconciliationRuns.organizationId, organizationId)));
    if (!run) throw notFound('Reconciliation run');
  } else {
    run = await latestCompletedRun(db, organizationId, q.financialYear);
  }
  if (!run) return { run: null, vendors: [], total: 0, page: q.page, pageSize: q.pageSize };

  const agg = db
    .select({
      vendorId: mr.vendorId,
      prCount: sql<number>`count(*) filter (where ${mr.prInvoiceId} is not null)::int`.as('pr_count'),
      cleanCount: sql<number>`count(*) filter (where ${mr.prInvoiceId} is not null and ${effective} in (${list(RESOLVED_STATUSES)}))::int`.as('clean_count'),
      openIssues: sql<number>`count(*) filter (where ${effective} not in (${list(RESOLVED_STATUSES)}))::int`.as('open_issues'),
      itcAtRisk: sql<number>`coalesce(sum(${effectiveAtRisk}) filter (where not ${mr.isItcLapsed}), 0)::float8`.as('itc_at_risk'),
      actionableAtRisk: sql<number>`coalesce(sum(${effectiveAtRisk}) filter (where not ${mr.isItcLapsed} and ${effective} in (${list(ACTIONABLE)})), 0)::float8`.as('actionable_at_risk'),
      itcOpportunity: sql<number>`coalesce(sum(${mr.itcOpportunity}) filter (where not ${mr.isItcLapsed}), 0)::float8`.as('itc_opportunity'),
      section164Exposure: sql<number>`coalesce(sum(${effectiveAtRisk} + ${mr.itcOpportunity}) filter (where ${mr.isSection164Risk}), 0)::float8`.as('s164_exposure'),
      lapsedItc: sql<number>`coalesce(sum(${mr.itcAtRisk} + ${mr.itcOpportunity}) filter (where ${mr.isItcLapsed}), 0)::float8`.as('lapsed_itc'),
      nearestDeadline: sql<string | null>`min(${mr.section164Deadline}) filter (where not ${mr.isItcLapsed} and (${effectiveAtRisk} > 0 or ${mr.itcOpportunity} > 0))`.as('nearest_deadline'),
    })
    .from(mr)
    .where(eq(mr.reconciliationRunId, run.id))
    .groupBy(mr.vendorId)
    .as('agg');

  const where = and(
    eq(v.organizationId, organizationId),
    q.q ? or(ilike(v.legalName, `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`), ilike(v.gstin, `%${q.q}%`)) : undefined,
    q.dunningOnly ? sql`${agg.actionableAtRisk} >= ${q.threshold}` : undefined,
  );
  const base = () => db.select().from(v).innerJoin(agg, eq(agg.vendorId, v.id));
  const [rows, [{ total }]] = await Promise.all([
    base()
      .where(where)
      .orderBy(desc(agg.actionableAtRisk), desc(agg.itcAtRisk), asc(v.legalName))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(v).innerJoin(agg, eq(agg.vendorId, v.id)).where(where),
  ]);

  const ids = rows.map((r) => r.vendors.id);
  const c = schema.vendorCommunications;
  const last = ids.length
    ? await db
        .selectDistinctOn([c.vendorId, c.channel], {
          vendorId: c.vendorId,
          channel: c.channel,
          status: c.status,
          stage: c.escalationStage,
          sentAt: c.sentAt,
          createdAt: c.createdAt,
        })
        .from(c)
        .where(and(eq(c.organizationId, organizationId), inArray(c.vendorId, ids)))
        .orderBy(c.vendorId, c.channel, desc(c.createdAt))
    : [];
  const lastBy = new Map<string, typeof last>();
  for (const l of last) lastBy.set(l.vendorId, [...(lastBy.get(l.vendorId) ?? []), l]);

  return {
    run: { id: run.id, financialYear: run.financialYear, asOfDate: run.asOfDate, runDate: run.runDate },
    total,
    page: q.page,
    pageSize: q.pageSize,
    vendors: rows.map(({ vendors: vendor, agg: a }) => ({
      id: vendor.id,
      gstin: vendor.gstin,
      legalName: vendor.legalName,
      contactName: vendor.contactName,
      contactEmail: vendor.contactEmail,
      contactPhone: vendor.contactPhone,
      riskTier: vendor.riskTier,
      complianceScore: vendor.complianceScore,
      prCount: a.prCount,
      cleanCount: a.cleanCount,
      openIssues: a.openIssues,
      itcAtRisk: a.itcAtRisk,
      actionableAtRisk: a.actionableAtRisk,
      itcOpportunity: a.itcOpportunity,
      section164Exposure: a.section164Exposure,
      lapsedItc: a.lapsedItc,
      nearestDeadline: a.nearestDeadline,
      dunningEligible: a.actionableAtRisk >= q.threshold,
      lastCommunications: lastBy.get(vendor.id) ?? [],
    })),
  };
}

export const communicationsQuerySchema = z.object({
  vendorId: uuidSchema.optional(),
  runId: uuidSchema.optional(),
  channel: z.enum(['EMAIL', 'WHATSAPP']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Communication history, newest first. Statement tokens and raw payload secrets are not exposed. */
export async function queryCommunications(db: Db, organizationId: string, q: z.infer<typeof communicationsQuerySchema>) {
  const c = schema.vendorCommunications;
  const where = and(
    eq(c.organizationId, organizationId),
    q.vendorId ? eq(c.vendorId, q.vendorId) : undefined,
    q.runId ? eq(c.reconciliationRunId, q.runId) : undefined,
    q.channel ? eq(c.channel, q.channel) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: c.id,
        vendorId: c.vendorId,
        vendorName: v.legalName,
        vendorGstin: v.gstin,
        runId: c.reconciliationRunId,
        channel: c.channel,
        stage: c.escalationStage,
        templateId: c.templateId,
        recipient: c.recipientAddress,
        status: c.status,
        failureReason: c.failureReason,
        subject: sql<string | null>`${c.payload}->>'subject'`,
        itemCount: sql<number | null>`(${c.payload}->>'itemCount')::int`,
        totalAtRisk: sql<number | null>`(${c.payload}->>'totalAtRisk')::float8`,
        paymentHold: sql<boolean | null>`(${c.payload}->>'paymentHold')::boolean`,
        reply: sql<{ text: string; at: string } | null>`${c.payload}->'reply'`,
        sentAt: c.sentAt,
        deliveredAt: c.deliveredAt,
        readAt: c.readAt,
        respondedAt: c.respondedAt,
        createdAt: c.createdAt,
      })
      .from(c)
      .innerJoin(v, eq(v.id, c.vendorId))
      .where(where)
      .orderBy(desc(c.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(c).where(where),
  ]);
  return { communications: rows, total, page: q.page, pageSize: q.pageSize };
}

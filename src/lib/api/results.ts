import { aliasedTable, and, asc, desc, eq, gt, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client';
import * as schema from '../../db/schema';
import type { MatchStatus } from '../reconciliation/types';
import { booleanParam, csvList, HttpError, notFound, uuidSchema } from './http';

export const MATCH_STATUSES = schema.matchStatusEnum.enumValues as unknown as [MatchStatus, ...MatchStatus[]];

/** Statuses that mean "nothing for the vendor to fix"; overriding to one clears the exposure. */
export const RESOLVED_STATUSES: readonly MatchStatus[] = ['EXACT_MATCH', 'PROBABLE_MATCH', 'DATE_MISMATCH'];

export const resultFiltersSchema = z.object({
  status: csvList(z.enum(MATCH_STATUSES)).optional(),
  /** Only rows flagged as Section 16(4) risk */
  risk164: booleanParam.optional(),
  lapsed: booleanParam.optional(),
  overridden: booleanParam.optional(),
  vendorId: uuidSchema.optional(),
  /** Invoice number, GSTIN or vendor name */
  q: z.string().trim().min(1).max(100).optional(),
  minAtRisk: z.coerce.number().min(0).optional(),
});
export type ResultFilters = z.infer<typeof resultFiltersSchema>;

export const SORTS = ['itcAtRisk', '-itcAtRisk', 'invoiceDate', '-invoiceDate', 'vendor', '-vendor', 'status', '-status', 'deadline', '-deadline'] as const;
export const resultQuerySchema = resultFiltersSchema.extend({
  sort: z.enum(SORTS).default('-itcAtRisk'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

const mr = schema.matchResults;
const pr = schema.purchaseRegisterInvoices;
const b2b = aliasedTable(schema.gstr2bInvoices, 'b2b');
const vendors = schema.vendors;

const effectiveStatus = sql<MatchStatus>`coalesce(${mr.overrideStatus}, ${mr.matchStatus})`;
const resolvedList = sql.join(RESOLVED_STATUSES.map((s) => sql`${s}`), sql`, `);
/** ITC at risk after manual overrides: an override to a resolved status clears it. */
const effectiveAtRisk = sql<number>`(case when ${mr.overrideStatus} in (${resolvedList}) then 0 else ${mr.itcAtRisk} end)::float8`;

export const resultColumns = {
  id: mr.id,
  status: effectiveStatus,
  matchStatus: mr.matchStatus,
  overrideStatus: mr.overrideStatus,
  matchPass: mr.matchPass,
  confidence: mr.confidence,
  vendorId: mr.vendorId,
  vendorName: vendors.legalName,
  supplierGstin: mr.supplierGstin,
  financialYear: mr.financialYear,
  prInvoiceId: mr.prInvoiceId,
  prInvoiceNumber: pr.rawInvoiceNumber,
  prInvoiceDate: pr.invoiceDate,
  prDocumentType: pr.documentType,
  prTaxableValue: pr.taxableValue,
  prTotalTax: pr.totalTax,
  gstr2bInvoiceId: mr.gstr2bInvoiceId,
  gstr2bInvoiceNumber: b2b.rawInvoiceNumber,
  gstr2bInvoiceDate: b2b.invoiceDate,
  gstr2bTaxableValue: b2b.taxableValue,
  gstr2bTotalTax: b2b.totalTax,
  gstr2bReturnPeriod: b2b.returnPeriod,
  gstr2bSupplierGstin: b2b.supplierGstin,
  taxableDifference: mr.taxableDifference,
  taxDifference: mr.taxDifference,
  itcAtRisk: effectiveAtRisk,
  originalItcAtRisk: mr.itcAtRisk,
  itcOpportunity: mr.itcOpportunity,
  isSection164Risk: mr.isSection164Risk,
  isItcLapsed: mr.isItcLapsed,
  section164Deadline: mr.section164Deadline,
  riskTier: mr.riskTier,
  notes: mr.notes,
  overrideByUserId: mr.overrideByUserId,
  overriddenAt: mr.overriddenAt,
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function whereFor(runId: string, f: ResultFilters): SQL {
  const conditions: (SQL | undefined)[] = [eq(mr.reconciliationRunId, runId)];
  if (f.status?.length) conditions.push(inArray(effectiveStatus, f.status));
  if (f.risk164 !== undefined) conditions.push(eq(mr.isSection164Risk, f.risk164));
  if (f.lapsed !== undefined) conditions.push(eq(mr.isItcLapsed, f.lapsed));
  if (f.overridden !== undefined) conditions.push(f.overridden ? isNotNull(mr.overrideStatus) : isNull(mr.overrideStatus));
  if (f.vendorId) conditions.push(eq(mr.vendorId, f.vendorId));
  if (f.minAtRisk !== undefined) conditions.push(sql`${effectiveAtRisk} >= ${f.minAtRisk}`);
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    conditions.push(
      or(
        ilike(pr.rawInvoiceNumber, like),
        ilike(b2b.rawInvoiceNumber, like),
        ilike(mr.supplierGstin, like),
        ilike(vendors.legalName, like),
      ),
    );
  }
  return and(...conditions)!;
}

function joined<T extends Record<string, unknown>>(db: Db, columns: T) {
  return db
    .select(columns as never)
    .from(mr)
    .leftJoin(vendors, eq(vendors.id, mr.vendorId))
    .leftJoin(pr, eq(pr.id, mr.prInvoiceId))
    .leftJoin(b2b, eq(b2b.id, mr.gstr2bInvoiceId));
}

async function assertRun(db: Db, organizationId: string, runId: string) {
  const [run] = await db
    .select({ id: schema.reconciliationRuns.id })
    .from(schema.reconciliationRuns)
    .where(and(eq(schema.reconciliationRuns.id, runId), eq(schema.reconciliationRuns.organizationId, organizationId)));
  if (!run) throw notFound('Reconciliation run');
}

const ORDER: Record<(typeof SORTS)[number], SQL> = {
  itcAtRisk: asc(effectiveAtRisk),
  '-itcAtRisk': desc(effectiveAtRisk),
  invoiceDate: sql`coalesce(${pr.invoiceDate}, ${b2b.invoiceDate}) asc`,
  '-invoiceDate': sql`coalesce(${pr.invoiceDate}, ${b2b.invoiceDate}) desc`,
  vendor: sql`${vendors.legalName} asc nulls last`,
  '-vendor': sql`${vendors.legalName} desc nulls last`,
  status: asc(effectiveStatus),
  '-status': desc(effectiveStatus),
  deadline: asc(mr.section164Deadline),
  '-deadline': desc(mr.section164Deadline),
};

export type ResultRow = { [K in keyof typeof resultColumns]: (typeof resultColumns)[K] extends { _: { data: infer D } } ? D : unknown } & Record<string, unknown>;

export async function queryResults(db: Db, organizationId: string, runId: string, q: z.infer<typeof resultQuerySchema>) {
  await assertRun(db, organizationId, runId);
  const where = whereFor(runId, q);
  const [rows, [totals]] = await Promise.all([
    joined(db, resultColumns)
      .where(where)
      .orderBy(ORDER[q.sort], asc(mr.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize) as unknown as Promise<ResultRow[]>,
    joined(db, {
      count: sql<number>`count(*)::int`,
      itcAtRisk: sql<number>`coalesce(sum(${effectiveAtRisk}) filter (where not ${mr.isItcLapsed}), 0)::float8`,
      itcOpportunity: sql<number>`coalesce(sum(${mr.itcOpportunity}) filter (where not ${mr.isItcLapsed}), 0)::float8`,
      section164Risk: sql<number>`count(*) filter (where ${mr.isSection164Risk})::int`,
    }).where(where) as unknown as Promise<{ count: number; itcAtRisk: number; itcOpportunity: number; section164Risk: number }[]>,
  ]);
  return {
    rows,
    page: q.page,
    pageSize: q.pageSize,
    total: totals.count,
    pageCount: Math.max(1, Math.ceil(totals.count / q.pageSize)),
    totals: { itcAtRisk: totals.itcAtRisk, itcOpportunity: totals.itcOpportunity, section164Risk: totals.section164Risk },
  };
}

/** Pages through every matching row in a stable order (for exports). */
export async function* iterateResults(db: Db, organizationId: string, runId: string, f: ResultFilters, chunk = 2_000) {
  await assertRun(db, organizationId, runId);
  const where = whereFor(runId, f);
  let after: string | null = null;
  for (;;) {
    const rows = (await joined(db, resultColumns)
      .where(after ? and(where, gt(mr.id, after)) : where)
      .orderBy(asc(mr.id))
      .limit(chunk)) as unknown as ResultRow[];
    if (!rows.length) return;
    yield rows;
    after = rows[rows.length - 1].id as string;
    if (rows.length < chunk) return;
  }
}

export const overrideSchema = z.object({
  /** New status, or null to remove an earlier override. */
  status: z.enum(MATCH_STATUSES).nullable(),
  note: z.string().trim().min(3, 'Explain the override (audit trail)').max(1_000),
});

/** Manual override with an audit note; the engine's original status is kept. */
export async function overrideResult(
  db: Db,
  ctx: { organizationId: string; userId: string | null },
  resultId: string,
  body: z.infer<typeof overrideSchema>,
) {
  const [current] = await db
    .select({ id: mr.id, matchStatus: mr.matchStatus, overrideStatus: mr.overrideStatus, notes: mr.notes })
    .from(mr)
    .where(and(eq(mr.id, resultId), eq(mr.organizationId, ctx.organizationId)));
  if (!current) throw notFound('Match result');
  if (body.status === null && !current.overrideStatus) throw new HttpError(409, 'This result has no override to remove');
  if (body.status !== null && body.status === (current.overrideStatus ?? current.matchStatus)) {
    throw new HttpError(409, `Result is already ${body.status}`);
  }
  const stamp = new Date();
  const from = current.overrideStatus ?? current.matchStatus;
  const to = body.status ?? current.matchStatus;
  const entry = `[${stamp.toISOString()}${ctx.userId ? ` user ${ctx.userId}` : ''}] ${from} → ${to}${body.status === null ? ' (override removed)' : ''}: ${body.note}`;
  await db
    .update(mr)
    .set({
      overrideStatus: body.status,
      overrideByUserId: body.status === null ? null : ctx.userId,
      overriddenAt: body.status === null ? null : stamp,
      notes: current.notes ? `${current.notes}\n${entry}` : entry,
    })
    .where(eq(mr.id, resultId));
  const [row] = (await joined(db, resultColumns).where(eq(mr.id, resultId))) as unknown as ResultRow[];
  return row;
}

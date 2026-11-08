import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import * as schema from '../../db/schema';
import { notFound } from './http';
import { RESOLVED_STATUSES } from './results';

const runs = schema.reconciliationRuns;

export async function listRuns(db: Db, organizationId: string, opts: { financialYear?: string; limit?: number } = {}) {
  return db
    .select()
    .from(runs)
    .where(and(eq(runs.organizationId, organizationId), opts.financialYear ? eq(runs.financialYear, opts.financialYear) : undefined))
    .orderBy(desc(runs.runDate))
    .limit(opts.limit ?? 50);
}

/** One run with its status breakdown (by effective status, i.e. after manual overrides). */
export async function getRun(db: Db, organizationId: string, runId: string) {
  const [run] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.organizationId, organizationId)));
  if (!run) throw notFound('Reconciliation run');
  const mr = schema.matchResults;
  const effective = sql<string>`coalesce(${mr.overrideStatus}, ${mr.matchStatus})`;
  // An override to a resolved status clears the exposure, as in the results endpoint.
  const resolved = sql.join(RESOLVED_STATUSES.map((s) => sql`${s}`), sql`, `);
  const atRisk = sql`(case when ${mr.overrideStatus} in (${resolved}) then 0 else ${mr.itcAtRisk} end)`;
  const breakdown = await db
    .select({
      status: effective,
      count: sql<number>`count(*)::int`,
      itcAtRisk: sql<number>`coalesce(sum(${atRisk}) filter (where not ${mr.isItcLapsed}), 0)::float8`,
      itcOpportunity: sql<number>`coalesce(sum(${mr.itcOpportunity}) filter (where not ${mr.isItcLapsed}), 0)::float8`,
    })
    .from(mr)
    .where(eq(mr.reconciliationRunId, runId))
    .groupBy(effective);
  return { ...run, breakdown };
}

/** The latest completed run, optionally for one financial year. */
export async function latestCompletedRun(db: Db, organizationId: string, financialYear?: string) {
  const [run] = await db
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.organizationId, organizationId),
        eq(runs.status, 'COMPLETED'),
        financialYear ? eq(runs.financialYear, financialYear) : undefined,
      ),
    )
    .orderBy(desc(runs.runDate))
    .limit(1);
  return run ?? null;
}

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '@/db/schema';
import { getRequestContext } from '@/lib/api/context';
import { csvStream, xlsxStream } from '@/lib/api/export';
import { handler, notFound, readQuery, uuidSchema } from '@/lib/api/http';
import { iterateResults, resultFiltersSchema } from '@/lib/api/results';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = resultFiltersSchema.extend({ format: z.enum(['csv', 'xlsx']).default('csv') });

/** GET: streams the run's results (same filters as /results) as CSV or Excel. */
export const GET = handler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await getRequestContext(request);
  const runId = uuidSchema.parse((await params).id);
  const { format, ...filters } = readQuery(request, querySchema);
  const [run] = await ctx.db
    .select({ financialYear: schema.reconciliationRuns.financialYear, runDate: schema.reconciliationRuns.runDate })
    .from(schema.reconciliationRuns)
    .where(and(eq(schema.reconciliationRuns.id, runId), eq(schema.reconciliationRuns.organizationId, ctx.organizationId)));
  if (!run) throw notFound('Reconciliation run');

  const name = `itc-reconciliation-${run.financialYear}-${run.runDate.toISOString().slice(0, 10)}-${runId.slice(0, 8)}`;
  const rows = iterateResults(ctx.db, ctx.organizationId, runId, filters);
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (format === 'xlsx') {
    return new Response(xlsxStream(rows), {
      headers: {
        ...headers,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${name}.xlsx"`,
      },
    });
  }
  return new Response(csvStream(rows), {
    headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"` },
  });
});

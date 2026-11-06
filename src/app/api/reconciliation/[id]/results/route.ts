import { getRequestContext } from '@/lib/api/context';
import { handler, json, readQuery, uuidSchema } from '@/lib/api/http';
import { queryResults, resultQuerySchema } from '@/lib/api/results';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET: paginated match results with PR and GSTR-2B details.
 * Query: status (comma list), risk164, lapsed, overridden, vendorId, q, minAtRisk,
 * sort (itcAtRisk, invoiceDate, vendor, status, deadline; prefix "-" for descending),
 * page, pageSize (≤ 500). Totals cover every row matching the filters.
 */
export const GET = handler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await getRequestContext(request);
  const runId = uuidSchema.parse((await params).id);
  const query = readQuery(request, resultQuerySchema);
  return json(await queryResults(ctx.db, ctx.organizationId, runId, query));
});

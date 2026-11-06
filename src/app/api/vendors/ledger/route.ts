import { getRequestContext } from '@/lib/api/context';
import { handler, json, readQuery } from '@/lib/api/http';
import { ledgerQuerySchema, queryVendorLedger } from '@/lib/api/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET: vendors ranked by recoverable ITC at risk for a run (default: latest completed),
 * with compliance score, Section 16(4) exposure and latest message per channel.
 * Query: runId | financialYear, q, dunningOnly, threshold, page, pageSize.
 */
export const GET = handler(async (request: Request) => {
  const ctx = await getRequestContext(request);
  return json(await queryVendorLedger(ctx.db, ctx.organizationId, readQuery(request, ledgerQuerySchema)));
});

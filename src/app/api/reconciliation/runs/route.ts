import { z } from 'zod';
import { getRequestContext } from '@/lib/api/context';
import { financialYearSchema, handler, json, readQuery } from '@/lib/api/http';
import { listRuns } from '@/lib/api/runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  financialYear: financialYearSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** GET: recent reconciliation runs, newest first. */
export const GET = handler(async (request: Request) => {
  const ctx = await getRequestContext(request);
  const q = readQuery(request, querySchema);
  return json({ runs: await listRuns(ctx.db, ctx.organizationId, q) });
});

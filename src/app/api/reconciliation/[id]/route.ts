import { getRequestContext } from '@/lib/api/context';
import { handler, json, uuidSchema } from '@/lib/api/http';
import { getRun } from '@/lib/api/runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET: one run with totals and its breakdown by (effective) status. */
export const GET = handler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await getRequestContext(request);
  const id = uuidSchema.parse((await params).id);
  return json({ run: await getRun(ctx.db, ctx.organizationId, id) });
});

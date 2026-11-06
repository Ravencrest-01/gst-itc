import { getRequestContext } from '@/lib/api/context';
import { handler, json, readJson, uuidSchema } from '@/lib/api/http';
import { overrideResult, overrideSchema } from '@/lib/api/results';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH { status: MatchStatus | null, note }: manual override by the finance team. The
 * engine's status is kept; the note and actor are appended to the audit trail.
 */
export const PATCH = handler(async (request: Request, { params }: { params: Promise<{ resultId: string }> }) => {
  const ctx = await getRequestContext(request);
  const resultId = uuidSchema.parse((await params).resultId);
  const body = await readJson(request, overrideSchema);
  return json({ result: await overrideResult(ctx.db, ctx, resultId, body) });
});

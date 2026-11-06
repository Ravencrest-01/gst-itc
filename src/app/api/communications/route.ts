import { getRequestContext } from '@/lib/api/context';
import { handler, json, readQuery } from '@/lib/api/http';
import { communicationsQuerySchema, queryCommunications } from '@/lib/api/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET: message history (email + WhatsApp) with delivery, read and reply times. */
export const GET = handler(async (request: Request) => {
  const ctx = await getRequestContext(request);
  return json(await queryCommunications(ctx.db, ctx.organizationId, readQuery(request, communicationsQuerySchema)));
});

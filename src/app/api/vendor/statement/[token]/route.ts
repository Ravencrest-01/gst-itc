import { handler, json } from '@/lib/api/http';
import { loadVendorStatement } from '@/lib/api/statement';
import { getDb } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET (public): the discrepancy statement behind a vendor's email/WhatsApp link. The
 * token is the only credential; responses are not cached anywhere.
 */
export const GET = handler(async (_request: Request, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  const statement = await loadVendorStatement(await getDb(), token);
  return json(statement, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
});

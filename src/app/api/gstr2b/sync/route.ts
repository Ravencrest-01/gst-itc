import { eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '@/db/schema';
import { getRequestContext } from '@/lib/api/context';
import { financialYearSchema, handler, isoDateSchema, json, readJson } from '@/lib/api/http';
import { createPurchaseBackedMockGsp, syncFinancialYear, syncGstr2b } from '@/lib/gsp/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    financialYear: financialYearSchema.optional(),
    returnPeriod: z.string().regex(/^\d{2}-\d{4}$/, 'Expected MM-YYYY').optional(),
    asOf: isoDateSchema.optional(),
  })
  .refine((b) => Boolean(b.financialYear) !== Boolean(b.returnPeriod), 'Send either financialYear or returnPeriod');

/**
 * Fetches GSTR-2B from the GSP and ingests it. Until MVP the provider is the mock, which
 * serves fixtures from GSP_FIXTURES_DIR or derives statements from the purchase register.
 */
export const POST = handler(async (request: Request) => {
  const ctx = await getRequestContext(request);
  const body = await readJson(request, bodySchema);
  const [org] = await ctx.db.select().from(schema.organizations).where(eq(schema.organizations.id, ctx.organizationId));
  const provider = createPurchaseBackedMockGsp(ctx.db, ctx.organizationId, {}, process.env.GSP_FIXTURES_DIR);
  const input = { organizationId: ctx.organizationId, gstin: org.primaryGstin };

  const periods = body.returnPeriod
    ? [await syncGstr2b(ctx.db, provider, { ...input, returnPeriod: body.returnPeriod })]
    : await syncFinancialYear(ctx.db, provider, { ...input, financialYear: body.financialYear!, asOf: body.asOf });

  return json({
    provider: provider.name,
    periods,
    written: periods.reduce((n, p) => n + p.written, 0),
    failed: periods.filter((p) => p.error).length,
  });
});

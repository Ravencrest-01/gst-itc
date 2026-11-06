import { z } from 'zod';
import { getRequestContext } from '@/lib/api/context';
import { financialYearSchema, handler, isoDateSchema, json, readJson } from '@/lib/api/http';
import { runReconciliation } from '@/lib/reconciliation/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  financialYear: financialYearSchema,
  /** Section 16(4) clock date; defaults to today. */
  asOf: isoDateSchema.optional(),
  options: z
    .object({
      toleranceRupees: z.number().min(0).max(100).optional(),
      fuzzyThreshold: z.number().min(0.5).max(1).optional(),
      dateWindowDays: z.number().int().min(0).max(90).optional(),
      section164WindowDays: z.number().int().min(1).max(365).optional(),
      annualReturnFiledOn: z.record(z.string(), isoDateSchema).optional(),
    })
    .optional(),
});

/**
 * Runs the multi-pass match for one financial year and stores the results. Runs
 * synchronously: the engine handles ~10k invoices in well under a second.
 */
export const POST = handler(async (request: Request) => {
  const ctx = await getRequestContext(request);
  const body = await readJson(request, bodySchema);
  const { runId, summary, vendors } = await runReconciliation(ctx.db, {
    organizationId: ctx.organizationId,
    financialYear: body.financialYear,
    asOf: body.asOf,
    options: body.options,
    createdByUserId: ctx.userId ?? undefined,
  });
  return json(
    {
      runId,
      summary,
      topVendors: vendors.slice(0, 10),
      dunningEligibleVendors: vendors.filter((v) => v.dunningEligible).length,
    },
    { status: 201 },
  );
});

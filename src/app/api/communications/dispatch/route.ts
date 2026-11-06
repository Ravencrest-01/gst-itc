import { z } from 'zod';
import { getRequestContext } from '@/lib/api/context';
import { handler, HttpError, json, readJson, uuidSchema } from '@/lib/api/http';
import { latestCompletedRun } from '@/lib/api/runs';
import { dispatchDunning } from '@/lib/dunning/dispatcher';
import { emailTransportFromEnv } from '@/lib/notifications/email/transport';
import { whatsappTransportFromEnv } from '@/lib/notifications/whatsapp/transport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  /** Defaults to the latest completed run. */
  runId: uuidSchema.optional(),
  channels: z.array(z.enum(['EMAIL', 'WHATSAPP'])).min(1).default(['EMAIL', 'WHATSAPP']),
  /** Remind only these vendors (one-click reminder). Their ITC threshold is not applied. */
  vendorIds: z.array(uuidSchema).min(1).max(500).optional(),
  /** Send the next escalation stage now instead of waiting for T+5 / T+10. */
  force: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  /** Minimum recoverable ITC for automatic dunning. */
  threshold: z.number().min(0).optional(),
});

/** POST: sends due email and WhatsApp reminders and reports what happened per vendor. */
export const POST = handler(async (request: Request) => {
  const ctx = await getRequestContext(request);
  const body = await readJson(request, bodySchema);
  const runId = body.runId ?? (await latestCompletedRun(ctx.db, ctx.organizationId))?.id;
  if (!runId) throw new HttpError(409, 'No completed reconciliation run to send reminders for');

  const email = emailTransportFromEnv();
  const whatsapp = body.channels.includes('WHATSAPP') ? whatsappTransportFromEnv(email) : undefined;
  if (body.channels.includes('WHATSAPP') && !whatsapp && body.channels.length === 1) {
    throw new HttpError(409, 'WhatsApp is disabled (WHATSAPP_TRANSPORT=none)');
  }

  const report = await dispatchDunning(ctx.db, {
    organizationId: ctx.organizationId,
    runId,
    appBaseUrl: process.env.APP_BASE_URL ?? new URL(request.url).origin,
    transport: body.channels.includes('EMAIL') ? email : undefined,
    from: process.env.EMAIL_FROM ?? 'GST Compliance <compliance@gst-itc.local>',
    replyTo: process.env.EMAIL_REPLY_TO,
    whatsapp,
    vendorIds: body.vendorIds,
    threshold: body.threshold ?? (body.vendorIds ? 0 : undefined),
    force: body.force,
    dryRun: body.dryRun,
  });

  const touched = new Set([...report.sent, ...report.skipped, ...report.failed, ...report.previews].map((r) => r.vendorGstin));
  return json({
    runId,
    ...report,
    // Requested vendors that had nothing open in this run.
    nothingToRemind: body.vendorIds ? body.vendorIds.length - touched.size : undefined,
  });
});

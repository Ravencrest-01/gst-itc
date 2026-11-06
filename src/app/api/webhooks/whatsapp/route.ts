import { getDb } from '@/db/client';
import {
  processWhatsAppWebhook,
  verificationChallenge,
  verifyMetaSignature,
  type MetaWebhookPayload,
} from '@/lib/notifications/whatsapp/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Meta calls this once when the webhook URL is registered. */
export function GET(request: Request) {
  const challenge = verificationChallenge(new URL(request.url).searchParams, process.env.WHATSAPP_VERIFY_TOKEN);
  return challenge === null ? new Response('Forbidden', { status: 403 }) : new Response(challenge, { status: 200 });
}

/**
 * Delivery receipts and vendor replies. The signature is required whenever
 * WHATSAPP_APP_SECRET is set, and always in production; local mocks may post unsigned.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (secret) {
    if (!verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'), secret)) {
      return Response.json({ error: 'invalid signature' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'WHATSAPP_APP_SECRET is not configured' }, { status: 503 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }

  // Meta retries on non-2xx; processing is idempotent, so errors are surfaced as 500.
  try {
    const result = await processWhatsAppWebhook(await getDb(), payload);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error('WhatsApp webhook processing failed', err);
    return Response.json({ error: 'processing failed' }, { status: 500 });
  }
}

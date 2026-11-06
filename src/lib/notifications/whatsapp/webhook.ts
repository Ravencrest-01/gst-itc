import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Db } from '../../../db/client';
import * as schema from '../../../db/schema';

/**
 * WhatsApp Cloud API webhooks (the format Meta posts; Gupshup can be adapted to it).
 * Delivery receipts move `vendor_communications` forward (SENT → DELIVERED → READ);
 * an inbound reply marks the conversation RESPONDED, which stops escalation.
 */

export interface MetaStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  /** Unix seconds as a string */
  timestamp: string;
  recipient_id?: string;
  errors?: { code: number; title: string; message?: string; error_data?: { details?: string } }[];
}

export interface MetaInboundMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  button?: { text: string; payload?: string };
  interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
  context?: { id: string; from?: string };
}

export interface MetaWebhookPayload {
  object: string;
  entry?: {
    id?: string;
    changes?: {
      field?: string;
      value?: { messaging_product?: string; statuses?: MetaStatus[]; messages?: MetaInboundMessage[] };
    }[];
  }[];
}

// ---------------------------------------------------------------------------
// Request verification
// ---------------------------------------------------------------------------

/** Validates X-Hub-Signature-256 (HMAC-SHA256 of the raw body with the app secret). */
export function verifyMetaSignature(rawBody: string | Buffer, header: string | null | undefined, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function signMetaPayload(rawBody: string | Buffer, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
}

/** The GET handshake Meta performs when the webhook URL is registered. */
export function verificationChallenge(params: URLSearchParams, verifyToken: string | undefined): string | null {
  if (!verifyToken) return null;
  if (params.get('hub.mode') !== 'subscribe') return null;
  if (params.get('hub.verify_token') !== verifyToken) return null;
  return params.get('hub.challenge');
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

type CommStatus = (typeof schema.commStatusEnum.enumValues)[number];

/** Statuses only move forward; webhooks can arrive out of order or be retried. */
const RANK: Record<CommStatus, number> = { QUEUED: 0, SENT: 1, FAILED: 1, DELIVERED: 2, READ: 3, RESPONDED: 4 };
const FROM_META: Record<MetaStatus['status'], CommStatus> = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' };

export interface WebhookResult {
  statusesApplied: number;
  statusesIgnored: number;
  repliesMatched: number;
  repliesUnmatched: number;
}

const fromUnix = (ts: string | undefined) => {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
};

function replyText(m: MetaInboundMessage): string {
  return (m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? `[${m.type}]`).slice(0, 2_000);
}

export async function processWhatsAppWebhook(db: Db, payload: MetaWebhookPayload): Promise<WebhookResult> {
  const result: WebhookResult = { statusesApplied: 0, statusesIgnored: 0, repliesMatched: 0, repliesUnmatched: 0 };
  if (payload?.object !== 'whatsapp_business_account') return result;
  const comms = schema.vendorCommunications;

  const values = (payload.entry ?? []).flatMap((e) => (e.changes ?? []).map((c) => c.value ?? {}));
  const statuses = values.flatMap((v) => v.statuses ?? []);
  const messages = values.flatMap((v) => v.messages ?? []);

  // ---- delivery receipts ----------------------------------------------------
  // Oldest first, so a batch containing "delivered" and "read" ends on "read".
  statuses.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const ids = [...new Set(statuses.map((s) => s.id))];
  const rows = ids.length
    ? await db
        .select({ id: comms.id, externalMessageId: comms.externalMessageId, status: comms.status, deliveredAt: comms.deliveredAt })
        .from(comms)
        .where(and(eq(comms.channel, 'WHATSAPP'), inArray(comms.externalMessageId, ids)))
    : [];
  const byWamid = new Map(rows.map((r) => [r.externalMessageId!, r]));

  for (const s of statuses) {
    const row = byWamid.get(s.id);
    const next = FROM_META[s.status];
    if (!row || !next) {
      result.statusesIgnored++;
      continue;
    }
    const at = fromUnix(s.timestamp);
    if (next === 'FAILED') {
      // A failure after delivery is noise; before delivery it is final.
      if (RANK[row.status] >= RANK.DELIVERED) {
        result.statusesIgnored++;
        continue;
      }
      const reason = s.errors?.map((e) => `${e.code} ${e.title}${e.error_data?.details ? `: ${e.error_data.details}` : ''}`).join('; ') || 'failed';
      await db.update(comms).set({ status: 'FAILED', failureReason: reason.slice(0, 1_000) }).where(eq(comms.id, row.id));
      row.status = 'FAILED';
      result.statusesApplied++;
      continue;
    }
    if (RANK[next] <= RANK[row.status] && row.status !== 'FAILED') {
      result.statusesIgnored++;
      continue;
    }
    const patch: Partial<typeof comms.$inferInsert> = { status: next };
    if (next === 'DELIVERED' || (next === 'READ' && !row.deliveredAt)) patch.deliveredAt = at;
    if (next === 'READ') patch.readAt = at;
    await db.update(comms).set(patch).where(eq(comms.id, row.id));
    row.status = next;
    row.deliveredAt ??= patch.deliveredAt ?? null;
    result.statusesApplied++;
  }

  // ---- vendor replies -------------------------------------------------------
  for (const m of messages) {
    let target: { id: string } | undefined;
    if (m.context?.id) {
      [target] = await db
        .select({ id: comms.id })
        .from(comms)
        .where(and(eq(comms.channel, 'WHATSAPP'), eq(comms.externalMessageId, m.context.id)));
    }
    if (!target) {
      // Free-text reply without quoting: attribute it to the latest message sent to that number.
      [target] = await db
        .select({ id: comms.id })
        .from(comms)
        .where(and(eq(comms.channel, 'WHATSAPP'), eq(comms.recipientAddress, `+${m.from.replace(/^\+/, '')}`)))
        .orderBy(desc(comms.sentAt))
        .limit(1);
    }
    if (!target) {
      result.repliesUnmatched++;
      continue;
    }
    const reply = { from: m.from, text: replyText(m), messageId: m.id, at: fromUnix(m.timestamp).toISOString() };
    await db
      .update(comms)
      .set({
        status: 'RESPONDED',
        respondedAt: fromUnix(m.timestamp),
        payload: sql`${comms.payload} || ${JSON.stringify({ reply })}::jsonb`,
      })
      .where(eq(comms.id, target.id));
    result.repliesMatched++;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Simulation (local mock: produces exactly what Meta would post)
// ---------------------------------------------------------------------------

export function statusWebhook(updates: { messageId: string; status: MetaStatus['status']; at: Date; to?: string; error?: string }[]): MetaWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'MOCK_WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              statuses: updates.map((u) => ({
                id: u.messageId,
                status: u.status,
                timestamp: String(Math.floor(u.at.getTime() / 1000)),
                recipient_id: u.to?.replace(/^\+/, ''),
                ...(u.error ? { errors: [{ code: 131026, title: u.error }] } : {}),
              })),
            },
          },
        ],
      },
    ],
  };
}

export function replyWebhook(reply: { from: string; text: string; at: Date; contextMessageId?: string }): MetaWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'MOCK_WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              messages: [
                {
                  id: `wamid.in.${Math.floor(reply.at.getTime() / 1000)}`,
                  from: reply.from.replace(/^\+/, ''),
                  timestamp: String(Math.floor(reply.at.getTime() / 1000)),
                  type: 'text',
                  text: { body: reply.text },
                  ...(reply.contextMessageId ? { context: { id: reply.contextMessageId } } : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

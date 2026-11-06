import { randomBytes } from 'node:crypto';
import type { EmailTransport } from '../email/transport';
import type { MetaTemplateMessage } from './template';

export interface WhatsAppMessage {
  /** E.164, e.g. +919820012345 */
  to: string;
  /** Exact Cloud API request body. */
  request: MetaTemplateMessage;
  /** Rendered text, for local previews and the audit trail. */
  previewText: string;
  /** Our communication id, for tracing. */
  communicationId?: string;
}

/**
 * Outbound WhatsApp. The MVP has no provider: messages are mirrored into Mailpit (or kept
 * in memory). A Meta Cloud API or Gupshup transport implements this after MVP.
 */
export interface WhatsAppTransport {
  readonly name: string;
  /** Returns the provider message id ("wamid.…"), which webhooks refer to. */
  send(message: WhatsAppMessage): Promise<{ messageId: string }>;
}

/** Meta-style message id. */
export const newWamid = () => `wamid.${randomBytes(24).toString('base64url')}`;

export function createMemoryWhatsAppTransport(): WhatsAppTransport & { sent: (WhatsAppMessage & { messageId: string })[] } {
  const sent: (WhatsAppMessage & { messageId: string })[] = [];
  return {
    name: 'whatsapp-memory',
    sent,
    async send(message) {
      const messageId = newWamid();
      sent.push({ ...message, messageId });
      return { messageId };
    },
  };
}

/**
 * Local stand-in for WhatsApp: each message lands in Mailpit as an email addressed to
 * <number>@whatsapp.local, showing the phone text and the exact Cloud API request.
 */
export function createMailpitWhatsAppTransport(email: EmailTransport): WhatsAppTransport {
  return {
    name: `whatsapp-via-${email.name}`,
    async send(message) {
      const messageId = newWamid();
      const json = JSON.stringify(message.request, null, 2);
      const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      await email.send({
        from: 'WhatsApp Mock <whatsapp@gst-itc.local>',
        to: `${message.to.replace(/^\+/, '')}@whatsapp.local`,
        subject: `[WhatsApp → ${message.to}] ${message.request.template.name}`,
        text: `${message.previewText}\n\n---\nCloud API request (not sent):\n${json}\n\nwamid: ${messageId}`,
        html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:420px;background:#e5ddd5;padding:16px">
  <div style="background:#dcf8c6;border-radius:8px;padding:10px 12px;white-space:pre-wrap;font-size:14px">${escape(message.previewText)}</div>
  <p style="font-size:11px;color:#555">To ${escape(message.to)} · template <b>${escape(message.request.template.name)}</b> · ${escape(messageId)}</p>
</div>
<pre style="font-size:11px;background:#f5f5f5;padding:8px">${escape(json)}</pre>`,
        headers: {
          'X-WhatsApp-Message-Id': messageId,
          ...(message.communicationId ? { 'X-GST-ITC-Communication-Id': message.communicationId } : {}),
        },
      });
      return { messageId };
    },
  };
}

/**
 * WHATSAPP_TRANSPORT=mailpit (default) mirrors into the email transport (Mailpit),
 * "memory" keeps messages in-process, "none" disables the channel.
 */
export function whatsappTransportFromEnv(
  email: EmailTransport,
  env: Record<string, string | undefined> = process.env,
): WhatsAppTransport | undefined {
  const kind = (env.WHATSAPP_TRANSPORT ?? 'mailpit').toLowerCase();
  if (kind === 'none') return undefined;
  if (kind === 'memory') return createMemoryWhatsAppTransport();
  if (kind === 'mailpit') return createMailpitWhatsAppTransport(email);
  throw new Error(`Unsupported WHATSAPP_TRANSPORT "${kind}" (expected mailpit, memory or none)`);
}

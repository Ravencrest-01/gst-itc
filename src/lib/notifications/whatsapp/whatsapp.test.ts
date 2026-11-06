import { describe, expect, it } from 'vitest';
import { createMemoryTransport } from '../email/transport';
import {
  buildMetaTemplateMessage,
  normalizeIndianMobile,
  renderWhatsAppText,
  sanitizeParam,
  type WhatsAppTemplateInput,
} from './template';
import { createMailpitWhatsAppTransport, whatsappTransportFromEnv } from './transport';
import { signMetaPayload, verificationChallenge, verifyMetaSignature } from './webhook';

describe('normalizeIndianMobile', () => {
  it.each([
    ['+91 98200 12345', '+919820012345'],
    ['+91-98200-12345', '+919820012345'],
    ['09820012345', '+919820012345'],
    ['919820012345', '+919820012345'],
    ['98200 12345', '+919820012345'],
    ['6000000000', '+916000000000'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeIndianMobile(raw)).toBe(expected);
  });

  it.each(['022 2345 6789', '+1 415 555 0100', '5820012345', '98200', '', null])('rejects %j', (raw) => {
    expect(normalizeIndianMobile(raw)).toBeNull();
  });
});

const input: WhatsAppTemplateInput = {
  stage: 0,
  buyerLegalName: 'Demo Manufacturing Pvt Ltd',
  vendorContactName: 'Rahul\nVerma',
  invoiceCount: 4,
  totalAtRisk: 84_005.05,
  financialYear: '2025-2026',
  deadline: '2026-11-30',
  statementToken: 'tok_abc',
};

describe('WhatsApp template', () => {
  it('builds a Cloud API request with per-component parameters', () => {
    const req = buildMetaTemplateMessage('+919820012345', input);
    expect(req).toMatchObject({ messaging_product: 'whatsapp', to: '919820012345', type: 'template' });
    expect(req.template.name).toBe('itc_reconciliation_alert');
    const [header, body, button] = req.template.components;
    expect(header.parameters.map((p) => p.text)).toEqual(['Demo Manufacturing Pvt Ltd']);
    expect(body.parameters.map((p) => p.text)).toEqual(['Rahul Verma', '4', '84,005.05', '2025-2026', '30 Nov 2026']);
    expect(button).toMatchObject({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'tok_abc' }] });
  });

  it('uses a different template per stage', () => {
    expect(buildMetaTemplateMessage('+919820012345', { ...input, stage: 1 }).template.name).toBe('itc_reconciliation_reminder');
    expect(buildMetaTemplateMessage('+919820012345', { ...input, stage: 2 }).template.name).toBe('itc_reconciliation_final_notice');
  });

  it('sanitizes parameters the way Meta requires', () => {
    expect(sanitizeParam('a\n\tb      c')).toBe('a b   c');
    expect(sanitizeParam('x'.repeat(50), 40)).toHaveLength(40);
  });

  it('renders the phone text from the spec template', () => {
    const text = renderWhatsAppText(input, 'http://localhost:3000/');
    expect(text).toContain('*[ACTION REQUIRED] GST ITC Reconciliation Alert - Demo Manufacturing Pvt Ltd*');
    expect(text).toContain('Our system identified 4 unreconciled invoices totaling ₹84,005.05');
    expect(text).toContain('Section 16(2)(aa)');
    expect(text).toContain('http://localhost:3000/vendor/statement/tok_abc');
  });
});

describe('WhatsApp transports', () => {
  it('mirrors messages into the email transport (Mailpit) with a wamid', async () => {
    const email = createMemoryTransport();
    const wa = createMailpitWhatsAppTransport(email);
    const { messageId } = await wa.send({
      to: '+919820012345',
      request: buildMetaTemplateMessage('+919820012345', input),
      previewText: renderWhatsAppText(input, 'http://x'),
    });
    expect(messageId).toMatch(/^wamid\.[A-Za-z0-9_-]{32}$/);
    expect(email.sent[0]).toMatchObject({ to: '919820012345@whatsapp.local', headers: { 'X-WhatsApp-Message-Id': messageId } });
    expect(email.sent[0].subject).toBe('[WhatsApp → +919820012345] itc_reconciliation_alert');
    expect(email.sent[0].text).toContain('"messaging_product": "whatsapp"');
  });

  it('is configured from the environment', () => {
    const email = createMemoryTransport();
    expect(whatsappTransportFromEnv(email, {})?.name).toBe('whatsapp-via-memory');
    expect(whatsappTransportFromEnv(email, { WHATSAPP_TRANSPORT: 'memory' })?.name).toBe('whatsapp-memory');
    expect(whatsappTransportFromEnv(email, { WHATSAPP_TRANSPORT: 'none' })).toBeUndefined();
    expect(() => whatsappTransportFromEnv(email, { WHATSAPP_TRANSPORT: 'meta' })).toThrow(/Unsupported/);
  });
});

describe('webhook verification', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

  it('accepts the right signature and rejects everything else', () => {
    const sig = signMetaPayload(body, 'secret');
    expect(verifyMetaSignature(body, sig, 'secret')).toBe(true);
    expect(verifyMetaSignature(body, sig, 'other')).toBe(false);
    expect(verifyMetaSignature(`${body} `, sig, 'secret')).toBe(false);
    expect(verifyMetaSignature(body, 'sha256=zz', 'secret')).toBe(false);
    expect(verifyMetaSignature(body, null, 'secret')).toBe(false);
  });

  it('answers the subscription handshake only with the right token', () => {
    const q = (s: string) => new URLSearchParams(s);
    expect(verificationChallenge(q('hub.mode=subscribe&hub.verify_token=t&hub.challenge=42'), 't')).toBe('42');
    expect(verificationChallenge(q('hub.mode=subscribe&hub.verify_token=x&hub.challenge=42'), 't')).toBeNull();
    expect(verificationChallenge(q('hub.mode=subscribe&hub.verify_token=t&hub.challenge=42'), undefined)).toBeNull();
  });
});

describe('webhook route', () => {
  it('rejects bad signatures and handles the GET handshake', async () => {
    process.env.WHATSAPP_APP_SECRET = 'route-secret';
    process.env.WHATSAPP_VERIFY_TOKEN = 'verify-me';
    process.env.DATABASE_URL = 'pglite:memory';
    const { GET, POST } = await import('../../../app/api/webhooks/whatsapp/route');

    const get = GET(new Request('http://x/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=123'));
    expect(get.status).toBe(200);
    expect(await get.text()).toBe('123');
    expect(GET(new Request('http://x/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=no&hub.challenge=1')).status).toBe(403);

    const body = JSON.stringify({ object: 'page' });
    const bad = await POST(new Request('http://x', { method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=00' } }));
    expect(bad.status).toBe(401);
    const good = await POST(new Request('http://x', { method: 'POST', body, headers: { 'x-hub-signature-256': signMetaPayload(body, 'route-secret') } }));
    expect(good.status).toBe(200);
    expect(await good.json()).toMatchObject({ ok: true, statusesApplied: 0 });
  });
});

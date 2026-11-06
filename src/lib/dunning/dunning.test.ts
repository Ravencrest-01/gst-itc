import { describe, expect, it } from 'vitest';
import { SMTPServer } from 'smtp-server';
import type { AddressInfo } from 'node:net';
import { describeError, nextDueStage, type CommHistory } from './dispatcher';

describe('describeError', () => {
  it('unpacks AggregateError from dual-stack localhost connects', () => {
    const v4 = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1025'), { code: 'ECONNREFUSED' });
    const v6 = Object.assign(new Error(''), { code: 'ECONNREFUSED', address: '::1', port: 1025 });
    expect(describeError(new AggregateError([v4, v6], ''))).toBe('connect ECONNREFUSED 127.0.0.1:1025; ECONNREFUSED ::1:1025');
    expect(describeError('boom')).toBe('boom');
  });
});
import { createSmtpTransport, emailTransportFromEnv } from '../notifications/email/transport';
import { discrepancyCsv, escapeHtml, renderDunningEmail, type DunningEmailInput } from '../notifications/email/templates';
import { returnPeriodsOf, syntheticGstr2b, MockGspProvider, type PurchaseDoc } from '../gsp/provider';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const day = (n: number) => new Date(Date.UTC(2026, 10, 6 + n, 9));
const sent = (stage: number, at: Date, status: CommHistory['status'] = 'SENT'): CommHistory => ({ stage, status, sentAt: at });

describe('nextDueStage', () => {
  it('starts at stage 0', () => {
    expect(nextDueStage([], day(0))).toBe(0);
  });
  it('escalates at T+5 and T+10 from the first reminder', () => {
    const h = [sent(0, day(0))];
    expect(nextDueStage(h, day(4))).toBeNull();
    expect(nextDueStage(h, day(5))).toBe(1);
    const h2 = [...h, sent(1, day(5))];
    expect(nextDueStage(h2, day(9))).toBeNull();
    expect(nextDueStage(h2, day(10))).toBe(2);
    expect(nextDueStage([...h2, sent(2, day(10))], day(30))).toBeNull();
  });
  it('ignores failed or queued attempts and stops when the vendor responds', () => {
    expect(nextDueStage([sent(0, day(0), 'FAILED')], day(1))).toBe(0);
    expect(nextDueStage([{ stage: 0, status: 'QUEUED', sentAt: null }], day(1))).toBe(0);
    expect(nextDueStage([sent(0, day(0), 'RESPONDED')], day(20))).toBeNull();
    expect(nextDueStage([sent(0, day(0), 'READ')], day(5))).toBe(1);
  });
});

const input = (over: Partial<DunningEmailInput> = {}): DunningEmailInput => ({
  stage: 0,
  buyer: { legalName: 'Demo Mfg Pvt Ltd', gstin: '27AABCD1234E1Z5' },
  vendor: { legalName: 'Acme <Logistics> & Co', gstin: '27AAACB9812R1ZM', contactName: null },
  financialYear: '2025-2026',
  deadline: '2026-11-30',
  daysToDeadline: 24,
  items: [
    { invoiceNumber: 'INV/0042', invoiceDate: '2025-08-10', status: 'MISSING_IN_2B', bookedTax: 18_000, reportedTax: 0, itcAtRisk: 18_000 },
    { invoiceNumber: '=HYPERLINK("x")', invoiceDate: '2025-09-01', status: 'VALUE_MISMATCH', bookedTax: 1_234.5, reportedTax: 1_000, itcAtRisk: 234.5 },
  ],
  totalAtRisk: 18_234.5,
  statementUrl: 'http://localhost:3000/vendor/statement/abc',
  ...over,
});

describe('renderDunningEmail', () => {
  it('escapes vendor-supplied text in HTML', () => {
    const { html, text } = renderDunningEmail(input());
    expect(html).toContain('Acme &lt;Logistics&gt; &amp; Co');
    expect(html).not.toContain('<Logistics>');
    expect(text).toContain('Dear Acme <Logistics> & Co,');
  });

  it('formats amounts and dates the Indian way', () => {
    const { html } = renderDunningEmail(input());
    expect(html).toContain('₹18,234.50');
    expect(html).toContain('30 Nov 2026 (24 days from today)');
    expect(html).toContain('Not reported in your GSTR-1/IFF');
  });

  it('escalates the subject and wording by stage', () => {
    expect(renderDunningEmail(input({ stage: 0 })).subject).toMatch(/^\[Action required\] .*2 invoices \(₹18,234.50 ITC\)/);
    expect(renderDunningEmail(input({ stage: 1 })).subject).toMatch(/^\[Reminder 2\]/);
    const final = renderDunningEmail(input({ stage: 2 }));
    expect(final.subject).toMatch(/^\[Final notice\] Payment hold/);
    expect(final.text).toMatch(/payments against them are on hold/);
  });

  it('builds a CSV that spreadsheets cannot execute', () => {
    const csv = discrepancyCsv(input().items);
    expect(csv.split('\r\n')[0]).toBe('Invoice number,Invoice date,Issue,Tax as per buyer (INR),Tax in your GSTR-1 (INR),ITC at risk (INR),Reported under GSTIN');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('INV/0042,2025-08-10,Not reported in your GSTR-1/IFF,18000.00,0.00,18000.00,');
  });

  it('escapeHtml covers quotes', () => {
    expect(escapeHtml(`"a" 'b'`)).toBe('&quot;a&quot; &#39;b&#39;');
  });
});

describe('SMTP transport', () => {
  it('delivers to an SMTP server (as Mailpit would receive it)', async () => {
    const received: string[] = [];
    const server = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      onData(stream, _session, cb) {
        let data = '';
        stream.on('data', (c: Buffer) => (data += c.toString()));
        stream.on('end', () => {
          received.push(data);
          cb();
        });
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.server.address() as AddressInfo;
    try {
      const transport = createSmtpTransport({ host: '127.0.0.1', port });
      const email = renderDunningEmail(input());
      const { messageId } = await transport.send({
        from: 'GST Compliance <compliance@demo.example>',
        to: 'accounts@acme.example',
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: [{ filename: 'itc.csv', content: email.csv, contentType: 'text/csv' }],
        headers: { 'X-GST-ITC-Stage': '0' },
      });
      expect(messageId).toMatch(/^<.+>$/);
      expect(received).toHaveLength(1);
      expect(received[0]).toContain('To: accounts@acme.example');
      expect(received[0]).toMatch(/^X-GST-ITC-Stage: 0$/im);
      expect(received[0]).toContain('filename=itc.csv');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('defaults to Mailpit on localhost:1025', () => {
    expect(emailTransportFromEnv({}).name).toBe('smtp://localhost:1025');
    expect(emailTransportFromEnv({ EMAIL_TRANSPORT: 'memory' }).name).toBe('memory');
    expect(() => emailTransportFromEnv({ EMAIL_TRANSPORT: 'resend' })).toThrow(/Unsupported/);
  });
});

describe('mock GSP', () => {
  const docs: PurchaseDoc[] = Array.from({ length: 200 }, (_, i) => ({
    supplierGstin: i % 2 ? '27AAACB9812R1ZM' : '07AAACC4455K1ZX',
    supplierName: 'Vendor',
    documentType: i % 50 === 0 ? 'CREDIT_NOTE' : 'INVOICE',
    invoiceNumber: `INV/${String(i).padStart(4, '0')}`,
    invoiceDate: '2025-08-10',
    taxableValue: 1_000,
    igst: i % 2 ? 0 : 180,
    cgst: i % 2 ? 90 : 0,
    sgst: i % 2 ? 90 : 0,
    cess: 0,
  }));

  it('produces portal-format JSON deterministically, with drift', () => {
    const a = syntheticGstr2b('27AABCD1234E1Z5', '08-2025', docs, { seed: 1 }) as { data: { rtnprd: string; docdata: { b2b: { inv: unknown[] }[]; cdnr: unknown[] } } };
    const b = syntheticGstr2b('27AABCD1234E1Z5', '08-2025', docs, { seed: 1 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.data.rtnprd).toBe('082025');
    const invoices = a.data.docdata.b2b.reduce((n, s) => n + s.inv.length, 0);
    // ~12% dropped, ~3% extra unbooked documents added.
    expect(invoices).toBeGreaterThan(160);
    expect(invoices).toBeLessThan(196);
    expect(a.data.docdata.cdnr.length).toBeGreaterThan(0);
  });

  it('serves fixture files before generating', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gsp-'));
    mkdirSync(path.join(dir, '27AABCD1234E1Z5'));
    writeFileSync(path.join(dir, '27AABCD1234E1Z5', '082025.json'), JSON.stringify({ data: { docdata: { b2b: [] }, rtnprd: '082025', fixture: true } }));
    const provider = new MockGspProvider({ fixturesDir: dir });
    expect(await provider.fetchGstr2b({ gstin: '27AABCD1234E1Z5', returnPeriod: '08-2025' })).toMatchObject({ data: { fixture: true } });
    expect(await provider.fetchGstr2b({ gstin: '27AABCD1234E1Z5', returnPeriod: '09-2025' })).toMatchObject({ data: { rtnprd: '092025' } });
    await expect(provider.fetchGstr2b({ gstin: 'x', returnPeriod: '2025-09' })).rejects.toThrow(/MM-YYYY/);
  });

  it('lists the return periods of a financial year', () => {
    expect(returnPeriodsOf('2025-2026')).toEqual([
      '04-2025', '05-2025', '06-2025', '07-2025', '08-2025', '09-2025', '10-2025', '11-2025', '12-2025', '01-2026', '02-2026', '03-2026',
    ]);
  });
});

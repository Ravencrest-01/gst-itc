import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

export interface EmailMessage {
  from: string;
  to: string;
  cc?: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
  /** Custom headers, e.g. X-GST-ITC-Communication-Id for tracing. */
  headers?: Record<string, string>;
}

/**
 * Outbound email. The MVP sends over SMTP to Mailpit (a local inbox at
 * http://localhost:8025); a Resend implementation slots in after MVP.
 */
export interface EmailTransport {
  readonly name: string;
  send(message: EmailMessage): Promise<{ messageId: string }>;
}

export interface SmtpOptions {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
}

export function createSmtpTransport(options: SmtpOptions): EmailTransport {
  const transporter = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure ?? false,
    auth: options.user ? { user: options.user, pass: options.pass ?? '' } : undefined,
    // Mailpit has no TLS by default; never upgrade to STARTTLS unless asked.
    ignoreTLS: !options.secure,
    connectionTimeout: 10_000,
  });
  return {
    name: `smtp://${options.host}:${options.port}`,
    async send(message) {
      const info = await transporter.sendMail({
        from: message.from,
        to: message.to,
        cc: message.cc,
        replyTo: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
        attachments: message.attachments,
        headers: message.headers,
      });
      return { messageId: info.messageId };
    },
  };
}

/** Keeps messages in memory instead of sending them (tests, dry runs). */
export function createMemoryTransport(): EmailTransport & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    name: 'memory',
    sent,
    async send(message) {
      sent.push(message);
      return { messageId: `<${randomUUID()}@memory.gst-itc.local>` };
    },
  };
}

/**
 * EMAIL_TRANSPORT=smtp (default) uses SMTP_HOST/SMTP_PORT, which default to Mailpit's
 * localhost:1025. EMAIL_TRANSPORT=memory discards mail.
 */
export function emailTransportFromEnv(env: Record<string, string | undefined> = process.env): EmailTransport {
  const kind = (env.EMAIL_TRANSPORT ?? 'smtp').toLowerCase();
  if (kind === 'memory') return createMemoryTransport();
  if (kind !== 'smtp') throw new Error(`Unsupported EMAIL_TRANSPORT "${kind}" (expected smtp or memory)`);
  return createSmtpTransport({
    host: env.SMTP_HOST ?? 'localhost',
    port: Number(env.SMTP_PORT ?? 1025),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  });
}

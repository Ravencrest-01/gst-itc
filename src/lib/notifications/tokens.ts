import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../../db/client';
import * as schema from '../../db/schema';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Creates a vendor statement link token. Only its SHA-256 is stored, so a database leak
 * does not expose working links. Returns the raw token for the URL.
 */
export async function createStatementToken(
  db: Db,
  input: { organizationId: string; vendorId: string; reconciliationRunId: string; expiresAt: Date },
): Promise<{ token: string; id: string }> {
  const token = randomBytes(32).toString('base64url');
  const [row] = await db
    .insert(schema.vendorStatementTokens)
    .values({ ...input, tokenHash: hashToken(token) })
    .returning({ id: schema.vendorStatementTokens.id });
  return { token, id: row.id };
}

/** Resolves a token from a URL. Returns null if unknown, expired or revoked. */
export async function resolveStatementToken(db: Db, token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [row] = await db
    .update(schema.vendorStatementTokens)
    .set({ lastAccessedAt: now, accessCount: sql`${schema.vendorStatementTokens.accessCount} + 1` })
    .where(
      and(
        eq(schema.vendorStatementTokens.tokenHash, hashToken(token)),
        isNull(schema.vendorStatementTokens.revokedAt),
        gt(schema.vendorStatementTokens.expiresAt, now),
      ),
    )
    .returning();
  return row ?? null;
}

export function statementUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/vendor/statement/${token}`;
}

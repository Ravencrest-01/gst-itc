import { eq } from 'drizzle-orm';
import { getDb, type Db } from '../../db/client';
import * as schema from '../../db/schema';
import { HttpError } from './http';

export interface RequestContext {
  db: Db;
  organizationId: string;
  /** Acting user, when known (used for audit fields such as overrides). */
  userId: string | null;
}

/**
 * Resolves the tenant for an API request.
 *
 * There is no login yet (planned for Day 13). Until then, AUTH_MODE=dev, which is the
 * default outside production, trusts the `x-organization-id` header, or uses the only
 * organization when there is exactly one. `x-user-id` optionally names the acting user.
 * In production the API refuses requests until real authentication is configured.
 */
export async function getRequestContext(request: Request): Promise<RequestContext> {
  const mode = process.env.AUTH_MODE ?? (process.env.NODE_ENV === 'production' ? 'required' : 'dev');
  if (mode !== 'dev') throw new HttpError(401, 'Authentication is not configured for this deployment');

  const db = await getDb();
  const header = request.headers.get('x-organization-id');
  let organizationId: string;
  if (header) {
    if (!/^[0-9a-f-]{36}$/i.test(header)) throw new HttpError(400, 'x-organization-id must be a UUID');
    const [org] = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.id, header));
    if (!org) throw new HttpError(404, 'Organization not found');
    organizationId = org.id;
  } else {
    const orgs = await db.select({ id: schema.organizations.id }).from(schema.organizations).limit(2);
    if (orgs.length !== 1) {
      throw new HttpError(400, orgs.length ? 'Several organizations exist: send x-organization-id' : 'No organization exists yet');
    }
    organizationId = orgs[0].id;
  }

  let userId: string | null = null;
  const userHeader = request.headers.get('x-user-id');
  if (userHeader) {
    const [user] = await db.select({ id: schema.users.id, org: schema.users.organizationId }).from(schema.users).where(eq(schema.users.id, userHeader));
    if (!user || user.org !== organizationId) throw new HttpError(403, 'User does not belong to this organization');
    userId = user.id;
  }
  return { db, organizationId, userId };
}

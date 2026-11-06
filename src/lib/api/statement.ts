import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import * as schema from '../../db/schema';
import { loadVendorNotices } from '../dunning/dispatcher';
import { statusText } from '../notifications/email/templates';
import { resolveStatementToken } from '../notifications/tokens';
import { HttpError } from './http';

/**
 * Public data behind a vendor statement link. Only what the vendor needs to correct their
 * GSTR-1 is returned; no internal ids. Unknown, expired and revoked tokens are all 404.
 */
export async function loadVendorStatement(db: Db, token: string) {
  const access = await resolveStatementToken(db, token);
  if (!access) throw new HttpError(404, 'This link is invalid or has expired');

  const [[org], [vendor], [run]] = await Promise.all([
    db.select().from(schema.organizations).where(eq(schema.organizations.id, access.organizationId)),
    db.select().from(schema.vendors).where(eq(schema.vendors.id, access.vendorId)),
    db.select().from(schema.reconciliationRuns).where(eq(schema.reconciliationRuns.id, access.reconciliationRunId)),
  ]);
  const [notice] = (
    await loadVendorNotices(db, { organizationId: access.organizationId, runId: access.reconciliationRunId, threshold: 0 })
  ).filter((n) => n.vendorId === access.vendorId);

  return {
    buyer: { legalName: org.legalName, gstin: org.primaryGstin },
    vendor: { legalName: vendor.legalName, gstin: vendor.gstin },
    financialYear: run.financialYear,
    reconciledOn: run.asOfDate,
    expiresAt: access.expiresAt,
    deadline: notice?.deadline ?? null,
    totalAtRisk: notice?.totalAtRisk ?? 0,
    items: (notice?.items ?? []).map((i) => ({
      invoiceNumber: i.invoiceNumber,
      invoiceDate: i.invoiceDate,
      issue: statusText(i.status),
      status: i.status,
      taxInBuyerBooks: i.bookedTax,
      taxInYourGstr1: i.reportedTax,
      itcAtRisk: i.itcAtRisk,
      reportedUnderGstin: i.reportedUnderGstin ?? null,
    })),
  };
}

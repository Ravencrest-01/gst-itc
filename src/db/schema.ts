import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum('user_role', ['ADMIN', 'FINANCE_MANAGER', 'AUDITOR', 'VIEWER']);

export const riskTierEnum = pgEnum('risk_tier', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

/**
 * Section 16(4) exposure is NOT a match status: it is tracked by
 * `match_results.is_section_16_4_risk` so it never hides the underlying cause
 * (e.g. MISSING_IN_2B). See docs/SPEC-CHANGES.md.
 */
export const matchStatusEnum = pgEnum('match_status', [
  'EXACT_MATCH',
  'PROBABLE_MATCH', // fuzzy invoice-number match; needs human confirmation
  'DATE_MISMATCH',
  'VALUE_MISMATCH',
  'TAX_TYPE_MISMATCH', // IGST vs CGST+SGST booked under the wrong head
  'GSTIN_MISMATCH', // same PAN, invoice tagged to the vendor's other GSTIN
  'MISSING_IN_2B',
  'MISSING_IN_PR',
]);

export const documentTypeEnum = pgEnum('document_type', ['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE']);

export const commChannelEnum = pgEnum('comm_channel', ['WHATSAPP', 'EMAIL']);

export const commStatusEnum = pgEnum('comm_status', [
  'QUEUED',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
  'RESPONDED',
]);

export const ingestionSourceEnum = pgEnum('ingestion_source', ['PURCHASE_REGISTER', 'GSTR2B']);

export const jobStatusEnum = pgEnum('job_status', ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: 'number' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const gstin = (name: string) => varchar(name, { length: 15 });
/** Format: 2024-2025 */
const financialYear = () => varchar('financial_year', { length: 9 });

// ---------------------------------------------------------------------------
// 1. Organizations (multi-tenant root)
// ---------------------------------------------------------------------------

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  legalName: varchar('legal_name', { length: 255 }).notNull(),
  tradeName: varchar('trade_name', { length: 255 }),
  primaryGstin: gstin('primary_gstin').notNull().unique(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------
// 2. Users
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull().unique(),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    role: userRoleEnum('role').default('FINANCE_MANAGER').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('idx_users_org').on(t.organizationId)],
);

// ---------------------------------------------------------------------------
// 3. Vendors
// ---------------------------------------------------------------------------

export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    gstin: gstin('gstin').notNull(),
    legalName: varchar('legal_name', { length: 255 }).notNull(),
    tradeName: varchar('trade_name', { length: 255 }),
    contactName: varchar('contact_name', { length: 255 }),
    contactPhone: varchar('contact_phone', { length: 20 }),
    contactEmail: varchar('contact_email', { length: 255 }),
    riskTier: riskTierEnum('risk_tier').default('LOW').notNull(),
    complianceScore: numeric('compliance_score', { precision: 5, scale: 2, mode: 'number' })
      .default(100)
      .notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('unq_org_vendor_gstin').on(t.organizationId, t.gstin),
    index('idx_vendors_risk').on(t.organizationId, t.riskTier),
  ],
);

// ---------------------------------------------------------------------------
// 4. Ingestion batches (file provenance; files upload directly to blob storage)
// ---------------------------------------------------------------------------

export const ingestionBatches = pgTable(
  'ingestion_batches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    source: ingestionSourceEnum('source').notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    blobUrl: text('blob_url'),
    status: jobStatusEnum('status').default('PENDING').notNull(),
    rowCount: integer('row_count').default(0).notNull(),
    insertedCount: integer('inserted_count').default(0).notNull(),
    errorCount: integer('error_count').default(0).notNull(),
    /** First N row-level errors: [{ row, field, message }] */
    errors: jsonb('errors').$type<{ row: number; field?: string; message: string }[]>(),
    columnMapping: jsonb('column_mapping').$type<Record<string, string>>(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('idx_batches_org_created').on(t.organizationId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// 5. Purchase Register invoices (internal ledger)
// ---------------------------------------------------------------------------

export const purchaseRegisterInvoices = pgTable(
  'purchase_register_invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id').references(() => ingestionBatches.id, { onDelete: 'set null' }),
    supplierGstin: gstin('supplier_gstin').notNull(),
    documentType: documentTypeEnum('document_type').default('INVOICE').notNull(),
    rawInvoiceNumber: varchar('raw_invoice_number', { length: 100 }).notNull(),
    /** Uppercase alphanumeric, leading zeros stripped. Part of the exact-match key. */
    normalizedInvoiceNumber: varchar('normalized_invoice_number', { length: 100 }).notNull(),
    /** Normalized number with INV/BILL/FY prefixes & suffixes removed. Used by Pass 2. */
    coreInvoiceNumber: varchar('core_invoice_number', { length: 100 }).notNull(),
    invoiceDate: date('invoice_date').notNull(),
    financialYear: financialYear().notNull(),
    taxableValue: money('taxable_value').notNull(),
    igstAmount: money('igst_amount').default(0).notNull(),
    cgstAmount: money('cgst_amount').default(0).notNull(),
    sgstAmount: money('sgst_amount').default(0).notNull(),
    cessAmount: money('cess_amount').default(0).notNull(),
    totalTax: money('total_tax').generatedAlwaysAs(
      sql`igst_amount + cgst_amount + sgst_amount + cess_amount`,
    ),
    /** SHA-256(GSTIN|DOC_TYPE|NORMALIZED_NO|FY). Amounts are deliberately excluded. */
    normalizationHash: varchar('normalization_hash', { length: 64 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // Re-uploading the same ledger is idempotent (ON CONFLICT DO UPDATE).
    uniqueIndex('unq_pr_org_hash').on(t.organizationId, t.normalizationHash),
    index('idx_pr_vendor_date').on(t.vendorId, t.invoiceDate),
    index('idx_pr_org_fy_gstin').on(t.organizationId, t.financialYear, t.supplierGstin),
    check('chk_pr_gstin_len', sql`char_length(${t.supplierGstin}) = 15`),
  ],
);

// ---------------------------------------------------------------------------
// 6. GSTR-2B invoices (portal data)
// ---------------------------------------------------------------------------

export const gstr2bInvoices = pgTable(
  'gstr2b_invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Nullable: 2B can contain suppliers not yet in the vendor master. */
    vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    batchId: uuid('batch_id').references(() => ingestionBatches.id, { onDelete: 'set null' }),
    supplierGstin: gstin('supplier_gstin').notNull(),
    supplierTradeName: varchar('supplier_trade_name', { length: 255 }),
    /** Format: MM-YYYY */
    returnPeriod: varchar('return_period', { length: 7 }).notNull(),
    documentType: documentTypeEnum('document_type').default('INVOICE').notNull(),
    isAmendment: boolean('is_amendment').default(false).notNull(),
    reverseCharge: boolean('reverse_charge').default(false).notNull(),
    rawInvoiceNumber: varchar('raw_invoice_number', { length: 100 }).notNull(),
    normalizedInvoiceNumber: varchar('normalized_invoice_number', { length: 100 }).notNull(),
    coreInvoiceNumber: varchar('core_invoice_number', { length: 100 }).notNull(),
    invoiceDate: date('invoice_date').notNull(),
    financialYear: financialYear().notNull(),
    taxableValue: money('taxable_value').notNull(),
    igstAmount: money('igst_amount').default(0).notNull(),
    cgstAmount: money('cgst_amount').default(0).notNull(),
    sgstAmount: money('sgst_amount').default(0).notNull(),
    cessAmount: money('cess_amount').default(0).notNull(),
    totalTax: money('total_tax').generatedAlwaysAs(
      sql`igst_amount + cgst_amount + sgst_amount + cess_amount`,
    ),
    itcAvailable: boolean('itc_available').default(true).notNull(),
    normalizationHash: varchar('normalization_hash', { length: 64 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // Amended (B2BA) rows replace the original via upsert on this key.
    uniqueIndex('unq_2b_org_hash').on(t.organizationId, t.normalizationHash),
    index('idx_2b_gstin_date').on(t.supplierGstin, t.invoiceDate),
    index('idx_2b_org_fy_gstin').on(t.organizationId, t.financialYear, t.supplierGstin),
  ],
);

// ---------------------------------------------------------------------------
// 7. Reconciliation runs & results
// ---------------------------------------------------------------------------

export const reconciliationRuns = pgTable(
  'reconciliation_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    financialYear: financialYear().notNull(),
    status: jobStatusEnum('status').default('PENDING').notNull(),
    /** Date the Section 16(4) clock was evaluated against. */
    asOfDate: date('as_of_date').notNull(),
    params: jsonb('params').$type<Record<string, unknown>>(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    runDate: timestamp('run_date', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    totalPrCount: integer('total_pr_count').default(0).notNull(),
    total2bCount: integer('total_2b_count').default(0).notNull(),
    exactMatchesCount: integer('exact_matches_count').default(0).notNull(),
    mismatchesCount: integer('mismatches_count').default(0).notNull(),
    totalItcAtRisk: numeric('total_itc_at_risk', { precision: 16, scale: 2, mode: 'number' })
      .default(0)
      .notNull(),
    totalItcOpportunity: numeric('total_itc_opportunity', {
      precision: 16,
      scale: 2,
      mode: 'number',
    })
      .default(0)
      .notNull(),
    section164RiskAmount: numeric('section_16_4_risk_amount', {
      precision: 16,
      scale: 2,
      mode: 'number',
    })
      .default(0)
      .notNull(),
  },
  (t) => [index('idx_runs_org_fy').on(t.organizationId, t.financialYear, t.runDate)],
);

export const matchResults = pgTable(
  'match_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    reconciliationRunId: uuid('reconciliation_run_id')
      .notNull()
      .references(() => reconciliationRuns.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    supplierGstin: gstin('supplier_gstin').notNull(),
    prInvoiceId: uuid('pr_invoice_id').references(() => purchaseRegisterInvoices.id, {
      onDelete: 'set null',
    }),
    gstr2bInvoiceId: uuid('gstr2b_invoice_id').references(() => gstr2bInvoices.id, {
      onDelete: 'set null',
    }),
    matchStatus: matchStatusEnum('match_status').notNull(),
    /** 1 = exact key, 2 = fuzzy/heuristic, 3 = unmatched categorisation */
    matchPass: smallint('match_pass').notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3, mode: 'number' }).notNull(),
    /** PR minus 2B */
    taxableDifference: money('taxable_difference').default(0).notNull(),
    taxDifference: money('tax_difference').default(0).notNull(),
    itcAtRisk: money('itc_at_risk').default(0).notNull(),
    /** ITC visible in 2B but not booked in the PR. */
    itcOpportunity: money('itc_opportunity').default(0).notNull(),
    financialYear: financialYear().notNull(),
    section164Deadline: date('section_16_4_deadline').notNull(),
    isSection164Risk: boolean('is_section_16_4_risk').default(false).notNull(),
    isItcLapsed: boolean('is_itc_lapsed').default(false).notNull(),
    riskTier: riskTierEnum('risk_tier').default('LOW').notNull(),
    notes: text('notes'),
    overrideStatus: matchStatusEnum('override_status'),
    overrideByUserId: uuid('override_by_user_id').references(() => users.id),
    overriddenAt: timestamp('overridden_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_match_results_status').on(t.reconciliationRunId, t.matchStatus),
    index('idx_match_results_vendor').on(t.reconciliationRunId, t.vendorId),
    index('idx_match_results_org').on(t.organizationId),
    // An invoice can appear in at most one result per run.
    uniqueIndex('unq_match_run_pr')
      .on(t.reconciliationRunId, t.prInvoiceId)
      .where(sql`${t.prInvoiceId} IS NOT NULL`),
    uniqueIndex('unq_match_run_2b')
      .on(t.reconciliationRunId, t.gstr2bInvoiceId)
      .where(sql`${t.gstr2bInvoiceId} IS NOT NULL`),
    check(
      'chk_match_has_invoice',
      sql`${t.prInvoiceId} IS NOT NULL OR ${t.gstr2bInvoiceId} IS NOT NULL`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 8. Vendor communications (dunning)
// ---------------------------------------------------------------------------

export const vendorCommunications = pgTable(
  'vendor_communications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    reconciliationRunId: uuid('reconciliation_run_id').references(() => reconciliationRuns.id, {
      onDelete: 'set null',
    }),
    matchResultId: uuid('match_result_id').references(() => matchResults.id, {
      onDelete: 'set null',
    }),
    channel: commChannelEnum('channel').notNull(),
    /** 0 = T+0 reminder, 1 = T+5 escalation, 2 = T+10 executive alert */
    escalationStage: smallint('escalation_stage').default(0).notNull(),
    recipientAddress: varchar('recipient_address', { length: 255 }).notNull(),
    templateId: varchar('template_id', { length: 100 }).notNull(),
    payload: jsonb('payload').notNull(),
    status: commStatusEnum('status').default('QUEUED').notNull(),
    externalMessageId: varchar('external_message_id', { length: 255 }),
    failureReason: text('failure_reason'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_comms_vendor').on(t.organizationId, t.vendorId, t.createdAt),
    uniqueIndex('unq_comms_external_id')
      .on(t.channel, t.externalMessageId)
      .where(sql`${t.externalMessageId} IS NOT NULL`),
  ],
);

// ---------------------------------------------------------------------------
// 9. Vendor statement tokens (public discrepancy-statement links)
// ---------------------------------------------------------------------------

export const vendorStatementTokens = pgTable(
  'vendor_statement_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    reconciliationRunId: uuid('reconciliation_run_id')
      .notNull()
      .references(() => reconciliationRuns.id, { onDelete: 'cascade' }),
    /** SHA-256 of the random token; the raw token only ever lives in the URL. */
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    accessCount: integer('access_count').default(0).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('idx_tokens_vendor').on(t.vendorId)],
);

CREATE TYPE "public"."comm_channel" AS ENUM('WHATSAPP', 'EMAIL');--> statement-breakpoint
CREATE TYPE "public"."comm_status" AS ENUM('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RESPONDED');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE');--> statement-breakpoint
CREATE TYPE "public"."ingestion_source" AS ENUM('PURCHASE_REGISTER', 'GSTR2B');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('EXACT_MATCH', 'PROBABLE_MATCH', 'DATE_MISMATCH', 'VALUE_MISMATCH', 'TAX_TYPE_MISMATCH', 'GSTIN_MISMATCH', 'MISSING_IN_2B', 'MISSING_IN_PR');--> statement-breakpoint
CREATE TYPE "public"."risk_tier" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'FINANCE_MANAGER', 'AUDITOR', 'VIEWER');--> statement-breakpoint
CREATE TABLE "gstr2b_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vendor_id" uuid,
	"batch_id" uuid,
	"supplier_gstin" varchar(15) NOT NULL,
	"supplier_trade_name" varchar(255),
	"return_period" varchar(7) NOT NULL,
	"document_type" "document_type" DEFAULT 'INVOICE' NOT NULL,
	"is_amendment" boolean DEFAULT false NOT NULL,
	"reverse_charge" boolean DEFAULT false NOT NULL,
	"raw_invoice_number" varchar(100) NOT NULL,
	"normalized_invoice_number" varchar(100) NOT NULL,
	"core_invoice_number" varchar(100) NOT NULL,
	"invoice_date" date NOT NULL,
	"financial_year" varchar(9) NOT NULL,
	"taxable_value" numeric(14, 2) NOT NULL,
	"igst_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"cgst_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"sgst_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"cess_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total_tax" numeric(14, 2) GENERATED ALWAYS AS (igst_amount + cgst_amount + sgst_amount + cess_amount) STORED,
	"itc_available" boolean DEFAULT true NOT NULL,
	"normalization_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source" "ingestion_source" NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"blob_url" text,
	"status" "job_status" DEFAULT 'PENDING' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"column_mapping" jsonb,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "match_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"reconciliation_run_id" uuid NOT NULL,
	"vendor_id" uuid,
	"supplier_gstin" varchar(15) NOT NULL,
	"pr_invoice_id" uuid,
	"gstr2b_invoice_id" uuid,
	"match_status" "match_status" NOT NULL,
	"match_pass" smallint NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"taxable_difference" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tax_difference" numeric(14, 2) DEFAULT 0 NOT NULL,
	"itc_at_risk" numeric(14, 2) DEFAULT 0 NOT NULL,
	"itc_opportunity" numeric(14, 2) DEFAULT 0 NOT NULL,
	"financial_year" varchar(9) NOT NULL,
	"section_16_4_deadline" date NOT NULL,
	"is_section_16_4_risk" boolean DEFAULT false NOT NULL,
	"is_itc_lapsed" boolean DEFAULT false NOT NULL,
	"risk_tier" "risk_tier" DEFAULT 'LOW' NOT NULL,
	"notes" text,
	"override_status" "match_status",
	"override_by_user_id" uuid,
	"overridden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_match_has_invoice" CHECK ("match_results"."pr_invoice_id" IS NOT NULL OR "match_results"."gstr2b_invoice_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" varchar(255) NOT NULL,
	"trade_name" varchar(255),
	"primary_gstin" varchar(15) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_primary_gstin_unique" UNIQUE("primary_gstin")
);
--> statement-breakpoint
CREATE TABLE "purchase_register_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"batch_id" uuid,
	"supplier_gstin" varchar(15) NOT NULL,
	"document_type" "document_type" DEFAULT 'INVOICE' NOT NULL,
	"raw_invoice_number" varchar(100) NOT NULL,
	"normalized_invoice_number" varchar(100) NOT NULL,
	"core_invoice_number" varchar(100) NOT NULL,
	"invoice_date" date NOT NULL,
	"financial_year" varchar(9) NOT NULL,
	"taxable_value" numeric(14, 2) NOT NULL,
	"igst_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"cgst_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"sgst_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"cess_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total_tax" numeric(14, 2) GENERATED ALWAYS AS (igst_amount + cgst_amount + sgst_amount + cess_amount) STORED,
	"normalization_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_pr_gstin_len" CHECK (char_length("purchase_register_invoices"."supplier_gstin") = 15)
);
--> statement-breakpoint
CREATE TABLE "reconciliation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"financial_year" varchar(9) NOT NULL,
	"status" "job_status" DEFAULT 'PENDING' NOT NULL,
	"as_of_date" date NOT NULL,
	"params" jsonb,
	"created_by_user_id" uuid,
	"run_date" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"total_pr_count" integer DEFAULT 0 NOT NULL,
	"total_2b_count" integer DEFAULT 0 NOT NULL,
	"exact_matches_count" integer DEFAULT 0 NOT NULL,
	"mismatches_count" integer DEFAULT 0 NOT NULL,
	"total_itc_at_risk" numeric(16, 2) DEFAULT 0 NOT NULL,
	"total_itc_opportunity" numeric(16, 2) DEFAULT 0 NOT NULL,
	"section_16_4_risk_amount" numeric(16, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'FINANCE_MANAGER' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vendor_communications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"reconciliation_run_id" uuid,
	"match_result_id" uuid,
	"channel" "comm_channel" NOT NULL,
	"escalation_stage" smallint DEFAULT 0 NOT NULL,
	"recipient_address" varchar(255) NOT NULL,
	"template_id" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "comm_status" DEFAULT 'QUEUED' NOT NULL,
	"external_message_id" varchar(255),
	"failure_reason" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_statement_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"reconciliation_run_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_accessed_at" timestamp with time zone,
	"access_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_statement_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"gstin" varchar(15) NOT NULL,
	"legal_name" varchar(255) NOT NULL,
	"trade_name" varchar(255),
	"contact_name" varchar(255),
	"contact_phone" varchar(20),
	"contact_email" varchar(255),
	"risk_tier" "risk_tier" DEFAULT 'LOW' NOT NULL,
	"compliance_score" numeric(5, 2) DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gstr2b_invoices" ADD CONSTRAINT "gstr2b_invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gstr2b_invoices" ADD CONSTRAINT "gstr2b_invoices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gstr2b_invoices" ADD CONSTRAINT "gstr2b_invoices_batch_id_ingestion_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."ingestion_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_reconciliation_run_id_reconciliation_runs_id_fk" FOREIGN KEY ("reconciliation_run_id") REFERENCES "public"."reconciliation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_pr_invoice_id_purchase_register_invoices_id_fk" FOREIGN KEY ("pr_invoice_id") REFERENCES "public"."purchase_register_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_gstr2b_invoice_id_gstr2b_invoices_id_fk" FOREIGN KEY ("gstr2b_invoice_id") REFERENCES "public"."gstr2b_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_override_by_user_id_users_id_fk" FOREIGN KEY ("override_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_register_invoices" ADD CONSTRAINT "purchase_register_invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_register_invoices" ADD CONSTRAINT "purchase_register_invoices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_register_invoices" ADD CONSTRAINT "purchase_register_invoices_batch_id_ingestion_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."ingestion_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_communications" ADD CONSTRAINT "vendor_communications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_communications" ADD CONSTRAINT "vendor_communications_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_communications" ADD CONSTRAINT "vendor_communications_reconciliation_run_id_reconciliation_runs_id_fk" FOREIGN KEY ("reconciliation_run_id") REFERENCES "public"."reconciliation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_communications" ADD CONSTRAINT "vendor_communications_match_result_id_match_results_id_fk" FOREIGN KEY ("match_result_id") REFERENCES "public"."match_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_statement_tokens" ADD CONSTRAINT "vendor_statement_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_statement_tokens" ADD CONSTRAINT "vendor_statement_tokens_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_statement_tokens" ADD CONSTRAINT "vendor_statement_tokens_reconciliation_run_id_reconciliation_runs_id_fk" FOREIGN KEY ("reconciliation_run_id") REFERENCES "public"."reconciliation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unq_2b_org_hash" ON "gstr2b_invoices" USING btree ("organization_id","normalization_hash");--> statement-breakpoint
CREATE INDEX "idx_2b_gstin_date" ON "gstr2b_invoices" USING btree ("supplier_gstin","invoice_date");--> statement-breakpoint
CREATE INDEX "idx_2b_org_fy_gstin" ON "gstr2b_invoices" USING btree ("organization_id","financial_year","supplier_gstin");--> statement-breakpoint
CREATE INDEX "idx_batches_org_created" ON "ingestion_batches" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_match_results_status" ON "match_results" USING btree ("reconciliation_run_id","match_status");--> statement-breakpoint
CREATE INDEX "idx_match_results_vendor" ON "match_results" USING btree ("reconciliation_run_id","vendor_id");--> statement-breakpoint
CREATE INDEX "idx_match_results_org" ON "match_results" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unq_match_run_pr" ON "match_results" USING btree ("reconciliation_run_id","pr_invoice_id") WHERE "match_results"."pr_invoice_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "unq_match_run_2b" ON "match_results" USING btree ("reconciliation_run_id","gstr2b_invoice_id") WHERE "match_results"."gstr2b_invoice_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "unq_pr_org_hash" ON "purchase_register_invoices" USING btree ("organization_id","normalization_hash");--> statement-breakpoint
CREATE INDEX "idx_pr_vendor_date" ON "purchase_register_invoices" USING btree ("vendor_id","invoice_date");--> statement-breakpoint
CREATE INDEX "idx_pr_org_fy_gstin" ON "purchase_register_invoices" USING btree ("organization_id","financial_year","supplier_gstin");--> statement-breakpoint
CREATE INDEX "idx_runs_org_fy" ON "reconciliation_runs" USING btree ("organization_id","financial_year","run_date");--> statement-breakpoint
CREATE INDEX "idx_users_org" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_comms_vendor" ON "vendor_communications" USING btree ("organization_id","vendor_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "unq_comms_external_id" ON "vendor_communications" USING btree ("channel","external_message_id") WHERE "vendor_communications"."external_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_tokens_vendor" ON "vendor_statement_tokens" USING btree ("vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unq_org_vendor_gstin" ON "vendors" USING btree ("organization_id","gstin");--> statement-breakpoint
CREATE INDEX "idx_vendors_risk" ON "vendors" USING btree ("organization_id","risk_tier");
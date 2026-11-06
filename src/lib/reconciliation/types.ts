export type DocumentType = 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE';

export type MatchStatus =
  | 'EXACT_MATCH'
  | 'PROBABLE_MATCH'
  | 'DATE_MISMATCH'
  | 'VALUE_MISMATCH'
  | 'TAX_TYPE_MISMATCH'
  | 'GSTIN_MISMATCH'
  | 'MISSING_IN_2B'
  | 'MISSING_IN_PR';

export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Amounts in rupees, always positive; the document type carries the sign. */
export interface InvoiceInput {
  id: string;
  gstin: string;
  invoiceNumber: string;
  /** YYYY-MM-DD */
  invoiceDate: string;
  documentType?: DocumentType;
  taxableValue: number;
  igst?: number;
  cgst?: number;
  sgst?: number;
  cess?: number;
}

export type PrInvoiceInput = InvoiceInput;

export interface Gstr2bInvoiceInput extends InvoiceInput {
  /** GSTR-2B "ITC availability" flag. Defaults to true. */
  itcAvailable?: boolean;
}

export interface ReconcileOptions {
  /** Date the Section 16(4) clock is evaluated against (YYYY-MM-DD). */
  asOf: string;
  /** Per-head and total tax tolerance in rupees. Default ₹1.00. */
  toleranceRupees?: number;
  /** Minimum Levenshtein similarity for Pass 2. Default 0.85. */
  fuzzyThreshold?: number;
  /** ± window for Pass 2 date matching. Default 30. */
  dateWindowDays?: number;
  /** Results with this many days or fewer left are flagged as Section 16(4) risk. Default 60. */
  section164WindowDays?: number;
  /** GSTR-9 filing date per FY ("2024-2025" -> "2025-10-15"); shortens the 16(4) deadline. */
  annualReturnFiledOn?: Record<string, string>;
}

export interface MatchResult {
  prId: string | null;
  gstr2bId: string | null;
  gstin: string;
  status: MatchStatus;
  /** 1 exact key, 2 heuristic, 3 unmatched categorisation */
  pass: 1 | 2 | 3;
  /** 0..1 */
  confidence: number;
  financialYear: string;
  /** PR minus 2B, rupees */
  taxableDifference: number;
  taxDifference: number;
  itcAtRisk: number;
  itcOpportunity: number;
  section164Deadline: string;
  daysToDeadline: number;
  isSection164Risk: boolean;
  isItcLapsed: boolean;
  riskTier: RiskTier;
  notes: string[];
}

export interface VendorExposure {
  gstin: string;
  prCount: number;
  cleanCount: number;
  openIssues: number;
  itcAtRisk: number;
  itcOpportunity: number;
  section164RiskAmount: number;
  nearestDeadline: string | null;
  complianceScore: number;
  riskTier: RiskTier;
  dunningEligible: boolean;
}

export interface ReconcileSummary {
  totalPr: number;
  total2b: number;
  byStatus: Record<MatchStatus, number>;
  exactMatches: number;
  mismatches: number;
  totalItcAtRisk: number;
  totalItcOpportunity: number;
  section164RiskAmount: number;
  lapsedItc: number;
  invalidGstins: string[];
}

export interface ReconcileOutput {
  results: MatchResult[];
  summary: ReconcileSummary;
}

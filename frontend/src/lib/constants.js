export const MATCH_STATUS = {
  MATCHED: "matched",
  MISMATCHED: "mismatched",
  MISSING_IN_PORTAL: "missing_in_portal",
  MISSING_IN_BOOKS: "missing_in_books",
  PROBABLE: "probable",
};

// Map legacy backend buckets to canonical status
export const mapLegacyBucket = (legacyBucket) => {
  if (!legacyBucket) return MATCH_STATUS.PROBABLE;
  
  const normalized = legacyBucket.toLowerCase();
  
  if (normalized.includes("matched") && !normalized.includes("mis")) {
    return MATCH_STATUS.MATCHED;
  }
  if (normalized.includes("mismatched")) {
    return MATCH_STATUS.MISMATCHED;
  }
  if (normalized.includes("missing-in-portal") || normalized.includes("missing_in_portal")) {
    return MATCH_STATUS.MISSING_IN_PORTAL;
  }
  if (normalized.includes("missing-in-books") || normalized.includes("missing_in_books")) {
    return MATCH_STATUS.MISSING_IN_BOOKS;
  }
  return MATCH_STATUS.PROBABLE;
};

// UI mapping for statuses
export const STATUS_UI = {
  [MATCH_STATUS.MATCHED]: {
    label: "Matched",
    color: "bg-status-matched/10 text-status-matched border-status-matched/20",
    dot: "bg-status-matched",
  },
  [MATCH_STATUS.MISMATCHED]: {
    label: "Mismatched",
    color: "bg-status-mismatched/10 text-status-mismatched border-status-mismatched/20",
    dot: "bg-status-mismatched",
  },
  [MATCH_STATUS.MISSING_IN_PORTAL]: {
    label: "Missing in Portal",
    color: "bg-status-missing/10 text-status-missing border-status-missing/20",
    dot: "bg-status-missing",
  },
  [MATCH_STATUS.MISSING_IN_BOOKS]: {
    label: "Missing in Books",
    color: "bg-status-missing/10 text-status-missing border-status-missing/20",
    dot: "bg-status-missing",
  },
  [MATCH_STATUS.PROBABLE]: {
    label: "Probable Match",
    color: "bg-status-probable/10 text-status-probable border-status-probable/20",
    dot: "bg-status-probable",
  },
};

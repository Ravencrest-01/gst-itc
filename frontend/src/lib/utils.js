import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Format currency as INR
export function formatINR(amount) {
  if (amount == null) return "₹0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Format date to local string
export function formatDate(dateString, includeTime = false) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  const options = {
    day: "2-digit",
    month: "short",
    year: "numeric",
  };
  if (includeTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }
  return date.toLocaleDateString("en-IN", options);
}

export const MATCH_STATUS = {
  MATCHED: "matched",
  MISMATCHED: "mismatched",
  MISSING_IN_PORTAL: "missing_in_portal",
  MISSING_IN_BOOKS: "missing_in_books",
  PROBABLE: "probable"
};

export const STATUS_UI = {
  [MATCH_STATUS.MATCHED]: { color: "text-status-matched border-status-matched/50 bg-status-matched/10", label: "Matched" },
  [MATCH_STATUS.MISMATCHED]: { color: "text-status-mismatched border-status-mismatched/50 bg-status-mismatched/10", label: "Mismatched" },
  [MATCH_STATUS.MISSING_IN_PORTAL]: { color: "text-status-missing border-status-missing/50 bg-status-missing/10", label: "Missing in 2B" },
  [MATCH_STATUS.MISSING_IN_BOOKS]: { color: "text-status-missing border-status-missing/50 bg-status-missing/10", label: "Missing in Books" },
  [MATCH_STATUS.PROBABLE]: { color: "text-status-probable border-status-probable/50 bg-status-probable/10", label: "Probable Match" }
};

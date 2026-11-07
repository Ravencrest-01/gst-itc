const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const inrCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });
const count = new Intl.NumberFormat('en-IN');

export const formatInr = (n: number) => inr.format(n);
/** ₹4.2L, ₹1.3Cr: Indian compact notation for headline numbers. */
export const formatInrCompact = (n: number) => inrCompact.format(n);
export const formatCount = (n: number) => count.format(n);

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Indian financial year containing a date: 2026-11-07 → "2026-2027". */
export function currentFinancialYear(date = new Date()): string {
  const y = date.getFullYear();
  const start = date.getMonth() >= 3 ? y : y - 1;
  return `${start}-${start + 1}`;
}

/** The financial year before the given one. */
export function previousFinancialYear(fy: string): string {
  const start = Number(fy.slice(0, 4)) - 1;
  return `${start}-${start + 1}`;
}

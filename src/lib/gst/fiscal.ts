/** Indian financial year helpers. Dates are ISO strings (YYYY-MM-DD) treated as calendar dates. */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function parseIsoDate(iso: string): { y: number; m: number; d: number } {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error(`Invalid ISO date: "${iso}"`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new Error(`Invalid calendar date: "${iso}"`);
  }
  return { y, m, d };
}

/** Days since 1970-01-01 (UTC); used for timezone-safe date arithmetic. */
export function toEpochDay(iso: string): number {
  const { y, m, d } = parseIsoDate(iso);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

export function fromEpochDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** 2025-03-31 -> "2024-2025", 2025-04-01 -> "2025-2026" */
export function financialYearOf(iso: string): string {
  const { y, m } = parseIsoDate(iso);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${start + 1}`;
}

export function fyEndYear(fy: string): number {
  const match = /^(\d{4})-(\d{4})$/.exec(fy);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new Error(`Invalid financial year: "${fy}" (expected e.g. 2024-2025)`);
  }
  return Number(match[2]);
}

/**
 * Section 16(4) CGST Act (as amended by Finance Act 2022): ITC for an invoice/debit note
 * cannot be taken after 30 November following the end of the FY, or the date of furnishing
 * the annual return (GSTR-9), whichever is earlier.
 */
export function section164Deadline(fy: string, annualReturnFiledOn?: string): string {
  const statutory = `${fyEndYear(fy)}-11-30`;
  if (annualReturnFiledOn && toEpochDay(annualReturnFiledOn) < toEpochDay(statutory)) {
    return annualReturnFiledOn;
  }
  return statutory;
}

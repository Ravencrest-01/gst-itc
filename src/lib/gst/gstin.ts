const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Uppercase and strip every whitespace character (including inner spaces from Excel). */
export function normalizeGstin(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, '').toUpperCase();
}

/** GSTN check-digit (Luhn mod-36 variant) for the first 14 characters. */
export function gstinCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARSET.indexOf(first14[i]);
    if (value < 0) return '';
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36];
}

export interface GstinValidation {
  gstin: string;
  valid: boolean;
  reason?: 'EMPTY' | 'FORMAT' | 'CHECKSUM';
}

export function validateGstin(raw: string | null | undefined): GstinValidation {
  const gstin = normalizeGstin(raw);
  if (!gstin) return { gstin, valid: false, reason: 'EMPTY' };
  if (!GSTIN_PATTERN.test(gstin)) return { gstin, valid: false, reason: 'FORMAT' };
  if (gstinCheckDigit(gstin.slice(0, 14)) !== gstin[14]) {
    return { gstin, valid: false, reason: 'CHECKSUM' };
  }
  return { gstin, valid: true };
}

/** PAN embedded in a GSTIN (chars 3–12). Same PAN = same legal entity, different state. */
export function panFromGstin(gstin: string): string {
  return gstin.length === 15 ? gstin.slice(2, 12) : '';
}

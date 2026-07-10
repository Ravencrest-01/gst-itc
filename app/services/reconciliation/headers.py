from typing import Dict, Optional, List
from rapidfuzz import process, fuzz

# Canonical fields
# supplier_gstin, supplier_name, invoice_number, invoice_date, taxable_value, cgst, sgst, igst, cess

SYNONYM_MAP = {
    "supplier_gstin": {
        "gstin", "gstin of supplier", "supplier gst no", "party gstin", "gst number", "supplier gstin/uin", "gstin/uin of supplier"
    },
    "supplier_name": {
        "supplier name", "party name", "name of supplier", "trade name", "legal name", "vendor name"
    },
    "invoice_number": {
        "invoice no", "inv no", "bill no", "document number", "invoice number", "document no"
    },
    "invoice_date": {
        "invoice date", "inv date", "date of invoice", "document date", "bill date"
    },
    "taxable_value": {
        "taxable value", "taxable amt", "assessable value", "net amount", "taxable amount"
    },
    "cgst": {
        "cgst", "central tax", "cgst amount", "central gst"
    },
    "sgst": {
        "sgst", "state/ut tax", "sgst amount", "state gst", "utgst"
    },
    "igst": {
        "igst", "integrated tax", "igst amount", "integrated gst"
    },
    "cess": {
        "cess", "cess amount", "cess tax"
    }
}

# Reverse map for O(1) exact lookups
REVERSE_MAP = {}
for canonical, synonyms in SYNONYM_MAP.items():
    REVERSE_MAP[canonical] = canonical
    for syn in synonyms:
        REVERSE_MAP[syn.lower()] = canonical

def resolve_header(raw_header: str, threshold: int = 85) -> Optional[str]:
    """
    Given a messy header string, map it to a canonical field name.
    1. Lowercase, strip, clean
    2. Check exact synonym match
    3. Fallback to fuzzy match across all synonyms
    """
    if not raw_header:
        return None
        
    cleaned = str(raw_header).lower().strip()
    # Normalize spaces
    cleaned = " ".join(cleaned.split())
    
    # 1. Exact / Synonym Match
    if cleaned in REVERSE_MAP:
        return REVERSE_MAP[cleaned]
        
    # 2. Fuzzy Match across all known terms
    all_terms = list(REVERSE_MAP.keys())
    result = process.extractOne(cleaned, all_terms, scorer=fuzz.WRatio, score_cutoff=threshold)
    
    if result:
        matched_term = result[0]
        return REVERSE_MAP[matched_term]
        
    return None

def map_headers(raw_headers: List[str], threshold: int = 85) -> Dict[str, str]:
    """
    Given a list of raw headers, returns a dict mapping {canonical_field: raw_header_name}
    Only keeps the best match for each canonical field (first seen).
    """
    mapping = {}
    for raw in raw_headers:
        if raw is None:
            continue
        canonical = resolve_header(str(raw), threshold)
        if canonical and canonical not in mapping:
            mapping[canonical] = str(raw)
    return mapping

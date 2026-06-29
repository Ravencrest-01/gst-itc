from typing import Dict, Any
from app.modules.m1_normalizer.cleaners import clean_gstin, clean_invoice_no, parse_date, standardize_tax

def normalize_row(raw_row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Interface: raw field/row -> normalized row dictionary.
    Transforms messy external key-value inputs into clear, sanitized formats.
    """
    cgst = standardize_tax(raw_row.get("cgst"))
    sgst = standardize_tax(raw_row.get("sgst"))
    igst = standardize_tax(raw_row.get("igst"))
    cess = standardize_tax(raw_row.get("cess"))
    
    return {
        "id": raw_row.get("id"),
        "workspace_id": raw_row.get("workspace_id"),
        "client_id": raw_row.get("client_id"),
        "run_id": raw_row.get("run_id"),
        "supplier_gstin": clean_gstin(raw_row.get("supplier_gstin", "")),
        "invoice_no": raw_row.get("invoice_no", ""),
        "invoice_no_norm": clean_invoice_no(raw_row.get("invoice_no", "")),
        "invoice_date": parse_date(raw_row.get("invoice_date")),
        "taxable_value": standardize_tax(raw_row.get("taxable_value")),
        "cgst": cgst,
        "sgst": sgst,
        "igst": igst,
        "cess": cess,
        "total_tax": cgst + sgst + igst + cess
    }
import re
from datetime import datetime, date

def clean_gstin(gstin: str) -> str:
    if not gstin:
        return ""
    return str(gstin).strip().upper()

def clean_invoice_no(invoice_no: str) -> str:
    if not invoice_no:
        return ""
    inv = str(invoice_no).strip().upper()
    inv = re.sub(r'[\s\/\-_]', '', inv)
    return inv.lstrip('0')

def parse_date(date_val) -> date:
    """
    Standardizes multiple date string formats into a proper Python date object.
    Handles 'DD-MM-YYYY', 'DD/MM/YYYY', and 'YYYY-MM-DD'.
    """
    if isinstance(date_val, date):
        return date_val
    if not date_val:
        raise ValueError("Missing date value")
        
    clean_str = str(date_val).strip()
    
    # Try parsing common formats encountered in PR and 2B records
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(clean_str, fmt).date()
        except ValueError:
            continue
            
    raise ValueError(f"Could not parse date format: {date_val}")

def standardize_tax(value) -> float:
    """
    Converts messy currency text, numbers with commas, or missing elements into clean floats.
    """
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
        
    clean_str = str(value).strip().replace(",", "")
    if clean_str == "" or clean_str.upper() in ("NULL", "NAN", "N/A", "-"):
        return 0.0
        
    try:
        return float(clean_str)
    except ValueError:
        return 0.0
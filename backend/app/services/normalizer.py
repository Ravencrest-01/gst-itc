import re
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional

def normalize_gstin(gstin: Optional[str]) -> Optional[str]:
    """Clean GSTIN by stripping whitespace and enforcing uppercase."""
    if not gstin:
        return None
    cleaned = str(gstin).strip().upper()
    return cleaned if cleaned else None

def normalize_invoice_no(invoice_no: Optional[str]) -> Optional[str]:
    """
    Strip invoice-no delimiters (non-alphanumeric) and leading zeros.
    Example: 'INV/26-27/042' -> 'INV2627042'
    Example: '00042' -> '42'
    """
    if not invoice_no:
        return None
    # Remove non-alphanumeric characters and uppercase
    cleaned = re.sub(r'[^A-Z0-9]', '', str(invoice_no).upper())
    # Strip leading zeros
    cleaned = cleaned.lstrip('0')
    return cleaned if cleaned else '0' # Return '0' if it was all zeros

def parse_date(date_val: Any) -> Optional[date]:
    """
    Standardize dates to Python date objects.
    Handles 'YYYY-MM-DD', 'DD-MM-YYYY', 'DD/MM/YYYY' and datetime objects.
    """
    if not date_val:
        return None
    if isinstance(date_val, date) and not isinstance(date_val, datetime):
        return date_val
    if isinstance(date_val, datetime):
        return date_val.date()
    
    date_str = str(date_val).strip()
    
    # Common formats
    formats = [
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%d-%b-%Y",
        "%d/%b/%Y",
        "%Y/%m/%d"
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
            
    # If all fail, return None
    return None

def standardize_tax(value: Any) -> Decimal:
    """
    Convert any numeric/string to Decimal and round to 2 decimal places.
    Returns Decimal('0.00') for invalid/empty values.
    """
    if value is None or str(value).strip() == '':
        return Decimal('0.00')
    try:
        # Remove commas if present
        clean_val = str(value).replace(',', '').strip()
        dec = Decimal(clean_val)
        return dec.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal('0.00')

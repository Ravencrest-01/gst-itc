import re
from decimal import Decimal, InvalidOperation
from datetime import datetime, date
from typing import Optional
from dateutil import parser

# GSTIN Pattern
GSTIN_PATTERN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")

def clean_gstin(val: str) -> str:
    """Strip, uppercase. Does not crash on invalid, but validates."""
    if not val:
        return ""
    val = str(val).strip().upper()
    return val

def is_valid_gstin(val: str) -> bool:
    if not val:
        return False
    return bool(GSTIN_PATTERN.match(val))

def clean_invoice_number(val: str) -> str:
    """Keep the raw value, and derive a comparison key: uppercase, remove spaces///-/_"""
    if not val:
        return ""
    val = str(val).strip().upper()
    val = re.sub(r'[\s/\\\-_]', '', val)
    val = val.lstrip('0')
    return val

def parse_date(val, day_first: bool = True) -> Optional[date]:
    """
    Accept dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd, dd-mmm-yyyy, and Excel serial numbers.
    Return ISO date object.
    """
    if not val:
        return None
    
    if isinstance(val, date):
        return val
    if isinstance(val, datetime):
        return val.date()
        
    val = str(val).strip()
    if not val:
        return None
        
    # Check for Excel serial number
    if val.replace('.', '', 1).isdigit():
        try:
            serial = float(val)
            # Excel epoch is 1899-12-30
            return (datetime(1899, 12, 30) + __import__('datetime').timedelta(days=serial)).date()
        except (ValueError, OverflowError):
            pass
            
    try:
        dt = parser.parse(val, dayfirst=day_first)
        return dt.date()
    except (ValueError, TypeError, parser.ParserError):
        return None

def parse_amount(val) -> Decimal:
    """Strip ₹, commas, spaces, parentheses-as-negative; return Decimal."""
    if val is None:
        return Decimal('0.00')
    if isinstance(val, Decimal):
        return val
    if isinstance(val, (int, float)):
        return Decimal(str(val))
        
    val = str(val).strip()
    if not val or val.lower() in ('nan', 'none', 'null', '-'):
        return Decimal('0.00')
        
    is_negative = False
    if val.startswith('(') and val.endswith(')'):
        is_negative = True
        val = val[1:-1]
        
    val = val.replace('₹', '').replace('Rs.', '').replace('Rs', '').replace(',', '').replace(' ', '')
    
    if val.startswith('-'):
        is_negative = True
        val = val[1:]
        
    try:
        d = Decimal(val)
        return -d if is_negative else d
    except InvalidOperation:
        return Decimal('0.00')

import csv
import json
import io
from datetime import date
from decimal import Decimal
from typing import List, Dict, Any
from app.services.normalizer import (
    normalize_gstin,
    normalize_invoice_no,
    parse_date,
    standardize_tax
)

# Header maps for CSV normalization (maps lowercased common CSV headers to DB columns)
HEADER_MAP = {
    "gstin": "supplier_gstin",
    "supplier gstin": "supplier_gstin",
    "supplier_gstin": "supplier_gstin",
    
    "invoice no": "invoice_no",
    "invoice number": "invoice_no",
    "invoice_no": "invoice_no",
    "inv no": "invoice_no",
    
    "date": "invoice_date",
    "invoice date": "invoice_date",
    "invoice_date": "invoice_date",
    "inv date": "invoice_date",
    
    "taxable value": "taxable_value",
    "taxable amount": "taxable_value",
    "taxable_value": "taxable_value",
    
    "cgst": "cgst",
    "sgst": "sgst",
    "igst": "igst",
    "cess": "cess",
    
    "filing period": "filing_period",
    "filing_period": "filing_period",
}

def normalize_headers(row: Dict[str, str]) -> Dict[str, str]:
    """Normalize keys in row dictionary to match internal DB schema keys."""
    normalized = {}
    for key, val in row.items():
        clean_key = key.strip().lower().replace("_", " ")
        target_key = HEADER_MAP.get(clean_key)
        if target_key:
            normalized[target_key] = val
        else:
            # Keep unknown columns as they are
            normalized[key.strip()] = val
    return normalized

def parse_csv_content(content: bytes) -> List[Dict[str, Any]]:
    """Helper to read CSV bytes and return normalized dictionaries."""
    text = content.decode("utf-8-sig") # handles UTF-8 BOM
    f = io.StringIO(text)
    reader = csv.DictReader(f)
    records = []
    
    for row in reader:
        norm_row = normalize_headers(row)
        records.append(norm_row)
        
    return records

def parse_pr(content: bytes) -> List[Dict[str, Any]]:
    """Parse Purchase Register (CSV format) and normalize fields."""
    raw_records = parse_csv_content(content)
    parsed = []
    
    for r in raw_records:
        gstin = normalize_gstin(r.get("supplier_gstin"))
        inv_no = r.get("invoice_no")
        inv_date = parse_date(r.get("invoice_date"))
        
        # Taxes
        taxable_value = standardize_tax(r.get("taxable_value", "0"))
        cgst = standardize_tax(r.get("cgst", "0"))
        sgst = standardize_tax(r.get("sgst", "0"))
        igst = standardize_tax(r.get("igst", "0"))
        cess = standardize_tax(r.get("cess", "0"))
        
        if not gstin or not inv_no or not inv_date:
            # Skip invalid rows
            continue
            
        parsed.append({
            "supplier_gstin": gstin,
            "invoice_no": inv_no.strip(),
            "invoice_no_norm": normalize_invoice_no(inv_no),
            "invoice_date": inv_date,
            "taxable_value": taxable_value,
            "cgst": cgst,
            "sgst": sgst,
            "igst": igst,
            "cess": cess,
            "total_tax": cgst + sgst + igst + cess
        })
        
    return parsed

def parse_2b(content: bytes, is_json: bool = True) -> List[Dict[str, Any]]:
    """Parse GSTR-2B (CSV or JSON format) and normalize fields."""
    parsed = []
    
    if not is_json:
        # It's a GSTR-2B CSV
        raw_records = parse_csv_content(content)
        for r in raw_records:
            gstin = normalize_gstin(r.get("supplier_gstin"))
            inv_no = r.get("invoice_no")
            inv_date = parse_date(r.get("invoice_date"))
            
            taxable_value = standardize_tax(r.get("taxable_value", "0"))
            cgst = standardize_tax(r.get("cgst", "0"))
            sgst = standardize_tax(r.get("sgst", "0"))
            igst = standardize_tax(r.get("igst", "0"))
            cess = standardize_tax(r.get("cess", "0"))
            filing_period = r.get("filing_period", "").strip()
            
            if not gstin or not inv_no or not inv_date:
                continue
                
            parsed.append({
                "supplier_gstin": gstin,
                "invoice_no": inv_no.strip(),
                "invoice_no_norm": normalize_invoice_no(inv_no),
                "invoice_date": inv_date,
                "taxable_value": taxable_value,
                "cgst": cgst,
                "sgst": sgst,
                "igst": igst,
                "cess": cess,
                "total_tax": cgst + sgst + igst + cess,
                "filing_period": filing_period if filing_period else "N/A"
            })
        return parsed

    # It's a GSTR-2B JSON
    try:
        data = json.loads(content.decode("utf-8"))
    except Exception:
        return []
        
    # Check if this is the official GSTR-2B JSON with doclist/b2b nested structure
    # Official government portal structure often has {"data": {"doclist": [...]}}
    # or a root object containing "b2b" array.
    doclist = None
    if isinstance(data, dict):
        if "data" in data and isinstance(data["data"], dict) and "doclist" in data["data"]:
            doclist = data["data"]["doclist"]
        elif "b2b" in data:
            doclist = data["b2b"]
            
    if doclist is not None:
        # Official GSTR-2B parsing
        for doc in doclist:
            supplier_gstin = normalize_gstin(doc.get("ctin"))
            inv_list = doc.get("inv", [])
            for inv in inv_list:
                inv_no = inv.get("inum")
                inv_date = parse_date(inv.get("idt"))
                taxable_value = standardize_tax(inv.get("val", 0)) # using invoice value as placeholder or aggregating items
                
                # Aggregate tax heads from items
                cgst, sgst, igst, cess = Decimal("0.00"), Decimal("0.00"), Decimal("0.00"), Decimal("0.00")
                for itm in inv.get("itms", []):
                    det = itm.get("itm_det", {})
                    cgst += standardize_tax(det.get("cgst", 0))
                    sgst += standardize_tax(det.get("sgst", 0))
                    igst += standardize_tax(det.get("igst", 0))
                    cess += standardize_tax(det.get("cess", 0))
                    
                filing_period = inv.get("fp", "N/A")
                
                if not supplier_gstin or not inv_no or not inv_date:
                    continue
                    
                parsed.append({
                    "supplier_gstin": supplier_gstin,
                    "invoice_no": inv_no.strip(),
                    "invoice_no_norm": normalize_invoice_no(inv_no),
                    "invoice_date": inv_date,
                    "taxable_value": taxable_value,
                    "cgst": cgst,
                    "sgst": sgst,
                    "igst": igst,
                    "cess": cess,
                    "total_tax": cgst + sgst + igst + cess,
                    "filing_period": filing_period
                })
        return parsed
        
    # Fallback to simple flat list GSTR-2B JSON
    if isinstance(data, list):
        for item in data:
            gstin = normalize_gstin(item.get("supplier_gstin"))
            inv_no = item.get("invoice_no")
            inv_date = parse_date(item.get("invoice_date"))
            
            taxable_value = standardize_tax(item.get("taxable_value", 0))
            cgst = standardize_tax(item.get("cgst", 0))
            sgst = standardize_tax(item.get("sgst", 0))
            igst = standardize_tax(item.get("igst", 0))
            cess = standardize_tax(item.get("cess", 0))
            filing_period = item.get("filing_period", "N/A")
            
            if not gstin or not inv_no or not inv_date:
                continue
                
            parsed.append({
                "supplier_gstin": gstin,
                "invoice_no": inv_no.strip(),
                "invoice_no_norm": normalize_invoice_no(inv_no),
                "invoice_date": inv_date,
                "taxable_value": taxable_value,
                "cgst": cgst,
                "sgst": sgst,
                "igst": igst,
                "cess": cess,
                "total_tax": cgst + sgst + igst + cess,
                "filing_period": filing_period
            })
            
    return parsed

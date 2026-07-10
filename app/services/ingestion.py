import io
import json
import csv
import re
from datetime import datetime
from typing import Dict, List, Any, Tuple
import pandas as pd
import chardet
from fastapi import HTTPException, status

# Canonical fields
CANONICAL_FIELDS = {
    "supplier_gstin": ["gstin", "supplier gstin", "party gstin", "gstin of supplier", "gstin/uin of recipient", "supplier gst no"],
    "supplier_name": ["supplier name", "party name", "name of supplier", "trade name", "legal name"],
    "invoice_number": ["invoice number", "invoice no", "inv no", "bill no", "document number"],
    "invoice_date": ["invoice date", "inv date", "document date", "date"],
    "taxable_value": ["taxable value", "taxable amount", "value", "base amount"],
    "cgst": ["cgst", "central tax", "cgst amount"],
    "sgst": ["sgst", "state tax", "sgst amount", "utgst"],
    "igst": ["igst", "integrated tax", "igst amount"],
    "cess": ["cess", "cess amount"]
}

class IngestionResult:
    def __init__(self, detected_format: str, detected_sheet: str = None):
        self.rows: List[Dict[str, Any]] = []
        self.row_count: int = 0
        self.detected_format: str = detected_format
        self.detected_sheet: str = detected_sheet
        self.mapped_columns: Dict[str, str] = {}
        self.skipped_rows: List[Dict[str, Any]] = []

def detect_file_type(content: bytes, filename: str) -> str:
    """Detect format by magic bytes / content."""
    # Magic bytes
    if content.startswith(b'\x50\x4b\x03\x04'):
        if filename.lower().endswith('.ods'):
            return 'ods'
        return 'xlsx'
    elif content.startswith(b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'):
        return 'xls'
    elif content.startswith(b'{') or content.startswith(b'['):
        try:
            json.loads(content)
            return 'json'
        except json.JSONDecodeError:
            pass
    
    # Text-based detection
    enc = chardet.detect(content[:10000])['encoding'] or 'utf-8'
    try:
        text = content[:4096].decode(enc)
        if '\t' in text:
            return 'tsv'
        elif ',' in text:
            return 'csv'
    except UnicodeDecodeError:
        pass
        
    ext = filename.split('.')[-1].lower()
    if ext in ['csv', 'tsv', 'json', 'xls', 'xlsx', 'ods']:
        return ext
    raise HTTPException(status_code=422, detail="Unsupported or unreadable file format")

def clean_gstin(val: Any) -> str:
    if pd.isna(val): return ""
    return str(val).strip().upper()

def normalize_invoice_no(val: Any) -> Tuple[str, str]:
    if pd.isna(val): return "", ""
    raw = str(val).strip()
    norm = re.sub(r'[\s/\-]', '', raw).upper().lstrip('0')
    return raw, norm

def parse_date(val: Any) -> datetime.date:
    if pd.isna(val) or not str(val).strip():
        return None
    
    if isinstance(val, datetime):
        return val.date()
        
    s = str(val).strip()
    # Handle excel serial dates if they leaked as strings somehow, but usually pandas handles it.
    for fmt in ('%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d', '%d-%b-%Y', '%d-%b-%y'):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None

def parse_amount(val: Any) -> float:
    if pd.isna(val): return 0.0
    if isinstance(val, (int, float)): return float(val)
    s = str(val).replace('₹', '').replace(',', '').strip()
    try:
        return float(s)
    except ValueError:
        return 0.0

def fuzzy_match_headers(raw_headers: List[str]) -> Dict[str, str]:
    mapping = {}
    for raw in raw_headers:
        norm_raw = str(raw).lower().strip()
        matched = False
        for canon, aliases in CANONICAL_FIELDS.items():
            if norm_raw == canon or any(a in norm_raw for a in aliases):
                mapping[canon] = raw
                matched = True
                break
    return mapping

def find_header_row(df: pd.DataFrame) -> Tuple[int, Dict[str, str]]:
    """Skip banner rows to find the real header."""
    for i in range(min(20, len(df))):
        row_vals = df.iloc[i].dropna().astype(str).tolist()
        mapping = fuzzy_match_headers(row_vals)
        # If we found at least 3 critical columns, call it the header
        if len(set(mapping.keys()).intersection({"supplier_gstin", "invoice_number", "invoice_date", "taxable_value"})) >= 3:
            return i, mapping
    return 0, fuzzy_match_headers(df.columns.tolist())

def process_dataframe(df: pd.DataFrame, result: IngestionResult) -> IngestionResult:
    # Drop fully empty rows
    df = df.dropna(how='all')
    
    # Find real header
    header_idx, mapping = find_header_row(df)
    result.mapped_columns = mapping
    
    if header_idx > 0:
        df.columns = df.iloc[header_idx]
        df = df.iloc[header_idx+1:]
        
    # Drop "Total" rows
    df = df[~df.apply(lambda row: row.astype(str).str.contains('Total', case=False, na=False).any(), axis=1)]

    for idx, row in df.iterrows():
        try:
            raw_gstin = row.get(mapping.get('supplier_gstin'))
            raw_inv = row.get(mapping.get('invoice_number'))
            raw_date = row.get(mapping.get('invoice_date'))
            
            if pd.isna(raw_gstin) and pd.isna(raw_inv):
                continue
                
            gstin = clean_gstin(raw_gstin)
            inv_raw, inv_norm = normalize_invoice_no(raw_inv)
            date_val = parse_date(raw_date)
            
            taxable = parse_amount(row.get(mapping.get('taxable_value')))
            cgst = parse_amount(row.get(mapping.get('cgst')))
            sgst = parse_amount(row.get(mapping.get('sgst')))
            igst = parse_amount(row.get(mapping.get('igst')))
            cess = parse_amount(row.get(mapping.get('cess')))
            
            total_tax = cgst + sgst + igst + cess
            
            if not gstin or not inv_raw or not date_val:
                print(f"DEBUG FAIL: gstin={gstin}, inv_raw={inv_raw}, date_val={date_val}")
                result.skipped_rows.append({"row": idx, "reason": "Missing mandatory fields (GSTIN, Invoice Number, or Date)"})
                continue
                
            result.rows.append({
                "supplier_gstin": gstin,
                "supplier_name": str(row.get(mapping.get('supplier_name'), ''))[:255],
                "invoice_number": inv_raw,
                "invoice_number_norm": inv_norm,
                "invoice_date": date_val,
                "taxable_value": taxable,
                "cgst": cgst,
                "sgst": sgst,
                "igst": igst,
                "cess": cess,
                "total_tax": total_tax
            })
            result.row_count += 1
        except Exception as e:
            result.skipped_rows.append({"row": idx, "reason": str(e)})

    return result

def parse_gstr2b_json(data: dict, result: IngestionResult) -> IngestionResult:
    """Parse GSTR-2B structure into normalized rows."""
    # Assuming standard GSTR-2B JSON structure (e.g. data.docdata.b2b)
    try:
        b2b = data.get('data', {}).get('docdata', {}).get('b2b', [])
        for party in b2b:
            gstin = clean_gstin(party.get('ctin'))
            name = party.get('trdnm', '')
            for inv in party.get('inv', []):
                inv_raw, inv_norm = normalize_invoice_no(inv.get('inum'))
                date_val = parse_date(inv.get('dt'))
                
                for item in inv.get('items', []):
                    itm = item.get('item', {})
                    taxable = parse_amount(itm.get('txval'))
                    cgst = parse_amount(itm.get('camt'))
                    sgst = parse_amount(itm.get('samt'))
                    igst = parse_amount(itm.get('iamt'))
                    cess = parse_amount(itm.get('csamt'))
                    
                    if not gstin or not inv_raw or not date_val:
                        result.skipped_rows.append({"row": inv_raw, "reason": "Missing mandatory JSON fields"})
                        continue
                        
                    result.rows.append({
                        "supplier_gstin": gstin,
                        "supplier_name": name[:255],
                        "invoice_number": inv_raw,
                        "invoice_number_norm": inv_norm,
                        "invoice_date": date_val,
                        "taxable_value": taxable,
                        "cgst": cgst,
                        "sgst": sgst,
                        "igst": igst,
                        "cess": cess,
                        "total_tax": cgst + sgst + igst + cess
                    })
                    result.row_count += 1
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse GSTR-2B JSON: {str(e)}")
    return result

def ingest_file(content: bytes, filename: str) -> IngestionResult:
    """Main ingestion entrypoint."""
    file_type = detect_file_type(content, filename)
    result = IngestionResult(detected_format=file_type)
    
    try:
        if file_type == 'json':
            data = json.loads(content.decode('utf-8'))
            return parse_gstr2b_json(data, result)
            
        elif file_type in ['csv', 'tsv']:
            enc = chardet.detect(content[:10000])['encoding'] or 'utf-8'
            text = content.decode(enc)
            # Use sniffer to find delimiter
            try:
                dialect = csv.Sniffer().sniff(text[:4096])
                sep = dialect.delimiter
                if sep not in [',', '\t', ';', '|']:
                    sep = ','
            except csv.Error:
                sep = '\t' if file_type == 'tsv' else ','
                
            df = pd.read_csv(io.StringIO(text), sep=sep, on_bad_lines='skip', engine='python')
            print("DATAFRAME COLUMNS:", df.columns.tolist())
            print("DATAFRAME ROW 0:", df.iloc[0].to_dict() if not df.empty else "Empty")
            return process_dataframe(df, result)
            
        elif file_type in ['xls', 'xlsx', 'ods']:
            engine = 'openpyxl' if file_type == 'xlsx' else ('xlrd' if file_type == 'xls' else 'odf')
            xl = pd.ExcelFile(io.BytesIO(content), engine=engine)
            # Find the best sheet (one with "B2B" or just the first one)
            sheet_name = xl.sheet_names[0]
            for sn in xl.sheet_names:
                if 'b2b' in sn.lower() or 'purchase' in sn.lower():
                    sheet_name = sn
                    break
            result.detected_sheet = sheet_name
            df = pd.read_excel(xl, sheet_name=sheet_name)
            return process_dataframe(df, result)
            
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"File processing failed: {str(e)}")
        
    return result

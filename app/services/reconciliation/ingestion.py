import io
import csv
import json
import chardet
import pandas as pd
from typing import BinaryIO, Union, Optional

from app.services.reconciliation.models import IngestionResult, NormalizedInvoice, SkippedRow
from app.services.reconciliation.headers import map_headers
from app.services.reconciliation.normalize import (
    clean_gstin, clean_invoice_number, parse_date, parse_amount, is_valid_gstin
)
from app.services.reconciliation.config import ReconciliationConfig

class IngestionError(Exception):
    pass

def ingest_file(file_bytes_or_path: Union[bytes, str], kind: str, config: ReconciliationConfig = None) -> IngestionResult:
    """
    Ingest a file (PR or GSTR-2B) from bytes or path.
    Supported formats: CSV, TSV, XLSX, XLS, ODS, JSON.
    """
    if config is None:
        config = ReconciliationConfig()
        
    if isinstance(file_bytes_or_path, str):
        with open(file_bytes_or_path, 'rb') as f:
            file_bytes = f.read()
    else:
        file_bytes = file_bytes_or_path
        
    if len(file_bytes) > config.max_upload_mb * 1024 * 1024:
        raise IngestionError(f"File exceeds maximum allowed size of {config.max_upload_mb}MB.")
        
    # Detect format via magic bytes
    if file_bytes.startswith(b'{') or file_bytes.startswith(b'['):
        return _ingest_json(file_bytes, config)
    elif file_bytes.startswith(b'PK\x03\x04'):
        # ZIP based: XLSX or ODS
        try:
            return _ingest_excel(file_bytes, config, engine='openpyxl')
        except Exception:
            try:
                return _ingest_excel(file_bytes, config, engine='odf')
            except Exception as e:
                raise IngestionError("Could not parse as XLSX or ODS. " + str(e))
    elif file_bytes.startswith(b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'):
        # Legacy XLS
        return _ingest_excel(file_bytes, config, engine='xlrd')
    else:
        # Fallback to CSV/TSV
        return _ingest_csv(file_bytes, config)

def _ingest_csv(file_bytes: bytes, config: ReconciliationConfig) -> IngestionResult:
    encoding = chardet.detect(file_bytes[:10000])['encoding'] or 'utf-8'
    try:
        text = file_bytes.decode(encoding)
        if text.startswith('\ufeff'):
            text = text[1:] # Strip BOM
    except UnicodeDecodeError:
        text = file_bytes.decode('utf-8', errors='replace')
        
    sniffer = csv.Sniffer()
    sample = text[:4096]
    try:
        dialect = sniffer.sniff(sample)
    except csv.Error:
        # Fallback
        dialect = csv.excel
        if '\t' in sample:
            dialect.delimiter = '\t'
            
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    if not reader.fieldnames:
        raise IngestionError("CSV file appears to be empty or lacks headers.")
        
    mapped = map_headers(reader.fieldnames, config.fuzzy_name_threshold)
    
    result = IngestionResult(detected_format="CSV/TSV", mapped_columns=mapped)
    
    for i, row in enumerate(reader, start=2): # 1 is header
        norm_row = _dict_to_normalized(row, mapped, config, i)
        if norm_row:
            result.rows.append(norm_row)
        else:
            result.skipped_rows.append(SkippedRow(i, "Empty or invalid row"))
            
    result.row_count = len(result.rows)
    return result

def _ingest_excel(file_bytes: bytes, config: ReconciliationConfig, engine: str) -> IngestionResult:
    try:
        excel_file = pd.ExcelFile(io.BytesIO(file_bytes), engine=engine)
    except Exception as e:
        raise IngestionError(f"Failed to read Excel file: {str(e)}")
        
    best_sheet = excel_file.sheet_names[0]
    best_df = None
    best_mapping = {}
    
    # Try to find the sheet with the most canonical headers
    for sheet in excel_file.sheet_names:
        # Read a chunk to find header row (skip up to 10 rows of banner)
        for skiprows in range(10):
            df_sample = pd.read_excel(excel_file, sheet_name=sheet, skiprows=skiprows, nrows=0)
            mapping = map_headers(list(df_sample.columns), config.fuzzy_name_threshold)
            if len(mapping) > len(best_mapping):
                best_mapping = mapping
                best_sheet = sheet
                best_df = pd.read_excel(excel_file, sheet_name=sheet, skiprows=skiprows)
                
    if best_df is None:
        raise IngestionError("Could not find a valid header row in any sheet.")
        
    best_df = best_df.dropna(how='all') # drop fully empty rows
    
    result = IngestionResult(detected_format="Excel", detected_sheet=best_sheet, mapped_columns=best_mapping)
    
    # Convert to list of dicts
    records = best_df.to_dict(orient='records')
    for i, row in enumerate(records, start=2):
        # Drop subtotals
        first_val = str(list(row.values())[0] if row else "").lower()
        if "total" in first_val or "subtotal" in first_val:
            result.skipped_rows.append(SkippedRow(i, "Appears to be a total/subtotal row"))
            continue
            
        norm_row = _dict_to_normalized(row, best_mapping, config, i)
        if norm_row:
            result.rows.append(norm_row)
        else:
            result.skipped_rows.append(SkippedRow(i, "Empty or invalid row"))
            
    result.row_count = len(result.rows)
    return result

def _ingest_json(file_bytes: bytes, config: ReconciliationConfig) -> IngestionResult:
    try:
        data = json.loads(file_bytes.decode('utf-8'))
    except Exception as e:
        raise IngestionError(f"Invalid JSON: {str(e)}")
        
    result = IngestionResult(detected_format="JSON")
    
    # GSTR-2B specific traversal: data -> docdata -> b2b -> [suppliers] -> inv -> [invoices]
    docdata = data.get('data', {}).get('docdata', {})
    b2b = docdata.get('b2b', [])
    
    if not b2b and not docdata:
        # Maybe it's a flat array of dicts?
        if isinstance(data, list):
            b2b = [{"inv": data}]
        else:
            raise IngestionError("JSON does not match expected GSTR-2B structure.")
            
    row_idx = 1
    for supplier in b2b:
        gstin = supplier.get('ctin', '')
        supplier_name = supplier.get('trdnm', '')
        invoices = supplier.get('inv', [])
        
        for inv in invoices:
            row_idx += 1
            dt = parse_date(inv.get('dt'), config.date_day_first)
            
            # GSTR JSON stores items, we sum them
            items = inv.get('items', [])
            txval = sum(parse_amount(item.get('txval', 0)) for item in items)
            igst = sum(parse_amount(item.get('igst', 0)) for item in items)
            cgst = sum(parse_amount(item.get('cgst', 0)) for item in items)
            sgst = sum(parse_amount(item.get('sgst', 0)) for item in items)
            cess = sum(parse_amount(item.get('cess', 0)) for item in items)
            
            norm_inv = NormalizedInvoice(
                raw_data=inv,
                supplier_gstin=clean_gstin(gstin),
                supplier_name=supplier_name,
                invoice_number=str(inv.get('inum', '')),
                invoice_number_norm=clean_invoice_number(str(inv.get('inum', ''))),
                invoice_date=dt,
                taxable_value=txval,
                cgst=cgst,
                sgst=sgst,
                igst=igst,
                cess=cess,
                total_tax=cgst + sgst + igst + cess,
                row_index=row_idx
            )
            result.rows.append(norm_inv)
            
    result.row_count = len(result.rows)
    return result

def _dict_to_normalized(row: dict, mapping: dict, config: ReconciliationConfig, row_index: int) -> Optional[NormalizedInvoice]:
    # Extract mapped values
    def get_val(canon_key):
        raw_key = mapping.get(canon_key)
        return row.get(raw_key) if raw_key else None
        
    gstin = clean_gstin(str(get_val('supplier_gstin') or ''))
    inv_num = str(get_val('invoice_number') or '')
    
    if not gstin and not inv_num:
        return None
        
    cgst = parse_amount(get_val('cgst'))
    sgst = parse_amount(get_val('sgst'))
    igst = parse_amount(get_val('igst'))
    cess = parse_amount(get_val('cess'))
    
    return NormalizedInvoice(
        raw_data=row,
        supplier_gstin=gstin,
        supplier_name=str(get_val('supplier_name') or ''),
        invoice_number=inv_num,
        invoice_number_norm=clean_invoice_number(inv_num),
        invoice_date=parse_date(get_val('invoice_date'), config.date_day_first),
        taxable_value=parse_amount(get_val('taxable_value')),
        cgst=cgst,
        sgst=sgst,
        igst=igst,
        cess=cess,
        total_tax=cgst + sgst + igst + cess,
        row_index=row_index
    )

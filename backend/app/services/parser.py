import pandas as pd
from typing import List, Dict

def parse_purchase_register(file_path: str) -> List[Dict]:
    """
    Parses Tally Purchase Register.
    """
    try:
        df = pd.read_excel(file_path, header=None)
    except Exception as e:
        raise ValueError(f"Failed to read Purchase Register: {str(e)}")

    # Find the header row
    header_idx = -1
    for idx, row in df.iterrows():
        row_str = " ".join([str(x).lower() for x in row.dropna()[:5]])
        if "particulars" in row_str and "voucher" in row_str:
            header_idx = idx
            break
            
    if header_idx == -1:
        raise ValueError("Could not detect header row in Purchase Register")
        
    df = pd.read_excel(file_path, header=header_idx)
    
    invoices = []
    
    for _, row in df.iterrows():
        # Stop processing if 'Grand Total' or similar is encountered
        if str(row.get('Particulars', '')).lower() == 'grand total':
            break
            
        date = row.get('Date')
        if pd.isna(date):
            continue
            
        supplier_name = str(row.get('Particulars', '')).strip()
        invoice_number = str(row.get('Voucher No.', '')).strip()
        
        # Calculate Total Tax from CGST, SGST, UTGST, IGST columns
        tax_cols = [c for c in df.columns if any(t in str(c).upper() for t in ['CGST', 'SGST', 'UTGST', 'IGST'])]
        total_tax = 0.0
        for col in tax_cols:
            val = row.get(col)
            if not pd.isna(val):
                try:
                    total_tax += float(val)
                except ValueError:
                    pass
                    
        # Taxable Value (sum columns containing 'PURCHASE @')
        taxable_val = 0.0
        val_cols = [c for c in df.columns if 'PURCHASE @' in str(c).upper() or 'PURCHASE' in str(c).upper() and '@' in str(c)]
        # If no such columns, maybe use 'Value'
        if not val_cols and 'Value' in df.columns:
            val_cols = ['Value']
            
        for col in val_cols:
            val = row.get(col)
            if not pd.isna(val):
                try:
                    taxable_val += float(val)
                except ValueError:
                    pass
        
        if not invoice_number or invoice_number == 'nan':
            continue
            
        invoices.append({
            'supplier_name': supplier_name,
            'supplier_gstin': "", # Tally PR often omits GSTIN per row
            'invoice_number': invoice_number,
            'invoice_date': str(date)[:10],
            'taxable_value': taxable_val,
            'total_tax': total_tax
        })
        
    return invoices


def parse_gstr2b(file_path: str) -> List[Dict]:
    """
    Parses GSTR-2B B2B sheet.
    """
    try:
        df = pd.read_excel(file_path, sheet_name='B2B', header=None)
    except Exception as e:
        raise ValueError(f"Failed to read B2B sheet from GSTR-2B: {str(e)}")
        
    header_idx = -1
    for idx, row in df.iterrows():
        row_str = " ".join([str(x).lower() for x in row.dropna()[:5]])
        if "gstin of supplier" in row_str and "trade/legal name" in row_str:
            header_idx = idx
            break
            
    if header_idx == -1:
        header_idx = 4
        
    df = pd.read_excel(file_path, sheet_name='B2B', header=header_idx)
    
    invoices = []
    
    for _, row in df.iterrows():
        try:
            gstin = str(row.iloc[0]).strip()
            if not gstin or gstin == 'nan':
                continue
                
            supplier_name = str(row.iloc[1]).strip()
            invoice_number = str(row.iloc[2]).strip()
            date = row.iloc[4]
            
            taxable_val = row.iloc[8]
            igst = row.iloc[9]
            cgst = row.iloc[10]
            sgst = row.iloc[11]
            cess = row.iloc[12]
            
            try:
                total_tax = float(igst if not pd.isna(igst) else 0) + float(cgst if not pd.isna(cgst) else 0) + float(sgst if not pd.isna(sgst) else 0) + float(cess if not pd.isna(cess) else 0)
            except ValueError:
                total_tax = 0.0
                
            try:
                taxable_val = float(taxable_val if not pd.isna(taxable_val) else 0)
            except ValueError:
                taxable_val = 0.0
                
            invoices.append({
                'supplier_name': supplier_name,
                'supplier_gstin': gstin,
                'invoice_number': invoice_number,
                'invoice_date': str(date)[:10],
                'taxable_value': taxable_val,
                'total_tax': total_tax
            })
        except Exception:
            pass
        
    return invoices

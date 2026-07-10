import pytest
import io
import json
import pandas as pd
from app.services.ingestion import ingest_file

def test_ingest_clean_csv():
    csv_data = "supplier_gstin,supplier_name,invoice_number,invoice_date,taxable_value,cgst,sgst,igst,cess\n" \
               "27AADCA9090A1Z5,Acme Corp,INV-001,15/04/2026,1000.0,90.0,90.0,0.0,0.0\n"
    content = csv_data.encode('utf-8')
    result = ingest_file(content, "test.csv")
    
    assert result.detected_format == "csv"
    assert result.row_count == 1
    assert result.rows[0]["supplier_gstin"] == "27AADCA9090A1Z5"
    assert result.rows[0]["invoice_number_norm"] == "INV001"
    assert result.rows[0]["total_tax"] == 180.0

def test_ingest_messy_headers_csv():
    # Messy headers testing the fuzzy matcher and some extra spaces/rupee symbols
    csv_data = "Party GSTIN,Name of Supplier,Document Number,Date,Taxable Amount,Central Tax,State Tax,IGST,Cess\n" \
               " 29AABCT1234Q1Z1 , Tech Start , TS/26/042 , 2026-04-12 , \"₹ 54,000.00\" , 0 , 0 , 9720.00 , 0 \n"
    content = csv_data.encode('utf-8')
    result = ingest_file(content, "messy.csv")
    print("SKIPPED:", result.skipped_rows)
    print("MAPPED:", result.mapped_columns)
    
    assert result.detected_format == "csv"
    assert result.row_count == 1
    row = result.rows[0]
    assert row["supplier_gstin"] == "29AABCT1234Q1Z1"
    assert row["invoice_number_norm"] == "TS26042"
    assert row["invoice_date"].strftime("%Y-%m-%d") == "2026-04-12"
    assert row["taxable_value"] == 54000.0
    assert row["igst"] == 9720.0
    assert row["total_tax"] == 9720.0

def test_ingest_gstr2b_json():
    json_data = {
        "data": {
            "docdata": {
                "b2b": [
                    {
                        "ctin": "09AABCO9012Q1Z3",
                        "trdnm": "Office Supplies",
                        "inv": [
                            {
                                "inum": "OS-789",
                                "dt": "20-04-2026",
                                "items": [
                                    {
                                        "item": {
                                            "txval": 4500.0,
                                            "camt": 405.0,
                                            "samt": 405.0,
                                            "iamt": 0.0,
                                            "csamt": 0.0
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        }
    }
    content = json.dumps(json_data).encode('utf-8')
    result = ingest_file(content, "gstr2b.json")
    
    assert result.detected_format == "json"
    assert result.row_count == 1
    row = result.rows[0]
    assert row["supplier_gstin"] == "09AABCO9012Q1Z3"
    assert row["invoice_number"] == "OS-789"
    assert row["invoice_number_norm"] == "OS789"
    assert row["total_tax"] == 810.0

def test_missing_mandatory_fields():
    # Missing Invoice Number
    csv_data = "gstin,invoice_no,date,value\n27AADCA9090A1Z5,,15/04/2026,1000\n"
    content = csv_data.encode('utf-8')
    result = ingest_file(content, "bad.csv")
    
    assert result.row_count == 0
    assert len(result.skipped_rows) == 1
    assert "Missing mandatory fields" in result.skipped_rows[0]["reason"]

def test_excel_format_stub(monkeypatch):
    """
    Since we don't want to generate binary Excel files in text, we mock pandas read_excel.
    """
    def mock_read_excel(*args, **kwargs):
        return pd.DataFrame({
            "GSTIN of supplier": ["27AADCA9090A1Z5"],
            "Trade Name": ["Mocked Excel Corp"],
            "Invoice No": ["XLS-001"],
            "Invoice Date": ["2026-04-01"],
            "Taxable Value": [5000.0],
            "IGST": [900.0]
        })
    monkeypatch.setattr(pd, "read_excel", mock_read_excel)
    
    # We pass empty bytes, but the extension tells the ingester what to do.
    # The read_excel mock intercepts it.
    
    # Needs valid zip signature to pass magic byte detection for xlsx, or we bypass it
    # We bypass magic byte detection for this pure unit test
    def mock_detect(*args): return "xlsx"
    import app.services.ingestion as ing
    monkeypatch.setattr(ing, "detect_file_type", mock_detect)
    
    # We also need to mock ExcelFile
    class MockExcelFile:
        def __init__(self, *args, **kwargs):
            self.sheet_names = ["B2B"]
    monkeypatch.setattr(pd, "ExcelFile", MockExcelFile)
    
    result = ingest_file(b'', "test.xlsx")
    assert result.detected_format == "xlsx"
    assert result.row_count == 1
    assert result.rows[0]["invoice_number_norm"] == "XLS001"

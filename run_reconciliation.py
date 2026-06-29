import csv
import os
import uuid
from collections import Counter
from app.modules.m1_normalizer.service import normalize_row
from app.modules.m2_matcher.engine import run_matching_passes

# 1. Create Mock CSV Files to Simulate Real Client Data
def create_mock_csvs():
    pr_data = [
        ["supplier_gstin", "invoice_no", "invoice_date", "taxable_value", "cgst", "sgst"],
        ["  27AAAAA1111A1Z1  ", "INV/2026/001", "29/06/2026", "10000", "900", "900"],   # Will Match via P2
        ["27BBBBB2222B2Z2", "INV-999", "29/06/2026", "5000", "450", "450"]               # Missing in Portal
    ]
    
    twob_data = [
        ["supplier_gstin", "invoice_no", "invoice_date", "taxable_value", "cgst", "sgst"],
        ["27AAAAA1111A1Z1", "INV-2026-001", "29/06/2026", "10000", "900", "900"]          # Format variation!
    ]

    if not os.path.exists("sample_purchase_register.csv"):
        with open("sample_purchase_register.csv", "w", newline="") as f:
            csv.writer(f).writerows(pr_data)
        print(" Created: sample_purchase_register.csv")

    if not os.path.exists("sample_gstr_2b.csv"):
        with open("sample_gstr_2b.csv", "w", newline="") as f:
            csv.writer(f).writerows(twob_data)
        print(" Created: sample_gstr_2b.csv")

# 2. Read and Parse CSV Rows into Python Dictionaries
def load_csv_rows(file_path: str) -> list:
    rows = []
    with open(file_path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows

# 3. Main Orchestration Core
def main():
    print("=" * 50)
    print("ITC RECONCILIATION ENGINE - VERTICAL SLICE CLI")
    print("=" * 50)
    
    # Generate files if missing
    create_mock_csvs()
    
    # Metadata for Multi-Client Scope tracking
    workspace_id = uuid.uuid4()
    client_id = uuid.uuid4()
    run_id = uuid.uuid4()

    # Load Raw Datasets
    raw_pr = load_csv_rows("sample_purchase_register.csv")
    raw_2b = load_csv_rows("sample_gstr_2b.csv")

    # --- PHASE 1: NORMALIZE DATA (M1) ---
    normalized_pr = []
    for idx, row in enumerate(raw_pr):
        row.update({"workspace_id": workspace_id, "client_id": client_id, "run_id": run_id, "id": uuid.uuid4()})
        normalized_pr.append(normalize_row(row))

    normalized_2b = []
    for row in raw_2b:
        row.update({"workspace_id": workspace_id, "client_id": client_id, "run_id": run_id, "id": uuid.uuid4()})
        normalized_2b.append(normalize_row(row))

    # --- PHASE 2: EXECUTE MATCHING (M2) ---
    match_results = run_matching_passes(normalized_pr, normalized_2b)

    # --- PHASE 3: AGGREGATE SUMMARY DISPLAY ---
    buckets = [res["bucket"] for res in match_results]
    summary_counts = Counter(buckets)

    print("\n" + "-" * 30)
    print(" RECONCILIATION RUN COMPLETE")
    print("-" * 30)
    print(f"Total Invoices Processed: {len(normalized_pr)}")
    for bucket, count in summary_counts.items():
        print(f" └── {bucket}: {count} invoice(s)")
    print("-" * 30)
    
    # Breakdown individual matching passes
    print("\nExecution Trail Log:")
    for res in match_results:
        match_trail = f"-> Via {res['match_pass']}" if res['match_pass'] else ""
        print(f" 🏢 Client Invoice ID {str(res['purchase_invoice_id'])[:8]}... status bucket: [{res['bucket']}] {match_trail}")
    print("=" * 50)

if __name__ == "__main__":
    main()
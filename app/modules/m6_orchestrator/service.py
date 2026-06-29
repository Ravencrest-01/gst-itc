import csv
import io
import uuid
from typing import List, Dict, Any
from app.modules.m1_normalizer.service import normalize_row
from app.modules.m2_matcher.engine import run_matching_passes

def run_reconciliation(
    pr_file_contents: bytes, 
    twob_file_contents: bytes, 
    tenant: dict
) -> List[Dict[str, Any]]:
    """
    Module M6 Orchestration Seam: Combines Ingestion (M4), Normalization (M1), 
    and Matching (M2) into a single functional unit independent of the HTTP layer.
    """
    run_id = uuid.uuid4()
    
    # 1. Parse and Normalize Purchase Register (PR) CSV data
    normalized_pr = []
    pr_buffer = io.StringIO(pr_file_contents.decode("utf-8-sig"))
    pr_reader = csv.DictReader(pr_buffer)
    for row in pr_reader:
        row.update({
            "id": uuid.uuid4(),
            "workspace_id": tenant["workspace_id"],
            "client_id": tenant["client_id"],
            "run_id": run_id
        })
        normalized_pr.append(normalize_row(row))

    # 2. Parse and Normalize GSTR-2B Portal CSV data
    normalized_2b = []
    twob_buffer = io.StringIO(twob_file_contents.decode("utf-8-sig"))
    twob_reader = csv.DictReader(twob_buffer)
    for row in twob_reader:
        row.update({
            "id": uuid.uuid4(),
            "workspace_id": tenant["workspace_id"],
            "client_id": tenant["client_id"],
            "run_id": run_id
        })
        normalized_2b.append(normalize_row(row))

    # 3. Execute the Multi-Pass Matching Engine
    match_results = run_matching_passes(normalized_pr, normalized_2b)
    return match_results
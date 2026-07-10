import uuid
from typing import Dict, Any

def fetch_gstr2b_job(client_id: uuid.UUID, financial_year: str, tax_period: str) -> Dict[str, Any]:
    """
    Dispatches a job to fetch GSTR-2B from GSTN API.
    Returns the job details for polling.
    """
    return {
        "job_id": str(uuid.uuid4()),
        "status": "queued",
        "message": f"Fetching {tax_period} for FY {financial_year}"
    }

def get_job_status(job_id: uuid.UUID) -> Dict[str, Any]:
    # Mocking completion after some time
    return {
        "job_id": str(job_id),
        "status": "completed",
        "file_id": str(uuid.uuid4())
    }

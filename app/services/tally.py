import uuid
from typing import Dict, Any

def process_tally_export(client_id: uuid.UUID, content: bytes) -> Dict[str, Any]:
    """
    Parses a Tally export XML/CSV into the standard ingestion pipeline.
    This is a stub demonstrating where the logic sits.
    """
    return {
        "file_id": str(uuid.uuid4()),
        "kind": "purchase_register",
        "rows_imported": 0,
        "message": "Tally import processing would occur here."
    }

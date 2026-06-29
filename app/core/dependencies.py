import uuid
from fastapi import Header, HTTPException

def get_current_tenant_context():
    """
    Module M3 Seam: Enforces multi-client isolation across the entire application.
    Every query down the line will automatically read this data block.
    """
    # For a fast MVP, we simulate a secure login session. 
    # Later, this swaps to real JWT validation, but the function signature stays identical!
    return {
        "workspace_id": uuid.UUID("11111111-1111-1111-1111-111111111111"), # CA Firm / Team Account
        "client_id": uuid.UUID("22222222-2222-2222-2222-222222222222"),    # Active Taxpayer Company
        "user_id": uuid.UUID("33333333-3333-3333-3333-333333333333"),      # Active Staff Member
        "role": "assigned_staff"
    }
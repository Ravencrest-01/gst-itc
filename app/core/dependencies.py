import uuid
from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session
from jose import jwt, JWTError

from app.core.database import get_db
from app.core.security import SECRET_KEY, ALGORITHM
from app.modules.m0_schema.models import Client


def get_current_tenant_context(
    authorization: str | None = Header(default=None),
    x_client_id: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """
    Module M3 Seam: real JWT tenant resolution (replaces the hardcoded stub).

    - user_id + workspace_id are read from the signed token
      (Authorization: Bearer <token>).
    - client_id (the active company) is read from the X-Client-Id header that
      the frontend sends after a company is selected. If it's absent we fall
      back to the workspace's first company, so every existing route keeps
      working while the UI grows a real company switcher.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("sub")
    workspace_id = payload.get("workspace_id")
    if not user_id or not workspace_id:
        raise HTTPException(status_code=401, detail="Malformed token")

    workspace_uuid = uuid.UUID(workspace_id)

    # Resolve the active company (client).
    client_uuid = None
    if x_client_id:
        c = (
            db.query(Client)
            .filter(Client.id == uuid.UUID(x_client_id), Client.workspace_id == workspace_uuid)
            .first()
        )
        if not c:
            raise HTTPException(status_code=403, detail="No access to this company")
        client_uuid = c.id
    else:
        first = db.query(Client).filter(Client.workspace_id == workspace_uuid).first()
        client_uuid = first.id if first else None

    return {
        "workspace_id": workspace_uuid,
        "user_id": uuid.UUID(user_id),
        "client_id": client_uuid,
        "role": "admin",
    }
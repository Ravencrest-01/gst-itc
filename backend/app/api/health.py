from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.session import get_db

router = APIRouter()

@router.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        # Check database connection
        db.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "version": "0.1.0",
            "database": "connected"
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database connection failed: {str(e)}"
        )

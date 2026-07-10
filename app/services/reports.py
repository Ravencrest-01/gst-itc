from io import BytesIO
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
import pandas as pd
from sqlalchemy.orm import Session
from app.models.domain import MatchResult, ReconciliationRun

def generate_reconciliation_report(db: Session, run_id: str, format: str) -> StreamingResponse:
    run = db.query(ReconciliationRun).filter(ReconciliationRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    # In a real scenario, this would generate a comprehensive report
    # We will simulate a quick pandas export of match results
    matches = db.query(MatchResult).filter(MatchResult.run_id == run_id).all()
    
    data = []
    for m in matches:
        data.append({
            "Bucket": m.bucket,
            "Match Pass": m.match_pass,
            "Tax Diff": float(m.tax_diff),
            "Status": m.review_status
        })
        
    df = pd.DataFrame(data)
    
    if format == 'csv':
        output = BytesIO()
        df.to_csv(output, index=False)
        output.seek(0)
        return StreamingResponse(
            output, 
            media_type="text/csv", 
            headers={"Content-Disposition": f"attachment; filename=reconciliation_{run_id}.csv"}
        )
    elif format == 'xlsx':
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name="Results")
        output.seek(0)
        return StreamingResponse(
            output, 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
            headers={"Content-Disposition": f"attachment; filename=reconciliation_{run_id}.xlsx"}
        )
    else:
        raise HTTPException(status_code=400, detail="Unsupported format. Use csv or xlsx.")

import time
from app.models.models import ReconciliationRun, AuditLog

def test_create_and_reconcile_run_flow(client, auth_headers, db_session):
    # Step 1: Create a run
    payload = {"tax_period": "2026-06"}
    response = client.post("/runs", json=payload, headers=auth_headers)
    assert response.status_code == 201
    run_data = response.json()
    run_id = run_data["id"]
    assert run_data["tax_period"] == "2026-06"
    assert run_data["status"] == "created"

    # Verify run is stored in db
    db_run = db_session.query(ReconciliationRun).filter(ReconciliationRun.id == run_id).first()
    assert db_run is not None
    assert db_run.status == "created"

    # Step 2: Trigger reconciliation background task
    reconcile_response = client.post(f"/runs/{run_id}/reconcile", headers=auth_headers)
    assert reconcile_response.status_code == 202
    assert reconcile_response.json()["message"] == "Reconciliation job started successfully"

    # Since it's BackgroundTasks, it runs inside the same process/thread during tests synchronously or very fast.
    # We will poll/wait a short time or manually check since TestClient executes background tasks before returning when using context manager.
    # Let's refresh database session and assert run status is completed.
    db_session.expire_all()
    db_run_after = db_session.query(ReconciliationRun).filter(ReconciliationRun.id == run_id).first()
    assert db_run_after.status == "completed"
    assert db_run_after.completed_at is not None

    # Step 3: Verify audit log entries
    audit_entries = db_session.query(AuditLog).filter(AuditLog.run_id == run_id).all()
    actions = [log.action for log in audit_entries]
    assert "create_run" in actions
    assert "start_matching" in actions
    assert "complete_matching" in actions

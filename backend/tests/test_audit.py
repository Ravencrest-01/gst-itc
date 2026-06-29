from app.models.models import AuditLog

def test_get_audit_logs(client, auth_headers, db_session):
    # Step 1: Trigger an action to create an audit log
    payload = {"tax_period": "2026-07"}
    response = client.post("/runs", json=payload, headers=auth_headers)
    assert response.status_code == 201
    run_id = response.json()["id"]

    # Step 2: Fetch audit logs via API
    audit_response = client.get("/audit", headers=auth_headers)
    assert audit_response.status_code == 200
    
    logs = audit_response.json()
    assert len(logs) > 0
    
    # Assert our specific run log is present
    found_run_log = any(log["run_id"] == run_id and log["action"] == "create_run" for log in logs)
    assert found_run_log is True

def test_audit_logs_filtering(client, auth_headers, db_session):
    # Trigger an action
    payload = {"tax_period": "2026-08"}
    response = client.post("/runs", json=payload, headers=auth_headers)
    run_id = response.json()["id"]

    # Test filtering by run_id
    res_run = client.get(f"/audit?run_id={run_id}", headers=auth_headers)
    assert res_run.status_code == 200
    run_logs = res_run.json()
    assert len(run_logs) == 1
    assert run_logs[0]["run_id"] == run_id
    assert run_logs[0]["action"] == "create_run"

    # Test filtering by action
    res_action = client.get(f"/audit?action=create_run", headers=auth_headers)
    assert res_action.status_code == 200
    action_logs = res_action.json()
    assert len(action_logs) >= 1
    assert all(log["action"] == "create_run" for log in action_logs)

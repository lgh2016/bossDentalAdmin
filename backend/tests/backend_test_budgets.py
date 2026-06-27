"""Tests for multi-budget refactor (observations, price-change log, finalize/cancel)."""
import os
import time
import uuid
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://dental-admin-10.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "admin@bossdental.com", "password": "admin123"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["accessToken"]


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def patient_id(H):
    # Create a fresh patient to avoid interference with existing budgets.
    body = {
        "name": "TEST_Budget",
        "lastName": f"Pat{uuid.uuid4().hex[:6]}",
        "email": f"test_budget_{uuid.uuid4().hex[:6]}@example.com",
        "phone": "5555550100",
        "gender": "M",
        "birthDate": "1990-01-01",
        "address": "Test 123",
    }
    r = requests.post(f"{API}/patients", json=body, headers=H, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _ensure_clean(H, pid):
    """If patient has an editable budget, cancel it; if FINALIZED only, leave it."""
    r = requests.get(f"{API}/patients/{pid}/budgets", headers=H, timeout=15)
    if r.status_code == 200:
        for b in r.json().get("data", []):
            if b.get("status") in ("DRAFT", "ACTIVE"):
                requests.put(f"{API}/patients/{pid}/budgets/{b['id']}/cancel", headers=H, timeout=15)


def test_list_budgets_endpoint(H, patient_id):
    _ensure_clean(H, patient_id)
    r = requests.get(f"{API}/patients/{patient_id}/budgets", headers=H, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "data" in data and isinstance(data["data"], list)


def test_create_budget_active_with_observations(H, patient_id):
    _ensure_clean(H, patient_id)
    payload = {
        "name": "Presupuesto inicial",
        "observations": "Notas generales",
        "items": [
            {"name": "Limpieza", "tooth": "", "description": "", "observations": "Detalle por línea 1",
             "qty": 1, "unitPrice": 500},
            {"name": "Resina", "tooth": "11", "description": "", "observations": "Cara mesial",
             "qty": 2, "unitPrice": 800},
        ],
    }
    r = requests.post(f"{API}/patients/{patient_id}/budgets", json=payload, headers=H, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["status"] == "DRAFT"
    assert d["total"] == 500 + 2 * 800
    assert len(d["items"]) == 2
    assert d["items"][0]["observations"] == "Detalle por línea 1"
    assert d["items"][1]["observations"] == "Cara mesial"
    pytest.b1_id = d["id"]
    pytest.b1_items = d["items"]


def test_create_when_editable_exists_returns_409(H, patient_id):
    payload = {"name": "Duplicado", "items": [{"name": "X", "qty": 1, "unitPrice": 1}]}
    r = requests.post(f"{API}/patients/{patient_id}/budgets", json=payload, headers=H, timeout=15)
    assert r.status_code == 409
    assert "detail" in r.json()


def test_patch_preserves_item_ids_and_observations(H, patient_id):
    bid = pytest.b1_id
    items = pytest.b1_items
    payload = {
        "name": "Presupuesto inicial",
        "observations": "actualizado",
        "items": [
            {"id": items[0]["id"], "name": "Limpieza", "qty": 1, "unitPrice": 500,
             "observations": "Detalle por línea 1 EDITADO"},
            {"id": items[1]["id"], "name": "Resina", "tooth": "11", "qty": 2, "unitPrice": 800,
             "observations": "Cara mesial"},
        ],
    }
    r = requests.patch(f"{API}/patients/{patient_id}/budgets/{bid}", json=payload, headers=H, timeout=15)
    assert r.status_code == 200, r.text
    new_items = r.json()["data"]["items"]
    assert [i["id"] for i in new_items] == [items[0]["id"], items[1]["id"]]
    assert new_items[0]["observations"] == "Detalle por línea 1 EDITADO"
    # Persist after reload
    r2 = requests.get(f"{API}/patients/{patient_id}/budgets", headers=H, timeout=15)
    b = next(x for x in r2.json()["data"] if x["id"] == bid)
    assert b["items"][0]["observations"] == "Detalle por línea 1 EDITADO"
    assert [i["id"] for i in b["items"]] == [items[0]["id"], items[1]["id"]]


def test_price_change_creates_detailed_activity_log(H, patient_id):
    bid = pytest.b1_id
    items = pytest.b1_items
    payload = {
        "name": "Presupuesto inicial",
        "items": [
            {"id": items[0]["id"], "name": "Limpieza", "qty": 1, "unitPrice": 750,  # 500 -> 750
             "observations": "Detalle por línea 1 EDITADO"},
            {"id": items[1]["id"], "name": "Resina", "tooth": "11", "qty": 2, "unitPrice": 800,
             "observations": "Cara mesial"},
        ],
    }
    r = requests.patch(f"{API}/patients/{patient_id}/budgets/{bid}", json=payload, headers=H, timeout=15)
    assert r.status_code == 200
    time.sleep(0.5)
    logs = requests.get(f"{API}/patients/{patient_id}/activity-logs?size=50", headers=H, timeout=15).json()
    entries = [e for e in logs["data"]["content"] if e.get("actionCode") == "BUDGET_ITEM_PRICE_CHANGED"]
    assert entries, "No BUDGET_ITEM_PRICE_CHANGED log inserted"
    e = entries[0]
    desc = e.get("description", "")
    assert "Limpieza" in desc
    assert "500" in desc and "750" in desc
    assert "Presupuesto inicial" in desc
    assert "TEST_Budget" in desc  # patient name
    meta = e.get("metadata") or {}
    assert meta.get("budgetId") == bid
    assert meta.get("budgetName") == "Presupuesto inicial"
    assert meta.get("itemId") == items[0]["id"]
    assert meta.get("itemName") == "Limpieza"
    assert meta.get("oldPrice") == 500
    assert meta.get("newPrice") == 750
    assert meta.get("patientName", "").startswith("TEST_Budget")
    assert meta.get("expedientNumber", "").startswith("EXP-")


def test_finalize_budget_changes_status(H, patient_id):
    bid = pytest.b1_id
    r = requests.put(f"{API}/patients/{patient_id}/budgets/{bid}/finalize", headers=H, timeout=15)
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "FINALIZED"
    # 409 when re-attempting
    r2 = requests.put(f"{API}/patients/{patient_id}/budgets/{bid}/finalize", headers=H, timeout=15)
    assert r2.status_code == 409
    r3 = requests.patch(f"{API}/patients/{patient_id}/budgets/{bid}",
                       json={"items": [{"name": "x", "qty": 1, "unitPrice": 1}]}, headers=H, timeout=15)
    assert r3.status_code == 409


def test_price_isolation_between_budgets_and_catalog(H, patient_id):
    # Create a second budget — first is finalized so this should succeed.
    payload = {
        "name": "Segundo",
        "items": [{"name": "Limpieza", "qty": 1, "unitPrice": 500, "observations": ""}],
    }
    r = requests.post(f"{API}/patients/{patient_id}/budgets", json=payload, headers=H, timeout=15)
    assert r.status_code == 200, r.text
    b2 = r.json()["data"]
    # The first budget still has price 750 for Limpieza (changed earlier); the new budget has 500.
    blist = requests.get(f"{API}/patients/{patient_id}/budgets", headers=H, timeout=15).json()["data"]
    by_id = {b["id"]: b for b in blist}
    b1 = by_id[pytest.b1_id]
    b1_limpieza = next(i for i in b1["items"] if i["name"] == "Limpieza")
    b2_limpieza = next(i for i in b2["items"] if i["name"] == "Limpieza")
    assert b1_limpieza["unitPrice"] == 750
    assert b2_limpieza["unitPrice"] == 500
    pytest.b2_id = b2["id"]


def test_cancel_budget_and_logs(H, patient_id):
    bid = pytest.b2_id
    r = requests.put(f"{API}/patients/{patient_id}/budgets/{bid}/cancel", headers=H, timeout=15)
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "CANCELLED"
    # Re-cancel → 409
    r2 = requests.put(f"{API}/patients/{patient_id}/budgets/{bid}/cancel", headers=H, timeout=15)
    assert r2.status_code == 409
    time.sleep(0.3)
    logs = requests.get(f"{API}/patients/{patient_id}/activity-logs?size=50", headers=H, timeout=15).json()
    codes = {e["actionCode"] for e in logs["data"]["content"]}
    assert "BUDGET_FINALIZED" in codes
    assert "BUDGET_CANCELLED" in codes


def test_total_budgeted_uses_finalized_when_no_editable(H, patient_id):
    # Now first is FINALIZED (total 750 + 1600 = 2350), second is CANCELLED → ignore.
    d = requests.get(f"{API}/patients/{patient_id}/detail", headers=H, timeout=15).json()["data"]
    assert d["totalBudgeted"] == 2350.0


def test_total_budgeted_prefers_active_over_finalized(H, patient_id):
    # Create a new ACTIVE budget — it should take precedence.
    payload = {"name": "Vigente", "items": [{"name": "X", "qty": 1, "unitPrice": 99}]}
    r = requests.post(f"{API}/patients/{patient_id}/budgets", json=payload, headers=H, timeout=15)
    assert r.status_code == 200
    d = requests.get(f"{API}/patients/{patient_id}/detail", headers=H, timeout=15).json()["data"]
    assert d["totalBudgeted"] == 99.0
    # cleanup
    requests.put(f"{API}/patients/{patient_id}/budgets/{r.json()['data']['id']}/cancel", headers=H, timeout=15)

"""Opt-in regression against the isolated local database; no cleanup of history.

Run with BOSS_DENTAL_LOCAL_TESTS=1. Creates a fictional patient and new budgets.
Never uses the remote defaults or credentials of the older suites.
"""
import os
from pathlib import Path
from uuid import uuid4

import pytest
import requests
from pymongo import MongoClient


@pytest.mark.skipif(os.getenv("BOSS_DENTAL_LOCAL_TESTS") != "1", reason="Local DB opt-in required")
def test_independent_budgets_and_committed_balance():
    client = MongoClient("mongodb://127.0.0.1:27019/?directConnection=true", serverSelectionTimeoutMS=5000)
    db = client["boss_dental_dev"]
    assert db.command("ping")["ok"] == 1
    history = list(db.budgets.find({}))
    payments_before = list(db.payments.find({}))
    credentials = (Path(__file__).parents[1] / ".venv/local-credentials.txt").read_text(encoding="utf-8")
    block = next(b for b in credentials.split("\n\n") if "Correo: reception@bossdental.com" in b)
    password = next(line.split(": ", 1)[1] for line in block.splitlines() if line.startswith("Contrasena: "))
    session = requests.Session()
    session.trust_env = False
    base = "http://127.0.0.1:8001/api"

    def call(method, path, payload=None, status=200):
        response = session.request(method, base + path, json=payload, timeout=15)
        assert response.status_code == status, f"{method} {path}: HTTP {response.status_code}"
        return response.json()

    auth = call("POST", "/auth/login", {"email": "reception@bossdental.com", "password": password})
    assert auth["user"]["role"]["name"] == "RECEPTION"
    session.headers["Authorization"] = "Bearer " + auth["accessToken"]
    patient = call("POST", "/patients", {
        "name": "Camila", "lastName": "Ríos Serrano", "birthDate": "1995-03-12",
        "phone": "5500004201", "gender": "Femenino", "email": f"camila.{uuid4().hex[:8]}@example.com",
        "address": "Col. Las Américas, Ecatepec, Estado de México",
    })
    pid = patient["id"]
    assert db.patients.find_one({"id": pid, "email": patient["email"]}), "API must write to this local DB"
    path = f"/patients/{pid}/budgets"
    plan = {
        "name": "Prevención y restauración", "observations": "Propuesta inicial",
        "items": [
            {"name": "Limpieza", "description": "Profilaxis dental", "tooth": "", "qty": 1, "unitPrice": 500, "observations": "Una sesión"},
            {"name": "Resina", "description": "Restauración", "tooth": "16", "qty": 2, "unitPrice": 800, "observations": "Revisar alcance"},
        ],
    }
    b1 = call("POST", path, plan)["data"]
    b2 = call("POST", path, {**plan, "name": "Alternativa de restauración"})["data"]
    assert b1["id"] != b2["id"]
    assert {i["id"] for i in b1["items"]}.isdisjoint(i["id"] for i in b2["items"])
    assert b1["items"][1]["subtotal"] == 1600
    assert b1["items"][1]["description"] == "Restauración"
    changed = {**plan, "name": b2["name"], "items": [{**i, "unitPrice": 900} for i in b2["items"]]}
    b2 = call("PATCH", path + "/" + b2["id"], changed)["data"]
    assert db.budgets.find_one({"id": b1["id"]}, {"_id": 0}) == b1
    call("PUT", path + "/" + b2["id"] + "/present")
    b2 = db.budgets.find_one({"id": b2["id"]}, {"_id": 0})
    first_two = {b["id"]: b for b in call("GET", path)["data"]}
    assert set(first_two) == {b1["id"], b2["id"]}
    assert call("GET", f"/patients/{pid}/detail")["data"]["balance"] == 0
    b3 = call("POST", path, {**plan, "name": "Mantenimiento preventivo"})["data"]
    reloaded = {b["id"]: b for b in call("GET", path)["data"]}
    assert len(reloaded) == 3
    assert all(reloaded[bid] == doc for bid, doc in first_two.items())
    assert call("GET", path)["totals"] == {"paidAmount": 0, "totalBudgeted": 0, "balance": 0}

    # Accepted budgets stay read-only; each committed plan is counted once.
    for budget in (b1, b3):
        call("PUT", path + "/" + budget["id"] + "/present")
        call("PUT", path + "/" + budget["id"] + "/accept")
    locked = db.budgets.find_one({"id": b1["id"]})
    call("PATCH", path + "/" + b1["id"], plan, status=409)
    assert db.budgets.find_one({"id": b1["id"]}) == locked
    totals = call("GET", path)["totals"]
    assert totals == {"paidAmount": 0, "totalBudgeted": 4200, "balance": 4200}
    call("POST", f"/patients/{pid}/payments", {"amount": 300, "method": "Efectivo", "concept": "Anticipo"})
    assert call("GET", path)["totals"] == {"paidAmount": 300, "totalBudgeted": 4200, "balance": 3900}
    b4 = call("POST", path, {**plan, "name": "Propuesta complementaria"})["data"]
    assert b4["status"] == "DRAFT"
    assert call("GET", f"/patients/{pid}/detail")["data"]["balance"] == 3900
    call("PUT", path + "/" + b3["id"] + "/finalize")
    call("PATCH", path + "/" + b3["id"], plan, status=409)
    assert call("GET", path)["totals"]["balance"] == 3900
    call("PATCH", f"/patients/{pid + 100000}/budgets/{b1['id']}", plan, status=404)
    assert db.payments.count_documents({"patientId": pid}) == 1
    for doc in history:
        assert db.budgets.find_one({"_id": doc["_id"]}) == doc
    for doc in payments_before:
        assert db.payments.find_one({"_id": doc["_id"]}) == doc
    print(f"Verified local patient {pid}: distinct budgets, persistence, locked states, balance and unchanged history")
    client.close()

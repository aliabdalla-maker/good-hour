"""Account and customer deletion must work with foreign keys enforced (PostgreSQL in production)."""
import os

from app.config import get_settings
from tests.conftest import signup
from tests.test_crm_agent import _seed


def _staff(client, b):
    r = client.post("/v1/auth/register", json={"email": "s@example.com", "password": "correct-horse-1", "full_name": "S"})
    hs = {"Authorization": f"Bearer {r.json()['access_token']}"}
    client.post("/v1/businesses/join", json={"join_code": b["join_code"]}, headers=hs)
    return {**hs, "X-Business-Id": b["id"]}


def test_sole_owner_deletion_removes_workspace_and_files(client):
    h, _ = signup(client)
    cid = _seed(client, h)
    client.post(f"/v1/crm/customers/{cid}/notes", json={"body": "note"}, headers=h)
    client.post("/v1/assistant/chat", json={"message": f"invoice customer {cid} for 1 x wid-1"}, headers=h)
    client.post("/v1/assistant/chat", json={"message": f"send email to customer {cid} subject Hi body Ready"}, headers=h)
    fid = client.post("/v1/files", files={"file": ("a.txt", b"secret", "text/plain")}, headers=h).json()["id"]
    storage = get_settings().storage_dir
    before = sum(len(f) for _, _, f in os.walk(storage))
    assert before >= 1
    assert client.delete("/v1/auth/me", headers=h).status_code == 204
    assert sum(len(f) for _, _, f in os.walk(storage)) == before - 1
    # the email can be registered again from scratch
    h2, _ = signup(client)
    assert client.get("/v1/crm/customers", headers=h2).json() == []
    assert client.get(f"/v1/files/{fid}/download", headers=h2).status_code == 404


def test_staff_deletion_keeps_shared_records(client):
    h, b = signup(client)
    hs = _staff(client, b)
    cid = client.post("/v1/crm/customers", json={"name": "Shared C"}, headers=hs).json()["id"]
    client.post(f"/v1/crm/customers/{cid}/notes", json={"body": "by staff"}, headers=hs)
    client.post("/v1/files", files={"file": ("s.txt", b"staff file", "text/plain")}, headers=hs)
    client.post("/v1/assistant/chat", json={"message": "hi"}, headers=hs)
    client.post("/v1/assistant/chat", json={"message": f"send email to customer {cid} subject Hi body Ready"},
                headers=hs)
    assert client.delete("/v1/auth/me", headers=hs).status_code == 204
    assert client.get(f"/v1/crm/customers/{cid}", headers=h).status_code == 200
    assert len(client.get("/v1/files", headers=h).json()) == 1


def test_customer_with_invoice_cannot_be_deleted(client, owner):
    h, _ = owner
    cid = _seed(client, h)
    client.post("/v1/assistant/chat", json={"message": f"invoice customer {cid} for 1 x wid-1"}, headers=h)
    assert client.delete(f"/v1/crm/customers/{cid}", headers=h).status_code == 409
    plain = client.post("/v1/crm/customers", json={"name": "No invoices"}, headers=h).json()["id"]
    client.post(f"/v1/crm/customers/{plain}/notes", json={"body": "n"}, headers=h)
    assert client.delete(f"/v1/crm/customers/{plain}", headers=h).status_code == 204

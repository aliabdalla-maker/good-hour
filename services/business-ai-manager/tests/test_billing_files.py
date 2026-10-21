from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Entitlement
from tests.conftest import signup


def test_new_business_gets_30_day_trial_with_ads(client, owner):
    h, _ = owner
    s = client.get("/v1/billing/status", headers=h).json()
    assert s["state"] == "trial" and s["show_ads"] is True and s["has_access"] is True
    assert s["trial_days_left"] in (29, 30)
    assert "£4.99/month after the one-month free trial" == s["price_display"]


def test_second_business_no_second_trial(client, owner):
    h, _ = owner
    b2 = client.post("/v1/businesses", json={"name": "Second"}, headers={"Authorization": h["Authorization"]}).json()
    s = client.get("/v1/billing/status", headers={**h, "X-Business-Id": b2["id"]}).json()
    assert s["state"] == "expired"


def _expire(bid):
    with SessionLocal() as db:
        e = db.scalar(select(Entitlement).where(Entitlement.business_id == bid))
        e.trial_ends_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()


def test_expired_trial_blocks_ai_until_verified_purchase(client, owner):
    h, b = owner
    _expire(b["id"])
    assert client.post("/v1/assistant/chat", json={"message": "hi"}, headers=h).status_code == 402
    bad = client.post("/v1/billing/verify", json={"purchase_token": "test-expired-123", "product_id": "sme_ai_manager_monthly"}, headers=h).json()
    assert bad["verified"] is False and bad["has_access"] is False
    ok = client.post("/v1/billing/verify", json={"purchase_token": "test-active-123", "product_id": "sme_ai_manager_monthly"}, headers=h).json()
    assert ok["state"] == "active" and ok["show_ads"] is False
    assert client.post("/v1/assistant/chat", json={"message": "hi"}, headers=h).status_code == 200


def test_purchase_token_cannot_unlock_two_tenants(client):
    h1, _ = signup(client, "a@example.com", "A")
    h2, _ = signup(client, "b@example.com", "B")
    body = {"purchase_token": "test-active-shared", "product_id": "sme_ai_manager_monthly"}
    assert client.post("/v1/billing/verify", json=body, headers=h1).status_code == 200
    assert client.post("/v1/billing/verify", json=body, headers=h2).status_code == 409


def test_wrong_product_rejected(client, owner):
    h, _ = owner
    assert client.post("/v1/billing/verify", json={"purchase_token": "test-active-1", "product_id": "other"},
                       headers=h).status_code == 400


def test_quota_enforced(client, owner, monkeypatch):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "quota_trial_llm_requests", 1)
    h, _ = owner
    assert client.post("/v1/assistant/chat", json={"message": "hi"}, headers=h).status_code == 200
    assert client.post("/v1/assistant/chat", json={"message": "hi"}, headers=h).status_code == 402


def test_file_upload_validation_and_download(client, owner):
    h, _ = owner
    r = client.post("/v1/files", files={"file": ("notes.txt", b"hello world", "text/plain")}, headers=h)
    assert r.status_code == 201
    fid = r.json()["id"]
    assert client.get(f"/v1/files/{fid}/text", headers=h).json()["text"] == "hello world"
    assert client.get(f"/v1/files/{fid}/download", headers=h).content == b"hello world"
    # spoofed type, unsupported type, empty file
    assert client.post("/v1/files", files={"file": ("x.pdf", b"MZ\x90\x00", "application/pdf")}, headers=h).status_code == 400
    assert client.post("/v1/files", files={"file": ("x.exe", b"MZ", "application/x-msdownload")}, headers=h).status_code == 415
    assert client.post("/v1/files", files={"file": ("e.txt", b"", "text/plain")}, headers=h).status_code == 400


def test_file_tenant_isolation(client):
    h1, _ = signup(client, "a@example.com", "A")
    h2, _ = signup(client, "b@example.com", "B")
    fid = client.post("/v1/files", files={"file": ("a.txt", b"secret", "text/plain")}, headers=h1).json()["id"]
    assert client.get(f"/v1/files/{fid}/download", headers=h2).status_code == 404


def test_dashboard_and_csv(client, owner):
    h, _ = owner
    d = client.get("/v1/dashboard", headers=h).json()
    assert d["has_data"] is False and d["subscription"]["state"] == "trial"
    assert client.get("/v1/finance/invoices.csv", headers=h).text.startswith("number,")


def test_app_ads_txt(client):
    assert "pub-2980680946304710" in client.get("/app-ads.txt").text

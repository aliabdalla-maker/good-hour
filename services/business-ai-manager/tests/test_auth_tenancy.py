from tests.conftest import signup


def test_register_login_me(client):
    h, _ = signup(client)
    assert client.get("/v1/auth/me", headers=h).json()["businesses"][0]["role"] == "owner"
    r = client.post("/v1/auth/login", json={"email": "owner@example.com", "password": "correct-horse-1"})
    assert r.status_code == 200
    assert client.post("/v1/auth/login", json={"email": "owner@example.com", "password": "wrong-pass-123"}).status_code == 401


def test_duplicate_email_and_weak_password(client):
    signup(client)
    assert client.post("/v1/auth/register", json={"email": "owner@example.com", "password": "correct-horse-1",
                                                  "full_name": "x"}).status_code == 409
    assert client.post("/v1/auth/register", json={"email": "n@example.com", "password": "short",
                                                  "full_name": "x"}).status_code == 422


def test_unauthenticated_rejected(client):
    assert client.get("/v1/crm/customers", headers={"X-Business-Id": "x"}).status_code == 401


def test_tenant_isolation(client):
    h1, _ = signup(client, "a@example.com", "A Ltd")
    h2, b2 = signup(client, "b@example.com", "B Ltd")
    cid = client.post("/v1/crm/customers", json={"name": "Secret Customer"}, headers=h1).json()["id"]
    # B cannot read A's customer, even by id
    assert client.get(f"/v1/crm/customers/{cid}", headers=h2).status_code == 404
    assert client.get("/v1/crm/customers", headers=h2).json() == []
    # A cannot act inside B's business by spoofing the header
    spoof = {**h1, "X-Business-Id": b2["id"]}
    assert client.get("/v1/crm/customers", headers=spoof).status_code == 403


def test_join_code_gives_staff_role_and_permissions(client):
    h, b = signup(client)
    r = client.post("/v1/auth/register", json={"email": "s@example.com", "password": "correct-horse-1", "full_name": "S"})
    hs = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.post("/v1/businesses/join", json={"join_code": b["join_code"]}, headers=hs).json()["role"] == "staff"
    hs["X-Business-Id"] = b["id"]
    cid = client.post("/v1/crm/customers", json={"name": "C"}, headers=hs).json()["id"]
    assert client.delete(f"/v1/crm/customers/{cid}", headers=hs).status_code == 403
    assert client.delete(f"/v1/crm/customers/{cid}", headers=h).status_code == 204


def test_language_and_account_deletion(client):
    h, _ = signup(client)
    client.post("/v1/crm/customers", json={"name": "C"}, headers=h)
    client.post("/v1/assistant/chat", json={"message": "hi"}, headers=h)
    assert client.patch("/v1/auth/me", json={"preferred_language": "ar"}, headers=h).json()["preferred_language"] == "ar"
    assert client.delete("/v1/auth/me", headers=h).status_code == 204
    assert client.get("/v1/auth/me", headers=h).status_code == 401
    assert client.post("/v1/auth/login", json={"email": "owner@example.com", "password": "correct-horse-1"}).status_code == 401

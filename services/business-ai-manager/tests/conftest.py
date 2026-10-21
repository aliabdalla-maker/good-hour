import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["STORAGE_DIR"] = f"{_tmp}/storage"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["RATE_LIMIT_PER_MINUTE"] = "1000"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


def signup(client, email="owner@example.com", business="Acme Ltd"):
    r = client.post("/v1/auth/register", json={"email": email, "password": "correct-horse-1", "full_name": "Owner"})
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    b = client.post("/v1/businesses", json={"name": business}, headers=h)
    assert b.status_code == 201, b.text
    return {**h, "X-Business-Id": b.json()["id"]}, b.json()


@pytest.fixture()
def owner(client):
    return signup(client)

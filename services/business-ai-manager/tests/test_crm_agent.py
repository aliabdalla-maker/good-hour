from app.llm.base import LLMError
from app.llm.gateway import set_provider_override


def _seed(client, h):
    cid = client.post("/v1/crm/customers", json={"name": "Jane Buyer", "email": "jane@example.com"}, headers=h).json()["id"]
    client.post("/v1/crm/products", json={"sku": "WID-1", "name": "Widget", "unit_price": 12.5, "stock_qty": 3,
                                          "reorder_level": 5}, headers=h)
    return cid


def test_crm_crud_and_search(client, owner):
    h, _ = owner
    cid = _seed(client, h)
    assert client.get("/v1/crm/customers?q=jane", headers=h).json()[0]["id"] == cid
    assert client.post(f"/v1/crm/customers/{cid}/notes", json={"body": "Called"}, headers=h).status_code == 201
    assert client.get(f"/v1/crm/customers/{cid}", headers=h).json()["notes"][0]["body"] == "Called"


def test_agent_reads_verified_stock(client, owner):
    h, _ = owner
    _seed(client, h)
    r = client.post("/v1/assistant/chat", json={"message": "What is the stock of wid-1?"}, headers=h).json()
    step = r["steps"][0]
    assert step["tool"] == "check_stock" and step["result"]["stock_qty"] == 3
    assert r["pending_approvals"] == []


def test_agent_invoice_is_deterministic(client, owner):
    h, _ = owner
    cid = _seed(client, h)
    r = client.post("/v1/assistant/chat", json={"message": f"invoice customer {cid} for 4 x wid-1"}, headers=h).json()
    res = r["steps"][0]["result"]
    assert res["subtotal"] == "50.00" and res["vat"] == "10.00" and res["total"] == "60.00"
    assert res["status"] == "draft"


def test_unknown_sku_is_not_invented(client, owner):
    h, _ = owner
    cid = _seed(client, h)
    r = client.post("/v1/assistant/chat", json={"message": f"invoice customer {cid} for 1 x nope-9"}, headers=h).json()
    assert r["steps"][0]["result"]["ok"] is False


def test_send_email_requires_approval_and_is_idempotent(client, owner):
    h, _ = owner
    cid = _seed(client, h)
    msg = f"send email to customer {cid} subject Hello body Your order is ready"
    r = client.post("/v1/assistant/chat", json={"message": msg}, headers=h).json()
    assert r["steps"][0]["result"]["status"] == "awaiting_human_approval"
    aid = r["pending_approvals"][0]["approval_id"]
    r2 = client.post("/v1/assistant/chat", json={"message": msg}, headers=h).json()
    assert r2["steps"][0]["result"]["approval_id"] == aid  # no duplicate action
    assert len(client.get("/v1/approvals", headers=h).json()) == 1
    d = client.post(f"/v1/approvals/{aid}/decision", json={"approve": True}, headers=h).json()
    assert d["status"] == "executed" and d["result"]["delivery_confirmed"] is False
    assert client.post(f"/v1/approvals/{aid}/decision", json={"approve": True}, headers=h).status_code == 409


def test_rejected_approval_not_executed(client, owner):
    h, _ = owner
    cid = _seed(client, h)
    r = client.post("/v1/assistant/chat", json={"message": f"send email to customer {cid} subject A body B"},
                    headers=h).json()
    aid = r["pending_approvals"][0]["approval_id"]
    assert client.post(f"/v1/approvals/{aid}/decision", json={"approve": False}, headers=h).json()["status"] == "rejected"


def test_agent_cannot_touch_other_tenant(client):
    from tests.conftest import signup
    h1, _ = signup(client, "a@example.com", "A")
    h2, _ = signup(client, "b@example.com", "B")
    cid = client.post("/v1/crm/customers", json={"name": "X", "email": "x@example.com"}, headers=h1).json()["id"]
    r = client.post("/v1/assistant/chat", json={"message": f"send email to customer {cid} subject s body b"},
                    headers=h2).json()
    aid = r["pending_approvals"][0]["approval_id"]
    d = client.post(f"/v1/approvals/{aid}/decision", json={"approve": True}, headers=h2).json()
    assert d["status"] == "failed"


def test_llm_timeout_handled(client, owner):
    class Broken:
        name = "anthropic"

        def complete(self, *a):
            raise LLMError("timeout")
    set_provider_override(Broken())
    try:
        h, _ = owner
        r = client.post("/v1/assistant/chat", json={"message": "hi"}, headers=h)
        assert r.status_code == 200 and "temporarily unavailable" in r.json()["reply"]
    finally:
        set_provider_override(None)


def test_malformed_tool_args_rejected(client, owner):
    from app.llm.base import LLMResult, ToolCall
    from app.llm.mock import MockProvider

    class Bad(MockProvider):
        calls = 0

        def complete(self, system, messages, tools):
            Bad.calls += 1
            if Bad.calls == 1:
                return LLMResult("", [ToolCall("t1", "check_stock", {"sku": ""})], stop_reason="tool_use")
            return LLMResult("done")
    set_provider_override(Bad())
    try:
        h, _ = owner
        r = client.post("/v1/assistant/chat", json={"message": "x"}, headers=h).json()
        assert r["steps"][0]["result"]["error"] == "Invalid arguments"
    finally:
        set_provider_override(None)


def test_claude_provider_message_shapes(monkeypatch):
    """Offline check of the Claude adapter against SDK response objects (no network)."""
    import anthropic
    from anthropic.types import Message, TextBlock, ToolUseBlock, Usage

    from app.config import get_settings
    from app.llm.base import ToolSpec
    from app.llm.claude import ClaudeProvider
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "sk-test")
    msg = Message(id="m", type="message", role="assistant", model="x", stop_reason="tool_use",
                  content=[TextBlock(type="text", text="Checking"),
                           ToolUseBlock(type="tool_use", id="tu1", name="check_stock", input={"sku": "A"})],
                  usage=Usage(input_tokens=10, output_tokens=5))
    seen = {}

    def fake_create(**kw):
        seen.update(kw)
        return msg
    p = ClaudeProvider()
    monkeypatch.setattr(p._client.messages, "create", fake_create)
    r = p.complete("sys", [{"role": "user", "content": "hi"}], [ToolSpec("check_stock", "d", {"type": "object"})])
    assert r.tool_calls[0].arguments == {"sku": "A"} and r.input_tokens == 10
    assert seen["tools"][0]["name"] == "check_stock"
    am = p.assistant_message(r)
    assert am["content"][1] == {"type": "tool_use", "id": "tu1", "name": "check_stock", "input": {"sku": "A"}}
    tr = p.tool_result_message([(r.tool_calls[0], {"ok": True})])
    assert tr["content"][0]["tool_use_id"] == "tu1"
    assert isinstance(anthropic.APIError, type)

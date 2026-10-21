"""Deterministic offline provider for development and automated tests (no API key, no cost).
It maps a few phrases to tool calls so the full agent loop can be exercised end to end."""
import json
import re
import uuid

from .base import LLMResult, ToolCall, ToolSpec


class MockProvider:
    name = "mock"

    def complete(self, system: str, messages: list[dict], tools: list[ToolSpec]) -> LLMResult:
        last = messages[-1]
        if isinstance(last["content"], list) and last["content"] and last["content"][0].get("type") == "tool_result":
            results = [json.loads(b["content"]) for b in last["content"]]
            return LLMResult(text="[mock] Tool results: " + json.dumps(results, default=str)[:1500],
                             input_tokens=50, output_tokens=40)
        text = last["content"] if isinstance(last["content"], str) else ""
        low = text.lower()
        names = {t.name for t in tools}
        call = None
        if m := re.search(r"stock (?:of|for) ([\w-]+)", low):
            call = ("check_stock", {"sku": m.group(1).upper()})
        elif "low stock" in low:
            call = ("list_low_stock", {})
        elif m := re.search(r"find customer (.+)", low):
            call = ("search_customers", {"query": m.group(1).strip()})
        elif m := re.search(r"not purchased in (?:the )?last (\d+) days", low):
            call = ("list_inactive_customers", {"days": int(m.group(1))})
        elif m := re.search(r"send email to customer (\w+) subject (.+?) body (.+)", text, re.I):
            call = ("send_email", {"customer_id": m.group(1), "subject": m.group(2), "body": m.group(3)})
        elif m := re.search(r"invoice customer (\w+) for (\d+) x ([\w-]+)", text, re.I):
            call = ("draft_invoice", {"customer_id": m.group(1),
                                      "lines": [{"sku": m.group(3).upper(), "quantity": int(m.group(2))}]})
        if call and call[0] in names:
            return LLMResult(text="", tool_calls=[ToolCall("toolu_" + uuid.uuid4().hex[:12], *call)],
                             input_tokens=60, output_tokens=20, stop_reason="tool_use",
                             raw_content=[{"type": "tool_use", "id": "x", "name": call[0], "input": call[1]}])
        return LLMResult(text=f"[mock assistant] You said: {text[:500]}", input_tokens=30, output_tokens=15)

    def assistant_message(self, result: LLMResult) -> dict:
        return {"role": "assistant", "content": result.raw_content or result.text}

    def tool_result_message(self, results: list[tuple[ToolCall, dict]]) -> dict:
        return {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": c.id, "content": json.dumps(r, default=str)} for c, r in results]}

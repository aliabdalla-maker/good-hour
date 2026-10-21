import json

import anthropic

from ..config import get_settings
from .base import LLMError, LLMResult, ToolCall, ToolSpec


def _block(b) -> dict:
    """Replay only the fields the Messages API accepts on input."""
    if b.type == "tool_use":
        return {"type": "tool_use", "id": b.id, "name": b.name, "input": b.input}
    if b.type == "text":
        return {"type": "text", "text": b.text}
    return b.model_dump(exclude_none=True)


class ClaudeProvider:
    name = "anthropic"

    def __init__(self) -> None:
        s = get_settings()
        if not s.anthropic_api_key:
            raise LLMError("ANTHROPIC_API_KEY is not configured on the server")
        self._client = anthropic.Anthropic(api_key=s.anthropic_api_key, timeout=s.llm_timeout_seconds,
                                           max_retries=2)
        self._model = s.anthropic_model
        self._max = s.llm_max_output_tokens

    def complete(self, system: str, messages: list[dict], tools: list[ToolSpec]) -> LLMResult:
        try:
            r = self._client.messages.create(
                model=self._model, max_tokens=self._max, system=system, messages=messages,
                tools=[{"name": t.name, "description": t.description, "input_schema": t.input_schema}
                       for t in tools])
        except anthropic.APIError as e:  # timeouts, rate limits, 5xx
            raise LLMError(f"LLM provider error: {e.__class__.__name__}") from e
        text = "".join(b.text for b in r.content if b.type == "text")
        calls = [ToolCall(b.id, b.name, dict(b.input)) for b in r.content if b.type == "tool_use"]
        return LLMResult(text=text, tool_calls=calls, input_tokens=r.usage.input_tokens,
                         output_tokens=r.usage.output_tokens, stop_reason=r.stop_reason or "end_turn",
                         raw_content=[_block(b) for b in r.content])

    def assistant_message(self, result: LLMResult) -> dict:
        return {"role": "assistant", "content": result.raw_content}

    def tool_result_message(self, results: list[tuple[ToolCall, dict]]) -> dict:
        return {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": c.id, "content": json.dumps(res, default=str),
             "is_error": not res.get("ok", True)} for c, res in results]}

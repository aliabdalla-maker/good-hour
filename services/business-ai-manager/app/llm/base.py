"""Provider-independent LLM interface. Add OpenAI/Gemini/etc. by implementing LLMProvider."""
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class ToolSpec:
    name: str
    description: str
    input_schema: dict


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass
class LLMResult:
    text: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    stop_reason: str = "end_turn"
    raw_content: Any = None  # provider-native assistant content, replayed on the next turn


class LLMError(Exception):
    pass


class LLMProvider(Protocol):
    name: str

    def complete(self, system: str, messages: list[dict], tools: list[ToolSpec]) -> LLMResult: ...

    def tool_result_message(self, results: list[tuple[ToolCall, dict]]) -> dict: ...

    def assistant_message(self, result: LLMResult) -> dict: ...

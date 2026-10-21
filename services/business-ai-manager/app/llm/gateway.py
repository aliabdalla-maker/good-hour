from ..config import get_settings
from .base import LLMProvider
from .mock import MockProvider

_override: LLMProvider | None = None


def set_provider_override(p: LLMProvider | None) -> None:
    """Used by tests to inject a provider."""
    global _override
    _override = p


def get_provider() -> LLMProvider:
    if _override is not None:
        return _override
    if get_settings().llm_provider == "anthropic":
        from .claude import ClaudeProvider
        return ClaudeProvider()
    return MockProvider()

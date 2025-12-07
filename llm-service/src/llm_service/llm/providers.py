"""
Provider configurations and model definitions.

This module defines:
- Available LLM providers
- Model configurations with capabilities
- Provider-specific settings
"""

from dataclasses import dataclass
from typing import Literal

from llm_service.llm.schemas import ModelInfo


ProviderType = Literal["xai", "openai", "anthropic", "google"]


@dataclass
class ProviderConfig:
    """Configuration for an LLM provider."""

    name: str
    env_key: str
    base_url: str | None = None


# Provider configurations
PROVIDERS: dict[ProviderType, ProviderConfig] = {
    "xai": ProviderConfig(
        name="xAI",
        env_key="XAI_API_KEY",
        base_url="https://api.x.ai/v1",
    ),
    "openai": ProviderConfig(
        name="OpenAI",
        env_key="OPENAI_API_KEY",
    ),
    "anthropic": ProviderConfig(
        name="Anthropic",
        env_key="ANTHROPIC_API_KEY",
    ),
    "google": ProviderConfig(
        name="Google",
        env_key="GOOGLE_API_KEY",
    ),
}


# Available models with their capabilities (Updated December 2025)
AVAILABLE_MODELS: list[ModelInfo] = [
    # ==========================================================================
    # xAI Models (Latest: Grok 4.1 - December 2025)
    # ==========================================================================
    ModelInfo(
        id="xai/grok-4-1-fast-reasoning",
        provider="xai",
        name="Grok 4.1 Fast (Reasoning)",
        supports_tools=True,
        supports_web_search=True,
        supports_vision=True,
    ),
    # ==========================================================================
    # OpenAI Models (Latest: GPT-5.1 - December 2025)
    # ==========================================================================
    ModelInfo(
        id="gpt-5.1",
        provider="openai",
        name="GPT-5.1",
        supports_tools=True,
        supports_web_search=False,
        supports_vision=True,
    ),
    # ==========================================================================
    # Anthropic Models (Latest: Claude Opus 4.5 - December 2025)
    # ==========================================================================
    ModelInfo(
        id="anthropic/claude-opus-4-5-20251101",
        provider="anthropic",
        name="Claude Opus 4.5",
        supports_tools=True,
        supports_web_search=True,
        supports_vision=True,
    ),
    # ==========================================================================
    # Google Models (Latest: Gemini 3 Pro - December 2025)
    # ==========================================================================
    ModelInfo(
        id="gemini/gemini-3-pro-preview",
        provider="google",
        name="Gemini 3 Pro",
        supports_tools=True,
        supports_web_search=True,
        supports_vision=True,
    ),
]


def get_model_info(model_id: str) -> ModelInfo | None:
    """
    Get model information by ID.

    Args:
        model_id: The model identifier

    Returns:
        ModelInfo if found, None otherwise
    """
    for model in AVAILABLE_MODELS:
        if model.id == model_id:
            return model
    return None


def get_provider_for_model(model_id: str) -> ProviderType | None:
    """
    Determine the provider for a given model ID.

    LiteLLM model naming conventions:
    - xAI: "xai/<model>" (e.g., xai/grok-2-latest) or "grok-*"
    - Anthropic: "anthropic/<model>" (e.g., anthropic/claude-sonnet-4-20250514) or "claude-*"
    - Google: "gemini/<model>" (e.g., gemini/gemini-2.0-flash) or "gemini-*"
    - OpenAI: "openai/<model>" or direct name (e.g., gpt-4o, gpt-5.1)

    Args:
        model_id: The model identifier

    Returns:
        Provider type if recognized, None otherwise
    """
    model_info = get_model_info(model_id)
    if model_info:
        return model_info.provider  # type: ignore

    # Normalize to lowercase for matching
    model_lower = model_id.lower()

    # xAI: xai/ prefix or grok models
    if model_lower.startswith("xai/") or model_lower.startswith("grok"):
        return "xai"

    # Anthropic: anthropic/ prefix or claude models
    if model_lower.startswith("anthropic/") or model_lower.startswith("claude"):
        return "anthropic"

    # Google: gemini/ prefix or gemini-* models
    if model_lower.startswith("gemini/") or model_lower.startswith("gemini"):
        return "google"

    # OpenAI: openai/ prefix or gpt/o1/o3 models
    if (
        model_lower.startswith("openai/")
        or model_lower.startswith("gpt-")
        or model_lower.startswith("gpt-4")
        or model_lower.startswith("gpt-5")
        or model_lower.startswith("o1")
        or model_lower.startswith("o3")
    ):
        return "openai"

    return None


def list_available_models(provider: ProviderType | None = None) -> list[ModelInfo]:
    """
    List available models, optionally filtered by provider.

    Args:
        provider: Optional provider to filter by

    Returns:
        List of available models
    """
    if provider is None:
        return AVAILABLE_MODELS

    return [m for m in AVAILABLE_MODELS if m.provider == provider]


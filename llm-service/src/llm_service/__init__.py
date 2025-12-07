"""
LLM Service - Multi-provider LLM service using LiteLLM.

This package provides a FastAPI-based service for accessing multiple LLM providers
through a unified API interface.

Supported providers:
- xAI (Grok): Web search, X search, tools
- OpenAI (GPT): Tools, vision
- Anthropic (Claude): Tools, vision, web search
- Google (Gemini): Tools, vision
"""

from llm_service.main import main

__version__ = "0.1.0"
__all__ = ["main", "__version__"]

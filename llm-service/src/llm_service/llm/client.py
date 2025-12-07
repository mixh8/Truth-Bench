"""
LLM Client wrapper using LiteLLM for multi-provider support.

This module provides:
- Unified interface for multiple LLM providers
- Web search support (xAI, OpenAI, Anthropic)
- X search support (xAI models only via native SDK)
- Tool/function calling
- Streaming support
- Comprehensive logging
"""

import asyncio
import json
import logging
import os
import uuid
from collections.abc import AsyncGenerator, Generator
from typing import Any

import litellm
from litellm import acompletion, aresponses, completion, responses

# xAI SDK for native X search support
from xai_sdk import Client as XaiClient
from xai_sdk.chat import system as xai_system
from xai_sdk.chat import user as xai_user
from xai_sdk.tools import x_search as xai_x_search

from llm_service.config import Settings, get_logger
from llm_service.llm.providers import get_model_info, get_provider_for_model
from llm_service.llm.schemas import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    ResponseMessage,
    ToolCall,
    Usage,
)


class LLMClient:
    """
    Unified LLM client supporting multiple providers via LiteLLM.

    Supports:
    - xAI (Grok): Web search, X search, tools
    - OpenAI (GPT): Tools, vision
    - Anthropic (Claude): Tools, vision, web search
    - Google (Gemini): Tools, vision
    """

    def __init__(self, settings: Settings) -> None:
        """
        Initialize the LLM client.

        Args:
            settings: Application settings with API keys
        """
        self.settings = settings
        self.logger = get_logger("llm_service.llm.client")

        # Configure API keys in environment for LiteLLM
        self._configure_api_keys()

        # Configure LiteLLM settings
        litellm.drop_params = True  # Drop unsupported params instead of erroring
        litellm.set_verbose = settings.log_level == "DEBUG"

        self.logger.info(
            "LLMClient initialized",
            extra={"default_model": settings.default_model},
        )

    def _configure_api_keys(self) -> None:
        """Set API keys in environment for LiteLLM to use."""
        if self.settings.xai_api_key:
            os.environ["XAI_API_KEY"] = self.settings.xai_api_key
            self.logger.debug("XAI API key configured")

        if self.settings.openai_api_key:
            os.environ["OPENAI_API_KEY"] = self.settings.openai_api_key
            self.logger.debug("OpenAI API key configured")

        if self.settings.anthropic_api_key:
            os.environ["ANTHROPIC_API_KEY"] = self.settings.anthropic_api_key
            self.logger.debug("Anthropic API key configured")

        if self.settings.google_api_key:
            os.environ["GOOGLE_API_KEY"] = self.settings.google_api_key
            self.logger.debug("Google API key configured")
        else:
            self.logger.warning("Google API key missing; Gemini calls will fail")

    def _normalize_model_name(self, model: str) -> str:
        """
        Normalize model name to include required provider prefix for LiteLLM.

        LiteLLM requires specific prefixes for certain providers:
        - Google Gemini: gemini/gemini-* (e.g., gemini/gemini-2.0-flash)
        - xAI: xai/grok-* (e.g., xai/grok-3)
        - OpenAI: works with or without prefix (gpt-*, o1-*, o3-*)
        - Anthropic: works with or without prefix (claude-*)

        Args:
            model: Original model identifier

        Returns:
            Normalized model name with required prefix
        """
        model_lower = model.lower()

        # Gemini models require gemini/ prefix
        if model_lower.startswith("gemini") and not model_lower.startswith("gemini/"):
            normalized = f"gemini/{model}"
            self.logger.debug(
                "Auto-prefixed model name",
                extra={"original": model, "normalized": normalized},
            )
            return normalized

        # Grok models require xai/ prefix
        if model_lower.startswith("grok") and not model_lower.startswith("xai/"):
            normalized = f"xai/{model}"
            self.logger.debug(
                "Auto-prefixed model name",
                extra={"original": model, "normalized": normalized},
            )
            return normalized

        return model

    def _build_messages(
        self, messages: list[ChatMessage]
    ) -> list[dict[str, Any]]:
        """
        Convert ChatMessage objects to LiteLLM format.

        Args:
            messages: List of ChatMessage objects

        Returns:
            List of message dicts for LiteLLM
        """
        result = []
        for msg in messages:
            message_dict: dict[str, Any] = {
                "role": msg.role,
                "content": msg.content,
            }
            if msg.name:
                message_dict["name"] = msg.name
            if msg.tool_call_id:
                message_dict["tool_call_id"] = msg.tool_call_id
            result.append(message_dict)
        return result

    def _build_tools(
        self, request: ChatRequest
    ) -> list[dict[str, Any]] | None:
        """
        Convert tool definitions to LiteLLM format.

        Args:
            request: Chat request containing tools

        Returns:
            List of tool dicts or None
        """
        if not request.tools:
            return None

        tools = []
        for tool in request.tools:
            tools.append({
                "type": tool.type,
                "function": {
                    "name": tool.function.name,
                    "description": tool.function.description,
                    "parameters": tool.function.parameters,
                },
            })
        return tools

    def _build_completion_kwargs(self, request: ChatRequest) -> dict[str, Any]:
        """
        Build keyword arguments for LiteLLM completion call.

        Args:
            request: Chat request

        Returns:
            Dict of kwargs for completion()
        """
        # Normalize model name to include required provider prefix
        normalized_model = self._normalize_model_name(request.model)

        kwargs: dict[str, Any] = {
            "model": normalized_model,
            "messages": self._build_messages(request.messages),
        }

        # Add optional parameters
        if request.temperature is not None:
            kwargs["temperature"] = request.temperature
        if request.max_tokens is not None:
            kwargs["max_tokens"] = request.max_tokens
        if request.top_p is not None:
            kwargs["top_p"] = request.top_p

        # Add tools if provided
        tools = self._build_tools(request)
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = request.tool_choice or "auto"

        # Add provider-specific web search if enabled
        if request.web_search:
            provider = get_provider_for_model(request.model)
            self._add_web_search_for_provider(kwargs, request, provider)

        return kwargs

    def _add_web_search_for_provider(
        self,
        kwargs: dict[str, Any],
        request: ChatRequest,
        provider: str | None,
    ) -> None:
        """
        Add provider-specific web search configuration to completion kwargs.

        Each provider has different web search implementations:
        - xAI: web_search_options parameter
        - OpenAI: web_search_preview tool in tools array
        - Anthropic: web_search_20250305 tool with domain filtering
        - Google: google_search_retrieval grounding tool

        Args:
            kwargs: Completion kwargs to modify
            request: Original chat request
            provider: Provider identifier
        """
        if provider == "xai":
            self._add_xai_web_search(kwargs, request)
        elif provider == "openai":
            self._add_openai_web_search(kwargs, request)
        elif provider == "anthropic":
            self._add_anthropic_web_search(kwargs, request)
        elif provider == "google":
            self._add_google_web_search(kwargs, request)
        else:
            self.logger.warning(
                "Web search requested but provider not supported",
                extra={"provider": provider, "model": request.model},
            )

    def _add_xai_web_search(
        self, kwargs: dict[str, Any], request: ChatRequest
    ) -> None:
        """Add xAI web search via web_search_options parameter."""
        web_opts: dict[str, Any] = {"search_context_size": "medium"}
        if request.web_search_options:
            web_opts["search_context_size"] = (
                request.web_search_options.search_context_size
            )
        kwargs["web_search_options"] = web_opts
        self.logger.debug("xAI web search enabled", extra={"options": web_opts})

    def _add_openai_web_search(
        self, kwargs: dict[str, Any], request: ChatRequest
    ) -> None:
        """
        OpenAI web search is handled via Responses API, not here.

        This method is a no-op because OpenAI web search requires the
        Responses API which is handled in _openai_completion_with_web_search.
        """
        # OpenAI web search handled via Responses API in separate method
        self.logger.debug(
            "OpenAI web search will use Responses API",
            extra={"model": request.model},
        )

    async def _openai_completion_with_web_search(
        self, request: ChatRequest
    ) -> ChatResponse:
        """
        Perform chat completion using OpenAI Responses API with web search.

        OpenAI's web search feature is only available through the Responses API,
        not the standard Chat Completions API. This method uses LiteLLM's
        responses() function to access this capability.

        Args:
            request: Chat completion request with web_search enabled

        Returns:
            ChatResponse with the model's response

        Raises:
            Exception: If the completion fails
        """
        self.logger.info(
            "Starting OpenAI Responses API completion with web search",
            extra={
                "model": request.model,
                "message_count": len(request.messages),
            },
        )

        # Build input from messages
        messages_input = self._build_messages(request.messages)

        # Build web search tool configuration
        context_size = "medium"
        if request.web_search_options:
            context_size = request.web_search_options.search_context_size

        tools = [{"type": "web_search_preview", "search_context_size": context_size}]

        # Use LiteLLM's responses API
        response = await aresponses(
            model=f"openai/{request.model}" if not request.model.startswith("openai/") else request.model,
            input=messages_input,
            tools=tools,
        )

        self.logger.debug(
            "OpenAI Responses API response received",
            extra={
                "response_type": type(response).__name__,
                "has_output_text": hasattr(response, "output_text"),
                "has_output": hasattr(response, "output"),
            },
        )

        # Extract output text - LiteLLM Responses API may return in different formats
        output_text = ""
        if hasattr(response, "output_text") and response.output_text:
            output_text = response.output_text
        elif hasattr(response, "output") and response.output:
            # Handle output array format
            for item in response.output:
                if hasattr(item, "content"):
                    for content_item in item.content:
                        if hasattr(content_item, "text"):
                            output_text += content_item.text
                elif isinstance(item, dict) and "content" in item:
                    for content_item in item["content"]:
                        if isinstance(content_item, dict) and "text" in content_item:
                            output_text += content_item["text"]

        response_message = ResponseMessage(
            role="assistant",
            content=output_text,
            tool_calls=None,
        )

        # Parse usage if available
        usage = None
        if hasattr(response, "usage") and response.usage:
            usage = Usage(
                prompt_tokens=getattr(response.usage, "prompt_tokens", 0),
                completion_tokens=getattr(response.usage, "completion_tokens", 0),
                total_tokens=getattr(response.usage, "total_tokens", 0),
            )

        # Generate response ID
        response_id = getattr(response, "id", None) or f"openai-{uuid.uuid4().hex[:8]}"

        self.logger.info(
            "OpenAI Responses API completion with web search successful",
            extra={
                "model": request.model,
                "response_length": len(output_text),
            },
        )

        return ChatResponse(
            id=response_id,
            model=request.model,
            message=response_message,
            usage=usage,
            finish_reason="stop",
        )

    def _add_anthropic_web_search(
        self, kwargs: dict[str, Any], request: ChatRequest
    ) -> None:
        """
        Add Anthropic web search via web_search_20250305 tool.

        Anthropic's web search supports domain filtering and user location.
        """
        max_uses_map = {"low": 2, "medium": 5, "high": 10}
        max_uses = 5

        web_search_tool: dict[str, Any] = {
            "type": "web_search_20250305",
            "name": "web_search",
        }

        if request.web_search_options:
            max_uses = max_uses_map.get(
                request.web_search_options.search_context_size, 5
            )
            if request.web_search_options.max_uses:
                max_uses = request.web_search_options.max_uses

            if request.web_search_options.allowed_domains:
                web_search_tool["allowed_domains"] = (
                    request.web_search_options.allowed_domains
                )
            if request.web_search_options.blocked_domains:
                web_search_tool["blocked_domains"] = (
                    request.web_search_options.blocked_domains
                )

            if request.web_search_options.user_location:
                loc = request.web_search_options.user_location
                web_search_tool["user_location"] = {
                    "type": loc.type,
                    "city": loc.city,
                    "region": loc.region,
                    "country": loc.country,
                    "timezone": loc.timezone,
                }

        web_search_tool["max_uses"] = max_uses

        if "tools" not in kwargs:
            kwargs["tools"] = []
        kwargs["tools"].append(web_search_tool)
        self.logger.debug(
            "Anthropic web search enabled", extra={"max_uses": max_uses}
        )

    def _add_google_web_search(
        self, kwargs: dict[str, Any], request: ChatRequest
    ) -> None:
        """
        Add Google web search via googleSearch tool.

        LiteLLM uses camelCase 'googleSearch' and transforms to Google's snake_case.
        This enables Grounding with Google Search for Gemini models.
        """
        google_search_tool = {"googleSearch": {}}

        if "tools" not in kwargs:
            kwargs["tools"] = []
        kwargs["tools"].append(google_search_tool)
        self.logger.debug("Google Search grounding enabled")

    def _parse_response(
        self, response: Any, model: str
    ) -> ChatResponse:
        """
        Parse LiteLLM response into ChatResponse.

        Args:
            response: Raw LiteLLM response
            model: Model used for completion

        Returns:
            Parsed ChatResponse
        """
        choice = response.choices[0]
        message = choice.message

        # Parse tool calls if present
        tool_calls = None
        if hasattr(message, "tool_calls") and message.tool_calls:
            tool_calls = []
            for tc in message.tool_calls:
                tool_calls.append(
                    ToolCall(
                        id=tc.id,
                        type="function",
                        function={
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    )
                )

        # Build response message
        response_message = ResponseMessage(
            role="assistant",
            content=message.content,
            tool_calls=tool_calls,
        )

        # Parse usage
        usage = None
        if hasattr(response, "usage") and response.usage:
            usage = Usage(
                prompt_tokens=response.usage.prompt_tokens,
                completion_tokens=response.usage.completion_tokens,
                total_tokens=response.usage.total_tokens,
            )

        return ChatResponse(
            id=response.id or f"chatcmpl-{uuid.uuid4().hex[:8]}",
            model=model,
            message=response_message,
            usage=usage,
            finish_reason=choice.finish_reason,
        )

    def _should_use_xai_sdk(self, request: ChatRequest) -> bool:
        """
        Determine if we should use xAI SDK instead of LiteLLM.

        Uses xAI SDK when:
        - x_search is enabled AND
        - Model is an xAI model (grok-*)

        Args:
            request: Chat request

        Returns:
            True if should use xAI SDK
        """
        if not request.x_search:
            return False

        provider = get_provider_for_model(request.model)
        return provider == "xai"

    def _should_use_openai_responses(self, request: ChatRequest) -> bool:
        """
        Determine if we should use OpenAI Responses API for web search.

        OpenAI web search requires the Responses API, not Chat Completions.

        Args:
            request: Chat request

        Returns:
            True if should use OpenAI Responses API
        """
        if not request.web_search:
            return False

        provider = get_provider_for_model(request.model)
        return provider == "openai"

    def _get_xai_model_name(self, model: str) -> str:
        """
        Extract xAI model name from model identifier.

        Args:
            model: Model identifier (e.g., xai/grok-4-1-fast-reasoning)

        Returns:
            Model name for xAI SDK (e.g., grok-4-1-fast-reasoning)
        """
        if model.lower().startswith("xai/"):
            return model[4:]  # Remove "xai/" prefix
        return model

    async def _xai_completion_with_x_search(
        self, request: ChatRequest
    ) -> ChatResponse:
        """
        Perform chat completion using xAI SDK with native X search.

        This method uses the xAI SDK directly instead of LiteLLM to enable
        native X search capabilities that are only available through the SDK.

        Args:
            request: Chat completion request with x_search enabled

        Returns:
            ChatResponse with the model's response

        Raises:
            Exception: If the completion fails
        """
        self.logger.info(
            "Starting xAI SDK completion with X search",
            extra={
                "model": request.model,
                "message_count": len(request.messages),
                "x_search_options": request.x_search_options.model_dump()
                if request.x_search_options
                else None,
            },
        )

        # Initialize xAI async client
        xai_client = XaiClient(api_key=self.settings.xai_api_key)

        # Build X search tool configuration
        x_search_kwargs: dict[str, Any] = {}
        if request.x_search_options:
            if request.x_search_options.allowed_x_handles:
                x_search_kwargs["allowed_x_handles"] = (
                    request.x_search_options.allowed_x_handles
                )
            x_search_kwargs["enable_image_understanding"] = (
                request.x_search_options.enable_image_understanding
            )
            x_search_kwargs["enable_video_understanding"] = (
                request.x_search_options.enable_video_understanding
            )
        else:
            # Default options
            x_search_kwargs["enable_image_understanding"] = True
            x_search_kwargs["enable_video_understanding"] = True

        self.logger.debug(
            "X search tool configuration",
            extra={"x_search_kwargs": x_search_kwargs},
        )

        # Get model name for xAI SDK
        xai_model = self._get_xai_model_name(request.model)

        # Create chat with X search tool
        chat = xai_client.chat.create(
            model=xai_model,
            tools=[xai_x_search(**x_search_kwargs)],
        )

        # Append messages
        for msg in request.messages:
            if msg.role == "system":
                chat.append(xai_system(msg.content))
            elif msg.role == "user":
                chat.append(xai_user(msg.content))
            elif msg.role == "assistant" and msg.content:
                # For assistant messages, we need to handle differently
                # The xAI SDK expects response objects, not raw assistant messages
                # For simplicity in multi-turn, skip assistant messages
                pass

        # Sample response (xAI SDK uses sync sample(), run in thread for async)
        response = await asyncio.to_thread(chat.sample)

        self.logger.debug(
            "xAI SDK response received",
            extra={
                "has_content": bool(response.content),
                "has_citations": bool(getattr(response, "citations", None)),
            },
        )

        # Build response message
        response_message = ResponseMessage(
            role="assistant",
            content=response.content or "",
            tool_calls=None,  # X search is server-side, no tool_calls exposed
        )

        # Parse usage if available
        usage = None
        if hasattr(response, "usage") and response.usage:
            usage = Usage(
                prompt_tokens=getattr(response.usage, "prompt_tokens", 0),
                completion_tokens=getattr(response.usage, "completion_tokens", 0),
                total_tokens=getattr(response.usage, "total_tokens", 0),
            )

        # Generate response ID
        response_id = getattr(response, "id", None) or f"xai-{uuid.uuid4().hex[:8]}"

        self.logger.info(
            "xAI SDK completion with X search successful",
            extra={
                "model": request.model,
                "response_length": len(response.content) if response.content else 0,
            },
        )

        return ChatResponse(
            id=response_id,
            model=request.model,
            message=response_message,
            usage=usage,
            finish_reason="stop",
        )

    def chat_completion(self, request: ChatRequest) -> ChatResponse:
        """
        Perform a synchronous chat completion.

        Note: X search requires async and will raise an error if used synchronously.
        Use achat_completion() for X search support.

        Args:
            request: Chat completion request

        Returns:
            ChatResponse with the model's response

        Raises:
            ValueError: If x_search is enabled (requires async)
            Exception: If the completion fails
        """
        # X search requires async due to xAI SDK
        if self._should_use_xai_sdk(request):
            raise ValueError(
                "X search requires async. Use achat_completion() instead."
            )

        self.logger.info(
            "Starting chat completion",
            extra={
                "model": request.model,
                "message_count": len(request.messages),
                "has_tools": bool(request.tools),
                "web_search": request.web_search,
            },
        )

        try:
            kwargs = self._build_completion_kwargs(request)
            self.logger.debug("Calling LiteLLM completion", extra={"kwargs_keys": list(kwargs.keys())})

            response = completion(**kwargs)

            parsed = self._parse_response(response, request.model)

            self.logger.info(
                "Chat completion successful",
                extra={
                    "model": request.model,
                    "finish_reason": parsed.finish_reason,
                    "total_tokens": parsed.usage.total_tokens if parsed.usage else None,
                },
            )

            return parsed

        except Exception as e:
            self.logger.error(
                "Chat completion failed",
                extra={"model": request.model, "error": str(e)},
                exc_info=True,
            )
            raise

    async def achat_completion(self, request: ChatRequest) -> ChatResponse:
        """
        Perform an asynchronous chat completion.

        Routes to specialized APIs based on provider and features:
        - xAI SDK for X search
        - OpenAI Responses API for web search
        - LiteLLM for standard completion

        Args:
            request: Chat completion request

        Returns:
            ChatResponse with the model's response

        Raises:
            Exception: If the completion fails
        """
        # Route to xAI SDK for native X search support
        if self._should_use_xai_sdk(request):
            self.logger.info(
                "Routing to xAI SDK for X search",
                extra={"model": request.model},
            )
            return await self._xai_completion_with_x_search(request)

        # Route to OpenAI Responses API for web search
        if self._should_use_openai_responses(request):
            self.logger.info(
                "Routing to OpenAI Responses API for web search",
                extra={"model": request.model},
            )
            return await self._openai_completion_with_web_search(request)

        # Default: use LiteLLM
        self.logger.info(
            "Starting async chat completion via LiteLLM",
            extra={
                "model": request.model,
                "message_count": len(request.messages),
                "web_search": request.web_search,
            },
        )

        try:
            kwargs = self._build_completion_kwargs(request)

            response = await acompletion(**kwargs)

            parsed = self._parse_response(response, request.model)

            self.logger.info(
                "Async chat completion successful",
                extra={
                    "model": request.model,
                    "finish_reason": parsed.finish_reason,
                },
            )

            return parsed

        except Exception as e:
            self.logger.error(
                "Async chat completion failed",
                extra={"model": request.model, "error": str(e)},
                exc_info=True,
            )
            raise

    def stream_completion(
        self, request: ChatRequest
    ) -> Generator[str, None, None]:
        """
        Stream a chat completion response.

        Args:
            request: Chat completion request

        Yields:
            String chunks of the response

        Raises:
            Exception: If the completion fails
        """
        self.logger.info(
            "Starting streaming completion",
            extra={"model": request.model},
        )

        try:
            kwargs = self._build_completion_kwargs(request)
            kwargs["stream"] = True

            response = completion(**kwargs)

            for chunk in response:
                if (
                    chunk.choices
                    and chunk.choices[0].delta
                    and chunk.choices[0].delta.content
                ):
                    yield chunk.choices[0].delta.content

            self.logger.info("Streaming completion finished")

        except Exception as e:
            self.logger.error(
                "Streaming completion failed",
                extra={"error": str(e)},
                exc_info=True,
            )
            raise

    async def astream_completion(
        self, request: ChatRequest
    ) -> AsyncGenerator[str, None]:
        """
        Async stream a chat completion response.

        Args:
            request: Chat completion request

        Yields:
            String chunks of the response

        Raises:
            Exception: If the completion fails
        """
        self.logger.info(
            "Starting async streaming completion",
            extra={"model": request.model},
        )

        try:
            kwargs = self._build_completion_kwargs(request)
            kwargs["stream"] = True

            response = await acompletion(**kwargs)

            async for chunk in response:
                if (
                    chunk.choices
                    and chunk.choices[0].delta
                    and chunk.choices[0].delta.content
                ):
                    yield chunk.choices[0].delta.content

            self.logger.info("Async streaming completion finished")

        except Exception as e:
            self.logger.error(
                "Async streaming completion failed",
                extra={"error": str(e)},
                exc_info=True,
            )
            raise

    def supports_web_search(self, model: str) -> bool:
        """
        Check if a model supports web search.

        Args:
            model: Model identifier

        Returns:
            True if model supports web search
        """
        return litellm.supports_web_search(model=model)

    def check_provider_configured(self, model: str) -> bool:
        """
        Check if the provider for a model has API key configured.

        Args:
            model: Model identifier

        Returns:
            True if provider is configured
        """
        provider = get_provider_for_model(model)
        if provider is None:
            return False

        key_mapping = {
            "xai": self.settings.xai_api_key,
            "openai": self.settings.openai_api_key,
            "anthropic": self.settings.anthropic_api_key,
            "google": self.settings.google_api_key,
        }

        return bool(key_mapping.get(provider))


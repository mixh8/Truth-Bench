"""
Pydantic schemas for LLM request/response models.

These schemas define the contract for:
- Chat completion requests
- Chat completion responses
- Tool/function definitions
- Message formats
"""

from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    """A single message in a chat conversation."""

    role: Literal["system", "user", "assistant", "tool"] = Field(
        description="The role of the message sender"
    )
    content: str = Field(description="The content of the message")
    name: str | None = Field(default=None, description="Optional name for the sender")
    tool_call_id: str | None = Field(
        default=None, description="Tool call ID for tool responses"
    )


class ToolFunction(BaseModel):
    """Definition of a function that can be called by the LLM."""

    name: str = Field(description="The name of the function")
    description: str = Field(description="Description of what the function does")
    parameters: dict[str, Any] = Field(
        default_factory=dict,
        description="JSON Schema object defining the function parameters",
    )


class ToolDefinition(BaseModel):
    """A tool definition for function calling."""

    type: Literal["function"] = Field(default="function", description="Tool type")
    function: ToolFunction = Field(description="The function definition")


class UserLocation(BaseModel):
    """User location for localized search results (Anthropic)."""

    type: Literal["approximate"] = Field(
        default="approximate",
        description="Type of location (must be 'approximate')",
    )
    city: str | None = Field(default=None, description="City name")
    region: str | None = Field(default=None, description="Region or state")
    country: str | None = Field(default=None, description="Country code")
    timezone: str | None = Field(default=None, description="IANA timezone ID")


class WebSearchOptions(BaseModel):
    """Options for web search functionality across all providers."""

    search_context_size: Literal["low", "medium", "high"] = Field(
        default="medium",
        description="Size of search context: low, medium, or high",
    )
    # Anthropic-specific options
    allowed_domains: list[str] | None = Field(
        default=None,
        description="Only include results from these domains (Anthropic)",
    )
    blocked_domains: list[str] | None = Field(
        default=None,
        description="Never include results from these domains (Anthropic)",
    )
    max_uses: int | None = Field(
        default=None,
        description="Maximum number of searches per request (Anthropic)",
    )
    user_location: UserLocation | None = Field(
        default=None,
        description="User location for localized results (Anthropic)",
    )


class XSearchOptions(BaseModel):
    """Options for X (Twitter) search functionality (xAI models only)."""

    allowed_x_handles: list[str] | None = Field(
        default=None,
        description="List of X handles to restrict search to (without @ prefix)",
    )
    enable_image_understanding: bool = Field(
        default=True,
        description="Enable image understanding in X posts",
    )
    enable_video_understanding: bool = Field(
        default=True,
        description="Enable video understanding in X posts",
    )


class ChatRequest(BaseModel):
    """Request body for chat completion endpoint."""

    model: str = Field(
        default="xai/grok-3",
        description="Model identifier (e.g., xai/grok-3, gpt-4o, anthropic/claude-sonnet-4-20250514)",
    )
    messages: list[ChatMessage] = Field(
        description="List of messages in the conversation"
    )
    tools: list[ToolDefinition] | None = Field(
        default=None, description="Optional list of tools/functions the model can call"
    )
    tool_choice: Literal["auto", "none", "required"] | str | None = Field(
        default=None, description="How the model should use tools"
    )
    web_search: bool = Field(
        default=False, description="Enable web search (xAI models)"
    )
    web_search_options: WebSearchOptions | None = Field(
        default=None, description="Web search configuration options"
    )
    x_search: bool = Field(
        default=False, description="Enable X (Twitter) search (xAI models only)"
    )
    x_search_options: XSearchOptions | None = Field(
        default=None, description="X search configuration options"
    )
    stream: bool = Field(default=False, description="Enable streaming response")
    temperature: float | None = Field(
        default=None, ge=0, le=2, description="Sampling temperature"
    )
    max_tokens: int | None = Field(
        default=None, ge=1, description="Maximum tokens to generate"
    )
    top_p: float | None = Field(
        default=None, ge=0, le=1, description="Nucleus sampling parameter"
    )


class ToolCall(BaseModel):
    """A tool call made by the model."""

    id: str = Field(description="Unique identifier for the tool call")
    type: Literal["function"] = Field(default="function")
    function: dict[str, Any] = Field(
        description="Function name and arguments as JSON string"
    )


class ResponseMessage(BaseModel):
    """The assistant's response message."""

    role: Literal["assistant"] = Field(default="assistant")
    content: str | None = Field(default=None, description="Text content of the response")
    tool_calls: list[ToolCall] | None = Field(
        default=None, description="Tool calls made by the model"
    )


class Usage(BaseModel):
    """Token usage statistics."""

    prompt_tokens: int = Field(description="Tokens in the prompt")
    completion_tokens: int = Field(description="Tokens in the completion")
    total_tokens: int = Field(description="Total tokens used")


class ChatResponse(BaseModel):
    """Response from chat completion endpoint."""

    id: str = Field(description="Unique response identifier")
    model: str = Field(description="Model used for completion")
    message: ResponseMessage = Field(description="The assistant's response")
    usage: Usage | None = Field(default=None, description="Token usage statistics")
    finish_reason: str | None = Field(
        default=None, description="Reason for completion (stop, tool_calls, etc.)"
    )


class ModelInfo(BaseModel):
    """Information about an available model."""

    id: str = Field(description="Model identifier")
    provider: str = Field(description="Provider name (xai, openai, anthropic, google)")
    name: str = Field(description="Human-readable model name")
    supports_tools: bool = Field(default=True, description="Whether model supports tool calling")
    supports_web_search: bool = Field(default=False, description="Whether model supports web search")
    supports_x_search: bool = Field(default=False, description="Whether model supports X search (xAI only)")
    supports_vision: bool = Field(default=False, description="Whether model supports vision")


class ModelsResponse(BaseModel):
    """Response from models listing endpoint."""

    models: list[ModelInfo] = Field(description="List of available models")


class HealthResponse(BaseModel):
    """Health check response."""

    status: Literal["healthy", "unhealthy"] = Field(description="Service status")
    service: str = Field(description="Service name")
    version: str = Field(default="0.1.0", description="Service version")


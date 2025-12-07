"""
FastAPI application for the LLM service.

This module provides:
- REST API endpoints for chat completions
- Streaming support via Server-Sent Events
- Health check and model listing endpoints
- CORS configuration for frontend access
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from llm_service.config import Settings, configure_logging, get_logger, get_settings
from llm_service.llm.client import LLMClient
from llm_service.llm.providers import list_available_models
from llm_service.llm.schemas import (
    ChatRequest,
    ChatResponse,
    HealthResponse,
    ModelsResponse,
)


# Global instances
_llm_client: LLMClient | None = None
_logger: logging.Logger | None = None


def get_llm_client() -> LLMClient:
    """Get the global LLM client instance."""
    if _llm_client is None:
        raise RuntimeError("LLM client not initialized")
    return _llm_client


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan manager.

    Initializes logging and LLM client on startup.
    """
    global _llm_client, _logger

    # Load settings
    settings = get_settings()

    # Configure logging
    _logger = configure_logging(settings)
    _logger.info("Starting LLM service", extra={"port": settings.service_port})

    # Initialize LLM client
    _llm_client = LLMClient(settings)
    _logger.info("LLM client initialized")

    yield

    # Cleanup on shutdown
    _logger.info("Shutting down LLM service")


# Create FastAPI application
app = FastAPI(
    title="LLM Service",
    description="Multi-provider LLM service using LiteLLM",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check() -> HealthResponse:
    """
    Health check endpoint.

    Returns:
        HealthResponse: Service health status
    """
    logger = get_logger()
    logger.debug("Health check requested")

    return HealthResponse(
        status="healthy",
        service="llm-service",
        version="0.1.0",
    )


@app.get("/api/models", response_model=ModelsResponse, tags=["Models"])
async def list_models() -> ModelsResponse:
    """
    List available LLM models.

    Returns:
        ModelsResponse: List of available models with their capabilities
    """
    logger = get_logger()
    logger.debug("Models list requested")

    models = list_available_models()
    return ModelsResponse(models=models)


@app.post("/api/chat", response_model=ChatResponse, tags=["Chat"])
async def chat_completion(request: ChatRequest) -> ChatResponse:
    """
    Perform a chat completion.

    Args:
        request: Chat completion request with model, messages, and options

    Returns:
        ChatResponse: The model's response

    Raises:
        HTTPException: If the request fails
    """
    logger = get_logger()
    client = get_llm_client()

    logger.info(
        "Chat completion request received",
        extra={
            "model": request.model,
            "message_count": len(request.messages),
            "has_tools": bool(request.tools),
            "web_search": request.web_search,
            "stream": request.stream,
        },
    )

    # Check if provider is configured
    if not client.check_provider_configured(request.model):
        logger.warning(
            "Provider not configured",
            extra={"model": request.model},
        )
        raise HTTPException(
            status_code=400,
            detail=f"Provider for model '{request.model}' is not configured. Please set the appropriate API key.",
        )

    # Handle streaming request - redirect to stream endpoint
    if request.stream:
        logger.info("Redirecting to streaming endpoint")
        raise HTTPException(
            status_code=400,
            detail="For streaming, use POST /api/chat/stream endpoint",
        )

    try:
        response = await client.achat_completion(request)
        logger.info(
            "Chat completion successful",
            extra={
                "model": request.model,
                "finish_reason": response.finish_reason,
            },
        )
        return response

    except Exception as e:
        logger.error(
            "Chat completion failed",
            extra={"model": request.model, "error": str(e)},
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Chat completion failed: {str(e)}",
        )


@app.post("/api/chat/stream", tags=["Chat"])
async def stream_chat_completion(request: ChatRequest) -> StreamingResponse:
    """
    Stream a chat completion response.

    Args:
        request: Chat completion request

    Returns:
        StreamingResponse: Server-Sent Events stream of the response

    Raises:
        HTTPException: If the request fails
    """
    logger = get_logger()
    client = get_llm_client()

    logger.info(
        "Streaming chat completion request received",
        extra={"model": request.model},
    )

    # Check if provider is configured
    if not client.check_provider_configured(request.model):
        raise HTTPException(
            status_code=400,
            detail=f"Provider for model '{request.model}' is not configured.",
        )

    async def generate() -> AsyncGenerator[str, None]:
        """Generate SSE events from the streaming response."""
        try:
            async for chunk in client.astream_completion(request):
                # Format as Server-Sent Event
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Streaming error: {e}", exc_info=True)
            yield f"data: [ERROR] {str(e)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests."""
    logger = get_logger()

    # Log request
    logger.debug(
        "Request received",
        extra={
            "method": request.method,
            "path": request.url.path,
            "client": request.client.host if request.client else "unknown",
        },
    )

    # Process request
    response = await call_next(request)

    # Log response
    logger.debug(
        "Response sent",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
        },
    )

    return response


def main() -> None:
    """Run the application using uvicorn."""
    import uvicorn

    settings = get_settings()

    uvicorn.run(
        "llm_service.main:app",
        host="0.0.0.0",
        port=settings.service_port,
        reload=True,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()


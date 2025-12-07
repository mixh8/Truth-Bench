"""
Configuration and logging setup for the LLM service.

This module provides:
- Environment-based settings via Pydantic Settings
- Structured JSON logging configuration
- Centralized configuration access
"""

import logging
import logging.config
import sys
from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Service configuration
    service_name: str = Field(default="llm-service", description="Name of the service")
    service_port: int = Field(default=8000, alias="LLM_SERVICE_PORT")
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO", alias="LOG_LEVEL"
    )

    # API Keys - loaded from environment, never logged
    xai_api_key: str = Field(default="", alias="XAI_API_KEY")
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    google_api_key: str = Field(default="", alias="GOOGLE_API_KEY")
    x_api_key: str = Field(default="", alias="X_API_KEY", description="X/Twitter API Bearer Token")

    # CORS configuration
    cors_origins: list[str] = Field(
        default=[
            "http://localhost:5000",
            "http://127.0.0.1:5000",
            "http://localhost:5001",
            "http://127.0.0.1:5001",
            "http://localhost:5002",
            "http://127.0.0.1:5002",
            "https://truth-bench-9xt9.onrender.com",
            "https://truth-bench.onrender.com",
        ],
        description="Allowed CORS origins",
    )

    # Default model
    default_model: str = Field(
        default="xai/grok-3", description="Default model to use for completions"
    )


@lru_cache
def get_settings() -> Settings:
    """
    Get cached application settings.

    Returns:
        Settings: Application settings instance
    """
    return Settings()


def configure_logging(settings: Settings) -> logging.Logger:
    """
    Configure structured JSON logging for the application.

    Args:
        settings: Application settings containing log level

    Returns:
        Logger: Configured root logger
    """
    log_config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "json": {
                "format": '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "module": "%(module)s", "function": "%(funcName)s", "message": "%(message)s"}',
                "datefmt": "%Y-%m-%dT%H:%M:%S%z",
            },
            "standard": {
                "format": "%(asctime)s [%(levelname)s] %(name)s.%(funcName)s: %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "level": settings.log_level,
                "formatter": "standard",  # Use standard for dev, json for prod
                "stream": sys.stdout,
            },
        },
        "root": {
            "level": settings.log_level,
            "handlers": ["console"],
        },
        "loggers": {
            "llm_service": {
                "level": settings.log_level,
                "handlers": ["console"],
                "propagate": False,
            },
            "uvicorn": {
                "level": "INFO",
                "handlers": ["console"],
                "propagate": False,
            },
            "litellm": {
                "level": "WARNING",  # Reduce LiteLLM verbosity
                "handlers": ["console"],
                "propagate": False,
            },
        },
    }

    logging.config.dictConfig(log_config)
    logger = logging.getLogger("llm_service")
    logger.info(
        "Logging configured",
        extra={"log_level": settings.log_level, "service": settings.service_name},
    )

    return logger


def get_logger(name: str = "llm_service") -> logging.Logger:
    """
    Get a logger instance with the specified name.

    Args:
        name: Logger name (default: llm_service)

    Returns:
        Logger: Logger instance
    """
    return logging.getLogger(name)


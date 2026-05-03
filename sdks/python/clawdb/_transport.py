"""gRPC channel factory and request middleware."""
from __future__ import annotations

import json
import time
from typing import Any, Generator

import structlog

from clawdb.errors import ClawDBError, ClawDBUnavailableError

log = structlog.get_logger(__name__)

try:
    import grpc
except ImportError as exc:  # pragma: no cover
    raise ImportError("grpcio is required: pip install clawdb[grpc]") from exc


def _build_channel_credentials(config: Any) -> grpc.ChannelCredentials | None:
    endpoint: str = config.endpoint
    if endpoint.startswith("https://") or config.tls:
        return grpc.ssl_channel_credentials()
    return None


def create_channel(config: Any) -> grpc.Channel:
    """Create a gRPC channel from config."""
    endpoint: str = config.endpoint
    # Strip scheme for gRPC target
    target = endpoint.replace("https://", "").replace("http://", "")
    creds = _build_channel_credentials(config)

    options = [
        ("grpc.max_receive_message_length", 64 * 1024 * 1024),
        ("grpc.max_send_message_length", 64 * 1024 * 1024),
    ]

    if creds:
        return grpc.secure_channel(target, creds, options=options)
    return grpc.insecure_channel(target, options=options)


def create_async_channel(config: Any) -> Any:
    """Create an async gRPC channel from config."""
    import grpc.aio  # type: ignore[import-untyped]

    endpoint: str = config.endpoint
    target = endpoint.replace("https://", "").replace("http://", "")
    creds = _build_channel_credentials(config)

    options = [
        ("grpc.max_receive_message_length", 64 * 1024 * 1024),
        ("grpc.max_send_message_length", 64 * 1024 * 1024),
    ]

    if creds:
        return grpc.aio.secure_channel(target, creds, options=options)
    return grpc.aio.insecure_channel(target, options=options)


def make_metadata(token: str | None, api_key: str | None = None) -> list[tuple[str, str]]:
    """Build gRPC call metadata headers."""
    meta: list[tuple[str, str]] = []
    if token:
        meta.append(("authorization", f"Bearer {token}"))
    elif api_key:
        meta.append(("x-api-key", api_key))
    return meta


def with_retry(fn: Any, *, max_attempts: int = 3, base_delay: float = 0.2) -> Any:
    """Synchronous retry wrapper for unavailable errors."""
    last_exc: Exception | None = None
    for attempt in range(max_attempts):
        try:
            return fn()
        except ClawDBUnavailableError as exc:
            last_exc = exc
            if attempt < max_attempts - 1:
                delay = base_delay * (2 ** attempt)
                log.warning("retrying after unavailable", attempt=attempt + 1, delay=delay)
                time.sleep(delay)
        except ClawDBError:
            raise
        except Exception as exc:
            raise ClawDBError.from_grpc_error(exc) from exc
    raise last_exc  # type: ignore[misc]

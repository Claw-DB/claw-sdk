"""ClawDB Python SDK — the cognitive database for AI agents."""

from __future__ import annotations

import asyncio
from typing import Awaitable

from clawdb.async_client import AsyncClawDB
from clawdb.client import ClawDB
from clawdb.errors import (
    ClawDBAccessDeniedError,
    ClawDBAuthError,
    ClawDBError,
    ClawDBInternalError,
    ClawDBNotFoundError,
    ClawDBRateLimitError,
    ClawDBProvisionError,
    ClawDBTimeoutError,
    ClawDBUnavailableError,
    ClawDBValidationError,
)
from clawdb.models import BranchInfo, MemoryRecord, ReflectJob, SearchResult, SyncResult


def clawdb() -> ClawDB | Awaitable[AsyncClawDB]:
    """Return sync client in sync code, or awaitable async client inside an event loop."""
    try:
        asyncio.get_running_loop()
        return AsyncClawDB.auto_provision()
    except RuntimeError:
        return ClawDB.auto_provision()

__all__ = [
    "clawdb",
    "ClawDB",
    "AsyncClawDB",
    "MemoryRecord",
    "SearchResult",
    "BranchInfo",
    "SyncResult",
    "ReflectJob",
    "ClawDBError",
    "ClawDBAuthError",
    "ClawDBAccessDeniedError",
    "ClawDBNotFoundError",
    "ClawDBRateLimitError",
    "ClawDBProvisionError",
    "ClawDBUnavailableError",
    "ClawDBTimeoutError",
    "ClawDBValidationError",
    "ClawDBInternalError",
]

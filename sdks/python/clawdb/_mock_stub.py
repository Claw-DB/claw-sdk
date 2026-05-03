"""Mock stub used when generated proto stubs are not present (dev/test only)."""
from __future__ import annotations

from typing import Any


class _MockResponse(dict):
    pass


class MockStub:
    """Returns empty responses for all RPC methods."""

    async def __call__(self, *args: Any, **kwargs: Any) -> Any:
        return _MockResponse()

    def __getattr__(self, name: str) -> Any:
        def _sync(*args: Any, **kwargs: Any) -> _MockResponse:
            return _MockResponse({"memory_id": "00000000-0000-1000-8000-000000000000"})

        async def _async(*args: Any, **kwargs: Any) -> _MockResponse:
            return _MockResponse({"memory_id": "00000000-0000-1000-8000-000000000000"})

        # Return async version if called with await
        return _async

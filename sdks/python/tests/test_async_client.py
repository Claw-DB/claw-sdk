"""Pytest-asyncio tests for AsyncClawDB."""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from clawdb.async_client import AsyncClawDB, AsyncMemoryClient, AsyncBranchClient
from clawdb.errors import ClawDBValidationError, ClawDBUnavailableError
from clawdb.models import SearchResult, MemoryRecord


@pytest.fixture
def mock_stub():
    stub = MagicMock()
    stub.Remember = AsyncMock(return_value={"memory_id": "00000000-0000-1000-8000-000000000001"})
    stub.Search = AsyncMock(return_value={"results": []})
    stub.Recall = AsyncMock(return_value={"memories": []})
    stub.Forget = AsyncMock(return_value={})
    stub.ListMemories = AsyncMock(return_value={"memories": []})
    stub.Fork = AsyncMock(return_value={"branch": {"id": "b1", "name": "test", "status": "active", "parent_id": "trunk", "created_at": "2024-01-01T00:00:00Z", "divergence_score": 0.0}})
    stub.DiscardBranch = AsyncMock(return_value={})
    stub.CreateSession = AsyncMock(return_value={"token": "tok123"})
    return stub


@pytest.fixture
def mock_session():
    s = MagicMock()
    s.token = "tok123"
    return s


@pytest.fixture
def memory_client(mock_stub, mock_session):
    return AsyncMemoryClient(mock_stub, mock_session, "test-api-key")


@pytest.mark.asyncio
async def test_remember_returns_id(memory_client, mock_stub):
    mid = await memory_client.remember("Hello world")
    assert mid == "00000000-0000-1000-8000-000000000001"
    mock_stub.Remember.assert_called_once()


@pytest.mark.asyncio
async def test_remember_empty_raises(memory_client):
    with pytest.raises(ClawDBValidationError) as exc_info:
        await memory_client.remember("")
    assert exc_info.value.field == "content"


@pytest.mark.asyncio
async def test_search_returns_list(memory_client, mock_stub):
    results = await memory_client.search("test query")
    assert results == []


@pytest.mark.asyncio
async def test_search_top_k_too_large(memory_client):
    with pytest.raises(ClawDBValidationError):
        await memory_client.search("q", top_k=101)


@pytest.mark.asyncio
async def test_recall_validates_uuid(memory_client):
    with pytest.raises(ClawDBValidationError):
        await memory_client.recall(["not-a-uuid"])


@pytest.mark.asyncio
async def test_recall_empty_raises(memory_client):
    with pytest.raises(ClawDBValidationError):
        await memory_client.recall([])


@pytest.mark.asyncio
async def test_recall_valid_uuid(memory_client, mock_stub):
    memories = await memory_client.recall(["123e4567-e89b-12d3-a456-426614174000"])
    assert memories == []


@pytest.mark.asyncio
async def test_forget_calls_stub(memory_client, mock_stub):
    await memory_client.forget("mem-123")
    mock_stub.Forget.assert_called_once()


@pytest.mark.asyncio
async def test_list_memories(memory_client, mock_stub):
    mems = await memory_client.list(limit=10)
    assert mems == []


@pytest.mark.asyncio
async def test_async_clawdb_from_env():
    db = AsyncClawDB.from_env()
    assert db._config.endpoint == "http://localhost:50050"


@pytest.mark.asyncio
async def test_async_clawdb_from_api_key():
    db = AsyncClawDB.from_api_key("key123", "https://api.clawdb.io")
    assert db._config.api_key == "key123"
    assert db._config.endpoint == "https://api.clawdb.io"


@pytest.mark.asyncio
async def test_retry_on_unavailable(memory_client, mock_stub):
    call_count = 0

    async def fail_then_succeed(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise ClawDBUnavailableError("down")
        return {"memory_id": "retry-success"}

    mock_stub.Remember.side_effect = fail_then_succeed
    mid = await memory_client.remember("retry test")
    assert mid == "retry-success"
    assert call_count == 3

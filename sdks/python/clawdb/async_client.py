"""Async ClawDB client and async sub-clients."""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any, Callable, TypeVar

import structlog
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from clawdb._transport import create_async_channel, make_metadata
from clawdb.branches import BranchClient
from clawdb.config import ClawDBConfig
from clawdb.errors import ClawDBError, ClawDBRateLimitError, ClawDBUnavailableError, ClawDBValidationError
from clawdb.models import BranchInfo, DiffResult, MemoryRecord, MergeResult, ReflectJob, SearchResult, SyncResult

log = structlog.get_logger(__name__)
T = TypeVar("T")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)


def _to_dict(msg: Any) -> dict[str, Any]:
    if isinstance(msg, dict):
        return msg
    try:
        from google.protobuf.json_format import MessageToDict
        return MessageToDict(msg, preserving_proto_field_name=True)
    except Exception:
        return {}


async def _with_async_retry(fn: Callable[[], Any]) -> Any:
    """Retry on UNAVAILABLE with exponential backoff; honour Retry-After on rate limit."""
    async for attempt in AsyncRetrying(
        retry=retry_if_exception_type(ClawDBUnavailableError),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=30),
        stop=stop_after_attempt(3),
        reraise=True,
    ):
        with attempt:
            try:
                return await fn()
            except ClawDBRateLimitError as exc:
                wait_s = exc.retry_after_ms / 1000.0
                log.warning("rate_limited", retry_after_s=wait_s)
                await asyncio.sleep(wait_s)
                return await fn()
            except ClawDBError:
                raise
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc


def _load_async_stub(channel: Any) -> Any:
    try:
        from clawdb._proto import clawdb_pb2_grpc  # type: ignore[import]
        return clawdb_pb2_grpc.ClawDBServiceStub(channel)
    except ImportError:
        from clawdb._mock_stub import MockStub
        return MockStub()


class AsyncMemoryClient:
    def __init__(self, stub: Any, session: Any, api_key: str = "") -> None:
        self._stub = stub
        self._session = session
        self._api_key = api_key

    def _meta(self) -> list[tuple[str, str]]:
        return make_metadata(getattr(self._session, "token", None), self._api_key)

    async def remember(self, content: str, *, memory_type: str = "context", tags: list[str] | None = None, metadata: dict[str, Any] | None = None, ttl_days: int | None = None) -> str:
        if not content or not content.strip():
            raise ClawDBValidationError("content must be a non-empty string", field="content")

        async def _call() -> str:
            resp = await self._stub.Remember(
                {"content": content, "memory_type": memory_type, "tags": tags or [], "metadata": json.dumps(metadata or {}), "ttl_days": ttl_days or 0},
                metadata=self._meta(),
            )
            return _to_dict(resp).get("memory_id", "")

        return await _with_async_retry(_call)

    async def search(self, query: str, *, top_k: int = 5, semantic: bool = True, filter: dict[str, Any] | None = None, alpha: float = 0.7) -> list[SearchResult]:
        if top_k > 100:
            raise ClawDBValidationError("top_k cannot exceed 100", field="top_k", constraint="<=100")

        async def _call() -> list[SearchResult]:
            resp = await self._stub.Search(
                {"query": query, "top_k": top_k, "semantic": semantic, "filter_json": json.dumps(filter or {}), "alpha": alpha},
                metadata=self._meta(),
            )
            data = _to_dict(resp)
            return [SearchResult.model_validate(r) for r in data.get("results", [])]

        return await _with_async_retry(_call)

    async def recall(self, memory_ids: list[str]) -> list[MemoryRecord]:
        if not memory_ids:
            raise ClawDBValidationError("memory_ids must be non-empty", field="memory_ids")
        for mid in memory_ids:
            if not UUID_RE.match(mid):
                raise ClawDBValidationError(f"Invalid UUID: {mid}", field="memory_ids")

        async def _call() -> list[MemoryRecord]:
            resp = await self._stub.Recall({"memory_ids": memory_ids}, metadata=self._meta())
            data = _to_dict(resp)
            return [MemoryRecord.model_validate(m) for m in data.get("memories", [])]

        return await _with_async_retry(_call)

    async def forget(self, memory_id: str) -> None:
        async def _call() -> None:
            await self._stub.Forget({"memory_id": memory_id, "soft_delete": True}, metadata=self._meta())

        await _with_async_retry(_call)

    async def list(self, *, memory_type: str | None = None, limit: int = 50, offset: int = 0) -> list[MemoryRecord]:
        async def _call() -> list[MemoryRecord]:
            resp = await self._stub.ListMemories({"memory_type": memory_type or "", "limit": limit, "offset": offset}, metadata=self._meta())
            data = _to_dict(resp)
            return [MemoryRecord.model_validate(m) for m in data.get("memories", [])]

        return await _with_async_retry(_call)


class AsyncBranchClient:
    def __init__(self, stub: Any, session: Any, api_key: str = "", db_factory: Any = None) -> None:
        self._stub = stub
        self._session = session
        self._api_key = api_key
        self._db_factory = db_factory

    def _meta(self) -> list[tuple[str, str]]:
        return make_metadata(getattr(self._session, "token", None), self._api_key)

    async def fork(self, name: str, *, parent: str | None = None, description: str | None = None) -> BranchInfo:
        async def _call() -> BranchInfo:
            resp = await self._stub.Fork({"name": name, "parent": parent or "trunk", "description": description or ""}, metadata=self._meta())
            return BranchInfo.model_validate(_to_dict(resp).get("branch", {}))

        return await _with_async_retry(_call)

    async def diff(self, branch_a: str, branch_b: str) -> dict[str, Any]:
        async def _call() -> dict[str, Any]:
            resp = await self._stub.DiffBranches({"branch_a": branch_a, "branch_b": branch_b}, metadata=self._meta())
            return _to_dict(resp)

        return await _with_async_retry(_call)

    async def merge(self, source: str, *, into: str = "trunk", strategy: str = "union") -> dict[str, Any]:
        async def _call() -> dict[str, Any]:
            resp = await self._stub.Merge({"source": source, "into": into, "strategy": strategy}, metadata=self._meta())
            return _to_dict(resp)

        return await _with_async_retry(_call)

    async def discard(self, name: str) -> None:
        async def _call() -> None:
            await self._stub.DiscardBranch({"name": name}, metadata=self._meta())

        await _with_async_retry(_call)

    async def simulate(self, name: str, fn: Any) -> tuple[Any, dict[str, Any]]:
        sandbox_name = f"sandbox-{name}-sim"
        sandbox = await self.fork(sandbox_name, parent=name)
        db = self._db_factory() if self._db_factory else None
        try:
            result = await fn(db)
            resp = await self._stub.SimulateEvaluate({"branch_id": sandbox.id, "parent_id": sandbox.parent_id or "trunk"}, metadata=self._meta())
            evaluation = _to_dict(resp)
            await self.discard(sandbox.id)
            return result, evaluation
        except Exception:
            try:
                await self.discard(sandbox.id)
            except Exception:
                pass
            raise


class AsyncSyncClient:
    def __init__(self, stub: Any, session: Any, api_key: str = "") -> None:
        self._stub = stub
        self._session = session
        self._api_key = api_key

    def _meta(self) -> list[tuple[str, str]]:
        return make_metadata(getattr(self._session, "token", None), self._api_key)

    async def push(self) -> SyncResult:
        async def _call() -> SyncResult:
            resp = await self._stub.SyncPush({}, metadata=self._meta())
            return SyncResult.model_validate(_to_dict(resp))

        return await _with_async_retry(_call)

    async def pull(self) -> SyncResult:
        async def _call() -> SyncResult:
            resp = await self._stub.SyncPull({}, metadata=self._meta())
            return SyncResult.model_validate(_to_dict(resp))

        return await _with_async_retry(_call)

    async def sync(self) -> SyncResult:
        await self.push()
        return await self.pull()


class AsyncReflectClient:
    def __init__(self, stub: Any, session: Any, api_key: str = "") -> None:
        self._stub = stub
        self._session = session
        self._api_key = api_key

    def _meta(self) -> list[tuple[str, str]]:
        return make_metadata(getattr(self._session, "token", None), self._api_key)

    async def trigger(self, *, job_type: str = "full", dry_run: bool = False) -> ReflectJob:
        async def _call() -> ReflectJob:
            resp = await self._stub.TriggerReflect({"job_type": job_type, "dry_run": dry_run}, metadata=self._meta())
            return ReflectJob.model_validate(_to_dict(resp))

        return await _with_async_retry(_call)

    async def status(self, job_id: str) -> ReflectJob:
        async def _call() -> ReflectJob:
            resp = await self._stub.ReflectStatus({"job_id": job_id}, metadata=self._meta())
            return ReflectJob.model_validate(_to_dict(resp))

        return await _with_async_retry(_call)


class AsyncClawDB:
    """Fully async ClawDB client."""

    def __init__(self, *, endpoint: str | None = None, api_key: str | None = None, agent_id: str | None = None, **kwargs: Any) -> None:
        overrides: dict[str, Any] = {}
        if endpoint:
            overrides["endpoint"] = endpoint
        if api_key:
            overrides["api_key"] = api_key
        if agent_id:
            overrides["agent_id"] = agent_id
        overrides.update(kwargs)
        self._config = ClawDBConfig(**overrides)
        self._channel: Any = None
        self._stub: Any = None
        self._session: Any = None
        self._memory_client: AsyncMemoryClient | None = None
        self._branch_client: AsyncBranchClient | None = None
        self._sync_client: AsyncSyncClient | None = None
        self._reflect_client: AsyncReflectClient | None = None

    @classmethod
    def from_env(cls) -> "AsyncClawDB":
        return cls()

    @classmethod
    def from_api_key(cls, api_key: str, endpoint: str) -> "AsyncClawDB":
        return cls(api_key=api_key, endpoint=endpoint)

    async def connect(self) -> None:
        self._channel = create_async_channel(self._config)
        self._stub = _load_async_stub(self._channel)
        from clawdb.session import SessionClient
        self._session = SessionClient(self._stub, agent_id=self._config.agent_id, role=self._config.role, api_key=self._config.api_key)
        # Session creation in async context runs in executor to avoid blocking
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._session.create)
        log.info("clawdb.async.connected", endpoint=self._config.endpoint)

    async def disconnect(self) -> None:
        if self._session:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._session.revoke)
        if self._channel:
            await self._channel.close()

    async def __aenter__(self) -> "AsyncClawDB":
        await self.connect()
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.disconnect()

    @property
    def memory(self) -> AsyncMemoryClient:
        if self._memory_client is None:
            self._memory_client = AsyncMemoryClient(self._stub, self._session, self._config.api_key)
        return self._memory_client

    @property
    def branches(self) -> AsyncBranchClient:
        if self._branch_client is None:
            self._branch_client = AsyncBranchClient(self._stub, self._session, self._config.api_key, lambda: self)
        return self._branch_client

    @property
    def sync(self) -> AsyncSyncClient:
        if self._sync_client is None:
            self._sync_client = AsyncSyncClient(self._stub, self._session, self._config.api_key)
        return self._sync_client

    @property
    def reflect(self) -> AsyncReflectClient:
        if self._reflect_client is None:
            self._reflect_client = AsyncReflectClient(self._stub, self._session, self._config.api_key)
        return self._reflect_client

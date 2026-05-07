"""Sync ClawDB client."""
from __future__ import annotations

import asyncio
from typing import Any

import structlog

from clawdb._transport import create_channel
from clawdb.branches import BranchClient
from clawdb.config import ClawDBConfig
from clawdb.memory import MemoryClient
from clawdb.provision import resolve_endpoint
from clawdb.reflect import ReflectClient
from clawdb.session import SessionClient
from clawdb.sync_client import SyncClientWrapper

log = structlog.get_logger(__name__)

# Lazy stub import — stubs are generated at build time; fall back to a mock
# transport stub during development / testing without a live server.
def _load_stub(channel: Any) -> Any:
    try:
        from clawdb._proto import clawdb_pb2_grpc  # type: ignore[import]
        return clawdb_pb2_grpc.ClawDBServiceStub(channel)
    except ImportError:
        from clawdb._mock_stub import MockStub
        return MockStub()


class ClawDB:
    """Synchronous ClawDB client."""

    def __init__(
        self,
        *,
        endpoint: str | None = None,
        api_key: str | None = None,
        agent_id: str | None = None,
        **kwargs: Any,
    ) -> None:
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
        self._session_client: SessionClient | None = None
        self._memory_client: MemoryClient | None = None
        self._branch_client: BranchClient | None = None
        self._sync_client: SyncClientWrapper | None = None
        self._reflect_client: ReflectClient | None = None

    @classmethod
    def from_env(cls) -> "ClawDB":
        return cls()

    @classmethod
    def from_api_key(cls, api_key: str, endpoint: str) -> "ClawDB":
        return cls(api_key=api_key, endpoint=endpoint)

    @classmethod
    def auto_provision(cls) -> "ClawDB":
        try:
            result = asyncio.run(resolve_endpoint())
        except RuntimeError:
            # If we're already on an event loop, fall back to env defaults.
            return cls.from_env()

        return cls(endpoint=result.endpoint, api_key=result.api_key)

    def _should_resolve_local_endpoint(self) -> bool:
        return not self._config.api_key and self._config.endpoint in ("", "http://localhost:50050")

    def connect(self) -> None:
        if self._should_resolve_local_endpoint():
            try:
                result = asyncio.run(resolve_endpoint())
                self._config.endpoint = result.endpoint
                if result.api_key:
                    self._config.api_key = result.api_key
            except RuntimeError:
                pass
        self._channel = create_channel(self._config)
        self._stub = _load_stub(self._channel)
        self._session_client = SessionClient(self._stub, agent_id=self._config.agent_id, role=self._config.role, api_key=self._config.api_key)
        self._session_client.create()
        log.info("clawdb.connected", endpoint=self._config.endpoint, agent_id=self._config.agent_id)

    def disconnect(self) -> None:
        if self._session_client:
            self._session_client.revoke()
        if self._channel:
            try:
                self._channel.close()
            except Exception:
                pass
        log.info("clawdb.disconnected")

    def __enter__(self) -> "ClawDB":
        self.connect()
        return self

    def __exit__(self, *args: Any) -> None:
        self.disconnect()

    def _require_session(self) -> SessionClient:
        if self._session_client is None:
            raise RuntimeError("Not connected. Call connect() or use 'with' statement.")
        return self._session_client

    @property
    def memory(self) -> MemoryClient:
        if self._memory_client is None:
            self._memory_client = MemoryClient(self._stub, self._require_session(), self._config.api_key)
        return self._memory_client

    @property
    def branches(self) -> BranchClient:
        if self._branch_client is None:
            self._branch_client = BranchClient(self._stub, self._require_session(), self._config.api_key)
        return self._branch_client

    @property
    def sync(self) -> SyncClientWrapper:
        if self._sync_client is None:
            self._sync_client = SyncClientWrapper(self._stub, self._require_session(), self._config.api_key)
        return self._sync_client

    @property
    def reflect(self) -> ReflectClient:
        if self._reflect_client is None:
            self._reflect_client = ReflectClient(self._stub, self._require_session(), self._config.api_key)
        return self._reflect_client

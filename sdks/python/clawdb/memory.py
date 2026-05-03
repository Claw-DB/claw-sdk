"""Sync MemoryClient and BranchClient for the ClawDB Python SDK."""
from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING, Any

from clawdb._transport import make_metadata, with_retry
from clawdb.errors import ClawDBError, ClawDBValidationError
from clawdb.models import BranchInfo, DiffResult, MemoryRecord, MergeResult, SearchResult

if TYPE_CHECKING:
    from clawdb.session import SessionClient

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)


class MemoryClient:
    def __init__(self, stub: Any, session: "SessionClient", api_key: str = "") -> None:
        self._stub = stub
        self._session = session
        self._api_key = api_key

    def _meta(self) -> list[tuple[str, str]]:
        token = self._session.token if self._session.token else None
        return make_metadata(token, self._api_key)

    def remember(
        self,
        content: str,
        *,
        memory_type: str = "context",
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        ttl_days: int | None = None,
    ) -> str:
        if not content or not content.strip():
            raise ClawDBValidationError("content must be a non-empty string", field="content", constraint="non-empty")

        def _call() -> str:
            try:
                resp = self._stub.Remember(
                    _build_request(
                        "Remember",
                        content=content,
                        memory_type=memory_type,
                        tags=tags or [],
                        metadata=json.dumps(metadata or {}),
                        ttl_days=ttl_days or 0,
                    ),
                    metadata=self._meta(),
                )
                return resp.memory_id
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def search(
        self,
        query: str,
        *,
        top_k: int = 5,
        semantic: bool = True,
        filter: dict[str, Any] | None = None,
        alpha: float = 0.7,
    ) -> list[SearchResult]:
        if top_k > 100:
            raise ClawDBValidationError("top_k cannot exceed 100", field="top_k", constraint="<=100")

        def _call() -> list[SearchResult]:
            try:
                resp = self._stub.Search(
                    _build_request("Search", query=query, top_k=top_k, semantic=semantic, filter_json=json.dumps(filter or {}), alpha=alpha),
                    metadata=self._meta(),
                )
                return [SearchResult.model_validate(r) for r in _repeated_to_dicts(resp.results)]
            except ClawDBValidationError:
                raise
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def recall(self, memory_ids: list[str]) -> list[MemoryRecord]:
        if not memory_ids:
            raise ClawDBValidationError("memory_ids must be non-empty", field="memory_ids")
        for mid in memory_ids:
            if not UUID_RE.match(mid):
                raise ClawDBValidationError(f"Invalid UUID: {mid}", field="memory_ids", constraint="uuid")

        def _call() -> list[MemoryRecord]:
            try:
                resp = self._stub.Recall(_build_request("Recall", memory_ids=memory_ids), metadata=self._meta())
                return [MemoryRecord.model_validate(m) for m in _repeated_to_dicts(resp.memories)]
            except ClawDBValidationError:
                raise
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def forget(self, memory_id: str) -> None:
        def _call() -> None:
            try:
                self._stub.Forget(_build_request("Forget", memory_id=memory_id), metadata=self._meta())
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        with_retry(_call)

    def list(
        self,
        *,
        memory_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
        sort_by: str = "created_at",
    ) -> list[MemoryRecord]:
        def _call() -> list[MemoryRecord]:
            try:
                resp = self._stub.ListMemories(
                    _build_request("List", memory_type=memory_type or "", limit=limit, offset=offset, sort_by=sort_by),
                    metadata=self._meta(),
                )
                return [MemoryRecord.model_validate(m) for m in _repeated_to_dicts(resp.memories)]
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def score(self, memory_id: str) -> dict[str, float]:
        def _call() -> dict[str, float]:
            try:
                resp = self._stub.ScoreMemory(_build_request("Score", memory_id=memory_id), metadata=self._meta())
                return {"importance": resp.importance, "recency": resp.recency, "confidence": resp.confidence, "composite": resp.composite}
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)


class BranchClient:
    def __init__(self, stub: Any, session: "SessionClient", api_key: str = "") -> None:
        self._stub = stub
        self._session = session
        self._api_key = api_key

    def _meta(self) -> list[tuple[str, str]]:
        return make_metadata(self._session.token, self._api_key)

    def fork(self, name: str, *, parent: str | None = None, description: str | None = None) -> BranchInfo:
        def _call() -> BranchInfo:
            try:
                resp = self._stub.Fork(_build_request("Fork", name=name, parent=parent or "trunk", description=description or ""), metadata=self._meta())
                return BranchInfo.model_validate(_proto_to_dict(resp.branch))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def list(self, *, status: str | None = None) -> list[BranchInfo]:
        def _call() -> list[BranchInfo]:
            try:
                resp = self._stub.ListBranches(_build_request("ListBranches", status=status or ""), metadata=self._meta())
                return [BranchInfo.model_validate(b) for b in _repeated_to_dicts(resp.branches)]
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def get(self, name_or_id: str) -> BranchInfo:
        def _call() -> BranchInfo:
            try:
                resp = self._stub.GetBranch(_build_request("GetBranch", name_or_id=name_or_id), metadata=self._meta())
                return BranchInfo.model_validate(_proto_to_dict(resp.branch))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def diff(self, branch_a: str, branch_b: str) -> DiffResult:
        def _call() -> DiffResult:
            try:
                resp = self._stub.DiffBranches(_build_request("Diff", branch_a=branch_a, branch_b=branch_b), metadata=self._meta())
                return DiffResult.model_validate(_proto_to_dict(resp))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def merge(self, source: str, *, into: str = "trunk", strategy: str = "union") -> MergeResult:
        def _call() -> MergeResult:
            try:
                resp = self._stub.Merge(_build_request("Merge", source=source, into=into, strategy=strategy), metadata=self._meta())
                return MergeResult.model_validate(_proto_to_dict(resp))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def discard(self, name: str) -> None:
        def _call() -> None:
            try:
                self._stub.DiscardBranch(_build_request("Discard", name=name), metadata=self._meta())
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        with_retry(_call)

    def archive(self, name: str) -> None:
        def _call() -> None:
            try:
                self._stub.ArchiveBranch(_build_request("Archive", name=name), metadata=self._meta())
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        with_retry(_call)


# ---------------------------------------------------------------------------
# Internal helpers — these adapt raw proto responses to dicts for Pydantic.
# Before proto stubs are generated, operations pass through a thin HTTP JSON
# fallback so tests can run without a live gRPC server.
# ---------------------------------------------------------------------------

class _FakeRequest(dict):
    """Stands in for a proto message when stubs are not yet generated."""


def _build_request(method: str, **kwargs: Any) -> _FakeRequest:
    req = _FakeRequest(kwargs)
    req["_method"] = method
    return req


def _repeated_to_dicts(items: Any) -> list[dict[str, Any]]:
    if isinstance(items, list):
        return [_proto_to_dict(i) for i in items]
    # protobuf RepeatedContainer
    return [_proto_to_dict(i) for i in items]


def _proto_to_dict(msg: Any) -> dict[str, Any]:
    if isinstance(msg, dict):
        return msg
    # For real proto messages we'd use MessageToDict; fall back gracefully
    try:
        from google.protobuf.json_format import MessageToDict
        return MessageToDict(msg, preserving_proto_field_name=True)
    except Exception:
        return {}

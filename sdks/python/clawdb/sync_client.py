"""Sync SyncClientWrapper and ReflectClient."""
from __future__ import annotations

import json
import time
from typing import Any

from clawdb._transport import make_metadata, with_retry
from clawdb.errors import ClawDBError, ClawDBTimeoutError
from clawdb.models import ReflectJob, SyncActionResult, SyncResult, SyncStatusResult


class SyncClientWrapper:
    """Wraps ClawDB sync gRPC methods."""

    def __init__(self, stub: Any, session: Any, api_key: str = "") -> None:
        self._stub = stub
        self._session = session
        self._api_key = api_key

    def _meta(self) -> list[tuple[str, str]]:
        return make_metadata(self._session.token, self._api_key)

    def sync(self) -> SyncResult:
        def _call() -> SyncResult:
            try:
                resp = self._stub.Sync({}, metadata=self._meta())
                return SyncResult.model_validate(_to_dict(resp))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def push(self) -> SyncActionResult:
        def _call() -> SyncActionResult:
            try:
                resp = self._stub.PushSync({}, metadata=self._meta())
                return SyncActionResult.model_validate(_to_dict(resp))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def pull(self) -> SyncActionResult:
        def _call() -> SyncActionResult:
            try:
                resp = self._stub.PullSync({}, metadata=self._meta())
                return SyncActionResult.model_validate(_to_dict(resp))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def reconcile(self) -> SyncActionResult:
        def _call() -> SyncActionResult:
            try:
                resp = self._stub.ReconcileSync({}, metadata=self._meta())
                return SyncActionResult.model_validate(_to_dict(resp))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def status(self) -> SyncStatusResult:
        def _call() -> SyncStatusResult:
            try:
                resp = self._stub.SyncStatus({}, metadata=self._meta())
                return SyncStatusResult.model_validate(_to_dict(resp))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)


class ReflectClient:
    def __init__(self, stub: Any, session: Any, api_key: str = "") -> None:
        self._stub = stub
        self._session = session
        self._api_key = api_key

    def _meta(self) -> list[tuple[str, str]]:
        return make_metadata(self._session.token, self._api_key)

    def trigger(self) -> ReflectJob:
        def _call() -> ReflectJob:
            try:
                resp = self._stub.Reflect({}, metadata=self._meta())
                return ReflectJob.model_validate(_to_dict(resp))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def get_job(self, job_id: str) -> ReflectJob:
        def _call() -> ReflectJob:
            try:
                resp = self._stub.ReflectGetJob({"job_id": job_id}, metadata=self._meta())
                d = _to_dict(resp)
                inner = json.loads(d.get("json", "{}") or "{}")
                return ReflectJob.model_validate(inner)
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def list_jobs(self, agent_id: str, *, status: str = "", limit: int = 20, offset: int = 0) -> list[ReflectJob]:
        def _call() -> list[ReflectJob]:
            try:
                resp = self._stub.ReflectListJobs(
                    {"agent_id": agent_id, "status": status, "limit": limit, "offset": offset},
                    metadata=self._meta(),
                )
                d = _to_dict(resp)
                items = json.loads(d.get("json", "[]") or "[]")
                if isinstance(items, list):
                    return [ReflectJob.model_validate(i) for i in items]
                return []
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def get_facts(self, agent_id: str) -> dict[str, Any]:
        def _call() -> dict[str, Any]:
            try:
                resp = self._stub.ReflectGetFacts({"agent_id": agent_id}, metadata=self._meta())
                d = _to_dict(resp)
                return json.loads(d.get("json", "{}") or "{}")
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def get_preferences(self, agent_id: str) -> dict[str, Any]:
        def _call() -> dict[str, Any]:
            try:
                resp = self._stub.ReflectGetPreferences({"agent_id": agent_id}, metadata=self._meta())
                d = _to_dict(resp)
                return json.loads(d.get("json", "{}") or "{}")
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def get_contradictions(self, agent_id: str) -> dict[str, Any]:
        def _call() -> dict[str, Any]:
            try:
                resp = self._stub.ReflectGetContradictions({"agent_id": agent_id}, metadata=self._meta())
                d = _to_dict(resp)
                return json.loads(d.get("json", "{}") or "{}")
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def resolve_contradiction(self, agent_id: str, contradiction_id: str, *, strategy: str = "", merged_value_json: str = "") -> dict[str, Any]:
        def _call() -> dict[str, Any]:
            try:
                resp = self._stub.ReflectResolveContradiction(
                    {"agent_id": agent_id, "contradiction_id": contradiction_id, "strategy": strategy, "merged_value_json": merged_value_json},
                    metadata=self._meta(),
                )
                d = _to_dict(resp)
                return json.loads(d.get("json", "{}") or "{}")
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def wait_for_completion(self, job_id: str, *, poll_interval_s: float = 2.0, timeout_s: float = 60.0) -> ReflectJob:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            job = self.get_job(job_id)
            if job.status in ("completed", "failed"):
                return job
            time.sleep(poll_interval_s)
        raise ClawDBTimeoutError("Reflect job timed out", timeout_ms=int(timeout_s * 1000))


def _to_dict(msg: Any) -> dict[str, Any]:
    if isinstance(msg, dict):
        return msg
    try:
        from google.protobuf.json_format import MessageToDict
        return MessageToDict(msg, preserving_proto_field_name=True)
    except Exception:
        return {}


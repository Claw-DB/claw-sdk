"""Sync SyncClient and ReflectClient."""
from __future__ import annotations

import time
from typing import Any

from clawdb._transport import make_metadata, with_retry
from clawdb.errors import ClawDBError, ClawDBTimeoutError
from clawdb.models import AgentProfile, ReflectJob, SyncResult, SyncStatus


class SyncClientWrapper:
    """Wraps claw-sync gRPC methods. Named SyncClientWrapper to avoid collision with Python sync."""

    def __init__(self, stub: Any, session: Any, api_key: str = "") -> None:
        self._stub = stub
        self._session = session
        self._api_key = api_key

    def _meta(self) -> list[tuple[str, str]]:
        return make_metadata(self._session.token, self._api_key)

    def push(self) -> SyncResult:
        def _call() -> SyncResult:
            try:
                resp = self._stub.SyncPush({}, metadata=self._meta())
                return SyncResult.model_validate(_to_dict(resp))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def pull(self) -> SyncResult:
        def _call() -> SyncResult:
            try:
                resp = self._stub.SyncPull({}, metadata=self._meta())
                return SyncResult.model_validate(_to_dict(resp))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def sync(self) -> SyncResult:
        self.push()
        return self.pull()

    def status(self) -> SyncStatus:
        def _call() -> SyncStatus:
            try:
                resp = self._stub.SyncStatus({}, metadata=self._meta())
                return SyncStatus.model_validate(_to_dict(resp))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def configure(self, hub_url: str, *, api_key: str | None = None, interval_ms: int = 30000) -> None:
        def _call() -> None:
            try:
                self._stub.SyncConfigure({"hub_url": hub_url, "api_key": api_key or "", "interval_ms": interval_ms}, metadata=self._meta())
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        with_retry(_call)


class ReflectClient:
    def __init__(self, stub: Any, session: Any, api_key: str = "") -> None:
        self._stub = stub
        self._session = session
        self._api_key = api_key

    def _meta(self) -> list[tuple[str, str]]:
        return make_metadata(self._session.token, self._api_key)

    def trigger(self, *, job_type: str = "full", dry_run: bool = False) -> ReflectJob:
        def _call() -> ReflectJob:
            try:
                resp = self._stub.TriggerReflect({"job_type": job_type, "dry_run": dry_run}, metadata=self._meta())
                return ReflectJob.model_validate(_to_dict(resp))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def status(self, job_id: str) -> ReflectJob:
        def _call() -> ReflectJob:
            try:
                resp = self._stub.ReflectStatus({"job_id": job_id}, metadata=self._meta())
                return ReflectJob.model_validate(_to_dict(resp))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def wait_for_completion(self, job_id: str, *, poll_interval_s: float = 2.0, timeout_s: float = 60.0) -> ReflectJob:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            job = self.status(job_id)
            if job.status in ("completed", "failed"):
                return job
            time.sleep(poll_interval_s)
        raise ClawDBTimeoutError("Reflect job timed out", timeout_ms=int(timeout_s * 1000))

    def get_profile(self) -> AgentProfile:
        def _call() -> AgentProfile:
            try:
                resp = self._stub.GetProfile({}, metadata=self._meta())
                return AgentProfile.model_validate(_to_dict(resp))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)


def _to_dict(msg: Any) -> dict[str, Any]:
    if isinstance(msg, dict):
        return msg
    try:
        from google.protobuf.json_format import MessageToDict
        return MessageToDict(msg, preserving_proto_field_name=True)
    except Exception:
        return {}

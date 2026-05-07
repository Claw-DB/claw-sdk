"""SessionClient for the ClawDB Python SDK."""
from __future__ import annotations

from typing import Any

from clawdb._transport import make_metadata, with_retry
from clawdb.errors import ClawDBAuthError, ClawDBError


class SessionClient:
    def __init__(self, stub: Any, *, agent_id: str, role: str, api_key: str = "") -> None:
        self._stub = stub
        self._agent_id = agent_id
        self._role = role
        self._api_key = api_key
        self.token: str | None = None
        self.session_data: dict[str, Any] | None = None

    def create(self, *, role: str | None = None, scopes: list[str] | None = None, task_type: str | None = None) -> dict[str, Any]:
        def _call() -> dict[str, Any]:
            try:
                resp = self._stub.CreateSession(
                    {"agent_id": self._agent_id, "role": role or self._role, "scopes": scopes or [], "task_type": task_type or ""},
                    metadata=make_metadata(None, self._api_key),
                )
                data = _proto_session_to_dict(resp)
                self.token = data.get("token")
                self.session_data = data
                return data
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def validate(self) -> bool:
        if not self.token:
            return False
        try:
            resp = self._stub.ValidateSession(
                {"token": self.token},
                metadata=make_metadata(self.token, self._api_key),
            )
            return bool(getattr(resp, "valid", False) or (isinstance(resp, dict) and resp.get("valid")))
        except Exception:
            return False

    def refresh(self) -> dict[str, Any]:
        if not self.token:
            raise ClawDBAuthError("No active session to refresh")

        def _call() -> dict[str, Any]:
            try:
                resp = self._stub.RefreshSession({"token": self.token}, metadata=make_metadata(self.token, self._api_key))
                data = _proto_session_to_dict(resp)
                self.token = data.get("token")
                self.session_data = data
                return data
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def revoke_by_id(self, session_id: str) -> bool:
        def _call() -> bool:
            try:
                resp = self._stub.RevokeSession({"session_id": session_id}, metadata=make_metadata(self.token, self._api_key))
                return bool(getattr(resp, "revoked", False) or (isinstance(resp, dict) and resp.get("revoked")))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def active_count(self) -> int:
        def _call() -> int:
            try:
                resp = self._stub.ActiveSessionCount({}, metadata=make_metadata(self.token, self._api_key))
                return int(getattr(resp, "count", 0) or (isinstance(resp, dict) and resp.get("count", 0)))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def revoke(self) -> None:
        if not self.token:
            return
        try:
            self._stub.RevokeSession({"token": self.token}, metadata=make_metadata(self.token, self._api_key))
        except Exception:
            pass
        finally:
            self.token = None
            self.session_data = None


def _proto_session_to_dict(resp: Any) -> dict[str, Any]:
    if isinstance(resp, dict):
        return resp
    try:
        from google.protobuf.json_format import MessageToDict
        return MessageToDict(resp, preserving_proto_field_name=True)
    except Exception:
        return {}

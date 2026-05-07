"""Transactional memory client for ClawDB."""
from __future__ import annotations

import json
from typing import Any

from clawdb._transport import make_metadata, with_retry
from clawdb.errors import ClawDBError
from clawdb.models import TxInfo


class TxClient:
    def __init__(self, stub: Any, session: Any, api_key: str = "") -> None:
        self._stub = stub
        self._session = session
        self._api_key = api_key

    def _meta(self) -> list[tuple[str, str]]:
        return make_metadata(self._session.token, self._api_key)

    def begin(self) -> TxInfo:
        def _call() -> TxInfo:
            try:
                resp = self._stub.BeginTx({}, metadata=self._meta())
                return TxInfo.model_validate(_to_dict(resp))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def remember(self, tx_id: str, content: str) -> str:
        def _call() -> str:
            try:
                resp = self._stub.TxRemember({"tx_id": tx_id, "content": content}, metadata=self._meta())
                return str(resp.memory_id) if hasattr(resp, "memory_id") else _to_dict(resp).get("memory_id", "")
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def remember_typed(self, tx_id: str, content: str, *, type: str = "context", tags: list[str] | None = None, metadata: dict[str, Any] | None = None) -> str:
        def _call() -> str:
            try:
                resp = self._stub.TxRememberTyped(
                    {
                        "tx_id": tx_id,
                        "content": content,
                        "type": type,
                        "tags": tags or [],
                        "metadata_json": json.dumps(metadata or {}),
                    },
                    metadata=self._meta(),
                )
                return str(resp.memory_id) if hasattr(resp, "memory_id") else _to_dict(resp).get("memory_id", "")
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def commit(self, tx_id: str) -> bool:
        def _call() -> bool:
            try:
                resp = self._stub.CommitTx({"tx_id": tx_id}, metadata=self._meta())
                return bool(resp.committed) if hasattr(resp, "committed") else bool(_to_dict(resp).get("committed"))
            except Exception as exc:
                raise ClawDBError.from_grpc_error(exc) from exc

        return with_retry(_call)

    def rollback(self, tx_id: str) -> bool:
        def _call() -> bool:
            try:
                resp = self._stub.RollbackTx({"tx_id": tx_id}, metadata=self._meta())
                return bool(resp.rolled_back) if hasattr(resp, "rolled_back") else bool(_to_dict(resp).get("rolled_back"))
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

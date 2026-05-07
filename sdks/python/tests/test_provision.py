from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from clawdb.async_client import AsyncClawDB
from clawdb.client import ClawDB
from clawdb.provision import ProvisionResult, resolve_endpoint


@pytest.mark.asyncio
async def test_resolve_endpoint_prefers_running_local_server() -> None:
    with patch("clawdb.provision._is_port_open", return_value=True):
        result = await resolve_endpoint()
    assert result == ProvisionResult(endpoint="http://localhost:50050", api_key=None)


def test_sync_connect_auto_resolves_local_endpoint() -> None:
    db = ClawDB()
    fake_channel = MagicMock()
    fake_session = MagicMock()

    with patch("clawdb.client.resolve_endpoint", return_value=ProvisionResult(endpoint="http://localhost:50050", api_key=None)), \
         patch("clawdb.client.create_channel", return_value=fake_channel), \
         patch("clawdb.client._load_stub", return_value=MagicMock()), \
         patch("clawdb.client.SessionClient", return_value=fake_session):
        db.connect()

    assert db._config.endpoint == "http://localhost:50050"
    fake_session.create.assert_called_once()


@pytest.mark.asyncio
async def test_async_connect_auto_resolves_local_endpoint() -> None:
    db = AsyncClawDB()
    fake_channel = MagicMock()
    fake_channel.close = MagicMock()
    fake_session = MagicMock()
    fake_session.create = MagicMock()

    with patch("clawdb.async_client.resolve_endpoint", return_value=ProvisionResult(endpoint="http://localhost:50050", api_key=None)), \
         patch("clawdb.async_client.create_async_channel", return_value=fake_channel), \
         patch("clawdb.async_client._load_async_stub", return_value=MagicMock()), \
         patch("clawdb.session.SessionClient", return_value=fake_session), \
         patch("clawdb.async_client.asyncio.get_event_loop") as get_loop:
        loop = MagicMock()

        async def run_in_executor(*args, **kwargs):
            fake_session.create()
            return None

        loop.run_in_executor.side_effect = run_in_executor
        get_loop.return_value = loop
        await db.connect()

    assert db._config.endpoint == "http://localhost:50050"
    fake_session.create.assert_called_once()

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from pydantic import Field
from pydantic_settings import BaseSettings


class ClawDBConfig(BaseSettings):
    """ClawDB configuration. Reads CLAWDB_* environment variables automatically."""

    endpoint: str = Field(default="http://localhost:50050", validation_alias="CLAWDB_ENDPOINT")
    api_key: str = Field(default="", validation_alias="CLAWDB_API_KEY")
    agent_id: str = Field(default="default-agent", validation_alias="CLAWDB_AGENT_ID")
    workspace: str = Field(default="default", validation_alias="CLAWDB_WORKSPACE")
    role: str = Field(default="assistant", validation_alias="CLAWDB_ROLE")
    region: str = Field(default="local", validation_alias="CLAWDB_REGION")
    timeout_ms: int = Field(default=30000, validation_alias="CLAWDB_TIMEOUT_MS")
    tls: bool = Field(default=False, validation_alias="CLAWDB_TLS")
    log_level: str = Field(default="INFO", validation_alias="CLAWDB_LOG_LEVEL")

    model_config = {"populate_by_name": True, "extra": "ignore"}

    @classmethod
    def from_env(cls) -> "ClawDBConfig":
        return cls()

    @classmethod
    def from_toml(cls, path: str | None = None) -> "ClawDBConfig":
        """Read config from TOML file, merging with env vars (env takes priority)."""
        toml_path = Path(path or Path.home() / ".clawdb" / "config.toml")
        overrides: dict[str, Any] = {}

        if toml_path.exists():
            try:
                import tomllib  # Python 3.11+
            except ImportError:
                try:
                    import tomli as tomllib  # type: ignore[no-reattr]
                except ImportError:
                    return cls()

            with open(toml_path, "rb") as fh:
                raw = tomllib.load(fh)

            key_map = {
                "endpoint": "endpoint",
                "api_key": "api_key",
                "agent_id": "agent_id",
                "workspace": "workspace",
                "role": "role",
                "region": "region",
                "timeout_ms": "timeout_ms",
                "tls": "tls",
                "log_level": "log_level",
            }
            for toml_key, attr in key_map.items():
                if toml_key in raw:
                    overrides[attr] = raw[toml_key]

        return cls(**overrides)

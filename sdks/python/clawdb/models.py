from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

MemoryType = Literal["context", "task", "tool_output", "session", "reasoning_trace", "message", "summary"]
BranchStatus = Literal["active", "dormant", "merged", "discarded", "archived"]
ReflectJobStatus = Literal["pending", "running", "completed", "failed"]


class MemoryRecord(BaseModel):
    id: str
    agent_id: str
    content: str
    memory_type: MemoryType
    metadata: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    importance_score: float
    is_promoted: bool
    created_at: datetime
    updated_at: datetime


class SearchResult(BaseModel):
    memory: MemoryRecord
    score: float


class BranchInfo(BaseModel):
    id: str
    name: str
    status: BranchStatus
    parent_id: str | None
    created_at: datetime
    divergence_score: float


class SyncResult(BaseModel):
    pushed: int
    pulled: int
    conflicts: int
    synced_at: datetime


class ReflectJob(BaseModel):
    job_id: str
    status: ReflectJobStatus
    processed: int
    archived: int
    promoted: int


class AgentProfile(BaseModel):
    preferences: dict[str, Any] = Field(default_factory=dict)
    facts: dict[str, Any] = Field(default_factory=dict)
    memory_count: int
    last_updated_at: datetime


class DiffResult(BaseModel):
    added: int
    removed: int
    modified: int
    divergence_score: float
    entity_diffs: list[dict[str, Any]] = Field(default_factory=list)


class MergeResult(BaseModel):
    applied: int
    conflicts: list[dict[str, Any]] = Field(default_factory=list)
    success: bool


class SyncStatus(BaseModel):
    connected: bool
    pending_push: int
    last_sync_at: datetime | None

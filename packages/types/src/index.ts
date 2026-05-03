export interface MemoryRecord {
  id: string;
  agentId: string;
  content: string;
  memoryType: MemoryType;
  metadata: Record<string, unknown>;
  tags: string[];
  importanceScore: number;
  isPromoted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type MemoryType =
  | 'context'
  | 'task'
  | 'tool_output'
  | 'session'
  | 'reasoning_trace'
  | 'message'
  | 'summary';

export interface SearchResult {
  memory: MemoryRecord;
  score: number;
}

export interface BranchInfo {
  id: string;
  name: string;
  status: BranchStatus;
  parentId: string | null;
  createdAt: Date;
  divergenceScore: number;
}

export type BranchStatus = 'active' | 'dormant' | 'merged' | 'discarded' | 'archived';

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  syncedAt: Date;
}

export interface ReflectJob {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  processed: number;
  archived: number;
  promoted: number;
}

export interface ClawDBSession {
  agentId: string;
  role: string;
  scopes: string[];
  token: string;
  expiresAt: Date;
}

export interface ClawDBConfig {
  endpoint?: string;
  apiKey?: string;
  agentId?: string;
  role?: string;
  workspace?: string;
  region?: string;
  timeout?: number;
  tls?: boolean;
}

export type ClawDBError = {
  code: ClawDBErrorCode;
  message: string;
  details?: unknown;
};

export type ClawDBErrorCode =
  | 'AUTH_FAILED'
  | 'ACCESS_DENIED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'TIMEOUT'
  | 'INVALID_INPUT'
  | 'INTERNAL';

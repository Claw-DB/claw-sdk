import type { ServiceDefinition, ServiceMethodDefinition } from '../types';

export interface MemoryEntry {
  id: string;
  agentId: string;
  content: string;
  memoryType: string;
  metadataJson: Uint8Array;
  tags: string[];
  createdAt: number;
  importanceScore: number;
  isPromoted: boolean;
}

export interface RememberRequest {
  agentId: string;
  content: string;
  memoryType: string;
  metadataJson: Uint8Array;
  tags: string[];
  sessionToken: string;
}

export interface RememberResponse {
  memoryId: string;
  importanceScore: number;
  guardApplied: boolean;
}

export interface SearchRequest {
  agentId: string;
  query: string;
  semantic: boolean;
  topK: number;
  filterJson: Uint8Array;
  sessionToken: string;
  alpha: number;
}

export interface SearchResponse {
  results: MemoryEntry[];
  latencyMs: number;
  searchType: string;
}

export interface RecallRequest {
  agentId: string;
  memoryIds: string[];
  sessionToken: string;
}

export interface RecallResponse {
  memories: MemoryEntry[];
  deniedIds: string[];
}

export interface BranchRequest {
  agentId: string;
  parentBranchName: string;
  newBranchName: string;
  description: string;
  sessionToken: string;
}

export interface BranchResponse {
  branchId: string;
  branchName: string;
  createdAt: number;
}

export interface MergeRequest {
  agentId: string;
  sourceBranch: string;
  targetBranch: string;
  strategy: string;
  sessionToken: string;
}

export interface MergeResponse {
  success: boolean;
  applied: number;
  conflicts: number;
  conflictIds: string[];
}

export interface DiffRequest {
  agentId: string;
  branchA: string;
  branchB: string;
  sessionToken: string;
}

export interface DiffResponse {
  added: number;
  removed: number;
  modified: number;
  divergenceScore: number;
  diffJson: Uint8Array;
}

export interface SyncRequest {
  agentId: string;
  workspaceId: string;
  sessionToken: string;
}

export interface SyncResponse {
  success: boolean;
  pushed: number;
  pulled: number;
  conflicts: number;
  syncedAt: number;
}

export interface ReflectRequest {
  agentId: string;
  jobType: string;
  dryRun: boolean;
  sessionToken: string;
}

export interface ReflectResponse {
  jobId: string;
  processed: number;
  archived: number;
  promoted: number;
}

export interface SessionRequest {
  agentId: string;
  role: string;
  scopes: string[];
  taskType: string;
}

export interface SessionResponse {
  sessionToken: string;
  expiresAt: number;
  grantedScopes: string[];
}

export interface HealthRequest {}

export interface HealthResponse {
  ok: boolean;
  componentStatus: Record<string, string>;
  version: string;
  uptimeSecs: number;
}

export interface StatusRequest {
  agentId: string;
  sessionToken: string;
}

export interface StatusResponse {
  memoryCount: number;
  sessionCount: number;
  activeBranch: string;
  syncConnected: boolean;
  lastReflectAgoSecs: number;
  agentStatsJson: Uint8Array;
}

export interface EventMessage {
  eventType: string;
  agentId: string;
  payloadJson: Uint8Array;
  timestamp: number;
}

export interface ClawDBServiceClient {
  remember(request: RememberRequest): Promise<RememberResponse>;
  search(request: SearchRequest): Promise<SearchResponse>;
  recall(request: RecallRequest): Promise<RecallResponse>;
  branch(request: BranchRequest): Promise<BranchResponse>;
  merge(request: MergeRequest): Promise<MergeResponse>;
  diff(request: DiffRequest): Promise<DiffResponse>;
  sync(request: SyncRequest): Promise<SyncResponse>;
  reflect(request: ReflectRequest): Promise<ReflectResponse>;
  createSession(request: SessionRequest): Promise<SessionResponse>;
  health(request: HealthRequest): Promise<HealthResponse>;
  status(request: StatusRequest): Promise<StatusResponse>;
  streamEvents(request: SessionRequest): AsyncIterable<EventMessage>;
}

type ClawDBServiceMethods = {
  remember: ServiceMethodDefinition<RememberRequest, RememberResponse>;
  search: ServiceMethodDefinition<SearchRequest, SearchResponse>;
  recall: ServiceMethodDefinition<RecallRequest, RecallResponse>;
  branch: ServiceMethodDefinition<BranchRequest, BranchResponse>;
  merge: ServiceMethodDefinition<MergeRequest, MergeResponse>;
  diff: ServiceMethodDefinition<DiffRequest, DiffResponse>;
  sync: ServiceMethodDefinition<SyncRequest, SyncResponse>;
  reflect: ServiceMethodDefinition<ReflectRequest, ReflectResponse>;
  createSession: ServiceMethodDefinition<SessionRequest, SessionResponse>;
  health: ServiceMethodDefinition<HealthRequest, HealthResponse>;
  status: ServiceMethodDefinition<StatusRequest, StatusResponse>;
  streamEvents: ServiceMethodDefinition<SessionRequest, EventMessage>;
};

const method = <TReq, TRes>(name: string): ServiceMethodDefinition<TReq, TRes> => ({
  name,
  path: `/clawdb.v1.ClawDBService/${name}`,
  requestStream: false,
  responseStream: name === 'StreamEvents'
});

export const ClawDBServiceDefinition: ServiceDefinition<ClawDBServiceMethods> = {
  name: 'ClawDBService',
  fullName: 'clawdb.v1.ClawDBService',
  methods: {
    remember: method<RememberRequest, RememberResponse>('Remember'),
    search: method<SearchRequest, SearchResponse>('Search'),
    recall: method<RecallRequest, RecallResponse>('Recall'),
    branch: method<BranchRequest, BranchResponse>('Branch'),
    merge: method<MergeRequest, MergeResponse>('Merge'),
    diff: method<DiffRequest, DiffResponse>('Diff'),
    sync: method<SyncRequest, SyncResponse>('Sync'),
    reflect: method<ReflectRequest, ReflectResponse>('Reflect'),
    createSession: method<SessionRequest, SessionResponse>('CreateSession'),
    health: method<HealthRequest, HealthResponse>('Health'),
    status: method<StatusRequest, StatusResponse>('Status'),
    streamEvents: method<SessionRequest, EventMessage>('StreamEvents')
  }
};

import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import * as grpc from '@grpc/grpc-js';

export interface MemoryOptions {
  memoryType?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface SearchOptions {
  topK?: number;
  semantic?: boolean;
  filter?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface SearchHit {
  id: string;
  content: string;
  score: number;
  memoryType: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface BranchInfo {
  id: string;
  name: string;
  status: string;
  parentId?: string;
  createdAt?: Date;
}

export interface MergeResult {
  success: boolean;
  applied: number;
  conflicts: string[];
}

export interface SyncStatus {
  connected: boolean;
  pendingPush?: number;
  lastSyncAt?: Date | null;
}

export interface ReflectJob {
  id: string;
  status: string;
}

export interface HealthStatus {
  ok: boolean;
  version?: string;
  components?: Record<string, string>;
}

export interface ClawDBConfig {
  endpoint?: string;
  apiKey?: string;
  agentId?: string;
  workspaceId?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Internal flag used by SDK health probes to avoid recursive local bootstrap. */
  __skipLocalBootstrap?: boolean;
}

type UnaryOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

type RawClient = grpc.Client;

const RETRYABLE = new Set<number>([
  grpc.status.UNAVAILABLE,
  grpc.status.DEADLINE_EXCEEDED,
  grpc.status.RESOURCE_EXHAUSTED,
  grpc.status.INTERNAL
]);

const NON_RETRYABLE = new Set<number>([
  grpc.status.UNAUTHENTICATED,
  grpc.status.PERMISSION_DENIED,
  grpc.status.NOT_FOUND
]);

const LOCAL_ENDPOINT = 'http://127.0.0.1:50050';
const CLOUD_ENDPOINT = 'https://cloud.clawdb.dev';
const SERVICE = 'clawdb.v1.ClawDBService';

const channelPool = new Map<string, RawClient>();

function debugEnabled(): boolean {
  return process.env.CLAWDB_DEBUG === '1';
}

function debugLog(payload: Record<string, unknown>): void {
  if (debugEnabled()) {
    process.stderr.write(`${JSON.stringify({ scope: 'clawdb-sdk', ...payload })}\n`);
  }
}

function normalizeEndpoint(endpoint: string): string {
  if (endpoint.startsWith('http://')) {
    return endpoint.replace(/^http:\/\//u, '');
  }
  if (endpoint.startsWith('https://')) {
    return endpoint.replace(/^https:\/\//u, '');
  }
  return endpoint;
}

function credentialsForEndpoint(endpoint: string): grpc.ChannelCredentials {
  return endpoint.startsWith('https://')
    ? grpc.credentials.createSsl()
    : grpc.credentials.createInsecure();
}

function getOrCreateClient(endpoint: string): RawClient {
  const key = endpoint;
  const found = channelPool.get(key);
  if (found) {
    return found;
  }
  const client = new grpc.Client(normalizeEndpoint(endpoint), credentialsForEndpoint(endpoint));
  channelPool.set(key, client);
  return client;
}

function parseDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'number') {
    return new Date(value > 2_000_000_000 ? value : value * 1000);
  }
  if (typeof value === 'string') {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && asNum > 0) {
      return new Date(asNum > 2_000_000_000 ? asNum : asNum * 1000);
    }
    return new Date(value);
  }
  return new Date();
}

function encodeJson(payload: unknown): Buffer {
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

function decodeJson(buffer: Buffer): unknown {
  if (buffer.length === 0) {
    return {};
  }
  return JSON.parse(buffer.toString('utf8')) as unknown;
}

function grpcMethodPath(method: string): string {
  return `/${SERVICE}/${method}`;
}

function toClawError(error: unknown): ClawDBError {
  if (error instanceof ClawDBError) {
    return error;
  }
  const grpcErr = error as grpc.ServiceError;
  const code = typeof grpcErr?.code === 'number' ? grpcErr.code : grpc.status.UNKNOWN;
  const message = grpcErr?.message ?? 'Unknown gRPC error';
  const md = grpcErr?.metadata;
  const requestId = md?.get('x-request-id')?.[0]?.toString();

  if (code === grpc.status.UNAUTHENTICATED || code === grpc.status.PERMISSION_DENIED) {
    return new ClawDBAuthError(message, code, requestId);
  }
  if (code === grpc.status.NOT_FOUND) {
    return new ClawDBNotFoundError(message, code, requestId);
  }
  if (code === grpc.status.RESOURCE_EXHAUSTED) {
    const retryAfter = md?.get('retry-after-ms')?.[0];
    const retryAfterMs = retryAfter ? Number(String(retryAfter)) : undefined;
    return new ClawDBRateLimitError(message, code, requestId, Number.isFinite(retryAfterMs) ? retryAfterMs : undefined);
  }
  if (code === grpc.status.DEADLINE_EXCEEDED || code === grpc.status.CANCELLED) {
    return new ClawDBTimeoutError(message, code, requestId);
  }
  if (code === grpc.status.UNAVAILABLE || code === grpc.status.INTERNAL) {
    return new ClawDBUnavailableError(message, code, requestId);
  }
  return new ClawDBError(message, code, requestId);
}

export class ClawDBError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly requestId?: string,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'ClawDBError';
  }
}

export class ClawDBAuthError extends ClawDBError {
  constructor(message: string, code: number, requestId?: string) {
    super(message, code, requestId);
    this.name = 'ClawDBAuthError';
  }
}

export class ClawDBNotFoundError extends ClawDBError {
  constructor(message: string, code: number, requestId?: string) {
    super(message, code, requestId);
    this.name = 'ClawDBNotFoundError';
  }
}

export class ClawDBRateLimitError extends ClawDBError {
  constructor(message: string, code: number, requestId?: string, retryAfterMs?: number) {
    super(message, code, requestId, retryAfterMs);
    this.name = 'ClawDBRateLimitError';
  }
}

export class ClawDBUnavailableError extends ClawDBError {
  constructor(message: string, code: number, requestId?: string) {
    super(message, code, requestId);
    this.name = 'ClawDBUnavailableError';
  }
}

export class ClawDBTimeoutError extends ClawDBError {
  constructor(message: string, code: number, requestId?: string) {
    super(message, code, requestId);
    this.name = 'ClawDBTimeoutError';
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function computeRetryDelay(attempt: number): number {
  const base = Math.min(30_000, 200 * 2 ** (attempt - 1));
  return base * (0.5 + Math.random() * 0.5);
}

function platformId(): string {
  if (process.platform === 'linux' && process.arch === 'x64') return 'linux-x64';
  if (process.platform === 'linux' && process.arch === 'arm64') return 'linux-arm64';
  if (process.platform === 'darwin' && process.arch === 'x64') return 'darwin-x64';
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'darwin-arm64';
  if (process.platform === 'win32' && process.arch === 'x64') return 'win32-x64';
  throw new Error(`Unsupported platform: ${process.platform}-${process.arch}`);
}

async function downloadFile(url: string, targetFile: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${url} (${response.status})`);
  }

  mkdirSync(dirname(targetFile), { recursive: true });
  const bytes = await response.arrayBuffer();
  writeFileSync(targetFile, Buffer.from(bytes));
}

function releaseBaseCandidates(): string[] {
  const configured = process.env.CLAWDB_SERVER_RELEASE_BASE_URL?.trim();
  const candidates = [
    configured,
    'https://github.com/Claw-DB/ClawDB/releases/latest/download',
    'https://github.com/clawdb/clawdb/releases/latest/download',
    'https://github.com/claw-db/clawdb/releases/latest/download'
  ].filter((value): value is string => Boolean(value && value.length > 0));

  return Array.from(new Set(candidates));
}

function sha256(filePath: string): string {
  const hash = createHash('sha256');
  hash.update(readFileSync(filePath));
  return hash.digest('hex');
}

function parseChecksums(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([a-fA-F0-9]{64})\s+\*?(\S+)$/u);
    if (match) {
      map.set(match[2], match[1].toLowerCase());
    }
  }
  return map;
}

async function resolveReleaseBase(archiveName: string): Promise<{ base: string; checksums: Map<string, string> }> {
  for (const base of releaseBaseCandidates()) {
    try {
      const checksumsResponse = await fetch(`${base}/checksums.txt`);
      if (!checksumsResponse.ok) {
        continue;
      }
      const checksums = parseChecksums(await checksumsResponse.text());
      if (checksums.has(archiveName)) {
        return { base, checksums };
      }
    } catch {
      // try next base candidate
    }
  }

  throw new Error(
    'Unable to auto-provision clawdb-server: no downloadable release assets were found. ' +
    'Install clawdb-server manually on PATH, or set CLAWDB_SERVER_RELEASE_BASE_URL to a valid releases download URL.'
  );
}

function startDetachedServer(binaryPath: string): Promise<number> {
  return new Promise<number>((resolveStart, rejectStart) => {
    const child = spawn(binaryPath, ['--port', '50050'], {
      detached: true,
      stdio: 'ignore'
    });

    child.once('error', (error) => {
      rejectStart(error);
    });

    child.once('spawn', () => {
      child.unref();
      if (typeof child.pid !== 'number') {
        rejectStart(new Error('Failed to start clawdb-server process'));
        return;
      }
      resolveStart(child.pid);
    });
  });
}

async function waitForHealth(endpoint: string, timeoutMs: number): Promise<boolean> {
  const db = new ClawDB({ endpoint, timeoutMs: 500, maxRetries: 1, __skipLocalBootstrap: true });
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await db.ping();
      return true;
    } catch {
      await sleep(100);
    }
  }
  return false;
}

async function ensureLocalServerAvailable(): Promise<string> {
  if (await waitForHealth(LOCAL_ENDPOINT, 500)) {
    return LOCAL_ENDPOINT;
  }

  try {
    const pid = await startDetachedServer('clawdb-server');
    mkdirSync(join(homedir(), '.clawdb'), { recursive: true });
    writeFileSync(join(homedir(), '.clawdb', 'server.pid'), String(pid), 'utf8');
    if (await waitForHealth(LOCAL_ENDPOINT, 5_000)) {
      return LOCAL_ENDPOINT;
    }
  } catch {
    // fallback to download path
  }

  const platform = platformId();
  const archiveName = `clawdb-server-${platform}.tar.gz`;
  const { base, checksums } = await resolveReleaseBase(archiveName);

  const binDir = join(homedir(), '.clawdb', 'bin');
  const tempArchive = join(binDir, `${archiveName}.tmp`);
  const finalBinary = process.platform === 'win32'
    ? join(binDir, 'clawdb-server.exe')
    : join(binDir, 'clawdb-server');

  await downloadFile(`${base}/${archiveName}`, tempArchive);
  const expected = checksums.get(archiveName);
  if (!expected) {
    throw new Error(`Missing checksum for ${archiveName}`);
  }

  const actual = sha256(tempArchive);
  if (actual !== expected) {
    unlinkSync(tempArchive);
    throw new Error('Downloaded clawdb-server checksum verification failed');
  }

  mkdirSync(binDir, { recursive: true });
  const extract = spawn('tar', ['-xzf', tempArchive, '-C', binDir]);
  await new Promise<void>((resolveExtract, rejectExtract) => {
    extract.on('exit', (code) => {
      if (code === 0) {
        resolveExtract();
      } else {
        rejectExtract(new Error(`tar extraction failed with code ${code ?? -1}`));
      }
    });
    extract.on('error', rejectExtract);
  });

  const candidates = [
    join(binDir, `clawdb-server-${platform}`),
    join(binDir, 'clawdb-server'),
    join(binDir, 'clawdb-server.exe')
  ];

  const extracted = candidates.find((candidate) => existsSync(candidate));
  if (!extracted) {
    throw new Error('Downloaded archive did not contain clawdb-server binary');
  }

  renameSync(extracted, finalBinary);
  if (process.platform !== 'win32') {
    chmodSync(finalBinary, 0o755);
  }

  const pid = await startDetachedServer(finalBinary);
  mkdirSync(resolve(homedir(), '.clawdb'), { recursive: true });
  writeFileSync(join(homedir(), '.clawdb', 'server.pid'), String(pid), 'utf8');

  if (!(await waitForHealth(LOCAL_ENDPOINT, 5_000))) {
    throw new Error('clawdb-server did not become healthy within 5 seconds');
  }

  return LOCAL_ENDPOINT;
}

function deriveAgentId(): string {
  const envAgentId = process.env.CLAWDB_AGENT_ID;
  if (envAgentId && envAgentId.trim().length > 0) {
    return envAgentId;
  }
  const host = process.env.HOSTNAME ?? 'localhost';
  return `${host}-${process.pid}`;
}

export class ClawDB extends EventEmitter {
  public static readonly version: string = '0.1.5';

  readonly endpoint: string;
  readonly apiKey?: string;
  readonly agentId: string;
  readonly workspaceId?: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;

  private readonly client: RawClient;
  private readonly skipLocalBootstrap: boolean;
  private shouldWatchConnectivity = true;
  private localBootstrapPromise?: Promise<void>;

  readonly memory: {
    remember: (content: string, opts?: MemoryOptions) => Promise<string>;
    search: (query: string, opts?: SearchOptions) => Promise<SearchHit[]>;
    recall: (ids: string[]) => Promise<SearchHit[]>;
    delete: (id: string) => Promise<void>;
    list: (opts?: { type?: string; limit?: number; cursor?: string }) => Promise<{ hits: SearchHit[]; nextCursor?: string }>;
  };

  readonly branch: {
    fork: (name: string) => Promise<BranchInfo>;
    merge: (branchId: string, strategy?: 'last-write' | 'source-wins') => Promise<MergeResult>;
    diff: (branchA: string, branchB: string) => Promise<Record<string, unknown>>;
    list: () => Promise<BranchInfo[]>;
    discard: (branchId: string) => Promise<void>;
  };

  readonly sync: {
    now: () => Promise<SyncStatus>;
    status: () => Promise<SyncStatus>;
  };

  readonly reflect: {
    run: () => Promise<ReflectJob>;
    status: (id: string) => Promise<ReflectJob>;
  };

  readonly session: {
    create: () => Promise<{ token?: string }>;
    revoke: () => Promise<void>;
    whoami: () => Promise<{ agentId: string }>;
  };

  readonly health: {
    check: () => Promise<HealthStatus>;
  };

  constructor(config: ClawDBConfig = {}) {
    super();

    this.endpoint = config.endpoint ?? LOCAL_ENDPOINT;
    this.apiKey = config.apiKey;
    this.agentId = config.agentId ?? deriveAgentId();
    this.workspaceId = config.workspaceId;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.skipLocalBootstrap = config.__skipLocalBootstrap ?? false;

    this.client = getOrCreateClient(this.endpoint);
    this.watchConnectivity();

    this.memory = {
      remember: async (content, opts = {}) => {
        const response = await this.unaryCall<{ memory_id?: string; memoryId?: string }>('Remember', {
          agent_id: this.agentId,
          content,
          memory_type: opts.memoryType ?? 'message',
          tags: opts.tags ?? [],
          metadata: opts.metadata ?? {}
        });
        return response.memory_id ?? response.memoryId ?? '';
      },
      search: async (query, opts = {}) => {
        const response = await this.unaryCall<{ results?: Array<Record<string, unknown>> }>(
          'Search',
          {
            agent_id: this.agentId,
            query,
            top_k: opts.topK ?? 10,
            semantic: opts.semantic ?? true,
            filter: opts.filter ?? {}
          },
          { signal: opts.signal }
        );
        const results = response.results ?? [];
        const hits = results.map((raw): SearchHit => ({
          id: String(raw.id ?? ''),
          content: String(raw.content ?? ''),
          score: Number(raw.score ?? 0),
          memoryType: String(raw.memory_type ?? raw.memoryType ?? 'message'),
          tags: Array.isArray(raw.tags) ? raw.tags.map((v) => String(v)) : [],
          metadata: (raw.metadata as Record<string, unknown>) ?? {},
          createdAt: parseDate(raw.created_at ?? raw.createdAt)
        }));
        hits.sort((a, b) => b.score - a.score);
        return hits;
      },
      recall: async (ids) => {
        const response = await this.unaryCall<{ memories?: Array<Record<string, unknown>> }>('Recall', {
          agent_id: this.agentId,
          ids
        });
        return (response.memories ?? []).map((raw): SearchHit => ({
          id: String(raw.id ?? ''),
          content: String(raw.content ?? ''),
          score: Number(raw.score ?? 0),
          memoryType: String(raw.memory_type ?? raw.memoryType ?? 'message'),
          tags: Array.isArray(raw.tags) ? raw.tags.map((v) => String(v)) : [],
          metadata: (raw.metadata as Record<string, unknown>) ?? {},
          createdAt: parseDate(raw.created_at ?? raw.createdAt)
        }));
      },
      delete: async (id) => {
        await this.unaryCall('DeleteMemory', { agent_id: this.agentId, id });
      },
      list: async (opts = {}) => {
        const response = await this.unaryCall<{ hits?: Array<Record<string, unknown>>; next_cursor?: string; nextCursor?: string }>('ListMemories', {
          agent_id: this.agentId,
          type: opts.type,
          limit: opts.limit,
          cursor: opts.cursor
        });
        return {
          hits: (response.hits ?? []).map((raw): SearchHit => ({
            id: String(raw.id ?? ''),
            content: String(raw.content ?? ''),
            score: Number(raw.score ?? 0),
            memoryType: String(raw.memory_type ?? raw.memoryType ?? 'message'),
            tags: Array.isArray(raw.tags) ? raw.tags.map((v) => String(v)) : [],
            metadata: (raw.metadata as Record<string, unknown>) ?? {},
            createdAt: parseDate(raw.created_at ?? raw.createdAt)
          })),
          nextCursor: response.next_cursor ?? response.nextCursor
        };
      }
    };

    this.branch = {
      fork: (name) => this.unaryCall<BranchInfo>('ForkBranch', { agent_id: this.agentId, name }),
      merge: (branchId, strategy = 'last-write') => this.unaryCall<MergeResult>('MergeBranch', { agent_id: this.agentId, branch_id: branchId, strategy }),
      diff: (branchA, branchB) => this.unaryCall<Record<string, unknown>>('DiffBranch', { agent_id: this.agentId, branch_a: branchA, branch_b: branchB }),
      list: () => this.unaryCall<BranchInfo[]>('ListBranches', { agent_id: this.agentId }),
      discard: async (branchId) => {
        await this.unaryCall('DiscardBranch', { agent_id: this.agentId, branch_id: branchId });
      }
    };

    this.sync = {
      now: () => this.unaryCall<SyncStatus>('SyncNow', { agent_id: this.agentId }),
      status: () => this.unaryCall<SyncStatus>('SyncStatus', { agent_id: this.agentId })
    };

    this.reflect = {
      run: () => this.unaryCall<ReflectJob>('ReflectRun', { agent_id: this.agentId }),
      status: (id) => this.unaryCall<ReflectJob>('ReflectStatus', { agent_id: this.agentId, id })
    };

    this.session = {
      create: () => this.unaryCall<{ token?: string }>('CreateSession', { agent_id: this.agentId }),
      revoke: async () => {
        await this.unaryCall('RevokeSession', { agent_id: this.agentId });
      },
      whoami: () => this.unaryCall<{ agentId: string }>('WhoAmI', { agent_id: this.agentId })
    };

    this.health = {
      check: () => this.unaryCall<HealthStatus>('HealthCheck', {})
    };
  }

  static fromEnv(): ClawDB {
    const timeoutRaw = Number(process.env.CLAWDB_TIMEOUT_MS ?? '10000');
    const retriesRaw = Number(process.env.CLAWDB_MAX_RETRIES ?? '3');
    return new ClawDB({
      endpoint: process.env.CLAWDB_URL,
      apiKey: process.env.CLAWDB_API_KEY,
      agentId: process.env.CLAWDB_AGENT_ID,
      workspaceId: process.env.CLAWDB_WORKSPACE_ID,
      timeoutMs: Number.isFinite(timeoutRaw) ? timeoutRaw : 10_000,
      maxRetries: Number.isFinite(retriesRaw) ? retriesRaw : 3
    });
  }

  static async autoProvision(config: Omit<ClawDBConfig, 'endpoint' | 'apiKey'> = {}): Promise<ClawDB> {
    const explicitUrl = process.env.CLAWDB_URL;
    if (explicitUrl && explicitUrl.trim().length > 0) {
      const db = new ClawDB({ ...config, endpoint: explicitUrl });
      await db.ping();
      return db;
    }

    const apiKey = process.env.CLAWDB_API_KEY;
    if (apiKey && apiKey.trim().length > 0) {
      const db = new ClawDB({ ...config, endpoint: CLOUD_ENDPOINT, apiKey });
      await db.ping();
      return db;
    }

    if (await waitForHealth(LOCAL_ENDPOINT, 500)) {
      return new ClawDB({ ...config, endpoint: LOCAL_ENDPOINT });
    }

    const endpoint = await ensureLocalServerAvailable();
    return new ClawDB({ ...config, endpoint });
  }

  async ping(): Promise<void> {
    await this.unaryCall('HealthCheck', {}, { timeoutMs: 500 });
  }

  close(): void {
    this.shouldWatchConnectivity = false;
  }

  private usesDefaultLocalEndpoint(): boolean {
    return !this.skipLocalBootstrap && !this.apiKey && this.endpoint === LOCAL_ENDPOINT;
  }

  private async ensureEndpointReady(): Promise<void> {
    if (!this.usesDefaultLocalEndpoint()) {
      return;
    }

    if (!this.localBootstrapPromise) {
      this.localBootstrapPromise = (async () => {
        if (await waitForHealth(this.endpoint, 500)) {
          return;
        }
        await ensureLocalServerAvailable();
      })().finally(() => {
        this.localBootstrapPromise = undefined;
      });
    }

    await this.localBootstrapPromise;
  }

  private metadata(): grpc.Metadata {
    const metadata = new grpc.Metadata();
    metadata.set('x-agent-id', this.agentId);
    if (this.workspaceId) {
      metadata.set('x-workspace-id', this.workspaceId);
    }
    if (this.apiKey) {
      metadata.set('authorization', `Bearer ${this.apiKey}`);
    }
    return metadata;
  }

  private async unaryCall<TRes = unknown>(
    method: string,
    payload: Record<string, unknown>,
    options: UnaryOptions = {}
  ): Promise<TRes> {
    await this.ensureEndpointReady();

    const maxAttempts = Math.max(1, this.maxRetries);
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt += 1;
      const start = Date.now();
      try {
        const response = await this.unaryCallOnce<TRes>(method, payload, options);
        debugLog({ method, durationMs: Date.now() - start, status: 'ok' });
        return response;
      } catch (error) {
        const mapped = toClawError(error);
        debugLog({ method, durationMs: Date.now() - start, status: mapped.code, retryAttempt: attempt });

        if (NON_RETRYABLE.has(mapped.code) || attempt >= maxAttempts || !RETRYABLE.has(mapped.code)) {
          throw mapped;
        }
        await sleep(computeRetryDelay(attempt));
      }
    }

    throw new ClawDBUnavailableError('Retry attempts exhausted', grpc.status.UNAVAILABLE);
  }

  private unaryCallOnce<TRes>(
    method: string,
    payload: Record<string, unknown>,
    options: UnaryOptions
  ): Promise<TRes> {
    return new Promise<TRes>((resolveCall, rejectCall) => {
      const deadline = new Date(Date.now() + (options.timeoutMs ?? this.timeoutMs));

      const call = this.client.makeUnaryRequest(
        grpcMethodPath(method),
        encodeJson,
        decodeJson,
        payload,
        this.metadata(),
        { deadline },
        (error: grpc.ServiceError | null, response: unknown) => {
          if (abortHandler) {
            options.signal?.removeEventListener('abort', abortHandler);
          }
          if (error) {
            rejectCall(error);
            return;
          }
          resolveCall(response as TRes);
        }
      );

      const abortHandler = options.signal
        ? () => {
            call.cancel();
            rejectCall(new ClawDBTimeoutError('Request cancelled', grpc.status.CANCELLED));
          }
        : undefined;

      if (abortHandler) {
        if (options.signal?.aborted) {
          abortHandler();
          return;
        }
        options.signal?.addEventListener('abort', abortHandler, { once: true });
      }
    });
  }

  private watchConnectivity(): void {
    const channel = this.client.getChannel();
    let previous = channel.getConnectivityState(true);

    const watchOnce = (): void => {
      if (!this.shouldWatchConnectivity) {
        return;
      }

      channel.watchConnectivityState(previous, Date.now() + 60_000, (error?: Error | undefined) => {
        if (!this.shouldWatchConnectivity) {
          return;
        }
        if (error) {
          this.emit('error', error);
          watchOnce();
          return;
        }

        const next = channel.getConnectivityState(false);
        if (next === grpc.connectivityState.READY && previous !== grpc.connectivityState.READY) {
          this.emit('connected');
        }
        if (next === grpc.connectivityState.TRANSIENT_FAILURE) {
          this.emit('disconnected');
          this.emit('reconnecting');
          channel.getConnectivityState(true);
        }
        if (next === grpc.connectivityState.CONNECTING && previous !== grpc.connectivityState.CONNECTING) {
          this.emit('reconnecting');
        }

        previous = next;
        watchOnce();
      });
    };

    watchOnce();
  }
}

export default async function clawdb(config?: Omit<ClawDBConfig, 'endpoint' | 'apiKey'>): Promise<ClawDB> {
  return ClawDB.autoProvision(config);
}
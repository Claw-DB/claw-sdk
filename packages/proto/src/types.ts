export interface GrpcStatus {
  code: number;
  message?: string;
  details?: string;
  metadata?: GrpcMetadata;
}

export type GrpcMetadata =
  | Record<string, string | number | boolean | Uint8Array | Array<string | number | boolean | Uint8Array>>
  | {
      get(key: string): unknown;
    };

export interface RpcRequestOptions {
  timeoutMs?: number;
  metadata?: Record<string, string>;
  signal?: AbortSignal;
}

export interface RpcClient {
  unary<TReq, TRes>(method: string, request: TReq, options?: RpcRequestOptions): Promise<TRes>;
  stream<TReq, TRes>(method: string, request: TReq, options?: RpcRequestOptions): AsyncIterable<TRes>;
}

export interface ServiceMethodDefinition<TReq, TRes> {
  name: string;
  path: string;
  requestStream: boolean;
  responseStream: boolean;
}

export interface ServiceDefinition<TMethods extends Record<string, ServiceMethodDefinition<unknown, unknown>>> {
  name: string;
  fullName: string;
  methods: TMethods;
}

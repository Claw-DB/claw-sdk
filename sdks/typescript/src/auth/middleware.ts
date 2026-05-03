import type { ClawDB } from '../client.js';
import { decodeJwt, isJwtExpired } from './jwt.js';

/**
 * Express.js request extension — attach ClawDB session info to `req`.
 */
export interface ClawDBAuthRequest {
  clawdbSession?: {
    token: string;
    agentId: string;
    role: string;
    scopes: string[];
    workspaceId: string;
  };
}

/**
 * Creates an Express.js-compatible middleware that:
 * 1. Extracts a Bearer token from the `Authorization` header.
 * 2. Validates it (decodes + checks expiry; optionally calls the SDK session endpoint).
 * 3. Attaches decoded claims to `req.clawdbSession`.
 * 4. Calls `next()` on success, or sends 401/403 on failure.
 */
export function clawdbAuthMiddleware(
  _client: ClawDB
): (req: Record<string, unknown>, res: Record<string, unknown>, next: () => void) => void {
  return function (req, res, next) {
    const headers = req['headers'] as Record<string, string | string[] | undefined> | undefined;
    const authorization = headers?.['authorization'];
    const authHeader = Array.isArray(authorization) ? authorization[0] : authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const r = res as { status: (n: number) => { json: (b: unknown) => void } };
      r.status(401).json({ error: 'missing_token', message: 'Authorization header required' });
      return;
    }

    const token = authHeader.slice(7);

    if (isJwtExpired(token)) {
      const r = res as { status: (n: number) => { json: (b: unknown) => void } };
      r.status(401).json({ error: 'token_expired', message: 'Token has expired' });
      return;
    }

    const decoded = decodeJwt(token);
    if (!decoded) {
      const r = res as { status: (n: number) => { json: (b: unknown) => void } };
      r.status(401).json({ error: 'invalid_token', message: 'Token could not be decoded' });
      return;
    }

    (req as Record<string, unknown>)['clawdbSession'] = {
      token,
      agentId: decoded.payload.sub,
      role: decoded.payload.role,
      scopes: decoded.payload.scopes,
      workspaceId: decoded.payload.workspace_id,
    };

    next();
  };
}

/**
 * Cloudflare Workers / Next.js Edge middleware helper.
 *
 * Usage in `middleware.ts`:
 * ```ts
 * export default clawdbEdgeAuth(db);
 * ```
 *
 * Returns null to continue, or a Response to short-circuit.
 */
export async function clawdbEdgeAuth(
  _client: ClawDB,
  request: Request
): Promise<Response | null> {
  const authorization = request.headers.get('authorization');

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'missing_token', message: 'Authorization header required' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const token = authorization.slice(7);

  if (isJwtExpired(token)) {
    return new Response(
      JSON.stringify({ error: 'token_expired', message: 'Token has expired' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const decoded = decodeJwt(token);
  if (!decoded) {
    return new Response(
      JSON.stringify({ error: 'invalid_token', message: 'Token could not be decoded' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Token is valid — return null to continue request processing
  return null;
}

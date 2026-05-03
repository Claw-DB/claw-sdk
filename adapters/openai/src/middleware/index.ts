import type { ClawDB } from '@clawdb/sdk';
import { createClawDBAgentTools } from '../tools/index.js';
import { ClawDBToolHandler } from '../handlers/index.js';

/**
 * A minimal representation of an OpenAI Agents SDK Agent for duck-typing.
 * The real type comes from `openai/agents` — we use an interface to avoid a hard dep.
 */
export interface Agent {
  tools?: unknown[];
  [key: string]: unknown;
}

/**
 * Higher-order function that wraps an OpenAI Agents runner with automatic
 * ClawDB memory persistence.
 *
 * - Adds clawdb tools to the agent's tool list.
 * - Returns an agent proxy that routes clawdb_* tool calls through ClawDBToolHandler.
 *
 * @example
 * ```ts
 * const myAgent = new Agent({ model: "gpt-4o", tools: [myOtherTool] });
 * const memAgent = withClawDBMemory(myAgent, db);
 * const result = await run(memAgent, "What do you remember about the project?");
 * ```
 */
export function withClawDBMemory(runner: Agent, client: ClawDB): Agent {
  const clawdbTools = createClawDBAgentTools(client, { enableBranching: true, enableSync: true });
  const handler = new ClawDBToolHandler(client);

  const existingTools = Array.isArray(runner.tools) ? runner.tools : [];

  return new Proxy(runner, {
    get(target, prop) {
      if (prop === 'tools') {
        return [...existingTools, ...clawdbTools];
      }

      if (prop === '__clawdbHandler') {
        return handler;
      }

      const val = target[prop as string];
      return typeof val === 'function' ? val.bind(target) : val;
    },
  });
}

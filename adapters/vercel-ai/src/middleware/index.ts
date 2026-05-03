import type { ClawDB } from '@clawdb/sdk';

/**
 * Vercel AI SDK LanguageModelMiddleware duck-typed interface.
 * The real interface is provided by the `ai` package at runtime.
 */
export interface LanguageModelMiddleware {
  wrapGenerate?: (options: {
    doGenerate: () => Promise<unknown>;
    params: Record<string, unknown>;
  }) => Promise<unknown>;
  wrapStream?: (options: {
    doStream: () => Promise<unknown>;
    params: Record<string, unknown>;
  }) => Promise<unknown>;
}

/**
 * Middleware that automatically stores AI responses as memories in ClawDB.
 *
 * Wrap your `generateText` / `streamText` model with this middleware to
 * persist every AI response for long-term recall.
 *
 * @example
 * ```ts
 * import { clawdbMiddleware } from '@clawdb/vercel-ai';
 * const model = wrapLanguageModel({
 *   model: openai('gpt-4o'),
 *   middleware: clawdbMiddleware(db),
 * });
 * ```
 */
export function clawdbMiddleware(client: ClawDB): LanguageModelMiddleware {
  return {
    async wrapGenerate({ doGenerate, params }) {
      const result = await doGenerate();

      try {
        const output = result as { text?: string };
        const userPrompt = (params['prompt'] as Array<{ content?: Array<{ text?: string }> }>)?.[0]?.content?.[0]?.text;
        if (output?.text) {
          await client.memory.remember(output.text, {
            memoryType: 'tool_output' as Parameters<typeof client.memory.remember>[1] extends { memoryType?: infer T } ? T : never,
            metadata: {
              prompt: userPrompt,
              source: 'vercel-ai-middleware',
            },
          });
        }
      } catch {
        // Memory persistence is best-effort — never fail the main flow.
      }

      return result;
    },

    async wrapStream({ doStream, params }) {
      // Stream wrapping is best-effort; we pass through without interception
      // since consuming the stream would break backpressure.
      void params;
      return doStream();
    },
  };
}

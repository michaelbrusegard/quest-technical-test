import type { ChatModelAdapter } from '@assistant-ui/react';

import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

const runtimeFetch: typeof fetch = async (input, init) => {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    return tauriFetch(input, init);
  }

  return globalThis.fetch(input, init);
};

export function createChatModelAdapter(apiKey: string): ChatModelAdapter {
  return createChatModelAdapterWithContext(apiKey, () => '');
}

export function createChatModelAdapterWithContext(
  apiKey: string,
  getHistoryContext: () => string,
): ChatModelAdapter {
  const openai = createOpenAI({
    apiKey,
    baseURL: 'https://api.cerebras.ai/v1',
    fetch: runtimeFetch,
  });

  return {
    async *run({ messages, abortSignal }) {
      const historyContext = getHistoryContext().trim();
      const result = streamText({
        model: openai.chat('llama3.1-8b'),
        messages: [
          ...(historyContext
            ? [
                {
                  role: 'system' as const,
                  content: `You are a conversational assistant grounded in the user's browser history.\n${historyContext}`,
                },
              ]
            : []),
          ...messages.map((m) => ({
            role: m.role,
            content: m.content
              .filter((c): c is Extract<typeof c, { type: 'text' }> => c.type === 'text')
              .map((c) => c.text)
              .join(''),
          })),
        ],
        abortSignal,
      });

      let text = '';
      for await (const chunk of result.textStream) {
        text += chunk;
        yield { content: [{ type: 'text' as const, text }] };
      }
    },
  };
}

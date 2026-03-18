import type { ThreadAssistantMessagePart } from '@assistant-ui/core';
import type { ChatModelAdapter } from '@assistant-ui/react';
import type { ReadonlyJSONObject, ReadonlyJSONValue } from 'assistant-stream/utils';

import { createAnthropic } from '@ai-sdk/anthropic';
import { stepCountIs, streamText, type ModelMessage } from 'ai';

import { createMemoryTools } from '@/lib/memory/agent/tools';

export function createChatModelAdapterWithContext(
  getMemoryContext: () => string,
  anthropicApiKey?: string,
): ChatModelAdapter {
  const tools = createMemoryTools();

  return {
    async *run({ messages, abortSignal }) {
      if (!anthropicApiKey) {
        yield {
          content: [
            {
              type: 'text' as const,
              text: 'Add an Anthropic API key for chat in Settings.',
            },
          ],
        };
        return;
      }

      const memoryContext = getMemoryContext().trim();
      const model = createAnthropic({
        apiKey: anthropicApiKey,
        headers: {
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      })('claude-sonnet-4-6');

      const result = streamText({
        model,
        stopWhen: stepCountIs(5),
        tools,
        system: [
          "You are a mentoring assistant grounded in the user's local browsing-memory database.",
          'Use the available memory tools whenever a question depends on behavior patterns, goals, or supporting examples.',
          'Do not invent memory. If the tools return weak evidence, say so clearly.',
          memoryContext,
        ]
          .filter(Boolean)
          .join('\n\n'),
        messages: toModelMessages(messages),
        abortSignal,
      });

      const content: ThreadAssistantMessagePart[] = [];
      const textIndices = new Map<string, number>();
      const toolIndices = new Map<string, number>();

      for await (const part of result.fullStream) {
        if (part.type === 'text-start') {
          content.push({ type: 'text', text: '' });
          textIndices.set(part.id, content.length - 1);
        }

        if (part.type === 'text-delta') {
          const index = textIndices.get(part.id);
          const existing = index === undefined ? undefined : content[index];
          if (index !== undefined && existing?.type === 'text') {
            content[index] = {
              ...existing,
              text: `${existing.text}${part.text}`,
            };
          }
        }

        if (part.type === 'tool-call') {
          content.push({
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: toReadonlyJSONObject(part.input),
            argsText: JSON.stringify(part.input, null, 2),
          });
          toolIndices.set(part.toolCallId, content.length - 1);
        }

        if (part.type === 'tool-result' || part.type === 'tool-error') {
          const index = toolIndices.get(part.toolCallId);
          const existing = index === undefined ? undefined : content[index];
          if (index !== undefined && existing?.type === 'tool-call') {
            content[index] = {
              ...existing,
              result: part.type === 'tool-result' ? part.output : stringifyError(part.error),
              isError: part.type === 'tool-error',
            };
          }
        }

        yield { content: cloneContent(content) };
      }
    },
  };
}

function toModelMessages(
  messages: Parameters<ChatModelAdapter['run']>[0]['messages'],
): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];

  for (const message of messages) {
    const content = message.content
      .filter(
        (part): part is Extract<(typeof message.content)[number], { type: 'text' }> =>
          part.type === 'text',
      )
      .map((part) => part.text)
      .join('');

    if (!content) {
      continue;
    }

    modelMessages.push({ role: message.role, content });
  }

  return modelMessages;
}

function cloneContent(content: ThreadAssistantMessagePart[]): ThreadAssistantMessagePart[] {
  return content.map((part) => {
    if (part.type === 'text') {
      return { ...part };
    }

    if (part.type === 'tool-call') {
      return { ...part, args: { ...part.args } };
    }

    return { ...part };
  });
}

function toReadonlyJSONObject(value: unknown): ReadonlyJSONObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { value: toReadonlyJSONValue(value) };
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, toReadonlyJSONValue(entry)]),
  );
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error) ?? 'Unknown tool error';
  } catch {
    return 'Unknown tool error';
  }
}

function toReadonlyJSONValue(value: unknown): ReadonlyJSONValue {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toReadonlyJSONValue(entry));
  }

  if (value && typeof value === 'object') {
    return toReadonlyJSONObject(value);
  }

  return JSON.stringify(value) ?? 'unsupported-value';
}

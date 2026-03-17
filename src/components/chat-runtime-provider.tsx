import type { ReactNode } from 'react';

import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';

import { createChatModelAdapter } from '@/lib/chat-model-adapter';

const API_KEY = (import.meta.env['VITE_CEREBRAS_API_KEY'] as string) ?? '';

const adapter = createChatModelAdapter(API_KEY);

export function ChatRuntimeProvider({
  children,
}: Readonly<{
  children: ReactNode;
}>): React.ReactElement {
  const runtime = useLocalRuntime(adapter);

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

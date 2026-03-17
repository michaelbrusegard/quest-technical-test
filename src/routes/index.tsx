import { createFileRoute } from '@tanstack/react-router';

import { Thread } from '@/components/assistant-ui/thread';
import { ChatRuntimeProvider } from '@/components/chat-runtime-provider';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <ChatRuntimeProvider>
      <Thread />
    </ChatRuntimeProvider>
  );
}

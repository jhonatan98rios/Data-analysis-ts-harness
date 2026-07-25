import { ChatWindow } from '@/components/chat-window';

export default async function SessionChatPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return (
    <div className="flex-1 flex flex-col">
      <ChatWindow sessionId={sessionId} tenantId="default" />
    </div>
  );
}

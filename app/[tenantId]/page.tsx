import { ChatWindow } from '@/components/chat-window';

export default async function TenantChatPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  return (
    <div className="flex-1 flex flex-col">
      <ChatWindow tenantId={tenantId} />
    </div>
  );
}

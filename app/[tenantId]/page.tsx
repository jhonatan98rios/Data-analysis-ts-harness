import { ChatWindow } from '@/components/chat-window';

export default async function TenantChatPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  return (
    <div className="flex-1 flex flex-col p-2 sm:p-4">
      <div className="flex-1 flex flex-col glass rounded-2xl shadow-2xl shadow-black/[0.06] dark:shadow-black/40 overflow-hidden">
        <ChatWindow tenantId={tenantId} />
      </div>
    </div>
  );
}

import { ChatWindow } from '@/components/chat-window';

export default async function TenantChatPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  return <ChatWindow tenantId={tenantId} />;
}

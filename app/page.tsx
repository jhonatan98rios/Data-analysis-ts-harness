import { redirect } from 'next/navigation';

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Home() {
  redirect(`/${newId()}`);
}

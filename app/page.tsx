import { redirect } from 'next/navigation';
import { newId } from '@/lib/sessions';

export default function Home() {
  redirect(`/${newId()}`);
}

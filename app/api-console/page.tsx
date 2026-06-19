import { redirect } from 'next/navigation';
import UserApiConsole from '@/components/UserApiConsole';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ApiConsolePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/chat');
  }

  return <UserApiConsole />;
}

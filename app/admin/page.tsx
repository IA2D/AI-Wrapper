import { redirect } from 'next/navigation';
import AdminDashboard from '@/components/AdminDashboard';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/');
  }

  if (user.role !== 'admin') {
    redirect('/');
  }

  return <AdminDashboard admin={user} />;
}

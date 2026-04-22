import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/site-header';
import { DashboardClient } from './dashboard-client';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (!user || error) redirect('/sign-in?next=/dashboard');

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;

  const displayName =
    (user.user_metadata?.full_name as string | undefined)?.trim() || user.email || 'Teacher';

  return (
    <>
      <SiteHeader />
      <DashboardClient token={token} displayName={displayName} />
    </>
  );
}

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CompanionClient } from './companion-client';

// Mobile-first phone companion (Phase 2c.4a). Picks one of the user's
// registered robots and opens a /ws/control session against the cloud
// relay. This first slice is the shell — voice, avatar, and canvas
// land in subsequent commits.
//
// Auth: Supabase session (same as /account). Unauthed visitors get
// bounced to /sign-in with a return path so a kid following a deep
// link from the desktop ends up back here after signing in.

export default async function CompanionPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (!user || error) redirect('/sign-in?next=/companion');

  return <CompanionClient />;
}

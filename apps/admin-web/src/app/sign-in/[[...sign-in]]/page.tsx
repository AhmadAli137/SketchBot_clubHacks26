import { SignIn } from '@clerk/nextjs';

import { CLERK_ENABLED } from '@/lib/config';

export default function SignInPage() {
  if (!CLERK_ENABLED) {
    return (
      <main className="shell">
        <section className="panel auth-card">
          <p className="eyebrow">Authentication</p>
          <h2>Clerk is not configured yet</h2>
          <p>Add the Clerk environment variables in `apps/admin-web/.env.example` to enable hosted sign-in.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="panel auth-card">
        <SignIn />
      </section>
    </main>
  );
}

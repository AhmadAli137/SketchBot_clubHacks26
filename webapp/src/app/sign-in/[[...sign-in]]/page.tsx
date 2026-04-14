import { SignIn } from '@clerk/nextjs';

export default function Page() {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <p className="eyebrow">SketchBot Access</p>
          <h1>Sign in to the operator dashboard</h1>
          <p className="subdued-text">
            Authentication keeps device controls, camera setup, and task planning scoped to approved operators.
          </p>
        </div>
        <SignIn />
      </div>
    </main>
  );
}

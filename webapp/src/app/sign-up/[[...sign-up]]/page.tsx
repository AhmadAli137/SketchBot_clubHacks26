import { SignUp } from '@clerk/nextjs';

export default function Page() {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <p className="eyebrow">SketchBot Access</p>
          <h1>Create an operator account</h1>
          <p className="subdued-text">
            Use a managed account so teams can share the same camera workflows and dashboard without exposing robot controls publicly.
          </p>
        </div>
        <SignUp />
      </div>
    </main>
  );
}

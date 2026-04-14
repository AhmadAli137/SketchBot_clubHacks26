import Link from 'next/link';

import { CLOUD_BACKEND_URL } from '@/lib/config';

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">SketchBot Platform</p>
        <h1>Desktop robotics for classrooms, with cloud tools for teachers and teams.</h1>
        <p>
          SketchBot now ships as a desktop-first robotics experience. The desktop app handles camera vision,
          teleoperation, and robot control locally, while this hosted site manages accounts, saved projects,
          classroom setup, and release information.
        </p>
        <div className="cta-row">
          <Link className="btn primary" href="/portal">
            Open admin portal
          </Link>
          <Link className="btn" href="/sign-in">
            Sign in
          </Link>
          <Link className="btn" href="/sign-up">
            Create account
          </Link>
        </div>
        <div className="pill-row">
          <div className="pill">
            <strong>Desktop operator app</strong>
            Vision, teleoperation, and robot runtime stay local on the operator machine.
          </div>
          <div className="pill">
            <strong>Camera Buddy companion</strong>
            Same-network phone or tablet pairing for flexible classroom camera placement.
          </div>
          <div className="pill">
            <strong>Hosted admin tools</strong>
            Accounts, updates, classroom management, saved projects, and support workflows.
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <p className="eyebrow">Why this split</p>
          <h2>Local where latency matters. Cloud where management matters.</h2>
          <p>
            The desktop app avoids browser camera limitations and internet frame latency. The cloud backend stays
            focused on administrative workflows, synced assets, and product operations.
          </p>
          <ul>
            <li>Lower latency and more reliable teleoperation in the classroom.</li>
            <li>Better support for USB cameras, document cameras, and capture devices.</li>
            <li>Cleaner security model: local runtime for robotics, hosted backend for accounts and admin.</li>
          </ul>
        </div>
        <div className="panel">
          <p className="eyebrow">Cloud backend</p>
          <h3>Current service endpoint</h3>
          <p>{CLOUD_BACKEND_URL}</p>
          <div className="stat-grid">
            <div className="stat">
              <strong>Auth</strong>
              Clerk-backed accounts for teachers, teams, and classroom admins.
            </div>
            <div className="stat">
              <strong>Sync</strong>
              Store and retrieve saved tasks, device metadata, and release channels.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

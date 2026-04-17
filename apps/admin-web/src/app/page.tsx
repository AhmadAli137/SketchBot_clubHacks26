import Link from 'next/link';

import { SiteHeader } from '@/components/site-header';
import { CLOUD_BACKEND_URL } from '@/lib/config';

export default function HomePage() {
  return (
    <main className="shell">
      <SiteHeader />
      <section className="hero">
        <p className="eyebrow">SketchBot Platform</p>
        <h1>Set up your classroom and keep SketchBot running smoothly.</h1>
        <p>
          Students use SketchBot Desktop and Camera Buddy in the classroom. Teachers and organizers use this site for
          sign-in, downloads, updates, and support.
        </p>
        <div className="cta-row">
          <Link className="btn primary" href="/pricing">
            See pricing
          </Link>
          <Link className="btn" href="/portal">
            Open teacher portal
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
            <strong>Desktop app</strong>
            Runs the robot, camera, and drawing session on the classroom computer.
          </div>
          <div className="pill">
            <strong>Camera Buddy</strong>
            Lets a phone or tablet join the same room on the same Wi-Fi.
          </div>
          <div className="pill">
            <strong>This website</strong>
            Handles sign-in, downloads, release notes, and classroom management.
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <p className="eyebrow">Start here</p>
          <h2>Three things most teachers need</h2>
          <p>
            SketchBot keeps the live robot session on the classroom computer so drawing stays fast. This site stays focused
            on setup, accounts, and updates.
          </p>
          <ul>
            <li>Download the latest desktop app.</li>
            <li>Help students sign in and join the right classroom.</li>
            <li>Check release notes and support status before class starts.</li>
          </ul>
        </div>
        <div className="panel">
          <p className="eyebrow">Cloud status</p>
          <h3>Service endpoint</h3>
          <p>{CLOUD_BACKEND_URL}</p>
          <div className="stat-grid">
            <div className="stat">
              <strong>Accounts</strong>
              Teacher and student sign-in.
            </div>
            <div className="stat">
              <strong>Downloads</strong>
              Desktop and companion release channels.
            </div>
            <div className="stat">
              <strong>Support</strong>
              Health, updates, and classroom help live here.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

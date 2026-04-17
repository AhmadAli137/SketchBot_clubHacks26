import Link from 'next/link';

import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Reveal, RevealGroup } from '@/components/reveal';

const plans = [
  {
    id: 'explorer',
    name: 'Explorer',
    tagline: 'Try SketchBot with the simulator — no robot required.',
    audience: 'Curious learners & demos',
    price: 'Free',
    priceNote: 'No credit card',
    seats: '1 seat',
    robots: 'Simulator only',
    credits: '50 AI credits / mo',
    features: ['Desktop app with simulator', 'Starter concept library', 'Block editor & prompt composer', 'Community support'],
    cta: { label: 'Download free', href: '/sign-up' },
    badge: 'Free forever',
  },
  {
    id: 'home',
    name: 'Home',
    tagline: 'One learner, one robot, full access.',
    audience: 'Parent-paid, 1 child',
    price: '$12',
    priceNote: '/mo · or $99/yr',
    seats: '1 learner + parent',
    robots: '1 robot',
    credits: '300 AI credits / mo',
    features: ['Full concept library', 'Camera Buddy companion app', 'XP, streaks & progress', 'Email support'],
    cta: { label: 'Start Home plan', href: '/sign-up?plan=home' },
  },
  {
    id: 'classroom',
    name: 'Classroom',
    tagline: 'One teacher, one room, 30 students.',
    audience: 'K–8 teachers & clubs',
    price: '$49',
    priceNote: '/mo · or $399/yr',
    seats: '1 teacher + 30 students',
    robots: 'Up to 4 robots',
    credits: '2,500 AI credits / mo',
    features: ['Classroom join codes', 'Teacher dashboard', 'Lesson plans by concept', 'Priority email support'],
    cta: { label: 'Start Classroom', href: '/sign-up?plan=classroom' },
    badge: 'Most popular',
    featured: true,
  },
  {
    id: 'school',
    name: 'School',
    tagline: 'Building-wide license with SSO.',
    audience: 'Principals & tech coordinators',
    price: '$249',
    priceNote: '/mo · or $2,000/yr',
    seats: '10 teachers + unlimited students',
    robots: 'Up to 20 robots',
    credits: '15,000 AI credits / mo',
    features: ['Google Workspace SSO', 'Clever & Classlink rostering', 'Admin console + usage reports', 'Onboarding & PD hours'],
    cta: { label: 'Start School plan', href: '/sign-up?plan=school' },
  },
  {
    id: 'district',
    name: 'District',
    tagline: 'Multi-school with procurement terms.',
    audience: 'Districts & ministries',
    price: 'Custom',
    priceNote: 'From $10,000/yr',
    seats: 'Unlimited',
    robots: 'Unlimited',
    credits: '100k+ AI credits / mo',
    features: ['SAML SSO & data residency', 'Dedicated success manager', 'Custom rostering & SLA', 'On-prem cloud option'],
    cta: { label: 'Talk to sales', href: 'mailto:sales@sketchbot.app' },
    badge: 'Enterprise',
  },
];

const creditTable = [
  { action: 'Block program run', credits: '0' },
  { action: 'Prompt → path plan (simple)', credits: '1' },
  { action: 'Code drawing via LLM', credits: '1' },
  { action: 'Tutor chat turn', credits: '1' },
  { action: 'Image → vector sketch', credits: '2' },
  { action: 'Multi-step agent plan', credits: '3' },
];

const addOns = [
  { addOn: 'Extra robot slot', on: 'Classroom, School', price: '$8 / robot / mo' },
  { addOn: 'Curriculum pack', on: 'Classroom+', price: '$99 / yr / room' },
  { addOn: 'Credit top-up', on: 'All paid', price: 'From $5 / 250 credits' },
  { addOn: 'Live PD session', on: 'School, District', price: '$750 / half-day' },
  { addOn: 'On-prem cloud', on: 'District', price: 'Custom' },
];

const faqs = [
  { q: 'What is an AI credit?', a: 'A credit meters AI-powered actions — generating a path from a prompt, a tutor chat reply, or an agent plan. Running block programs or driving the robot by hand costs nothing.' },
  { q: 'Do credits roll over?', a: 'Home and Classroom credits reset monthly. School rolls unused credits forward one month. District agreements can negotiate quarterly pools.' },
  { q: 'Do plans include the robot hardware?', a: 'The robot is a separate one-time purchase. Annual subscribers get a bundle discount on Home Kits, Classroom 4-packs, and School 10-packs.' },
  { q: 'What happens when credits run out mid-lesson?', a: 'Block programs and direct robot control keep working. AI features pause until the next reset or a top-up. Teachers see the pool gauge in the dashboard.' },
  { q: 'Can I mix plans in the same school?', a: 'Yes. Teachers can start on Classroom and upgrade to a School license — usage and rosters transfer automatically when a second teacher on the same domain upgrades.' },
];

export default function PricingPage() {
  return (
    <>
      <SiteHeader />

      {/* Hero */}
      <section className="hero-section" style={{ paddingBottom: 72 }}>
        <div className="hero-orbs">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
        </div>
        <div className="container" style={{ position: 'relative', zIndex: 1 }}>
          <Reveal>
            <p className="eyebrow" style={{ marginBottom: 16 }}>Pricing</p>
            <h1 className="display-1" style={{ maxWidth: 700, margin: '0 auto 20px' }}>
              Plans from <span className="grad-text">one learner</span> to an entire district
            </h1>
            <p className="body-lg" style={{ maxWidth: 560, margin: '0 auto 36px' }}>
              AI credits pool at the license level — no per-student caps.
              Start free, add hardware when you&#39;re ready.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {[
                { label: 'Seats scale by plan', sub: '1 learner → unlimited students' },
                { label: 'Credits pool at the license', sub: 'One shared quota' },
                { label: 'Annual saves ~17%', sub: 'Two months free on every tier' },
              ].map(({ label, sub }) => (
                <div key={label} style={{
                  padding: '10px 18px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  fontSize: '0.85rem',
                  textAlign: 'center',
                }}>
                  <strong style={{ display: 'block', color: 'var(--text)', marginBottom: 2 }}>{label}</strong>
                  <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{sub}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Plan cards */}
      <section className="section-sm" style={{ position: 'relative', zIndex: 1 }}>
        <div className="container">
          <RevealGroup stagger={0.08} className="pricing-grid">
            {plans.map((plan) => (
              <article key={plan.id} className={`plan-card${plan.featured ? ' featured' : ''}`}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <div className="plan-name">{plan.name}</div>
                    {plan.badge && <span className="plan-badge-pill">{plan.badge}</span>}
                  </div>
                  <div className="plan-tagline">{plan.tagline}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4 }}>{plan.audience}</div>
                </div>

                <div className="plan-price-block">
                  <span className={`plan-price${plan.featured ? ' grad-text' : ''}`}>{plan.price}</span>
                  <span className="plan-price-note">{plan.priceNote}</span>
                </div>

                <div className="plan-divider" />

                <div className="plan-specs">
                  {[
                    { label: 'Seats', val: plan.seats },
                    { label: 'Robots', val: plan.robots },
                    { label: 'AI credits', val: plan.credits },
                  ].map(({ label, val }) => (
                    <div key={label} className="plan-spec-row">
                      <span className="plan-spec-label">{label}</span>
                      <span className="plan-spec-val">{val}</span>
                    </div>
                  ))}
                </div>

                <div className="plan-divider" />

                <ul className="plan-features-list">
                  {plan.features.map((f) => (
                    <li key={f} className="plan-feature">
                      <span className="plan-feature-check">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link href={plan.cta.href} className="plan-cta-btn">
                  {plan.cta.label}
                </Link>
              </article>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* Credit + add-ons */}
      <section className="section" style={{ position: 'relative', zIndex: 1 }}>
        <div className="container">
          <div className="grid-2">
            <Reveal>
              <div className="card" style={{ height: '100%' }}>
                <p className="eyebrow" style={{ marginBottom: 16 }}>What a credit buys</p>
                <h2 className="headline" style={{ marginBottom: 8 }}>Every paid tier ships with pooled AI credits</h2>
                <p className="body-sm" style={{ marginBottom: 20 }}>
                  A typical lesson uses 2–5 credits per student. Free actions stay free.
                </p>
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th className="num">Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditTable.map((r) => (
                      <tr key={r.action}>
                        <td>{r.action}</td>
                        <td className="num">{r.credits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <div className="card" style={{ height: '100%' }}>
                <p className="eyebrow" style={{ marginBottom: 16 }}>Add-ons</p>
                <h3 className="headline" style={{ marginBottom: 8 }}>Tailor any paid plan</h3>
                <p className="body-sm" style={{ marginBottom: 20 }}>
                  Available after subscribing.
                </p>
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th>Add-on</th>
                      <th>Available on</th>
                      <th className="num">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {addOns.map((r) => (
                      <tr key={r.addOn}>
                        <td>{r.addOn}</td>
                        <td style={{ fontSize: '0.8rem' }}>{r.on}</td>
                        <td className="num">{r.price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section" style={{ position: 'relative', zIndex: 1, background: 'rgba(255,255,255,0.015)' }}>
        <div className="container">
          <Reveal>
            <div className="section-header">
              <p className="eyebrow">FAQ</p>
              <h2 className="display-2">Common questions</h2>
            </div>
          </Reveal>
          <RevealGroup stagger={0.07} className="grid-2">
            {faqs.map((item) => (
              <div key={item.q} className="card">
                <div className="card-title">{item.q}</div>
                <div className="card-body">{item.a}</div>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="section-sm" style={{ position: 'relative', zIndex: 1 }}>
        <div className="container">
          <Reveal>
            <div className="cta-band">
              <p className="eyebrow">Ready when you are</p>
              <h2 className="display-2" style={{ maxWidth: 520 }}>
                Start free. Upgrade when your <span className="grad-text">classroom is ready.</span>
              </h2>
              <p className="body-lg" style={{ maxWidth: 460 }}>
                Every paid plan includes a 30-day refund window.
                District procurement? We&#39;ll share a quote and pilot timeline within two business days.
              </p>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Link href="/sign-up" className="btn btn-primary">Create a free account</Link>
                <Link href="/portal" className="btn btn-outline">Open teacher portal</Link>
                <a href="mailto:sales@sketchbot.app" className="btn btn-outline">Contact sales</a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}

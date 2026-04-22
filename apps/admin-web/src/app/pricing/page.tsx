import Link from 'next/link';

import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Reveal, RevealGroup } from '@/components/reveal';
import { PricingCards } from './pricing-cards';

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
            <div className="pricing-hero-pills">
              {[
                { label: 'Seats scale by plan', sub: '1 learner → unlimited students' },
                { label: 'Credits pool at the license', sub: 'One shared quota, no per-student caps' },
                { label: 'Annual saves ~17%', sub: 'Two months free on every tier' },
              ].map(({ label, sub }) => (
                <div key={label} className="pricing-hero-pill">
                  <strong>{label}</strong>
                  <span>{sub}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Plan cards */}
      <section className="section-sm" style={{ position: 'relative', zIndex: 1 }}>
        <div className="container">
          <PricingCards />
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
                      <tr key={r.action} className={r.credits === '0' ? 'free-action' : ''}>
                        <td>{r.action}</td>
                        <td className="num">{r.credits === '0' ? 'Free' : r.credits}</td>
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

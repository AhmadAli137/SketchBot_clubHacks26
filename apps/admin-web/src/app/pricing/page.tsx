import Link from 'next/link';

import { SiteHeader } from '@/components/site-header';

type Plan = {
  id: string;
  name: string;
  tagline: string;
  audience: string;
  price: string;
  priceNote: string;
  seats: string;
  robots: string;
  credits: string;
  features: string[];
  cta: { label: string; href: string };
  featured?: boolean;
  badge?: string;
};

const plans: Plan[] = [
  {
    id: 'explorer',
    name: 'Explorer',
    tagline: 'Try SketchBot in simulation before you buy a robot.',
    audience: 'Curious kids, demos, evaluation',
    price: 'Free',
    priceNote: 'No credit card required',
    seats: '1 seat',
    robots: 'Simulator only',
    credits: '50 AI credits / month',
    features: [
      'Desktop app with simulated robot',
      'Starter concept library',
      'Block editor and prompt composer',
      'Community support',
    ],
    cta: { label: 'Download free', href: '/sign-up' },
    badge: 'Free forever',
  },
  {
    id: 'home',
    name: 'Home',
    tagline: 'For a single learner with a SketchBot at home.',
    audience: 'Parent-paid, 1 child',
    price: '$12',
    priceNote: 'per month, billed monthly — or $99 / yr',
    seats: '1 learner + 1 parent account',
    robots: '1 robot',
    credits: '300 AI credits / month',
    features: [
      'Full concept library across age groups',
      'Camera Buddy companion app',
      'XP, streaks, and progress tracking',
      'Email support',
    ],
    cta: { label: 'Start Home plan', href: '/sign-up?plan=home' },
  },
  {
    id: 'classroom',
    name: 'Classroom',
    tagline: 'One teacher, one room, up to 30 students on shared robots.',
    audience: 'K-8 teachers, after-school clubs',
    price: '$49',
    priceNote: 'per month — or $399 / yr',
    seats: '1 teacher + 30 students',
    robots: 'Up to 4 robots',
    credits: '2,500 AI credits / month (pooled)',
    features: [
      'Classroom join codes and teacher dashboard',
      'Lesson plans aligned to concepts',
      'Pooled credits — no per-student caps',
      'Priority email support',
    ],
    cta: { label: 'Start Classroom plan', href: '/sign-up?plan=classroom' },
    featured: true,
    badge: 'Most popular',
  },
  {
    id: 'school',
    name: 'School',
    tagline: 'Building-wide license with admin console and SSO.',
    audience: 'Principals, tech coordinators',
    price: '$249',
    priceNote: 'per month — or $2,000 / yr',
    seats: '10 teachers + unlimited students',
    robots: 'Up to 20 robots',
    credits: '15,000 AI credits / month (pooled)',
    features: [
      'Google Workspace SSO included',
      'Clever and Classlink rostering',
      'Admin web console with usage reports',
      'Onboarding session and PD hours',
    ],
    cta: { label: 'Start School plan', href: '/sign-up?plan=school' },
  },
  {
    id: 'district',
    name: 'District',
    tagline: 'Multi-school deployments with procurement terms.',
    audience: 'Districts, networks, ministries',
    price: 'Custom',
    priceNote: 'From $10,000 / year',
    seats: 'Unlimited seats and teachers',
    robots: 'Unlimited robots',
    credits: '100,000+ AI credits pooled, negotiable',
    features: [
      'SAML SSO, data residency, on-prem option',
      'Dedicated customer success manager',
      'Custom rostering and reporting',
      'SLA with priority support',
    ],
    cta: { label: 'Talk to sales', href: 'mailto:sales@sketchbot.app' },
    badge: 'Enterprise',
  },
];

const creditTable: Array<{ action: string; credits: string }> = [
  { action: 'Block program run (no AI)', credits: '0' },
  { action: 'Prompt to path plan (simple)', credits: '1' },
  { action: 'Code to drawing via LLM', credits: '1' },
  { action: 'Concept tutor chat turn', credits: '1' },
  { action: 'Image to vector sketch (vision)', credits: '2' },
  { action: 'Multi-step agent plan', credits: '3' },
];

const addOns: Array<{ addOn: string; availableOn: string; price: string }> = [
  { addOn: 'Extra robot slot', availableOn: 'Classroom, School', price: '$8 / robot / mo' },
  { addOn: 'Curriculum pack (state standards)', availableOn: 'Classroom and up', price: '$99 / yr per room' },
  { addOn: 'Credit top-up', availableOn: 'All paid plans', price: 'From $5 for 250 credits' },
  { addOn: 'Professional development (live)', availableOn: 'School, District', price: '$750 / half-day' },
  { addOn: 'On-prem cloud backend', availableOn: 'District', price: 'Custom' },
];

const faqs: Array<{ q: string; a: string }> = [
  {
    q: 'What is an AI credit?',
    a: 'A credit is how we meter AI-powered actions in the app — generating a drawing from a prompt, explaining a concept in the tutor, or running a multi-step agent. Running a block program or driving the robot by hand costs nothing.',
  },
  {
    q: 'Do credits roll over?',
    a: 'Home and Classroom credits reset monthly. School plans roll unused credits forward up to one month. District agreements can negotiate quarterly pools and rollover as part of the contract.',
  },
  {
    q: 'Can I mix plans inside the same school?',
    a: 'Yes. Teachers can start on the Classroom plan and convert to a School license once a second teacher on the same email domain upgrades — usage and rosters transfer automatically.',
  },
  {
    q: 'Do the plans include the robot hardware?',
    a: 'The robot is a separate one-time purchase. Any annual subscription unlocks a bundle discount on a Home Kit, Classroom 4-pack, or School 10-pack.',
  },
  {
    q: 'What happens if we run out of credits mid-lesson?',
    a: 'Block programs and direct robot control keep working. AI-powered features pause until the next reset or a top-up. Teachers see the pool gauge in the dashboard so this is predictable.',
  },
];

export default function PricingPage() {
  return (
    <main className="shell">
      <SiteHeader />

      <section className="hero">
        <p className="eyebrow">Pricing</p>
        <h1>Plans for every classroom, from one learner to an entire district.</h1>
        <p>
          SketchBot meters AI usage in credits and pools them at the license level, so teachers never
          referee per-student quotas. Pick the tier that matches who&apos;s paying: a parent, a teacher, a
          school, or a district.
        </p>
        <div className="pill-row">
          <div className="pill">
            <strong>Seats scale by plan</strong>
            From 1 learner to unlimited students.
          </div>
          <div className="pill">
            <strong>Credits pool at the license</strong>
            One shared quota, no per-student caps.
          </div>
          <div className="pill">
            <strong>Annual billing saves ~17%</strong>
            Two months free on every paid tier.
          </div>
        </div>
      </section>

      <section className="plan-grid">
        {plans.map((plan) => (
          <article key={plan.id} className={`plan${plan.featured ? ' featured' : ''}`}>
            <header className="plan-head">
              <div className="plan-title-row">
                <h2>{plan.name}</h2>
                {plan.badge ? <span className="plan-badge">{plan.badge}</span> : null}
              </div>
              <p className="plan-tagline">{plan.tagline}</p>
              <p className="plan-audience">{plan.audience}</p>
            </header>
            <div className="plan-price-row">
              <span className="plan-price">{plan.price}</span>
              <span className="plan-price-note">{plan.priceNote}</span>
            </div>
            <dl className="plan-specs">
              <div>
                <dt>Seats</dt>
                <dd>{plan.seats}</dd>
              </div>
              <div>
                <dt>Robots</dt>
                <dd>{plan.robots}</dd>
              </div>
              <div>
                <dt>AI credits</dt>
                <dd>{plan.credits}</dd>
              </div>
            </dl>
            <ul className="plan-features">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <Link className={`btn${plan.featured ? ' primary' : ''} plan-cta`} href={plan.cta.href}>
              {plan.cta.label}
            </Link>
          </article>
        ))}
      </section>

      <section className="grid">
        <div className="panel">
          <p className="eyebrow">What a credit buys</p>
          <h2>Every paid tier ships with pooled AI credits.</h2>
          <p>
            Credits are the single meter for AI-powered work in SketchBot. Ratios are tuned so a typical
            lesson uses 2&ndash;5 credits per student, and free actions stay free.
          </p>
          <table className="compare-table" aria-label="AI credit cost per action">
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col" className="num">
                  Credits
                </th>
              </tr>
            </thead>
            <tbody>
              {creditTable.map((row) => (
                <tr key={row.action}>
                  <td>{row.action}</td>
                  <td className="num">{row.credits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <p className="eyebrow">Add-ons</p>
          <h3>Tailor any paid plan.</h3>
          <table className="compare-table" aria-label="Available add-ons">
            <thead>
              <tr>
                <th scope="col">Add-on</th>
                <th scope="col">Available on</th>
                <th scope="col" className="num">
                  Price
                </th>
              </tr>
            </thead>
            <tbody>
              {addOns.map((row) => (
                <tr key={row.addOn}>
                  <td>{row.addOn}</td>
                  <td>{row.availableOn}</td>
                  <td className="num">{row.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">FAQ</p>
        <h2>Common questions.</h2>
        <div className="faq-grid">
          {faqs.map((item) => (
            <div key={item.q} className="faq">
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="hero">
        <p className="eyebrow">Ready when you are</p>
        <h2>Start free, upgrade when your classroom is ready.</h2>
        <p>
          Every paid plan includes a 30-day refund window. District procurement? We&apos;ll share a quote,
          security packet, and pilot timeline within two business days.
        </p>
        <div className="cta-row">
          <Link className="btn primary" href="/sign-up">
            Create an account
          </Link>
          <Link className="btn" href="/portal">
            Open teacher portal
          </Link>
          <a className="btn" href="mailto:sales@sketchbot.app">
            Contact sales
          </a>
        </div>
      </section>
    </main>
  );
}

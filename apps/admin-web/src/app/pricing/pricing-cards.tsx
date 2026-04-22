'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { CLOUD_API_URL } from '@/lib/config';
import { Reveal, RevealGroup } from '@/components/reveal';

type BillingPeriod = 'monthly' | 'annual';
type CheckoutPlan = 'home' | 'classroom' | 'school';

const plans = [
  {
    id: 'explorer',
    name: 'Explorer',
    tagline: 'Try SketchBot with the simulator — no robot required.',
    audience: 'Curious learners & demos',
    monthly: { price: 'Free', note: 'No credit card' },
    annual:  { price: 'Free', note: 'No credit card' },
    seats: '1 seat',
    robots: 'Simulator only',
    credits: '50 AI credits / mo',
    features: ['Desktop app with simulator', 'Starter concept library', 'Block editor & prompt composer', 'Community support'],
    cta: 'link' as const,
    ctaLabel: 'Download free',
    ctaHref: '/sign-up',
    badge: 'Free forever',
  },
  {
    id: 'home',
    checkout: 'home' as CheckoutPlan,
    name: 'Home',
    tagline: 'One learner, one robot, full access.',
    audience: 'Parent-paid, 1 child',
    monthly: { price: 'CA$15.99', note: '/mo · billed monthly' },
    annual:  { price: 'CA$159.99', note: '/yr · save 2 months' },
    seats: '1 learner + parent',
    robots: '1 robot',
    credits: '300 AI credits / mo',
    features: ['Full concept library', 'Camera Buddy companion app', 'XP, streaks & progress', 'Email support'],
    cta: 'checkout' as const,
    ctaLabel: 'Start Home plan',
  },
  {
    id: 'classroom',
    checkout: 'classroom' as CheckoutPlan,
    name: 'Classroom',
    tagline: 'One teacher, one room, 30 students.',
    audience: 'K–8 teachers & clubs',
    monthly: { price: 'CA$59.99', note: '/mo · billed monthly' },
    annual:  { price: 'CA$599.99', note: '/yr · save 2 months' },
    seats: '1 teacher + 30 students',
    robots: 'Up to 4 robots',
    credits: '2,500 AI credits / mo',
    features: ['Classroom join codes', 'Teacher dashboard', 'Lesson plans by concept', 'Priority email support'],
    cta: 'checkout' as const,
    ctaLabel: 'Start Classroom',
    badge: 'Most popular',
    featured: true,
  },
  {
    id: 'school',
    checkout: 'school' as CheckoutPlan,
    name: 'School',
    tagline: 'Building-wide license with SSO.',
    audience: 'Principals & tech coordinators',
    monthly: { price: 'CA$299.99', note: '/mo · billed monthly' },
    annual:  { price: 'CA$2,999.99', note: '/yr · save 2 months' },
    seats: '10 teachers + unlimited students',
    robots: 'Up to 20 robots',
    credits: '15,000 AI credits / mo',
    features: ['Google Workspace SSO', 'Clever & Classlink rostering', 'Admin console + usage reports', 'Onboarding & PD hours'],
    cta: 'checkout' as const,
    ctaLabel: 'Start School plan',
  },
  {
    id: 'district',
    name: 'District',
    tagline: 'Multi-school with procurement terms.',
    audience: 'Districts & ministries',
    monthly: { price: 'Custom', note: 'From CA$13,500/yr' },
    annual:  { price: 'Custom', note: 'From CA$13,500/yr' },
    seats: 'Unlimited',
    robots: 'Unlimited',
    credits: '100k+ AI credits / mo',
    features: ['SAML SSO & data residency', 'Dedicated success manager', 'Custom rostering & SLA', 'On-prem cloud option'],
    cta: 'link' as const,
    ctaLabel: 'Talk to sales',
    ctaHref: 'mailto:sales@sketchbot.app',
    badge: 'Enterprise',
  },
];

function CheckoutButton({ plan, billing, label, featured }: {
  plan: CheckoutPlan;
  billing: BillingPeriod;
  label: string;
  featured?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = `/sign-in?redirect=/pricing`;
        return;
      }
      const res = await fetch(`${CLOUD_API_URL}/api/subscriptions/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan, billing }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { detail?: string }).detail ?? 'Could not start checkout. Try again.');
        return;
      }
      window.location.href = (data as { url: string }).url;
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        className={`plan-cta-btn${featured ? ' featured' : ''}`}
        onClick={handleClick}
        disabled={loading}
        style={loading ? { opacity: 0.7 } : undefined}
      >
        {loading && <Loader2 size={14} className="checkout-btn-spinner" />}
        {loading ? 'Redirecting…' : label}
      </button>
      {error && <p className="checkout-btn-error">{error}</p>}
    </div>
  );
}

export function PricingCards() {
  const [billing, setBilling] = useState<BillingPeriod>('monthly');

  return (
    <>
      {/* Billing toggle */}
      <Reveal>
        <div className="billing-toggle-wrap">
          <div className="billing-toggle">
            <button
              type="button"
              className={`billing-toggle-btn${billing === 'monthly' ? ' active' : ''}`}
              onClick={() => setBilling('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`billing-toggle-btn${billing === 'annual' ? ' active' : ''}`}
              onClick={() => setBilling('annual')}
            >
              Annual
              <span className="billing-toggle-save">Save ~17%</span>
            </button>
          </div>
        </div>
      </Reveal>

      {/* Plan cards */}
      <RevealGroup stagger={0.08} className="pricing-grid">
        {plans.map((plan) => {
          const pricing = billing === 'monthly' ? plan.monthly : plan.annual;
          return (
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
                <span className={`plan-price${plan.featured ? ' grad-text' : ''}`}>{pricing.price}</span>
                <span className="plan-price-note">{pricing.note}</span>
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

              {plan.cta === 'checkout' && plan.checkout ? (
                <CheckoutButton
                  plan={plan.checkout}
                  billing={billing}
                  label={plan.ctaLabel}
                  featured={plan.featured}
                />
              ) : (
                <Link href={plan.ctaHref!} className="plan-cta-btn">
                  {plan.ctaLabel}
                </Link>
              )}
            </article>
          );
        })}
      </RevealGroup>
    </>
  );
}

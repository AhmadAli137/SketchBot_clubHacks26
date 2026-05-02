'use client';

import { motion, AnimatePresence } from 'motion/react';
import type { Entitlements } from '@/lib/use-entitlements';
import { tierLabel } from '@/lib/use-entitlements';

type Props = {
  entitlements: Entitlements;
  feature?: string;
  onDismiss?: () => void;
};

const UPGRADE_URL = 'https://sayspark.ca/pricing';

const TIER_NEXT: Record<string, { name: string; credits: string; price: string }> = {
  free:      { name: 'Home',      credits: '300',    price: '$12/mo' },
  home:      { name: 'Classroom', credits: '2,500',  price: '$49/mo' },
  classroom: { name: 'School',    credits: '15,000', price: '$249/mo' },
  school:    { name: 'District',  credits: '100k+',  price: 'Custom' },
};

export function PaywallOverlay({ entitlements, feature, onDismiss }: Props) {
  const next = TIER_NEXT[entitlements.tier];
  const isCredits = entitlements.credits_remaining <= 0;

  return (
    <motion.div
      className="paywall-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onDismiss}
    >
      <motion.div
        className="paywall-card"
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="paywall-icon">{isCredits ? '⚡' : '🔒'}</div>

        <h2 className="paywall-title">
          {isCredits ? 'You\'ve used all your AI credits' : `${feature ?? 'This feature'} requires an upgrade`}
        </h2>

        <p className="paywall-body">
          {isCredits
            ? `Your ${tierLabel(entitlements.tier)} plan includes ${entitlements.monthly_credits} AI credits per month. Credits reset on the 1st of each month.`
            : `Your current plan (${tierLabel(entitlements.tier)}) doesn't include access to this feature.`}
        </p>

        <div className="paywall-usage">
          <div className="paywall-usage-row">
            <span>Credits used this month</span>
            <span className="paywall-usage-val">
              {entitlements.credits_used} <span className="paywall-usage-of">/ {entitlements.monthly_credits}</span>
            </span>
          </div>
          <div className="paywall-bar-track">
            <div
              className="paywall-bar-fill"
              style={{
                width: `${Math.min(100, (entitlements.credits_used / Math.max(1, entitlements.monthly_credits)) * 100)}%`,
              }}
            />
          </div>
        </div>

        {next && (
          <div className="paywall-next">
            <p className="paywall-next-label">Upgrade to {next.name}</p>
            <ul className="paywall-next-perks">
              <li>✓ {next.credits} AI credits / month</li>
              <li>✓ Real robot support</li>
              <li>✓ Full concept library</li>
            </ul>
            <p className="paywall-next-price">Starting at {next.price}</p>
          </div>
        )}

        <div className="paywall-actions">
          <a
            href={UPGRADE_URL}
            target="_blank"
            rel="noreferrer"
            className="paywall-btn-upgrade"
          >
            View plans →
          </a>
          {onDismiss && (
            <button type="button" className="paywall-btn-dismiss" onClick={onDismiss}>
              Maybe later
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function PaywallGate({
  entitlements,
  feature,
  children,
}: {
  entitlements: Entitlements | null;
  feature?: string;
  children: React.ReactNode;
}) {
  if (!entitlements || entitlements.can_use_ai) return <>{children}</>;
  return (
    <AnimatePresence>
      <PaywallOverlay entitlements={entitlements} feature={feature} />
    </AnimatePresence>
  );
}

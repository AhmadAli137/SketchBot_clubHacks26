'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, X } from 'lucide-react';

export function UpgradeBanner({ show }: { show: boolean }) {
  const router = useRouter();
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    if (!show) return;
    // Remove ?upgraded=1 from URL so refresh doesn't re-show it
    const url = new URL(window.location.href);
    url.searchParams.delete('upgraded');
    router.replace(url.pathname + (url.search || ''), { scroll: false });
  }, [show, router]);

  if (!visible) return null;

  return (
    <div className="upgrade-banner" role="alert">
      <CheckCircle size={18} className="upgrade-banner-icon" />
      <div className="upgrade-banner-text">
        <strong>You&apos;re upgraded!</strong> Your new plan is active — enjoy the extra AI credits and features.
      </div>
      <button type="button" className="upgrade-banner-close" onClick={() => setVisible(false)} aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  );
}

import { ReactNode } from 'react';

import { GlassPanel, PanelHeader } from '@/components/ui-shell';

export function SectionCard({
  title,
  subtitle,
  children,
  eyebrow,
  right,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  eyebrow?: string;
  right?: ReactNode;
}) {
  return (
    <GlassPanel className="p-5 md:p-6">
      <PanelHeader eyebrow={eyebrow} title={title} subtitle={subtitle} right={right} />
      {children}
    </GlassPanel>
  );
}

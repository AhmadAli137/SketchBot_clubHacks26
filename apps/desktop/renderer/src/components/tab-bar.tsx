import { cn } from '@/lib/ui';

export type TabKey = 'overview' | 'plan' | 'control' | 'diagnostics';

const tabs: Array<{ key: TabKey; label: string; short: string }> = [
  { key: 'overview', label: 'Overview', short: 'Home' },
  { key: 'plan', label: 'Planner', short: 'Plan' },
  { key: 'control', label: 'Control', short: 'Control' },
  { key: 'diagnostics', label: 'Diagnostics', short: 'Logs' },
];

export function TabBar({ active, onChange }: { active: TabKey; onChange: (tab: TabKey) => void }) {
  return (
    <div className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="inline-flex min-w-full gap-2 rounded-[22px] border border-[rgba(120,140,255,0.14)] bg-[rgba(7,10,22,0.76)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={cn(
                'flex min-w-[108px] flex-1 flex-col items-center justify-center rounded-2xl px-4 py-2.5 text-center transition md:min-w-0',
                isActive
                  ? 'bg-[linear-gradient(135deg,rgba(77,226,255,0.22),rgba(91,124,255,0.18))] text-white shadow-[0_0_18px_rgba(77,226,255,0.12)]'
                  : 'text-slate-300 hover:bg-[rgba(255,255,255,0.04)] hover:text-white',
              )}
            >
              <span className="text-sm font-medium md:hidden">{tab.short}</span>
              <span className="hidden text-sm font-medium md:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

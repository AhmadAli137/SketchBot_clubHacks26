export function EventLog({ events }: { events: string[] }) {
  return (
    <div className="space-y-3">
      {events.length === 0 ? (
        <div className="rounded-2xl border border-[rgba(120,140,255,0.12)] bg-[rgba(5,8,22,0.72)] px-4 py-3 text-sm text-[var(--muted)]">
          No events yet.
        </div>
      ) : null}
      {events.map((event, index) => (
        <div
          key={`${event}-${index}`}
          className="rounded-2xl border border-[rgba(120,140,255,0.12)] bg-[linear-gradient(180deg,rgba(8,12,24,0.88),rgba(5,8,20,0.82))] px-4 py-3 text-sm text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
        >
          {event}
        </div>
      ))}
    </div>
  );
}

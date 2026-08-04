export default function Home() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted mt-1">
          Never miss the events you&apos;ll love.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Artists" value="--" note="Connect Spotify to import" />
        <StatCard label="Events" value="--" note="No sources polled yet" />
        <StatCard label="Matches" value="--" note="Set preferences first" />
        <StatCard label="Alerts sent" value="0" note="Console mode" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Getting started">
          <ChecklistItem done={false} label="Connect your Spotify account" />
          <ChecklistItem done={false} label="Set your event preferences" />
          <ChecklistItem done={false} label="Run first event poll" />
          <ChecklistItem done={false} label="Review alert previews" />
          <ChecklistItem done={false} label="Enable WhatsApp alerts" />
        </Section>

        <Section title="Recent alerts">
          <p className="text-sm text-muted py-4">
            No alerts yet. Connect Spotify and set your preferences to get started.
          </p>
        </Section>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <div className="w-1 h-full min-h-[2rem] rounded bg-gold flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium mb-1">System status</p>
            <p className="text-muted">
              WhatsApp: <Tag>console</Tag>{" "}
              Alerts: <Tag>disabled</Tag>{" "}
              Sources: <Tag>hybrid</Tag>{" "}
              Mock data: <Tag>enabled</Tag>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs text-muted font-mono uppercase tracking-wider">
        {label}
      </p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      <p className="text-xs text-muted mt-1">{note}</p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="font-medium mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-xs ${
          done
            ? "bg-accent border-accent text-white"
            : "border-border"
        }`}
      >
        {done && "✓"}
      </span>
      <span className={done ? "text-muted line-through" : ""}>{label}</span>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block bg-surface-alt text-muted font-mono text-xs px-1.5 py-0.5 rounded">
      {children}
    </span>
  );
}

export default function AlertsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
        <p className="text-muted mt-1">
          Matched events and alert delivery history.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-8 text-center">
        <p className="text-muted">
          No alerts yet. Set your preferences and run an event poll to generate matches.
        </p>
      </div>
    </div>
  );
}

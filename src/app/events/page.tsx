export default function EventsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="text-muted mt-1">
          Discovered events from Ticketmaster and manual sources.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-8 text-center">
        <p className="text-muted">
          No events found yet. Run an event poll or import fixtures to get started.
        </p>
      </div>
    </div>
  );
}

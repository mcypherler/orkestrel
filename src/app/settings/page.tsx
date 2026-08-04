export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted mt-1">
          Your event preferences and account connections.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <h2 className="font-medium">Event preferences</h2>
          <p className="text-sm text-muted">
            Configure your location, budget and seat preferences. Coming in Phase 3.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <h2 className="font-medium">Connections</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>Spotify</span>
              <span className="text-muted font-mono text-xs bg-surface-alt px-2 py-0.5 rounded">
                not connected
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>WhatsApp</span>
              <span className="text-muted font-mono text-xs bg-surface-alt px-2 py-0.5 rounded">
                console mode
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

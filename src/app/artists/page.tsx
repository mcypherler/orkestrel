export default function ArtistsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Artists</h1>
        <p className="text-muted mt-1">
          Your followed artists from Spotify and manual additions.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-8 text-center">
        <p className="text-muted mb-4">
          Connect your Spotify account to import your favourite artists.
        </p>
        <a
          href="/api/auth/spotify"
          className="inline-block bg-accent text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
        >
          Connect Spotify
        </a>
      </div>
    </div>
  );
}

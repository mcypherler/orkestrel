"use client";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-surface-alt rounded ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-10" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: cards }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <g style={{ animation: "note-rise 1.4s ease-in-out infinite" }}>
        <circle cx="6" cy="16" r="2" />
        <rect x="7.5" y="6" width="1.2" height="10" rx="0.6" />
        <path d="M8.7 6 C11 5 13 4.5 13 6.5 C13 8.5 11 8 8.7 9 Z" />
      </g>
      <g style={{ animation: "note-rise 1.4s ease-in-out infinite 0.3s", opacity: 0.5 }}>
        <circle cx="16" cy="18" r="1.5" />
        <rect x="17" y="10" width="1" height="8" rx="0.5" />
      </g>
      <g style={{ animation: "note-rise 1.4s ease-in-out infinite 0.7s", opacity: 0.3 }}>
        <circle cx="12" cy="20" r="1.2" />
        <rect x="12.8" y="13" width="0.9" height="7" rx="0.45" />
      </g>
    </svg>
  );
}

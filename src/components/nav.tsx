"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface User {
  userId: string;
  displayName: string;
  spotifyId: string;
}

export default function Nav() {
  const [user, setUser] = useState<User | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user));
  }, []);

  const links = [
    { href: "/", label: "Dashboard" },
    { href: "/artists", label: "Artists" },
    { href: "/events", label: "Events" },
    { href: "/alerts", label: "Alerts" },
    { href: "/settings", label: "Settings" },
  ];

  return (
    <nav className="border-b border-border">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lg tracking-tight">
              Orkestrel
            </span>
            <span className="text-xs text-muted font-mono bg-surface-alt px-2 py-0.5 rounded">
              prototype
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-sm">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`transition-colors ${
                  pathname === link.href
                    ? "text-foreground font-medium"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="text-sm text-muted">
          {user ? (
            <span>{user.displayName}</span>
          ) : (
            <a
              href="/api/auth/spotify"
              className="text-accent hover:underline"
            >
              Sign in
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}

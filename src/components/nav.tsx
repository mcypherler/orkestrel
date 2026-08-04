"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

interface User {
  userId: string;
  displayName: string;
  spotifyId: string;
}

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/artists", label: "Artists" },
  { href: "/events", label: "Events" },
  { href: "/alerts", label: "Alerts" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && menuOpen) {
        setMenuOpen(false);
        buttonRef.current?.focus();
      }
    },
    [menuOpen]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      <nav className="border-b border-border relative z-50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="Orkestrel"
                width={28}
                height={28}
                className="dark:invert"
              />
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
                      ? "text-accent font-medium"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-muted">
              {authLoading ? (
                <span className="inline-block w-20 h-4 bg-surface-alt rounded animate-pulse" />
              ) : user ? (
                <span>{user.displayName}</span>
              ) : (
                <a
                  href="/api/auth/spotify"
                  className="text-accent hover:text-accent-hover transition-colors"
                >
                  Sign in
                </a>
              )}
            </div>
            <button
              ref={buttonRef}
              type="button"
              className="sm:hidden p-2 -mr-2 text-muted hover:text-foreground transition-colors"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                {menuOpen ? (
                  <>
                    <line x1="4" y1="4" x2="16" y2="16" />
                    <line x1="16" y1="4" x2="4" y2="16" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="5" x2="17" y2="5" />
                    <line x1="3" y1="10" x2="17" y2="10" />
                    <line x1="3" y1="15" x2="17" y2="15" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm sm:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        ref={menuRef}
        id="mobile-menu"
        role="navigation"
        aria-label="Mobile navigation"
        className={`fixed top-14 right-0 bottom-0 z-50 w-64 bg-surface border-l border-border
          transform transition-transform duration-200 ease-out sm:hidden
          ${menuOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex flex-col py-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-6 py-3 text-sm transition-colors ${
                pathname === link.href
                  ? "text-accent font-medium bg-accent-light"
                  : "text-muted hover:text-foreground hover:bg-surface-alt"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Orkestrel",
  description: "Never miss the events you'll love",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <nav className="border-b border-border">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-lg tracking-tight">
                Orkestrel
              </span>
              <span className="text-xs text-muted font-mono bg-surface-alt px-2 py-0.5 rounded">
                prototype
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <a href="/" className="text-muted hover:text-foreground transition-colors">
                Dashboard
              </a>
              <a href="/artists" className="text-muted hover:text-foreground transition-colors">
                Artists
              </a>
              <a href="/events" className="text-muted hover:text-foreground transition-colors">
                Events
              </a>
              <a href="/alerts" className="text-muted hover:text-foreground transition-colors">
                Alerts
              </a>
              <a href="/settings" className="text-muted hover:text-foreground transition-colors">
                Settings
              </a>
            </div>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="grain min-h-screen bg-ink text-bone">
      <header className="flex items-center justify-between px-5 py-5 md:px-10">
        <Link to="/" className="eyebrow">← Titu Backpackers</Link>
        <span className="eyebrow text-muted-foreground">Coorg 2026</span>
      </header>
      <main className="mx-auto w-full max-w-2xl px-5 pb-24 pt-6 md:pt-12">{children}</main>
      <footer className="flex flex-wrap gap-5 border-t border-border px-5 py-8 md:px-10">
        <Link to="/faq" className="eyebrow text-muted-foreground hover:text-bone">FAQ</Link>
        <Link to="/terms" className="eyebrow text-muted-foreground hover:text-bone">Terms</Link>
        <Link to="/privacy" className="eyebrow text-muted-foreground hover:text-bone">Privacy</Link>
        <a href="https://instagram.com/titubagpackers" target="_blank" rel="noreferrer" className="eyebrow text-muted-foreground hover:text-bone">@titubagpackers</a>
      </footer>
    </div>
  );
}

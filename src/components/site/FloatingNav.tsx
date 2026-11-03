import { Link } from "@tanstack/react-router";

export function FloatingNav() {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-5 py-4 md:px-10 md:py-6 mix-blend-difference">
        <Link to="/" className="eyebrow text-bone">Titu Backpackers</Link>
        <nav className="hidden items-center gap-8 md:flex">
          <a href="/#experience" className="eyebrow text-bone/80 hover:text-bone">The Experience</a>
          <Link to="/faq" className="eyebrow text-bone/80 hover:text-bone">FAQ</Link>
          <Link to="/register" className="eyebrow text-bone/80 hover:text-bone">Register</Link>
        </nav>
      </header>
      <Link
        to="/register"
        className="fixed bottom-5 right-5 z-50 rounded-full bg-ember px-6 py-3.5 font-display text-lg tracking-wide text-ink shadow-2xl transition-transform hover:scale-105 md:bottom-8 md:right-8"
      >
        I'm in →
      </Link>
    </>
  );
}

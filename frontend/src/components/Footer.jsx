import { Link } from 'react-router-dom';
import { KaafilaLogo } from './Navbar';

export default function Footer() {
  return (
    <footer className="border-t border-kaafila-yellow/20 bg-[#101211]">
      <div className="himalayan-divider" />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <KaafilaLogo />
            <p className="mt-4 max-w-md text-sm leading-relaxed text-kaafila-muted">
              KAAFILA is the centralised marketplace for Himalayan motorcycle touring—connecting expedition outfits
              with riders to discover routes, compare safety &amp; fleet facilities, and book directly on official
              websites.
            </p>
            <p className="mt-4 inline-block rounded border border-kaafila-earth/60 bg-kaafila-earth/15 px-3 py-1.5 font-mono text-[11px] text-kaafila-text/80">
              DEMO NOTICE: Pre-loaded outfits &amp; expeditions are clearly marked Demo Listings until real operators verify.
            </p>
          </div>

          <div>
            <h4 className="font-display text-sm font-semibold uppercase tracking-widest text-kaafila-yellow">
              Marketplace
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm text-kaafila-muted">
              <li>
                <Link to="/" className="hover:text-kaafila-yellow transition">
                  Homepage
                </Link>
              </li>
              <li>
                <Link to="/organisations" className="hover:text-kaafila-yellow transition">
                  Explore Organisations
                </Link>
              </li>
              <li>
                <Link to="/rides" className="hover:text-kaafila-yellow transition">
                  Featured Expeditions
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-display text-sm font-semibold uppercase tracking-widest text-kaafila-yellow">
              Accounts
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm text-kaafila-muted">
              <li>
                <Link to="/register?role=rider" className="hover:text-kaafila-yellow transition">
                  Rider Registration
                </Link>
              </li>
              <li>
                <Link to="/register?role=organisation" className="hover:text-kaafila-yellow transition">
                  Organisation Registration
                </Link>
              </li>
              <li>
                <Link to="/login" className="hover:text-kaafila-yellow transition">
                  Sign In
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-kaafila-muted sm:flex-row">
          <p>© {new Date().getFullYear()} KAAFILA. Built for Himalayan Motorcycle Touring.</p>
          <p className="font-mono text-[11px]">Bookings complete directly on each organisation&apos;s official website.</p>
        </div>
      </div>
    </footer>
  );
}

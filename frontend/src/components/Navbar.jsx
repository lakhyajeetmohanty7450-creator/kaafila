import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Menu, X, Compass, LogOut, User as UserIcon, Building2, Shield, Bell, MessageSquare } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export function KaafilaLogo({ compact = false }) {
  return (
    <Link to="/" className="group flex items-center gap-3">
      <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-kaafila-yellow/60 bg-kaafila-surface shadow-amber transition group-hover:border-kaafila-yellow">
        <svg viewBox="0 0 36 36" className="h-6 w-6 text-kaafila-yellow" fill="none">
          <path
            d="M4 26L13 11L19 20L24 14L32 26H4Z"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <circle cx="24" cy="9" r="2.2" fill="currentColor" />
        </svg>
      </div>
      {!compact && (
        <div className="leading-none">
          <span className="font-display text-2xl font-bold tracking-[0.14em] text-kaafila-text group-hover:text-kaafila-yellow transition">
            KAAFILA
          </span>
          <span className="block font-mono text-[9px] uppercase tracking-[0.26em] text-kaafila-yellow/80">
            Himalayan Moto Marketplace
          </span>
        </div>
      )}
    </Link>
  );
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const { unreadNotifications } = useSocket();
  const navigate = useNavigate();

  const navItems = [
    { label: 'Home', to: '/' },
    { label: 'Organisations', to: '/organisations' },
    { label: 'Expeditions', to: '/rides' },
    { label: 'Maps', to: '/maps' },
    { label: 'Leaderboards', to: '/leaderboards' },
    { label: 'Community', to: '/community' },
  ];

  const dashboardPath =
    user?.role === 'organisation'
      ? '/dashboard/organisation'
      : user?.role === 'rider'
        ? '/dashboard/rider'
        : '/account';

  const handleLogout = () => {
    setMobileOpen(false);
    navigate('/', { replace: true });
    setTimeout(() => logout(), 0);
  };

  const navLinkClass = ({ isActive }) =>
    `text-sm font-medium tracking-wide transition ${
      isActive ? 'text-kaafila-yellow' : 'text-kaafila-text/80 hover:text-kaafila-yellow'
    }`;

  return (
    <header className="sticky top-0 z-50 border-b border-kaafila-yellow/20 bg-kaafila-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
        <KaafilaLogo />

        <nav aria-label="Primary navigation" className="hidden items-center gap-5 lg:flex xl:gap-7">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2.5 lg:flex">
          {isAuthenticated ? (
            <>
              {user?.role === 'rider' && (
                <Link
                  to="/community/messages"
                  className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-kaafila-surface text-kaafila-text hover:border-kaafila-yellow hover:text-kaafila-yellow transition"
                  title="Private Messages"
                  aria-label="Private Messages"
                >
                  <MessageSquare className="h-4 w-4" />
                </Link>
              )}
              <Link
                to="/notifications"
                className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-kaafila-surface text-kaafila-text hover:border-kaafila-yellow hover:text-kaafila-yellow transition"
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-kaafila-yellow px-1 font-mono text-[10px] font-bold text-kaafila-bg">
                    {unreadNotifications > 99 ? '99+' : unreadNotifications}
                  </span>
                )}
              </Link>
              <Link
                to={dashboardPath}
                className="flex items-center gap-2 rounded-lg border border-kaafila-yellow/35 bg-kaafila-surface px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-kaafila-text hover:border-kaafila-yellow hover:text-kaafila-yellow transition"
              >
                {user?.role === 'organisation' ? (
                  <Building2 className="h-4 w-4 text-kaafila-yellow" />
                ) : user?.role === 'admin' ? (
                  <Shield className="h-4 w-4 text-kaafila-yellow" />
                ) : (
                  <UserIcon className="h-4 w-4 text-kaafila-yellow" />
                )}
                <span>
                  {user?.role === 'organisation'
                    ? 'Org Dashboard'
                    : user?.role === 'rider'
                      ? 'Rider Dashboard'
                      : user?.fullName?.split(' ')[0] || 'Account'}
                </span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-kaafila-muted hover:border-red-400/40 hover:text-red-300 transition"
                title="Log out"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-lg px-4 py-2 text-sm font-medium text-kaafila-text/90 hover:text-kaafila-yellow transition"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-lg bg-kaafila-yellow px-4 py-2 text-sm font-bold text-kaafila-bg shadow-amber hover:bg-kaafila-yellowHover transition"
              >
                <Compass className="h-4 w-4" />
                <span>Join KAAFILA</span>
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="inline-flex items-center justify-center rounded-lg border border-kaafila-yellow/30 p-2 text-kaafila-text lg:hidden"
          aria-label="Toggle navigation menu"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-kaafila-yellow/15 bg-kaafila-surface px-4 py-4 lg:hidden">
          <div className="flex flex-col gap-3">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMobileOpen(false)}
                className={navLinkClass}
              >
                {item.label}
              </NavLink>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-3">
              {isAuthenticated ? (
                <>
                  <Link
                    to="/notifications"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-lg border border-white/15 px-4 py-2.5 text-center text-sm font-medium text-kaafila-text"
                  >
                    Notifications {unreadNotifications > 0 ? `(${unreadNotifications})` : ''}
                  </Link>
                  {user?.role === 'rider' && (
                    <Link
                      to="/community/messages"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-lg border border-white/15 px-4 py-2.5 text-center text-sm font-medium text-kaafila-text"
                    >
                      Messages
                    </Link>
                  )}
                  <Link
                    to={dashboardPath}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-lg border border-kaafila-yellow/40 px-4 py-2.5 text-center text-sm font-semibold text-kaafila-yellow"
                  >
                    {user?.role === 'organisation'
                      ? 'Organisation Dashboard'
                      : user?.role === 'rider'
                        ? 'Rider Dashboard'
                        : `Account (${user?.role})`}
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-kaafila-muted"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-lg border border-kaafila-yellow/30 px-4 py-2.5 text-center text-sm font-medium text-kaafila-text"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-lg bg-kaafila-yellow px-4 py-2.5 text-center text-sm font-bold text-kaafila-bg"
                  >
                    Join KAAFILA
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

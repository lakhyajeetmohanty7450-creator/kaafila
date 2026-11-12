import { Link, Navigate } from 'react-router-dom';
import { Building2, Bike, ExternalLink, ShieldCheck, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AccountPage() {
  const { user, riderProfile, organisation, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="h-48 animate-pulse rounded-2xl bg-kaafila-surface" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role === 'rider') {
    return <Navigate to="/dashboard/rider" replace />;
  }

  if (user?.role === 'organisation') {
    return <Navigate to="/dashboard/organisation" replace />;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-kaafila-primary/30 bg-kaafila-surface p-8 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-kaafila-border pb-6">
          <div>
            <span className="font-mono text-xs uppercase tracking-widest text-kaafila-accent">
              Authenticated {user.role} Account
            </span>
            <h1 className="mt-1 font-display text-3xl font-bold uppercase text-kaafila-text sm:text-4xl">
              {user.fullName}
            </h1>
            <p className="mt-1 text-sm text-kaafila-muted">{user.email}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-kaafila-primary/50 bg-kaafila-primary/10 px-4 py-1.5 font-mono text-xs font-bold uppercase text-kaafila-accent">
            <ShieldCheck className="h-4 w-4" /> Role: {user.role}
          </span>
        </div>

        {user.role === 'rider' && (
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-kaafila-border bg-kaafila-bg p-5">
              <div className="flex items-center gap-2 text-xs uppercase text-kaafila-muted">
                <MapPin className="h-4 w-4 text-kaafila-accent" />
                <span>Home City</span>
              </div>
              <p className="mt-2 font-display text-2xl font-bold text-kaafila-text">
                {user.city || riderProfile?.homeCity || 'India'}
              </p>
            </div>

            <div className="rounded-2xl border border-kaafila-border bg-kaafila-bg p-5">
              <div className="flex items-center gap-2 text-xs uppercase text-kaafila-muted">
                <Bike className="h-4 w-4 text-kaafila-accent" />
                <span>Marketplace Access</span>
              </div>
              <p className="mt-2 text-sm text-kaafila-muted">
                Explore touring organisations, compare expedition itineraries, and publish genuine reviews.
              </p>
              <Link
                to="/organisations"
                className="mt-4 inline-block rounded-lg bg-kaafila-primary px-4 py-2 text-xs font-bold uppercase text-kaafila-dark"
              >
                Browse Organisations
              </Link>
            </div>
          </div>
        )}

        {user.role === 'organisation' && organisation && (
          <div className="mt-8 rounded-2xl border border-kaafila-primary/25 bg-kaafila-bg p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 font-mono text-xs uppercase text-kaafila-accent">
                  <Building2 className="h-4 w-4" />
                  <span>Verification: {organisation.verificationStatus}</span>
                </div>
                <h2 className="mt-1 font-display text-2xl font-bold text-kaafila-text">{organisation.name}</h2>
                <p className="mt-1 text-sm text-kaafila-muted">{organisation.shortDescription}</p>
              </div>
              <Link
                to={`/organisations/${organisation.slug}`}
                className="inline-flex items-center gap-2 rounded-xl bg-kaafila-primary px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-dark"
              >
                <span>View Public Listing</span>
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

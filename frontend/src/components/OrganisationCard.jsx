import { Link } from 'react-router-dom';
import { MapPin, BadgeCheck, Clock, Star, Compass, ArrowUpRight, ShieldAlert } from 'lucide-react';

export default function OrganisationCard({ org }) {
  const hasGenuineRating = org.reviewCount > 0 && typeof org.ratingAverage === 'number';
  const med = org.facilities?.medicalAndEmergency;

  return (
    <article className="group flex flex-col justify-between overflow-hidden rounded-xl border border-kaafila-border bg-kaafila-surface shadow-card transition duration-300 hover:-translate-y-0.5 hover:border-kaafila-primary">
      <div>
        <div className="relative h-44 overflow-hidden bg-kaafila-elevated">
          <img
            src={org.coverImageUrl || '/images/hero-himalaya.png'}
            alt={org.name}
            className="h-full w-full object-cover opacity-80 transition duration-500 group-hover:scale-105 group-hover:opacity-95"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-kaafila-surface via-kaafila-surface/30 to-transparent" />

          <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
            {org.isDemo ? (
              <span className="rounded-full border border-kaafila-accent/45 bg-kaafila-bg/90 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-kaafila-accent backdrop-blur-sm">
                Demo Organisation
              </span>
            ) : org.isVerified ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-kaafila-primary/60 bg-kaafila-bg/85 px-2.5 py-1 text-[11px] font-semibold text-kaafila-accent backdrop-blur-sm">
                <BadgeCheck className="h-3.5 w-3.5" />
                Verified Outfit
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-kaafila-border bg-kaafila-bg/85 px-2.5 py-1 text-[11px] font-medium text-kaafila-muted backdrop-blur-sm">
                <Clock className="h-3.5 w-3.5" />
                Verification Pending
              </span>
            )}
          </div>

          <div className="absolute -bottom-6 left-5 h-14 w-14 overflow-hidden rounded-xl border-2 border-kaafila-primary bg-kaafila-bg shadow-lg">
            {org.logoUrl ? (
              <img src={org.logoUrl} alt={`${org.name} logo`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-display text-xl font-bold text-kaafila-accent">
                {org.name?.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 pb-4 pt-9">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-display text-xl font-semibold tracking-wide text-kaafila-text group-hover:text-kaafila-accent transition">
                {org.name}
              </h3>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-kaafila-muted">
                <MapPin className="h-3.5 w-3.5 text-kaafila-accent/80" />
                <span>
                  {org.location?.city}, {org.location?.state}
                </span>
              </p>
            </div>

            {hasGenuineRating ? (
              <div className="flex items-center gap-1 rounded-lg border border-kaafila-coral/40 bg-kaafila-sand/60 px-2.5 py-1 text-xs font-bold text-kaafila-text">
                <Star className="h-3.5 w-3.5 fill-kaafila-coral text-kaafila-coral" />
                <span>{org.ratingAverage.toFixed(1)}</span>
                <span className="font-normal text-kaafila-muted">({org.reviewCount})</span>
              </div>
            ) : (
              <span className="rounded-lg border border-kaafila-border bg-kaafila-elevated px-2 py-1 text-[11px] text-kaafila-muted">
                No reviews yet
              </span>
            )}
          </div>

          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-kaafila-text/80">{org.shortDescription}</p>

          <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-kaafila-muted">
            {med?.oxygenSupport && (
              <span className="inline-flex items-center gap-1 rounded border border-kaafila-border bg-kaafila-bg px-2 py-0.5">
                <ShieldAlert className="h-3 w-3 text-kaafila-accent" /> O2 Backup
              </span>
            )}
            {org.facilities?.bikeRental?.available && (
              <span className="rounded border border-kaafila-border bg-kaafila-bg px-2 py-0.5">Fleet Rentals</span>
            )}
            {med?.backupVehicle && (
              <span className="rounded border border-kaafila-border bg-kaafila-bg px-2 py-0.5">4x4 Sweep</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-kaafila-border bg-kaafila-bg/60 px-5 py-3.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-kaafila-text">
          <Compass className="h-4 w-4 text-kaafila-accent" />
          <span>
            {org.availableRidesCount ?? 0} {org.availableRidesCount === 1 ? 'Ride Available' : 'Rides Available'}
          </span>
        </div>

        <Link
          to={`/organisations/${org.slug}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-kaafila-royal/30 bg-kaafila-royal/5 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-kaafila-royal transition hover:bg-kaafila-royal hover:text-white"
        >
          <span>View Organisation</span>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}

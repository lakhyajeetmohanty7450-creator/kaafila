import { Link } from 'react-router-dom';
import { Mountain, Calendar, Route, ArrowRight } from 'lucide-react';

export default function ExpeditionCard({ ride }) {
  const org = ride.organisation;
  const formattedDate = ride.startDate
    ? new Date(ride.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Dates TBA';

  const difficultyStyles = {
    moderate: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    challenging: 'border-kaafila-yellow/50 bg-kaafila-yellow/10 text-kaafila-yellow',
    extreme: 'border-orange-500/50 bg-orange-500/15 text-orange-300',
  };

  return (
    <article className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-kaafila-surface shadow-card transition duration-300 hover:border-kaafila-yellow/55">
      <div>
        <div className="relative h-48 overflow-hidden">
          <img
            src={ride.coverImageUrl || '/images/expedition-ladakh.png'}
            alt={ride.title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-kaafila-surface via-black/35 to-transparent" />

          <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-2">
            <span className="rounded-md bg-kaafila-bg/85 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-kaafila-yellow backdrop-blur-sm">
              {ride.region}
            </span>
            <span
              className={`rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider backdrop-blur-sm ${
                difficultyStyles[ride.difficulty] || difficultyStyles.challenging
              }`}
            >
              {ride.difficulty}
            </span>
          </div>

          <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs text-kaafila-text/90">
            <span className="inline-flex items-center gap-1 font-mono">
              <Mountain className="h-3.5 w-3.5 text-kaafila-yellow" />
              {ride.maxAltitudeMeters?.toLocaleString()}m Max Alt
            </span>
            <span className="inline-flex items-center gap-1 font-mono">
              <Route className="h-3.5 w-3.5 text-kaafila-yellow" />
              {ride.distanceKm} km · {ride.durationDays}D
            </span>
          </div>
        </div>

        <div className="p-5">
          {org && (
            <p className="font-mono text-[11px] uppercase tracking-wider text-kaafila-yellow/90">
              {org.name} {org.isDemo ? '· DEMO' : ''}
            </p>
          )}
          <h3 className="mt-1 font-display text-xl font-semibold text-kaafila-text group-hover:text-kaafila-yellow transition">
            {ride.title}
          </h3>
          <p className="mt-2 line-clamp-2 text-sm text-kaafila-muted">{ride.tagline}</p>

          <div className="mt-4 flex items-center gap-2 text-xs text-kaafila-text/80">
            <Calendar className="h-3.5 w-3.5 text-kaafila-yellow" />
            <span>
              {formattedDate} · {ride.startLocation} → {ride.endLocation}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/10 bg-kaafila-bg/50 px-5 py-3.5">
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-kaafila-muted">Starting From</span>
          <span className="font-mono text-base font-bold text-kaafila-yellow">
            ₹{Number(ride.priceInr || 0).toLocaleString('en-IN')}
          </span>
        </div>

        <Link
          to={ride.slug ? `/rides/${ride.slug}` : org?.slug ? `/organisations/${org.slug}` : '/rides'}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-kaafila-text hover:text-kaafila-yellow transition"
        >
          <span>View Expedition</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}


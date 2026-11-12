import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  Bike,
  Calendar,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Mountain,
  Route,
  ShieldAlert,
  Users,
  XCircle,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function safeExternalUrl(url) {
  if (!url) return 'https://kaafila.in';
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : 'https://kaafila.in';
  } catch {
    return 'https://kaafila.in';
  }
}

export default function RideDetailPage() {
  const { slug } = useParams();
  const { user, isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bikeChoice, setBikeChoice] = useState('rental');
  const [shareContact, setShareContact] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadRide = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/rides/${slug}`);
      if (data?.success) {
        setRide(data.data);
        if (data.data.myParticipation) {
          setBikeChoice(data.data.myParticipation.bikeChoice || 'rental');
          setShareContact(Boolean(data.data.myParticipation.shareContactWithOrganisation));
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load expedition details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRide();
  }, [slug]);

  const handleParticipate = async (nextStatus) => {
    if (!ride) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/rides/${ride._id}/participate`, {
        status: nextStatus,
        bikeChoice,
        shareContactWithOrganisation: shareContact,
      });
      showToast(data?.message || 'Roster updated.', 'success');
      await loadRide();
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to update expedition registration.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="h-80 animate-pulse rounded-3xl bg-kaafila-surface" />
      </div>
    );
  }

  if (error || !ride) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="font-display text-3xl text-kaafila-text">Expedition Not Found</h1>
        <p className="mt-2 text-sm text-kaafila-muted">{error}</p>
        <Link
          to="/rides"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-kaafila-primary px-5 py-2.5 text-xs font-bold uppercase text-kaafila-dark"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Expeditions
        </Link>
      </div>
    );
  }

  const org = ride.organisation;
  const bookingLink = safeExternalUrl(ride.bookingUrl || org?.bookingUrl || org?.officialWebsite);
  const myStatus = ride.myParticipation?.status || null;

  return (
    <div className="pb-20">
      <section className="relative border-b border-kaafila-primary/25 bg-kaafila-surface">
        <div className="relative h-72 overflow-hidden sm:h-96">
          <img
            src={ride.coverImageUrl || '/images/expedition-ladakh.png'}
            alt={ride.title}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-kaafila-bg via-kaafila-bg/60 to-transparent" />
        </div>

        <div className="relative mx-auto -mt-28 max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
          <Link
            to="/rides"
            className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-kaafila-border bg-kaafila-bg/85 px-3 py-1.5 text-xs text-kaafila-text backdrop-blur-sm hover:border-kaafila-primary hover:text-kaafila-accent"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Expeditions</span>
          </Link>

          <div className="rounded-3xl border border-kaafila-primary/30 bg-kaafila-surface/95 p-6 shadow-card backdrop-blur-md sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-kaafila-primary/15 px-2.5 py-1 font-mono text-xs font-semibold uppercase text-kaafila-accent">
                {ride.region}
              </span>
              <span className="rounded-md border border-kaafila-border px-2.5 py-1 font-mono text-xs uppercase text-kaafila-text">
                {ride.difficulty}
              </span>
              <span className="rounded-md border border-kaafila-border px-2.5 py-1 font-mono text-xs uppercase text-kaafila-muted">
                Status: {ride.status}
              </span>
            </div>

            <h1 className="mt-3 font-display text-3xl font-bold uppercase text-kaafila-text sm:text-5xl">
              {ride.title}
            </h1>
            {ride.tagline && <p className="mt-2 text-base text-kaafila-muted">{ride.tagline}</p>}

            <div className="mt-6 grid gap-4 border-t border-kaafila-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center gap-2.5 text-sm text-kaafila-text">
                <MapPin className="h-4 w-4 text-kaafila-accent" />
                <span>
                  {ride.startLocation} → {ride.endLocation}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-sm text-kaafila-text">
                <Calendar className="h-4 w-4 text-kaafila-accent" />
                <span>
                  {new Date(ride.startDate).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}{' '}
                  ({ride.durationDays} Days)
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-sm text-kaafila-text">
                <Mountain className="h-4 w-4 text-kaafila-accent" />
                <span>Max Alt: {ride.maxAltitudeMeters?.toLocaleString() || 'N/A'}m</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm text-kaafila-text">
                <Route className="h-4 w-4 text-kaafila-accent" />
                <span>
                  {ride.distanceKm} km · {ride.spotsRemaining}/{ride.maxRiders} spots open
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto mt-10 grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="space-y-8 lg:col-span-8">
          <section className="rounded-2xl border border-kaafila-border bg-kaafila-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-bold uppercase text-kaafila-text">
                Expedition Overview
              </h2>
              <Link
                to={`/maps/expedition/${ride.slug}`}
                className="inline-flex items-center gap-2 rounded-xl border border-kaafila-primary/45 bg-kaafila-primary/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-kaafila-accent hover:bg-kaafila-primary/20 transition"
              >
                <MapPin className="h-4 w-4" />
                View Interactive Map &amp; Checkpoints
              </Link>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-kaafila-muted">
              {ride.description || ride.tagline || 'Detailed route briefing provided by the touring organisation.'}
            </p>
            {ride.facilitiesSummary && (
              <div className="mt-5 rounded-xl border border-kaafila-primary/20 bg-kaafila-bg p-4">
                <span className="font-mono text-[11px] uppercase tracking-wider text-kaafila-accent">
                  Expedition Facilities &amp; Support
                </span>
                <p className="mt-1.5 text-sm text-kaafila-text/90">{ride.facilitiesSummary}</p>
              </div>
            )}
          </section>

          {ride.itinerary?.length > 0 && (
            <section className="rounded-2xl border border-kaafila-border bg-kaafila-surface p-6">
              <h2 className="font-display text-2xl font-bold uppercase text-kaafila-text">
                Day-by-Day Itinerary
              </h2>
              <div className="mt-5 space-y-4">
                {ride.itinerary.map((day, idx) => (
                  <div
                    key={day.day || day.dayNumber || idx}
                    className="rounded-xl border border-kaafila-border bg-kaafila-bg p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold uppercase text-kaafila-accent">
                        Day {day.day || day.dayNumber || idx + 1}: {day.title}
                      </span>
                      {day.altitudeMeters && (
                        <span className="font-mono text-xs text-kaafila-muted">
                          {day.altitudeMeters}m Altitude
                        </span>
                      )}
                    </div>
                    {day.route && <p className="mt-1 font-mono text-[11px] text-kaafila-text/75">{day.route}</p>}
                    <p className="mt-1.5 text-sm text-kaafila-muted">{day.description}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(ride.inclusions?.length > 0 || ride.exclusions?.length > 0) && (
            <section className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-500/20 bg-kaafila-surface p-6">
                <h3 className="font-display text-lg font-bold uppercase text-emerald-700">Inclusions</h3>
                <ul className="mt-3 space-y-2 text-sm text-kaafila-muted">
                  {(ride.inclusions || []).map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-red-500/20 bg-kaafila-surface p-6">
                <h3 className="font-display text-lg font-bold uppercase text-red-700">Exclusions</h3>
                <ul className="mt-3 space-y-2 text-sm text-kaafila-muted">
                  {(ride.exclusions || []).map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-6 lg:col-span-4">
          {/* Pricing & Official Booking Card */}
          <div className="rounded-2xl border border-kaafila-primary/35 bg-kaafila-surface p-6 shadow-card">
            <span className="font-mono text-[11px] uppercase tracking-wider text-kaafila-muted">
              Expedition Tariff
            </span>
            <p className="mt-1 font-mono text-3xl font-bold text-kaafila-accent">
              ₹{Number(ride.priceInr || 0).toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-kaafila-muted">
              {ride.bikeRentalAvailable === false ? 'Bring Your Own Motorcycle' : 'Standard Package (Rental / Tour)'}
            </p>
            {ride.priceOwnBikeInr && (
              <p className="mt-2 font-mono text-xs text-kaafila-text">
                Own Bike Option: ₹{Number(ride.priceOwnBikeInr).toLocaleString('en-IN')}
              </p>
            )}

            <a
              href={bookingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-kaafila-primary px-4 py-3 text-xs font-bold uppercase tracking-wider text-kaafila-dark hover:bg-kaafila-primary-hover transition"
            >
              <span>Book on Official Website</span>
              <ExternalLink className="h-4 w-4" />
            </a>
            <p className="mt-2.5 text-[11px] leading-relaxed text-kaafila-muted">
              External Booking: Final payments and seats are booked directly on the touring organisation&apos;s official website.
            </p>

            {/* KAAFILA Rider Registration / Interest Box */}
            <div className="mt-6 border-t border-kaafila-border pt-5">
              <div className="flex items-center justify-between text-xs text-kaafila-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-kaafila-accent" />
                  KAAFILA Roster
                </span>
                <span className="font-mono text-kaafila-text">
                  {ride.participantStats?.confirmedCount || 0} confirmed · {ride.participantStats?.interestedCount || 0} interested
                </span>
              </div>

              {isAuthenticated && user?.role === 'rider' ? (
                <div className="mt-4 space-y-3">
                  {myStatus && (
                    <div className="rounded-xl border border-kaafila-primary/30 bg-kaafila-bg px-3 py-2 text-xs text-kaafila-text">
                      Your KAAFILA status: <strong className="uppercase text-kaafila-accent">{myStatus}</strong>
                    </div>
                  )}

                  {ride.bikeRentalAvailable !== false && (
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-kaafila-muted">
                        Bike Preference
                      </label>
                      <select
                        value={bikeChoice}
                        onChange={(e) => setBikeChoice(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-3 py-2 text-xs text-kaafila-text outline-none focus:border-kaafila-primary"
                      >
                        <option value="rental">Rental Fleet Bike</option>
                        <option value="own_bike">Own Motorcycle</option>
                      </select>
                    </div>
                  )}

                  <label className="flex items-start gap-2 text-xs text-kaafila-muted">
                    <input
                      type="checkbox"
                      checked={shareContact}
                      onChange={(e) => setShareContact(e.target.checked)}
                      className="mt-0.5 accent-kaafila-primary"
                    />
                    <span>
                      Share my contact details with {org?.name || 'this organisation'} once my participation is confirmed.
                    </span>
                  </label>

                  {myStatus !== 'completed' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleParticipate('interested')}
                        className="flex-1 rounded-xl border border-kaafila-primary/50 bg-kaafila-primary/10 px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-accent hover:bg-kaafila-primary/20 transition disabled:opacity-50"
                      >
                        {myStatus === 'interested' || myStatus === 'confirmed'
                          ? 'Update Preference'
                          : 'Record Interest'}
                      </button>
                      {(myStatus === 'interested' || myStatus === 'confirmed') && (
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleParticipate('cancelled')}
                          className="rounded-xl border border-red-500/35 px-3 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-500/10 transition disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : !isAuthenticated ? (
                <Link
                  to="/login"
                  className="mt-4 block rounded-xl border border-kaafila-primary/35 px-3 py-2.5 text-center text-xs font-semibold text-kaafila-accent hover:bg-kaafila-primary/10 transition"
                >
                  Sign in as Rider to track on My Rides
                </Link>
              ) : (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-kaafila-muted">
                  <ShieldAlert className="h-3.5 w-3.5 text-kaafila-accent" />
                  Roster interest is available to Rider accounts.
                </p>
              )}
            </div>
          </div>

          {/* Organiser Card */}
          {org && (
            <div className="rounded-2xl border border-kaafila-border bg-kaafila-surface p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-kaafila-primary/30 bg-kaafila-bg">
                  {org.logoUrl ? (
                    <img src={org.logoUrl} alt={org.name} className="h-full w-full object-cover" />
                  ) : (
                    <Bike className="h-5 w-5 text-kaafila-accent" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-display text-lg font-bold text-kaafila-text">{org.name}</h3>
                    {org.isVerified && !org.isDemo && (
                      <BadgeCheck className="h-4 w-4 text-kaafila-accent" title="Verified Organisation" />
                    )}
                  </div>
                  <p className="text-xs text-kaafila-muted">
                    {org.location?.city}, {org.location?.region}
                    {org.isDemo ? ' · Demo Organisation' : ''}
                  </p>
                </div>
              </div>
              <Link
                to={`/organisations/${org.slug}`}
                className="mt-4 block rounded-xl border border-kaafila-border px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-kaafila-text hover:border-kaafila-primary hover:text-kaafila-accent transition"
              >
                View Organisation Profile
              </Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

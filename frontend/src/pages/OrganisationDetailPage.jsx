import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  MapPin,
  BadgeCheck,
  Clock,
  ExternalLink,
  Globe,
  Star,
  BedDouble,
  Utensils,
  Bike,
  HeartPulse,
  CheckCircle2,
  Mountain,
  Calendar,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { safeExternalUrl } from '../utils/safeUrl';

export default function OrganisationDetailPage() {
  const { slug } = useParams();
  const { user, isAuthenticated } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openItineraryId, setOpenItineraryId] = useState(null);

  // Review state
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: '', comment: '' });
  const [reviewMsg, setReviewMsg] = useState('');
  const [reviewErr, setReviewErr] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadDetail() {
      setLoading(true);
      setError('');
      try {
        const res = await api.get(`/organisations/${slug}`);
        if (!active) return;
        setData(res.data?.data);
        if (res.data?.data?.expeditions?.length > 0) {
          setOpenItineraryId(res.data.data.expeditions[0]._id);
        }
      } catch (err) {
        if (active) setError(err.response?.data?.message || 'Organisation not found.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadDetail();
    return () => {
      active = false;
    };
  }, [slug]);

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!data?.organisation?._id) return;
    setSubmittingReview(true);
    setReviewMsg('');
    setReviewErr('');
    try {
      const res = await api.post(`/organisations/${data.organisation._id}/reviews`, reviewForm);
      setData((prev) => ({
        ...prev,
        organisation: {
          ...prev.organisation,
          ratingAverage: res.data.data.ratingAverage,
          reviewCount: res.data.data.reviewCount,
        },
        reviews: [res.data.data.review, ...prev.reviews],
      }));
      setReviewForm({ rating: 5, title: '', comment: '' });
      setReviewMsg('Your review has been published.');
    } catch (err) {
      setReviewErr(err.response?.data?.message || 'Could not submit review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="h-72 animate-pulse rounded-3xl bg-kaafila-surface" />
      </div>
    );
  }

  if (error || !data?.organisation) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="font-display text-3xl text-kaafila-text">Organisation Not Found</h1>
        <p className="mt-2 text-sm text-kaafila-muted">{error}</p>
        <Link
          to="/organisations"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-kaafila-primary px-5 py-2.5 text-xs font-bold uppercase text-kaafila-dark"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Marketplace
        </Link>
      </div>
    );
  }

  const { organisation: org, expeditions = [], reviews = [] } = data;
  const hasGenuineRating = reviews.length > 0 && typeof org.ratingAverage === 'number';
  const med = org.facilities?.medicalAndEmergency || {};

  return (
    <div className="pb-20">
      {/* Cover Hero */}
      <section className="relative border-b border-kaafila-primary/25 bg-kaafila-surface">
        <div className="relative h-64 overflow-hidden sm:h-80">
          <img
            src={org.coverImageUrl || '/images/hero-himalaya.png'}
            alt={org.name}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-kaafila-bg via-kaafila-bg/65 to-transparent" />
        </div>

        <div className="relative mx-auto -mt-20 max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <Link
            to="/organisations"
            className="mb-5 inline-flex items-center gap-1.5 rounded-lg border border-kaafila-border bg-kaafila-bg/80 px-3 py-1.5 text-xs text-kaafila-text backdrop-blur-sm hover:border-kaafila-primary hover:text-kaafila-accent"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Organisations</span>
          </Link>

          <div className="flex flex-col justify-between gap-6 rounded-2xl border border-kaafila-primary/30 bg-kaafila-surface/95 p-6 shadow-card backdrop-blur-md lg:flex-row lg:items-center">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-kaafila-primary bg-kaafila-bg">
                {org.logoUrl ? (
                  <img src={org.logoUrl} alt={`${org.name} logo`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-display text-2xl font-bold text-kaafila-accent">
                    {org.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {org.isDemo ? (
                    <span className="rounded-full border border-kaafila-secondary bg-kaafila-secondary/80 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase text-kaafila-text">
                      Demo Data Listing
                    </span>
                  ) : org.isVerified ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-kaafila-primary/50 bg-kaafila-primary/10 px-2.5 py-0.5 text-xs font-semibold text-kaafila-accent">
                      <BadgeCheck className="h-3.5 w-3.5" /> Verified Organisation
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-kaafila-border bg-kaafila-elevated px-2.5 py-0.5 text-xs text-kaafila-muted">
                      <Clock className="h-3.5 w-3.5" /> Pending Verification
                    </span>
                  )}
                </div>

                <h1 className="mt-2 font-display text-3xl font-bold uppercase text-kaafila-text sm:text-4xl">
                  {org.name}
                </h1>

                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-kaafila-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-kaafila-accent" />
                    {org.location?.city}, {org.location?.state} ({org.location?.region})
                  </span>
                  {org.foundedYear && <span className="font-mono">Est. {org.foundedYear}</span>}
                  {hasGenuineRating ? (
                    <span className="inline-flex items-center gap-1 font-bold text-kaafila-accent">
                      <Star className="h-4 w-4 fill-kaafila-primary" />
                      {org.ratingAverage.toFixed(1)} ({reviews.length}{' '}
                      {reviews.length === 1 ? 'review' : 'reviews'})
                    </span>
                  ) : (
                    <span>No genuine reviews yet</span>
                  )}
                </div>
              </div>
            </div>

            {/* External Official Website & Booking CTA */}
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <a
                href={safeExternalUrl(org.bookingUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-kaafila-primary px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-kaafila-dark shadow-blue transition hover:bg-kaafila-primary-hover"
              >
                <span>Complete Booking on Official Site</span>
                <ExternalLink className="h-4 w-4" />
              </a>
              {org.officialWebsite && (
                <a
                  href={safeExternalUrl(org.officialWebsite)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-kaafila-primary/35 px-5 py-2.5 text-xs font-semibold text-kaafila-text hover:border-kaafila-primary hover:text-kaafila-accent transition"
                >
                  <Globe className="h-4 w-4 text-kaafila-accent" />
                  <span>Official Website</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto mt-10 max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
        {/* About Organisation */}
        <section className="rounded-2xl border border-kaafila-border bg-kaafila-surface p-6 sm:p-8">
          <h2 className="font-display text-2xl font-bold uppercase text-kaafila-accent">About Organisation</h2>
          <p className="mt-3 text-base leading-relaxed text-kaafila-text/90">
            {org.about || org.shortDescription}
          </p>
          {org.operatingRegions?.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs uppercase text-kaafila-muted">Operating Corridors:</span>
              {org.operatingRegions.map((reg) => (
                <span
                  key={reg}
                  className="rounded-lg border border-kaafila-primary/30 bg-kaafila-bg px-3 py-1 text-xs font-medium text-kaafila-text"
                >
                  {reg}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Facilities & Medical Support Matrix */}
        <section>
          <h2 className="font-display text-2xl font-bold uppercase text-kaafila-text">
            Expedition Facilities &amp; Emergency Support
          </h2>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {/* Accommodation */}
            <div className="rounded-2xl border border-kaafila-primary/20 bg-kaafila-surface p-6">
              <div className="flex items-center gap-3">
                <BedDouble className="h-6 w-6 text-kaafila-accent" />
                <h3 className="font-display text-xl uppercase text-kaafila-text">Accommodation Facilities</h3>
              </div>
              <p className="mt-3 text-sm text-kaafila-muted">
                {org.facilities?.accommodation?.summary || 'Details provided during expedition briefing.'}
              </p>
              {org.facilities?.accommodation?.types?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {org.facilities.accommodation.types.map((t) => (
                    <span key={t} className="rounded bg-kaafila-bg px-2.5 py-1 text-xs text-kaafila-text">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Food */}
            <div className="rounded-2xl border border-kaafila-primary/20 bg-kaafila-surface p-6">
              <div className="flex items-center gap-3">
                <Utensils className="h-6 w-6 text-kaafila-accent" />
                <h3 className="font-display text-xl uppercase text-kaafila-text">Food &amp; Hydration</h3>
              </div>
              <p className="mt-3 text-sm text-kaafila-muted">
                {org.facilities?.food?.summary || 'High-altitude expedition meals arranged.'}
              </p>
              {org.facilities?.food?.dietaryOptions?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {org.facilities.food.dietaryOptions.map((d) => (
                    <span key={d} className="rounded bg-kaafila-bg px-2.5 py-1 text-xs text-kaafila-text">
                      {d}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Bike Rental */}
            <div className="rounded-2xl border border-kaafila-primary/20 bg-kaafila-surface p-6">
              <div className="flex items-center gap-3">
                <Bike className="h-6 w-6 text-kaafila-accent" />
                <h3 className="font-display text-xl uppercase text-kaafila-text">Bike Rental Fleet</h3>
              </div>
              <p className="mt-3 text-sm text-kaafila-muted">
                {org.facilities?.bikeRental?.summary || 'Bring your own motorcycle or rent from operator fleet.'}
              </p>
              {org.facilities?.bikeRental?.fleetModels?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {org.facilities.bikeRental.fleetModels.map((model) => (
                    <span
                      key={model}
                      className="rounded border border-kaafila-primary/25 bg-kaafila-bg px-2.5 py-1 text-xs text-kaafila-accent"
                    >
                      {model}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Medical & Emergency */}
            <div className="rounded-2xl border border-kaafila-primary/35 bg-kaafila-surface p-6">
              <div className="flex items-center gap-3">
                <HeartPulse className="h-6 w-6 text-kaafila-accent" />
                <h3 className="font-display text-xl uppercase text-kaafila-text">Medical &amp; Emergency Support</h3>
              </div>
              <p className="mt-3 text-sm text-kaafila-muted">
                {med.summary || 'Emergency protocol verified directly with operator.'}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                {[
                  { label: 'Medical Oxygen', active: med.oxygenSupport },
                  { label: '4x4 Sweep Vehicle', active: med.backupVehicle },
                  { label: 'Certified Mechanic', active: med.certifiedMechanic },
                  { label: 'Satellite Comms', active: med.satelliteComm },
                ].map((flag) => (
                  <div
                    key={flag.label}
                    className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 ${
                      flag.active ? 'bg-emerald-500/10 text-emerald-700' : 'bg-kaafila-bg text-kaafila-muted/60'
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{flag.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Upcoming Expeditions, Pricing & Itineraries */}
        <section>
          <h2 className="font-display text-2xl font-bold uppercase text-kaafila-text">
            Upcoming Expeditions, Pricing &amp; Itineraries
          </h2>

          {expeditions.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-kaafila-border bg-kaafila-surface p-8 text-center text-sm text-kaafila-muted">
              No upcoming departures listed yet. Check the organisation&apos;s official website for custom dates.
            </div>
          ) : (
            <div className="mt-5 space-y-6">
              {expeditions.map((ride) => {
                const isExpanded = openItineraryId === ride._id;
                return (
                  <div
                    key={ride._id}
                    className="overflow-hidden rounded-2xl border border-kaafila-primary/25 bg-kaafila-surface"
                  >
                    <div className="grid gap-6 p-6 lg:grid-cols-12">
                      <div className="lg:col-span-4">
                        <img
                          src={ride.coverImageUrl || '/images/expedition-ladakh.png'}
                          alt={ride.title}
                          className="h-52 w-full rounded-xl object-cover"
                        />
                      </div>

                      <div className="flex flex-col justify-between lg:col-span-5">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase text-kaafila-accent">
                            <span>{ride.region}</span>
                            <span>·</span>
                            <span>{ride.difficulty}</span>
                            <span>·</span>
                            <span>{ride.spotsRemaining} spots left</span>
                          </div>
                          <h3 className="mt-1.5 font-display text-2xl font-bold text-kaafila-text">{ride.title}</h3>
                          <p className="mt-2 text-sm text-kaafila-muted">{ride.tagline}</p>

                          <div className="mt-4 flex flex-wrap gap-4 font-mono text-xs text-kaafila-text/90">
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-kaafila-accent" />
                              Start: {ride.startLocation} → {ride.endLocation}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-kaafila-accent" />
                              {new Date(ride.startDate).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}{' '}
                              · {ride.durationDays} Days
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <Mountain className="h-3.5 w-3.5 text-kaafila-accent" />
                              Max {ride.maxAltitudeMeters?.toLocaleString()}m · {ride.distanceKm} km
                            </span>
                          </div>
                        </div>

                        {ride.itinerary?.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setOpenItineraryId(isExpanded ? null : ride._id)}
                            className="mt-4 inline-flex items-center gap-1.5 self-start text-xs font-bold uppercase tracking-wider text-kaafila-accent hover:underline"
                          >
                            <span>{isExpanded ? 'Hide Day-by-Day Itinerary' : 'View Day-by-Day Itinerary'}</span>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        )}
                      </div>

                      {/* Pricing Box */}
                      <div className="flex flex-col justify-between rounded-xl border border-kaafila-border bg-kaafila-bg p-5 lg:col-span-3">
                        <div>
                          <span className="font-mono text-[10px] uppercase tracking-wider text-kaafila-muted">
                            With Rental Bike
                          </span>
                          <p className="font-mono text-2xl font-bold text-kaafila-accent">
                            ₹{Number(ride.priceInr).toLocaleString('en-IN')}
                          </p>
                          {ride.priceOwnBikeInr && (
                            <p className="mt-1 font-mono text-xs text-kaafila-muted">
                              Own Bike: ₹{Number(ride.priceOwnBikeInr).toLocaleString('en-IN')}
                            </p>
                          )}
                        </div>

                        <div className="mt-5 flex flex-col gap-2">
                          <a
                            href={safeExternalUrl(ride.bookingUrl || org.bookingUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-kaafila-primary px-4 py-3 text-xs font-bold uppercase tracking-wider text-kaafila-dark hover:bg-kaafila-primary-hover transition"
                          >
                            <span>Book on Official Site</span>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                          {ride.slug && (
                            <Link
                              to={`/rides/${ride.slug}`}
                              className="inline-flex items-center justify-center rounded-xl border border-kaafila-primary/35 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-kaafila-accent hover:bg-kaafila-primary/10 transition"
                            >
                              Full Expedition &amp; Roster
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Itinerary */}
                    {isExpanded && ride.itinerary?.length > 0 && (
                      <div className="border-t border-kaafila-border bg-kaafila-bg/70 p-6">
                        <h4 className="font-display text-lg uppercase text-kaafila-accent">Expedition Itinerary</h4>
                        <div className="mt-4 space-y-3">
                          {ride.itinerary.map((day) => (
                            <div
                              key={day.day}
                              className="flex flex-col gap-2 rounded-xl border border-kaafila-border bg-kaafila-surface p-4 sm:flex-row sm:items-start sm:justify-between"
                            >
                              <div>
                                <span className="font-mono text-xs font-bold text-kaafila-accent">
                                  DAY 0{day.day} · {day.route}
                                </span>
                                <h5 className="mt-0.5 font-semibold text-kaafila-text">{day.title}</h5>
                                <p className="mt-1 text-xs leading-relaxed text-kaafila-muted">{day.description}</p>
                              </div>
                              <div className="shrink-0 font-mono text-[11px] text-kaafila-muted sm:text-right">
                                {day.altitudeMeters ? <div>Alt: {day.altitudeMeters}m</div> : null}
                                {day.distanceKm ? <div>Dist: {day.distanceKm} km</div> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Reviews Section */}
        <section className="rounded-2xl border border-kaafila-border bg-kaafila-surface p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold uppercase text-kaafila-text">Rider Reviews</h2>
              <p className="mt-1 text-xs text-kaafila-muted">
                Ratings are computed strictly from submitted reviews—never fabricated.
              </p>
            </div>
            {hasGenuineRating && (
              <div className="flex items-center gap-2 rounded-xl border border-kaafila-primary/40 bg-kaafila-primary/10 px-4 py-2 text-kaafila-accent">
                <Star className="h-5 w-5 fill-kaafila-primary" />
                <span className="font-mono text-lg font-bold">{org.ratingAverage.toFixed(1)} / 5</span>
              </div>
            )}
          </div>

          {reviews.length === 0 ? (
            <p className="mt-6 rounded-xl border border-kaafila-border bg-kaafila-bg p-5 text-sm text-kaafila-muted">
              No reviews yet for this organisation. Be the first verified rider to share feedback.
            </p>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {reviews.map((rev) => (
                <div key={rev._id} className="rounded-xl border border-kaafila-border bg-kaafila-bg p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-kaafila-text">{rev.author?.fullName || 'KAAFILA Rider'}</span>
                    <div className="flex items-center gap-1 text-kaafila-accent">
                      <Star className="h-3.5 w-3.5 fill-kaafila-primary" />
                      <span className="font-mono text-xs font-bold">{rev.rating}</span>
                    </div>
                  </div>
                  <h4 className="mt-2 text-sm font-bold text-kaafila-accent">{rev.title}</h4>
                  <p className="mt-1 text-xs leading-relaxed text-kaafila-muted">{rev.comment}</p>
                  {rev.isDemo && (
                    <span className="mt-3 inline-block font-mono text-[10px] uppercase text-kaafila-muted">
                      Sample Demo Review
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Review Form for Logged-In Riders */}
          <div className="mt-8 border-t border-kaafila-border pt-6">
            {isAuthenticated && user?.role === 'rider' ? (
              <form onSubmit={handleReviewSubmit} className="space-y-4">
                <h3 className="font-display text-lg uppercase text-kaafila-accent">Write a Review</h3>
                {reviewMsg && (
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-700">
                    {reviewMsg}
                  </div>
                )}
                {reviewErr && (
                  <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700">
                    {reviewErr}
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-4">
                  <div>
                    <label className="block text-xs font-medium text-kaafila-muted">Rating</label>
                    <select
                      value={reviewForm.rating}
                      onChange={(e) => setReviewForm({ ...reviewForm, rating: Number(e.target.value) })}
                      className="mt-1 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-3 py-2.5 text-sm text-kaafila-text"
                    >
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={n}>
                          {n} Stars
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-medium text-kaafila-muted">Title</label>
                    <input
                      type="text"
                      required
                      value={reviewForm.title}
                      onChange={(e) => setReviewForm({ ...reviewForm, title: e.target.value })}
                      placeholder="Summary of your expedition experience"
                      className="mt-1 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-3 py-2.5 text-sm text-kaafila-text"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-kaafila-muted">Comment</label>
                  <textarea
                    rows={3}
                    required
                    value={reviewForm.comment}
                    onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                    placeholder="Share details on bike condition, marshals, stays, and safety backup..."
                    className="mt-1 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-3 py-2.5 text-sm text-kaafila-text"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="rounded-xl bg-kaafila-primary px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-dark hover:bg-kaafila-primary-hover disabled:opacity-50"
                >
                  {submittingReview ? 'Submitting...' : 'Publish Review'}
                </button>
              </form>
            ) : (
              <p className="text-xs text-kaafila-muted">
                <Link to="/login" className="font-semibold text-kaafila-accent hover:underline">
                  Sign in as a Rider
                </Link>{' '}
                to submit a genuine review.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}


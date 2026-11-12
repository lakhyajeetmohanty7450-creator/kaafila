import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Compass,
  Flag,
  Fuel,
  MapPin,
  Mountain,
  Navigation,
  Route as RouteIcon,
  ShieldCheck,
  Utensils,
  CheckCircle2,
  Clock,
  ExternalLink,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import KaafilaMap from '../components/KaafilaMap';

const CHECKPOINT_LABELS = {
  start: 'Start Point',
  checkpoint: 'Checkpoint',
  rest_stop: 'Rest Stop',
  fuel_stop: 'Fuel Stop',
  important: 'Key Landmark',
  destination: 'Destination',
};

function CheckpointIcon({ type }) {
  if (type === 'fuel_stop') return <Fuel className="h-4 w-4 text-orange-400" />;
  if (type === 'rest_stop') return <Utensils className="h-4 w-4 text-sky-400" />;
  if (type === 'destination') return <Flag className="h-4 w-4 text-red-400" />;
  if (type === 'start') return <Navigation className="h-4 w-4 text-emerald-400" />;
  return <MapPin className="h-4 w-4 text-kaafila-yellow" />;
}

export default function MapsPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  const [overview, setOverview] = useState([]);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState(slug || '');

  const [routeData, setRouteData] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(null);

  useEffect(() => {
    if (slug) setSelectedSlug(slug);
  }, [slug]);

  useEffect(() => {
    let active = true;
    const loadOverview = async () => {
      setLoadingOverview(true);
      try {
        const { data } = await api.get('/maps/overview');
        const list = data?.data || [];
        if (!active) return;
        setOverview(list);
        if (!slug && list.length > 0) {
          const withRoute = list.find((r) => r.hasRouteData) || list[0];
          setSelectedSlug(withRoute.slug);
        }
      } catch {
        if (active) setOverview([]);
      } finally {
        if (active) setLoadingOverview(false);
      }
    };
    loadOverview();
    return () => {
      active = false;
    };
  }, [slug]);

  const loadExpeditionRoute = useCallback(async (targetSlug) => {
    if (!targetSlug) return;
    setLoadingRoute(true);
    setRouteError('');
    setSelectedCheckpoint(null);
    try {
      const { data } = await api.get(`/maps/expeditions/${targetSlug}`);
      setRouteData(data?.data || null);
    } catch (err) {
      setRouteError(err.response?.data?.message || 'Unable to load expedition map route.');
      setRouteData(null);
    } finally {
      setLoadingRoute(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSlug) {
      loadExpeditionRoute(selectedSlug);
    }
  }, [selectedSlug, loadExpeditionRoute]);

  const handleSelectRide = (rideSlug) => {
    setSelectedSlug(rideSlug);
    navigate(`/maps/expedition/${rideSlug}`);
  };

  const arrivedIds = useMemo(
    () => new Set((routeData?.myArrivals || []).map((a) => String(a.checkpoint))),
    [routeData]
  );

  const ride = routeData?.ride;
  const route = routeData?.route;
  const checkpoints = routeData?.checkpoints || [];

  const displayDistanceKm =
    route?.calculatedDistanceKm > 0
      ? route.calculatedDistanceKm
      : ride?.distanceKm || 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] text-kaafila-yellow">
            <Compass className="h-4 w-4" />
            KAAFILA Route Atlas
          </span>
          <h1 className="mt-1.5 font-display text-3xl font-bold uppercase text-kaafila-text sm:text-4xl">
            Interactive Expedition Maps
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-kaafila-muted">
            Inspect verified expedition corridors, mountain passes, fuel stops, and checkpoint altitudes before you ride.
          </p>
        </div>

        {isAuthenticated && user?.role === 'rider' && (
          <Link
            to="/dashboard/rider/tracking"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-kaafila-yellow px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-bg shadow-amber hover:bg-kaafila-yellowHover transition"
          >
            <Navigation className="h-4 w-4" />
            Open GPS Ride Tracker
          </Link>
        )}
      </div>

      {/* Expedition Quick Selector */}
      <div className="mt-6">
        <label htmlFor="map-expedition-select" className="block font-mono text-[11px] uppercase tracking-wider text-kaafila-muted">
          Select Expedition Corridor
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            id="map-expedition-select"
            value={selectedSlug}
            onChange={(e) => handleSelectRide(e.target.value)}
            disabled={loadingOverview}
            className="w-full rounded-xl border border-kaafila-yellow/30 bg-kaafila-surface px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-yellow sm:max-w-md"
          >
            {overview.map((item) => (
              <option key={item._id} value={item.slug}>
                {item.title} ({item.region}) {item.hasRouteData ? '— Route Mapped' : '— No Route Data Yet'}
              </option>
            ))}
          </select>

          {ride && (
            <Link
              to={`/rides/${ride.slug}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-kaafila-surface px-4 py-2.5 text-xs font-semibold text-kaafila-text hover:border-kaafila-yellow hover:text-kaafila-yellow transition"
            >
              <span>View Expedition Page</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <KaafilaMap
            route={route}
            checkpoints={checkpoints}
            arrivedCheckpointIds={arrivedIds}
            onMarkerSelect={(cp) => setSelectedCheckpoint(cp)}
            loading={loadingRoute}
            error={routeError}
            emptyTitle="No Route Data Published Yet"
            emptyDescription="This expedition has not published GPS route geometry or waypoints yet. Contact or check the organisation page for itinerary updates."
            heightClass="h-[380px] sm:h-[490px]"
          />

          {/* Selected Marker Card */}
          {selectedCheckpoint && (
            <div className="rounded-2xl border border-kaafila-yellow/35 bg-kaafila-surface p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-kaafila-yellow/30 bg-kaafila-bg">
                    <CheckpointIcon type={selectedCheckpoint.type} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-kaafila-yellow">
                        #{selectedCheckpoint.sequenceNumber}
                      </span>
                      <h3 className="font-display text-lg font-bold uppercase text-kaafila-text">
                        {selectedCheckpoint.name}
                      </h3>
                      <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase text-kaafila-muted">
                        {CHECKPOINT_LABELS[selectedCheckpoint.type] || 'Checkpoint'}
                      </span>
                    </div>
                    {selectedCheckpoint.description && (
                      <p className="mt-1 text-xs text-kaafila-muted">{selectedCheckpoint.description}</p>
                    )}
                    <p className="mt-1.5 font-mono text-[11px] text-kaafila-text/80">
                      Coords: {selectedCheckpoint.coordinates?.[1]?.toFixed(4)}, {selectedCheckpoint.coordinates?.[0]?.toFixed(4)}
                      {selectedCheckpoint.altitudeMeters ? ` · Altitude: ${selectedCheckpoint.altitudeMeters}m` : ''}
                      {selectedCheckpoint.radiusMeters ? ` · Check-in Radius: ${selectedCheckpoint.radiusMeters}m` : ''}
                    </p>
                  </div>
                </div>
                {arrivedIds.has(String(selectedCheckpoint._id)) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 font-mono text-[11px] font-semibold text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Verified Arrival
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Route Summary & Checkpoints Sidebar */}
        <aside className="space-y-4 lg:col-span-4">
          {ride && (
            <div className="rounded-2xl border border-kaafila-yellow/25 bg-kaafila-surface p-5 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-kaafila-yellow">
                  {ride.region}
                </span>
                {ride.isDemo && (
                  <span className="rounded bg-kaafila-earth/70 px-2 py-0.5 font-mono text-[10px] uppercase text-kaafila-text">
                    Demo Route
                  </span>
                )}
              </div>
              <h2 className="mt-1 font-display text-2xl font-bold uppercase text-kaafila-text">
                {ride.title}
              </h2>
              <p className="mt-1 text-xs text-kaafila-muted">
                {ride.organisation?.name}
                {ride.organisation?.isVerified && (
                  <ShieldCheck className="ml-1 inline h-3.5 w-3.5 text-emerald-400" />
                )}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-white/10 bg-kaafila-bg p-3">
                  <span className="block text-[10px] uppercase text-kaafila-muted">Route Distance</span>
                  <span className="mt-0.5 inline-flex items-center gap-1 font-mono text-sm font-bold text-kaafila-yellow">
                    <RouteIcon className="h-3.5 w-3.5" />
                    {route?.hasRouteData ? `${displayDistanceKm} km` : 'No route data'}
                  </span>
                </div>
                <div className="rounded-xl border border-white/10 bg-kaafila-bg p-3">
                  <span className="block text-[10px] uppercase text-kaafila-muted">Max Altitude</span>
                  <span className="mt-0.5 inline-flex items-center gap-1 font-mono text-sm font-bold text-kaafila-text">
                    <Mountain className="h-3.5 w-3.5 text-kaafila-yellow" />
                    {ride.maxAltitudeMeters ? `${ride.maxAltitudeMeters}m` : 'N/A'}
                  </span>
                </div>
              </div>

              {route?.routeDescription && (
                <p className="mt-3 text-xs leading-relaxed text-kaafila-muted">
                  {route.routeDescription}
                </p>
              )}
            </div>
          )}

          {/* Waypoints / Checkpoints Sequence */}
          <div className="rounded-2xl border border-white/10 bg-kaafila-surface p-5 shadow-card">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold uppercase text-kaafila-text">
                Checkpoints & Stops
              </h3>
              <span className="font-mono text-xs text-kaafila-yellow">{checkpoints.length} stops</span>
            </div>

            {checkpoints.length === 0 ? (
              <p className="mt-3 text-xs text-kaafila-muted">
                No checkpoints configured for this expedition yet.
              </p>
            ) : (
              <div className="mt-3 max-h-[340px] space-y-2.5 overflow-y-auto pr-1">
                {checkpoints.map((cp) => {
                  const isVerified = arrivedIds.has(String(cp._id));
                  const isSelected = selectedCheckpoint?._id === cp._id;
                  return (
                    <button
                      key={cp._id}
                      type="button"
                      onClick={() => setSelectedCheckpoint(cp)}
                      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                        isSelected
                          ? 'border-kaafila-yellow bg-kaafila-yellow/10'
                          : 'border-white/10 bg-kaafila-bg hover:border-kaafila-yellow/40'
                      }`}
                    >
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-kaafila-surface font-mono text-[11px] font-bold text-kaafila-yellow">
                        {cp.sequenceNumber}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-bold text-kaafila-text">{cp.name}</p>
                          {isVerified ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          ) : (
                            <Clock className="h-3.5 w-3.5 shrink-0 text-kaafila-muted/60" />
                          )}
                        </div>
                        <p className="text-[11px] text-kaafila-muted">
                          {CHECKPOINT_LABELS[cp.type] || 'Checkpoint'}
                          {cp.altitudeMeters ? ` · ${cp.altitudeMeters}m` : ''}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}


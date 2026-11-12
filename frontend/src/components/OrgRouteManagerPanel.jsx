import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Compass,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  Radio,
  Route as RouteIcon,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import KaafilaMap from './KaafilaMap';

function LocationSearchInput({ placeholder = 'Search location in India...', onSelect }) {
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleChange = (val) => {
    setQueryText(val);
    clearTimeout(timerRef.current);
    const trimmed = val.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get('/maps/geocode', { params: { text: trimmed } });
        setResults(data?.data?.results || []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 320);
  };

  const handlePick = (item) => {
    setQueryText(item.name || item.formatted);
    setOpen(false);
    setResults([]);
    onSelect(item);
  };

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-kaafila-muted" />
        <input
          type="text"
          value={queryText}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-white/15 bg-kaafila-bg py-2 pl-8 pr-8 text-xs text-kaafila-text outline-none focus:border-kaafila-yellow"
        />
        {searching && <Loader2 className="absolute right-3 h-3.5 w-3.5 animate-spin text-kaafila-yellow" />}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-40 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-kaafila-yellow/35 bg-kaafila-surface p-1 shadow-card">
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => handlePick(item)}
                className="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-kaafila-yellow/15"
              >
                <p className="font-semibold text-kaafila-text">{item.name}</p>
                <p className="truncate text-[10px] text-kaafila-muted">{item.formatted}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CHECKPOINT_TYPES = [
  { value: 'start', label: 'Start Point' },
  { value: 'checkpoint', label: 'Checkpoint' },
  { value: 'rest_stop', label: 'Rest Stop' },
  { value: 'fuel_stop', label: 'Fuel Stop' },
  { value: 'important', label: 'Important Landmark' },
  { value: 'destination', label: 'Destination' },
];

export default function OrgRouteManagerPanel({ expeditions = [] }) {
  const { showToast } = useToast();

  const [selectedRideId, setSelectedRideId] = useState(expeditions[0]?._id || '');
  const [loading, setLoading] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [savingCp, setSavingCp] = useState(false);

  const [routeState, setRouteState] = useState({
    startLabel: '',
    startLat: '',
    startLng: '',
    endLabel: '',
    endLat: '',
    endLng: '',
    routeDescription: '',
    geometryCoords: [],
    calculatedDistanceKm: 0,
    estimatedDurationText: '',
    previewPendingSave: false,
  });

  const [checkpoints, setCheckpoints] = useState([]);
  const [trackingOverview, setTrackingOverview] = useState(null);

  const [cpForm, setCpForm] = useState({
    name: '',
    description: '',
    type: 'checkpoint',
    lat: '',
    lng: '',
    altitudeMeters: '',
    radiusMeters: 300,
  });

  useEffect(() => {
    if (!selectedRideId && expeditions.length > 0) {
      setSelectedRideId(expeditions[0]._id);
    }
  }, [expeditions, selectedRideId]);

  const loadRideRoute = useCallback(async (rideId) => {
    if (!rideId) return;
    setLoading(true);
    try {
      const [routeRes, trackRes] = await Promise.all([
        api.get(`/rides/${rideId}/route`),
        api.get(`/rides/${rideId}/tracking-overview`).catch(() => ({ data: { data: null } })),
      ]);

      const { ride, route, checkpoints: cps } = routeRes.data?.data || {};
      setRouteState({
        startLabel: route?.startPoint?.label || ride?.startLocation || '',
        startLat: route?.startPoint?.coordinates?.[1] ?? '',
        startLng: route?.startPoint?.coordinates?.[0] ?? '',
        endLabel: route?.endPoint?.label || ride?.endLocation || '',
        endLat: route?.endPoint?.coordinates?.[1] ?? '',
        endLng: route?.endPoint?.coordinates?.[0] ?? '',
        routeDescription: route?.routeDescription || '',
        geometryCoords: route?.geometry?.coordinates || [],
        calculatedDistanceKm: route?.calculatedDistanceKm || 0,
        estimatedDurationText: '',
        previewPendingSave: false,
      });
      setCheckpoints(cps || []);
      setTrackingOverview(trackRes.data?.data || null);
    } catch {
      showToast('Unable to load expedition route configuration.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (selectedRideId) loadRideRoute(selectedRideId);
  }, [selectedRideId, loadRideRoute]);

  const handleMapClick = ({ lat, lng }) => {
    setCpForm((prev) => ({
      ...prev,
      lat: String(lat),
      lng: String(lng),
    }));
    showToast(`Selected coordinates: ${lat}, ${lng}`, 'info');
  };

  const handleSaveRoute = async (e) => {
    e.preventDefault();
    if (!selectedRideId) return;
    setSavingRoute(true);
    try {
      const payload = {
        routeDescription: routeState.routeDescription,
        geometryCoordinates: routeState.geometryCoords,
      };
      if (routeState.startLat !== '' && routeState.startLng !== '') {
        payload.startPoint = {
          label: routeState.startLabel || 'Start Point',
          coordinates: [Number(routeState.startLng), Number(routeState.startLat)],
        };
      }
      if (routeState.endLat !== '' && routeState.endLng !== '') {
        payload.endPoint = {
          label: routeState.endLabel || 'Destination',
          coordinates: [Number(routeState.endLng), Number(routeState.endLat)],
        };
      }

      await api.put(`/rides/${selectedRideId}/route`, payload);
      showToast('Expedition route saved successfully.', 'success');
      await loadRideRoute(selectedRideId);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to save expedition route.', 'error');
    } finally {
      setSavingRoute(false);
    }
  };

  const handleBuildGeometryFromCheckpoints = () => {
    if (checkpoints.length < 2) {
      showToast('Add at least 2 checkpoints to auto-build route LineString.', 'error');
      return;
    }
    const coords = checkpoints.map((c) => c.coordinates);
    setRouteState((prev) => ({
      ...prev,
      geometryCoords: coords,
      estimatedDurationText: '',
      previewPendingSave: true,
    }));
    showToast('Built LineString from checkpoints. Click "Save Route Geometry" to persist.', 'info');
  };

  const handleCalculateMotorcycleRoute = async () => {
    const waypoints = [];
    const pushWaypoint = (latVal, lngVal, label) => {
      const lat = Number(latVal);
      const lng = Number(lngVal);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const prev = waypoints[waypoints.length - 1];
      if (prev && Math.abs(prev.lat - lat) < 0.0001 && Math.abs(prev.lng - lng) < 0.0001) return;
      waypoints.push({ lat, lng, label });
    };

    if (routeState.startLat !== '' && routeState.startLng !== '') {
      pushWaypoint(routeState.startLat, routeState.startLng, routeState.startLabel || 'Start');
    }
    checkpoints.forEach((cp) => {
      if (Array.isArray(cp.coordinates) && cp.coordinates.length >= 2) {
        pushWaypoint(cp.coordinates[1], cp.coordinates[0], cp.name);
      }
    });
    if (routeState.endLat !== '' && routeState.endLng !== '') {
      pushWaypoint(routeState.endLat, routeState.endLng, routeState.endLabel || 'Destination');
    }

    if (waypoints.length < 2) {
      showToast('Set at least 2 points (start, checkpoints, or destination) to calculate a motorcycle route.', 'error');
      return;
    }

    setCalculatingRoute(true);
    try {
      const { data } = await api.post('/maps/route', { waypoints });
      const routeResult = data?.data;
      const coords = routeResult?.geometry?.coordinates || [];
      if (coords.length < 2) {
        showToast('No road geometry returned for those waypoints.', 'error');
        return;
      }
      setRouteState((prev) => ({
        ...prev,
        geometryCoords: coords,
        calculatedDistanceKm: routeResult.distanceKm || prev.calculatedDistanceKm,
        estimatedDurationText: routeResult.durationText || '',
        previewPendingSave: true,
      }));
      showToast(
        `Motorcycle route ready (${routeResult.distanceKm} km${routeResult.durationText ? `, ~${routeResult.durationText}` : ''}). Review map & click "Save Route Geometry" to persist.`,
        'success'
      );
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to calculate motorcycle route.', 'error');
    } finally {
      setCalculatingRoute(false);
    }
  };

  const handleAddCheckpoint = async (e) => {
    e.preventDefault();
    if (!selectedRideId) return;
    setSavingCp(true);
    try {
      await api.post(`/rides/${selectedRideId}/checkpoints`, {
        name: cpForm.name.trim(),
        description: cpForm.description.trim(),
        type: cpForm.type,
        lat: Number(cpForm.lat),
        lng: Number(cpForm.lng),
        altitudeMeters: cpForm.altitudeMeters !== '' ? Number(cpForm.altitudeMeters) : undefined,
        radiusMeters: Number(cpForm.radiusMeters) || 300,
      });
      showToast('Checkpoint added.', 'success');
      setCpForm({
        name: '',
        description: '',
        type: 'checkpoint',
        lat: '',
        lng: '',
        altitudeMeters: '',
        radiusMeters: 300,
      });
      await loadRideRoute(selectedRideId);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to create checkpoint.', 'error');
    } finally {
      setSavingCp(false);
    }
  };

  const handleDeleteCheckpoint = async (cpId) => {
    try {
      await api.delete(`/rides/${selectedRideId}/checkpoints/${cpId}`);
      showToast('Checkpoint deleted.', 'info');
      await loadRideRoute(selectedRideId);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not remove checkpoint.', 'error');
    }
  };

  const handleMoveCheckpoint = async (index, direction) => {
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= checkpoints.length) return;
    const copy = [...checkpoints];
    const [item] = copy.splice(index, 1);
    copy.splice(swapIdx, 0, item);
    setCheckpoints(copy);
    try {
      await api.put(`/rides/${selectedRideId}/checkpoints/reorder`, {
        orderedIds: copy.map((c) => c._id),
      });
      await loadRideRoute(selectedRideId);
    } catch {
      showToast('Failed to reorder checkpoints.', 'error');
    }
  };

  if (expeditions.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-kaafila-surface p-8 text-center">
        <Compass className="mx-auto h-9 w-9 text-kaafila-yellow/75" />
        <p className="mt-3 font-display text-xl font-bold uppercase text-kaafila-text">
          No Expeditions Created Yet
        </p>
        <p className="mt-1 text-xs text-kaafila-muted">
          Create an expedition first before mapping routes and checkpoints.
        </p>
      </div>
    );
  }

  const previewRoute = {
    startPoint:
      routeState.startLat !== '' && routeState.startLng !== ''
        ? { label: routeState.startLabel, coordinates: [Number(routeState.startLng), Number(routeState.startLat)] }
        : null,
    endPoint:
      routeState.endLat !== '' && routeState.endLng !== ''
        ? { label: routeState.endLabel, coordinates: [Number(routeState.endLng), Number(routeState.endLat)] }
        : null,
    geometry:
      routeState.geometryCoords?.length >= 2
        ? { type: 'LineString', coordinates: routeState.geometryCoords }
        : null,
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-kaafila-yellow/25 bg-kaafila-surface p-6 shadow-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-mono text-xs uppercase tracking-widest text-kaafila-yellow">
              Geospatial Route &amp; Convoy Console
            </span>
            <h2 className="mt-1 font-display text-2xl font-bold uppercase text-kaafila-text">
              Routes, Checkpoints &amp; Live Riders
            </h2>
          </div>
          <select
            value={selectedRideId}
            onChange={(e) => setSelectedRideId(e.target.value)}
            aria-label="Select expedition to manage route"
            className="rounded-xl border border-kaafila-yellow/35 bg-kaafila-bg px-3.5 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-yellow sm:max-w-xs"
          >
            {expeditions.map((r) => (
              <option key={r._id} value={r._id}>
                {r.title}
              </option>
            ))}
          </select>
        </div>

        <p className="mt-2 text-xs text-kaafila-muted">
          Tip: Click anywhere on the map below to auto-fill Latitude &amp; Longitude for a new checkpoint. Itinerary days remain untouched.
        </p>

        <div className="mt-4">
          <KaafilaMap
            route={previewRoute}
            checkpoints={checkpoints}
            liveRiders={trackingOverview?.consentedLiveRiders || []}
            onMapClick={handleMapClick}
            loading={loading}
            heightClass="h-[360px]"
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Add & Reorder Checkpoints */}
        <section className="rounded-3xl border border-white/10 bg-kaafila-surface p-6 lg:col-span-6">
          <h3 className="font-display text-xl font-bold uppercase text-kaafila-text">
            Add Waypoint / Checkpoint
          </h3>
          <div className="mt-3">
            <LocationSearchInput
              placeholder="Search Indian place / pass for checkpoint..."
              onSelect={(item) => {
                setCpForm((p) => ({
                  ...p,
                  name: p.name || item.name || item.city || '',
                  lat: String(item.lat),
                  lng: String(item.lng),
                }));
              }}
            />
          </div>
          <form onSubmit={handleAddCheckpoint} className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                required
                minLength={2}
                value={cpForm.name}
                onChange={(e) => setCpForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Checkpoint Name *"
                className="rounded-xl border border-white/15 bg-kaafila-bg px-3.5 py-2 text-xs text-kaafila-text outline-none focus:border-kaafila-yellow"
              />
              <select
                value={cpForm.type}
                onChange={(e) => setCpForm((p) => ({ ...p, type: e.target.value }))}
                className="rounded-xl border border-white/15 bg-kaafila-bg px-3.5 py-2 text-xs text-kaafila-text outline-none focus:border-kaafila-yellow"
              >
                {CHECKPOINT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="number"
                step="any"
                required
                value={cpForm.lat}
                onChange={(e) => setCpForm((p) => ({ ...p, lat: e.target.value }))}
                placeholder="Latitude (e.g. 34.1526) *"
                className="rounded-xl border border-white/15 bg-kaafila-bg px-3.5 py-2 font-mono text-xs text-kaafila-text outline-none focus:border-kaafila-yellow"
              />
              <input
                type="number"
                step="any"
                required
                value={cpForm.lng}
                onChange={(e) => setCpForm((p) => ({ ...p, lng: e.target.value }))}
                placeholder="Longitude (e.g. 77.5771) *"
                className="rounded-xl border border-white/15 bg-kaafila-bg px-3.5 py-2 font-mono text-xs text-kaafila-text outline-none focus:border-kaafila-yellow"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="number"
                value={cpForm.altitudeMeters}
                onChange={(e) => setCpForm((p) => ({ ...p, altitudeMeters: e.target.value }))}
                placeholder="Altitude (m)"
                className="rounded-xl border border-white/15 bg-kaafila-bg px-3.5 py-2 font-mono text-xs text-kaafila-text outline-none focus:border-kaafila-yellow"
              />
              <input
                type="number"
                min={50}
                max={5000}
                value={cpForm.radiusMeters}
                onChange={(e) => setCpForm((p) => ({ ...p, radiusMeters: e.target.value }))}
                placeholder="Check-in Radius (m)"
                className="rounded-xl border border-white/15 bg-kaafila-bg px-3.5 py-2 font-mono text-xs text-kaafila-text outline-none focus:border-kaafila-yellow"
              />
            </div>

            <input
              type="text"
              value={cpForm.description}
              onChange={(e) => setCpForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Notes (fuel availability, permit check, lunch halt...)"
              className="w-full rounded-xl border border-white/15 bg-kaafila-bg px-3.5 py-2 text-xs text-kaafila-text outline-none focus:border-kaafila-yellow"
            />

            <button
              type="submit"
              disabled={savingCp}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-kaafila-yellow px-4 py-2.5 text-xs font-bold uppercase text-kaafila-bg hover:bg-kaafila-yellowHover transition disabled:opacity-50"
            >
              {savingCp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add Checkpoint
            </button>
          </form>

          {/* Ordered List */}
          <div className="mt-5 space-y-2">
            {checkpoints.map((cp, idx) => (
              <div
                key={cp._id}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-kaafila-bg px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-kaafila-text">
                    <span className="mr-1.5 font-mono text-kaafila-yellow">#{cp.sequenceNumber}</span>
                    {cp.name}
                  </p>
                  <p className="font-mono text-[10px] text-kaafila-muted">
                    {cp.type} · {cp.coordinates?.[1]?.toFixed(4)}, {cp.coordinates?.[0]?.toFixed(4)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMoveCheckpoint(idx, -1)}
                    className="rounded border border-white/10 p-1 text-kaafila-muted hover:text-kaafila-yellow disabled:opacity-30"
                    title="Move up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === checkpoints.length - 1}
                    onClick={() => handleMoveCheckpoint(idx, 1)}
                    className="rounded border border-white/10 p-1 text-kaafila-muted hover:text-kaafila-yellow disabled:opacity-30"
                    title="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCheckpoint(cp._id)}
                    className="rounded border border-red-500/30 p-1 text-red-300 hover:bg-red-500/15"
                    title="Delete checkpoint"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Route Geometry & Live Riders */}
        <section className="space-y-6 lg:col-span-6">
          <form onSubmit={handleSaveRoute} className="rounded-3xl border border-white/10 bg-kaafila-surface p-6 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-xl font-bold uppercase text-kaafila-text">
                Route Endpoints &amp; Geometry
              </h3>
              <div className="flex items-center gap-3 font-mono text-xs text-kaafila-yellow">
                <span className="inline-flex items-center gap-1">
                  <RouteIcon className="h-3.5 w-3.5" />
                  {routeState.calculatedDistanceKm || 0} km
                </span>
                {routeState.estimatedDurationText && (
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <Clock className="h-3.5 w-3.5" />
                    {routeState.estimatedDurationText}
                  </span>
                )}
              </div>
            </div>

            {routeState.previewPendingSave && (
              <div className="rounded-xl border border-kaafila-yellow/40 bg-kaafila-yellow/10 px-3 py-2 text-[11px] text-kaafila-yellow">
                Calculated route preview shown on map. Click <strong>Save Route Geometry</strong> below to persist changes.
              </div>
            )}

            <LocationSearchInput
              placeholder="Search start point in India (e.g. Leh, Manali)..."
              onSelect={(item) => {
                setRouteState((p) => ({
                  ...p,
                  startLabel: item.name || item.formatted || p.startLabel,
                  startLat: String(item.lat),
                  startLng: String(item.lng),
                }));
              }}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                type="text"
                value={routeState.startLabel}
                onChange={(e) => setRouteState((p) => ({ ...p, startLabel: e.target.value }))}
                placeholder="Start Label"
                className="rounded-xl border border-white/15 bg-kaafila-bg px-3 py-2 text-xs text-kaafila-text outline-none focus:border-kaafila-yellow"
              />
              <input
                type="number"
                step="any"
                value={routeState.startLat}
                onChange={(e) => setRouteState((p) => ({ ...p, startLat: e.target.value }))}
                placeholder="Start Lat"
                className="rounded-xl border border-white/15 bg-kaafila-bg px-3 py-2 font-mono text-xs text-kaafila-text outline-none focus:border-kaafila-yellow"
              />
              <input
                type="number"
                step="any"
                value={routeState.startLng}
                onChange={(e) => setRouteState((p) => ({ ...p, startLng: e.target.value }))}
                placeholder="Start Lng"
                className="rounded-xl border border-white/15 bg-kaafila-bg px-3 py-2 font-mono text-xs text-kaafila-text outline-none focus:border-kaafila-yellow"
              />
            </div>

            <LocationSearchInput
              placeholder="Search destination in India (e.g. Hanle, Kaza)..."
              onSelect={(item) => {
                setRouteState((p) => ({
                  ...p,
                  endLabel: item.name || item.formatted || p.endLabel,
                  endLat: String(item.lat),
                  endLng: String(item.lng),
                }));
              }}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                type="text"
                value={routeState.endLabel}
                onChange={(e) => setRouteState((p) => ({ ...p, endLabel: e.target.value }))}
                placeholder="Destination Label"
                className="rounded-xl border border-white/15 bg-kaafila-bg px-3 py-2 text-xs text-kaafila-text outline-none focus:border-kaafila-yellow"
              />
              <input
                type="number"
                step="any"
                value={routeState.endLat}
                onChange={(e) => setRouteState((p) => ({ ...p, endLat: e.target.value }))}
                placeholder="End Lat"
                className="rounded-xl border border-white/15 bg-kaafila-bg px-3 py-2 font-mono text-xs text-kaafila-text outline-none focus:border-kaafila-yellow"
              />
              <input
                type="number"
                step="any"
                value={routeState.endLng}
                onChange={(e) => setRouteState((p) => ({ ...p, endLng: e.target.value }))}
                placeholder="End Lng"
                className="rounded-xl border border-white/15 bg-kaafila-bg px-3 py-2 font-mono text-xs text-kaafila-text outline-none focus:border-kaafila-yellow"
              />
            </div>

            <textarea
              rows={3}
              value={routeState.routeDescription}
              onChange={(e) => setRouteState((p) => ({ ...p, routeDescription: e.target.value }))}
              placeholder="Road surface notes, pass closure advisories, fuel range guidance..."
              className="w-full rounded-xl border border-white/15 bg-kaafila-bg px-3.5 py-2 text-xs text-kaafila-text outline-none focus:border-kaafila-yellow"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={calculatingRoute}
                onClick={handleCalculateMotorcycleRoute}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/45 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {calculatingRoute ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
                Calculate Motorcycle Route
              </button>
              <button
                type="button"
                onClick={handleBuildGeometryFromCheckpoints}
                className="inline-flex items-center gap-1.5 rounded-xl border border-kaafila-yellow/40 px-3.5 py-2 text-xs font-semibold text-kaafila-yellow hover:bg-kaafila-yellow/10"
              >
                <MapPin className="h-3.5 w-3.5" />
                Connect Checkpoints ({checkpoints.length})
              </button>
              <button
                type="submit"
                disabled={savingRoute}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-kaafila-yellow px-4 py-2 text-xs font-bold uppercase text-kaafila-bg hover:bg-kaafila-yellowHover disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                Save Route Geometry
              </button>
            </div>
          </form>

          {/* Participating Riders Checkpoint & Live Sharing Overview */}
          <div className="rounded-3xl border border-white/10 bg-kaafila-surface p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold uppercase text-kaafila-text">
                Convoy &amp; Checkpoint Progress
              </h3>
              <span className="inline-flex items-center gap-1 font-mono text-xs text-emerald-400">
                <Radio className="h-3.5 w-3.5" />
                {trackingOverview?.stats?.consentedLiveCount || 0} sharing live
              </span>
            </div>

            {!trackingOverview || trackingOverview.rosterProgress?.length === 0 ? (
              <p className="mt-3 text-xs text-kaafila-muted">
                Confirmed participating riders and consented live convoy positions appear here.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {trackingOverview.rosterProgress.map((r) => (
                  <div
                    key={r.userId}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-kaafila-bg px-3.5 py-2 text-xs"
                  >
                    <span className="font-semibold text-kaafila-text">{r.fullName}</span>
                    <span className="font-mono text-kaafila-yellow">
                      {r.checkpointsCompleted}/{r.totalCheckpoints} checkpoints
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}


import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Compass,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Navigation,
  Pause,
  Play,
  Radio,
  Route as RouteIcon,
  ShieldAlert,
  Square,
} from 'lucide-react';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import { useSocket } from '../context/SocketContext';
import KaafilaMap from './KaafilaMap';

function formatDuration(totalSeconds = 0) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function RiderTrackingPanel({ mode = 'tracking', onSessionFinalized = null }) {
  const { showToast } = useToast();
  const { socket } = useSocket();

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [selectedHistorySession, setSelectedHistorySession] = useState(null);

  const [rides, setRides] = useState([]);
  const [groups, setGroups] = useState([]);
  const [rideRouteBundle, setRideRouteBundle] = useState(null);

  // Setup state when no active session
  const [title, setTitle] = useState('');
  const [selectedRideId, setSelectedRideId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [optInShareOnStart, setOptInShareOnStart] = useState(false);

  // Live Geolocation state
  const [gpsStatus, setGpsStatus] = useState('idle'); // idle | watching | denied | unavailable | poor_accuracy
  const [gpsError, setGpsError] = useState('');
  const [currentCoord, setCurrentCoord] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [busyAction, setBusyAction] = useState(false);

  const watchIdRef = useRef(null);
  const pendingPointsRef = useRef([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sessRes, ridesRes, groupsRes] = await Promise.all([
        api.get('/tracking/sessions'),
        mode === 'history' ? Promise.resolve(null) : api.get('/rides', { params: { status: 'active', limit: 30 } }),
        mode === 'history' ? Promise.resolve(null) : api.get('/groups', { params: { limit: 30 } }),
      ]);
      setSessions(sessRes.data?.data || []);
      setActiveSession(sessRes.data?.activeSession || null);
      if (ridesRes) setRides(ridesRes.data?.data || []);
      if (groupsRes) {
        const joinedGroups = (groupsRes.data?.data || []).filter(
          (g) => g.myMembership?.status === 'active' || g.myMembershipStatus === 'active'
        );
        setGroups(joinedGroups);
      }
    } catch {
      showToast('Unable to load tracking sessions.', 'error');
    } finally {
      setLoading(false);
    }
  }, [mode, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load route & checkpoints if active session or setup ride is selected
  const routeRideRefId = activeSession?.ride?._id || activeSession?.ride || selectedRideId || '';
  const loadLinkedRoute = useCallback(async (rId) => {
    if (!rId) {
      setRideRouteBundle(null);
      return;
    }
    try {
      const { data } = await api.get(`/maps/expeditions/${rId}`);
      setRideRouteBundle(data?.data || null);
    } catch {
      setRideRouteBundle(null);
    }
  }, []);

  useEffect(() => {
    loadLinkedRoute(routeRideRefId);
  }, [routeRideRefId, loadLinkedRoute]);

  // Elapsed timer when session is active
  useEffect(() => {
    if (!activeSession) {
      setElapsedSeconds(0);
      return undefined;
    }
    if (activeSession.status === 'paused') {
      setElapsedSeconds(activeSession.activeDurationSeconds || 0);
      return undefined;
    }
    const tick = () => {
      const base = activeSession.activeDurationSeconds || 0;
      const since = Math.max(0, Math.floor((Date.now() - new Date(activeSession.updatedAt || activeSession.startedAt).getTime()) / 1000));
      setElapsedSeconds(base + since);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeSession]);

  // Flush buffered points to server every 8 seconds when session active
  const flushBufferedPoints = useCallback(async (sessionId) => {
    if (!sessionId || pendingPointsRef.current.length === 0) return;
    const batch = pendingPointsRef.current.splice(0, 100);
    try {
      const { data } = await api.post(`/tracking/sessions/${sessionId}/points`, { points: batch });
      if (data?.data?.session) {
        setActiveSession(data.data.session);
      }
      if (data?.data?.newlyVerifiedCheckpoints?.length > 0) {
        data.data.newlyVerifiedCheckpoints.forEach((cp) => {
          showToast(`Checkpoint verified: ${cp.name}`, 'success');
        });
        loadLinkedRoute(routeRideRefId);
      }
    } catch {
      // Re-queue transient failed batch cleanly
      pendingPointsRef.current = [...batch, ...pendingPointsRef.current].slice(0, 400);
    }
  }, [loadLinkedRoute, routeRideRefId, showToast]);

  // Start / Stop browser Geolocation watcher ONLY when activeSession?.status === 'active'
  useEffect(() => {
    const clearWatch = () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };

    if (!activeSession || activeSession.status !== 'active') {
      clearWatch();
      setGpsStatus('idle');
      return undefined;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('unavailable');
      setGpsError('Browser Geolocation API is unavailable on this device.');
      return undefined;
    }

    setGpsStatus('watching');
    setGpsError('');

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const pt = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyMeters: Math.round(pos.coords.accuracy || 25),
          altitudeMeters: pos.coords.altitude !== null ? Math.round(pos.coords.altitude) : undefined,
          timestamp: new Date(pos.timestamp || Date.now()).toISOString(),
        };
        setCurrentCoord(pt);
        if (pt.accuracyMeters > 100) {
          setGpsStatus('poor_accuracy');
          setGpsError(`Weak GPS signal (${pt.accuracyMeters}m accuracy). Points > 100m are excluded from verified distance.`);
        } else {
          setGpsStatus('watching');
          setGpsError('');
        }
        pendingPointsRef.current.push(pt);

        if (activeSession.isLocationSharingEnabled && activeSession.group && socket) {
          const gId = activeSession.group._id || activeSession.group;
          socket.emit('group:location_update', {
            groupId: gId,
            sessionId: activeSession._id,
            lat: pt.lat,
            lng: pt.lng,
            accuracyMeters: pt.accuracyMeters,
            heading: pos.coords.heading,
            speedKmh: pos.coords.speed !== null ? Math.round(pos.coords.speed * 3.6) : null,
          });
        }
      },
      (err) => {
        if (err.code === 1) {
          setGpsStatus('denied');
          setGpsError('Location permission denied. Enable GPS permission in browser settings to record track points.');
        } else {
          setGpsStatus('unavailable');
          setGpsError(err.message || 'Unable to acquire GPS fix right now.');
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    const flushTimer = setInterval(() => {
      flushBufferedPoints(activeSession._id);
    }, 8000);

    return () => {
      clearWatch();
      clearInterval(flushTimer);
    };
  }, [activeSession, socket, flushBufferedPoints]);

  const handleStartTracking = async (e) => {
    e.preventDefault();
    setBusyAction(true);
    try {
      const { data } = await api.post('/tracking/sessions/start', {
        title: title.trim() || undefined,
        rideId: selectedRideId || null,
        groupId: selectedGroupId || null,
        enableLocationSharing: optInShareOnStart,
      });
      setActiveSession(data?.data || null);
      showToast('GPS tracking started. Zero background tracking occurs when stopped.', 'success');
      await loadData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to start tracking.', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handlePauseResume = async () => {
    if (!activeSession) return;
    setBusyAction(true);
    try {
      if (activeSession.status === 'active') {
        await flushBufferedPoints(activeSession._id);
        const { data } = await api.patch(`/tracking/sessions/${activeSession._id}/pause`);
        setActiveSession(data.data);
        showToast('Tracking paused.', 'info');
      } else {
        const { data } = await api.patch(`/tracking/sessions/${activeSession._id}/resume`);
        setActiveSession(data.data);
        showToast('Tracking resumed.', 'success');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to update tracking state.', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleStopTracking = async () => {
    if (!activeSession) return;
    setBusyAction(true);
    try {
      const remaining = pendingPointsRef.current.splice(0, 500);
      const { data } = await api.post(`/tracking/sessions/${activeSession._id}/stop`, {
        points: remaining,
      });
      showToast(data?.message || 'Tracking stopped.', 'success');
      setActiveSession(null);
      setCurrentCoord(null);
      await loadData();
      if (onSessionFinalized) onSessionFinalized();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to stop tracking session.', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleToggleLiveSharing = async (enabled) => {
    if (!activeSession) return;
    setBusyAction(true);
    try {
      const { data } = await api.patch(`/tracking/sessions/${activeSession._id}/sharing`, {
        enabled,
        groupId: selectedGroupId || activeSession.group?._id || activeSession.group || undefined,
      });
      setActiveSession(data.data);
      showToast(
        enabled ? 'Live group location sharing enabled.' : 'Live location sharing stopped immediately.',
        enabled ? 'info' : 'success'
      );
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to update sharing preference.', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleVerifyCheckpoint = async (checkpoint) => {
    if (!activeSession || activeSession.status !== 'active') return;
    const coord = currentCoord;
    if (!coord) {
      showToast('Waiting for current GPS fix before verifying checkpoint proximity.', 'error');
      return;
    }
    setBusyAction(true);
    try {
      const { data } = await api.post(
        `/tracking/sessions/${activeSession._id}/checkpoints/${checkpoint._id}/verify`,
        {
          lat: coord.lat,
          lng: coord.lng,
          accuracyMeters: coord.accuracyMeters || 25,
        }
      );
      showToast(data?.message || `Checkpoint ${checkpoint.name} verified.`, 'success');
      await loadLinkedRoute(routeRideRefId);
      if (onSessionFinalized) onSessionFinalized();
    } catch (err) {
      showToast(err.response?.data?.message || 'Checkpoint check-in rejected by server verification.', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleTogglePublicRoute = async (session) => {
    try {
      const nextShare = !session.shareSimplifiedRoutePublic;
      await api.patch(`/tracking/sessions/${session._id}/public-route`, {
        shareSimplifiedRoutePublic: nextShare,
      });
      showToast(
        nextShare ? 'Coarsened summary route enabled on public profile.' : 'Route summary hidden from public profile.',
        'info'
      );
      await loadData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to update privacy setting.', 'error');
    }
  };

  const arrivedIds = useMemo(
    () => new Set((rideRouteBundle?.myArrivals || []).map((a) => String(a.checkpoint))),
    [rideRouteBundle]
  );

  const mapLivePoints = useMemo(() => {
    if (selectedHistorySession?.points?.length) return selectedHistorySession.points;
    const pts = [...(activeSession?.points || [])];
    if (currentCoord) pts.push(currentCoord);
    return pts;
  }, [activeSession, currentCoord, selectedHistorySession]);

  if (loading) {
    return (
      <div className="flex h-56 items-center justify-center rounded-3xl border border-white/10 bg-kaafila-surface">
        <Loader2 className="h-7 w-7 animate-spin text-kaafila-yellow" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {mode !== 'history' && (
        <section className="rounded-3xl border border-kaafila-yellow/30 bg-kaafila-surface p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-kaafila-yellow">
                <Navigation className="h-3.5 w-3.5" />
                Opt-In GPS Ride Tracker
              </span>
              <h2 className="mt-1 font-display text-2xl font-bold uppercase text-kaafila-text">
                {activeSession ? activeSession.title : 'Start a Tracked Ride'}
              </h2>
            </div>

            {activeSession && (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11px] font-bold uppercase ${
                    activeSession.status === 'active'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-kaafila-yellow/20 text-kaafila-yellow border border-kaafila-yellow/40'
                  }`}
                >
                  <Radio className="h-3 w-3 animate-pulse" />
                  {activeSession.status === 'active' ? 'GPS Tracking Active' : 'Tracking Paused'}
                </span>

                {activeSession.isLocationSharingEnabled && (
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => handleToggleLiveSharing(false)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-red-400/50 bg-red-500/15 px-3 py-1 font-mono text-[11px] font-bold uppercase text-red-200 hover:bg-red-500/25 transition"
                  >
                    <EyeOff className="h-3 w-3" />
                    Stop Sharing Now
                  </button>
                )}
              </div>
            )}
          </div>

          {!activeSession ? (
            <form onSubmit={handleStartTracking} className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs uppercase tracking-wider text-kaafila-muted">
                  Session Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Manali Morning Shakedown or Leh–Pangong Leg"
                  className="mt-1 w-full rounded-xl border border-white/15 bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-yellow"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-kaafila-muted">
                  Link Expedition (Optional, enables checkpoints)
                </label>
                <select
                  value={selectedRideId}
                  onChange={(e) => setSelectedRideId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-kaafila-bg px-3.5 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-yellow"
                >
                  <option value="">Solo / Unlinked Ride</option>
                  {rides.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.title} ({r.region})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-kaafila-muted">
                  Convoy Group (Optional for live map sharing)
                </label>
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-kaafila-bg px-3.5 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-yellow"
                >
                  <option value="">No Group Selected</option>
                  {groups.map((g) => (
                    <option key={g._id} value={g._id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 rounded-2xl border border-kaafila-yellow/25 bg-kaafila-bg p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={optInShareOnStart}
                    onChange={(e) => setOptInShareOnStart(e.target.checked)}
                    className="mt-0.5 accent-kaafila-yellow"
                  />
                  <span className="text-xs leading-relaxed text-kaafila-text">
                    <strong className="text-kaafila-yellow">Opt-in Live Group Location Sharing:</strong>{' '}
                    Share my live coordinates exclusively with verified active members of the selected KAAFILA group and the expedition organiser while this session is active. Never shared publicly.
                  </span>
                </label>
              </div>

              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={busyAction}
                  className="inline-flex items-center gap-2 rounded-xl bg-kaafila-yellow px-6 py-3 text-xs font-bold uppercase tracking-wider text-kaafila-bg shadow-amber hover:bg-kaafila-yellowHover transition disabled:opacity-50"
                >
                  <Play className="h-4 w-4" />
                  Start Explicit GPS Tracking
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-5 space-y-5">
              {/* Telemetry Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-kaafila-bg p-3.5">
                  <span className="text-[10px] uppercase text-kaafila-muted">Elapsed Time</span>
                  <p className="mt-1 font-mono text-xl font-bold text-kaafila-text">
                    {formatDuration(elapsedSeconds)}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-kaafila-bg p-3.5">
                  <span className="text-[10px] uppercase text-kaafila-muted">Estimated Distance</span>
                  <p className="mt-1 font-mono text-xl font-bold text-kaafila-yellow">
                    {Number(activeSession.estimatedDistanceKm || 0).toFixed(2)} km
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-kaafila-bg p-3.5">
                  <span className="text-[10px] uppercase text-kaafila-muted">Verified Distance</span>
                  <p className="mt-1 font-mono text-xl font-bold text-emerald-400">
                    {Number(activeSession.verifiedDistanceKm || 0).toFixed(2)} km
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-kaafila-bg p-3.5">
                  <span className="text-[10px] uppercase text-kaafila-muted">GPS Accuracy</span>
                  <p className="mt-1 font-mono text-xl font-bold text-kaafila-text">
                    {currentCoord?.accuracyMeters ? `±${currentCoord.accuracyMeters}m` : 'Acquiring...'}
                  </p>
                </div>
              </div>

              {gpsError && (
                <div
                  className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-xs ${
                    gpsStatus === 'denied' || gpsStatus === 'unavailable'
                      ? 'border-red-500/40 bg-red-500/10 text-red-200'
                      : 'border-kaafila-yellow/40 bg-kaafila-yellow/10 text-kaafila-yellow'
                  }`}
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{gpsError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={handlePauseResume}
                    className="inline-flex items-center gap-2 rounded-xl border border-kaafila-yellow/50 bg-kaafila-yellow/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-yellow hover:bg-kaafila-yellow/20 transition"
                  >
                    {activeSession.status === 'active' ? (
                      <>
                        <Pause className="h-4 w-4" /> Pause Ride
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" /> Resume Ride
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={handleStopTracking}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-red-600 transition"
                  >
                    <Square className="h-4 w-4" /> Stop & Finalize Ride
                  </button>
                </div>

                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-kaafila-bg px-3.5 py-2 text-xs text-kaafila-text">
                  <input
                    type="checkbox"
                    checked={Boolean(activeSession.isLocationSharingEnabled)}
                    disabled={busyAction}
                    onChange={(e) => handleToggleLiveSharing(e.target.checked)}
                    className="accent-kaafila-yellow"
                  />
                  <span>Live Group Sharing</span>
                </label>
              </div>
            </div>
          )}

          {/* Live Map Preview */}
          <div className="mt-5">
            <KaafilaMap
              route={rideRouteBundle?.route || null}
              checkpoints={rideRouteBundle?.checkpoints || []}
              arrivedCheckpointIds={arrivedIds}
              liveTrackPoints={mapLivePoints}
              heightClass="h-[340px]"
              emptyTitle="Ready for GPS Track"
              emptyDescription="Start tracking or select an expedition with mapped route coordinates to preview your path."
            />
          </div>

          {/* Expedition Checkpoint Proximity Check-ins */}
          {activeSession && rideRouteBundle?.checkpoints?.length > 0 && (
            <div className="mt-5 rounded-2xl border border-white/10 bg-kaafila-bg p-4">
              <h3 className="font-display text-lg font-bold uppercase text-kaafila-text">
                Checkpoint Verification
              </h3>
              <p className="text-xs text-kaafila-muted">
                Arrival is verified server-side using GPS proximity and accuracy threshold.
              </p>
              <div className="mt-3 space-y-2">
                {rideRouteBundle.checkpoints.map((cp) => {
                  const verified = arrivedIds.has(String(cp._id));
                  return (
                    <div
                      key={cp._id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-kaafila-surface px-3.5 py-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-kaafila-yellow">#{cp.sequenceNumber}</span>
                        <div>
                          <p className="font-semibold text-kaafila-text">{cp.name}</p>
                          <p className="text-[11px] text-kaafila-muted">Radius: {cp.radiusMeters}m</p>
                        </div>
                      </div>
                      {verified ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" /> Verified
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busyAction || activeSession.status !== 'active' || !currentCoord}
                          onClick={() => handleVerifyCheckpoint(cp)}
                          className="rounded-lg border border-kaafila-yellow/40 px-3 py-1.5 font-mono text-[11px] font-semibold text-kaafila-yellow hover:bg-kaafila-yellow/15 disabled:opacity-45 transition"
                        >
                          Verify Check-In
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Recorded Ride History */}
      <section className="rounded-3xl border border-white/10 bg-kaafila-surface p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="font-mono text-xs uppercase tracking-widest text-kaafila-yellow">
              Verified Logbook
            </span>
            <h3 className="mt-1 font-display text-2xl font-bold uppercase text-kaafila-text">
              Ride & Tracking History
            </h3>
          </div>
          {selectedHistorySession && (
            <button
              type="button"
              onClick={() => setSelectedHistorySession(null)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-kaafila-muted hover:text-kaafila-yellow"
            >
              Close Map Preview
            </button>
          )}
        </div>

        {mode === 'history' && selectedHistorySession && (
          <div className="mt-4">
            <KaafilaMap
              liveTrackPoints={selectedHistorySession.points || []}
              heightClass="h-[320px]"
              emptyTitle="No GPS Vertices Recorded"
              emptyDescription="This session has no saved GPS vertices."
            />
          </div>
        )}

        {sessions.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-kaafila-bg p-8 text-center">
            <Compass className="mx-auto h-8 w-8 text-kaafila-yellow/70" />
            <p className="mt-2 text-sm text-kaafila-muted">
              No GPS tracking sessions logged yet. Start your first ride above to log verified kilometres.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {sessions.map((s) => (
              <div
                key={s._id}
                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-kaafila-bg p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-display text-lg font-bold text-kaafila-text">{s.title}</h4>
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                        s.verificationStatus === 'verified'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : s.verificationStatus === 'flagged'
                            ? 'bg-red-500/15 text-red-300'
                            : 'bg-white/10 text-kaafila-muted'
                      }`}
                    >
                      {s.verificationStatus}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-kaafila-muted">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-kaafila-yellow" />
                      {new Date(s.startedAt).toLocaleDateString()} · {formatDuration(s.activeDurationSeconds)}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-kaafila-yellow">
                      <RouteIcon className="h-3.5 w-3.5" />
                      {Number(s.verifiedDistanceKm || 0).toFixed(1)} km verified
                    </span>
                    {s.checkpointsCompleted > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                        {s.checkpointsCompleted} checkpoints
                      </span>
                    )}
                    {s.suspiciousFlags?.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-red-300">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        {s.suspiciousFlags.length} GPS anomaly filtered
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {s.status === 'completed' && (
                    <button
                      type="button"
                      onClick={() => handleTogglePublicRoute(s)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${
                        s.shareSimplifiedRoutePublic
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : 'border-white/15 bg-kaafila-surface text-kaafila-muted hover:text-kaafila-text'
                      }`}
                    >
                      {s.shareSimplifiedRoutePublic ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      {s.shareSimplifiedRoutePublic ? 'Public Summary On' : 'Share Summary'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedHistorySession(s)}
                    className="rounded-lg border border-kaafila-yellow/40 px-3 py-1.5 text-[11px] font-bold uppercase text-kaafila-yellow hover:bg-kaafila-yellow/10"
                  >
                    Preview Route
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}


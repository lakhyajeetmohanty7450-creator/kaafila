import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Award,
  Bike,
  Calendar,
  Clock,
  MapPin,
  MessageSquare,
  Mountain,
  ShieldCheck,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import KaafilaMap from '../components/KaafilaMap';

export default function RiderProfilePage() {
  const { handle } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get(`/riders/${handle}`);
        if (active && res.data?.success) {
          setData(res.data.data);
        }
      } catch (err) {
        if (active) setError(err.response?.data?.message || 'Rider profile not found.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [handle]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="h-64 animate-pulse rounded-3xl bg-kaafila-surface" />
      </div>
    );
  }

  if (error || !data?.rider) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="font-display text-3xl text-kaafila-text">Rider Not Found</h1>
        <p className="mt-2 text-sm text-kaafila-muted">{error}</p>
        <Link
          to="/community/riders"
          className="mt-6 inline-block rounded-xl bg-kaafila-yellow px-5 py-2.5 text-xs font-bold uppercase text-kaafila-bg"
        >
          Browse Riders
        </Link>
      </div>
    );
  }

  const { rider, tierProgress, expeditions = [], publicRouteSummaries = [] } = data;

  const updateConnection = (connectionStatus, connectionId = rider.connectionId) => {
    setData((prev) =>
      prev ? { ...prev, rider: { ...prev.rider, connectionStatus, connectionId } } : prev
    );
  };

  const handleConnect = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setActionBusy(true);
    try {
      const res = await api.post(`/connections/request/${rider.userId}`);
      showToast(res.data?.message || 'Connection request sent.', 'success');
      updateConnection('pending_sent', res.data?.data?._id);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not send connection request.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleAccept = async () => {
    if (!rider.connectionId) return;
    setActionBusy(true);
    try {
      await api.put(`/connections/${rider.connectionId}/accept`);
      showToast(`Connected with ${rider.fullName}.`, 'success');
      updateConnection('accepted');
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not accept request.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!rider.connectionId) return;
    setActionBusy(true);
    try {
      await api.delete(`/connections/${rider.connectionId}`);
      showToast('Connection request cancelled.', 'info');
      updateConnection('none', null);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not cancel request.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleMessage = async () => {
    setActionBusy(true);
    try {
      const res = await api.post(`/messages/conversations/${rider.userId}`);
      navigate(`/community/messages/${res.data.data._id}`);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not start message.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-kaafila-yellow/30 bg-kaafila-surface p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-kaafila-yellow bg-kaafila-bg">
              {rider.avatarUrl ? (
                <img src={rider.avatarUrl} alt={rider.fullName} className="h-full w-full object-cover" />
              ) : (
                <span className="font-display text-3xl font-bold text-kaafila-yellow">
                  {rider.fullName?.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-kaafila-yellow">@{rider.handle}</span>
                {rider.isDemo && (
                  <span className="rounded bg-kaafila-earth/70 px-2 py-0.5 font-mono text-[10px] uppercase text-kaafila-text">
                    Demo Rider
                  </span>
                )}
              </div>
              <h1 className="mt-1 font-display text-3xl font-bold uppercase text-kaafila-text">
                {rider.fullName}
              </h1>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-kaafila-muted">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-kaafila-yellow" />
                  {rider.homeCity || 'India'}
                </span>
                {rider.primaryMotorcycle && (
                  <span className="inline-flex items-center gap-1">
                    <Bike className="h-3.5 w-3.5 text-kaafila-yellow" />
                    {rider.primaryMotorcycle}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 capitalize">
                  <Mountain className="h-3.5 w-3.5 text-kaafila-yellow" />
                  {String(rider.ridingExperience || 'beginner').replace('_', ' ')}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <div className="rounded-2xl border border-kaafila-yellow/40 bg-kaafila-bg px-5 py-3 text-center">
              <span className="block font-mono text-[10px] uppercase tracking-wider text-kaafila-muted">
                Verified Rank
              </span>
              <span className="mt-1 inline-flex items-center gap-1.5 font-display text-2xl font-bold text-kaafila-yellow">
                <Award className="h-5 w-5" />
                {rider.rank}
              </span>
            </div>

            {rider.connectionStatus !== 'self' && (!isAuthenticated || user?.role === 'rider') && (
              <div className="flex flex-wrap gap-2">
                {rider.connectionStatus === 'accepted' ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={handleMessage}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-kaafila-yellow px-4 py-2 text-xs font-bold uppercase tracking-wider text-kaafila-bg hover:bg-kaafila-yellowHover transition disabled:opacity-50"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Message Rider
                  </button>
                ) : rider.connectionStatus === 'pending_sent' ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={handleCancel}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-kaafila-yellow/40 bg-kaafila-yellow/10 px-4 py-2 text-xs font-semibold text-kaafila-yellow"
                  >
                    <Clock className="h-4 w-4" />
                    Request Sent (Cancel)
                  </button>
                ) : rider.connectionStatus === 'pending_received' ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={handleAccept}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-kaafila-bg"
                  >
                    <UserCheck className="h-4 w-4" />
                    Accept Request
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={handleConnect}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-kaafila-yellow px-4 py-2 text-xs font-bold uppercase tracking-wider text-kaafila-bg hover:bg-kaafila-yellowHover transition disabled:opacity-50"
                  >
                    <UserPlus className="h-4 w-4" />
                    Connect
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {rider.bio && <p className="mt-6 border-t border-white/10 pt-5 text-sm text-kaafila-muted">{rider.bio}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-kaafila-bg p-4">
            <span className="text-xs uppercase text-kaafila-muted">Verified Distance</span>
            <p className="mt-1 font-mono text-2xl font-bold text-kaafila-yellow">
              {Number(rider.verifiedKilometres || 0).toLocaleString('en-IN')} km
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-kaafila-bg p-4">
            <span className="text-xs uppercase text-kaafila-muted">Completed Expeditions</span>
            <p className="mt-1 font-mono text-2xl font-bold text-kaafila-text">
              {rider.completedExpeditions || 0}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-kaafila-bg p-4">
            <span className="text-xs uppercase text-kaafila-muted">Next Rank Progress</span>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-kaafila-yellow transition-all"
                style={{ width: `${tierProgress?.kmProgressPercent || 0}%` }}
              />
            </div>
            <p className="mt-1.5 font-mono text-[11px] text-kaafila-muted">
              {tierProgress?.nextTier
                ? `${tierProgress.remainingKm} km to ${tierProgress.nextTier.name}`
                : 'Top KAAFILA Tier Achieved'}
            </p>
          </div>
        </div>

        {rider.badges?.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {rider.badges.map((badge) => (
              <span
                key={badge.code || badge.title || badge.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-kaafila-yellow/35 bg-kaafila-yellow/10 px-3 py-1 text-xs font-semibold text-kaafila-yellow"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {badge.title || badge.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {publicRouteSummaries.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-2xl font-bold uppercase text-kaafila-text">
            Shared Route Summaries
          </h2>
          <p className="mt-1 text-xs text-kaafila-muted">
            Privacy-coarsened route previews opted in by this rider (start/end locations trimmed).
          </p>
          <div className="mt-4 grid gap-4">
            {publicRouteSummaries.slice(0, 2).map((summary) => (
              <div
                key={summary._id}
                className="rounded-2xl border border-white/10 bg-kaafila-surface p-4"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-display text-lg font-bold text-kaafila-text">
                    {summary.title}
                  </span>
                  <span className="font-mono text-kaafila-yellow">
                    {Number(summary.verifiedDistanceKm || 0).toFixed(1)} km verified
                  </span>
                </div>
                <KaafilaMap
                  route={{
                    geometry: {
                      type: 'LineString',
                      coordinates: summary.simplifiedPublicRoute,
                    },
                  }}
                  heightClass="h-[240px]"
                  showLegend={false}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-display text-2xl font-bold uppercase text-kaafila-text">
          Verified Expedition History
        </h2>
        {expeditions.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-kaafila-surface p-8 text-center text-sm text-kaafila-muted">
            No confirmed or completed expeditions recorded on KAAFILA yet.
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {expeditions.map((entry) => (
              <Link
                key={entry._id}
                to={`/rides/${entry.ride.slug}`}
                className="flex items-center gap-4 rounded-2xl border border-white/10 bg-kaafila-surface p-4 hover:border-kaafila-yellow/50 transition"
              >
                <img
                  src={entry.ride.coverImageUrl || entry.ride.bannerImageUrl || '/images/expedition-ladakh.png'}
                  alt={entry.ride.title}
                  className="h-16 w-24 rounded-xl object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-bold text-kaafila-text">
                    {entry.ride.title}
                  </p>
                  <p className="text-xs text-kaafila-muted">{entry.ride.region}</p>
                  <span className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-kaafila-yellow">
                    <Calendar className="h-3 w-3" />
                    {entry.ride.startDate ? new Date(entry.ride.startDate).toLocaleDateString() : 'Completed'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

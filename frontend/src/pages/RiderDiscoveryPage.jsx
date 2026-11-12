import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  MapPin,
  Bike,
  Award,
  UserPlus,
  UserCheck,
  Clock,
  MessageSquare,
  X,
  Compass,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';

const EXPERIENCE_OPTIONS = [
  { value: 'all', label: 'All Experience Levels' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'experienced', label: 'Experienced' },
  { value: 'veteran', label: 'Veteran' },
];

const RANK_OPTIONS = ['all', 'Beginner', 'Trail Rider', 'Road Captain', 'Himalayan Veteran'];

export default function RiderDiscoveryPage() {
  const { user, isAuthenticated } = useAuth();
  const { isUserOnline } = useSocket();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [riders, setRiders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [motorcycle, setMotorcycle] = useState('');
  const [experience, setExperience] = useState('all');
  const [rank, setRank] = useState('all');
  const [page, setPage] = useState(1);

  const loadRiders = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/riders', {
        params: {
          search: search.trim() || undefined,
          city: city.trim() || undefined,
          motorcycle: motorcycle.trim() || undefined,
          experience: experience !== 'all' ? experience : undefined,
          rank: rank !== 'all' ? rank : undefined,
          excludeSelf: isAuthenticated ? 'true' : undefined,
          page,
          limit: 12,
        },
      });
      setRiders(data?.data || []);
      setPagination(data?.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not load riders.', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, city, motorcycle, experience, rank, page, isAuthenticated, showToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadRiders();
    }, 200);
    return () => clearTimeout(timer);
  }, [loadRiders]);

  const handleSendRequest = async (rider) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (user?.role !== 'rider') {
      showToast('Only rider accounts can send rider connection requests.', 'info');
      return;
    }
    setActionLoadingId(rider.userId);
    try {
      const { data } = await api.post(`/connections/request/${rider.userId}`);
      showToast(data?.message || 'Connection request sent.', 'success');
      setRiders((prev) =>
        prev.map((r) =>
          r.userId === rider.userId
            ? { ...r, connectionStatus: 'pending_sent', connectionId: data?.data?._id }
            : r
        )
      );
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not send request.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelRequest = async (rider) => {
    if (!rider.connectionId) return;
    setActionLoadingId(rider.userId);
    try {
      await api.delete(`/connections/${rider.connectionId}`);
      showToast('Connection request cancelled.', 'info');
      setRiders((prev) =>
        prev.map((r) =>
          r.userId === rider.userId
            ? { ...r, connectionStatus: 'none', connectionId: null }
            : r
        )
      );
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not cancel request.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAcceptRequest = async (rider) => {
    if (!rider.connectionId) return;
    setActionLoadingId(rider.userId);
    try {
      await api.put(`/connections/${rider.connectionId}/accept`);
      showToast(`Connected with ${rider.fullName}.`, 'success');
      setRiders((prev) =>
        prev.map((r) =>
          r.userId === rider.userId ? { ...r, connectionStatus: 'accepted' } : r
        )
      );
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not accept request.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleStartMessage = async (rider) => {
    setActionLoadingId(rider.userId);
    try {
      const { data } = await api.post(`/messages/conversations/${rider.userId}`);
      navigate(`/community/messages/${data.data._id}`);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not open conversation.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setCity('');
    setMotorcycle('');
    setExperience('all');
    setRank('all');
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-kaafila-bg pb-20 pt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-kaafila-primary/20 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <Link
              to="/community"
              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-kaafila-accent hover:underline"
            >
              <Compass className="h-3.5 w-3.5" />
              Community Hub
            </Link>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-wide text-kaafila-text sm:text-4xl">
              Rider Discovery
            </h1>
            <p className="mt-1 text-sm text-kaafila-muted">
              Browse riders who chose public visibility. Private contact details remain protected.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {user?.role === 'rider' && (
              <Link
                to="/community/connections"
                className="inline-flex items-center gap-2 rounded-xl border border-kaafila-primary/40 bg-kaafila-primary/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-kaafila-accent hover:bg-kaafila-primary/20 transition"
              >
                <UserPlus className="h-4 w-4" />
                My Connections
              </Link>
            )}
            <Link
              to="/community/groups"
              className="inline-flex items-center gap-2 rounded-xl border border-kaafila-border bg-kaafila-surface px-4 py-2 text-xs font-semibold uppercase tracking-wider text-kaafila-text hover:border-kaafila-primary/40 transition"
            >
              Explore Groups
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-6 rounded-2xl border border-kaafila-border bg-kaafila-surface p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-kaafila-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by rider name, @handle, city or bike..."
                className="w-full rounded-xl border border-kaafila-border bg-kaafila-bg py-2.5 pl-9 pr-3 text-sm text-kaafila-text placeholder:text-kaafila-muted/60 outline-none focus:border-kaafila-primary"
              />
            </div>

            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-kaafila-muted" />
              <input
                type="text"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setPage(1);
                }}
                placeholder="Filter by city (e.g. Pune)"
                className="w-full rounded-xl border border-kaafila-border bg-kaafila-bg py-2.5 pl-9 pr-3 text-sm text-kaafila-text placeholder:text-kaafila-muted/60 outline-none focus:border-kaafila-primary"
              />
            </div>

            <div className="relative">
              <Bike className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-kaafila-muted" />
              <input
                type="text"
                value={motorcycle}
                onChange={(e) => {
                  setMotorcycle(e.target.value);
                  setPage(1);
                }}
                placeholder="Motorcycle (e.g. Himalayan)"
                className="w-full rounded-xl border border-kaafila-border bg-kaafila-bg py-2.5 pl-9 pr-3 text-sm text-kaafila-text placeholder:text-kaafila-muted/60 outline-none focus:border-kaafila-primary"
              />
            </div>

            <select
              value={experience}
              onChange={(e) => {
                setExperience(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by riding experience"
              className="w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-3 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
            >
              {EXPERIENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-kaafila-muted">Rank:</span>
              {RANK_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setRank(r);
                    setPage(1);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    rank === r
                      ? 'bg-kaafila-primary text-kaafila-dark font-bold'
                      : 'border border-kaafila-border bg-kaafila-bg text-kaafila-muted hover:text-kaafila-text'
                  }`}
                >
                  {r === 'all' ? 'All Ranks' : r}
                </button>
              ))}
            </div>

            {(search || city || motorcycle || experience !== 'all' || rank !== 'all') && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-xs font-medium text-kaafila-accent hover:underline"
              >
                <X className="h-3.5 w-3.5" />
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="mt-4 flex items-center justify-between text-xs text-kaafila-muted">
          <span>{loading ? 'Searching riders...' : `${pagination.total} public rider(s) found`}</span>
        </div>

        {loading ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div
                key={idx}
                className="h-64 animate-pulse rounded-2xl border border-kaafila-border bg-kaafila-surface/60"
              />
            ))}
          </div>
        ) : riders.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-kaafila-border bg-kaafila-surface p-10 text-center">
            <Compass className="mx-auto h-10 w-10 text-kaafila-accent/70" />
            <h2 className="mt-3 font-display text-xl font-bold text-kaafila-text">
              No Matching Riders Found
            </h2>
            <p className="mt-1 text-sm text-kaafila-muted">
              Try clearing your search or widening your city/motorcycle filters.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 rounded-xl bg-kaafila-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-kaafila-dark"
            >
              Show All Public Riders
            </button>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {riders.map((rider) => {
              const online = isUserOnline(rider.userId);
              const busy = actionLoadingId === rider.userId;

              return (
                <article
                  key={rider._id}
                  className="flex min-w-0 flex-col justify-between rounded-2xl border border-kaafila-border bg-kaafila-surface p-5 transition hover:border-kaafila-primary/40"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <Link to={`/riders/${rider.handle}`} className="flex min-w-0 flex-1 items-center gap-3.5 group">
                        <div className="relative h-14 w-14 shrink-0">
                          {rider.avatarUrl ? (
                            <img
                              src={rider.avatarUrl}
                              alt={rider.fullName}
                              className="h-14 w-14 rounded-full border border-kaafila-primary/40 object-cover"
                            />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-kaafila-primary/40 bg-kaafila-bg font-display text-xl font-bold text-kaafila-accent">
                              {rider.fullName?.charAt(0)?.toUpperCase() || 'R'}
                            </div>
                          )}
                          {online && (
                            <span
                              title="Online now"
                              className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-kaafila-surface bg-emerald-400"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-display text-xl font-bold text-kaafila-text group-hover:text-kaafila-accent transition">
                            {rider.fullName}
                          </h3>
                          <p className="truncate text-xs font-mono text-kaafila-accent/80">
                            @{rider.handle}
                          </p>
                        </div>
                      </Link>

                      {rider.isDemo && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-kaafila-primary/30 bg-kaafila-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-kaafila-accent">
                          <ShieldAlert className="h-3 w-3" />
                          Demo
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-lg border border-kaafila-primary/30 bg-kaafila-primary/10 px-2.5 py-1 font-semibold text-kaafila-accent">
                        <Award className="h-3.5 w-3.5" />
                        {rider.rank}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg border border-kaafila-border bg-kaafila-bg px-2.5 py-1 capitalize text-kaafila-muted">
                        {rider.ridingExperience || 'intermediate'}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg border border-kaafila-border bg-kaafila-bg px-2.5 py-1 text-kaafila-text">
                        {(rider.verifiedKilometres || 0).toLocaleString()} km
                      </span>
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs text-kaafila-muted">
                      {rider.homeCity && (
                        <p className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-kaafila-accent/80" />
                          <span className="truncate">{rider.homeCity}</span>
                        </p>
                      )}
                      {rider.primaryMotorcycle && (
                        <p className="flex items-center gap-1.5">
                          <Bike className="h-3.5 w-3.5 text-kaafila-accent/80" />
                          <span className="truncate">{rider.primaryMotorcycle}</span>
                        </p>
                      )}
                    </div>

                    {rider.bio && (
                      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-kaafila-muted/90">
                        {rider.bio}
                      </p>
                    )}
                  </div>

                  <div className="mt-5 flex items-center gap-2 border-t border-kaafila-border pt-4">
                    <Link
                      to={`/riders/${rider.handle}`}
                      className="flex-1 rounded-xl border border-kaafila-border bg-kaafila-bg px-3 py-2 text-center text-xs font-semibold text-kaafila-text hover:border-kaafila-primary/40 transition"
                    >
                      View Profile
                    </Link>

                    {rider.connectionStatus === 'accepted' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleStartMessage(rider)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-kaafila-primary px-3 py-2 text-xs font-bold text-kaafila-dark hover:bg-kaafila-primary-hover transition disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                        Message
                      </button>
                    ) : rider.connectionStatus === 'pending_sent' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleCancelRequest(rider)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-kaafila-primary/40 bg-kaafila-primary/10 px-3 py-2 text-xs font-semibold text-kaafila-accent hover:bg-red-500/15 hover:border-red-500/40 hover:text-red-700 transition disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                        Requested
                      </button>
                    ) : rider.connectionStatus === 'pending_received' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAcceptRequest(rider)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-400 transition disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                        Accept
                      </button>
                    ) : rider.connectionStatus !== 'self' && (!isAuthenticated || user?.role === 'rider') ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleSendRequest(rider)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-kaafila-primary px-3 py-2 text-xs font-bold text-kaafila-dark hover:bg-kaafila-primary-hover transition disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                        Connect
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-xl border border-kaafila-border px-4 py-2 text-xs font-semibold text-kaafila-text disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-kaafila-muted">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-xl border border-kaafila-border px-4 py-2 text-xs font-semibold text-kaafila-text disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


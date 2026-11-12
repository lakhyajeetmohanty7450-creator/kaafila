import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Building2, Calendar, Compass, Crown, Loader2, Medal, Trophy } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const TABS = [
  { key: 'global', label: 'Global Leaderboard', icon: Trophy },
  { key: 'monthly', label: 'Monthly Distance', icon: Calendar },
  { key: 'organisation', label: 'By Organisation', icon: Building2 },
  { key: 'expedition', label: 'By Expedition', icon: Compass },
];

export default function LeaderboardsPage() {
  const { isAuthenticated, user } = useAuth();

  const [category, setCategory] = useState('global');
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const [organisations, setOrganisations] = useState([]);
  const [rides, setRides] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [selectedRideId, setSelectedRideId] = useState('');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/organisations', { params: { limit: 30 } }).catch(() => ({ data: { data: [] } })),
      api.get('/rides', { params: { status: 'active', limit: 30 } }).catch(() => ({ data: { data: [] } })),
    ]).then(([orgRes, rideRes]) => {
      const orgList = orgRes.data?.data || [];
      const rideList = rideRes.data?.data || [];
      setOrganisations(orgList);
      setRides(rideList);
      if (orgList.length > 0) setSelectedOrgId(orgList[0]._id);
      if (rideList.length > 0) setSelectedRideId(rideList[0]._id);
    });
  }, []);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = { category, limit: 25 };
      if (category === 'monthly') params.period = period;
      if (category === 'organisation' && selectedOrgId) params.organisationId = selectedOrgId;
      if (category === 'expedition' && selectedRideId) params.rideId = selectedRideId;

      const res = await api.get('/leaderboards', { params });
      setData(res.data?.data || null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [category, period, selectedOrgId, selectedRideId]);

  useEffect(() => {
    if (category === 'organisation' && !selectedOrgId) return;
    if (category === 'expedition' && !selectedRideId) return;
    loadLeaderboard();
  }, [category, selectedOrgId, selectedRideId, loadLeaderboard]);

  const entries = data?.entries || [];
  const myEntry = data?.myEntry;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] text-kaafila-yellow">
            <Trophy className="h-4 w-4" />
            Verified Rider Standings
          </span>
          <h1 className="mt-1.5 font-display text-3xl font-bold uppercase text-kaafila-text sm:text-4xl">
            KAAFILA Leaderboards
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-kaafila-muted">
            Rankings computed exclusively from server-verified kilometres, completed expeditions, and public rider profiles.
          </p>
        </div>

        {isAuthenticated && user?.role === 'rider' && (
          <Link
            to="/dashboard/rider/stats"
            className="inline-flex items-center gap-2 rounded-xl border border-kaafila-yellow/40 bg-kaafila-surface px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-yellow hover:bg-kaafila-yellow/10 transition"
          >
            <Award className="h-4 w-4" />
            My Badges & Rank
          </Link>
        )}
      </div>

      {/* Category Tabs */}
      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = category === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setCategory(t.key)}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
                active
                  ? 'border-kaafila-yellow bg-kaafila-yellow text-kaafila-bg shadow-amber'
                  : 'border-white/10 bg-kaafila-surface text-kaafila-text/80 hover:border-kaafila-yellow/40'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Conditional Sub-Filters */}
      {category === 'monthly' && (
        <div className="mt-4 flex items-center gap-3">
          <label htmlFor="lb-month" className="font-mono text-xs uppercase text-kaafila-muted">
            Month:
          </label>
          <input
            id="lb-month"
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-xl border border-white/15 bg-kaafila-surface px-3 py-2 font-mono text-xs text-kaafila-text outline-none focus:border-kaafila-yellow"
          />
        </div>
      )}

      {category === 'organisation' && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor="lb-org" className="font-mono text-xs uppercase text-kaafila-muted">
            Organisation:
          </label>
          <select
            id="lb-org"
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            className="rounded-xl border border-white/15 bg-kaafila-surface px-3.5 py-2 text-xs text-kaafila-text outline-none focus:border-kaafila-yellow"
          >
            {organisations.map((org) => (
              <option key={org._id} value={org._id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {category === 'expedition' && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor="lb-ride" className="font-mono text-xs uppercase text-kaafila-muted">
            Expedition:
          </label>
          <select
            id="lb-ride"
            value={selectedRideId}
            onChange={(e) => setSelectedRideId(e.target.value)}
            className="rounded-xl border border-white/15 bg-kaafila-surface px-3.5 py-2 text-xs text-kaafila-text outline-none focus:border-kaafila-yellow"
          >
            {rides.map((r) => (
              <option key={r._id} value={r._id}>
                {r.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Authenticated Rider Standing Spotlight */}
      {myEntry && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-kaafila-yellow/40 bg-gradient-to-r from-kaafila-surface to-kaafila-bg p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-kaafila-yellow font-display text-lg font-bold text-kaafila-bg">
              #{myEntry.position}
            </div>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-kaafila-yellow">
                Your Current Standing
              </span>
              <p className="font-display text-lg font-bold text-kaafila-text">
                {myEntry.fullName} · {myEntry.rank}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6 font-mono text-sm">
            <div>
              <span className="block text-[10px] uppercase text-kaafila-muted">Verified KM</span>
              <span className="font-bold text-kaafila-yellow">
                {Number(myEntry.verifiedKilometres || 0).toLocaleString('en-IN')} km
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase text-kaafila-muted">Expeditions</span>
              <span className="font-bold text-kaafila-text">{myEntry.completedExpeditions}</span>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard List */}
      <div className="mt-6">
        {loading ? (
          <div className="flex h-52 items-center justify-center rounded-3xl border border-white/10 bg-kaafila-surface">
            <Loader2 className="h-7 w-7 animate-spin text-kaafila-yellow" />
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-kaafila-surface p-10 text-center">
            <Medal className="mx-auto h-9 w-9 text-kaafila-yellow/70" />
            <p className="mt-3 font-display text-xl font-bold uppercase text-kaafila-text">
              No Ranked Entries Yet
            </p>
            <p className="mt-1 text-xs text-kaafila-muted">
              Verified GPS rides or completed expeditions matching this filter will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((row) => (
              <Link
                key={row.userId}
                to={`/riders/${row.handle}`}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-kaafila-surface p-4 hover:border-kaafila-yellow/45 transition"
              >
                <div className="flex min-w-0 items-center gap-3.5">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-base font-bold ${
                      row.position === 1
                        ? 'bg-kaafila-yellow text-kaafila-bg shadow-amber'
                        : row.position === 2
                          ? 'bg-slate-300 text-kaafila-bg'
                          : row.position === 3
                            ? 'bg-amber-700 text-white'
                            : 'border border-white/15 bg-kaafila-bg text-kaafila-text'
                    }`}
                  >
                    {row.position === 1 ? <Crown className="h-5 w-5" /> : `#${row.position}`}
                  </div>

                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-kaafila-yellow/35 bg-kaafila-bg">
                    {row.avatarUrl ? (
                      <img src={row.avatarUrl} alt={row.fullName} className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-display text-lg font-bold text-kaafila-yellow">
                        {row.fullName?.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-display text-lg font-bold text-kaafila-text">
                        {row.fullName}
                      </p>
                      <span className="rounded-full border border-kaafila-yellow/35 bg-kaafila-yellow/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-kaafila-yellow">
                        {row.rank}
                      </span>
                      {row.isDemo && (
                        <span className="rounded bg-kaafila-earth/70 px-1.5 py-0.5 font-mono text-[10px] uppercase text-kaafila-text">
                          Demo
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-kaafila-muted">
                      @{row.handle} {row.homeCity ? `· ${row.homeCity}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6 font-mono text-xs sm:text-sm">
                  <div className="text-right">
                    <span className="block text-[10px] uppercase text-kaafila-muted">Verified KM</span>
                    <span className="font-bold text-kaafila-yellow">
                      {Number(row.verifiedKilometres || 0).toLocaleString('en-IN')} km
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] uppercase text-kaafila-muted">Expeditions</span>
                    <span className="font-bold text-kaafila-text">{row.completedExpeditions}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


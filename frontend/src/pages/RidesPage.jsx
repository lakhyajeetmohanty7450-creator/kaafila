import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import api from '../api/client';
import ExpeditionCard from '../components/ExpeditionCard';
import DemoNoticeBanner from '../components/DemoNoticeBanner';

export default function RidesPage() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [difficulty, setDifficulty] = useState('all');
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadRides() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set('search', search.trim());
        if (difficulty !== 'all') params.set('difficulty', difficulty);
        const { data } = await api.get(`/rides?${params.toString()}`);
        if (active) setRides(data?.data || []);
      } catch (err) {
        if (active) setError(err.response?.data?.message || 'Unable to load expeditions right now.');
      } finally {
        if (active) setLoading(false);
      }
    }
    const t = setTimeout(loadRides, 200);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [search, difficulty]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="border-b border-white/10 pb-6">
        <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-kaafila-yellow">
          Expedition Departures
        </span>
        <h1 className="mt-1 font-display text-4xl font-bold uppercase text-kaafila-text sm:text-5xl">
          Explore Motorcycle Expeditions
        </h1>
      </div>

      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-kaafila-yellow/25 bg-kaafila-surface p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-kaafila-yellow" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search passes, Leh, Spiti, Zuluk..."
            className="w-full rounded-xl border border-white/10 bg-kaafila-bg py-2.5 pl-10 pr-4 text-sm text-kaafila-text focus:border-kaafila-yellow focus:outline-none"
          />
        </div>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className="rounded-xl border border-white/10 bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text focus:border-kaafila-yellow focus:outline-none"
        >
          <option value="all">All Difficulties</option>
          <option value="moderate">Moderate</option>
          <option value="challenging">Challenging</option>
          <option value="extreme">Extreme</option>
        </select>
      </div>

      <div className="mt-6">
        <DemoNoticeBanner />
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
      )}

      {loading ? (
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-96 animate-pulse rounded-2xl bg-kaafila-surface" />
          ))}
        </div>
      ) : rides.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-white/10 bg-kaafila-surface p-10 text-center text-kaafila-muted">
          No expeditions match your search criteria.
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {rides.map((ride) => (
            <ExpeditionCard key={ride._id} ride={ride} />
          ))}
        </div>
      )}
    </div>
  );
}


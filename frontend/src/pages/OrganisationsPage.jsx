import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, SlidersHorizontal, BadgeCheck, Building2 } from 'lucide-react';
import api from '../api/client';
import OrganisationCard from '../components/OrganisationCard';
import DemoNoticeBanner from '../components/DemoNoticeBanner';

const REGIONS = ['all', 'Ladakh', 'Spiti Valley', 'Sikkim', 'Zanskar', 'Garhwal'];

export default function OrganisationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [region, setRegion] = useState(searchParams.get('location') || searchParams.get('region') || 'all');
  const [verifiedOnly, setVerifiedOnly] = useState(searchParams.get('verified') === 'true');
  const [sort, setSort] = useState('featured');
  const [organisations, setOrganisations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const paramSearch = searchParams.get('search') || '';
    const paramLoc = searchParams.get('location') || searchParams.get('region') || 'all';
    setSearch(paramSearch);
    setRegion(paramLoc);
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    async function loadOrgs() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set('search', search.trim());
        if (region !== 'all') params.set('location', region);
        if (verifiedOnly) params.set('verified', 'true');
        params.set('sort', sort);

        const { data } = await api.get(`/organisations?${params.toString()}`);
        if (active) {
          setOrganisations(data?.data || []);
        }
      } catch (err) {
        if (active) {
          setError(err.response?.data?.message || 'Unable to load organisations right now.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    const timer = setTimeout(loadOrgs, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, region, verifiedOnly, sort]);

  const handleSearchChange = (value) => {
    setSearch(value);
    const nextParams = new URLSearchParams(searchParams);
    if (value.trim()) nextParams.set('search', value);
    else nextParams.delete('search');
    setSearchParams(nextParams, { replace: true });
  };

  const handleRegionChange = (nextRegion) => {
    setRegion(nextRegion);
    const nextParams = new URLSearchParams();
    if (search.trim()) nextParams.set('search', search.trim());
    if (nextRegion !== 'all') nextParams.set('location', nextRegion);
    if (verifiedOnly) nextParams.set('verified', 'true');
    setSearchParams(nextParams, { replace: true });
  };

  const handleResetFilters = () => {
    setSearch('');
    setRegion('all');
    setVerifiedOnly(false);
    setSearchParams({}, { replace: true });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-6 border-b border-white/10 pb-8 md:flex-row md:items-end">
        <div>
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-kaafila-yellow">
            KAAFILA Marketplace
          </span>
          <h1 className="mt-1 font-display text-4xl font-bold uppercase text-kaafila-text sm:text-5xl">
            Motorcycle Touring Organisations
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-kaafila-muted">
            Discover and compare Himalayan expedition operators—inspect medical backup, motorcycle fleets, and
            itineraries before booking directly on their official website.
          </p>
        </div>

        <Link
          to="/register?role=organisation"
          className="inline-flex items-center gap-2 self-start rounded-xl border border-kaafila-yellow/50 bg-kaafila-yellow/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-yellow hover:bg-kaafila-yellow hover:text-kaafila-bg transition"
        >
          <Building2 className="h-4 w-4" />
          <span>List Your Organisation</span>
        </Link>
      </div>

      {/* Filter & Search Bar */}
      <div className="mt-8 rounded-2xl border border-kaafila-yellow/25 bg-kaafila-surface p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="relative lg:col-span-5">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-kaafila-yellow" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by organisation, Leh, Manali, Spiti..."
              className="w-full rounded-xl border border-white/10 bg-kaafila-bg py-2.5 pl-10 pr-4 text-sm text-kaafila-text placeholder:text-kaafila-muted focus:border-kaafila-yellow focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:col-span-5">
            {REGIONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleRegionChange(item)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  region === item
                    ? 'bg-kaafila-yellow text-kaafila-bg'
                    : 'border border-white/10 bg-kaafila-bg text-kaafila-muted hover:border-kaafila-yellow/40 hover:text-kaafila-text'
                }`}
              >
                {item === 'all' ? 'All Regions' : item}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 lg:col-span-2 lg:justify-end">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort organisations"
              className="rounded-xl border border-white/10 bg-kaafila-bg px-3 py-2.5 text-xs font-medium text-kaafila-text focus:border-kaafila-yellow focus:outline-none"
            >
              <option value="featured">Sort: Featured</option>
              <option value="rides">Most Expeditions</option>
              <option value="rating">Highest Rated</option>
              <option value="newest">Newest</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setVerifiedOnly((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              verifiedOnly
                ? 'border-kaafila-yellow bg-kaafila-yellow/15 text-kaafila-yellow'
                : 'border-white/10 bg-kaafila-bg text-kaafila-muted hover:text-kaafila-text'
            }`}
          >
            <BadgeCheck className="h-4 w-4" />
            <span>Verified Outfits Only</span>
          </button>

          <span className="flex items-center gap-1.5 font-mono text-xs text-kaafila-muted">
            <SlidersHorizontal className="h-3.5 w-3.5 text-kaafila-yellow" />
            {organisations.length} {organisations.length === 1 ? 'organisation' : 'organisations'} shown
          </span>
        </div>
      </div>

      <div className="mt-6">
        <DemoNoticeBanner />
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
      )}

      {loading ? (
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-96 animate-pulse rounded-2xl border border-white/10 bg-kaafila-surface" />
          ))}
        </div>
      ) : organisations.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-white/10 bg-kaafila-surface p-12 text-center">
          <p className="font-display text-2xl text-kaafila-text">No matching touring organisations found</p>
          <p className="mt-2 text-sm text-kaafila-muted">
            Try clearing your search filter or exploring all Himalayan regions.
          </p>
          <button
            type="button"
            onClick={handleResetFilters}
            className="mt-5 rounded-xl bg-kaafila-yellow px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-bg"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {organisations.map((org) => (
            <OrganisationCard key={org._id} org={org} />
          ))}
        </div>
      )}
    </div>
  );
}


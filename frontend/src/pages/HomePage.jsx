import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  Compass,
  ShieldCheck,
  MapPin,
  Bike,
  ArrowRight,
  Mountain,
  Building2,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import api from '../api/client';
import OrganisationCard from '../components/OrganisationCard';
import ExpeditionCard from '../components/ExpeditionCard';
import DemoNoticeBanner from '../components/DemoNoticeBanner';

const POPULAR_DESTINATIONS = [
  {
    name: 'Ladakh & Umling La',
    regionQuery: 'Ladakh',
    altitude: '5,798m',
    passes: 'Khardung La · Chang La · Umling La',
    image: '/images/expedition-ladakh.png',
  },
  {
    name: 'Spiti Valley Circuit',
    regionQuery: 'Spiti Valley',
    altitude: '4,590m',
    passes: 'Kunzum La · Nako · Key Monastery',
    image: '/images/expedition-spiti.png',
  },
  {
    name: 'Sikkim & Old Silk Route',
    regionQuery: 'Sikkim',
    altitude: '5,180m',
    passes: 'Zuluk Loops · Nathu La · Gurudongmar',
    image: '/images/community-camp.png',
  },
  {
    name: 'Zanskar & Shinku La',
    regionQuery: 'Zanskar',
    altitude: '5,091m',
    passes: 'Shinku La · Pensi La · Padum',
    image: '/images/hero-himalaya.png',
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTarget, setSearchTarget] = useState('organisations');
  const [organisations, setOrganisations] = useState([]);
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadHomeData() {
      try {
        const [orgsRes, ridesRes] = await Promise.all([
          api.get('/organisations?limit=4'),
          api.get('/rides?featured=true&limit=3'),
        ]);
        if (!active) return;
        setOrganisations(orgsRes.data?.data || []);
        setRides(ridesRes.data?.data || []);
      } catch (err) {
        if (active) {
          setError(err.response?.data?.message || 'Unable to load marketplace data right now.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    loadHomeData();
    return () => {
      active = false;
    };
  }, []);

  const handleHeroSearch = (e) => {
    e.preventDefault();
    const q = encodeURIComponent(searchQuery.trim());
    if (searchTarget === 'rides') {
      navigate(q ? `/rides?search=${q}` : '/rides');
    } else {
      navigate(q ? `/organisations?search=${q}` : '/organisations');
    }
  };

  return (
    <div>
      {/* 1. CINEMATIC HERO SECTION */}
      <section className="relative overflow-hidden border-b border-kaafila-border bg-kaafila-bg">
        <div className="absolute inset-0">
          <img
            src="/images/hero-himalaya.png"
            alt="Himalayan motorcycle expedition convoy across mountain passes"
            className="h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#EAF7F8]/90 via-[#EAF7F8]/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#EAF7F8]/70 via-transparent to-[#EAF7F8]/25" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-20 sm:px-6 lg:px-8 lg:pb-28 lg:pt-28">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#111827]/15 bg-white/80 px-3.5 py-1.5 backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-kaafila-coral" />
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#111827]">
                Centralised Motorcycle Touring Marketplace
              </span>
            </div>

            <h1 className="mt-6 font-display text-4xl font-extrabold uppercase leading-[1.02] tracking-tight text-[#111827] sm:text-6xl lg:text-7xl">
              Ride Together.
              <span className="block font-serif italic font-semibold text-[#111827]">
                Explore Further.
              </span>
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#111827] sm:text-lg">
              Discover motorcycle touring organisations across the Himalayas, compare expedition itineraries,
              accommodation, food, bike rentals, and emergency support side-by-side, and book directly on each
              organisation&apos;s official website.
            </p>

            {/* Translucent Floating Search Panel */}
            <form
              onSubmit={handleHeroSearch}
              className="mt-8 rounded-2xl border border-[#111827]/15 bg-white/85 p-2 shadow-card backdrop-blur-md"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex rounded-xl bg-[#111827]/5 p-1 sm:shrink-0">
                  <button
                    type="button"
                    onClick={() => setSearchTarget('organisations')}
                    className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider transition ${
                      searchTarget === 'organisations'
                        ? 'bg-kaafila-primary text-[#111827]'
                        : 'text-[#111827]/75 hover:text-[#111827]'
                    }`}
                  >
                    Organisations
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchTarget('rides')}
                    className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider transition ${
                      searchTarget === 'rides'
                        ? 'bg-kaafila-primary text-[#111827]'
                        : 'text-[#111827]/75 hover:text-[#111827]'
                    }`}
                  >
                    Expeditions
                  </button>
                </div>

                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#111827]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={
                      searchTarget === 'organisations'
                        ? 'Search outfits by name, Leh, Manali, Spiti, Sikkim...'
                        : 'Search expeditions by pass, Ladakh, Umling La, Spiti...'
                    }
                    className="w-full rounded-xl bg-transparent py-3 pl-10 pr-4 text-sm text-[#111827] placeholder:text-[#111827]/60 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-kaafila-primary px-6 py-3 text-sm font-bold uppercase tracking-wider text-[#111827] transition hover:bg-kaafila-primary-hover"
                >
                  <span>Search</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>

            {/* Quick Value Strip */}
            <div className="mt-8 flex flex-wrap gap-8 border-t border-[#111827]/15 pt-6 font-mono text-xs text-[#111827]">
              <div>
                <span className="block font-display text-xl font-extrabold tracking-tight text-[#111827]">100%</span>
                <span>Direct Official Booking Links</span>
              </div>
              <div>
                <span className="block font-display text-xl font-extrabold tracking-tight text-[#111827]">TRANSPARENT</span>
                <span>Side-by-Side Safety &amp; Facilities</span>
              </div>
              <div>
                <span className="block font-display text-xl font-extrabold tracking-tight text-[#111827]">5,798m</span>
                <span>High-Altitude Pass Circuits</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. FEATURED ORGANISATIONS MARKETPLACE */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-kaafila-accent">
              The Marketplace
            </span>
            <h2 className="mt-1 font-display text-3xl font-extrabold uppercase text-kaafila-text sm:text-4xl">
              Featured Touring <span className="font-serif italic font-semibold text-kaafila-accent">Organisations</span>
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-kaafila-muted">
              Compare expedition fleets, oxygen &amp; 4x4 backup standards, accommodation quality, and complete your
              booking directly on each operator&apos;s official website.
            </p>
          </div>
          <Link
            to="/organisations"
            className="inline-flex items-center gap-2 self-start rounded-xl border border-kaafila-royal/35 bg-kaafila-surface px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-royal hover:bg-kaafila-royal hover:text-white transition"
          >
            <span>All Organisations</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mb-8">
          <DemoNoticeBanner />
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-96 animate-pulse rounded-2xl border border-kaafila-border bg-kaafila-surface" />
            ))}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {organisations.map((org) => (
              <OrganisationCard key={org._id} org={org} />
            ))}
          </div>
        )}
      </section>

      <div className="himalayan-divider" />

      {/* 3. FEATURED MOTORCYCLE EXPEDITIONS */}
      <section className="topographic-overlay border-y border-kaafila-border bg-kaafila-aqua/65 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-kaafila-accent">
                Curated Departures
              </span>
              <h2 className="mt-1 font-display text-3xl font-extrabold uppercase text-kaafila-text sm:text-4xl">
                Featured Motorcycle <span className="font-serif italic font-semibold text-kaafila-accent">Expeditions</span>
              </h2>
            </div>
            <Link
              to="/rides"
              className="inline-flex items-center gap-2 self-start rounded-xl border border-kaafila-royal/35 bg-kaafila-surface px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-royal hover:bg-kaafila-royal hover:text-white transition"
            >
              <span>Browse All Expeditions</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {rides.map((ride) => (
              <ExpeditionCard key={ride._id} ride={ride} />
            ))}
          </div>
        </div>
      </section>

      {/* 4. POPULAR DESTINATIONS */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-10">
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-kaafila-accent">
            High-Altitude Corridors
          </span>
          <h2 className="mt-1 font-display text-3xl font-extrabold uppercase text-kaafila-text sm:text-4xl">
            Popular <span className="font-serif italic font-semibold text-kaafila-accent">Destinations</span>
          </h2>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {POPULAR_DESTINATIONS.map((dest) => (
            <Link
              key={dest.name}
              to={`/organisations?location=${encodeURIComponent(dest.regionQuery)}`}
              className="group relative h-64 overflow-hidden rounded-2xl border border-kaafila-primary/20 bg-kaafila-surface transition hover:border-kaafila-primary"
            >
              <img
                src={dest.image}
                alt={dest.name}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-kaafila-dark/90 via-kaafila-dark/35 to-transparent" />
              <div className="absolute right-3 top-3 rounded-md border border-kaafila-coral/45 bg-kaafila-dark/85 px-2.5 py-1 font-mono text-[11px] font-semibold text-kaafila-coral">
                <Mountain className="mr-1 inline h-3 w-3" />
                {dest.altitude}
              </div>
              <div className="absolute bottom-4 left-4 right-4">
                <h3 className="font-display text-2xl font-bold text-white group-hover:text-kaafila-primary transition">
                  {dest.name}
                </h3>
                <p className="mt-1 font-mono text-[11px] text-kaafila-aqua">{dest.passes}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 5. WHY KAAFILA SECTION */}
      <section className="border-y border-kaafila-border bg-kaafila-sand py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-kaafila-accent">
              Built For Expedition Riders
            </span>
            <h2 className="mt-1 font-display text-3xl font-extrabold uppercase text-kaafila-text sm:text-4xl">
              Why <span className="font-serif italic font-semibold text-kaafila-royal">KAAFILA</span>
            </h2>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Compass,
                title: 'Centralised Discovery',
                desc: 'Explore multiple Himalayan touring organisations, routes, inclusions, and pricing in one structured marketplace.',
              },
              {
                icon: ShieldCheck,
                title: 'Safety & Support Clarity',
                desc: 'Compare oxygen cylinders, 4x4 sweep vehicles, certified mechanics, accommodation, and meals upfront.',
              },
              {
                icon: Bike,
                title: 'Fleet & Itinerary Detail',
                desc: 'Inspect day-by-day altitudes, starting points, distances, and rental vs own-bike pricing before deciding.',
              },
              {
                icon: ExternalLink,
                title: 'Direct Official Booking',
                desc: 'Zero middleman confusion—every organisation links directly to their official booking website.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-2xl border border-kaafila-primary/20 bg-kaafila-surface/90 p-6 transition hover:border-kaafila-primary/60"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-kaafila-primary/40 bg-kaafila-primary/10 text-kaafila-accent">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-display text-xl font-semibold uppercase text-kaafila-text">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-kaafila-muted">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 6. ORGANISATION REGISTRATION CTA */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl border border-kaafila-border bg-kaafila-surface p-8 shadow-card sm:p-12">
          <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-kaafila-accent">
                <Building2 className="h-4 w-4 text-kaafila-coral" />
                For Touring Operators
              </span>
              <h2 className="mt-2 font-display text-3xl font-bold uppercase text-kaafila-text sm:text-4xl">
                Run Motorcycle Expeditions? List Your Organisation On KAAFILA.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-kaafila-muted sm:text-base">
                Showcase your expeditions, bike fleet, safety backup, and accommodation standards, and direct riders
                straight to your official booking website.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Link
                to="/register?role=organisation"
                className="rounded-xl bg-kaafila-primary px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-kaafila-dark shadow-blue hover:bg-kaafila-primary-hover transition"
              >
                Register Organisation
              </Link>
              <Link
                to="/organisations"
                className="rounded-xl border border-kaafila-royal/35 px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-kaafila-royal hover:bg-kaafila-royal hover:text-white transition"
              >
                Explore Marketplace
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

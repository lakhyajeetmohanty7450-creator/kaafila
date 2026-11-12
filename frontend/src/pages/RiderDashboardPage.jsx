import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  Activity,
  Award,
  BarChart3,
  Bike,
  Building2,
  Calendar,
  Compass,
  ExternalLink,
  History,
  LayoutDashboard,
  Lock,
  LogOut,
  MapPin,
  Menu,
  Navigation,
  Radio,
  Route,
  Settings,
  Shield,
  ShieldAlert,
  Trophy,
  User as UserIcon,
  X,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ImageUploadField from '../components/ImageUploadField';
import ConfirmModal from '../components/ConfirmModal';
import RiderTrackingPanel from '../components/RiderTrackingPanel';

const RIDER_NAV_ITEMS = [
  { key: 'overview', label: 'Overview', to: '/dashboard/rider', icon: LayoutDashboard },
  { key: 'profile', label: 'My Profile', to: '/dashboard/rider/profile', icon: UserIcon },
  { key: 'tracking', label: 'GPS Tracking', to: '/dashboard/rider/tracking', icon: Navigation },
  { key: 'history', label: 'Ride History', to: '/dashboard/rider/history', icon: History },
  { key: 'rides', label: 'My Rides', to: '/dashboard/rider/rides', icon: Bike },
  { key: 'upcoming', label: 'Upcoming Expeditions', to: '/dashboard/rider/upcoming', icon: Compass },
  { key: 'stats', label: 'Stats & Badges', to: '/dashboard/rider/stats', icon: BarChart3 },
  { key: 'settings', label: 'Account Settings', to: '/dashboard/rider/settings', icon: Settings },
];

function safeExternalUrl(url) {
  if (!url) return 'https://kaafila.in';
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : 'https://kaafila.in';
  } catch {
    return 'https://kaafila.in';
  }
}

export default function RiderDashboardPage({ section = 'overview' }) {
  const { user, loading: authLoading, isAuthenticated, logout, refreshUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [ridesFilter, setRidesFilter] = useState(section === 'upcoming' ? 'upcoming' : 'all');
  const [ridesData, setRidesData] = useState([]);
  const [ridesCounts, setRidesCounts] = useState({ all: 0, upcoming: 0, completed: 0, cancelled: 0 });
  const [ridesPage, setRidesPage] = useState(1);
  const [ridesTotalPages, setRidesTotalPages] = useState(1);
  const [ridesLoading, setRidesLoading] = useState(false);

  const [profileForm, setProfileForm] = useState({
    fullName: '',
    phoneNumber: '',
    homeCity: '',
    avatarUrl: '',
    bio: '',
    primaryMotorcycle: '',
    ridingExperience: 'beginner',
    isProfilePublic: true,
    emergencyContact: {
      name: '',
      relationship: '',
      phone: '',
      bloodGroup: '',
      shareWithOrganisers: false,
    },
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancellingRide, setCancellingRide] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/riders/me/dashboard');
      if (data?.success) {
        setDashboard(data.data);
        const u = data.data.user;
        const p = data.data.riderProfile;
        setProfileForm({
          fullName: u.fullName || '',
          phoneNumber: u.phoneNumber || '',
          homeCity: p.homeCity || u.city || '',
          avatarUrl: u.avatarUrl || '',
          bio: p.bio || '',
          primaryMotorcycle: p.primaryMotorcycle || '',
          ridingExperience: p.ridingExperience || 'beginner',
          isProfilePublic: p.isProfilePublic !== false,
          emergencyContact: {
            name: p.emergencyContact?.name || '',
            relationship: p.emergencyContact?.relationship || '',
            phone: p.emergencyContact?.phone || '',
            bloodGroup: p.emergencyContact?.bloodGroup || '',
            shareWithOrganisers: Boolean(p.emergencyContact?.shareWithOrganisers),
          },
        });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load rider dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRiderRides = useCallback(async (category, page = 1) => {
    setRidesLoading(true);
    try {
      const { data } = await api.get('/riders/me/rides', {
        params: { category, page, limit: 8 },
      });
      if (data?.success) {
        setRidesData(data.data || []);
        setRidesCounts(data.counts || { all: 0, upcoming: 0, completed: 0, cancelled: 0 });
        setRidesTotalPages(data.pagination?.totalPages || 1);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load rider expeditions.', 'error');
    } finally {
      setRidesLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isAuthenticated && user?.role === 'rider') {
      loadDashboard();
    }
  }, [isAuthenticated, user?.role, loadDashboard]);

  useEffect(() => {
    const nextFilter = section === 'upcoming' ? 'upcoming' : ridesFilter;
    if (section === 'upcoming' && ridesFilter !== 'upcoming') {
      setRidesFilter('upcoming');
    }
    if (isAuthenticated && user?.role === 'rider' && (section === 'rides' || section === 'upcoming')) {
      loadRiderRides(nextFilter, ridesPage);
    }
  }, [section, ridesFilter, ridesPage, isAuthenticated, user?.role, loadRiderRides]);

  if (authLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="h-64 animate-pulse rounded-3xl bg-kaafila-surface" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login?role=rider" replace />;
  }

  if (user?.role !== 'rider') {
    return <Navigate to={user?.role === 'organisation' ? '/dashboard/organisation' : '/account'} replace />;
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (profileForm.fullName.trim().length < 2) {
      showToast('Full name must be at least 2 characters.', 'error');
      return;
    }
    setSavingProfile(true);
    try {
      const { data } = await api.put('/riders/me/profile', profileForm);
      if (data?.success) {
        showToast('Rider profile updated successfully.', 'success');
        await Promise.all([loadDashboard(), refreshUser()]);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to save rider profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleConfirmCancelRide = async () => {
    if (!cancelTarget) return;
    setCancellingRide(true);
    try {
      await api.post(`/rides/${cancelTarget.ride._id}/participate`, {
        status: 'cancelled',
        bikeChoice: cancelTarget.bikeChoice || 'rental',
      });
      showToast('Expedition participation cancelled.', 'info');
      setCancelTarget(null);
      await Promise.all([loadDashboard(), loadRiderRides(ridesFilter, ridesPage)]);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to cancel expedition.', 'error');
    } finally {
      setCancellingRide(false);
    }
  };

  const handleLogout = () => {
    navigate('/', { replace: true });
    setTimeout(() => logout(), 0);
  };

  const u = dashboard?.user || user;
  const profile = dashboard?.riderProfile;
  const stats = dashboard?.stats || {
    totalCompletedRides: 0,
    totalRidingKm: 0,
    upcomingRidesCount: 0,
    joinedOrganisationsCount: 0,
  };
  const upcomingRides = dashboard?.upcomingRides || [];
  const recentActivity = dashboard?.recentActivity || [];
  const tierProgress = dashboard?.tierProgress;
  const tiers = dashboard?.tiers || [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Mobile Sidebar Header */}
      <div className="mb-5 flex items-center justify-between rounded-2xl border border-kaafila-primary/25 bg-kaafila-surface px-4 py-3 lg:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-kaafila-primary/40 bg-kaafila-bg">
            {u?.avatarUrl ? (
              <img src={u.avatarUrl} alt={u.fullName} className="h-full w-full object-cover" />
            ) : (
              <UserIcon className="h-4 w-4 text-kaafila-accent" />
            )}
          </div>
          <div>
            <p className="font-display text-base font-bold uppercase text-kaafila-text">Rider Garage</p>
            <p className="font-mono text-[11px] text-kaafila-accent">@{profile?.handle || 'rider'}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          className="rounded-lg border border-kaafila-primary/30 p-2 text-kaafila-text"
          aria-label="Toggle rider dashboard sidebar"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Rider Sidebar */}
        <aside className={`${mobileMenuOpen ? 'block' : 'hidden'} lg:col-span-3 lg:block`}>
          <div className="sticky top-24 overflow-hidden rounded-3xl border border-kaafila-primary/25 bg-kaafila-surface shadow-card">
            <div className="border-b border-kaafila-border bg-gradient-to-br from-kaafila-bg to-kaafila-surface p-5">
              <div className="flex items-center gap-3.5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-kaafila-primary bg-kaafila-bg">
                  {u?.avatarUrl ? (
                    <img src={u.avatarUrl} alt={u.fullName} className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-display text-2xl font-bold text-kaafila-accent">
                      {u?.fullName?.slice(0, 1).toUpperCase() || 'R'}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-kaafila-accent">
                    Rider Console
                  </span>
                  <h2 className="truncate font-display text-xl font-bold text-kaafila-text">
                    {u?.fullName}
                  </h2>
                  <p className="truncate font-mono text-xs text-kaafila-muted">
                    @{profile?.handle || 'kaafila_rider'} · {profile?.rank || 'Beginner'}
                  </p>
                </div>
              </div>
            </div>

            <nav aria-label="Rider dashboard navigation" className="space-y-1 p-3">
              {RIDER_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = section === item.key;
                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                      active
                        ? 'bg-kaafila-primary text-kaafila-dark font-bold shadow-blue'
                        : 'text-kaafila-text/80 hover:bg-kaafila-elevated hover:text-kaafila-accent'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={handleLogout}
                className="mt-2 flex w-full items-center gap-3 rounded-xl border border-kaafila-border px-3.5 py-2.5 text-sm font-medium text-red-700 hover:border-red-400/40 hover:bg-red-500/10 transition"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Logout</span>
              </button>
            </nav>
          </div>
        </aside>

        {/* Main Panel */}
        <div className="space-y-6 lg:col-span-9">
          {loading ? (
            <div className="space-y-4">
              <div className="h-36 animate-pulse rounded-3xl bg-kaafila-surface" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-28 animate-pulse rounded-2xl bg-kaafila-surface" />
                ))}
              </div>
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-red-500/35 bg-kaafila-surface p-8 text-center">
              <p className="text-sm text-red-700">{error}</p>
              <button
                type="button"
                onClick={loadDashboard}
                className="mt-4 rounded-xl bg-kaafila-primary px-4 py-2 text-xs font-bold uppercase text-kaafila-dark"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* OVERVIEW SECTION */}
              {section === 'overview' && (
                <div className="space-y-6">
                  {/* Welcome Section */}
                  <section className="rounded-3xl border border-kaafila-primary/30 bg-gradient-to-br from-kaafila-surface via-kaafila-surface to-kaafila-bg p-6 shadow-card sm:p-8">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-kaafila-primary bg-kaafila-bg">
                          {u?.avatarUrl ? (
                            <img src={u.avatarUrl} alt={u.fullName} className="h-full w-full object-cover" />
                          ) : (
                            <span className="font-display text-2xl font-bold text-kaafila-accent">
                              {u?.fullName?.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <span className="font-mono text-xs uppercase tracking-widest text-kaafila-accent">
                            Welcome Back, Rider
                          </span>
                          <h1 className="mt-1 font-display text-3xl font-bold uppercase text-kaafila-text">
                            {u?.fullName}
                          </h1>
                          <p className="mt-1 text-xs text-kaafila-muted">
                            {u?.email} · {profile?.homeCity || u?.city || 'India'} ·{' '}
                            {profile?.primaryMotorcycle || 'Motorcycle not set yet'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          to="/dashboard/rider/tracking"
                          className="inline-flex items-center gap-1.5 rounded-xl border border-kaafila-primary/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-kaafila-accent hover:bg-kaafila-primary/10 transition"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          {dashboard?.activeTrackingSession ? 'Tracking Active' : 'GPS Tracker'}
                        </Link>
                        <Link
                          to="/rides"
                          className="rounded-xl bg-kaafila-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-kaafila-dark hover:bg-kaafila-primary-hover transition"
                        >
                          Explore Expeditions
                        </Link>
                      </div>
                    </div>

                    {dashboard?.activeTrackingSession && (
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-700">
                        <span className="inline-flex items-center gap-2 font-semibold">
                          <Radio className="h-4 w-4 animate-pulse text-emerald-400" />
                          Active GPS session: {dashboard.activeTrackingSession.title} (
                          {Number(dashboard.activeTrackingSession.verifiedDistanceKm || 0).toFixed(1)} km verified)
                        </span>
                        <Link
                          to="/dashboard/rider/tracking"
                          className="font-mono font-bold uppercase text-emerald-700 underline"
                        >
                          Manage Tracker
                        </Link>
                      </div>
                    )}
                  </section>

                  {/* Rank Progress & Leaderboard Quick Row */}
                  <section className="grid gap-4 lg:grid-cols-12">
                    <div className="rounded-2xl border border-kaafila-primary/25 bg-kaafila-surface p-5 lg:col-span-8">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-mono text-[10px] uppercase tracking-wider text-kaafila-accent">
                            Current KAAFILA Rank
                          </span>
                          <h2 className="font-display text-2xl font-bold text-kaafila-text">
                            {profile?.rank || 'Beginner'}
                          </h2>
                        </div>
                        <span className="font-mono text-xs text-kaafila-muted">
                          {tierProgress?.nextTier
                            ? `Next: ${tierProgress.nextTier.name} (${tierProgress.remainingKm} km left)`
                            : 'Maximum Tier Reached'}
                        </span>
                      </div>
                      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-kaafila-elevated">
                        <div
                          className="h-full bg-kaafila-primary transition-all"
                          style={{ width: `${tierProgress?.kmProgressPercent || 0}%` }}
                        />
                      </div>
                      {dashboard?.achievements && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {dashboard.achievements
                            .filter((a) => a.earned)
                            .slice(0, 4)
                            .map((a) => (
                              <span
                                key={a.code}
                                className="inline-flex items-center gap-1 rounded-full border border-kaafila-primary/35 bg-kaafila-primary/10 px-2.5 py-0.5 font-mono text-[10px] text-kaafila-accent"
                              >
                                <Award className="h-3 w-3" />
                                {a.title}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>

                    <Link
                      to="/leaderboards"
                      className="flex flex-col justify-between rounded-2xl border border-kaafila-border bg-kaafila-surface p-5 hover:border-kaafila-primary/50 transition lg:col-span-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-kaafila-muted">
                          Global Standing
                        </span>
                        <Trophy className="h-5 w-5 text-kaafila-accent" />
                      </div>
                      <p className="mt-2 font-display text-3xl font-bold text-kaafila-accent">
                        {dashboard?.leaderboardPosition ? `#${dashboard.leaderboardPosition}` : 'Private'}
                      </p>
                      <span className="mt-1 text-xs text-kaafila-muted">View full KAAFILA leaderboards →</span>
                    </Link>
                  </section>

                  {/* Statistics Cards */}
                  <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      {
                        label: 'Completed Rides',
                        value: stats.totalCompletedRides,
                        icon: Award,
                        sub: 'Verified expeditions',
                      },
                      {
                        label: 'Riding Kilometres',
                        value: `${Number(stats.totalRidingKm || 0).toLocaleString('en-IN')} km`,
                        icon: Route,
                        sub: `Rank: ${profile?.rank || 'Beginner'}`,
                      },
                      {
                        label: 'Upcoming Rides',
                        value: stats.upcomingRidesCount,
                        icon: Calendar,
                        sub: 'On your KAAFILA roster',
                      },
                      {
                        label: 'Joined Organisations',
                        value: stats.joinedOrganisationsCount,
                        icon: Building2,
                        sub: 'Active tour operators',
                      },
                    ].map((card) => {
                      const Icon = card.icon;
                      return (
                        <div
                          key={card.label}
                          className="rounded-2xl border border-kaafila-border bg-kaafila-surface p-5 shadow-card"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                              {card.label}
                            </span>
                            <Icon className="h-4 w-4 text-kaafila-accent" />
                          </div>
                          <p className="mt-2 font-mono text-2xl font-bold text-kaafila-text">{card.value}</p>
                          <p className="mt-1 text-[11px] text-kaafila-muted">{card.sub}</p>
                        </div>
                      );
                    })}
                  </section>

                  <div className="grid gap-6 lg:grid-cols-12">
                    {/* Upcoming Rides List */}
                    <section className="rounded-3xl border border-kaafila-border bg-kaafila-surface p-6 lg:col-span-7">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="font-display text-2xl font-bold uppercase text-kaafila-text">
                          Upcoming Rides
                        </h2>
                        <Link
                          to="/dashboard/rider/rides"
                          className="text-xs font-semibold text-kaafila-accent hover:underline"
                        >
                          View All Rides
                        </Link>
                      </div>

                      {upcomingRides.length === 0 ? (
                        <div className="mt-5 rounded-2xl border border-dashed border-kaafila-border bg-kaafila-bg p-6 text-center">
                          <p className="text-sm text-kaafila-muted">
                            You have not added any upcoming expeditions to your KAAFILA roster yet.
                          </p>
                          <Link
                            to="/rides"
                            className="mt-4 inline-block rounded-xl bg-kaafila-primary px-4 py-2 text-xs font-bold uppercase text-kaafila-dark"
                          >
                            Browse Expeditions
                          </Link>
                        </div>
                      ) : (
                        <div className="mt-5 space-y-4">
                          {upcomingRides.slice(0, 4).map((entry) => (
                            <div
                              key={entry._id}
                              className="flex flex-col gap-4 rounded-2xl border border-kaafila-border bg-kaafila-bg p-4 sm:flex-row sm:items-center"
                            >
                              <img
                                src={entry.ride.coverImageUrl || '/images/expedition-ladakh.png'}
                                alt={entry.ride.title}
                                className="h-20 w-full rounded-xl object-cover sm:w-28"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-[11px] uppercase text-kaafila-accent">
                                    {entry.ride.organisation?.name || 'Touring Organisation'}
                                  </span>
                                  <span className="rounded bg-kaafila-surface px-2 py-0.5 font-mono text-[10px] uppercase text-kaafila-text">
                                    KAAFILA Status: {entry.status}
                                  </span>
                                </div>
                                <Link
                                  to={`/rides/${entry.ride.slug}`}
                                  className="mt-1 block truncate font-display text-lg font-bold text-kaafila-text hover:text-kaafila-accent"
                                >
                                  {entry.ride.title}
                                </Link>
                                <p className="mt-1 text-xs text-kaafila-muted">
                                  {new Date(entry.ride.startDate).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}{' '}
                                  · {entry.ride.region} ({entry.ride.startLocation} → {entry.ride.endLocation})
                                </p>
                              </div>
                              <a
                                href={safeExternalUrl(
                                  entry.ride.bookingUrl || entry.ride.organisation?.bookingUrl
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-kaafila-primary/40 px-3 py-2 text-xs font-semibold text-kaafila-accent hover:bg-kaafila-primary/10"
                              >
                                <span>Official Site</span>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    {/* Recent Activity */}
                    <section className="rounded-3xl border border-kaafila-border bg-kaafila-surface p-6 lg:col-span-5">
                      <div className="flex items-center gap-2">
                        <Activity className="h-5 w-5 text-kaafila-accent" />
                        <h2 className="font-display text-2xl font-bold uppercase text-kaafila-text">
                          Recent Activity
                        </h2>
                      </div>
                      {recentActivity.length === 0 ? (
                        <p className="mt-5 text-sm text-kaafila-muted">No recorded account activity yet.</p>
                      ) : (
                        <ul className="mt-5 space-y-3">
                          {recentActivity.map((act) => (
                            <li
                              key={act.id}
                              className="rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-kaafila-text">{act.title}</span>
                                <span className="font-mono text-[10px] uppercase text-kaafila-accent">
                                  {act.status}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-kaafila-muted">
                                {act.organisationName} ·{' '}
                                {new Date(act.timestamp).toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                </div>
              )}

              {/* PROFILE MANAGEMENT SECTION */}
              {section === 'profile' && (
                <section className="rounded-3xl border border-kaafila-primary/25 bg-kaafila-surface p-6 shadow-card sm:p-8">
                  <div className="border-b border-kaafila-border pb-5">
                    <span className="font-mono text-xs uppercase tracking-widest text-kaafila-accent">
                      Rider Profile &amp; Safety Privacy
                    </span>
                    <h1 className="mt-1 font-display text-3xl font-bold uppercase text-kaafila-text">
                      Edit My Rider Profile
                    </h1>
                    <p className="mt-1 text-xs text-kaafila-muted">
                      Verified kilometres ({profile?.verifiedKilometres || 0} km) and rank ({profile?.rank || 'Beginner'}) are maintained exclusively from verified expeditions.
                    </p>
                  </div>

                  <form onSubmit={handleSaveProfile} className="mt-6 space-y-6">
                    <ImageUploadField
                      label="Profile Avatar"
                      aspect="square"
                      value={profileForm.avatarUrl}
                      onChange={(url) => setProfileForm((prev) => ({ ...prev, avatarUrl: url }))}
                    />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                          Full Name *
                        </label>
                        <input
                          type="text"
                          required
                          minLength={2}
                          value={profileForm.fullName}
                          onChange={(e) => setProfileForm((p) => ({ ...p, fullName: e.target.value }))}
                          className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          value={profileForm.phoneNumber}
                          onChange={(e) => setProfileForm((p) => ({ ...p, phoneNumber: e.target.value }))}
                          placeholder="+91 98XXXXXXXX"
                          className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                          City
                        </label>
                        <input
                          type="text"
                          value={profileForm.homeCity}
                          onChange={(e) => setProfileForm((p) => ({ ...p, homeCity: e.target.value }))}
                          className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                          Motorcycle Details
                        </label>
                        <input
                          type="text"
                          value={profileForm.primaryMotorcycle}
                          onChange={(e) =>
                            setProfileForm((p) => ({ ...p, primaryMotorcycle: e.target.value }))
                          }
                          placeholder="e.g., Royal Enfield Himalayan 450"
                          className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                          Riding Experience
                        </label>
                        <select
                          value={profileForm.ridingExperience}
                          onChange={(e) =>
                            setProfileForm((p) => ({ ...p, ridingExperience: e.target.value }))
                          }
                          className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                        >
                          <option value="beginner">Beginner</option>
                          <option value="intermediate">Intermediate</option>
                          <option value="advanced">Advanced</option>
                          <option value="expedition_veteran">Expedition Veteran</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Short Biography
                      </label>
                      <textarea
                        rows={3}
                        maxLength={500}
                        value={profileForm.bio}
                        onChange={(e) => setProfileForm((p) => ({ ...p, bio: e.target.value }))}
                        placeholder="Share your riding style, favourite passes, or touring story..."
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                      />
                    </div>

                    <div className="rounded-2xl border border-kaafila-primary/25 bg-kaafila-bg p-5">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-kaafila-accent" />
                        <h3 className="font-display text-lg font-bold uppercase text-kaafila-text">
                          Emergency Contact &amp; Privacy Controls
                        </h3>
                      </div>
                      <p className="mt-1 text-xs text-kaafila-muted">
                        Emergency contact details are private by default and are never shown on public profiles.
                      </p>

                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <input
                          type="text"
                          placeholder="Emergency Contact Name"
                          value={profileForm.emergencyContact.name}
                          onChange={(e) =>
                            setProfileForm((p) => ({
                              ...p,
                              emergencyContact: { ...p.emergencyContact, name: e.target.value },
                            }))
                          }
                          className="rounded-xl border border-kaafila-border bg-kaafila-surface px-3.5 py-2 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                        />
                        <input
                          type="text"
                          placeholder="Relationship (e.g., Spouse, Parent)"
                          value={profileForm.emergencyContact.relationship}
                          onChange={(e) =>
                            setProfileForm((p) => ({
                              ...p,
                              emergencyContact: { ...p.emergencyContact, relationship: e.target.value },
                            }))
                          }
                          className="rounded-xl border border-kaafila-border bg-kaafila-surface px-3.5 py-2 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                        />
                        <input
                          type="tel"
                          placeholder="Emergency Phone Number"
                          value={profileForm.emergencyContact.phone}
                          onChange={(e) =>
                            setProfileForm((p) => ({
                              ...p,
                              emergencyContact: { ...p.emergencyContact, phone: e.target.value },
                            }))
                          }
                          className="rounded-xl border border-kaafila-border bg-kaafila-surface px-3.5 py-2 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                        />
                        <input
                          type="text"
                          placeholder="Blood Group (optional, e.g., O+)"
                          value={profileForm.emergencyContact.bloodGroup}
                          onChange={(e) =>
                            setProfileForm((p) => ({
                              ...p,
                              emergencyContact: { ...p.emergencyContact, bloodGroup: e.target.value },
                            }))
                          }
                          className="rounded-xl border border-kaafila-border bg-kaafila-surface px-3.5 py-2 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                        />
                      </div>

                      <label className="mt-4 flex items-start gap-2.5 text-xs text-kaafila-text">
                        <input
                          type="checkbox"
                          checked={profileForm.emergencyContact.shareWithOrganisers}
                          onChange={(e) =>
                            setProfileForm((p) => ({
                              ...p,
                              emergencyContact: {
                                ...p.emergencyContact,
                                shareWithOrganisers: e.target.checked,
                              },
                            }))
                          }
                          className="mt-0.5 accent-kaafila-primary"
                        />
                        <span>
                          Allow confirmed expedition organisations to view my contact and emergency details for safety coordination.
                        </span>
                      </label>

                      <label className="mt-3 flex items-start gap-2.5 text-xs text-kaafila-text">
                        <input
                          type="checkbox"
                          checked={profileForm.isProfilePublic}
                          onChange={(e) =>
                            setProfileForm((p) => ({
                              ...p,
                              isProfilePublic: e.target.checked,
                            }))
                          }
                          className="mt-0.5 accent-kaafila-primary"
                        />
                        <span>
                          Make my rider profile visible in public Rider Discovery (/community/riders). Private email, phone number, and emergency contact remain hidden.
                        </span>
                      </label>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={savingProfile}
                        className="rounded-xl bg-kaafila-primary px-6 py-3 text-xs font-bold uppercase tracking-wider text-kaafila-dark shadow-blue hover:bg-kaafila-primary-hover transition disabled:opacity-50"
                      >
                        {savingProfile ? 'Saving Changes...' : 'Save Rider Profile'}
                      </button>
                    </div>
                  </form>
                </section>
              )}

              {/* MY RIDES & UPCOMING EXPEDITIONS SECTION */}
              {(section === 'rides' || section === 'upcoming') && (
                <section className="space-y-5">
                  <div className="rounded-3xl border border-kaafila-primary/25 bg-kaafila-surface p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <span className="font-mono text-xs uppercase tracking-widest text-kaafila-accent">
                          Expedition Roster
                        </span>
                        <h1 className="mt-1 font-display text-3xl font-bold uppercase text-kaafila-text">
                          {section === 'upcoming' ? 'Upcoming Expeditions' : 'My Rides'}
                        </h1>
                      </div>
                      <Link
                        to="/rides"
                        className="rounded-xl bg-kaafila-primary px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-kaafila-dark"
                      >
                        Discover More Rides
                      </Link>
                    </div>

                    <div className="mt-4 rounded-xl border border-kaafila-primary/20 bg-kaafila-bg px-4 py-3 text-xs text-kaafila-muted">
                      <ShieldAlert className="mr-1.5 inline h-4 w-4 text-kaafila-accent" />
                      <strong>Booking Distinction:</strong> KAAFILA records your roster status (<em>Interested</em>, <em>Confirmed</em>, <em>Completed</em>, <em>Cancelled</em>). Commercial ticket bookings and payments take place externally on each organisation&apos;s official website.
                    </div>

                    {section === 'rides' && (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {[
                          { key: 'all', label: `All (${ridesCounts.all})` },
                          { key: 'upcoming', label: `Upcoming (${ridesCounts.upcoming})` },
                          { key: 'completed', label: `Completed (${ridesCounts.completed})` },
                          { key: 'cancelled', label: `Cancelled (${ridesCounts.cancelled})` },
                        ].map((tab) => (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => {
                              setRidesFilter(tab.key);
                              setRidesPage(1);
                            }}
                            className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                              ridesFilter === tab.key
                                ? 'bg-kaafila-primary text-kaafila-dark'
                                : 'border border-kaafila-border bg-kaafila-bg text-kaafila-muted hover:text-kaafila-text'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {ridesLoading ? (
                    <div className="space-y-4">
                      {[1, 2].map((n) => (
                        <div key={n} className="h-36 animate-pulse rounded-2xl bg-kaafila-surface" />
                      ))}
                    </div>
                  ) : ridesData.length === 0 ? (
                    <div className="rounded-3xl border border-kaafila-border bg-kaafila-surface p-10 text-center">
                      <p className="text-sm text-kaafila-muted">
                        No expeditions found in this category yet.
                      </p>
                      <Link
                        to="/rides"
                        className="mt-4 inline-block rounded-xl bg-kaafila-primary px-5 py-2.5 text-xs font-bold uppercase text-kaafila-dark"
                      >
                        Browse Expeditions
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {ridesData.map((entry) => (
                        <article
                          key={entry._id}
                          className="flex flex-col gap-5 rounded-2xl border border-kaafila-border bg-kaafila-surface p-5 sm:flex-row"
                        >
                          <img
                            src={entry.ride.coverImageUrl || '/images/expedition-ladakh.png'}
                            alt={entry.ride.title}
                            className="h-36 w-full rounded-xl object-cover sm:w-48"
                          />
                          <div className="flex flex-1 flex-col justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded bg-kaafila-primary/15 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase text-kaafila-accent">
                                  KAAFILA: {entry.status}
                                </span>
                                <span className="rounded border border-kaafila-border px-2.5 py-0.5 font-mono text-[10px] uppercase text-kaafila-muted">
                                  External Booking Required
                                </span>
                              </div>
                              <h3 className="mt-2 font-display text-2xl font-bold text-kaafila-text">
                                {entry.ride.title}
                              </h3>
                              <p className="mt-1 text-xs text-kaafila-muted">
                                Organised by{' '}
                                <Link
                                  to={`/organisations/${entry.ride.organisation?.slug}`}
                                  className="font-semibold text-kaafila-accent hover:underline"
                                >
                                  {entry.ride.organisation?.name || 'Touring Organisation'}
                                </Link>{' '}
                                · {entry.ride.region}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-4 font-mono text-xs text-kaafila-text/85">
                                <span className="inline-flex items-center gap-1">
                                  <Calendar className="h-3.5 w-3.5 text-kaafila-accent" />
                                  {new Date(entry.ride.startDate).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}{' '}
                                  ({entry.ride.durationDays} Days)
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5 text-kaafila-accent" />
                                  {entry.ride.startLocation} → {entry.ride.endLocation}
                                </span>
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-3">
                              <Link
                                to={`/rides/${entry.ride.slug}`}
                                className="rounded-xl border border-kaafila-border px-3.5 py-2 text-xs font-semibold text-kaafila-text hover:border-kaafila-primary hover:text-kaafila-accent"
                              >
                                Expedition Details
                              </Link>
                              <a
                                href={safeExternalUrl(
                                  entry.ride.bookingUrl || entry.ride.organisation?.bookingUrl
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-xl bg-kaafila-primary px-3.5 py-2 text-xs font-bold uppercase text-kaafila-dark hover:bg-kaafila-primary-hover"
                              >
                                <span>Official Booking Site</span>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                              {entry.status !== 'cancelled' && entry.status !== 'completed' && (
                                <button
                                  type="button"
                                  onClick={() => setCancelTarget(entry)}
                                  className="rounded-xl border border-red-500/35 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-500/10"
                                >
                                  Cancel Roster Entry
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      ))}

                      {ridesTotalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-2">
                          <button
                            type="button"
                            disabled={ridesPage <= 1}
                            onClick={() => setRidesPage((p) => Math.max(1, p - 1))}
                            className="rounded-lg border border-kaafila-border px-3 py-1.5 text-xs text-kaafila-text disabled:opacity-40"
                          >
                            Previous
                          </button>
                          <span className="font-mono text-xs text-kaafila-muted">
                            Page {ridesPage} of {ridesTotalPages}
                          </span>
                          <button
                            type="button"
                            disabled={ridesPage >= ridesTotalPages}
                            onClick={() => setRidesPage((p) => Math.min(ridesTotalPages, p + 1))}
                            className="rounded-lg border border-kaafila-border px-3 py-1.5 text-xs text-kaafila-text disabled:opacity-40"
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* RIDING STATISTICS SECTION */}
              {section === 'stats' && (
                <section className="rounded-3xl border border-kaafila-primary/25 bg-kaafila-surface p-6 shadow-card sm:p-8">
                  <span className="font-mono text-xs uppercase tracking-widest text-kaafila-accent">
                    Genuine Verified Telemetry
                  </span>
                  <h1 className="mt-1 font-display text-3xl font-bold uppercase text-kaafila-text">
                    Riding Statistics
                  </h1>

                  <div className="mt-6 grid gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-kaafila-border bg-kaafila-bg p-5">
                      <span className="text-xs uppercase text-kaafila-muted">Verified Kilometres</span>
                      <p className="mt-1 font-mono text-3xl font-bold text-kaafila-accent">
                        {Number(profile?.verifiedKilometres || 0).toLocaleString('en-IN')} km
                      </p>
                    </div>
                    <div className="rounded-2xl border border-kaafila-border bg-kaafila-bg p-5">
                      <span className="text-xs uppercase text-kaafila-muted">Completed Rides</span>
                      <p className="mt-1 font-mono text-3xl font-bold text-kaafila-text">
                        {stats.totalCompletedRides}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-kaafila-border bg-kaafila-bg p-5">
                      <span className="text-xs uppercase text-kaafila-muted">Current KAAFILA Rank</span>
                      <p className="mt-1 font-display text-3xl font-bold text-kaafila-accent">
                        {profile?.rank || 'Beginner'}
                      </p>
                    </div>
                  </div>

                  {tierProgress && (
                    <div className="mt-6 rounded-2xl border border-kaafila-border bg-kaafila-bg p-5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold uppercase text-kaafila-text">
                          Progress to {tierProgress.nextTier ? tierProgress.nextTier.name : 'Max Tier'}
                        </span>
                        <span className="font-mono text-kaafila-accent">{tierProgress.kmProgressPercent}%</span>
                      </div>
                      <div className="mt-3 h-3 overflow-hidden rounded-full bg-kaafila-elevated">
                        <div
                          className="h-full bg-kaafila-primary transition-all"
                          style={{ width: `${tierProgress.kmProgressPercent}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-kaafila-muted">
                        {tierProgress.nextTier
                          ? `${tierProgress.remainingKm} more verified km required to reach ${tierProgress.nextTier.name}.`
                          : 'You have achieved the highest KAAFILA riding rank.'}
                      </p>
                    </div>
                  )}

                  {tiers.length > 0 && (
                    <div className="mt-6">
                      <h2 className="font-display text-xl font-bold uppercase text-kaafila-text">
                        KAAFILA Rank Progression
                      </h2>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {tiers.map((tier) => (
                          <div
                            key={tier.name}
                            className={`rounded-xl border p-4 ${
                              profile?.rank === tier.name
                                ? 'border-kaafila-primary bg-kaafila-primary/10'
                                : 'border-kaafila-border bg-kaafila-bg'
                            }`}
                          >
                            <p className="font-display text-lg font-bold text-kaafila-text">{tier.name}</p>
                            <p className="mt-1 font-mono text-xs text-kaafila-muted">
                              {tier.minKm.toLocaleString('en-IN')}+ km · {tier.minExpeditions}+ expeditions
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Achievements & Badges Catalog */}
                  {dashboard?.achievements?.length > 0 && (
                    <div className="mt-8">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="font-display text-xl font-bold uppercase text-kaafila-text">
                          Achievements &amp; Badges
                        </h2>
                        <span className="font-mono text-xs text-kaafila-accent">
                          {dashboard.achievements.filter((a) => a.earned).length}/{dashboard.achievements.length} Earned
                        </span>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {dashboard.achievements.map((ach) => (
                          <div
                            key={ach.code}
                            className={`rounded-2xl border p-4 ${
                              ach.earned
                                ? 'border-kaafila-primary/45 bg-kaafila-bg'
                                : 'border-kaafila-border bg-kaafila-bg/60 opacity-80'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  {ach.earned ? (
                                    <Award className="h-4 w-4 text-kaafila-accent" />
                                  ) : (
                                    <Lock className="h-4 w-4 text-kaafila-muted" />
                                  )}
                                  <p className="font-display text-base font-bold text-kaafila-text">
                                    {ach.title}
                                  </p>
                                </div>
                                <p className="mt-1 text-xs text-kaafila-muted">{ach.description}</p>
                              </div>
                              <span
                                className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase ${
                                  ach.earned
                                    ? 'bg-emerald-500/15 text-emerald-700'
                                    : 'bg-kaafila-elevated text-kaafila-muted'
                                }`}
                              >
                                {ach.earned ? 'Earned' : ach.tier}
                              </span>
                            </div>
                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-kaafila-elevated">
                              <div
                                className={`h-full transition-all ${ach.earned ? 'bg-emerald-400' : 'bg-kaafila-primary'}`}
                                style={{ width: `${ach.progressPercent}%` }}
                              />
                            </div>
                            <p className="mt-1.5 font-mono text-[10px] text-kaafila-muted">
                              {ach.earned && ach.awardedAt
                                ? `Unlocked ${new Date(ach.awardedAt).toLocaleDateString()}`
                                : `Progress: ${ach.progressPercent}%`}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {(section === 'tracking' || section === 'history') && (
                <RiderTrackingPanel
                  mode={section === 'history' ? 'history' : 'tracking'}
                  onSessionFinalized={loadDashboard}
                />
              )}

              {/* ACCOUNT SETTINGS SECTION */}
              {section === 'settings' && (
                <section className="rounded-3xl border border-kaafila-primary/25 bg-kaafila-surface p-6 shadow-card sm:p-8">
                  <span className="font-mono text-xs uppercase tracking-widest text-kaafila-accent">
                    Account &amp; Privacy
                  </span>
                  <h1 className="mt-1 font-display text-3xl font-bold uppercase text-kaafila-text">
                    Account Settings
                  </h1>

                  <div className="mt-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-kaafila-border bg-kaafila-bg p-4">
                      <div>
                        <p className="text-xs uppercase text-kaafila-muted">Account Email</p>
                        <p className="mt-1 font-mono text-sm text-kaafila-text">{u?.email}</p>
                      </div>
                      <span className="rounded-full border border-kaafila-primary/40 bg-kaafila-primary/10 px-3 py-1 font-mono text-xs uppercase text-kaafila-accent">
                        Role: {user.role}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-kaafila-border bg-kaafila-bg p-4">
                      <div>
                        <p className="text-xs uppercase text-kaafila-muted">Public Rider Profile</p>
                        <p className="mt-1 text-sm text-kaafila-text">@{profile?.handle}</p>
                      </div>
                      {profile?.handle && (
                        <Link
                          to={`/riders/${profile.handle}`}
                          className="rounded-xl border border-kaafila-primary/40 px-4 py-2 text-xs font-bold uppercase text-kaafila-accent hover:bg-kaafila-primary/10"
                        >
                          View Public Profile
                        </Link>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-kaafila-border bg-kaafila-bg p-4">
                      <div>
                        <p className="text-xs uppercase text-kaafila-muted">Emergency Contact Sharing</p>
                        <p className="mt-1 text-sm text-kaafila-text">
                          {profile?.emergencyContact?.shareWithOrganisers
                            ? 'Enabled for confirmed expeditions'
                            : 'Private (not shared with organisations)'}
                        </p>
                      </div>
                      <Link
                        to="/dashboard/rider/profile"
                        className="rounded-xl border border-kaafila-border px-4 py-2 text-xs font-semibold text-kaafila-text hover:border-kaafila-primary hover:text-kaafila-accent"
                      >
                        Manage Privacy
                      </Link>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        open={Boolean(cancelTarget)}
        title="Cancel Expedition Registration?"
        message={`Remove your active roster entry for "${cancelTarget?.ride?.title || 'this expedition'}"? This only updates your KAAFILA roster status.`}
        confirmLabel="Yes, Cancel Entry"
        loading={cancellingRide}
        onConfirm={handleConfirmCancelRide}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}


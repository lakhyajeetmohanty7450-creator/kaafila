import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Building2,
  Calendar,
  Compass,
  Edit3,
  ExternalLink,
  Layers,
  Lock,
  LogOut,
  MapPin,
  Menu,
  Plus,
  PlusCircle,
  Settings,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ImageUploadField from '../components/ImageUploadField';
import ConfirmModal from '../components/ConfirmModal';
import OrgRouteManagerPanel from '../components/OrgRouteManagerPanel';

const ORG_NAV_ITEMS = [
  { key: 'overview', label: 'Overview', to: '/dashboard/organisation', icon: Compass },
  { key: 'profile', label: 'Organisation Profile', to: '/dashboard/organisation/profile', icon: Building2 },
  { key: 'rides', label: 'Manage Expeditions', to: '/dashboard/organisation/rides', icon: Layers },
  { key: 'routes', label: 'Routes & Checkpoints', to: '/dashboard/organisation/routes', icon: MapPin },
  { key: 'create', label: 'Create Expedition', to: '/dashboard/organisation/create', icon: PlusCircle },
  { key: 'riders', label: 'Manage Riders', to: '/dashboard/organisation/riders', icon: Users },
  { key: 'analytics', label: 'Analytics', to: '/dashboard/organisation/analytics', icon: BarChart3 },
  { key: 'settings', label: 'Account Settings', to: '/dashboard/organisation/settings', icon: Settings },
];

const EMPTY_EXPEDITION = {
  title: '',
  tagline: '',
  description: '',
  region: '',
  startLocation: '',
  endLocation: '',
  startDate: '',
  endDate: '',
  durationDays: 7,
  distanceKm: 900,
  maxAltitudeMeters: 4500,
  difficulty: 'challenging',
  priceInr: 28000,
  priceOwnBikeInr: 18000,
  maxRiders: 12,
  bikeRentalAvailable: true,
  facilitiesSummary: '',
  bookingUrl: '',
  coverImageUrl: '',
  highlightsText: '',
  inclusionsText: '',
  exclusionsText: '',
  status: 'published',
  itinerary: [{ day: 1, title: '', route: '', description: '', altitudeMeters: '' }],
};

export default function OrganisationDashboardPage({ section = 'overview' }) {
  const { user, loading: authLoading, isAuthenticated, logout, refreshUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [orgForm, setOrgForm] = useState(null);
  const [savingOrg, setSavingOrg] = useState(false);

  const [editingRideId, setEditingRideId] = useState(null);
  const [rideForm, setRideForm] = useState(EMPTY_EXPEDITION);
  const [savingRide, setSavingRide] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingRide, setDeletingRide] = useState(false);

  const [ridersList, setRidersList] = useState([]);
  const [ridersFilterRide, setRidersFilterRide] = useState('');
  const [ridersFilterStatus, setRidersFilterStatus] = useState('all');
  const [ridersPage, setRidersPage] = useState(1);
  const [ridersTotalPages, setRidersTotalPages] = useState(1);
  const [ridersLoading, setRidersLoading] = useState(false);

  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const hydrateOrgForm = (org) => {
    if (!org) return;
    setOrgForm({
      name: org.name || '',
      logoUrl: org.logoUrl || '',
      coverImageUrl: org.coverImageUrl || '',
      shortDescription: org.shortDescription || '',
      about: org.about || '',
      city: org.location?.city || '',
      state: org.location?.state || '',
      region: org.location?.region || '',
      country: org.location?.country || 'India',
      contactNumber: org.contactNumber || '',
      officialWebsite: org.officialWebsite || '',
      bookingUrl: org.bookingUrl || '',
      operatingRegionsText: (org.operatingRegions || []).join(', '),
      accommodationAvailable: org.facilities?.accommodation?.available ?? true,
      accommodationSummary: org.facilities?.accommodation?.summary || '',
      accommodationTypesText: (org.facilities?.accommodation?.types || []).join(', '),
      foodAvailable: org.facilities?.food?.available ?? true,
      foodSummary: org.facilities?.food?.summary || '',
      foodDietaryText: (org.facilities?.food?.dietaryOptions || []).join(', '),
      bikeRentalAvailable: org.facilities?.bikeRental?.available ?? true,
      bikeRentalSummary: org.facilities?.bikeRental?.summary || '',
      bikeFleetText: (org.facilities?.bikeRental?.fleetModels || []).join(', '),
      oxygenSupport: Boolean(org.facilities?.medicalAndEmergency?.oxygenSupport),
      backupVehicle: Boolean(org.facilities?.medicalAndEmergency?.backupVehicle),
      certifiedMechanic: Boolean(org.facilities?.medicalAndEmergency?.certifiedMechanic),
      satelliteComm: Boolean(org.facilities?.medicalAndEmergency?.satelliteComm),
      firstAidKit: org.facilities?.medicalAndEmergency?.firstAidKit ?? true,
      medicalSummary: org.facilities?.medicalAndEmergency?.summary || '',
    });
  };

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/organisations/me/dashboard');
      if (data?.success) {
        setDashboard(data.data);
        hydrateOrgForm(data.data.organisation);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load organisation dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOrgRiders = useCallback(async () => {
    setRidersLoading(true);
    try {
      const { data } = await api.get('/organisations/me/riders', {
        params: {
          rideId: ridersFilterRide || undefined,
          status: ridersFilterStatus,
          page: ridersPage,
          limit: 10,
        },
      });
      if (data?.success) {
        setRidersList(data.data || []);
        setRidersTotalPages(data.pagination?.totalPages || 1);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load registered riders.', 'error');
    } finally {
      setRidersLoading(false);
    }
  }, [ridersFilterRide, ridersFilterStatus, ridersPage, showToast]);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const { data } = await api.get('/organisations/me/analytics');
      if (data?.success) {
        setAnalyticsData(data.data);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load analytics.', 'error');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isAuthenticated && user?.role === 'organisation') {
      loadDashboard();
    }
  }, [isAuthenticated, user?.role, loadDashboard]);

  useEffect(() => {
    if (isAuthenticated && user?.role === 'organisation' && section === 'riders') {
      loadOrgRiders();
    }
    if (isAuthenticated && user?.role === 'organisation' && section === 'analytics') {
      loadAnalytics();
    }
  }, [section, isAuthenticated, user?.role, loadOrgRiders, loadAnalytics]);

  if (authLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="h-64 animate-pulse rounded-3xl bg-kaafila-surface" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login?role=organisation" replace />;
  }

  if (user?.role !== 'organisation') {
    return <Navigate to={user?.role === 'rider' ? '/dashboard/rider' : '/account'} replace />;
  }

  const org = dashboard?.organisation;
  const analytics = dashboard?.analytics || {};
  const expeditions = dashboard?.expeditions || [];
  const recentActivity = dashboard?.recentActivity || [];

  const handleSaveOrgProfile = async (e) => {
    e.preventDefault();
    if (!org?._id || !orgForm) return;
    setSavingOrg(true);
    try {
      const splitList = (str) =>
        String(str || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

      const payload = {
        name: orgForm.name.trim(),
        logoUrl: orgForm.logoUrl.trim(),
        coverImageUrl: orgForm.coverImageUrl.trim(),
        shortDescription: orgForm.shortDescription.trim(),
        about: orgForm.about.trim(),
        location: {
          city: orgForm.city.trim(),
          state: orgForm.state.trim(),
          region: orgForm.region.trim(),
          country: orgForm.country.trim() || 'India',
        },
        contactNumber: orgForm.contactNumber.trim(),
        officialWebsite: orgForm.officialWebsite.trim(),
        bookingUrl: orgForm.bookingUrl.trim(),
        operatingRegions: splitList(orgForm.operatingRegionsText),
        facilities: {
          accommodation: {
            available: orgForm.accommodationAvailable,
            summary: orgForm.accommodationSummary.trim(),
            types: splitList(orgForm.accommodationTypesText),
          },
          food: {
            available: orgForm.foodAvailable,
            summary: orgForm.foodSummary.trim(),
            dietaryOptions: splitList(orgForm.foodDietaryText),
          },
          bikeRental: {
            available: orgForm.bikeRentalAvailable,
            summary: orgForm.bikeRentalSummary.trim(),
            fleetModels: splitList(orgForm.bikeFleetText),
          },
          medicalAndEmergency: {
            oxygenSupport: orgForm.oxygenSupport,
            backupVehicle: orgForm.backupVehicle,
            certifiedMechanic: orgForm.certifiedMechanic,
            satelliteComm: orgForm.satelliteComm,
            firstAidKit: orgForm.firstAidKit,
            summary: orgForm.medicalSummary.trim(),
          },
        },
      };

      const { data } = await api.put(`/organisations/${org._id}`, payload);
      if (data?.success) {
        showToast('Organisation profile updated.', 'success');
        await Promise.all([loadDashboard(), refreshUser()]);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to update organisation profile.', 'error');
    } finally {
      setSavingOrg(false);
    }
  };

  const startEditRide = (ride) => {
    setEditingRideId(ride._id);
    setRideForm({
      title: ride.title || '',
      tagline: ride.tagline || '',
      description: ride.description || '',
      region: ride.region || '',
      startLocation: ride.startLocation || '',
      endLocation: ride.endLocation || '',
      startDate: ride.startDate ? new Date(ride.startDate).toISOString().slice(0, 10) : '',
      endDate: ride.endDate ? new Date(ride.endDate).toISOString().slice(0, 10) : '',
      durationDays: ride.durationDays || 1,
      distanceKm: ride.distanceKm || 100,
      maxAltitudeMeters: ride.maxAltitudeMeters || 0,
      difficulty: ride.difficulty || 'challenging',
      priceInr: ride.priceInr ?? 0,
      priceOwnBikeInr: ride.priceOwnBikeInr ?? '',
      maxRiders: ride.maxRiders || 12,
      bikeRentalAvailable: ride.bikeRentalAvailable ?? true,
      facilitiesSummary: ride.facilitiesSummary || '',
      bookingUrl: ride.bookingUrl || '',
      coverImageUrl: ride.coverImageUrl || '',
      highlightsText: (ride.highlights || []).join('\n'),
      inclusionsText: (ride.inclusions || []).join('\n'),
      exclusionsText: (ride.exclusions || []).join('\n'),
      status: ride.status || 'published',
      itinerary:
        ride.itinerary?.length > 0
          ? ride.itinerary.map((d, i) => ({
              day: d.day || d.dayNumber || i + 1,
              title: d.title || '',
              route: d.route || '',
              description: d.description || '',
              altitudeMeters: d.altitudeMeters ?? '',
            }))
          : [{ day: 1, title: '', route: '', description: '', altitudeMeters: '' }],
    });
    navigate('/dashboard/organisation/create');
  };

  const handleResetCreateForm = () => {
    setEditingRideId(null);
    setRideForm(EMPTY_EXPEDITION);
  };

  const handleSaveExpedition = async (e) => {
    e.preventDefault();
    if (new Date(rideForm.endDate) < new Date(rideForm.startDate)) {
      showToast('End date cannot be earlier than start date.', 'error');
      return;
    }

    const splitLines = (str) =>
      String(str || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

    const payload = {
      title: rideForm.title.trim(),
      tagline: rideForm.tagline.trim(),
      description: rideForm.description.trim(),
      region: rideForm.region.trim(),
      startLocation: rideForm.startLocation.trim(),
      endLocation: rideForm.endLocation.trim(),
      startDate: rideForm.startDate,
      endDate: rideForm.endDate,
      durationDays: Number(rideForm.durationDays) || 1,
      distanceKm: Number(rideForm.distanceKm) || 100,
      maxAltitudeMeters: Number(rideForm.maxAltitudeMeters) || 0,
      difficulty: rideForm.difficulty,
      priceInr: Number(rideForm.priceInr) || 0,
      priceOwnBikeInr: rideForm.priceOwnBikeInr !== '' ? Number(rideForm.priceOwnBikeInr) : undefined,
      maxRiders: Number(rideForm.maxRiders) || 12,
      bikeRentalAvailable: Boolean(rideForm.bikeRentalAvailable),
      facilitiesSummary: rideForm.facilitiesSummary.trim(),
      bookingUrl: rideForm.bookingUrl.trim(),
      coverImageUrl: rideForm.coverImageUrl.trim(),
      highlights: splitLines(rideForm.highlightsText),
      inclusions: splitLines(rideForm.inclusionsText),
      exclusions: splitLines(rideForm.exclusionsText),
      status: rideForm.status,
      itinerary: rideForm.itinerary,
    };

    setSavingRide(true);
    try {
      if (editingRideId) {
        await api.put(`/rides/${editingRideId}`, payload);
        showToast('Expedition updated successfully.', 'success');
      } else {
        await api.post('/rides', payload);
        showToast(
          payload.status === 'draft' ? 'Expedition saved as draft.' : 'Expedition published!',
          'success'
        );
      }
      setEditingRideId(null);
      setRideForm(EMPTY_EXPEDITION);
      await loadDashboard();
      navigate('/dashboard/organisation/rides');
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to save expedition.', 'error');
    } finally {
      setSavingRide(false);
    }
  };

  const handleConfirmDeleteRide = async () => {
    if (!deleteTarget) return;
    setDeletingRide(true);
    try {
      await api.delete(`/rides/${deleteTarget._id}`);
      showToast('Expedition deleted.', 'info');
      setDeleteTarget(null);
      await loadDashboard();
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to delete expedition.', 'error');
    } finally {
      setDeletingRide(false);
    }
  };

  const handleUpdateParticipantStatus = async (rideId, memberId, status) => {
    try {
      const { data } = await api.patch(`/rides/${rideId}/participants/${memberId}`, { status });
      showToast(data?.message || 'Participant status updated.', 'success');
      await Promise.all([loadOrgRiders(), loadDashboard()]);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to update rider status.', 'error');
    }
  };

  const handleLogout = () => {
    navigate('/', { replace: true });
    setTimeout(() => logout(), 0);
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-kaafila-bg pb-16">
      {/* Organisation Command Header — distinct horizontal operator bar */}
      <div className="border-b border-kaafila-secondary/40 bg-gradient-to-r from-kaafila-surface via-kaafila-bg to-kaafila-surface">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-kaafila-primary bg-kaafila-surface">
                {org?.logoUrl ? (
                  <img src={org.logoUrl} alt={org.name} className="h-full w-full object-cover" />
                ) : (
                  <Building2 className="h-6 w-6 text-kaafila-accent" />
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-kaafila-accent">
                    Organisation Command Center
                  </span>
                  {org?.isDemo ? (
                    <span className="rounded-full border border-kaafila-secondary bg-kaafila-secondary/70 px-2.5 py-0.5 font-mono text-[10px] uppercase text-kaafila-text">
                      Demo Listing
                    </span>
                  ) : org?.isVerified ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] uppercase text-emerald-700">
                      <BadgeCheck className="h-3.5 w-3.5" /> Verified
                    </span>
                  ) : (
                    <span className="rounded-full border border-kaafila-primary/40 bg-kaafila-primary/10 px-2.5 py-0.5 font-mono text-[10px] uppercase text-kaafila-accent">
                      Verification Pending
                    </span>
                  )}
                </div>
                <h1 className="mt-1 font-display text-2xl font-bold uppercase text-kaafila-text sm:text-3xl">
                  {org?.name || user.fullName}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {org?.slug && (
                <Link
                  to={`/organisations/${org.slug}`}
                  className="hidden items-center gap-1.5 rounded-xl border border-kaafila-primary/35 px-3.5 py-2 text-xs font-semibold text-kaafila-accent hover:bg-kaafila-primary/10 sm:inline-flex"
                >
                  <span>Public Marketplace Page</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="hidden items-center gap-1.5 rounded-xl border border-red-500/35 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-500/10 lg:inline-flex"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Logout</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileNavOpen((prev) => !prev)}
                className="rounded-xl border border-kaafila-primary/30 p-2 text-kaafila-text lg:hidden"
                aria-label="Toggle organisation menu"
              >
                {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Horizontal Operator Tab Bar (Desktop/Tablet) */}
          <nav
            aria-label="Organisation dashboard navigation"
            className={`${
              mobileNavOpen ? 'mt-4 flex flex-col gap-1.5' : 'hidden'
            } lg:mt-5 lg:flex lg:flex-row lg:flex-wrap lg:items-center lg:gap-2`}
          >
            {ORG_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = section === item.key;
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  onClick={() => {
                    setMobileNavOpen(false);
                    if (item.key === 'create' && section !== 'create') {
                      handleResetCreateForm();
                    }
                  }}
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition ${
                    active
                      ? 'bg-kaafila-primary text-kaafila-dark shadow-blue'
                      : 'border border-kaafila-border bg-kaafila-bg/70 text-kaafila-text/80 hover:border-kaafila-primary/40 hover:text-kaafila-accent'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-xl border border-red-500/35 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-red-700 lg:hidden"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Logout</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content Container */}
      <div className="mx-auto mt-8 max-w-7xl px-4 sm:px-6 lg:px-8">
        {loading ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-28 animate-pulse rounded-2xl bg-kaafila-surface" />
              ))}
            </div>
            <div className="h-64 animate-pulse rounded-3xl bg-kaafila-surface" />
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
                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      label: 'Published Expeditions',
                      value: analytics.totalPublishedExpeditions ?? 0,
                      sub: `${analytics.draftExpeditions ?? 0} draft(s)`,
                      icon: Layers,
                    },
                    {
                      label: 'Recorded Participants',
                      value: analytics.recordedRegistrations ?? 0,
                      sub: `${analytics.confirmedRiders ?? 0} confirmed/completed`,
                      icon: Users,
                    },
                    {
                      label: 'Upcoming Expeditions',
                      value: analytics.upcomingExpeditions ?? 0,
                      sub: 'Active on marketplace',
                      icon: Calendar,
                    },
                    {
                      label: 'Completed Expeditions',
                      value: analytics.completedExpeditions ?? 0,
                      sub: 'Historical tours',
                      icon: BadgeCheck,
                    },
                  ].map((card) => {
                    const Icon = card.icon;
                    return (
                      <div
                        key={card.label}
                        className="rounded-2xl border border-kaafila-secondary/40 bg-kaafila-surface p-5 shadow-card"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                            {card.label}
                          </span>
                          <Icon className="h-4 w-4 text-kaafila-accent" />
                        </div>
                        <p className="mt-2 font-mono text-3xl font-bold text-kaafila-text">{card.value}</p>
                        <p className="mt-1 text-xs text-kaafila-muted">{card.sub}</p>
                      </div>
                    );
                  })}
                </section>

                <div className="grid gap-6 lg:grid-cols-12">
                  <section className="rounded-3xl border border-kaafila-border bg-kaafila-surface p-6 lg:col-span-7">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="font-display text-2xl font-bold uppercase text-kaafila-text">
                        Your Expeditions
                      </h2>
                      <Link
                        to="/dashboard/organisation/create"
                        onClick={handleResetCreateForm}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-kaafila-primary px-3.5 py-2 text-xs font-bold uppercase text-kaafila-dark"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>New Expedition</span>
                      </Link>
                    </div>

                    {expeditions.length === 0 ? (
                      <div className="mt-5 rounded-2xl border border-dashed border-kaafila-border bg-kaafila-bg p-8 text-center">
                        <p className="text-sm text-kaafila-muted">
                          No expeditions published yet. Create your first Himalayan ride!
                        </p>
                      </div>
                    ) : (
                      <div className="mt-5 space-y-3">
                        {expeditions.slice(0, 5).map((ride) => (
                          <div
                            key={ride._id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-kaafila-border bg-kaafila-bg p-4"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="rounded bg-kaafila-primary/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-kaafila-accent">
                                  {ride.status}
                                </span>
                                <span className="font-mono text-[11px] text-kaafila-muted">{ride.region}</span>
                              </div>
                              <h3 className="mt-1 font-display text-lg font-bold text-kaafila-text">
                                {ride.title}
                              </h3>
                              <p className="text-xs text-kaafila-muted">
                                {ride.participantCount || 0} recorded rider(s) · {ride.spotsRemaining}/{ride.maxRiders} spots left
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => startEditRide(ride)}
                              className="rounded-xl border border-kaafila-border px-3 py-1.5 text-xs font-semibold text-kaafila-text hover:border-kaafila-primary hover:text-kaafila-accent"
                            >
                              Edit
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="rounded-3xl border border-kaafila-border bg-kaafila-surface p-6 lg:col-span-5">
                    <div className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-kaafila-accent" />
                      <h2 className="font-display text-2xl font-bold uppercase text-kaafila-text">
                        Recent Activity
                      </h2>
                    </div>
                    {recentActivity.length === 0 ? (
                      <p className="mt-5 text-sm text-kaafila-muted">No recorded activity yet.</p>
                    ) : (
                      <ul className="mt-5 space-y-3">
                        {recentActivity.map((act) => (
                          <li key={act.id} className="rounded-xl border border-kaafila-border bg-kaafila-bg p-3.5">
                            <p className="text-sm font-semibold text-kaafila-text">{act.title}</p>
                            <p className="mt-1 text-xs text-kaafila-muted">
                              {act.subtitle} ·{' '}
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

            {/* ORGANISATION PROFILE MANAGEMENT */}
            {section === 'profile' && orgForm && (
              <section className="rounded-3xl border border-kaafila-primary/25 bg-kaafila-surface p-6 shadow-card sm:p-8">
                <div className="border-b border-kaafila-border pb-5">
                  <span className="font-mono text-xs uppercase tracking-widest text-kaafila-accent">
                    Public Marketplace Identity
                  </span>
                  <h2 className="mt-1 font-display text-3xl font-bold uppercase text-kaafila-text">
                    Edit Organisation Profile
                  </h2>
                  <p className="mt-1 text-xs text-kaafila-muted">
                    Verification status ({org?.verificationStatus}) is controlled by KAAFILA review and cannot be self-modified.
                  </p>
                </div>

                <form onSubmit={handleSaveOrgProfile} className="mt-6 space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    <ImageUploadField
                      label="Organisation Logo"
                      aspect="square"
                      value={orgForm.logoUrl}
                      onChange={(url) => setOrgForm((p) => ({ ...p, logoUrl: url }))}
                    />
                    <ImageUploadField
                      label="Cover Banner Image"
                      aspect="wide"
                      value={orgForm.coverImageUrl}
                      onChange={(url) => setOrgForm((p) => ({ ...p, coverImageUrl: url }))}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Organisation Name *
                      </label>
                      <input
                        type="text"
                        required
                        minLength={2}
                        value={orgForm.name}
                        onChange={(e) => setOrgForm((p) => ({ ...p, name: e.target.value }))}
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Contact Number
                      </label>
                      <input
                        type="tel"
                        value={orgForm.contactNumber}
                        onChange={(e) => setOrgForm((p) => ({ ...p, contactNumber: e.target.value }))}
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Official Website
                      </label>
                      <input
                        type="url"
                        value={orgForm.officialWebsite}
                        onChange={(e) => setOrgForm((p) => ({ ...p, officialWebsite: e.target.value }))}
                        placeholder="https://..."
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Official Booking URL *
                      </label>
                      <input
                        type="url"
                        required
                        value={orgForm.bookingUrl}
                        onChange={(e) => setOrgForm((p) => ({ ...p, bookingUrl: e.target.value }))}
                        placeholder="https://..."
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        City *
                      </label>
                      <input
                        type="text"
                        required
                        value={orgForm.city}
                        onChange={(e) => setOrgForm((p) => ({ ...p, city: e.target.value }))}
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        State *
                      </label>
                      <input
                        type="text"
                        required
                        value={orgForm.state}
                        onChange={(e) => setOrgForm((p) => ({ ...p, state: e.target.value }))}
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Primary Region *
                      </label>
                      <input
                        type="text"
                        required
                        value={orgForm.region}
                        onChange={(e) => setOrgForm((p) => ({ ...p, region: e.target.value }))}
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                      Short Description *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={280}
                      value={orgForm.shortDescription}
                      onChange={(e) => setOrgForm((p) => ({ ...p, shortDescription: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                      About Organisation
                    </label>
                    <textarea
                      rows={4}
                      value={orgForm.about}
                      onChange={(e) => setOrgForm((p) => ({ ...p, about: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                    />
                  </div>

                  {/* Facilities Grid */}
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-3 rounded-2xl border border-kaafila-border bg-kaafila-bg p-4">
                      <label className="flex items-center gap-2 text-xs font-bold uppercase text-kaafila-accent">
                        <input
                          type="checkbox"
                          checked={orgForm.accommodationAvailable}
                          onChange={(e) =>
                            setOrgForm((p) => ({ ...p, accommodationAvailable: e.target.checked }))
                          }
                          className="accent-kaafila-primary"
                        />
                        Accommodation Facilities
                      </label>
                      <input
                        type="text"
                        placeholder="Accommodation summary..."
                        value={orgForm.accommodationSummary}
                        onChange={(e) =>
                          setOrgForm((p) => ({ ...p, accommodationSummary: e.target.value }))
                        }
                        className="w-full rounded-xl border border-kaafila-border bg-kaafila-surface px-3 py-2 text-xs text-kaafila-text"
                      />
                      <input
                        type="text"
                        placeholder="Types (comma-separated, e.g. Swiss Tents, Homestays)"
                        value={orgForm.accommodationTypesText}
                        onChange={(e) =>
                          setOrgForm((p) => ({ ...p, accommodationTypesText: e.target.value }))
                        }
                        className="w-full rounded-xl border border-kaafila-border bg-kaafila-surface px-3 py-2 text-xs text-kaafila-text"
                      />
                    </div>

                    <div className="space-y-3 rounded-2xl border border-kaafila-border bg-kaafila-bg p-4">
                      <label className="flex items-center gap-2 text-xs font-bold uppercase text-kaafila-accent">
                        <input
                          type="checkbox"
                          checked={orgForm.foodAvailable}
                          onChange={(e) => setOrgForm((p) => ({ ...p, foodAvailable: e.target.checked }))}
                          className="accent-kaafila-primary"
                        />
                        Food &amp; Meals
                      </label>
                      <input
                        type="text"
                        placeholder="Food summary..."
                        value={orgForm.foodSummary}
                        onChange={(e) => setOrgForm((p) => ({ ...p, foodSummary: e.target.value }))}
                        className="w-full rounded-xl border border-kaafila-border bg-kaafila-surface px-3 py-2 text-xs text-kaafila-text"
                      />
                      <input
                        type="text"
                        placeholder="Dietary options (comma-separated)"
                        value={orgForm.foodDietaryText}
                        onChange={(e) => setOrgForm((p) => ({ ...p, foodDietaryText: e.target.value }))}
                        className="w-full rounded-xl border border-kaafila-border bg-kaafila-surface px-3 py-2 text-xs text-kaafila-text"
                      />
                    </div>

                    <div className="space-y-3 rounded-2xl border border-kaafila-border bg-kaafila-bg p-4">
                      <label className="flex items-center gap-2 text-xs font-bold uppercase text-kaafila-accent">
                        <input
                          type="checkbox"
                          checked={orgForm.bikeRentalAvailable}
                          onChange={(e) =>
                            setOrgForm((p) => ({ ...p, bikeRentalAvailable: e.target.checked }))
                          }
                          className="accent-kaafila-primary"
                        />
                        Bike Rental Fleet
                      </label>
                      <input
                        type="text"
                        placeholder="Bike rental summary..."
                        value={orgForm.bikeRentalSummary}
                        onChange={(e) =>
                          setOrgForm((p) => ({ ...p, bikeRentalSummary: e.target.value }))
                        }
                        className="w-full rounded-xl border border-kaafila-border bg-kaafila-surface px-3 py-2 text-xs text-kaafila-text"
                      />
                      <input
                        type="text"
                        placeholder="Fleet models (comma-separated, e.g. Himalayan 450, Scram 411)"
                        value={orgForm.bikeFleetText}
                        onChange={(e) => setOrgForm((p) => ({ ...p, bikeFleetText: e.target.value }))}
                        className="w-full rounded-xl border border-kaafila-border bg-kaafila-surface px-3 py-2 text-xs text-kaafila-text"
                      />
                    </div>

                    <div className="space-y-3 rounded-2xl border border-kaafila-border bg-kaafila-bg p-4">
                      <span className="block text-xs font-bold uppercase text-kaafila-accent">
                        Emergency &amp; Medical Support
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-xs text-kaafila-text">
                        {[
                          { key: 'oxygenSupport', label: 'Medical Oxygen' },
                          { key: 'backupVehicle', label: '4x4 Backup Vehicle' },
                          { key: 'certifiedMechanic', label: 'Certified Mechanic' },
                          { key: 'satelliteComm', label: 'Satellite Comms' },
                        ].map((flag) => (
                          <label key={flag.key} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={orgForm[flag.key]}
                              onChange={(e) =>
                                setOrgForm((p) => ({ ...p, [flag.key]: e.target.checked }))
                              }
                              className="accent-kaafila-primary"
                            />
                            <span>{flag.label}</span>
                          </label>
                        ))}
                      </div>
                      <input
                        type="text"
                        placeholder="Emergency protocol summary..."
                        value={orgForm.medicalSummary}
                        onChange={(e) => setOrgForm((p) => ({ ...p, medicalSummary: e.target.value }))}
                        className="w-full rounded-xl border border-kaafila-border bg-kaafila-surface px-3 py-2 text-xs text-kaafila-text"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingOrg}
                      className="rounded-xl bg-kaafila-primary px-6 py-3 text-xs font-bold uppercase tracking-wider text-kaafila-dark shadow-blue hover:bg-kaafila-primary-hover transition disabled:opacity-50"
                    >
                      {savingOrg ? 'Saving Profile...' : 'Save Organisation Profile'}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* MANAGE EXPEDITIONS SECTION */}
            {section === 'rides' && (
              <section className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-kaafila-primary/25 bg-kaafila-surface p-6">
                  <div>
                    <span className="font-mono text-xs uppercase tracking-widest text-kaafila-accent">
                      Expedition Inventory
                    </span>
                    <h2 className="mt-1 font-display text-3xl font-bold uppercase text-kaafila-text">
                      Manage Expeditions ({expeditions.length})
                    </h2>
                  </div>
                  <Link
                    to="/dashboard/organisation/create"
                    onClick={handleResetCreateForm}
                    className="inline-flex items-center gap-2 rounded-xl bg-kaafila-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-dark"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create Expedition</span>
                  </Link>
                </div>

                {expeditions.length === 0 ? (
                  <div className="rounded-3xl border border-kaafila-border bg-kaafila-surface p-10 text-center">
                    <p className="text-sm text-kaafila-muted">You have not created any expeditions yet.</p>
                    <Link
                      to="/dashboard/organisation/create"
                      onClick={handleResetCreateForm}
                      className="mt-4 inline-block rounded-xl bg-kaafila-primary px-5 py-2.5 text-xs font-bold uppercase text-kaafila-dark"
                    >
                      Create Your First Expedition
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {expeditions.map((ride) => (
                      <article
                        key={ride._id}
                        className="flex flex-col gap-5 rounded-2xl border border-kaafila-border bg-kaafila-surface p-5 sm:flex-row"
                      >
                        <img
                          src={ride.coverImageUrl || '/images/expedition-ladakh.png'}
                          alt={ride.title}
                          className="h-36 w-full rounded-xl object-cover sm:w-48"
                        />
                        <div className="flex flex-1 flex-col justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded bg-kaafila-primary/15 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase text-kaafila-accent">
                                {ride.status}
                              </span>
                              <span className="font-mono text-xs text-kaafila-muted">
                                {ride.region} · {ride.durationDays}D · ₹{Number(ride.priceInr || 0).toLocaleString('en-IN')}
                              </span>
                            </div>
                            <h3 className="mt-1.5 font-display text-2xl font-bold text-kaafila-text">
                              {ride.title}
                            </h3>
                            <p className="mt-1 text-xs text-kaafila-muted">
                              {ride.startLocation} → {ride.endLocation} ·{' '}
                              {new Date(ride.startDate).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}{' '}
                              · {ride.participantCount || 0} recorded rider(s) · {ride.spotsRemaining}/{ride.maxRiders} open
                            </p>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-2.5">
                            {ride.status !== 'draft' && (
                              <Link
                                to={`/rides/${ride.slug}`}
                                className="rounded-xl border border-kaafila-border px-3.5 py-2 text-xs font-semibold text-kaafila-text hover:border-kaafila-primary hover:text-kaafila-accent"
                              >
                                View Listing
                              </Link>
                            )}
                            <button
                              type="button"
                              onClick={() => startEditRide(ride)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-kaafila-primary/40 px-3.5 py-2 text-xs font-semibold text-kaafila-accent hover:bg-kaafila-primary/10"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(ride)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/35 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-500/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* CREATE / EDIT EXPEDITION SECTION */}
            {section === 'create' && (
              <section className="rounded-3xl border border-kaafila-primary/25 bg-kaafila-surface p-6 shadow-card sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-kaafila-border pb-5">
                  <div>
                    <span className="font-mono text-xs uppercase tracking-widest text-kaafila-accent">
                      {editingRideId ? 'Update Expedition' : 'Launch New Route'}
                    </span>
                    <h2 className="mt-1 font-display text-3xl font-bold uppercase text-kaafila-text">
                      {editingRideId ? 'Edit Expedition' : 'Create Expedition'}
                    </h2>
                  </div>
                  {editingRideId && (
                    <button
                      type="button"
                      onClick={handleResetCreateForm}
                      className="rounded-xl border border-kaafila-border px-3.5 py-2 text-xs font-semibold text-kaafila-muted hover:text-kaafila-text"
                    >
                      Switch to Create New
                    </button>
                  )}
                </div>

                <form onSubmit={handleSaveExpedition} className="mt-6 space-y-6">
                  <ImageUploadField
                    label="Expedition Cover Image"
                    aspect="wide"
                    value={rideForm.coverImageUrl}
                    onChange={(url) => setRideForm((p) => ({ ...p, coverImageUrl: url }))}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Expedition Title *
                      </label>
                      <input
                        type="text"
                        required
                        value={rideForm.title}
                        onChange={(e) => setRideForm((p) => ({ ...p, title: e.target.value }))}
                        placeholder="e.g., Zanskar Autumn Pass Crossing"
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Destination / Region *
                      </label>
                      <input
                        type="text"
                        required
                        value={rideForm.region}
                        onChange={(e) => setRideForm((p) => ({ ...p, region: e.target.value }))}
                        placeholder="e.g., Ladakh, Spiti Valley"
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                      Short Tagline
                    </label>
                    <input
                      type="text"
                      value={rideForm.tagline}
                      onChange={(e) => setRideForm((p) => ({ ...p, tagline: e.target.value }))}
                      placeholder="Concise one-line expedition hook"
                      className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                      Full Expedition Description
                    </label>
                    <textarea
                      rows={3}
                      value={rideForm.description}
                      onChange={(e) => setRideForm((p) => ({ ...p, description: e.target.value }))}
                      placeholder="Describe terrain, acclimatisation schedule, and riding experience..."
                      className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Starting Location *
                      </label>
                      <input
                        type="text"
                        required
                        value={rideForm.startLocation}
                        onChange={(e) => setRideForm((p) => ({ ...p, startLocation: e.target.value }))}
                        placeholder="Manali"
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-3.5 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Ending Location *
                      </label>
                      <input
                        type="text"
                        required
                        value={rideForm.endLocation}
                        onChange={(e) => setRideForm((p) => ({ ...p, endLocation: e.target.value }))}
                        placeholder="Leh"
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-3.5 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Start Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={rideForm.startDate}
                        onChange={(e) => setRideForm((p) => ({ ...p, startDate: e.target.value }))}
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-3.5 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        End Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={rideForm.endDate}
                        onChange={(e) => setRideForm((p) => ({ ...p, endDate: e.target.value }))}
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-3.5 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-primary"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Duration (Days) *
                      </label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={rideForm.durationDays}
                        onChange={(e) => setRideForm((p) => ({ ...p, durationDays: e.target.value }))}
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-3 py-2 text-sm text-kaafila-text"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Distance (km)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={rideForm.distanceKm}
                        onChange={(e) => setRideForm((p) => ({ ...p, distanceKm: e.target.value }))}
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-3 py-2 text-sm text-kaafila-text"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Max Alt (m)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={rideForm.maxAltitudeMeters}
                        onChange={(e) => setRideForm((p) => ({ ...p, maxAltitudeMeters: e.target.value }))}
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-3 py-2 text-sm text-kaafila-text"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Price (₹) *
                      </label>
                      <input
                        type="number"
                        min={0}
                        required
                        value={rideForm.priceInr}
                        onChange={(e) => setRideForm((p) => ({ ...p, priceInr: e.target.value }))}
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-3 py-2 text-sm text-kaafila-text"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Max Capacity *
                      </label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={rideForm.maxRiders}
                        onChange={(e) => setRideForm((p) => ({ ...p, maxRiders: e.target.value }))}
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-3 py-2 text-sm text-kaafila-text"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Status
                      </label>
                      <select
                        value={rideForm.status}
                        onChange={(e) => setRideForm((p) => ({ ...p, status: e.target.value }))}
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-3 py-2 text-sm text-kaafila-text"
                      >
                        <option value="published">Published</option>
                        <option value="draft">Draft (Private)</option>
                        <option value="upcoming">Upcoming</option>
                        <option value="ongoing">Ongoing</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Difficulty
                      </label>
                      <select
                        value={rideForm.difficulty}
                        onChange={(e) => setRideForm((p) => ({ ...p, difficulty: e.target.value }))}
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-3.5 py-2.5 text-sm text-kaafila-text"
                      >
                        <option value="moderate">Moderate</option>
                        <option value="challenging">Challenging</option>
                        <option value="extreme">Extreme</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Official Booking URL
                      </label>
                      <input
                        type="url"
                        value={rideForm.bookingUrl}
                        onChange={(e) => setRideForm((p) => ({ ...p, bookingUrl: e.target.value }))}
                        placeholder="https://... (defaults to org booking URL)"
                        className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-3.5 py-2.5 text-sm text-kaafila-text"
                      />
                    </div>
                    <div className="flex items-end pb-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-kaafila-text">
                        <input
                          type="checkbox"
                          checked={rideForm.bikeRentalAvailable}
                          onChange={(e) =>
                            setRideForm((p) => ({ ...p, bikeRentalAvailable: e.target.checked }))
                          }
                          className="accent-kaafila-primary"
                        />
                        Bike Rental Available on This Ride
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                      Facilities Summary (Stay, Food, Backup)
                    </label>
                    <input
                      type="text"
                      value={rideForm.facilitiesSummary}
                      onChange={(e) => setRideForm((p) => ({ ...p, facilitiesSummary: e.target.value }))}
                      placeholder="e.g., Heated camps, MAP meals, 4x4 sweep truck with oxygen & mechanic"
                      className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text"
                    />
                  </div>

                  {/* Day-by-day Itinerary Builder */}
                  <div className="rounded-2xl border border-kaafila-border bg-kaafila-bg p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-lg font-bold uppercase text-kaafila-accent">
                        Day-by-Day Itinerary
                      </h3>
                      <button
                        type="button"
                        onClick={() =>
                          setRideForm((p) => ({
                            ...p,
                            itinerary: [
                              ...p.itinerary,
                              {
                                day: p.itinerary.length + 1,
                                title: '',
                                route: '',
                                description: '',
                                altitudeMeters: '',
                              },
                            ],
                          }))
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-kaafila-primary/40 px-3 py-1.5 text-xs font-semibold text-kaafila-accent hover:bg-kaafila-primary/10"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Day
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {rideForm.itinerary.map((day, idx) => (
                        <div
                          key={idx}
                          className="grid gap-3 rounded-xl border border-kaafila-border bg-kaafila-surface p-3.5 sm:grid-cols-12"
                        >
                          <div className="sm:col-span-4">
                            <input
                              type="text"
                              placeholder={`Day ${idx + 1} Title (e.g. Manali to Jispa)`}
                              value={day.title}
                              onChange={(e) => {
                                const next = [...rideForm.itinerary];
                                next[idx] = { ...next[idx], title: e.target.value, day: idx + 1 };
                                setRideForm((p) => ({ ...p, itinerary: next }));
                              }}
                              className="w-full rounded-lg border border-kaafila-border bg-kaafila-bg px-3 py-2 text-xs text-kaafila-text"
                            />
                          </div>
                          <div className="sm:col-span-5">
                            <input
                              type="text"
                              placeholder="Route notes & stops"
                              value={day.description}
                              onChange={(e) => {
                                const next = [...rideForm.itinerary];
                                next[idx] = { ...next[idx], description: e.target.value };
                                setRideForm((p) => ({ ...p, itinerary: next }));
                              }}
                              className="w-full rounded-lg border border-kaafila-border bg-kaafila-bg px-3 py-2 text-xs text-kaafila-text"
                            />
                          </div>
                          <div className="flex items-center gap-2 sm:col-span-3">
                            <input
                              type="number"
                              placeholder="Alt (m)"
                              value={day.altitudeMeters}
                              onChange={(e) => {
                                const next = [...rideForm.itinerary];
                                next[idx] = { ...next[idx], altitudeMeters: e.target.value };
                                setRideForm((p) => ({ ...p, itinerary: next }));
                              }}
                              className="w-full rounded-lg border border-kaafila-border bg-kaafila-bg px-2.5 py-2 text-xs text-kaafila-text"
                            />
                            {rideForm.itinerary.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setRideForm((p) => ({
                                    ...p,
                                    itinerary: p.itinerary
                                      .filter((_, i) => i !== idx)
                                      .map((d, i) => ({ ...d, day: i + 1 })),
                                  }))
                                }
                                className="rounded-lg border border-red-500/30 p-2 text-red-700 hover:bg-red-500/10"
                                aria-label="Remove itinerary day"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <Link
                      to="/dashboard/organisation/rides"
                      className="rounded-xl border border-kaafila-border px-5 py-3 text-xs font-semibold uppercase text-kaafila-text"
                    >
                      Cancel
                    </Link>
                    <button
                      type="submit"
                      disabled={savingRide}
                      className="rounded-xl bg-kaafila-primary px-6 py-3 text-xs font-bold uppercase tracking-wider text-kaafila-dark shadow-blue hover:bg-kaafila-primary-hover disabled:opacity-50"
                    >
                      {savingRide
                        ? 'Saving...'
                        : editingRideId
                          ? 'Update Expedition'
                          : 'Save Expedition'}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* MANAGE RIDERS SECTION */}
            {section === 'riders' && (
              <section className="space-y-5">
                <div className="rounded-3xl border border-kaafila-primary/25 bg-kaafila-surface p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <span className="font-mono text-xs uppercase tracking-widest text-kaafila-accent">
                        Participant Roster
                      </span>
                      <h2 className="mt-1 font-display text-3xl font-bold uppercase text-kaafila-text">
                        Manage Riders
                      </h2>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <select
                        value={ridersFilterRide}
                        onChange={(e) => {
                          setRidersFilterRide(e.target.value);
                          setRidersPage(1);
                        }}
                        className="rounded-xl border border-kaafila-border bg-kaafila-bg px-3.5 py-2 text-xs text-kaafila-text"
                      >
                        <option value="">All Expeditions</option>
                        {expeditions.map((r) => (
                          <option key={r._id} value={r._id}>
                            {r.title}
                          </option>
                        ))}
                      </select>

                      <select
                        value={ridersFilterStatus}
                        onChange={(e) => {
                          setRidersFilterStatus(e.target.value);
                          setRidersPage(1);
                        }}
                        className="rounded-xl border border-kaafila-border bg-kaafila-bg px-3.5 py-2 text-xs text-kaafila-text"
                      >
                        <option value="all">All Statuses</option>
                        <option value="interested">Interested</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>

                  <p className="mt-4 rounded-xl border border-kaafila-primary/20 bg-kaafila-bg px-4 py-2.5 text-xs text-kaafila-muted">
                    <Lock className="mr-1.5 inline h-3.5 w-3.5 text-kaafila-accent" />
                    Rider phone, email, and emergency contacts remain private unless participation is{' '}
                    <strong>confirmed</strong>/<strong>completed</strong> and the rider explicitly opted in to share contact details.
                  </p>
                </div>

                {ridersLoading ? (
                  <div className="h-48 animate-pulse rounded-2xl bg-kaafila-surface" />
                ) : ridersList.length === 0 ? (
                  <div className="rounded-3xl border border-kaafila-border bg-kaafila-surface p-10 text-center text-sm text-kaafila-muted">
                    No riders have registered interest for the selected filter yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {ridersList.map((member) => (
                      <div
                        key={member._id}
                        className="flex flex-col justify-between gap-4 rounded-2xl border border-kaafila-border bg-kaafila-surface p-5 lg:flex-row lg:items-center"
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-kaafila-primary/35 bg-kaafila-bg">
                            {member.user?.avatarUrl ? (
                              <img
                                src={member.user.avatarUrl}
                                alt={member.user.fullName}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="font-display text-lg font-bold text-kaafila-accent">
                                {member.user?.fullName?.slice(0, 1).toUpperCase() || 'R'}
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-display text-xl font-bold text-kaafila-text">
                                {member.user?.fullName || 'Rider'}
                              </h3>
                              {member.riderProfile?.handle && (
                                <Link
                                  to={`/riders/${member.riderProfile.handle}`}
                                  className="font-mono text-xs text-kaafila-accent hover:underline"
                                >
                                  @{member.riderProfile.handle}
                                </Link>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-kaafila-muted">
                              Expedition: <strong className="text-kaafila-text">{member.ride?.title}</strong> ·{' '}
                              Bike: {member.bikeChoice === 'own_bike' ? 'Own Bike' : 'Rental'} · City:{' '}
                              {member.user?.city || 'India'}
                            </p>

                            <div className="mt-2">
                              {member.contactAuthorized ? (
                                <p className="font-mono text-xs text-emerald-700">
                                  Authorized Contact: {member.user?.email}
                                  {member.user?.phoneNumber ? ` · ${member.user.phoneNumber}` : ''}
                                  {member.riderProfile?.emergencyContact?.phone
                                    ? ` · Emergency: ${member.riderProfile.emergencyContact.name} (${member.riderProfile.emergencyContact.phone})`
                                    : ''}
                                </p>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-kaafila-muted">
                                  <ShieldAlert className="h-3.5 w-3.5 text-kaafila-accent" />
                                  Contact details private (requires confirmed status + rider opt-in)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg bg-kaafila-bg px-3 py-1.5 font-mono text-xs uppercase text-kaafila-accent">
                            {member.status}
                          </span>
                          <select
                            aria-label={`Update status for ${member.user?.fullName}`}
                            value={member.status}
                            onChange={(e) =>
                              handleUpdateParticipantStatus(member.ride._id, member._id, e.target.value)
                            }
                            className="rounded-xl border border-kaafila-primary/35 bg-kaafila-bg px-3 py-1.5 text-xs font-semibold text-kaafila-text"
                          >
                            <option value="interested">Interested</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </div>
                      </div>
                    ))}

                    {ridersTotalPages > 1 && (
                      <div className="flex items-center justify-center gap-2 pt-2">
                        <button
                          type="button"
                          disabled={ridersPage <= 1}
                          onClick={() => setRidersPage((p) => Math.max(1, p - 1))}
                          className="rounded-lg border border-kaafila-border px-3 py-1.5 text-xs text-kaafila-text disabled:opacity-40"
                        >
                          Previous
                        </button>
                        <span className="font-mono text-xs text-kaafila-muted">
                          Page {ridersPage} of {ridersTotalPages}
                        </span>
                        <button
                          type="button"
                          disabled={ridersPage >= ridersTotalPages}
                          onClick={() => setRidersPage((p) => Math.min(ridersTotalPages, p + 1))}
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

            {/* ANALYTICS SECTION (MongoDB Aggregations Only) */}
            {section === 'analytics' && (
              <section className="space-y-6">
                <div className="rounded-3xl border border-kaafila-primary/25 bg-kaafila-surface p-6">
                  <span className="font-mono text-xs uppercase tracking-widest text-kaafila-accent">
                    Genuine Database Aggregations
                  </span>
                  <h2 className="mt-1 font-display text-3xl font-bold uppercase text-kaafila-text">
                    Organisation Analytics
                  </h2>
                  <p className="mt-1 text-xs text-kaafila-muted">
                    Metrics are computed directly from MongoDB expedition and rider participation records.
                  </p>
                </div>

                {analyticsLoading || !analyticsData ? (
                  <div className="h-56 animate-pulse rounded-3xl bg-kaafila-surface" />
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {[
                        {
                          label: 'Total Published Expeditions',
                          value: analyticsData.summary.totalPublishedExpeditions,
                        },
                        {
                          label: 'Recorded Rider Registrations',
                          value: analyticsData.summary.recordedRegistrations,
                        },
                        {
                          label: 'Upcoming Expeditions',
                          value: analyticsData.summary.upcomingExpeditions,
                        },
                        {
                          label: 'Completed Expeditions',
                          value: analyticsData.summary.completedExpeditions,
                        },
                      ].map((metric) => (
                        <div
                          key={metric.label}
                          className="rounded-2xl border border-kaafila-border bg-kaafila-surface p-5"
                        >
                          <span className="text-xs uppercase text-kaafila-muted">{metric.label}</span>
                          <p className="mt-2 font-mono text-3xl font-bold text-kaafila-accent">
                            {metric.value}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-3xl border border-kaafila-border bg-kaafila-surface p-6">
                      <h3 className="font-display text-2xl font-bold uppercase text-kaafila-text">
                        Expedition-Wise Participation
                      </h3>
                      {analyticsData.expeditionWiseParticipation.length === 0 ? (
                        <p className="mt-4 text-sm text-kaafila-muted">No expeditions created yet.</p>
                      ) : (
                        <div className="mt-5 space-y-4">
                          {analyticsData.expeditionWiseParticipation.map((row) => {
                            const fillPct = Math.min(
                              100,
                              Math.round((row.totalActiveRegistrations / Math.max(1, row.maxRiders)) * 100)
                            );
                            return (
                              <div
                                key={row._id}
                                className="rounded-2xl border border-kaafila-border bg-kaafila-bg p-4"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <span className="font-display text-lg font-bold text-kaafila-text">
                                      {row.title}
                                    </span>
                                    <span className="ml-2 rounded bg-kaafila-surface px-2 py-0.5 font-mono text-[10px] uppercase text-kaafila-accent">
                                      {row.status}
                                    </span>
                                  </div>
                                  <span className="font-mono text-xs text-kaafila-muted">
                                    {row.confirmedCount + row.completedCount} confirmed · {row.interestedCount}{' '}
                                    interested · {row.cancelledCount} cancelled (Cap {row.maxRiders})
                                  </span>
                                </div>
                                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-kaafila-elevated">
                                  <div
                                    className="h-full bg-kaafila-primary transition-all"
                                    style={{ width: `${fillPct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>
            )}

            {/* ROUTES & CHECKPOINTS SECTION */}
            {section === 'routes' && (
              <OrgRouteManagerPanel expeditions={dashboard?.expeditions || []} />
            )}

            {/* ACCOUNT SETTINGS SECTION */}
            {section === 'settings' && (
              <section className="rounded-3xl border border-kaafila-primary/25 bg-kaafila-surface p-6 shadow-card sm:p-8">
                <span className="font-mono text-xs uppercase tracking-widest text-kaafila-accent">
                  Operator Account &amp; Verification
                </span>
                <h2 className="mt-1 font-display text-3xl font-bold uppercase text-kaafila-text">
                  Account Settings
                </h2>

                <div className="mt-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-kaafila-border bg-kaafila-bg p-4">
                    <div>
                      <p className="text-xs uppercase text-kaafila-muted">Official Account Email</p>
                      <p className="mt-1 font-mono text-sm text-kaafila-text">{user.email}</p>
                    </div>
                    <span className="rounded-full border border-kaafila-primary/40 bg-kaafila-primary/10 px-3 py-1 font-mono text-xs uppercase text-kaafila-accent">
                      Role: {user.role}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-kaafila-border bg-kaafila-bg p-4">
                    <div>
                      <p className="text-xs uppercase text-kaafila-muted">Verification Status</p>
                      <p className="mt-1 text-sm text-kaafila-text capitalize">
                        {org?.verificationStatus || 'pending'}
                      </p>
                    </div>
                    <span className="text-xs text-kaafila-muted">
                      Controlled exclusively by KAAFILA review
                    </span>
                  </div>

                  {org?.slug && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-kaafila-border bg-kaafila-bg p-4">
                      <div>
                        <p className="text-xs uppercase text-kaafila-muted">Public Marketplace Slug</p>
                        <p className="mt-1 font-mono text-sm text-kaafila-text">/organisations/{org.slug}</p>
                      </div>
                      <Link
                        to={`/organisations/${org.slug}`}
                        className="rounded-xl border border-kaafila-primary/40 px-4 py-2 text-xs font-bold uppercase text-kaafila-accent hover:bg-kaafila-primary/10"
                      >
                        Open Public Page
                      </Link>
                    </div>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Expedition?"
        message={`Are you sure you want to permanently delete "${deleteTarget?.title || 'this expedition'}" and its KAAFILA roster records? This action cannot be undone.`}
        confirmLabel="Delete Expedition"
        loading={deletingRide}
        onConfirm={handleConfirmDeleteRide}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

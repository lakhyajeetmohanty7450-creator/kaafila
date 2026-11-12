import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  Search,
  MapPin,
  Lock,
  Globe,
  ShieldCheck,
  Plus,
  Calendar,
  Compass,
  X,
  Check,
  Clock,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ImageUploadField from '../components/ImageUploadField';

function privacyMeta(privacy) {
  if (privacy === 'private') {
    return { label: 'Private', Icon: Lock, cls: 'border-amber-500/35 bg-amber-500/10 text-amber-300' };
  }
  if (privacy === 'invite_only') {
    return { label: 'Invite Only', Icon: ShieldCheck, cls: 'border-purple-400/35 bg-purple-400/10 text-purple-300' };
  }
  return { label: 'Public', Icon: Globe, cls: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300' };
}

export default function GroupsPage() {
  const { user, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [groups, setGroups] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [busyGroupId, setBusyGroupId] = useState(null);

  const [search, setSearch] = useState('');
  const [destination, setDestination] = useState('');
  const [privacyTab, setPrivacyTab] = useState('all'); // all | public | private | mine
  const [page, setPage] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [ridesOptions, setRidesOptions] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    destination: '',
    startDate: '',
    maxMembers: 25,
    privacy: 'public',
    description: '',
    coverImageUrl: '',
    rideId: '',
  });

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        search: search.trim() || undefined,
        destination: destination.trim() || undefined,
        page,
        limit: 12,
      };
      if (privacyTab === 'mine') {
        params.mine = 'true';
      } else if (privacyTab !== 'all') {
        params.privacy = privacyTab;
      }
      const { data } = await api.get('/groups', { params });
      setGroups(data?.data || []);
      setPagination(data?.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load groups.', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, destination, privacyTab, page, showToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadGroups();
    }, 200);
    return () => clearTimeout(timer);
  }, [loadGroups]);

  const openCreateModal = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setShowCreate(true);
    try {
      const { data } = await api.get('/rides', { params: { limit: 30 } });
      setRidesOptions(data?.data || []);
    } catch {
      // Optional expedition link
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast('Group name is required.', 'error');
      return;
    }
    setCreating(true);
    try {
      const { data } = await api.post('/groups', {
        ...form,
        maxMembers: Number(form.maxMembers) || 25,
      });
      showToast('KAAFILA group created!', 'success');
      setShowCreate(false);
      setForm({
        name: '',
        destination: '',
        startDate: '',
        maxMembers: 25,
        privacy: 'public',
        description: '',
        coverImageUrl: '',
        rideId: '',
      });
      navigate(`/community/groups/${data.data.slug}`);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not create group.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinAction = async (group) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setBusyGroupId(group._id);
    try {
      if (group.myMembership?.status === 'invited') {
        const { data } = await api.post(`/groups/${group._id}/accept-invite`);
        showToast(data?.message || 'Invitation accepted.', 'success');
        navigate(`/community/groups/${group.slug}`);
      } else {
        const { data } = await api.post(`/groups/${group._id}/join`);
        showToast(data?.message || 'Updated group membership.', 'success');
        await loadGroups();
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not complete request.', 'error');
    } finally {
      setBusyGroupId(null);
    }
  };

  const tabs = [
    { id: 'all', label: 'All Groups' },
    { id: 'public', label: 'Public' },
    { id: 'private', label: 'Private' },
    ...(isAuthenticated ? [{ id: 'mine', label: 'My Groups' }] : []),
  ];

  return (
    <div className="min-h-screen bg-kaafila-bg pb-20 pt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-kaafila-yellow/20 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              to="/community"
              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-kaafila-yellow hover:underline"
            >
              <Compass className="h-3.5 w-3.5" />
              Community Hub
            </Link>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-wide text-kaafila-text sm:text-4xl">
              KAAFILA Riding Groups
            </h1>
            <p className="mt-1 text-sm text-kaafila-muted">
              Join destination squads, coordinate departures in real-time group chat, and follow
              marshal announcements.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-kaafila-yellow px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-bg hover:bg-kaafila-yellowHover transition"
          >
            <Plus className="h-4 w-4" />
            Create Group
          </button>
        </div>

        {/* Search & Filter */}
        <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-white/10 bg-kaafila-surface p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-kaafila-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search groups by name, destination or keyword..."
                className="w-full rounded-xl border border-white/10 bg-kaafila-bg py-2.5 pl-9 pr-3 text-sm text-kaafila-text placeholder:text-kaafila-muted/60 outline-none focus:border-kaafila-yellow"
              />
            </div>

            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-kaafila-muted" />
              <input
                type="text"
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  setPage(1);
                }}
                placeholder="Filter by destination (e.g. Ladakh)"
                className="w-full rounded-xl border border-white/10 bg-kaafila-bg py-2.5 pl-9 pr-3 text-sm text-kaafila-text placeholder:text-kaafila-muted/60 outline-none focus:border-kaafila-yellow"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setPrivacyTab(t.id);
                    setPage(1);
                  }}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                    privacyTab === t.id
                      ? 'bg-kaafila-yellow text-kaafila-bg font-bold'
                      : 'border border-white/10 bg-kaafila-bg text-kaafila-muted hover:text-kaafila-text'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <span className="text-xs text-kaafila-muted">
              {loading ? 'Loading groups...' : `${pagination.total} group(s)`}
            </span>
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="h-80 animate-pulse rounded-2xl border border-white/10 bg-kaafila-surface/60"
              />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-kaafila-surface p-10 text-center">
            <Users className="mx-auto h-10 w-10 text-kaafila-yellow/60" />
            <h2 className="mt-3 font-display text-xl font-bold text-kaafila-text">
              No KAAFILA Groups Found
            </h2>
            <p className="mt-1 text-sm text-kaafila-muted">
              Try another filter or start a new riding group for your upcoming route.
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-kaafila-yellow px-4 py-2 text-xs font-bold uppercase tracking-wider text-kaafila-bg"
            >
              <Plus className="h-4 w-4" />
              Create Riding Group
            </button>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => {
              const meta = privacyMeta(group.privacy);
              const PrivacyIcon = meta.Icon;
              const membershipStatus = group.myMembership?.status;
              const isBusy = busyGroupId === group._id;

              return (
                <article
                  key={group._id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-kaafila-surface transition hover:border-kaafila-yellow/40"
                >
                  <Link
                    to={`/community/groups/${group.slug}`}
                    className="relative block h-44 overflow-hidden bg-kaafila-bg"
                  >
                    <img
                      src={group.coverImageUrl || '/images/community-camp.png'}
                      alt={group.name}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-kaafila-surface via-transparent to-black/40" />

                    <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur-md ${meta.cls}`}
                      >
                        <PrivacyIcon className="h-3 w-3" />
                        {meta.label}
                      </span>
                      {group.isDemo && (
                        <span className="rounded-full border border-kaafila-yellow/40 bg-black/70 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-kaafila-yellow">
                          Demo Group
                        </span>
                      )}
                    </div>
                  </Link>

                  <div className="flex flex-1 flex-col justify-between p-5">
                    <div>
                      <Link
                        to={`/community/groups/${group.slug}`}
                        className="block font-display text-2xl font-bold text-kaafila-text group-hover:text-kaafila-yellow transition"
                      >
                        {group.name}
                      </Link>

                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-kaafila-muted">
                        {group.destination && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-kaafila-yellow" />
                            {group.destination}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-kaafila-yellow" />
                          {group.memberCount} / {group.maxMembers} riders
                        </span>
                        {group.startDate && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-kaafila-yellow" />
                            {new Date(group.startDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      {group.description && (
                        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-kaafila-muted">
                          {group.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-5 flex items-center gap-2 border-t border-white/10 pt-4">
                      <Link
                        to={`/community/groups/${group.slug}`}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-kaafila-bg px-3 py-2 text-xs font-semibold text-kaafila-text hover:border-kaafila-yellow/40 transition"
                      >
                        <span>{membershipStatus === 'active' ? 'Open Chat' : 'View Group'}</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>

                      {membershipStatus === 'active' ? (
                        <span className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300">
                          <Check className="h-3.5 w-3.5" />
                          Joined
                        </span>
                      ) : membershipStatus === 'pending_request' ? (
                        <span className="inline-flex items-center gap-1 rounded-xl border border-kaafila-yellow/35 bg-kaafila-yellow/10 px-3 py-2 text-xs font-semibold text-kaafila-yellow">
                          <Clock className="h-3.5 w-3.5" />
                          Pending
                        </span>
                      ) : membershipStatus === 'invited' ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleJoinAction(group)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-kaafila-bg hover:bg-emerald-400 transition disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Accept Invite'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleJoinAction(group)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-kaafila-yellow px-3.5 py-2 text-xs font-bold text-kaafila-bg hover:bg-kaafila-yellowHover transition disabled:opacity-50"
                        >
                          {isBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : group.privacy === 'private' ? (
                            'Request Access'
                          ) : (
                            'Join Group'
                          )}
                        </button>
                      )}
                    </div>
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
              className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-kaafila-text disabled:opacity-40"
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
              className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-kaafila-text disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl rounded-2xl border border-kaafila-yellow/35 bg-kaafila-surface p-6 shadow-card">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-kaafila-text">
                  Create a KAAFILA Group
                </h2>
                <p className="text-xs text-kaafila-muted">
                  Organise a route squad with live chat, roster controls, and marshal alerts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-1.5 text-kaafila-muted hover:text-kaafila-text"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                  Group Name *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Zanskar Valley July Convoy"
                  className="w-full rounded-xl border border-white/10 bg-kaafila-bg px-3.5 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-yellow"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                    Destination / Route
                  </label>
                  <input
                    type="text"
                    value={form.destination}
                    onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                    placeholder="e.g. Leh - Hanle - Umling La"
                    className="w-full rounded-xl border border-white/10 bg-kaafila-bg px-3.5 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-yellow"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                    Privacy Setting
                  </label>
                  <select
                    value={form.privacy}
                    onChange={(e) => setForm((f) => ({ ...f, privacy: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-kaafila-bg px-3.5 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-yellow"
                  >
                    <option value="public">Public (Anyone can join)</option>
                    <option value="private">Private (Requires approval)</option>
                    <option value="invite_only">Invite Only (Hidden unless invited)</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                    Departure Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-kaafila-bg px-3.5 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-yellow"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                    Max Rider Capacity
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={500}
                    value={form.maxMembers}
                    onChange={(e) => setForm((f) => ({ ...f, maxMembers: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-kaafila-bg px-3.5 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-yellow"
                  />
                </div>
              </div>

              {ridesOptions.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                    Link Expedition (Optional)
                  </label>
                  <select
                    value={form.rideId}
                    onChange={(e) => setForm((f) => ({ ...f, rideId: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-kaafila-bg px-3.5 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-yellow"
                  >
                    <option value="">None (Independent Rider Group)</option>
                    {ridesOptions.map((r) => (
                      <option key={r._id} value={r._id}>
                        {r.title} ({r.region})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                  Group Description
                </label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Share pace guidelines, riding dates, bike readiness expectations..."
                  className="w-full rounded-xl border border-white/10 bg-kaafila-bg px-3.5 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-yellow"
                />
              </div>

              <ImageUploadField
                label="Cover Image (Optional)"
                value={form.coverImageUrl}
                onChange={(url) => setForm((f) => ({ ...f, coverImageUrl: url }))}
              />

              <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-kaafila-muted hover:text-kaafila-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-xl bg-kaafila-yellow px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-bg hover:bg-kaafila-yellowHover disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {creating ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Clock,
  MessageSquare,
  Trash2,
  MapPin,
  Bike,
  Award,
  Compass,
  Loader2,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';

export default function ConnectionsPage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { isUserOnline, socket } = useSocket();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState('connected');
  const [connections, setConnections] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [sent, setSent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);

  const loadAll = useCallback(async () => {
    if (!isAuthenticated || user?.role !== 'rider') {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [connRes, reqRes] = await Promise.all([
        api.get('/connections'),
        api.get('/connections/requests'),
      ]);
      setConnections(connRes.data?.data || []);
      setIncoming(reqRes.data?.data?.incoming || []);
      setSent(reqRes.data?.data?.sent || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load connections.', 'error');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.role, showToast]);

  useEffect(() => {
    if (!authLoading) {
      loadAll();
    }
  }, [authLoading, loadAll]);

  // Refresh when a connection notification arrives over Socket.IO
  useEffect(() => {
    if (!socket) return;
    const onNotif = (notif) => {
      if (notif?.type === 'connection_request' || notif?.type === 'connection_accepted') {
        loadAll();
      }
    };
    socket.on('notification:new', onNotif);
    return () => socket.off('notification:new', onNotif);
  }, [socket, loadAll]);

  const handleAccept = async (conn) => {
    setBusyId(conn._id);
    try {
      const { data } = await api.put(`/connections/${conn._id}/accept`);
      showToast(data?.message || 'Connection request accepted.', 'success');
      await loadAll();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to accept request.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (conn) => {
    setBusyId(conn._id);
    try {
      await api.put(`/connections/${conn._id}/reject`);
      showToast('Connection request declined.', 'info');
      setIncoming((prev) => prev.filter((item) => item._id !== conn._id));
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to decline request.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelOrRemove = async (connId, successMsg) => {
    setBusyId(connId);
    try {
      await api.delete(`/connections/${connId}`);
      showToast(successMsg, 'info');
      setConnections((prev) => prev.filter((c) => c._id !== connId));
      setSent((prev) => prev.filter((c) => c._id !== connId));
      setConfirmRemove(null);
    } catch (err) {
      showToast(err.response?.data?.message || 'Operation failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleMessage = async (targetUserId) => {
    setBusyId(targetUserId);
    try {
      const { data } = await api.post(`/messages/conversations/${targetUserId}`);
      navigate(`/community/messages/${data.data._id}`);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not start chat.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-kaafila-bg text-kaafila-muted">
        Loading connections...
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'rider') {
    return (
      <div className="min-h-screen bg-kaafila-bg px-4 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-kaafila-yellow/30 bg-kaafila-surface p-8 text-center">
          <Users className="mx-auto h-10 w-10 text-kaafila-yellow" />
          <h1 className="mt-4 font-display text-2xl font-bold text-kaafila-text">
            Rider Connections
          </h1>
          <p className="mt-2 text-sm text-kaafila-muted">
            {isAuthenticated
              ? 'Rider connections are only available to Rider accounts. Organisations can connect with riders via KAAFILA Groups.'
              : 'Sign in with a Rider account to connect with fellow Himalayan tourers and message them privately.'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              to={isAuthenticated ? '/community/groups' : '/login'}
              className="rounded-xl bg-kaafila-yellow px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-bg"
            >
              {isAuthenticated ? 'Browse KAAFILA Groups' : 'Rider Sign In'}
            </Link>
            <Link
              to="/community/riders"
              className="rounded-xl border border-white/15 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-kaafila-text"
            >
              Discover Riders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'connected', label: 'Connected Riders', count: connections.length },
    { id: 'incoming', label: 'Incoming Requests', count: incoming.length },
    { id: 'sent', label: 'Sent Requests', count: sent.length },
  ];

  const activeItems =
    tab === 'connected' ? connections : tab === 'incoming' ? incoming : sent;

  return (
    <div className="min-h-screen bg-kaafila-bg pb-20 pt-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
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
              Rider Connections
            </h1>
            <p className="mt-1 text-sm text-kaafila-muted">
              Only accepted connections can exchange 1-on-1 private messages.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Link
              to="/community/riders"
              className="inline-flex items-center gap-2 rounded-xl bg-kaafila-yellow px-4 py-2 text-xs font-bold uppercase tracking-wider text-kaafila-bg hover:bg-kaafila-yellowHover transition"
            >
              <UserPlus className="h-4 w-4" />
              Find Riders
            </Link>
            <Link
              to="/community/messages"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-kaafila-surface px-4 py-2 text-xs font-semibold uppercase tracking-wider text-kaafila-text hover:border-kaafila-yellow/40 transition"
            >
              <MessageSquare className="h-4 w-4 text-kaafila-yellow" />
              Messages
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex flex-wrap gap-2 border-b border-white/10 pb-3">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold uppercase tracking-wider transition ${
                tab === item.id
                  ? 'bg-kaafila-yellow text-kaafila-bg font-bold'
                  : 'border border-white/10 bg-kaafila-surface text-kaafila-muted hover:text-kaafila-text'
              }`}
            >
              <span>{item.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  tab === item.id
                    ? 'bg-kaafila-bg/20 text-kaafila-bg'
                    : 'bg-kaafila-bg text-kaafila-yellow'
                }`}
              >
                {item.count}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-36 animate-pulse rounded-2xl border border-white/10 bg-kaafila-surface/60"
              />
            ))}
          </div>
        ) : activeItems.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-kaafila-surface p-10 text-center">
            <Users className="mx-auto h-10 w-10 text-kaafila-yellow/60" />
            <h2 className="mt-3 font-display text-xl font-bold text-kaafila-text">
              {tab === 'connected'
                ? 'No Rider Connections Yet'
                : tab === 'incoming'
                  ? 'No Incoming Connection Requests'
                  : 'No Pending Sent Requests'}
            </h2>
            <p className="mt-1 text-sm text-kaafila-muted">
              Discover riders across India and send connection requests to build your riding crew.
            </p>
            <Link
              to="/community/riders"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-kaafila-yellow px-4 py-2 text-xs font-bold uppercase tracking-wider text-kaafila-bg"
            >
              Browse Public Riders
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {activeItems.map((item) => {
              const partner = item.user;
              const profile = item.riderProfile;
              const online = isUserOnline(partner._id);
              const isBusy = busyId === item._id || busyId === partner._id;

              return (
                <article
                  key={item._id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-kaafila-surface p-5 sm:flex-row sm:items-center"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="relative h-14 w-14 shrink-0">
                      {partner.avatarUrl ? (
                        <img
                          src={partner.avatarUrl}
                          alt={partner.fullName}
                          className="h-14 w-14 rounded-full border border-kaafila-yellow/40 object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-kaafila-yellow/40 bg-kaafila-bg font-display text-xl font-bold text-kaafila-yellow">
                          {partner.fullName?.charAt(0)?.toUpperCase() || 'R'}
                        </div>
                      )}
                      {tab === 'connected' && online && (
                        <span
                          title="Online now"
                          className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-kaafila-surface bg-emerald-400"
                        />
                      )}
                    </div>

                    <div className="min-w-0">
                      {profile?.handle ? (
                        <Link
                          to={`/riders/${profile.handle}`}
                          className="block truncate font-display text-xl font-bold text-kaafila-text hover:text-kaafila-yellow transition"
                        >
                          {partner.fullName}
                        </Link>
                      ) : (
                        <h3 className="truncate font-display text-xl font-bold text-kaafila-text">
                          {partner.fullName}
                        </h3>
                      )}

                      {profile?.handle && (
                        <p className="text-xs font-mono text-kaafila-yellow/80">
                          @{profile.handle}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-kaafila-muted">
                        {profile?.rank && (
                          <span className="inline-flex items-center gap-1 text-kaafila-yellow">
                            <Award className="h-3.5 w-3.5" />
                            {profile.rank}
                          </span>
                        )}
                        {(partner.city || profile?.homeCity) && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {profile?.homeCity || partner.city}
                          </span>
                        )}
                        {profile?.primaryMotorcycle && (
                          <span className="inline-flex items-center gap-1">
                            <Bike className="h-3.5 w-3.5" />
                            {profile.primaryMotorcycle}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {tab === 'connected' && (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleMessage(partner._id)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-kaafila-yellow px-3.5 py-2 text-xs font-bold text-kaafila-bg hover:bg-kaafila-yellowHover transition disabled:opacity-50"
                        >
                          {isBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <MessageSquare className="h-3.5 w-3.5" />
                          )}
                          Message
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            setConfirmRemove({
                              id: item._id,
                              name: partner.fullName,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition disabled:opacity-50"
                          title="Remove connection"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </>
                    )}

                    {tab === 'incoming' && (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleAccept(item)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-kaafila-bg hover:bg-emerald-400 transition disabled:opacity-50"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleReject(item)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-kaafila-bg px-3.5 py-2 text-xs font-semibold text-kaafila-muted hover:text-red-300 hover:border-red-500/40 transition disabled:opacity-50"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          Decline
                        </button>
                      </>
                    )}

                    {tab === 'sent' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          handleCancelOrRemove(item._id, 'Connection request cancelled.')
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-kaafila-bg px-3.5 py-2 text-xs font-semibold text-kaafila-muted hover:text-red-300 hover:border-red-500/40 transition disabled:opacity-50"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Cancel Request
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(confirmRemove)}
        title="Remove Connection"
        message={`Are you sure you want to remove ${confirmRemove?.name || 'this rider'} from your connections? Private messaging will be locked until you reconnect.`}
        confirmLabel="Remove Connection"
        loading={Boolean(busyId)}
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() =>
          handleCancelOrRemove(confirmRemove.id, 'Connection removed.')
        }
      />
    </div>
  );
}


import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCheck,
  UserPlus,
  MessageSquare,
  Users,
  Megaphone,
  Compass,
  Loader2,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';

function typeIcon(type) {
  switch (type) {
    case 'connection_request':
    case 'connection_accepted':
      return UserPlus;
    case 'private_message':
      return MessageSquare;
    case 'group_announcement':
      return Megaphone;
    case 'group_invitation':
    case 'group_join_request':
    case 'group_join_accepted':
    case 'group_membership':
      return Users;
    default:
      return Bell;
  }
}

export default function NotificationsPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { socket, setUnreadNotifications } = useSocket();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [filterTab, setFilterTab] = useState('all'); // all | unread
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get('/notifications', {
        params: {
          unreadOnly: filterTab === 'unread' ? 'true' : undefined,
          limit: 40,
        },
      });
      setItems(data?.data || []);
      const count = data?.unreadCount || 0;
      setUnreadCount(count);
      setUnreadNotifications(count);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load notifications.', 'error');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, filterTab, setUnreadNotifications, showToast]);

  useEffect(() => {
    if (!authLoading) {
      loadNotifications();
    }
  }, [authLoading, loadNotifications]);

  // Listen for live notifications
  useEffect(() => {
    if (!socket || !isAuthenticated) return;
    const onNew = (notif) => {
      setItems((prev) => (prev.some((n) => n._id === notif._id) ? prev : [notif, ...prev]));
      setUnreadCount((c) => c + 1);
    };
    socket.on('notification:new', onNew);
    return () => socket.off('notification:new', onNew);
  }, [socket, isAuthenticated]);

  const handleMarkRead = async (notif) => {
    try {
      if (!notif.isRead) {
        const { data } = await api.patch(`/notifications/${notif._id}/read`);
        const nextCount = data?.unreadCount ?? Math.max(0, unreadCount - 1);
        setUnreadCount(nextCount);
        setUnreadNotifications(nextCount);
        setItems((prev) =>
          prev
            .map((item) => (item._id === notif._id ? { ...item, isRead: true } : item))
            .filter((item) => (filterTab === 'unread' ? !item.isRead : true))
        );
      }
      if (notif.link) {
        navigate(notif.link);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not mark notification as read.', 'error');
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await api.patch('/notifications/read-all');
      setUnreadCount(0);
      setUnreadNotifications(0);
      setItems((prev) =>
        filterTab === 'unread' ? [] : prev.map((n) => ({ ...n, isRead: true }))
      );
      showToast('All notifications marked as read.', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not mark all as read.', 'error');
    } finally {
      setMarkingAll(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-kaafila-bg text-kaafila-muted">
        Loading notifications...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-kaafila-bg px-4 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-kaafila-yellow/30 bg-kaafila-surface p-8 text-center">
          <Bell className="mx-auto h-10 w-10 text-kaafila-yellow" />
          <h1 className="mt-4 font-display text-2xl font-bold text-kaafila-text">
            Notification Centre
          </h1>
          <p className="mt-2 text-sm text-kaafila-muted">
            Sign in to view connection requests, group invitations, marshal briefings, and chat
            alerts.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-flex rounded-xl bg-kaafila-yellow px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-bg"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-kaafila-bg pb-20 pt-8">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
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
              Notification Centre
            </h1>
            <p className="mt-1 text-sm text-kaafila-muted">
              {unreadCount} unread notification(s) across connections, groups, and messages.
            </p>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              disabled={markingAll}
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-2 rounded-xl border border-kaafila-yellow/40 bg-kaafila-yellow/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-kaafila-yellow hover:bg-kaafila-yellow/20 transition disabled:opacity-50"
            >
              {markingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="h-4 w-4" />
              )}
              Mark All Read
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
              filterTab === 'all'
                ? 'bg-kaafila-yellow text-kaafila-bg'
                : 'border border-white/10 bg-kaafila-surface text-kaafila-muted hover:text-kaafila-text'
            }`}
          >
            All Activity
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('unread')}
            className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
              filterTab === 'unread'
                ? 'bg-kaafila-yellow text-kaafila-bg'
                : 'border border-white/10 bg-kaafila-surface text-kaafila-muted hover:text-kaafila-text'
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="mt-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-2xl border border-white/10 bg-kaafila-surface/60"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-kaafila-surface p-10 text-center">
            <Bell className="mx-auto h-10 w-10 text-kaafila-yellow/60" />
            <h2 className="mt-3 font-display text-xl font-bold text-kaafila-text">
              {filterTab === 'unread' ? 'All Caught Up!' : 'No Notifications Yet'}
            </h2>
            <p className="mt-1 text-sm text-kaafila-muted">
              New connection requests, group invitations, and alerts will appear here in real time.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {items.map((notif) => {
              const Icon = typeIcon(notif.type);
              return (
                <div
                  key={notif._id}
                  onClick={() => handleMarkRead(notif)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleMarkRead(notif)}
                  className={`flex cursor-pointer items-start justify-between gap-4 rounded-2xl border p-4 transition ${
                    notif.isRead
                      ? 'border-white/10 bg-kaafila-surface hover:border-white/25'
                      : 'border-kaafila-yellow/45 bg-kaafila-yellow/5 hover:border-kaafila-yellow'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                        notif.isRead
                          ? 'border-white/10 bg-kaafila-bg text-kaafila-muted'
                          : 'border-kaafila-yellow/40 bg-kaafila-yellow/15 text-kaafila-yellow'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-kaafila-text">{notif.title}</p>
                      {notif.body && (
                        <p className="mt-0.5 text-xs text-kaafila-muted">{notif.body}</p>
                      )}
                      <p className="mt-1.5 text-[11px] text-kaafila-muted/80">
                        {new Date(notif.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {!notif.isRead && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkRead({ ...notif, link: '' });
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-kaafila-yellow/40 bg-kaafila-bg px-2.5 py-1 text-[11px] font-semibold text-kaafila-yellow hover:bg-kaafila-yellow/10"
                    >
                      <Check className="h-3 w-3" />
                      Mark Read
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


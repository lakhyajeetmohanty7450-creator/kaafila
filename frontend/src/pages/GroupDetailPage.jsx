import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Users,
  MessageSquare,
  Megaphone,
  Lock,
  Globe,
  ShieldCheck,
  MapPin,
  Calendar,
  Send,
  Pin,
  Trash2,
  Edit3,
  UserPlus,
  Check,
  X,
  LogOut,
  ChevronUp,
  ArrowLeft,
  Loader2,
  Navigation,
  Radio,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';
import KaafilaMap from '../components/KaafilaMap';

export default function GroupDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { socket, connected } = useSocket();
  const { showToast } = useToast();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState('chat'); // chat | announcements | members

  // Chat state
  const [messages, setMessages] = useState([]);
  const [msgPage, setMsgPage] = useState(1);
  const [msgTotalPages, setMsgTotalPages] = useState(1);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [onlineMemberIds, setOnlineMemberIds] = useState([]);
  const [typingUsers, setTypingUsers] = useState({});

  // Announcement state
  const [annForm, setAnnForm] = useState({ title: '', content: '', isPinned: false });
  const [editingAnn, setEditingAnn] = useState(null);
  const [postingAnn, setPostingAnn] = useState(false);

  // Member management state
  const [inviteHandle, setInviteHandle] = useState('');
  const [inviting, setInviting] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busyAction, setBusyAction] = useState(false);

  // Live Convoy Map state
  const [liveRiders, setLiveRiders] = useState([]);

  const chatBottomRef = useRef(null);
  const typingTimerRef = useRef(null);

  const group = detail?.group;
  const groupId = group?._id;
  const accessGranted = Boolean(detail?.accessGranted);
  const canManage = Boolean(detail?.canManage);

  const loadGroupDetail = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const { data } = await api.get(`/groups/${slug}`);
      setDetail(data?.data || null);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Unable to load KAAFILA group.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!authLoading) {
      loadGroupDetail();
    }
  }, [authLoading, loadGroupDetail]);

  const loadGroupMessages = useCallback(
    async (gId, pageNum = 1, prepend = false) => {
      if (!gId || !accessGranted) return;
      setLoadingMsgs(true);
      try {
        const { data } = await api.get(`/groups/${gId}/messages`, {
          params: { page: pageNum, limit: 40 },
        });
        const items = data?.data || [];
        setMsgPage(data?.pagination?.page || 1);
        setMsgTotalPages(data?.pagination?.totalPages || 1);
        setMessages((prev) => (prepend ? [...items, ...prev] : items));
      } catch (err) {
        showToast(err.response?.data?.message || 'Failed to load group messages.', 'error');
      } finally {
        setLoadingMsgs(false);
      }
    },
    [accessGranted, showToast]
  );

  useEffect(() => {
    if (groupId && accessGranted) {
      loadGroupMessages(groupId, 1, false);
    }
  }, [groupId, accessGranted, loadGroupMessages]);

  useEffect(() => {
    if (msgPage === 1 && chatBottomRef.current && activeTab === 'chat') {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, msgPage, activeTab]);

  // Real-time Socket.IO room for active group members
  useEffect(() => {
    if (!socket || !groupId || !accessGranted) return;

    socket.emit('group:join', groupId, (ack) => {
      if (ack?.ok && Array.isArray(ack.onlineMemberIds)) {
        setOnlineMemberIds(ack.onlineMemberIds);
      }
    });

    const onPresence = ({ groupId: gId, onlineMemberIds: ids }) => {
      if (gId === groupId) setOnlineMemberIds(ids || []);
    };

    const onGroupMessage = (msg) => {
      if (String(msg.group) !== String(groupId)) return;
      setMessages((prev) => (prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]));
      api.patch(`/groups/${groupId}/read`).catch(() => {});
    };

    const onGroupTyping = ({ groupId: gId, userId: uid, fullName, isTyping }) => {
      if (gId !== groupId || uid === user?._id) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (isTyping) next[uid] = fullName;
        else delete next[uid];
        return next;
      });
    };

    const onAnnouncementCreated = (ann) => {
      if (String(ann.group) !== String(groupId)) return;
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              announcements: prev.announcements.some((a) => a._id === ann._id)
                ? prev.announcements
                : [ann, ...prev.announcements],
            }
          : prev
      );
    };

    const onAnnouncementUpdated = (ann) => {
      if (String(ann.group) !== String(groupId)) return;
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              announcements: prev.announcements.map((a) => (a._id === ann._id ? ann : a)),
            }
          : prev
      );
    };

    const onAnnouncementDeleted = ({ announcementId }) => {
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              announcements: prev.announcements.filter((a) => a._id !== announcementId),
            }
          : prev
      );
    };

    const onLocationsSnapshot = ({ groupId: gId, riders = [] }) => {
      if (String(gId) !== String(groupId)) return;
      setLiveRiders(riders);
    };

    const onLocationUpdate = (payload) => {
      if (String(payload.groupId) !== String(groupId)) return;
      setLiveRiders((prev) => {
        const others = prev.filter((r) => String(r.userId) !== String(payload.userId));
        return [...others, payload];
      });
    };

    const onLocationStop = ({ groupId: gId, userId: stoppedUid }) => {
      if (String(gId) !== String(groupId)) return;
      setLiveRiders((prev) => prev.filter((r) => String(r.userId) !== String(stoppedUid)));
    };

    socket.emit('group:location_join', { groupId });
    socket.on('group:presence', onPresence);
    socket.on('group:message', onGroupMessage);
    socket.on('group:typing', onGroupTyping);
    socket.on('group:announcement', onAnnouncementCreated);
    socket.on('group:announcement_updated', onAnnouncementUpdated);
    socket.on('group:announcement_deleted', onAnnouncementDeleted);
    socket.on('group:locations_snapshot', onLocationsSnapshot);
    socket.on('group:location_update', onLocationUpdate);
    socket.on('group:location_stop', onLocationStop);

    return () => {
      socket.emit('group:leave', groupId);
      socket.emit('group:location_leave', { groupId });
      socket.off('group:presence', onPresence);
      socket.off('group:message', onGroupMessage);
      socket.off('group:typing', onGroupTyping);
      socket.off('group:announcement', onAnnouncementCreated);
      socket.off('group:announcement_updated', onAnnouncementUpdated);
      socket.off('group:announcement_deleted', onAnnouncementDeleted);
      socket.off('group:locations_snapshot', onLocationsSnapshot);
      socket.off('group:location_update', onLocationUpdate);
      socket.off('group:location_stop', onLocationStop);
    };
  }, [socket, groupId, accessGranted, user?._id]);

  const handleJoinOrRequest = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setBusyAction(true);
    try {
      if (group.myMembership?.status === 'invited') {
        const { data } = await api.post(`/groups/${groupId}/accept-invite`);
        showToast(data?.message || 'Joined group!', 'success');
      } else {
        const { data } = await api.post(`/groups/${groupId}/join`);
        showToast(data?.message || 'Group request submitted.', 'success');
      }
      await loadGroupDetail();
    } catch (err) {
      showToast(err.response?.data?.message || 'Action failed.', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDraftChange = (val) => {
    setDraft(val);
    if (!socket || !groupId || !accessGranted) return;
    socket.emit('group:typing', { groupId, isTyping: val.trim().length > 0 });
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socket.emit('group:typing', { groupId, isTyping: false });
    }, 1500);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || sending || !groupId) return;

    setSending(true);
    clearTimeout(typingTimerRef.current);
    if (socket) socket.emit('group:typing', { groupId, isTyping: false });

    try {
      if (socket && connected) {
        await new Promise((resolve, reject) => {
          socket.emit('group:send', { groupId, content }, (ack) => {
            if (ack?.ok && ack.data) {
              setMessages((prev) =>
                prev.some((m) => m._id === ack.data._id) ? prev : [...prev, ack.data]
              );
              resolve();
            } else {
              reject(new Error(ack?.message || 'Could not post message.'));
            }
          });
        });
      } else {
        const { data } = await api.post(`/groups/${groupId}/messages`, { content });
        if (data?.data) {
          setMessages((prev) =>
            prev.some((m) => m._id === data.data._id) ? prev : [...prev, data.data]
          );
        }
      }
      setDraft('');
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Could not send message.', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleSaveAnnouncement = async (e) => {
    e.preventDefault();
    if (!annForm.content.trim()) {
      showToast('Announcement message is required.', 'error');
      return;
    }
    setPostingAnn(true);
    try {
      if (editingAnn) {
        const { data } = await api.put(
          `/groups/${groupId}/announcements/${editingAnn._id}`,
          annForm
        );
        showToast('Announcement updated.', 'success');
        setDetail((prev) => ({
          ...prev,
          announcements: prev.announcements.map((a) =>
            a._id === editingAnn._id ? data.data : a
          ),
        }));
      } else {
        const { data } = await api.post(`/groups/${groupId}/announcements`, annForm);
        showToast('Announcement published to members.', 'success');
        setDetail((prev) => ({
          ...prev,
          announcements: prev.announcements.some((a) => a._id === data.data._id)
            ? prev.announcements
            : [data.data, ...prev.announcements],
        }));
      }
      setAnnForm({ title: '', content: '', isPinned: false });
      setEditingAnn(null);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not publish announcement.', 'error');
    } finally {
      setPostingAnn(false);
    }
  };

  const handleDeleteAnnouncement = async (annId) => {
    try {
      await api.delete(`/groups/${groupId}/announcements/${annId}`);
      showToast('Announcement deleted.', 'info');
      setDetail((prev) => ({
        ...prev,
        announcements: prev.announcements.filter((a) => a._id !== annId),
      }));
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not delete announcement.', 'error');
    }
  };

  const handleTogglePin = async (ann) => {
    try {
      const { data } = await api.put(`/groups/${groupId}/announcements/${ann._id}`, {
        isPinned: !ann.isPinned,
      });
      setDetail((prev) => ({
        ...prev,
        announcements: prev.announcements.map((a) => (a._id === ann._id ? data.data : a)),
      }));
      showToast(!ann.isPinned ? 'Announcement pinned.' : 'Announcement unpinned.', 'info');
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not update pin status.', 'error');
    }
  };

  const handleInviteRider = async (e) => {
    e.preventDefault();
    if (!inviteHandle.trim()) return;
    setInviting(true);
    try {
      const { data } = await api.post(`/groups/${groupId}/invite`, {
        handle: inviteHandle.trim(),
      });
      showToast(data?.message || 'Invitation sent!', 'success');
      setInviteHandle('');
      await loadGroupDetail();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not invite rider.', 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleMemberManage = async (memberId, payload) => {
    try {
      const { data } = await api.patch(`/groups/${groupId}/members/${memberId}`, payload);
      showToast(data?.message || 'Member updated.', 'success');
      await loadGroupDetail();
    } catch (err) {
      showToast(err.response?.data?.message || 'Member update failed.', 'error');
    }
  };

  const handleRemoveMember = async (memberId) => {
    try {
      await api.delete(`/groups/${groupId}/members/${memberId}`);
      showToast('Member removed from group.', 'info');
      await loadGroupDetail();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not remove member.', 'error');
    }
  };

  const handleLeaveGroup = async () => {
    setBusyAction(true);
    try {
      await api.delete(`/groups/${groupId}/leave`);
      showToast(`Left ${group.name}.`, 'info');
      setConfirmLeave(false);
      navigate('/community/groups');
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not leave group.', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-kaafila-bg text-kaafila-muted">
        Loading KAAFILA group...
      </div>
    );
  }

  if (errorMsg || !group) {
    return (
      <div className="min-h-screen bg-kaafila-bg px-4 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-red-500/30 bg-kaafila-surface p-8 text-center">
          <Lock className="mx-auto h-10 w-10 text-red-400" />
          <h1 className="mt-4 font-display text-2xl font-bold text-kaafila-text">
            Group Unavailable
          </h1>
          <p className="mt-2 text-sm text-kaafila-muted">
            {errorMsg || 'This KAAFILA group could not be found or requires an invitation.'}
          </p>
          <Link
            to="/community/groups"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-kaafila-yellow px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-bg"
          >
            Back to KAAFILA Groups
          </Link>
        </div>
      </div>
    );
  }

  const members = detail?.members || [];
  const pendingRequests = detail?.pendingRequests || [];
  const announcements = detail?.announcements || [];
  const typingNames = Object.values(typingUsers);

  return (
    <div className="min-h-screen bg-kaafila-bg pb-20">
      {/* Group Cover Header */}
      <section className="relative overflow-hidden border-b border-kaafila-yellow/20 bg-kaafila-surface">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-25"
          style={{
            backgroundImage: `url('${group.coverImageUrl || '/images/community-camp.png'}')`,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-kaafila-bg via-kaafila-bg/85 to-kaafila-bg/60" />

        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Link
            to="/community/groups"
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-kaafila-yellow hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All KAAFILA Groups
          </Link>

          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-kaafila-yellow/40 bg-kaafila-yellow/10 px-3 py-0.5 text-xs font-semibold uppercase tracking-wider text-kaafila-yellow">
                  {group.privacy === 'private' ? (
                    <Lock className="h-3 w-3" />
                  ) : group.privacy === 'invite_only' ? (
                    <ShieldCheck className="h-3 w-3" />
                  ) : (
                    <Globe className="h-3 w-3" />
                  )}
                  {group.privacy.replace('_', ' ')}
                </span>

                {group.isDemo && (
                  <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    Demo Group
                  </span>
                )}
              </div>

              <h1 className="mt-3 font-display text-3xl font-bold tracking-wide text-kaafila-text sm:text-4xl">
                {group.name}
              </h1>

              {group.description && (
                <p className="mt-2 max-w-2xl text-sm text-kaafila-muted">{group.description}</p>
              )}

              <div className="mt-4 flex flex-wrap gap-4 text-xs text-kaafila-muted">
                {group.destination && (
                  <span className="inline-flex items-center gap-1.5 text-kaafila-text">
                    <MapPin className="h-4 w-4 text-kaafila-yellow" />
                    {group.destination}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-kaafila-text">
                  <Users className="h-4 w-4 text-kaafila-yellow" />
                  {group.memberCount} / {group.maxMembers} Members
                </span>
                {group.startDate && (
                  <span className="inline-flex items-center gap-1.5 text-kaafila-text">
                    <Calendar className="h-4 w-4 text-kaafila-yellow" />
                    {new Date(group.startDate).toLocaleDateString()}
                  </span>
                )}
                {group.organisation && (
                  <Link
                    to={`/organisations/${group.organisation.slug}`}
                    className="text-kaafila-yellow hover:underline"
                  >
                    Hosted with {group.organisation.name}
                  </Link>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              {accessGranted && group.myMembership && group.myMembership.role !== 'owner' && (
                <button
                  type="button"
                  onClick={() => setConfirmLeave(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Leave Group
                </button>
              )}
              {!accessGranted && group.myMembership?.status === 'pending_request' ? (
                <span className="rounded-xl border border-kaafila-yellow/40 bg-kaafila-yellow/10 px-4 py-2 text-xs font-semibold text-kaafila-yellow">
                  Join Request Pending Approval
                </span>
              ) : !accessGranted ? (
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={handleJoinOrRequest}
                  className="inline-flex items-center gap-2 rounded-xl bg-kaafila-yellow px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-bg hover:bg-kaafila-yellowHover transition disabled:opacity-50"
                >
                  {busyAction ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {group.myMembership?.status === 'invited'
                    ? 'Accept Group Invitation'
                    : group.privacy === 'private'
                      ? 'Request Group Access'
                      : 'Join Public Group'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <div className="mx-auto mt-8 max-w-7xl px-4 sm:px-6 lg:px-8">
        {!accessGranted ? (
          <div className="mx-auto max-w-2xl rounded-2xl border border-kaafila-yellow/30 bg-kaafila-surface p-8 text-center">
            <Lock className="mx-auto h-10 w-10 text-kaafila-yellow" />
            <h2 className="mt-4 font-display text-2xl font-bold text-kaafila-text">
              Members-Only Space
            </h2>
            <p className="mt-2 text-sm text-kaafila-muted">
              Group chat, rider rosters, and marshal announcements are restricted to active group
              members.{' '}
              {group.privacy === 'private'
                ? 'Send a join request to ask the group admins for access.'
                : 'Join this group to participate in live chat and updates.'}
            </p>
            {group.myMembership?.status !== 'pending_request' && (
              <button
                type="button"
                disabled={busyAction}
                onClick={handleJoinOrRequest}
                className="mt-6 rounded-xl bg-kaafila-yellow px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-bg"
              >
                {group.myMembership?.status === 'invited'
                  ? 'Accept Invitation'
                  : group.privacy === 'private'
                    ? 'Request Access'
                    : 'Join Group'}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Navigation Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('chat')}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                    activeTab === 'chat'
                      ? 'bg-kaafila-yellow text-kaafila-bg'
                      : 'border border-white/10 bg-kaafila-surface text-kaafila-muted hover:text-kaafila-text'
                  }`}
                >
                  <MessageSquare className="h-4 w-4" />
                  Group Chat
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('announcements')}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                    activeTab === 'announcements'
                      ? 'bg-kaafila-yellow text-kaafila-bg'
                      : 'border border-white/10 bg-kaafila-surface text-kaafila-muted hover:text-kaafila-text'
                  }`}
                >
                  <Megaphone className="h-4 w-4" />
                  Announcements ({announcements.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('members')}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                    activeTab === 'members'
                      ? 'bg-kaafila-yellow text-kaafila-bg'
                      : 'border border-white/10 bg-kaafila-surface text-kaafila-muted hover:text-kaafila-text'
                  }`}
                >
                  <Users className="h-4 w-4" />
                  Members ({members.length})
                  {pendingRequests.length > 0 && (
                    <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">
                      {pendingRequests.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('live_map')}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                    activeTab === 'live_map'
                      ? 'bg-kaafila-yellow text-kaafila-bg'
                      : 'border border-white/10 bg-kaafila-surface text-kaafila-muted hover:text-kaafila-text'
                  }`}
                >
                  <Navigation className="h-4 w-4" />
                  Live Convoy ({liveRiders.length})
                </button>
              </div>

              <span className="text-xs text-emerald-400">
                {onlineMemberIds.length} member(s) in chat room
              </span>
            </div>

            {activeTab === 'live_map' && (
              <div className="mt-6 grid gap-6 lg:grid-cols-12">
                <div className="lg:col-span-8">
                  <KaafilaMap
                    liveRiders={liveRiders}
                    heightClass="h-[420px]"
                    emptyTitle="No Riders Sharing Live Location"
                    emptyDescription="Only verified active members who explicitly enable opt-in location sharing inside their GPS tracker appear on this convoy map."
                  />
                </div>
                <aside className="space-y-4 lg:col-span-4">
                  <div className="rounded-2xl border border-kaafila-yellow/30 bg-kaafila-surface p-5">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase text-kaafila-yellow">
                        <Radio className="h-3.5 w-3.5" />
                        Opt-In Convoy Sharing
                      </span>
                      <span className="font-mono text-xs text-emerald-400">{liveRiders.length} active</span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-kaafila-muted">
                      Privacy rule: Coordinates are shared strictly with active members of this group only while tracking + live sharing are explicitly enabled.
                    </p>
                    {user?.role === 'rider' && (
                      <Link
                        to="/dashboard/rider/tracking"
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-kaafila-yellow px-4 py-2.5 text-xs font-bold uppercase text-kaafila-bg hover:bg-kaafila-yellowHover transition"
                      >
                        <Navigation className="h-4 w-4" />
                        Open GPS Tracker &amp; Sharing Toggle
                      </Link>
                    )}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-kaafila-surface p-5">
                    <h3 className="font-display text-lg font-bold uppercase text-kaafila-text">
                      Active Shared Riders
                    </h3>
                    {liveRiders.length === 0 ? (
                      <p className="mt-2 text-xs text-kaafila-muted">No active shared riders at this moment.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {liveRiders.map((r) => (
                          <div
                            key={r.userId}
                            className="flex items-center justify-between rounded-xl border border-white/10 bg-kaafila-bg px-3 py-2 text-xs"
                          >
                            <span className="font-semibold text-kaafila-text">{r.fullName}</span>
                            <span className="font-mono text-[11px] text-emerald-400">
                              {r.updatedAt ? new Date(r.updatedAt).toLocaleTimeString() : 'Live'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            )}

            {/* CHAT TAB */}
            {activeTab === 'chat' && (
              <div className="mt-6 grid gap-6 lg:grid-cols-12">
                <div className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-kaafila-surface lg:col-span-8">
                  {/* Pinned announcement banner */}
                  {announcements.find((a) => a.isPinned) && (
                    <div className="flex items-start gap-2.5 border-b border-kaafila-yellow/25 bg-kaafila-yellow/10 px-4 py-3 text-xs">
                      <Pin className="mt-0.5 h-4 w-4 shrink-0 text-kaafila-yellow" />
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-kaafila-yellow">
                          {announcements.find((a) => a.isPinned).title || 'Pinned Briefing'}:{' '}
                        </span>
                        <span className="text-kaafila-text">
                          {announcements.find((a) => a.isPinned).content}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5 max-h-[52vh] min-h-[360px]">
                    {msgPage < msgTotalPages && (
                      <div className="flex justify-center">
                        <button
                          type="button"
                          disabled={loadingMsgs}
                          onClick={() => loadGroupMessages(groupId, msgPage + 1, true)}
                          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-kaafila-bg px-3.5 py-1 text-xs text-kaafila-muted hover:text-kaafila-yellow"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                          Load Earlier Chat
                        </button>
                      </div>
                    )}

                    {messages.length === 0 ? (
                      <div className="py-12 text-center text-xs text-kaafila-muted">
                        No messages in this group yet. Start the briefing!
                      </div>
                    ) : (
                      messages.map((msg) => {
                        const mine = msg.sender?._id === user?._id || msg.sender === user?._id;
                        return (
                          <div
                            key={msg._id}
                            className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                          >
                            {!mine && (
                              <span className="mb-1 ml-1 text-[11px] font-semibold text-kaafila-yellow">
                                {msg.sender?.fullName || 'Rider'}
                              </span>
                            )}
                            <div
                              className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm ${
                                mine
                                  ? 'bg-kaafila-yellow text-kaafila-bg rounded-br-sm'
                                  : 'border border-white/10 bg-kaafila-bg text-kaafila-text rounded-bl-sm'
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words leading-relaxed">
                                {msg.content}
                              </p>
                              <p
                                className={`mt-1 text-right text-[10px] ${
                                  mine ? 'text-kaafila-bg/75' : 'text-kaafila-muted'
                                }`}
                              >
                                {new Date(msg.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}

                    {typingNames.length > 0 && (
                      <p className="text-xs italic text-kaafila-yellow">
                        {typingNames.join(', ')} typing...
                      </p>
                    )}
                    <div ref={chatBottomRef} />
                  </div>

                  <form
                    onSubmit={handleSendMessage}
                    className="flex items-center gap-2 border-t border-white/10 bg-kaafila-bg/40 p-3 sm:p-4"
                  >
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => handleDraftChange(e.target.value)}
                      placeholder="Message the riding group..."
                      maxLength={2000}
                      className="flex-1 rounded-xl border border-white/15 bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text placeholder:text-kaafila-muted/60 outline-none focus:border-kaafila-yellow"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim() || sending}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-kaafila-yellow px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-bg hover:bg-kaafila-yellowHover disabled:opacity-40"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      <span className="hidden sm:inline">Send</span>
                    </button>
                  </form>
                </div>

                {/* Active Members Mini Roster */}
                <aside className="rounded-2xl border border-white/10 bg-kaafila-surface p-5 lg:col-span-4">
                  <h3 className="font-display text-xl font-bold text-kaafila-text">
                    Active Squad ({members.length})
                  </h3>
                  <div className="mt-4 max-h-[50vh] space-y-2.5 overflow-y-auto">
                    {members.map((m) => {
                      const inRoom = onlineMemberIds.includes(String(m.user?._id));
                      return (
                        <div
                          key={m._id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-kaafila-bg px-3 py-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                inRoom ? 'bg-emerald-400' : 'bg-white/20'
                              }`}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-kaafila-text">
                                {m.user?.fullName}
                              </p>
                              {m.riderProfile?.handle && (
                                <Link
                                  to={`/riders/${m.riderProfile.handle}`}
                                  className="block truncate text-[11px] font-mono text-kaafila-yellow/80 hover:underline"
                                >
                                  @{m.riderProfile.handle}
                                </Link>
                              )}
                            </div>
                          </div>
                          <span className="shrink-0 rounded-md border border-kaafila-yellow/30 bg-kaafila-yellow/10 px-2 py-0.5 text-[10px] font-bold uppercase text-kaafila-yellow">
                            {m.role}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </aside>
              </div>
            )}

            {/* ANNOUNCEMENTS TAB */}
            {activeTab === 'announcements' && (
              <div className="mt-6 grid gap-6 lg:grid-cols-12">
                {canManage && (
                  <form
                    onSubmit={handleSaveAnnouncement}
                    className="h-fit space-y-4 rounded-2xl border border-kaafila-yellow/30 bg-kaafila-surface p-5 lg:col-span-5"
                  >
                    <h2 className="font-display text-2xl font-bold text-kaafila-text">
                      {editingAnn ? 'Edit Announcement' : 'Publish Announcement'}
                    </h2>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Headline (Optional)
                      </label>
                      <input
                        type="text"
                        value={annForm.title}
                        onChange={(e) => setAnnForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="e.g. 05:30 AM Flag-Off Checklist"
                        className="w-full rounded-xl border border-white/10 bg-kaafila-bg px-3.5 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-yellow"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                        Announcement Body *
                      </label>
                      <textarea
                        required
                        rows={4}
                        value={annForm.content}
                        onChange={(e) => setAnnForm((f) => ({ ...f, content: e.target.value }))}
                        placeholder="Share route updates, fuel stops, weather alerts..."
                        className="w-full rounded-xl border border-white/10 bg-kaafila-bg px-3.5 py-2.5 text-sm text-kaafila-text outline-none focus:border-kaafila-yellow"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-xs text-kaafila-text">
                      <input
                        type="checkbox"
                        checked={annForm.isPinned}
                        onChange={(e) => setAnnForm((f) => ({ ...f, isPinned: e.target.checked }))}
                        className="h-4 w-4 accent-kaafila-yellow"
                      />
                      Pin announcement to top of chat & board
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={postingAnn}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-kaafila-yellow px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-bg hover:bg-kaafila-yellowHover disabled:opacity-50"
                      >
                        <Megaphone className="h-4 w-4" />
                        {postingAnn
                          ? 'Saving...'
                          : editingAnn
                            ? 'Save Changes'
                            : 'Publish'}
                      </button>
                      {editingAnn && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAnn(null);
                            setAnnForm({ title: '', content: '', isPinned: false });
                          }}
                          className="rounded-xl border border-white/15 px-3.5 py-2.5 text-xs text-kaafila-muted"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                )}

                <div className={`space-y-4 ${canManage ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
                  {announcements.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-kaafila-surface p-10 text-center">
                      <Megaphone className="mx-auto h-10 w-10 text-kaafila-yellow/60" />
                      <p className="mt-3 text-sm text-kaafila-muted">
                        No group announcements posted yet.
                      </p>
                    </div>
                  ) : (
                    announcements.map((ann) => (
                      <article
                        key={ann._id}
                        className={`rounded-2xl border p-5 ${
                          ann.isPinned
                            ? 'border-kaafila-yellow/45 bg-kaafila-yellow/5'
                            : 'border-white/10 bg-kaafila-surface'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              {ann.isPinned && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-kaafila-yellow px-2 py-0.5 text-[10px] font-bold uppercase text-kaafila-bg">
                                  <Pin className="h-3 w-3" />
                                  Pinned
                                </span>
                              )}
                              <h3 className="font-display text-xl font-bold text-kaafila-text">
                                {ann.title || 'Marshal Announcement'}
                              </h3>
                            </div>
                            <p className="mt-1 text-xs text-kaafila-muted">
                              Posted by {ann.sender?.fullName || 'Group Admin'} ·{' '}
                              {new Date(ann.createdAt).toLocaleString()}
                            </p>
                          </div>

                          {canManage && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleTogglePin(ann)}
                                className="rounded-lg border border-white/10 p-1.5 text-kaafila-muted hover:text-kaafila-yellow"
                                title={ann.isPinned ? 'Unpin' : 'Pin'}
                              >
                                <Pin className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingAnn(ann);
                                  setAnnForm({
                                    title: ann.title || '',
                                    content: ann.content || '',
                                    isPinned: Boolean(ann.isPinned),
                                  });
                                }}
                                className="rounded-lg border border-white/10 p-1.5 text-kaafila-muted hover:text-kaafila-yellow"
                                title="Edit"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAnnouncement(ann._id)}
                                className="rounded-lg border border-white/10 p-1.5 text-kaafila-muted hover:text-red-400"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>

                        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-kaafila-text">
                          {ann.content}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* MEMBERS & ACCESS TAB */}
            {activeTab === 'members' && (
              <div className="mt-6 space-y-6">
                {canManage && (
                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Invite Form */}
                    <form
                      onSubmit={handleInviteRider}
                      className="rounded-2xl border border-kaafila-yellow/30 bg-kaafila-surface p-5"
                    >
                      <h2 className="font-display text-xl font-bold text-kaafila-text">
                        Invite Rider by @handle
                      </h2>
                      <p className="mt-1 text-xs text-kaafila-muted">
                        Send a direct invitation to any registered rider handle.
                      </p>
                      <div className="mt-4 flex gap-2">
                        <input
                          type="text"
                          value={inviteHandle}
                          onChange={(e) => setInviteHandle(e.target.value)}
                          placeholder="@riderhandle"
                          className="flex-1 rounded-xl border border-white/10 bg-kaafila-bg px-3.5 py-2 text-sm text-kaafila-text outline-none focus:border-kaafila-yellow"
                        />
                        <button
                          type="submit"
                          disabled={inviting || !inviteHandle.trim()}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-kaafila-yellow px-4 py-2 text-xs font-bold uppercase tracking-wider text-kaafila-bg disabled:opacity-50"
                        >
                          <UserPlus className="h-4 w-4" />
                          {inviting ? 'Sending...' : 'Invite'}
                        </button>
                      </div>
                    </form>

                    {/* Pending Join Requests */}
                    <div className="rounded-2xl border border-white/10 bg-kaafila-surface p-5">
                      <h2 className="font-display text-xl font-bold text-kaafila-text">
                        Pending Join Requests ({pendingRequests.length})
                      </h2>
                      {pendingRequests.length === 0 ? (
                        <p className="mt-2 text-xs text-kaafila-muted">
                          No riders currently awaiting approval.
                        </p>
                      ) : (
                        <div className="mt-3 space-y-2.5">
                          {pendingRequests.map((reqItem) => (
                            <div
                              key={reqItem._id}
                              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-kaafila-bg px-3.5 py-2.5"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-kaafila-text">
                                  {reqItem.user?.fullName}
                                </p>
                                {reqItem.riderProfile?.handle && (
                                  <p className="text-xs font-mono text-kaafila-yellow">
                                    @{reqItem.riderProfile.handle}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMemberManage(reqItem._id, { action: 'approve' })
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-kaafila-bg"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMemberManage(reqItem._id, { action: 'reject' })
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-kaafila-muted hover:text-red-300"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Reject
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Active Members Table */}
                <div className="rounded-2xl border border-white/10 bg-kaafila-surface p-5">
                  <h2 className="font-display text-2xl font-bold text-kaafila-text">
                    Group Roster ({members.length})
                  </h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {members.map((m) => (
                      <div
                        key={m._id}
                        className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-kaafila-bg p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-display text-lg font-bold text-kaafila-text">
                              {m.user?.fullName}
                            </p>
                            {m.riderProfile?.handle && (
                              <Link
                                to={`/riders/${m.riderProfile.handle}`}
                                className="text-xs font-mono text-kaafila-yellow hover:underline"
                              >
                                @{m.riderProfile.handle}
                              </Link>
                            )}
                          </div>
                          <span className="rounded-full border border-kaafila-yellow/35 bg-kaafila-yellow/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-kaafila-yellow">
                            {m.role}
                          </span>
                        </div>

                        {canManage && m.role !== 'owner' && (
                          <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                            {group.myMembership?.role === 'owner' && (
                              <select
                                value={m.role}
                                onChange={(e) =>
                                  handleMemberManage(m._id, {
                                    action: 'set_role',
                                    role: e.target.value,
                                  })
                                }
                                aria-label={`Role for ${m.user?.fullName}`}
                                className="rounded-lg border border-white/15 bg-kaafila-surface px-2.5 py-1 text-xs text-kaafila-text"
                              >
                                <option value="member">Member</option>
                                <option value="marshal">Marshal</option>
                                <option value="admin">Admin</option>
                              </select>
                            )}

                            <button
                              type="button"
                              onClick={() => handleRemoveMember(m._id)}
                              className="ml-auto text-xs font-semibold text-red-400 hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmModal
        open={confirmLeave}
        title="Leave KAAFILA Group"
        message={`Are you sure you want to leave "${group.name}"? You will lose access to its chat and member roster.`}
        confirmLabel="Leave Group"
        loading={busyAction}
        onCancel={() => setConfirmLeave(false)}
        onConfirm={handleLeaveGroup}
      />
    </div>
  );
}


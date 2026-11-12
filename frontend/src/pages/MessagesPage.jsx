import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  MessageSquare,
  Send,
  UserPlus,
  CheckCheck,
  Check,
  ArrowLeft,
  ChevronUp,
  Compass,
  Loader2,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';

function formatMessageTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatListDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function MessagesPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { socket, connected, isUserOnline } = useSocket();
  const { showToast } = useToast();

  const [conversations, setConversations] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgPage, setMsgPage] = useState(1);
  const [msgTotalPages, setMsgTotalPages] = useState(1);
  const [loadingThread, setLoadingThread] = useState(false);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);

  const bottomRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const loadSidebar = useCallback(async () => {
    if (!isAuthenticated || user?.role !== 'rider') {
      setLoadingList(false);
      return;
    }
    try {
      const [convRes, connRes] = await Promise.all([
        api.get('/messages/conversations'),
        api.get('/connections'),
      ]);
      setConversations(convRes.data?.data || []);
      setConnections(connRes.data?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load conversations.', 'error');
    } finally {
      setLoadingList(false);
    }
  }, [isAuthenticated, user?.role, showToast]);

  useEffect(() => {
    if (!authLoading) {
      loadSidebar();
    }
  }, [authLoading, loadSidebar]);

  const loadThread = useCallback(
    async (convId, pageNum = 1, appendOlder = false) => {
      if (!convId || !isAuthenticated || user?.role !== 'rider') return;
      setLoadingThread(true);
      try {
        const { data } = await api.get(`/messages/conversations/${convId}`, {
          params: { page: pageNum, limit: 30 },
        });
        const payload = data?.data;
        setActiveConv(payload?.conversation || null);
        setMsgPage(payload?.pagination?.page || 1);
        setMsgTotalPages(payload?.pagination?.totalPages || 1);

        if (appendOlder) {
          setMessages((prev) => [...(payload?.messages || []), ...prev]);
        } else {
          setMessages(payload?.messages || []);
        }

        // Clear unread badge in sidebar list
        setConversations((prev) =>
          prev.map((c) => (c._id === convId ? { ...c, unreadCount: 0 } : c))
        );
      } catch (err) {
        showToast(err.response?.data?.message || 'Could not open conversation.', 'error');
      } finally {
        setLoadingThread(false);
      }
    },
    [isAuthenticated, user?.role, showToast]
  );

  useEffect(() => {
    setPartnerTyping(false);
    if (conversationId) {
      loadThread(conversationId, 1, false);
    } else {
      setActiveConv(null);
      setMessages([]);
    }
  }, [conversationId, loadThread]);

  // Scroll to bottom when new messages arrive on page 1
  useEffect(() => {
    if (msgPage === 1 && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, msgPage]);

  // Real-time Socket.IO room lifecycle and listeners
  useEffect(() => {
    if (!socket || !isAuthenticated || user?.role !== 'rider') return;

    if (conversationId) {
      socket.emit('conversation:join', conversationId);
    }

    const onPrivateMessage = (msg) => {
      const msgConvId = String(msg.conversation);
      if (msgConvId === conversationId) {
        setMessages((prev) =>
          prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]
        );
        setPartnerTyping(false);
        if (msg.sender?._id !== user._id) {
          api.patch(`/messages/conversations/${conversationId}/read`).catch(() => {});
        }
      }
      loadSidebar();
    };

    const onConversationUpdated = ({ conversationId: updatedId }) => {
      if (updatedId !== conversationId) {
        loadSidebar();
      }
    };

    const onTyping = ({ conversationId: typingConvId, userId: typingUserId, isTyping }) => {
      if (typingConvId === conversationId && typingUserId !== user._id) {
        setPartnerTyping(Boolean(isTyping));
      }
    };

    const onRead = ({ conversationId: readConvId, readerId }) => {
      if (readConvId === conversationId && readerId !== user._id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.readBy?.includes(readerId)
              ? m
              : { ...m, readBy: [...(m.readBy || []), readerId] }
          )
        );
      }
    };

    socket.on('private:message', onPrivateMessage);
    socket.on('private:conversation_updated', onConversationUpdated);
    socket.on('private:typing', onTyping);
    socket.on('private:read', onRead);

    return () => {
      if (conversationId) {
        socket.emit('conversation:leave', conversationId);
      }
      socket.off('private:message', onPrivateMessage);
      socket.off('private:conversation_updated', onConversationUpdated);
      socket.off('private:typing', onTyping);
      socket.off('private:read', onRead);
    };
  }, [socket, conversationId, isAuthenticated, user?._id, user?.role, loadSidebar]);

  const handleDraftChange = (value) => {
    setDraft(value);
    if (!socket || !conversationId) return;
    socket.emit('private:typing', { conversationId, isTyping: value.trim().length > 0 });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('private:typing', { conversationId, isTyping: false });
    }, 1500);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !conversationId || sending) return;

    setSending(true);
    clearTimeout(typingTimeoutRef.current);
    if (socket) {
      socket.emit('private:typing', { conversationId, isTyping: false });
    }

    const sendViaRest = async () => {
      const { data } = await api.post(`/messages/conversations/${conversationId}`, { content });
      const msg = data?.data;
      if (msg) {
        setMessages((prev) => (prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]));
        loadSidebar();
      }
    };

    try {
      if (socket && connected) {
        await new Promise((resolve, reject) => {
          socket.emit('private:send', { conversationId, content }, (ack) => {
            if (ack?.ok && ack.data) {
              setMessages((prev) =>
                prev.some((m) => m._id === ack.data._id) ? prev : [...prev, ack.data]
              );
              loadSidebar();
              resolve();
            } else {
              reject(new Error(ack?.message || 'Socket send failed'));
            }
          });
        });
      } else {
        await sendViaRest();
      }
      setDraft('');
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Could not send message.', 'error');
    } finally {
      setSending(false);
    }
  };

  const startConversationWith = async (targetUserId) => {
    try {
      const { data } = await api.post(`/messages/conversations/${targetUserId}`);
      navigate(`/community/messages/${data.data._id}`);
      loadSidebar();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not open conversation.', 'error');
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-kaafila-bg text-kaafila-muted">
        Loading messages...
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'rider') {
    return (
      <div className="min-h-screen bg-kaafila-bg px-4 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-kaafila-primary/30 bg-kaafila-surface p-8 text-center">
          <MessageSquare className="mx-auto h-10 w-10 text-kaafila-accent" />
          <h1 className="mt-4 font-display text-2xl font-bold text-kaafila-text">
            Rider Private Messaging
          </h1>
          <p className="mt-2 text-sm text-kaafila-muted">
            {isAuthenticated
              ? '1-on-1 private messaging is available for Rider accounts with accepted connections. Organisations communicate via KAAFILA Groups.'
              : 'Sign in as a Rider to exchange real-time messages with connected riders.'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              to={isAuthenticated ? '/community/groups' : '/login'}
              className="rounded-xl bg-kaafila-primary px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-dark"
            >
              {isAuthenticated ? 'Open KAAFILA Groups' : 'Rider Sign In'}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const existingPartnerIds = new Set(conversations.map((c) => c.partner?._id));
  const newChatContacts = connections.filter((c) => !existingPartnerIds.has(c.user?._id));
  const partner = activeConv?.partner;
  const partnerOnline = partner ? isUserOnline(partner._id) || partner.isOnline : false;

  return (
    <div className="min-h-screen bg-kaafila-bg pb-12 pt-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/community"
              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-kaafila-accent hover:underline"
            >
              <Compass className="h-3.5 w-3.5" />
              Community
            </Link>
            <span className="text-kaafila-muted">/</span>
            <h1 className="font-display text-2xl font-bold text-kaafila-text sm:text-3xl">
              Private Messages
            </h1>
          </div>

          <Link
            to="/community/connections"
            className="inline-flex items-center gap-1.5 rounded-xl border border-kaafila-primary/35 bg-kaafila-surface px-3.5 py-2 text-xs font-semibold text-kaafila-accent hover:bg-kaafila-primary/10 transition"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Manage Connections
          </Link>
        </div>

        <div className="grid min-h-[70vh] overflow-hidden rounded-2xl border border-kaafila-border bg-kaafila-surface lg:grid-cols-12">
          {/* Sidebar Conversations */}
          <aside
            className={`border-kaafila-border lg:col-span-4 lg:border-r ${
              conversationId ? 'hidden lg:block' : 'block'
            }`}
          >
            <div className="border-b border-kaafila-border px-4 py-3.5">
              <p className="text-xs font-bold uppercase tracking-widest text-kaafila-accent">
                Conversations ({conversations.length})
              </p>
            </div>

            <div className="max-h-[64vh] overflow-y-auto divide-y divide-white/5">
              {loadingList ? (
                <div className="p-6 text-center text-xs text-kaafila-muted">Loading inbox...</div>
              ) : conversations.length === 0 && newChatContacts.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-kaafila-text font-medium">No conversations yet</p>
                  <p className="mt-1 text-xs text-kaafila-muted">
                    Connect with fellow riders first to start private messaging.
                  </p>
                  <Link
                    to="/community/riders"
                    className="mt-4 inline-flex rounded-xl bg-kaafila-primary px-4 py-2 text-xs font-bold text-kaafila-dark"
                  >
                    Discover Riders
                  </Link>
                </div>
              ) : (
                <>
                  {conversations.map((conv) => {
                    const p = conv.partner;
                    const online = isUserOnline(p._id) || p.isOnline;
                    const isSelected = conv._id === conversationId;

                    return (
                      <Link
                        key={conv._id}
                        to={`/community/messages/${conv._id}`}
                        className={`flex items-center gap-3 px-4 py-3.5 transition ${
                          isSelected
                            ? 'bg-kaafila-primary/10 border-l-2 border-kaafila-primary'
                            : 'hover:bg-kaafila-elevated'
                        }`}
                      >
                        <div className="relative h-11 w-11 shrink-0">
                          {p.avatarUrl ? (
                            <img
                              src={p.avatarUrl}
                              alt={p.fullName}
                              className="h-11 w-11 rounded-full object-cover border border-kaafila-primary/30"
                            />
                          ) : (
                            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-kaafila-primary/30 bg-kaafila-bg font-display text-lg font-bold text-kaafila-accent">
                              {p.fullName?.charAt(0)?.toUpperCase() || 'R'}
                            </div>
                          )}
                          {online && (
                            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-kaafila-surface bg-emerald-400" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-kaafila-text">
                              {p.fullName}
                            </p>
                            <span className="shrink-0 text-[10px] text-kaafila-muted">
                              {formatListDate(conv.lastMessageAt)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <p className="truncate text-xs text-kaafila-muted">
                              {conv.lastMessageText || 'Say hello to start chatting...'}
                            </p>
                            {conv.unreadCount > 0 && (
                              <span className="shrink-0 rounded-full bg-kaafila-primary px-1.5 py-0.5 text-[10px] font-bold text-kaafila-dark">
                                {conv.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}

                  {newChatContacts.length > 0 && (
                    <div className="p-4">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-kaafila-muted">
                        Start Chat With Connected Riders
                      </p>
                      <div className="space-y-1.5">
                        {newChatContacts.map((conn) => (
                          <button
                            key={conn._id}
                            type="button"
                            onClick={() => startConversationWith(conn.user._id)}
                            className="flex w-full items-center justify-between rounded-xl border border-kaafila-border bg-kaafila-bg px-3 py-2 text-left text-xs text-kaafila-text hover:border-kaafila-primary/40 transition"
                          >
                            <span className="truncate font-medium">{conn.user.fullName}</span>
                            <span className="text-[11px] font-semibold text-kaafila-accent">
                              Chat
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>

          {/* Chat Thread */}
          <section
            className={`flex flex-col lg:col-span-8 ${
              conversationId ? 'block' : 'hidden lg:flex'
            }`}
          >
            {!conversationId ? (
              <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
                <MessageSquare className="h-12 w-12 text-kaafila-accent/60" />
                <h2 className="mt-4 font-display text-2xl font-bold text-kaafila-text">
                  Select a Conversation
                </h2>
                <p className="mt-1 max-w-md text-sm text-kaafila-muted">
                  Choose an existing thread or click Chat next to any connected rider to start
                  messaging in real time.
                </p>
              </div>
            ) : (
              <>
                {/* Thread Header */}
                <div className="flex items-center justify-between gap-3 border-b border-kaafila-border px-4 py-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <Link
                      to="/community/messages"
                      className="rounded-lg border border-kaafila-border p-1.5 text-kaafila-muted hover:text-kaafila-text lg:hidden"
                      aria-label="Back to conversation list"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Link>

                    {partner && (
                      <>
                        <div className="relative h-10 w-10 shrink-0">
                          {partner.avatarUrl ? (
                            <img
                              src={partner.avatarUrl}
                              alt={partner.fullName}
                              className="h-10 w-10 rounded-full object-cover border border-kaafila-primary/40"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-kaafila-primary/40 bg-kaafila-bg font-display text-lg font-bold text-kaafila-accent">
                              {partner.fullName?.charAt(0)?.toUpperCase() || 'R'}
                            </div>
                          )}
                          {partnerOnline && (
                            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-kaafila-surface bg-emerald-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          {partner.riderProfile?.handle ? (
                            <Link
                              to={`/riders/${partner.riderProfile.handle}`}
                              className="block truncate font-display text-lg font-bold text-kaafila-text hover:text-kaafila-accent"
                            >
                              {partner.fullName}
                            </Link>
                          ) : (
                            <h2 className="truncate font-display text-lg font-bold text-kaafila-text">
                              {partner.fullName}
                            </h2>
                          )}
                          <p className="text-xs text-kaafila-muted">
                            {partnerTyping ? (
                              <span className="text-kaafila-accent">Typing...</span>
                            ) : partnerOnline ? (
                              <span className="text-emerald-400">Online</span>
                            ) : (
                              <span>Offline</span>
                            )}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Messages Scroll */}
                <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5 max-h-[54vh] min-h-[380px]">
                  {msgPage < msgTotalPages && (
                    <div className="flex justify-center">
                      <button
                        type="button"
                        disabled={loadingThread}
                        onClick={() => loadThread(conversationId, msgPage + 1, true)}
                        className="inline-flex items-center gap-1 rounded-full border border-kaafila-border bg-kaafila-bg px-3.5 py-1 text-xs font-medium text-kaafila-muted hover:text-kaafila-accent"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                        Load Older Messages
                      </button>
                    </div>
                  )}

                  {loadingThread && messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-xs text-kaafila-muted">
                      Loading message history...
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center py-12 text-center text-xs text-kaafila-muted">
                      No messages yet. Coordinate your next Himalayan ride below!
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMine = msg.sender?._id === user._id || msg.sender === user._id;
                      const readByPartner =
                        partner && msg.readBy?.some((id) => String(id) === String(partner._id));

                      return (
                        <div
                          key={msg._id}
                          className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                              isMine
                                ? 'bg-kaafila-primary text-kaafila-dark rounded-br-sm'
                                : 'border border-kaafila-border bg-kaafila-bg text-kaafila-text rounded-bl-sm'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words leading-relaxed">
                              {msg.content}
                            </p>
                            <div
                              className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                                isMine ? 'text-white/75' : 'text-kaafila-muted'
                              }`}
                            >
                              <span>{formatMessageTime(msg.createdAt)}</span>
                              {isMine &&
                                (readByPartner ? (
                                  <CheckCheck className="h-3.5 w-3.5" title="Read" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" title="Sent" />
                                ))}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={bottomRef} />
                </div>

                {/* Compose */}
                <form
                  onSubmit={handleSend}
                  className="flex items-center gap-2 border-t border-kaafila-border bg-kaafila-bg/40 p-3 sm:p-4"
                >
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => handleDraftChange(e.target.value)}
                    placeholder="Write a message..."
                    maxLength={2000}
                    className="flex-1 rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text placeholder:text-kaafila-muted/60 outline-none focus:border-kaafila-primary"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || sending}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-kaafila-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-dark hover:bg-kaafila-primary-hover transition disabled:opacity-40"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Send</span>
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}


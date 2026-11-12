import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  UserPlus,
  MessageSquare,
  Bell,
  Compass,
  ArrowRight,
  ShieldCheck,
  Radio,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export default function CommunityPage() {
  const { user, isAuthenticated } = useAuth();
  const { connected, unreadNotifications } = useSocket();
  const [summary, setSummary] = useState({
    ridersCount: 0,
    groupsCount: 0,
    connectionsCount: 0,
    pendingRequestsCount: 0,
    unreadMessages: 0,
  });

  useEffect(() => {
    let active = true;
    async function loadOverview() {
      try {
        const requests = [
          api.get('/riders', { params: { limit: 1 } }),
          api.get('/groups', { params: { limit: 1 } }),
        ];

        if (isAuthenticated && user?.role === 'rider') {
          requests.push(
            api.get('/connections'),
            api.get('/connections/requests'),
            api.get('/messages/conversations')
          );
        }

        const results = await Promise.allSettled(requests);
        if (!active) return;

        const [ridersRes, groupsRes, connRes, reqRes, msgRes] = results;
        setSummary({
          ridersCount:
            ridersRes?.status === 'fulfilled'
              ? ridersRes.value.data?.pagination?.total || ridersRes.value.data?.data?.length || 0
              : 0,
          groupsCount:
            groupsRes?.status === 'fulfilled'
              ? groupsRes.value.data?.pagination?.total || groupsRes.value.data?.data?.length || 0
              : 0,
          connectionsCount:
            connRes?.status === 'fulfilled' ? connRes.value.data?.data?.length || 0 : 0,
          pendingRequestsCount:
            reqRes?.status === 'fulfilled' ? reqRes.value.data?.data?.incoming?.length || 0 : 0,
          unreadMessages:
            msgRes?.status === 'fulfilled' ? msgRes.value.data?.totalUnread || 0 : 0,
        });
      } catch {
        // Non-blocking hub summary
      }
    }
    loadOverview();
    return () => {
      active = false;
    };
  }, [isAuthenticated, user?.role]);

  const cards = [
    {
      title: 'Rider Discovery',
      description:
        'Explore fellow Himalayan tourers by city, motorcycle brand, riding rank, and experience.',
      to: '/community/riders',
      icon: Compass,
      stat: `${summary.ridersCount} Public Riders`,
      cta: 'Browse Riders',
      public: true,
    },
    {
      title: 'KAAFILA Groups',
      description:
        'Join open convoys, request entry to private expedition squads, chat in real time, and read marshal briefings.',
      to: '/community/groups',
      icon: Users,
      stat: `${summary.groupsCount} Riding Groups`,
      cta: 'Explore Groups',
      public: true,
    },
    {
      title: 'Rider Connections',
      description:
        'Manage your trusted riding network — review incoming connection requests and sent invites.',
      to: '/community/connections',
      icon: UserPlus,
      stat:
        user?.role === 'rider'
          ? `${summary.connectionsCount} Connected · ${summary.pendingRequestsCount} Incoming`
          : 'Rider Account Feature',
      cta: 'Open Connections',
      riderOnly: true,
    },
    {
      title: 'Private Messaging',
      description:
        'Real-time 1-on-1 encrypted-in-transit chat with connected riders, online presence, and typing alerts.',
      to: '/community/messages',
      icon: MessageSquare,
      stat:
        user?.role === 'rider'
          ? `${summary.unreadMessages} Unread Messages`
          : 'Connected Riders Only',
      cta: 'Open Inbox',
      riderOnly: true,
    },
    {
      title: 'Notification Centre',
      description:
        'Live alerts for connection requests, group invites, marshal announcements, and new messages.',
      to: '/notifications',
      icon: Bell,
      stat: isAuthenticated ? `${unreadNotifications} Unread Alerts` : 'Sign In Required',
      cta: 'View Alerts',
      authOnly: true,
    },
  ];

  return (
    <div className="min-h-screen bg-kaafila-bg pb-20">
      {/* Hero Banner */}
      <section className="relative overflow-hidden border-b border-kaafila-primary/20 bg-kaafila-surface/70">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-25"
          style={{ backgroundImage: "url('/images/community-camp.png')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-kaafila-bg via-kaafila-bg/90 to-kaafila-bg/65" />

        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-kaafila-primary/40 bg-kaafila-primary/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-widest text-kaafila-accent">
              <Radio className="h-3.5 w-3.5" />
              KAAFILA Rider Community
            </span>
            {isAuthenticated && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                  connected
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
                    : 'border-kaafila-border bg-kaafila-surface text-kaafila-muted'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    connected ? 'bg-emerald-400 animate-pulse' : 'bg-kaafila-muted'
                  }`}
                />
                {connected ? 'Real-Time Link Active' : 'Connecting Live Socket...'}
              </span>
            )}
          </div>

          <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold tracking-wide text-kaafila-text sm:text-5xl">
            Ride Connected Across Every Mountain Pass
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-kaafila-muted sm:text-base">
            Discover verified public rider profiles, build trusted touring connections, coordinate in
            KAAFILA riding groups, and communicate in real time before wheels roll out.
          </p>

          {!isAuthenticated && (
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/register"
                className="rounded-xl bg-kaafila-primary px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-kaafila-dark hover:bg-kaafila-primary-hover transition"
              >
                Join as a Rider
              </Link>
              <Link
                to="/login"
                className="rounded-xl border border-kaafila-primary/40 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-kaafila-accent hover:bg-kaafila-primary/10 transition"
              >
                Sign In
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Community Modules */}
      <section className="mx-auto mt-10 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            const lockedForVisitor =
              (!isAuthenticated && (card.riderOnly || card.authOnly)) ||
              (isAuthenticated && card.riderOnly && user?.role !== 'rider');

            return (
              <div
                key={card.to}
                className="group flex flex-col justify-between rounded-2xl border border-kaafila-border bg-kaafila-surface p-6 transition hover:border-kaafila-primary/40"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-kaafila-primary/35 bg-kaafila-primary/10 text-kaafila-accent">
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="rounded-full border border-kaafila-border bg-kaafila-bg px-3 py-1 text-[11px] font-medium text-kaafila-muted">
                      {card.stat}
                    </span>
                  </div>

                  <h2 className="mt-5 font-display text-2xl font-bold text-kaafila-text group-hover:text-kaafila-accent transition">
                    {card.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-kaafila-muted">{card.description}</p>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-kaafila-border pt-4">
                  {lockedForVisitor ? (
                    <Link
                      to={isAuthenticated ? '/community/groups' : '/login'}
                      className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-kaafila-muted hover:text-kaafila-accent transition"
                    >
                      <ShieldCheck className="h-4 w-4 text-kaafila-accent/70" />
                      <span>
                        {isAuthenticated
                          ? 'Available for Rider Accounts'
                          : 'Sign in to access'}
                      </span>
                    </Link>
                  ) : (
                    <Link
                      to={card.to}
                      className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-kaafila-accent hover:text-kaafila-accent-hover transition"
                    >
                      <span>{card.cta}</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}


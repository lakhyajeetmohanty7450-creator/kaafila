import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import api from '../api/client';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const refreshUnreadNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      setUnreadNotifications(0);
      return;
    }
    try {
      const { data } = await api.get('/notifications', { params: { limit: 1 } });
      if (data?.success) {
        setUnreadNotifications(data.unreadCount || 0);
      }
    } catch {
      // Ignore transient errors
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !user?._id) {
      setSocket((prev) => {
        if (prev) prev.disconnect();
        return null;
      });
      setConnected(false);
      setOnlineUserIds(new Set());
      setUnreadNotifications(0);
      return;
    }

    const token = localStorage.getItem('kaafila_token');
    if (!token) return;

    refreshUnreadNotifications();

    const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL?.trim();
    if (import.meta.env.PROD && !configuredSocketUrl) {
      console.error('[KAAFILA Socket.IO] VITE_SOCKET_URL is not configured for production.');
      setSocket(null);
      setConnected(false);
      return undefined;
    }

    const socketUrl = configuredSocketUrl || '/';
    const s = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('presence:list', ({ onlineUserIds: list = [] }) => {
      setOnlineUserIds(new Set(list.map(String)));
    });

    s.on('presence:online', ({ userId }) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        next.add(String(userId));
        return next;
      });
    });

    s.on('presence:offline', ({ userId }) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        next.delete(String(userId));
        return next;
      });
    });

    s.on('notification:new', (notif) => {
      setUnreadNotifications((prev) => prev + 1);
      if (notif?.title) {
        showToast(notif.title, 'info');
      }
    });

    setSocket(s);

    return () => {
      s.disconnect();
      setConnected(false);
    };
  }, [isAuthenticated, user?._id, refreshUnreadNotifications, showToast]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        connected,
        onlineUserIds,
        isUserOnline: (uid) => onlineUserIds.has(String(uid)),
        unreadNotifications,
        setUnreadNotifications,
        refreshUnreadNotifications,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return ctx;
}


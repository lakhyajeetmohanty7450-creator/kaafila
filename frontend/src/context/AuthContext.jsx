import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [riderProfile, setRiderProfile] = useState(null);
  const [organisation, setOrganisation] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCurrentUser = useCallback(async () => {
    const token = localStorage.getItem('kaafila_token');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      if (data?.success) {
        setUser(data.data.user);
        setRiderProfile(data.data.riderProfile || null);
        setOrganisation(data.data.organisation || null);
      }
    } catch {
      localStorage.removeItem('kaafila_token');
      setUser(null);
      setRiderProfile(null);
      setOrganisation(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const saveSession = (payload) => {
    localStorage.setItem('kaafila_token', payload.token);
    setUser(payload.user);
    setRiderProfile(payload.riderProfile || null);
    setOrganisation(payload.organisation || null);
  };

  const login = async (credentials) => {
    const { data } = await api.post('/auth/login', credentials);
    saveSession(data.data);
    return data.data;
  };

  const registerRider = async (payload) => {
    const { data } = await api.post('/auth/register/rider', payload);
    saveSession(data.data);
    return data.data;
  };

  const registerOrganisation = async (payload) => {
    const { data } = await api.post('/auth/register/organisation', payload);
    saveSession(data.data);
    return data.data;
  };

  const logout = () => {
    localStorage.removeItem('kaafila_token');
    setUser(null);
    setRiderProfile(null);
    setOrganisation(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        riderProfile,
        organisation,
        loading,
        isAuthenticated: Boolean(user),
        login,
        registerRider,
        registerOrganisation,
        logout,
        refreshUser: fetchCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}


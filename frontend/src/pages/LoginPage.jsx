import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, AlertCircle, Compass, Bike, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const initialRole = searchParams.get('role') === 'organisation' ? 'organisation' : 'rider';
  const [loginRole, setLoginRole] = useState(initialRole);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login({ ...form, expectedRole: loginRole });
      if (data?.user?.role === 'organisation') {
        navigate('/dashboard/organisation');
      } else if (data?.user?.role === 'rider') {
        navigate('/dashboard/rider');
      } else {
        navigate('/account');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to sign in. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto grid min-h-[calc(100vh-140px)] max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:px-8">
      <div className="relative hidden h-[540px] overflow-hidden rounded-3xl border border-kaafila-primary/30 lg:block">
        <img
          src="/images/expedition-spiti.png"
          alt="Himalayan motorcycle rider on cliff road"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-kaafila-bg via-kaafila-bg/35 to-transparent" />
        <div className="absolute bottom-8 left-8 right-8">
          <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-kaafila-accent">
            <Compass className="h-4 w-4" />
            {loginRole === 'rider' ? 'Rider Portal' : 'Organisation Portal'}
          </span>
          <h2 className="mt-2 font-display text-4xl font-bold uppercase text-kaafila-text">
            {loginRole === 'rider' ? 'Back To The High Passes' : 'Manage Your Touring Outfit'}
          </h2>
          <p className="mt-2 text-sm text-kaafila-text/80">
            {loginRole === 'rider'
              ? 'Sign in with your Rider account to save expeditions, post genuine reviews, and explore verified routes.'
              : 'Sign in with your Organisation credentials to view your listing status and public marketplace profile.'}
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-kaafila-primary/25 bg-kaafila-surface p-8 shadow-card sm:p-10">
        {/* Distinct Rider / Organisation Login Tabs */}
        <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-kaafila-primary/20 bg-kaafila-bg p-1.5">
          <button
            type="button"
            onClick={() => {
              setLoginRole('rider');
              setError('');
            }}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider transition ${
              loginRole === 'rider'
                ? 'bg-kaafila-primary text-kaafila-dark'
                : 'text-kaafila-muted hover:text-kaafila-text'
            }`}
          >
            <Bike className="h-4 w-4" />
            <span>Rider Login</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setLoginRole('organisation');
              setError('');
            }}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider transition ${
              loginRole === 'organisation'
                ? 'bg-kaafila-primary text-kaafila-dark'
                : 'text-kaafila-muted hover:text-kaafila-text'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Organisation Login</span>
          </button>
        </div>

        <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-kaafila-accent">
          {loginRole === 'rider' ? 'Rider Sign In' : 'Organisation Sign In'}
        </span>
        <h1 className="mt-2 font-display text-3xl font-bold uppercase text-kaafila-text sm:text-4xl">
          {loginRole === 'rider' ? 'Sign In as Rider' : 'Sign In as Organisation'}
        </h1>
        <p className="mt-2 text-sm text-kaafila-muted">
          {loginRole === 'rider'
            ? 'Enter your rider email and password.'
            : 'Enter your official organisation email and password.'}
        </p>

        {error && (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 p-3.5 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label htmlFor="login-email" className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
              {loginRole === 'rider' ? 'Email Address' : 'Official Email Address'}
            </label>
            <input
              id="login-email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder={loginRole === 'rider' ? 'rider@domain.com' : 'ops@organisation.com'}
              className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-3 text-sm text-kaafila-text placeholder:text-kaafila-muted/50 focus:border-kaafila-primary focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Minimum 8 characters"
              className="mt-1.5 w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-4 py-3 text-sm text-kaafila-text placeholder:text-kaafila-muted/50 focus:border-kaafila-primary focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-kaafila-primary px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-kaafila-dark shadow-blue transition hover:bg-kaafila-primary-hover disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" />
            <span>
              {loading
                ? 'Signing In...'
                : loginRole === 'rider'
                  ? 'Sign In as Rider'
                  : 'Sign In as Organisation'}
            </span>
          </button>
        </form>

        <div className="mt-6 border-t border-kaafila-border pt-5 text-center text-sm text-kaafila-muted">
          New to KAAFILA?{' '}
          <Link to={`/register?role=${loginRole}`} className="font-semibold text-kaafila-accent hover:underline">
            Register as {loginRole === 'rider' ? 'a Rider' : 'an Organisation'}
          </Link>
        </div>
      </div>
    </div>
  );
}

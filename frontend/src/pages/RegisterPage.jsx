import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { UserPlus, Building2, Bike, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const [searchParams] = useSearchParams();
  const initialRole = searchParams.get('role') === 'organisation' ? 'organisation' : 'rider';
  const [role, setRole] = useState(initialRole);
  const { registerRider, registerOrganisation } = useAuth();
  const navigate = useNavigate();

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [riderForm, setRiderForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phoneNumber: '',
    city: '',
  });

  const [orgForm, setOrgForm] = useState({
    organisationName: '',
    officialEmail: '',
    password: '',
    confirmPassword: '',
    contactNumber: '',
    location: '',
    officialWebsite: '',
    description: '',
  });

  const handleRiderSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (riderForm.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (riderForm.password !== riderForm.confirmPassword) {
      setError('Password and Confirm Password do not match.');
      return;
    }

    setLoading(true);
    try {
      await registerRider(riderForm);
      navigate('/dashboard/rider');
    } catch (err) {
      setError(err.response?.data?.message || 'Rider registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleOrgSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (orgForm.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (orgForm.password !== orgForm.confirmPassword) {
      setError('Password and Confirm Password do not match.');
      return;
    }

    setLoading(true);
    try {
      const data = await registerOrganisation({
        organisationName: orgForm.organisationName,
        officialEmail: orgForm.officialEmail,
        password: orgForm.password,
        confirmPassword: orgForm.confirmPassword,
        contactNumber: orgForm.contactNumber,
        location: orgForm.location,
        officialWebsite: orgForm.officialWebsite,
        bookingUrl: orgForm.officialWebsite,
        description: orgForm.description,
      });
      if (data?.user?.role === 'organisation') {
        navigate('/dashboard/organisation');
      } else {
        navigate('/account');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Organisation registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="text-center">
        <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-kaafila-yellow">
          Join The Marketplace
        </span>
        <h1 className="mt-2 font-display text-4xl font-bold uppercase text-kaafila-text sm:text-5xl">
          Create Your KAAFILA Account
        </h1>
        <p className="mt-2 text-sm text-kaafila-muted">
          Choose between Rider Registration and Touring Organisation Registration.
        </p>
      </div>

      {/* Role Switcher */}
      <div className="mt-8 grid grid-cols-2 gap-3 rounded-2xl border border-kaafila-yellow/25 bg-kaafila-surface p-2">
        <button
          type="button"
          onClick={() => {
            setRole('rider');
            setError('');
          }}
          className={`flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold uppercase tracking-wider transition ${
            role === 'rider'
              ? 'bg-kaafila-yellow text-kaafila-bg shadow-amber'
              : 'text-kaafila-muted hover:text-kaafila-text'
          }`}
        >
          <Bike className="h-4 w-4" />
          <span>Rider Registration</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setRole('organisation');
            setError('');
          }}
          className={`flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold uppercase tracking-wider transition ${
            role === 'organisation'
              ? 'bg-kaafila-yellow text-kaafila-bg shadow-amber'
              : 'text-kaafila-muted hover:text-kaafila-text'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>Organisation Registration</span>
        </button>
      </div>

      <div className="mt-6 rounded-3xl border border-kaafila-yellow/25 bg-kaafila-surface p-6 shadow-card sm:p-8">
        {error && (
          <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 p-3.5 text-xs text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {role === 'rider' ? (
          <form onSubmit={handleRiderSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="rider-name" className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                  Full Name *
                </label>
                <input
                  id="rider-name"
                  type="text"
                  required
                  value={riderForm.fullName}
                  onChange={(e) => setRiderForm({ ...riderForm, fullName: e.target.value })}
                  placeholder="Aarav Sharma"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text focus:border-kaafila-yellow focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="rider-email" className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                  Email *
                </label>
                <input
                  id="rider-email"
                  type="email"
                  required
                  value={riderForm.email}
                  onChange={(e) => setRiderForm({ ...riderForm, email: e.target.value })}
                  placeholder="rider@example.com"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text focus:border-kaafila-yellow focus:outline-none"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="rider-password" className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                  Password (min 8 chars) *
                </label>
                <input
                  id="rider-password"
                  type="password"
                  required
                  minLength={8}
                  value={riderForm.password}
                  onChange={(e) => setRiderForm({ ...riderForm, password: e.target.value })}
                  placeholder="••••••••"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text focus:border-kaafila-yellow focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="rider-confirm" className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                  Confirm Password *
                </label>
                <input
                  id="rider-confirm"
                  type="password"
                  required
                  minLength={8}
                  value={riderForm.confirmPassword}
                  onChange={(e) => setRiderForm({ ...riderForm, confirmPassword: e.target.value })}
                  placeholder="••••••••"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text focus:border-kaafila-yellow focus:outline-none"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="rider-city" className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                  City *
                </label>
                <input
                  id="rider-city"
                  type="text"
                  required
                  value={riderForm.city}
                  onChange={(e) => setRiderForm({ ...riderForm, city: e.target.value })}
                  placeholder="Chandigarh"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text focus:border-kaafila-yellow focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="rider-phone" className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                  Phone Number (optional)
                </label>
                <input
                  id="rider-phone"
                  type="tel"
                  value={riderForm.phoneNumber}
                  onChange={(e) => setRiderForm({ ...riderForm, phoneNumber: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text focus:border-kaafila-yellow focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-kaafila-yellow px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-kaafila-bg shadow-amber hover:bg-kaafila-yellowHover disabled:opacity-60"
            >
              <UserPlus className="h-4 w-4" />
              <span>{loading ? 'Creating Rider Account...' : 'Register as Rider'}</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleOrgSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="org-name" className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                  Organisation Name *
                </label>
                <input
                  id="org-name"
                  type="text"
                  required
                  value={orgForm.organisationName}
                  onChange={(e) => setOrgForm({ ...orgForm, organisationName: e.target.value })}
                  placeholder="Garhwal Summit Moto"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text focus:border-kaafila-yellow focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="org-email" className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                  Official Email *
                </label>
                <input
                  id="org-email"
                  type="email"
                  required
                  value={orgForm.officialEmail}
                  onChange={(e) => setOrgForm({ ...orgForm, officialEmail: e.target.value })}
                  placeholder="ops@yourcompany.com"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text focus:border-kaafila-yellow focus:outline-none"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="org-password" className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                  Password (min 8 chars) *
                </label>
                <input
                  id="org-password"
                  type="password"
                  required
                  minLength={8}
                  value={orgForm.password}
                  onChange={(e) => setOrgForm({ ...orgForm, password: e.target.value })}
                  placeholder="••••••••"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text focus:border-kaafila-yellow focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="org-confirm" className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                  Confirm Password *
                </label>
                <input
                  id="org-confirm"
                  type="password"
                  required
                  minLength={8}
                  value={orgForm.confirmPassword}
                  onChange={(e) => setOrgForm({ ...orgForm, confirmPassword: e.target.value })}
                  placeholder="••••••••"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text focus:border-kaafila-yellow focus:outline-none"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="org-phone" className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                  Contact Number *
                </label>
                <input
                  id="org-phone"
                  type="tel"
                  required
                  value={orgForm.contactNumber}
                  onChange={(e) => setOrgForm({ ...orgForm, contactNumber: e.target.value })}
                  placeholder="+91 98160 12345"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text focus:border-kaafila-yellow focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="org-location" className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                  Location (City, State) *
                </label>
                <input
                  id="org-location"
                  type="text"
                  required
                  value={orgForm.location}
                  onChange={(e) => setOrgForm({ ...orgForm, location: e.target.value })}
                  placeholder="Manali, Himachal Pradesh"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text focus:border-kaafila-yellow focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="org-website" className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                Official Website *
              </label>
              <input
                id="org-website"
                type="url"
                required
                value={orgForm.officialWebsite}
                onChange={(e) => setOrgForm({ ...orgForm, officialWebsite: e.target.value })}
                placeholder="https://yourcompany.com"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text focus:border-kaafila-yellow focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="org-desc" className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
                Description *
              </label>
              <textarea
                id="org-desc"
                rows={3}
                required
                maxLength={280}
                value={orgForm.description}
                onChange={(e) => setOrgForm({ ...orgForm, description: e.target.value })}
                placeholder="Describe your expeditions, bike fleet, and emergency support (max 280 chars)"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-kaafila-bg px-4 py-2.5 text-sm text-kaafila-text focus:border-kaafila-yellow focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-kaafila-yellow px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-kaafila-bg shadow-amber hover:bg-kaafila-yellowHover disabled:opacity-60"
            >
              <Building2 className="h-4 w-4" />
              <span>{loading ? 'Registering Organisation...' : 'Register Organisation'}</span>
            </button>
          </form>
        )}

        <div className="mt-6 border-t border-white/10 pt-5 text-center text-sm text-kaafila-muted">
          Already registered?{' '}
          <Link to={`/login?role=${role}`} className="font-semibold text-kaafila-yellow hover:underline">
            Sign in here
          </Link>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, Mail, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isFirebaseConfigured } from '../services/firebase';
import { isAdminRole } from '../constants/roles';

export default function LoginPage() {
  const { login, user, profile, authError, setAuthError } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && isAdminRole(profile?.role)) {
      navigate('/alerts', { replace: true });
    }
  }, [user, profile, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setAuthError('Please enter both email and password.');
      return;
    }

    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/alerts', { replace: true });
    } catch {
      // Error is handled in AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <Shield size={28} />
          </div>
          <h1>GuardianCircle Admin</h1>
          <p>Sign in with a verified Admin/Moderator account</p>
        </div>

        {!isFirebaseConfigured && (
          <div className="alert-banner warning">
            <AlertCircle size={18} />
            <span>
              Firebase environment variables are not set. Add{' '}
              <code>REACT_APP_FIREBASE_*</code> values in{' '}
              <code>admin-dashboard/.env</code> or use local emulators.
            </span>
          </div>
        )}

        {authError && (
          <div className="alert-banner danger" role="alert">
            <AlertCircle size={18} />
            <span>{authError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="admin-email">Admin Email</label>
            <div className="input-with-icon">
              <Mail size={16} />
              <input
                id="admin-email"
                type="email"
                placeholder="admin@guardiancircle.app"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="admin-password">Password</label>
            <div className="input-with-icon">
              <Lock size={16} />
              <input
                id="admin-password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          <button type="submit" className="btn-primary full-width" disabled={submitting}>
            {submitting ? 'Verifying credentials...' : 'Sign In to Dashboard'}
          </button>
        </form>

        <div className="login-footer-note">
          <Lock size={14} />
          <span>
            Admin accounts cannot be self-registered. Initial access is provisioned
            via bootstrap script or promoted by an existing Admin.
          </span>
        </div>
      </div>
    </div>
  );
}

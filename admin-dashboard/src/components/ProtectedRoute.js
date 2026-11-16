import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isAdminRole } from '../constants/roles';

export default function ProtectedRoute({ children }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Verifying Admin session...</p>
      </div>
    );
  }

  if (!user || !isAdminRole(profile?.role)) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

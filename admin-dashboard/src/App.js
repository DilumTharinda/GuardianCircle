import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { isAdminRole } from './constants/roles';
import {
  subscribeToActiveAlerts,
  subscribeToAllAlerts,
  subscribeToReports,
} from './services/adminService';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import ActiveAlertsPage from './pages/ActiveAlertsPage';
import ModerationPage from './pages/ModerationPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AdminPromotionPage from './pages/AdminPromotionPage';
import './App.css';

function DashboardRoutes() {
  const { user, profile } = useAuth();
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [allAlerts, setAllAlerts] = useState([]);
  const [reports, setReports] = useState([]);
  const [alertsError, setAlertsError] = useState('');
  const [reportsError, setReportsError] = useState('');

  const isVerifiedAdmin = Boolean(user && isAdminRole(profile?.role));

  useEffect(() => {
    if (!isVerifiedAdmin) {
      setActiveAlerts([]);
      setAllAlerts([]);
      setReports([]);
      return;
    }

    const unsubActive = subscribeToActiveAlerts(
      (list) => {
        setActiveAlerts(list);
        setAlertsError('');
      },
      (err) => setAlertsError(`Alerts listener error: ${err.message}`)
    );

    const unsubAllAlerts = subscribeToAllAlerts(
      (list) => setAllAlerts(list),
      () => {}
    );

    const unsubReports = subscribeToReports(
      (list) => {
        setReports(list);
        setReportsError('');
      },
      (err) => setReportsError(`Reports listener error: ${err.message}`)
    );

    return () => {
      unsubActive();
      unsubAllAlerts();
      unsubReports();
    };
  }, [isVerifiedAdmin]);

  const flaggedCount = reports.filter(
    (r) => r.isFlagged && r.status !== 'removed'
  ).length;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout
              activeAlertCount={activeAlerts.length}
              flaggedReportCount={flaggedCount}
            />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/alerts" replace />} />
        <Route
          path="alerts"
          element={<ActiveAlertsPage alerts={activeAlerts} error={alertsError} />}
        />
        <Route
          path="moderation"
          element={<ModerationPage reports={reports} error={reportsError} />}
        />
        <Route
          path="analytics"
          element={<AnalyticsPage reports={reports} allAlerts={allAlerts} />}
        />
        <Route path="admins" element={<AdminPromotionPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/alerts" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <DashboardRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

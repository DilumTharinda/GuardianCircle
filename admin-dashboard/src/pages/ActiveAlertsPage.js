import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  MapPin,
  Clock,
  Radio,
  Users,
  ExternalLink,
  User,
} from 'lucide-react';
import AlertsMap from '../components/AlertsMap';
import {
  extractCoords,
  fetchUserProfile,
  toDate,
} from '../services/adminService';

const TRIGGER_LABELS = {
  button: 'In-App SOS Button',
  volume: 'Triple Volume Press',
  shake: 'Shake-to-SOS',
  widget: 'Home/Lock Widget',
  fall_detection: 'Fall / Sudden-Stop',
};

export default function ActiveAlertsPage({ alerts = [], error = '' }) {
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [userCache, setUserCache] = useState({});

  useEffect(() => {
    const uidsToFetch = new Set();
    alerts.forEach((a) => {
      const uid = a.triggeredBy || a.userId;
      if (uid && !userCache[uid]) {
        uidsToFetch.add(uid);
      }
    });

    if (uidsToFetch.size === 0) return;

    let cancelled = false;
    Promise.all(
      Array.from(uidsToFetch).map(async (uid) => {
        try {
          const profile = await fetchUserProfile(uid);
          return [uid, profile];
        } catch {
          return [uid, null];
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setUserCache((prev) => {
        const next = { ...prev };
        entries.forEach(([uid, profile]) => {
          next[uid] = profile || { uid, displayName: 'Unknown User' };
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [alerts, userCache]);

  const sosCount = alerts.filter((a) => !a.type || a.type === 'sos').length;
  const fallCount = alerts.filter((a) => a.triggerSource === 'fall_detection').length;
  const hardwareCount = alerts.filter(
    (a) => a.triggerSource === 'volume' || a.triggerSource === 'shake'
  ).length;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Active SOS Alert Dashboard</h1>
          <p className="page-subtitle">
            Real-time emergency alert feed synchronized with Cloud Firestore
          </p>
        </div>
        <div className="live-indicator">
          <span className="pulse-dot" />
          <span>LIVE LISTENER</span>
        </div>
      </div>

      {error && (
        <div className="alert-banner danger">
          <span>{error}</span>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi-card danger">
          <div className="kpi-icon">
            <ShieldAlert size={22} />
          </div>
          <div>
            <div className="kpi-value">{alerts.length}</div>
            <div className="kpi-label">Active Alerts</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">
            <Radio size={22} />
          </div>
          <div>
            <div className="kpi-value">{sosCount}</div>
            <div className="kpi-label">SOS Emergencies</div>
          </div>
        </div>
        <div className="kpi-card warning">
          <div className="kpi-icon">
            <Clock size={22} />
          </div>
          <div>
            <div className="kpi-value">{fallCount}</div>
            <div className="kpi-label">Fall Detections</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">
            <Users size={22} />
          </div>
          <div>
            <div className="kpi-value">{hardwareCount}</div>
            <div className="kpi-label">Hardware / Shake</div>
          </div>
        </div>
      </div>

      <div className="split-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Live Alert Queue ({alerts.length})</h2>
          </div>

          {alerts.length === 0 ? (
            <div className="empty-state">
              <ShieldAlert size={36} />
              <h3>No active SOS alerts</h3>
              <p>All clear. New emergency alerts will appear here immediately.</p>
            </div>
          ) : (
            <div className="alert-list">
              {alerts.map((alert) => {
                const uid = alert.triggeredBy || alert.userId;
                const sender = userCache[uid];
                const coords = extractCoords(alert.location);
                const ts = toDate(alert.timestamp || alert.createdAt);
                const recipients = alert.recipients || alert.recipientIds || [];
                const isSelected = selectedAlert?.id === alert.id;

                return (
                  <div
                    key={alert.id}
                    className={`alert-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedAlert(alert)}
                  >
                    <div className="alert-item-top">
                      <span className="status-pill danger">
                        {(alert.type || 'SOS').toUpperCase()}
                      </span>
                      <span className="trigger-badge">
                        {TRIGGER_LABELS[alert.triggerSource] ||
                          alert.triggerSource ||
                          'Manual Trigger'}
                      </span>
                    </div>

                    <div className="alert-item-user">
                      <User size={15} />
                      <strong>
                        {sender?.displayName ||
                          alert.triggeredByName ||
                          uid ||
                          'Unknown User'}
                      </strong>
                      {sender?.email && (
                        <span className="muted">({sender.email})</span>
                      )}
                    </div>

                    <div className="alert-item-meta">
                      <span>
                        <Clock size={13} />
                        {ts ? ts.toLocaleString() : 'Just now'}
                      </span>
                      <span>
                        <Users size={13} />
                        {recipients.length} recipient{recipients.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    {coords && (
                      <div className="alert-item-coords">
                        <MapPin size={13} />
                        <span>
                          {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                        </span>
                        <a
                          href={`https://maps.google.com/?q=${coords.lat},${coords.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-link"
                        >
                          Maps <ExternalLink size={12} />
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel map-panel">
          <div className="panel-header">
            <h2>Live Incident Map</h2>
            {selectedAlert && (
              <button
                className="btn-ghost btn-sm"
                onClick={() => setSelectedAlert(null)}
              >
                Show All Pins
              </button>
            )}
          </div>
          <AlertsMap
            alerts={alerts}
            selectedAlertId={selectedAlert?.id}
            onSelectAlert={setSelectedAlert}
          />
        </section>
      </div>
    </div>
  );
}

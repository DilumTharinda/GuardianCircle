import React, { useMemo, useState } from 'react';
import {
  Flag,
  CheckCircle2,
  XCircle,
  Trash2,
  Search,
  MapPin,
  ThumbsUp,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  approveReport,
  removeReport,
  permanentlyDeleteReport,
  extractCoords,
  toDate,
} from '../services/adminService';

const FILTERS = [
  { id: 'all', label: 'All Reports' },
  { id: 'flagged', label: 'Flagged / Low Confidence' },
  { id: 'lost_found', label: 'Lost & Found' },
  { id: 'unsafe', label: 'Unsafe Locations' },
  { id: 'removed', label: 'Removed' },
];

export default function ModerationPage({ reports = [], error = '' }) {
  const { profile } = useAuth();
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [actionMessage, setActionMessage] = useState('');

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (filter === 'flagged' && !r.isFlagged) return false;
      if (
        filter === 'lost_found' &&
        !['lost', 'found', 'sighting'].includes(r.type)
      ) {
        return false;
      }
      if (filter === 'unsafe' && r.type !== 'unsafe_location') return false;
      if (filter === 'removed' && r.status !== 'removed') return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matches =
          (r.category || '').toLowerCase().includes(q) ||
          (r.description || '').toLowerCase().includes(q) ||
          (r.type || '').toLowerCase().includes(q) ||
          (r.id || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [reports, filter, searchTerm]);

  const handleApprove = async (reportId) => {
    setBusyId(reportId);
    setActionMessage('');
    try {
      await approveReport(reportId, profile);
      setActionMessage(`Report ${reportId} approved.`);
    } catch (err) {
      setActionMessage(`Failed to approve report: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (reportId) => {
    const reason = window.prompt(
      'Optional reason for removing this report from public view:',
      'Low confidence / policy violation'
    );
    if (reason === null) return;

    setBusyId(reportId);
    setActionMessage('');
    try {
      await removeReport(reportId, profile, reason);
      setActionMessage(`Report ${reportId} hidden from public view.`);
    } catch (err) {
      setActionMessage(`Failed to remove report: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (reportId) => {
    if (
      !window.confirm(
        'Permanently delete this report document from Firestore? This cannot be undone.'
      )
    ) {
      return;
    }

    setBusyId(reportId);
    setActionMessage('');
    try {
      await permanentlyDeleteReport(reportId, profile);
      setActionMessage(`Report ${reportId} permanently deleted.`);
    } catch (err) {
      setActionMessage(`Failed to delete report: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Report Moderation</h1>
          <p className="page-subtitle">
            Review, approve, or remove Lost &amp; Found and Unsafe-Location reports
          </p>
        </div>
      </div>

      {error && <div className="alert-banner danger">{error}</div>}
      {actionMessage && <div className="alert-banner info">{actionMessage}</div>}

      <div className="toolbar">
        <div className="filter-tabs">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`filter-tab ${filter === f.id ? 'active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search category, description, ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {filteredReports.length === 0 ? (
        <div className="panel empty-state">
          <Flag size={36} />
          <h3>No matching reports</h3>
          <p>Try switching filter tabs or clearing your search query.</p>
        </div>
      ) : (
        <div className="moderation-grid">
          {filteredReports.map((report) => {
            const coords = extractCoords(report.location);
            const created = toDate(report.createdAt);
            const isBusy = busyId === report.id;

            return (
              <article key={report.id} className="report-card">
                {report.photoURL && (
                  <div className="report-image-wrap">
                    <img
                      src={report.photoURL}
                      alt={report.category || 'Report'}
                      className="report-image"
                    />
                  </div>
                )}

                <div className="report-body">
                  <div className="report-badges">
                    <span className={`type-pill ${report.type || 'lost'}`}>
                      {(report.type || 'report').replace('_', ' ')}
                    </span>
                    <span className={`status-pill ${report.status || 'open'}`}>
                      {report.status || 'open'}
                    </span>
                    {report.isFlagged && (
                      <span className="status-pill warning">
                        <AlertTriangle size={12} /> Flagged
                      </span>
                    )}
                  </div>

                  <h3 className="report-title">
                    {report.category || 'Uncategorized Report'}
                  </h3>
                  <p className="report-desc">
                    {report.description || 'No description provided.'}
                  </p>

                  <div className="confidence-row">
                    <span>Confidence: {report.confidenceScore}%</span>
                    <div className="confidence-bar">
                      <div
                        className={`confidence-fill ${
                          report.confidenceScore < 50 ? 'low' : 'high'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, report.confidenceScore))}%` }}
                      />
                    </div>
                  </div>

                  <div className="report-meta">
                    <span>
                      <ThumbsUp size={13} /> {report.upvotes ?? report.boostCount ?? 0} upvotes
                    </span>
                    {coords && (
                      <span>
                        <MapPin size={13} /> {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                      </span>
                    )}
                    <span>{created ? created.toLocaleDateString() : 'Recent'}</span>
                  </div>

                  <div className="report-actions">
                    <button
                      className="btn-success btn-sm"
                      disabled={isBusy}
                      onClick={() => handleApprove(report.id)}
                    >
                      <CheckCircle2 size={14} /> Approve
                    </button>
                    {report.status !== 'removed' && (
                      <button
                        className="btn-warning btn-sm"
                        disabled={isBusy}
                        onClick={() => handleRemove(report.id)}
                      >
                        <XCircle size={14} /> Remove
                      </button>
                    )}
                    <button
                      className="btn-danger-outline btn-sm"
                      disabled={isBusy}
                      onClick={() => handleDelete(report.id)}
                      title="Permanently delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

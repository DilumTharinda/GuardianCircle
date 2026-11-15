import React, { useEffect, useMemo, useState } from 'react';
import {
  UserCheck,
  Search,
  ShieldPlus,
  History,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS, isAdminRole } from '../constants/roles';
import {
  fetchAllUsers,
  promoteUserToAdmin,
  subscribeToAuditLog,
  toDate,
} from '../services/adminService';

export default function AdminPromotionPage() {
  const { profile } = useAuth();
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [auditLogs, setAuditLogs] = useState([]);
  const [promotingUid, setPromotingUid] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  useEffect(() => {
    let active = true;
    setLoadingUsers(true);
    fetchAllUsers()
      .then((list) => {
        if (active) setUsers(list);
      })
      .catch((err) => {
        if (active) {
          setFeedback({
            type: 'danger',
            text: `Failed to load users: ${err.message}`,
          });
        }
      })
      .finally(() => {
        if (active) setLoadingUsers(false);
      });

    const unsubAudit = subscribeToAuditLog(
      (logs) => setAuditLogs(logs),
      () => {}
    );

    return () => {
      active = false;
      unsubAudit();
    };
  }, []);

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.email || '').toLowerCase().includes(q) ||
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.uid || '').toLowerCase().includes(q)
    );
  }, [users, searchTerm]);

  const handlePromote = async (targetUser) => {
    const confirmed = window.confirm(
      `Promote "${targetUser.displayName || targetUser.email}" (${targetUser.email}) to Admin/Moderator? This grants full dashboard and moderation privileges.`
    );
    if (!confirmed) return;

    setPromotingUid(targetUser.uid);
    setFeedback({ type: '', text: '' });
    try {
      await promoteUserToAdmin(targetUser, profile);
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === targetUser.uid ? { ...u, role: 'admin_moderator' } : u
        )
      );
      setFeedback({
        type: 'success',
        text: `${targetUser.email} has been promoted to Admin/Moderator and recorded in the audit log.`,
      });
    } catch (err) {
      setFeedback({
        type: 'danger',
        text: `Role promotion requires the protected 'promoteToAdmin' Cloud Function (${err.message}). Direct client role writes are blocked by Firestore security rules.`,
      });
    } finally {
      setPromotingUid(null);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Admin Roles &amp; Audit Log</h1>
          <p className="page-subtitle">
            Promote verified users to Admin/Moderator via protected server-side execution (FR-6.5)
          </p>
        </div>
      </div>

      {feedback.text && (
        <div className={`alert-banner ${feedback.type}`}>
          {feedback.type === 'success' ? (
            <CheckCircle2 size={18} />
          ) : (
            <AlertCircle size={18} />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="split-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>
              <UserCheck size={18} /> Registered Users ({filteredUsers.length})
            </h2>
          </div>

          <div className="search-box full-width-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search by email, name, or UID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {loadingUsers ? (
            <p className="muted">Loading registered accounts...</p>
          ) : filteredUsers.length === 0 ? (
            <p className="muted">No matching users found.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => {
                    const alreadyAdmin = isAdminRole(u.role);
                    return (
                      <tr key={u.uid}>
                        <td>
                          <div className="table-user-name">
                            {u.displayName || 'Unnamed User'}
                          </div>
                          <div className="table-user-email">{u.email}</div>
                        </td>
                        <td>
                          <span
                            className={`status-pill ${
                              alreadyAdmin ? 'admin' : 'neutral'
                            }`}
                          >
                            {ROLE_LABELS[u.role] || u.role || 'primary_user'}
                          </span>
                        </td>
                        <td>
                          {alreadyAdmin ? (
                            <span className="muted">Admin</span>
                          ) : (
                            <button
                              className="btn-primary btn-sm"
                              disabled={promotingUid === u.uid}
                              onClick={() => handlePromote(u)}
                            >
                              <ShieldPlus size={14} />
                              {promotingUid === u.uid
                                ? 'Promoting...'
                                : 'Promote'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>
              <History size={18} /> Security &amp; Moderation Audit Log
            </h2>
          </div>

          {auditLogs.length === 0 ? (
            <p className="muted">No audit events recorded yet.</p>
          ) : (
            <div className="audit-list">
              {auditLogs.map((log) => {
                const ts = toDate(log.timestamp);
                return (
                  <div key={log.id} className="audit-item">
                    <div className="audit-top">
                      <span className="status-pill info">{log.action}</span>
                      <span className="muted">
                        {ts ? ts.toLocaleString() : 'Pending'}
                      </span>
                    </div>
                    <div className="audit-note">
                      {log.note || `Target: ${log.targetEmail || log.targetUid}`}
                    </div>
                    <div className="audit-meta">
                      By: {log.performedByEmail || log.performedBy || 'SYSTEM'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

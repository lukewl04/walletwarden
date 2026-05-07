/**
 * AdminDashboard.jsx — Admin-only user management dashboard.
 *
 * Lists all users and allows admins to:
 * - View user plans and roles
 * - Set plan (free/plus/pro)
 * - Grant/revoke admin role
 * - Delete users
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/navbar';
import { getAuthHeaders } from '../utils/userToken';
import { useAdminRole } from '../hooks/useAdminRole';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const PLANS = { FREE: 'free', PLUS: 'plus', PRO: 'pro' };

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;500;600&display=swap');
  @import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css');

  .adm-wrap {
    font-family: 'Syne', sans-serif;
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
    min-height: 100vh;
  }

  .adm-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 1.75rem;
    padding-bottom: 1.25rem;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }

  .adm-title {
    font-size: 20px;
    font-weight: 600;
    color: #f1f0fb;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .adm-title i {
    font-size: 22px;
    color: #7F77DD;
  }

  .adm-subtitle {
    font-size: 13px;
    color: #94a3b8;
    margin-top: 4px;
    font-weight: 400;
  }

  .btn-refresh {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 13px;
    font-family: 'Syne', sans-serif;
    color: #94a3b8;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 7px;
    transition: all 0.15s;
  }

  .btn-refresh:hover:not(:disabled) {
    color: #f1f0fb;
    background: rgba(255,255,255,0.09);
  }

  .btn-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-refresh i { font-size: 15px; }

  /* Message banner */
  .adm-msg {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    margin-bottom: 1.25rem;
  }

  .adm-msg i { font-size: 16px; }
  .adm-msg.success { background: rgba(29,158,117,0.15); color: #5dcaa5; border: 1px solid rgba(29,158,117,0.25); }
  .adm-msg.error   { background: rgba(226,75,74,0.15);  color: #f09595; border: 1px solid rgba(226,75,74,0.25); }

  /* Stats */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
    margin-bottom: 1.75rem;
  }

  .stat-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 10px;
    padding: 14px 16px;
  }

  .stat-val {
    font-size: 26px;
    font-weight: 600;
    line-height: 1;
    margin-bottom: 5px;
  }

  .stat-label {
    font-size: 12px;
    color: #64748b;
    font-weight: 400;
  }

  .stat-purple .stat-val { color: #7F77DD; }
  .stat-blue   .stat-val { color: #378ADD; }
  .stat-teal   .stat-val { color: #1D9E75; }
  .stat-coral  .stat-val { color: #D85A30; }
  .stat-amber  .stat-val { color: #BA7517; }

  /* Section head */
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .section-title {
    font-size: 14px;
    font-weight: 500;
    color: #f1f0fb;
  }

  .user-count {
    font-size: 12px;
    color: #64748b;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 20px;
    padding: 2px 10px;
  }

  /* Table */
  .table-wrap {
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    overflow: hidden;
  }

  .adm-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .adm-table thead {
    background: rgba(255,255,255,0.03);
  }

  .adm-table th {
    padding: 11px 14px;
    text-align: left;
    font-size: 11px;
    font-weight: 500;
    color: #64748b;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .adm-table td {
    padding: 13px 14px;
    border-top: 1px solid rgba(255,255,255,0.05);
    vertical-align: middle;
    color: #cbd5e1;
  }

  .adm-table tbody tr:hover td {
    background: rgba(255,255,255,0.025);
  }

  .mono {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: #64748b;
  }

  /* Badges */
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
  }

  .badge i { font-size: 12px; }

  .badge-admin    { background: rgba(127,119,221,0.18); color: #a5a0f0; border: 1px solid rgba(127,119,221,0.3); }
  .badge-user     { background: rgba(255,255,255,0.05); color: #94a3b8; border: 1px solid rgba(255,255,255,0.1); }
  .badge-free     { background: rgba(255,255,255,0.05); color: #94a3b8; border: 1px solid rgba(255,255,255,0.1); }
  .badge-plus     { background: rgba(55,138,221,0.15);  color: #85b7eb; border: 1px solid rgba(55,138,221,0.25); }
  .badge-pro      { background: rgba(127,119,221,0.18); color: #a5a0f0; border: 1px solid rgba(127,119,221,0.3); }
  .badge-active   { background: rgba(29,158,117,0.15);  color: #5dcaa5; border: 1px solid rgba(29,158,117,0.25); }
  .badge-trialing { background: rgba(186,117,23,0.15);  color: #faC775; border: 1px solid rgba(186,117,23,0.25); }
  .badge-past_due { background: rgba(226,75,74,0.15);   color: #f09595; border: 1px solid rgba(226,75,74,0.25); }
  .badge-canceled { background: rgba(255,255,255,0.05); color: #64748b; border: 1px solid rgba(255,255,255,0.08); }

  /* Actions */
  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .plan-select {
    font-family: 'Syne', sans-serif;
    font-size: 12px;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 7px;
    padding: 5px 8px;
    background: rgba(255,255,255,0.05);
    color: #cbd5e1;
    cursor: pointer;
    height: 30px;
    transition: border-color 0.15s;
  }

  .plan-select:focus {
    outline: none;
    border-color: #7F77DD;
    box-shadow: 0 0 0 3px rgba(127,119,221,0.2);
  }

  .act-btn {
    height: 30px;
    padding: 0 10px;
    border-radius: 7px;
    font-size: 12px;
    font-family: 'Syne', sans-serif;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    color: #94a3b8;
    display: flex;
    align-items: center;
    gap: 5px;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .act-btn i { font-size: 14px; }

  .act-btn:hover:not(:disabled) {
    background: rgba(255,255,255,0.09);
    color: #f1f0fb;
  }

  .act-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .act-btn.grant  { color: #85b7eb; border-color: rgba(55,138,221,0.3); }
  .act-btn.grant:hover:not(:disabled)  { background: rgba(55,138,221,0.12); }

  .act-btn.revoke { color: #faC775; border-color: rgba(186,117,23,0.3); }
  .act-btn.revoke:hover:not(:disabled) { background: rgba(186,117,23,0.12); }

  .act-btn.remove { color: #f09595; border-color: rgba(226,75,74,0.3); }
  .act-btn.remove:hover:not(:disabled) { background: rgba(226,75,74,0.12); }

  .act-btn.delete { color: #f09595; border-color: rgba(226,75,74,0.3); }
  .act-btn.delete:hover:not(:disabled) { background: rgba(226,75,74,0.12); }

  /* Empty / loading / error states */
  .adm-state {
    text-align: center;
    padding: 4rem 2rem;
    color: #64748b;
    font-size: 14px;
  }

  .adm-state h3 {
    font-size: 16px;
    font-weight: 500;
    color: #94a3b8;
    margin-bottom: 8px;
  }

  .btn-retry {
    margin-top: 14px;
    padding: 8px 20px;
    border-radius: 8px;
    background: rgba(127,119,221,0.15);
    border: 1px solid rgba(127,119,221,0.3);
    color: #a5a0f0;
    font-family: 'Syne', sans-serif;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-retry:hover { background: rgba(127,119,221,0.25); }

  @media (max-width: 900px) {
    .stats-grid { grid-template-columns: repeat(3, 1fr); }
  }

  @media (max-width: 600px) {
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .adm-wrap { padding: 1rem; }
  }
`;

function PlanBadge({ plan }) {
  const map = {
    free: { cls: 'badge-free', icon: null, label: 'Free' },
    plus: { cls: 'badge-plus', icon: 'ti-star', label: 'Plus' },
    pro:  { cls: 'badge-pro',  icon: 'ti-rocket', label: 'Pro' },
  };
  const { cls, icon, label } = map[plan] || map.free;
  return (
    <span className={`badge ${cls}`}>
      {icon && <i className={`ti ${icon}`} aria-hidden="true" />}
      {label}
    </span>
  );
}

function RoleBadge({ role }) {
  return role === 'admin' ? (
    <span className="badge badge-admin">
      <i className="ti ti-shield" aria-hidden="true" />
      Admin
    </span>
  ) : (
    <span className="badge badge-user">
      <i className="ti ti-user" aria-hidden="true" />
      User
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    active:   { cls: 'badge-active',   icon: 'ti-circle-check', label: 'Active' },
    trialing: { cls: 'badge-trialing', icon: 'ti-clock',         label: 'Trialing' },
    past_due: { cls: 'badge-past_due', icon: 'ti-alert-circle',  label: 'Past due' },
    canceled: { cls: 'badge-canceled', icon: 'ti-minus',         label: 'Canceled' },
  };
  const entry = map[status];
  if (!entry) return <span className="badge badge-canceled">—</span>;
  return (
    <span className={`badge ${entry.cls}`}>
      <i className={`ti ${entry.icon}`} aria-hidden="true" />
      {entry.label}
    </span>
  );
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminDashboard() {
  const { isAdmin, loading: adminLoading } = useAdminRole();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!adminLoading && !isAdmin) navigate('/', { replace: true });
  }, [adminLoading, isAdmin, navigate]);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin]);

  async function fetchData() {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [usersRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/admin/users`, { headers }),
        fetch(`${API_URL}/admin/stats`, { headers }),
      ]);
      if (!usersRes.ok || !statsRes.ok) throw new Error('Failed to fetch admin data');
      const usersData = await usersRes.json();
      const statsData = await statsRes.json();
      setUsers(usersData.users);
      setStats(statsData.stats);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function setPlan(userId, plan) {
    const key = `${userId}-plan`;
    try {
      setActionLoading(p => ({ ...p, [key]: true }));
      const res = await fetch(`${API_URL}/admin/users/${userId}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update plan');
      showMessage(`✓ ${data.message}`, 'success');
      await fetchData();
    } catch (err) {
      showMessage(`✗ ${err.message}`, 'error');
    } finally {
      setActionLoading(p => ({ ...p, [key]: false }));
    }
  }

  async function removePlan(userId) {
    if (!confirm("Remove this user's plan and set to free?")) return;
    const key = `${userId}-remove`;
    try {
      setActionLoading(p => ({ ...p, [key]: true }));
      const res = await fetch(`${API_URL}/admin/users/${userId}/plan`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to remove plan');
      showMessage(`✓ ${data.message}`, 'success');
      await fetchData();
    } catch (err) {
      showMessage(`✗ ${err.message}`, 'error');
    } finally {
      setActionLoading(p => ({ ...p, [key]: false }));
    }
  }

  async function toggleAdmin(userId, currentRole) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    const action = newRole === 'admin' ? 'grant admin to' : 'revoke admin from';
    if (!confirm(`${action} this user?`)) return;
    const key = `${userId}-role`;
    try {
      setActionLoading(p => ({ ...p, [key]: true }));
      const res = await fetch(`${API_URL}/admin/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update role');
      showMessage(`✓ ${data.message}`, 'success');
      await fetchData();
    } catch (err) {
      showMessage(`✗ ${err.message}`, 'error');
    } finally {
      setActionLoading(p => ({ ...p, [key]: false }));
    }
  }

  async function deleteUser(userId, email) {
    const displayName = email || userId.slice(0, 20) + '...';
    if (!confirm(`⚠️ PERMANENTLY DELETE user ${displayName}?\n\nThis will remove ALL their data and cannot be undone.`)) return;
    const key = `${userId}-delete`;
    try {
      setActionLoading(p => ({ ...p, [key]: true }));
      const res = await fetch(`${API_URL}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete user');
      showMessage(`✓ ${data.message}`, 'success');
      await fetchData();
    } catch (err) {
      showMessage(`✗ ${err.message}`, 'error');
    } finally {
      setActionLoading(p => ({ ...p, [key]: false }));
    }
  }

  function showMessage(text, type) {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  }

  const stateContent = () => {
    if (loading) return <div className="adm-state">Loading admin dashboard...</div>;
    if (error) return (
      <div className="adm-state">
        <h3>⚠️ Error loading dashboard</h3>
        <p>{error}</p>
        <button className="btn-retry" onClick={fetchData}>Retry</button>
      </div>
    );
    return null;
  };

  return (
    <>
      <style>{styles}</style>
      <Navbar />
      <div className="adm-wrap" style={{ paddingTop: '5rem' }}>
        <div className="adm-header">
          <div>
            <div className="adm-title">
              <i className="ti ti-shield-check" aria-hidden="true" />
              Admin dashboard
            </div>
            <div className="adm-subtitle">Manage users, plans, and roles</div>
          </div>
          <button className="btn-refresh" onClick={fetchData} disabled={loading}>
            <i className="ti ti-refresh" aria-hidden="true" />
            Refresh
          </button>
        </div>

        {message && (
          <div className={`adm-msg ${message.type}`}>
            <i className={`ti ${message.type === 'success' ? 'ti-circle-check' : 'ti-alert-circle'}`} aria-hidden="true" />
            {message.text}
          </div>
        )}

        {stateContent()}

        {!loading && !error && (
          <>
            {stats && (
              <div className="stats-grid">
                <div className="stat-card stat-purple">
                  <div className="stat-val">{stats.totalUsers}</div>
                  <div className="stat-label">Total users</div>
                </div>
                <div className="stat-card stat-blue">
                  <div className="stat-val">{stats.planBreakdown?.free ?? 0}</div>
                  <div className="stat-label">Free plan</div>
                </div>
                <div className="stat-card stat-teal">
                  <div className="stat-val">{stats.planBreakdown?.plus ?? 0}</div>
                  <div className="stat-label">Plus plan</div>
                </div>
                <div className="stat-card stat-coral">
                  <div className="stat-val">{stats.planBreakdown?.pro ?? 0}</div>
                  <div className="stat-label">Pro plan</div>
                </div>
                <div className="stat-card stat-amber">
                  <div className="stat-val">{stats.adminUsers}</div>
                  <div className="stat-label">Admins</div>
                </div>
              </div>
            )}

            <div className="section-head">
              <div className="section-title">Users</div>
              <span className="user-count">{users.length} total</span>
            </div>

            <div className="table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', color: '#64748b', padding: '3rem' }}>
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    users.map(user => (
                      <tr key={user.id}>
                        <td>
                          <span className="mono" title={user.user_id}>
                            {user.user_id.slice(0, 18)}…
                          </span>
                        </td>
                        <td>{user.email || '—'}</td>
                        <td><RoleBadge role={user.role} /></td>
                        <td><PlanBadge plan={user.plan} /></td>
                        <td><StatusBadge status={user.plan_status} /></td>
                        <td>{formatDate(user.created_at)}</td>
                        <td>
                          <div className="actions">
                            <select
                              className="plan-select"
                              value={user.plan}
                              disabled={actionLoading[`${user.user_id}-plan`]}
                              onChange={e => setPlan(user.user_id, e.target.value)}
                            >
                              <option value={PLANS.FREE}>Free</option>
                              <option value={PLANS.PLUS}>Plus</option>
                              <option value={PLANS.PRO}>Pro</option>
                            </select>

                            <button
                              className={`act-btn ${user.role === 'admin' ? 'revoke' : 'grant'}`}
                              onClick={() => toggleAdmin(user.user_id, user.role)}
                              disabled={actionLoading[`${user.user_id}-role`]}
                              title={user.role === 'admin' ? 'Revoke admin' : 'Grant admin'}
                            >
                              <i className={`ti ${user.role === 'admin' ? 'ti-shield-off' : 'ti-shield-plus'}`} aria-hidden="true" />
                              {user.role === 'admin' ? 'Revoke' : 'Grant'}
                            </button>

                            {user.plan !== PLANS.FREE && (
                              <button
                                className="act-btn remove"
                                onClick={() => removePlan(user.user_id)}
                                disabled={actionLoading[`${user.user_id}-remove`]}
                                title="Remove plan (set to free)"
                              >
                                <i className="ti ti-x" aria-hidden="true" />
                              </button>
                            )}

                            <button
                              className="act-btn delete"
                              onClick={() => deleteUser(user.user_id, user.email)}
                              disabled={actionLoading[`${user.user_id}-delete`]}
                              title="Permanently delete user"
                            >
                              <i className="ti ti-trash" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}

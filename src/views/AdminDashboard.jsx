/**
 * AdminDashboard.jsx — Admin-only user management dashboard.
 * 
 * Lists all users and allows admins to:
 * - View user plans and roles
 * - Set plan (free/plus/pro)
 * - Grant/revoke admin role
 */

import React, { useState, useEffect } from 'react';
import Navbar from '../components/navbar';
import { getUserToken } from '../utils/userToken';
import './AdminDashboard.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const PLANS = {
  FREE: 'free',
  PLUS: 'plus',
  PRO: 'pro',
};

const PLAN_LABELS = {
  [PLANS.FREE]: 'Free',
  [PLANS.PLUS]: 'Plus ($5/mo)',
  [PLANS.PRO]: 'Pro ($6.99/mo)',
};

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [message, setMessage] = useState(null);

  // Fetch users and stats
  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      const token = getUserToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [usersRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/admin/users`, { headers }),
        fetch(`${API_URL}/admin/stats`, { headers }),
      ]);

      if (!usersRes.ok || !statsRes.ok) {
        throw new Error('Failed to fetch admin data');
      }

      const usersData = await usersRes.json();
      const statsData = await statsRes.json();

      setUsers(usersData.users);
      setStats(statsData.stats);
      setError(null);
    } catch (err) {
      console.error('[Admin] Error fetching data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Set user plan
  async function setPlan(userId, plan) {
    const key = `${userId}-plan`;
    try {
      setActionLoading(prev => ({ ...prev, [key]: true }));
      const token = getUserToken();

      const response = await fetch(`${API_URL}/admin/users/${userId}/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to update plan');
      }

      showMessage(`✓ ${data.message}`, 'success');
      await fetchData();
    } catch (err) {
      console.error('[Admin] Error setting plan:', err);
      showMessage(`✗ ${err.message}`, 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }));
    }
  }

  // Remove plan (set to free)
  async function removePlan(userId) {
    const key = `${userId}-remove`;
    if (!confirm('Remove this user\'s plan and set to free?')) return;

    try {
      setActionLoading(prev => ({ ...prev, [key]: true }));
      const token = getUserToken();

      const response = await fetch(`${API_URL}/admin/users/${userId}/plan`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to remove plan');
      }

      showMessage(`✓ ${data.message}`, 'success');
      await fetchData();
    } catch (err) {
      console.error('[Admin] Error removing plan:', err);
      showMessage(`✗ ${err.message}`, 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }));
    }
  }

  // Toggle admin role
  async function toggleAdmin(userId, currentRole) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    const action = newRole === 'admin' ? 'grant admin to' : 'revoke admin from';
    
    if (!confirm(`${action} this user?`)) return;

    const key = `${userId}-role`;
    try {
      setActionLoading(prev => ({ ...prev, [key]: true }));
      const token = getUserToken();

      const response = await fetch(`${API_URL}/admin/users/${userId}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to update role');
      }

      showMessage(`✓ ${data.message}`, 'success');
      await fetchData();
    } catch (err) {
      console.error('[Admin] Error updating role:', err);
      showMessage(`✗ ${err.message}`, 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }));
    }
  }

  function showMessage(text, type) {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  }

  function formatDate(dateString) {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString();
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="admin-dashboard">
          <div className="admin-loading">Loading admin dashboard...</div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Navbar />
        <div className="admin-dashboard">
          <div className="admin-error">
            <h3>⚠️ Error Loading Admin Dashboard</h3>
            <p>{error}</p>
            <button onClick={fetchData} className="btn-retry">Retry</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="admin-dashboard">
        <header className="admin-header">
          <h1>🛡️ Admin Dashboard</h1>
          <button onClick={fetchData} className="btn-refresh" disabled={loading}>
            🔄 Refresh
          </button>
        </header>

        {message && (
          <div className={`admin-message ${message.type}`}>
            {message.text}
          </div>
        )}

        {/* Stats Cards */}
        {stats && (
          <div className="admin-stats">
            <div className="stat-card">
              <div className="stat-value">{stats.totalUsers}</div>
              <div className="stat-label">Total Users</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.planBreakdown.free}</div>
              <div className="stat-label">Free Plan</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.planBreakdown.plus}</div>
              <div className="stat-label">Plus Plan</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.planBreakdown.pro}</div>
              <div className="stat-label">Pro Plan</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.adminUsers}</div>
              <div className="stat-label">Admins</div>
            </div>
          </div>
        )}

        {/* Users Table */}
        <div className="users-section">
          <h2>Users ({users.length})</h2>
          <div className="users-table-container">
            <table className="users-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Current Plan</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td className="user-id" title={user.user_id}>
                      {user.user_id.slice(0, 20)}...
                    </td>
                    <td className="user-email">
                      {user.email || '—'}
                    </td>
                    <td>
                      <span className={`role-badge ${user.role}`}>
                        {user.role === 'admin' ? '🛡️ Admin' : '👤 User'}
                      </span>
                    </td>
                    <td>
                      <span className={`plan-badge ${user.plan}`}>
                        {PLAN_LABELS[user.plan] || user.plan}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${user.plan_status || 'none'}`}>
                        {user.plan_status || '—'}
                      </span>
                    </td>
                    <td>{formatDate(user.created_at)}</td>
                    <td className="actions-cell">
                      {/* Plan dropdown */}
                      <select
                        value={user.plan}
                        onChange={(e) => setPlan(user.user_id, e.target.value)}
                        disabled={actionLoading[`${user.user_id}-plan`]}
                        className="plan-select"
                      >
                        <option value={PLANS.FREE}>Free</option>
                        <option value={PLANS.PLUS}>Plus</option>
                        <option value={PLANS.PRO}>Pro</option>
                      </select>

                      {/* Admin toggle */}
                      <button
                        onClick={() => toggleAdmin(user.user_id, user.role)}
                        disabled={actionLoading[`${user.user_id}-role`]}
                        className={`btn-admin-toggle ${user.role === 'admin' ? 'revoke' : 'grant'}`}
                        title={user.role === 'admin' ? 'Revoke Admin' : 'Grant Admin'}
                      >
                        {user.role === 'admin' ? '🛡️−' : '🛡️+'}
                      </button>

                      {/* Remove plan button */}
                      {user.plan !== PLANS.FREE && (
                        <button
                          onClick={() => removePlan(user.user_id)}
                          disabled={actionLoading[`${user.user_id}-remove`]}
                          className="btn-remove"
                          title="Remove Plan (Set Free)"
                        >
                          ✗
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {users.length === 0 && (
            <div className="no-users">No users found.</div>
          )}
        </div>
      </div>
    </>
  );
}

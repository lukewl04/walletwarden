/**
 * AdminDashboard.jsx — Admin-only user management dashboard.
 * 
 * Lists all users and allows admins to:
 * - View user plans and roles
 * - Set plan (free/plus/pro)
 * - Grant/revoke admin role
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/navbar';
import { getAuthHeaders } from '../utils/userToken';
import { useAdminRole } from '../hooks/useAdminRole';
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

// Custom Dropdown Component
function CustomDropdown({ value, onChange, disabled, options }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (newValue) => {
    onChange(newValue);
    setIsOpen(false);
  };

  const currentLabel = options.find(opt => opt.value === value)?.label || value;

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="h-9 px-3 bg-slate-800 border border-white/10 rounded-lg text-slate-300 text-sm font-medium hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span>{currentLabel}</span>
        <svg 
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full mt-1 w-full bg-slate-800 border border-white/10 rounded-lg shadow-lg z-20 py-1">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className="w-full px-3 py-2 text-left text-slate-300 text-sm hover:bg-slate-700 transition-colors duration-150 first:rounded-t-lg last:rounded-b-lg"
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
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

  // Redirect non-admins away
  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      navigate('/', { replace: true });
    }
  }, [adminLoading, isAdmin, navigate]);

  // Fetch users and stats
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

      const response = await fetch(`${API_URL}/admin/users/${userId}/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
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

      const response = await fetch(`${API_URL}/admin/users/${userId}/plan`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
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

      const response = await fetch(`${API_URL}/admin/users/${userId}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
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
    <div
      className="container-fluid py-4 mt-5"
      style={{ maxWidth: 1200, minHeight: "100vh", overflowY: "auto" }}
    >
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
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="h-16">
                  <th className="px-4 text-left font-semibold text-slate-300">User ID</th>
                  <th className="px-4 text-left font-semibold text-slate-300">Email</th>
                  <th className="px-4 text-left font-semibold text-slate-300">Role</th>
                  <th className="px-4 text-left font-semibold text-slate-300">Current Plan</th>
                  <th className="px-4 text-left font-semibold text-slate-300">Status</th>
                  <th className="px-4 text-left font-semibold text-slate-300">Created</th>
                  <th className="px-4 text-left font-semibold text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id} className="h-16 border-b border-slate-700/50 hover:bg-slate-800/30">
                    <td className="px-4 align-middle">
                      <div className="flex items-center h-full">
                        <span className="text-slate-300 font-mono text-sm" title={user.user_id}>
                          {user.user_id.slice(0, 20)}...
                        </span>
                      </div>
                    </td>
                    <td className="px-4 align-middle">
                      <div className="flex items-center h-full">
                        <span className="text-slate-300">{user.email || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 align-middle">
                      <div className="flex items-center h-full">
                        <span className={`inline-flex items-center h-8 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.role === 'admin' 
                            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' 
                            : 'bg-slate-600/50 text-slate-300 border border-slate-500/30'
                        }`}>
                          {user.role === 'admin' ? '🛡️ Admin' : '👤 User'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 align-middle">
                      <div className="flex items-center h-full">
                        <span className={`inline-flex items-center h-8 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.plan === 'free' ? 'bg-slate-600/50 text-slate-300 border border-slate-500/30' :
                          user.plan === 'plus' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                          user.plan === 'pro' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                          'bg-slate-600/50 text-slate-300 border border-slate-500/30'
                        }`}>
                          {PLAN_LABELS[user.plan] || user.plan}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 align-middle">
                      <div className="flex items-center h-full">
                        <span className={`inline-flex items-center h-8 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.plan_status === 'active' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                          user.plan_status === 'trialing' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                          user.plan_status === 'past_due' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                          user.plan_status === 'canceled' ? 'bg-gray-500/20 text-gray-400 border border-gray-500/30' :
                          'bg-slate-600/50 text-slate-400 border border-slate-500/30'
                        }`}>
                          {user.plan_status || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 align-middle">
                      <div className="flex items-center h-full">
                        <span className="text-slate-300 text-sm">{formatDate(user.created_at)}</span>
                      </div>
                    </td>
                    <td className="px-4 align-middle">
                      <div className="flex items-center h-full gap-2">
                        {/* Custom Plan Dropdown */}
                        <CustomDropdown
                          value={user.plan}
                          onChange={(value) => setPlan(user.user_id, value)}
                          disabled={actionLoading[`${user.user_id}-plan`]}
                          options={[
                            { value: PLANS.FREE, label: 'Free' },
                            { value: PLANS.PLUS, label: 'Plus' },
                            { value: PLANS.PRO, label: 'Pro' }
                          ]}
                        />

                        {/* Admin toggle */}
                        <button
                          onClick={() => toggleAdmin(user.user_id, user.role)}
                          disabled={actionLoading[`${user.user_id}-role`]}
                          className={`h-9 px-3 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-center ${
                            user.role === 'admin'
                              ? 'bg-orange-600 hover:bg-orange-700 text-white'
                              : 'bg-green-600 hover:bg-green-700 text-white'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                          title={user.role === 'admin' ? 'Revoke Admin' : 'Grant Admin'}
                        >
                          {user.role === 'admin' ? '🛡️−' : '🛡️+'}
                        </button>

                        {/* Remove plan button */}
                        {user.plan !== PLANS.FREE && (
                          <button
                            onClick={() => removePlan(user.user_id)}
                            disabled={actionLoading[`${user.user_id}-remove`]}
                            className="h-9 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Remove Plan (Set Free)"
                          >
                            ✗
                          </button>
                        )}
                      </div>
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
    </div>
  );
}

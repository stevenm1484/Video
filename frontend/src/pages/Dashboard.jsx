import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import {
  Activity, Camera as CameraIcon, Users, Bell, BellOff, TrendingUp,
  AlertTriangle, CheckCircle, Clock, Pause
} from 'lucide-react'
import api from '../api/axios'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    loadDashboardStats()
    // Refresh stats every 30 seconds
    const interval = setInterval(loadDashboardStats, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadDashboardStats = async () => {
    try {
      const response = await api.get('/dashboard-stats')
      setStats(response.data)
    } catch (error) {
      console.error('Failed to load dashboard stats:', error)
      toast.error('Failed to load dashboard statistics')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading dashboard...</p>
      </div>
    )
  }

  if (!stats) {
    return (
      <div style={styles.errorContainer}>
        <AlertTriangle size={48} color="#ef4444" />
        <p>Failed to load dashboard statistics</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Dashboard</h1>

      {/* Account Info Section */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Account Info</h2>
        <div style={styles.statsGrid}>
          <StatCard
            title="Active Accounts"
            value={stats.vital_signs.active_accounts}
            icon={<Users size={32} />}
            color="#3b82f6"
            onClick={() => navigate('/accounts')}
          />
          <StatCard
            title="Camera Issues"
            value={0}
            icon={<AlertTriangle size={32} />}
            color="#ef4444"
            subtitle="offline or disconnected"
          />
          <StatCard
            title="Snoozed Cameras"
            value={stats.vital_signs.snoozed_cameras}
            icon={<BellOff size={32} />}
            color="#f59e0b"
          />
          <StatCard
            title="24h Activity"
            value={stats.vital_signs.activity_24h}
            icon={<Activity size={32} />}
            color="#8b5cf6"
            subtitle="events"
          />
        </div>
      </div>

      {/* Top 10 Active Accounts Section */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Top 10 Most Active Accounts (24h)</h2>
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Rank</th>
                <th style={styles.th}>Account</th>
                <th style={styles.th}>Events</th>
                <th style={styles.th}>Alarms</th>
                <th style={styles.th}>Dismissals</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {stats.top_active_accounts.length === 0 ? (
                <tr>
                  <td colSpan="6" style={styles.emptyRow}>
                    <CheckCircle size={24} color="#10b981" />
                    <span>No activity in the last 24 hours</span>
                  </td>
                </tr>
              ) : (
                stats.top_active_accounts.map((account, index) => (
                  <tr
                    key={account.account_id}
                    style={styles.tr}
                    onClick={() => navigate(`/accounts/${account.account_id}`)}
                  >
                    <td style={styles.td}>
                      <span style={{
                        ...styles.rankBadge,
                        background: index === 0 ? '#f59e0b' : index === 1 ? '#94a3b8' : index === 2 ? '#cd7f32' : '#334155'
                      }}>
                        #{index + 1}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.accountCell}>
                        <div style={styles.accountName}>{account.account_name}</div>
                        <div style={styles.accountNumber}>{account.account_number}</div>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span style={{...styles.badge, background: '#3b82f6'}}>{account.total_events}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={{...styles.badge, background: '#ef4444'}}>{account.alarm_count}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={{...styles.badge, background: '#64748b'}}>{account.dismissed_count}</span>
                    </td>
                    <td style={styles.td}>
                      <button
                        style={styles.viewBtn}
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/accounts/${account.account_id}`)
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inactive Accounts Section */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>
          Inactive Accounts (No Events in 7 Days)
          <span style={styles.countBadge}>{stats.inactive_accounts.length}</span>
        </h2>
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Account</th>
                <th style={styles.th}>Cameras</th>
                <th style={styles.th}>Last Event</th>
                <th style={styles.th}>Days Inactive</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {stats.inactive_accounts.length === 0 ? (
                <tr>
                  <td colSpan="5" style={styles.emptyRow}>
                    <Activity size={24} color="#10b981" />
                    <span>All accounts have recent activity!</span>
                  </td>
                </tr>
              ) : (
                stats.inactive_accounts.map((account) => (
                  <tr
                    key={account.account_id}
                    style={styles.tr}
                    onClick={() => navigate(`/accounts/${account.account_id}`)}
                  >
                    <td style={styles.td}>
                      <div style={styles.accountCell}>
                        <div style={styles.accountName}>{account.account_name}</div>
                        <div style={styles.accountNumber}>{account.account_number}</div>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span style={{...styles.badge, background: '#334155'}}>{account.camera_count}</span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.dateCell}>
                        <Clock size={14} />
                        <span>{account.last_event_date || 'Never'}</span>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.badge,
                        background: account.days_inactive > 30 ? '#ef4444' : account.days_inactive > 14 ? '#f59e0b' : '#64748b'
                      }}>
                        {account.days_inactive}d
                      </span>
                    </td>
                    <td style={styles.td}>
                      <button
                        style={styles.viewBtn}
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/accounts/${account.account_id}`)
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Auto-Snoozed Accounts Section */}
      {stats.auto_snoozed_accounts && stats.auto_snoozed_accounts.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>
            Auto-Snoozed Accounts (Activity Threshold Reached)
            <span style={{...styles.countBadge, background: '#f59e0b'}}>{stats.auto_snoozed_accounts.length}</span>
          </h2>
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Account</th>
                  <th style={styles.th}>Monthly Events</th>
                  <th style={styles.th}>Threshold</th>
                  <th style={styles.th}>Auto-Snoozed At</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {stats.auto_snoozed_accounts.map((account) => (
                  <tr
                    key={account.account_id}
                    style={styles.tr}
                    onClick={() => navigate(`/accounts/${account.account_id}`)}
                  >
                    <td style={styles.td}>
                      <div style={styles.accountCell}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                          <BellOff size={16} color="#f59e0b" />
                          <div style={styles.accountName}>{account.account_name}</div>
                        </div>
                        <div style={styles.accountNumber}>{account.account_number}</div>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span style={{...styles.badge, background: '#ef4444'}}>{account.monthly_event_count}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={{...styles.badge, background: '#f59e0b'}}>{account.activity_snooze_threshold}</span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.dateCell}>
                        <Clock size={14} />
                        <span>{new Date(account.activity_auto_snoozed_at).toLocaleString()}</span>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <button
                        style={{...styles.viewBtn, background: '#f59e0b'}}
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/accounts/${account.account_id}`)
                        }}
                      >
                        Unsnooze
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ title, value, icon, color, subtitle, onClick }) {
  return (
    <div
      style={{
        ...styles.statCard,
        borderColor: color,
        cursor: onClick ? 'pointer' : 'default'
      }}
      onClick={onClick}
    >
      <div style={{...styles.statIcon, color}}>{icon}</div>
      <div style={styles.statContent}>
        <div style={styles.statValue}>{value.toLocaleString()}</div>
        <div style={styles.statTitle}>{title}</div>
        {subtitle && <div style={styles.statSubtitle}>{subtitle}</div>}
      </div>
    </div>
  )
}

const styles = {
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '2rem'
  },
  title: {
    fontSize: '2rem',
    fontWeight: '700',
    color: '#e2e8f0',
    marginBottom: '2rem'
  },
  section: {
    marginBottom: '3rem'
  },
  sectionTitle: {
    fontSize: '1.5rem',
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem'
  },
  countBadge: {
    background: '#3b82f6',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: '700',
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1.5rem'
  },
  statCard: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '2px solid',
    padding: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    transition: 'all 0.2s',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
  },
  statIcon: {
    fontSize: '2rem'
  },
  statContent: {
    flex: 1
  },
  statValue: {
    fontSize: '2.5rem',
    fontWeight: '700',
    color: '#e2e8f0',
    lineHeight: '1'
  },
  statTitle: {
    fontSize: '0.875rem',
    color: '#94a3b8',
    marginTop: '0.5rem'
  },
  statSubtitle: {
    fontSize: '0.75rem',
    color: '#64748b',
    marginTop: '0.25rem'
  },
  tableContainer: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    overflow: 'hidden'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    textAlign: 'left',
    padding: '1rem',
    background: '#0f172a',
    color: '#94a3b8',
    fontSize: '0.875rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #334155'
  },
  tr: {
    borderBottom: '1px solid #334155',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  td: {
    padding: '1rem',
    color: '#e2e8f0',
    fontSize: '0.875rem'
  },
  accountCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  accountName: {
    fontWeight: '600',
    color: '#e2e8f0'
  },
  accountNumber: {
    fontSize: '0.75rem',
    color: '#64748b'
  },
  dateCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: '#94a3b8'
  },
  badge: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: '700',
    color: '#fff'
  },
  rankBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    fontSize: '0.875rem',
    fontWeight: '700',
    color: '#fff'
  },
  viewBtn: {
    padding: '0.5rem 1rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  emptyRow: {
    padding: '3rem',
    textAlign: 'center',
    color: '#94a3b8',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    fontSize: '1rem'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    gap: '1rem',
    color: '#94a3b8'
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    gap: '1rem',
    color: '#ef4444'
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #334155',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  }
}

// Add CSS animations
const styleSheet = document.createElement("style")
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  tr:hover {
    background: #334155 !important;
  }

  .stat-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
  }

  button:hover {
    background: #2563eb !important;
  }
`
if (!document.getElementById('dashboard-stats-styles')) {
  styleSheet.id = 'dashboard-stats-styles'
  document.head.appendChild(styleSheet)
}

import React, { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import { BarChart3, Users, CheckCircle, XCircle, Clock, AlertCircle, Pause, ArrowUpCircle, Camera, Video } from 'lucide-react'
import api from '../api/axios'
import { formatTimestampInTimezone } from '../utils/timezone'

export default function OverallStatus() {
  const [users, setUsers] = useState([])
  const [dashboardItems, setDashboardItems] = useState([])
  const [stats, setStats] = useState({
    totalUsers: 0,
    usersReceiving: 0,
    usersOnEvent: 0,
    totalPending: 0,
    totalEscalated: 0,
    totalOnHold: 0,
    totalActive: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadOverallStatus()
    // Refresh every 5 seconds
    const interval = setInterval(loadOverallStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadOverallStatus = async () => {
    try {
      const [usersResponse, dashboardResponse] = await Promise.all([
        api.get('/users/status'),
        api.get('/dashboard-items?show_all_holds=true')
      ])

      const usersData = usersResponse.data
      const dashboardData = dashboardResponse.data

      setUsers(usersData)
      setDashboardItems(dashboardData)

      // Calculate stats
      const totalUsers = usersData.length
      const usersReceiving = usersData.filter(u => u.is_receiving).length
      const usersOnEvent = usersData.filter(u => u.active_event).length

      const pending = dashboardData.filter(g => !g.claimed_by && !g.on_hold && !g.escalated)
      const escalated = dashboardData.filter(g => !g.claimed_by && !g.on_hold && g.escalated)
      const onHold = dashboardData.filter(g => g.on_hold === true)
      const active = dashboardData.filter(g => g.claimed_by)

      setStats({
        totalUsers,
        usersReceiving,
        usersOnEvent,
        totalPending: pending.length,
        totalEscalated: escalated.length,
        totalOnHold: onHold.length,
        totalActive: active.length
      })
    } catch (error) {
      toast.error('Failed to load overall status')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading overall status...</p>
      </div>
    )
  }

  const pendingGroups = dashboardItems.filter(g => !g.claimed_by && !g.on_hold && !g.escalated)
  const escalatedGroups = dashboardItems.filter(g => !g.claimed_by && !g.on_hold && g.escalated)
  const onHoldGroups = dashboardItems.filter(g => g.on_hold === true)
  const activeGroups = dashboardItems.filter(g => g.claimed_by)

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <BarChart3 size={32} color="#3b82f6" />
          <h1 style={styles.title}>Overall System Status</h1>
        </div>
        <p style={styles.subtitle}>Complete overview of system operations</p>
      </div>

      {/* Stats Cards */}
      <div style={styles.statsGrid}>
        <div style={{...styles.statCard, borderColor: '#3b82f6'}}>
          <div style={styles.statIcon}>
            <Users size={24} color="#3b82f6" />
          </div>
          <div style={styles.statContent}>
            <div style={styles.statLabel}>Total Users</div>
            <div style={styles.statValue}>{stats.totalUsers}</div>
          </div>
        </div>

        <div style={{...styles.statCard, borderColor: '#10b981'}}>
          <div style={styles.statIcon}>
            <CheckCircle size={24} color="#10b981" />
          </div>
          <div style={styles.statContent}>
            <div style={styles.statLabel}>Receiving</div>
            <div style={styles.statValue}>{stats.usersReceiving}</div>
          </div>
        </div>

        <div style={{...styles.statCard, borderColor: '#f59e0b'}}>
          <div style={styles.statIcon}>
            <AlertCircle size={24} color="#f59e0b" />
          </div>
          <div style={styles.statContent}>
            <div style={styles.statLabel}>On Events</div>
            <div style={styles.statValue}>{stats.usersOnEvent}</div>
          </div>
        </div>

        <div style={{...styles.statCard, borderColor: '#ef4444'}}>
          <div style={styles.statIcon}>
            <Clock size={24} color="#ef4444" />
          </div>
          <div style={styles.statContent}>
            <div style={styles.statLabel}>Pending</div>
            <div style={styles.statValue}>{stats.totalPending}</div>
          </div>
        </div>

        <div style={{...styles.statCard, borderColor: '#f59e0b'}}>
          <div style={styles.statIcon}>
            <ArrowUpCircle size={24} color="#f59e0b" />
          </div>
          <div style={styles.statContent}>
            <div style={styles.statLabel}>Escalated</div>
            <div style={styles.statValue}>{stats.totalEscalated}</div>
          </div>
        </div>

        <div style={{...styles.statCard, borderColor: '#f59e0b'}}>
          <div style={styles.statIcon}>
            <Pause size={24} color="#f59e0b" />
          </div>
          <div style={styles.statContent}>
            <div style={styles.statLabel}>On Hold</div>
            <div style={styles.statValue}>{stats.totalOnHold}</div>
          </div>
        </div>

        <div style={{...styles.statCard, borderColor: '#10b981'}}>
          <div style={styles.statIcon}>
            <AlertCircle size={24} color="#10b981" />
          </div>
          <div style={styles.statContent}>
            <div style={styles.statLabel}>Active</div>
            <div style={styles.statValue}>{stats.totalActive}</div>
          </div>
        </div>
      </div>

      {/* Users Section */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <Users size={24} color="#3b82f6" />
          <h2 style={styles.sectionTitle}>User Status</h2>
        </div>
        <div style={styles.userGrid}>
          {users.map(user => (
            <div key={user.id} style={styles.userCard}>
              <div style={styles.userHeader}>
                <div style={styles.userName}>{user.full_name || user.username}</div>
                <span style={{
                  ...styles.badge,
                  background: user.role === 'admin' ? '#3b82f6' : user.role === 'supervisor' ? '#8b5cf6' : '#64748b'
                }}>
                  {user.role}
                </span>
              </div>
              <div style={styles.userStatus}>
                {user.is_receiving ? (
                  <CheckCircle size={16} color="#10b981" />
                ) : (
                  <XCircle size={16} color="#64748b" />
                )}
                <span style={{
                  color: user.is_receiving ? '#10b981' : '#94a3b8'
                }}>
                  {user.is_receiving ? 'RECEIVING' : 'NOT RECEIVING'}
                </span>
              </div>
              {user.active_event && (
                <div style={styles.userEvent}>
                  <AlertCircle size={14} color="#f59e0b" />
                  <span>{user.active_event.account_number}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Escalated Events - Highest Priority */}
      {escalatedGroups.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <ArrowUpCircle size={24} color="#f59e0b" />
            <h2 style={{...styles.sectionTitle, color: '#f59e0b'}}>Escalated Events ({escalatedGroups.length})</h2>
          </div>
          <div style={styles.eventsGrid}>
            {escalatedGroups.map(group => (
              <EventCard key={group.account_id} group={group} type="escalated" />
            ))}
          </div>
        </div>
      )}

      {/* Pending Events */}
      {pendingGroups.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <Clock size={24} color="#ef4444" />
            <h2 style={styles.sectionTitle}>Pending Events ({pendingGroups.length})</h2>
          </div>
          <div style={styles.eventsGrid}>
            {pendingGroups.slice(0, 6).map(group => (
              <EventCard key={group.account_id} group={group} type="pending" />
            ))}
          </div>
          {pendingGroups.length > 6 && (
            <div style={styles.moreIndicator}>
              + {pendingGroups.length - 6} more pending events
            </div>
          )}
        </div>
      )}

      {/* On Hold Events */}
      {onHoldGroups.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <Pause size={24} color="#f59e0b" />
            <h2 style={styles.sectionTitle}>On Hold Events ({onHoldGroups.length})</h2>
          </div>
          <div style={styles.eventsGrid}>
            {onHoldGroups.slice(0, 6).map(group => (
              <EventCard key={group.account_id} group={group} type="hold" />
            ))}
          </div>
          {onHoldGroups.length > 6 && (
            <div style={styles.moreIndicator}>
              + {onHoldGroups.length - 6} more on hold events
            </div>
          )}
        </div>
      )}

      {/* Active Events */}
      {activeGroups.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <AlertCircle size={24} color="#10b981" />
            <h2 style={styles.sectionTitle}>Active Events ({activeGroups.length})</h2>
          </div>
          <div style={styles.eventsGrid}>
            {activeGroups.map(group => (
              <EventCard key={group.account_id} group={group} type="active" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EventCard({ group, type }) {
  const firstEvent = group.events[0]
  const mediaPaths = firstEvent?.media_paths || []
  const hasMedia = mediaPaths.length > 0

  const borderColors = {
    escalated: '#f59e0b',
    pending: '#ef4444',
    hold: '#f59e0b',
    active: '#10b981'
  }

  return (
    <div style={{...styles.eventCard, borderColor: borderColors[type]}}>
      <div style={styles.eventCardHeader}>
        <div style={styles.accountNumber}>{group.account_number}</div>
        {group.claimed_by && (
          <div style={styles.claimedBadge}>
            <Users size={12} />
            <span>{group.claimed_by.username}</span>
          </div>
        )}
      </div>
      <div style={styles.accountName}>{group.account_name}</div>
      <div style={styles.eventStats}>
        <div style={styles.eventStatItem}>
          <AlertCircle size={14} />
          <span>{group.event_count}</span>
        </div>
        <div style={styles.eventStatItem}>
          <Camera size={14} />
          <span>{group.camera_count}</span>
        </div>
        <div style={styles.eventStatItem}>
          <Video size={14} />
          <span>{group.total_media_count}</span>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    padding: '2rem'
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
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #334155',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  header: {
    marginBottom: '2rem'
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '0.5rem'
  },
  title: {
    fontSize: '2rem',
    fontWeight: '700',
    color: '#e2e8f0',
    margin: 0
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '1rem',
    margin: 0,
    marginLeft: '3rem'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginBottom: '2rem'
  },
  statCard: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '2px solid',
    padding: '1.5rem',
    display: 'flex',
    gap: '1rem',
    alignItems: 'center'
  },
  statIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  statContent: {
    flex: 1
  },
  statLabel: {
    fontSize: '0.875rem',
    color: '#94a3b8',
    marginBottom: '0.25rem'
  },
  statValue: {
    fontSize: '2rem',
    fontWeight: '700',
    color: '#e2e8f0'
  },
  section: {
    marginBottom: '2rem'
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1rem',
    padding: '0.75rem 1rem',
    background: '#1e293b',
    borderRadius: '0.5rem',
    border: '1px solid #334155'
  },
  sectionTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#e2e8f0',
    margin: 0
  },
  userGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '1rem'
  },
  userCard: {
    background: '#1e293b',
    borderRadius: '0.5rem',
    border: '1px solid #334155',
    padding: '1rem'
  },
  userHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem'
  },
  userName: {
    fontWeight: '600',
    color: '#e2e8f0',
    fontSize: '0.9rem'
  },
  badge: {
    display: 'inline-block',
    padding: '0.125rem 0.5rem',
    borderRadius: '9999px',
    fontSize: '0.7rem',
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize'
  },
  userStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.75rem',
    fontWeight: '500'
  },
  userEvent: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '0.5rem',
    padding: '0.375rem 0.5rem',
    background: '#0f172a',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    color: '#cbd5e1'
  },
  eventsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '1rem'
  },
  eventCard: {
    background: '#1e293b',
    borderRadius: '0.5rem',
    border: '2px solid',
    padding: '1rem'
  },
  eventCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem'
  },
  accountNumber: {
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#3b82f6'
  },
  claimedBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    background: '#10b981',
    color: '#fff',
    padding: '0.25rem 0.5rem',
    borderRadius: '9999px',
    fontSize: '0.7rem',
    fontWeight: '600'
  },
  accountName: {
    fontSize: '0.8rem',
    color: '#94a3b8',
    marginBottom: '0.75rem'
  },
  eventStats: {
    display: 'flex',
    gap: '0.5rem'
  },
  eventStatItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    background: '#334155',
    padding: '0.25rem 0.5rem',
    borderRadius: '9999px',
    fontSize: '0.7rem',
    color: '#cbd5e1'
  },
  moreIndicator: {
    marginTop: '1rem',
    padding: '0.75rem',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: '0.875rem'
  }
}

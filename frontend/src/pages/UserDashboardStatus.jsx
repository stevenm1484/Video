import React, { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import { Users, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'
import api from '../api/axios'

export default function UserDashboardStatus() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUserStatus()
    // Refresh every 5 seconds
    const interval = setInterval(loadUserStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadUserStatus = async () => {
    try {
      const response = await api.get('/users/status')
      setUsers(response.data)
    } catch (error) {
      toast.error('Failed to load user status')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading user status...</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <Users size={32} color="#3b82f6" />
          <h1 style={styles.title}>User Dashboard Status</h1>
        </div>
        <p style={styles.subtitle}>Real-time status of all operators</p>
      </div>

      <div style={styles.content}>
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>User</th>
                <th style={styles.th}>Role</th>
                <th style={styles.th}>Receiving Status</th>
                <th style={styles.th}>Active Event</th>
                <th style={styles.th}>Account</th>
                <th style={styles.th}>Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan="6" style={styles.emptyCell}>
                    No users found
                  </td>
                </tr>
              ) : (
                users.map(user => (
                  <tr key={user.id} style={styles.tr}>
                    <td style={styles.td}>
                      <div style={styles.userInfo}>
                        <div style={styles.userName}>{user.full_name || user.username}</div>
                        <div style={styles.userUsername}>@{user.username}</div>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.badge,
                        background: user.role === 'admin' ? '#3b82f6' : user.role === 'supervisor' ? '#8b5cf6' : '#64748b'
                      }}>
                        {user.role}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.statusColumn}>
                        <div style={styles.statusRow}>
                          {user.is_receiving ? (
                            <CheckCircle size={20} color="#10b981" />
                          ) : (
                            <XCircle size={20} color="#64748b" />
                          )}
                          <span style={{
                            ...styles.statusText,
                            color: user.is_receiving ? '#10b981' : '#94a3b8'
                          }}>
                            {user.is_receiving ? 'RECEIVING' : 'NOT RECEIVING'}
                          </span>
                        </div>
                        {!user.is_receiving && user.not_receiving_reason && (
                          <div style={styles.reasonText}>
                            ({user.not_receiving_reason})
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={styles.td}>
                      {user.active_event ? (
                        <div style={styles.statusRow}>
                          <AlertCircle size={18} color="#f59e0b" />
                          <span style={{...styles.statusText, color: '#f59e0b'}}>
                            Event #{user.active_event.event_id}
                          </span>
                        </div>
                      ) : (
                        <span style={{...styles.statusText, color: '#64748b'}}>None</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      {user.active_event ? (
                        <div style={styles.accountInfo}>
                          <div style={styles.accountNumber}>{user.active_event.account_number}</div>
                          <div style={styles.accountName}>{user.active_event.account_name}</div>
                        </div>
                      ) : (
                        <span style={{...styles.statusText, color: '#64748b'}}>-</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <div style={styles.statusRow}>
                        <Clock size={16} color="#94a3b8" />
                        <span style={{...styles.statusText, color: '#94a3b8'}}>
                          {user.last_activity || 'Never'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
  content: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    overflow: 'hidden'
  },
  tableContainer: {
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    padding: '1rem',
    textAlign: 'left',
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: '0.875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #334155',
    background: '#0f172a'
  },
  tr: {
    borderBottom: '1px solid #334155',
    transition: 'background 0.2s'
  },
  td: {
    padding: '1rem',
    color: '#e2e8f0',
    fontSize: '0.9rem'
  },
  emptyCell: {
    padding: '3rem',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '1rem'
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  userName: {
    fontWeight: '600',
    color: '#e2e8f0'
  },
  userUsername: {
    fontSize: '0.8rem',
    color: '#64748b'
  },
  badge: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize'
  },
  statusColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  statusText: {
    fontSize: '0.875rem',
    fontWeight: '500'
  },
  reasonText: {
    fontSize: '0.75rem',
    color: '#64748b',
    fontStyle: 'italic',
    marginLeft: '1.5rem'
  },
  accountInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  accountNumber: {
    fontWeight: '600',
    color: '#3b82f6'
  },
  accountName: {
    fontSize: '0.8rem',
    color: '#94a3b8'
  }
}

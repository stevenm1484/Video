import React, { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import { Activity, AlertTriangle, BellOff, RefreshCw, TrendingUp } from 'lucide-react'
import api from '../api/axios'

export default function ActivityThresholds({
  entityType = 'account', // 'account' or 'camera'
  entityId,
  accountStats = null, // Pass account stats when viewing camera
  onUpdate = () => {}
}) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [warningThreshold, setWarningThreshold] = useState('')
  const [snoozeThreshold, setSnoozeThreshold] = useState('')
  const [unsnoozeWarning, setUnsnoozeWarning] = useState('')
  const [unsnoozeSnooze, setUnsnoozeSnooze] = useState('')

  useEffect(() => {
    loadStats()
  }, [entityType, entityId])

  const loadStats = async () => {
    try {
      setLoading(true)
      const endpoint = entityType === 'account'
        ? `/accounts/${entityId}/activity-stats`
        : `/cameras/${entityId}/activity-stats`

      const response = await api.get(endpoint)
      setStats(response.data)

      // Set current thresholds
      setWarningThreshold(response.data.activity_threshold_warning || '')
      setSnoozeThreshold(response.data.activity_snooze_threshold || '')
    } catch (error) {
      console.error('Failed to load activity stats:', error)
      toast.error('Failed to load activity statistics')
    } finally {
      setLoading(false)
    }
  }

  const updateThresholds = async () => {
    try {
      const endpoint = entityType === 'account'
        ? `/accounts/${entityId}/activity-thresholds`
        : `/cameras/${entityId}/activity-thresholds`

      await api.put(endpoint, {
        warning_threshold: warningThreshold === '' ? null : parseInt(warningThreshold),
        snooze_threshold: snoozeThreshold === '' ? null : parseInt(snoozeThreshold)
      })

      toast.success('Activity thresholds updated successfully')
      setIsEditing(false)
      loadStats()
      onUpdate()
    } catch (error) {
      console.error('Failed to update thresholds:', error)
      toast.error('Failed to update thresholds')
    }
  }

  const unsnoozeEntity = async () => {
    try {
      const newWarning = parseInt(unsnoozeWarning)
      const newSnooze = parseInt(unsnoozeSnooze)

      if (!newWarning || !newSnooze) {
        toast.error('Please enter both thresholds')
        return
      }

      if (newWarning <= stats.monthly_event_count) {
        toast.error(`Warning threshold must be higher than current count (${stats.monthly_event_count})`)
        return
      }

      if (newSnooze <= stats.monthly_event_count) {
        toast.error(`Snooze threshold must be higher than current count (${stats.monthly_event_count})`)
        return
      }

      const endpoint = entityType === 'account'
        ? `/accounts/${entityId}/unsnooze-activity`
        : `/cameras/${entityId}/unsnooze-activity`

      await api.post(endpoint, {
        new_warning_threshold: newWarning,
        new_snooze_threshold: newSnooze
      })

      toast.success(`${entityType === 'account' ? 'Account' : 'Camera'} unsnoozed successfully with new thresholds`)
      loadStats()
      onUpdate()
      setUnsnoozeWarning('')
      setUnsnoozeSnooze('')
    } catch (error) {
      console.error('Failed to unsnooze:', error)
      toast.error(error.response?.data?.detail || 'Failed to unsnooze')
    }
  }

  const getProgressPercentage = () => {
    if (!stats) return 0
    const threshold = stats.activity_snooze_threshold || stats.activity_threshold_warning
    if (!threshold) return 0
    return Math.min((stats.monthly_event_count / threshold) * 100, 100)
  }

  const getProgressColor = () => {
    const percentage = getProgressPercentage()
    if (percentage >= 90) return '#ef4444' // red
    if (percentage >= 75) return '#f59e0b' // orange
    if (percentage >= 50) return '#eab308' // yellow
    return '#10b981' // green
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading activity statistics...</div>
      </div>
    )
  }

  if (!stats) return null

  // For cameras, show if using account defaults
  const usingAccountDefaults = entityType === 'camera' &&
    stats.activity_threshold_warning === null &&
    stats.activity_snooze_threshold === null

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <Activity size={24} style={{ color: '#3b82f6' }} />
          <h3 style={styles.title}>Activity Tracking & Billing</h3>
        </div>
        {stats.is_auto_snoozed && (
          <div style={styles.autoSnoozedBadge}>
            <BellOff size={16} />
            <span>Auto-Snoozed</span>
          </div>
        )}
      </div>

      {/* Current Period Stats */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Events This Month</div>
          <div style={styles.statValue}>{stats.monthly_event_count}</div>
          {stats.activity_billing_period_start && (
            <div style={styles.statSubtext}>
              Since {new Date(stats.activity_billing_period_start).toLocaleDateString()}
            </div>
          )}
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Warning Threshold</div>
          <div style={styles.statValue}>
            {stats.activity_threshold_warning || <span style={{ color: '#9ca3af' }}>Not Set</span>}
          </div>
          {entityType === 'camera' && accountStats && stats.activity_threshold_warning === null && (
            <div style={styles.statSubtext}>Using account default: {accountStats.activity_threshold_warning || 'None'}</div>
          )}
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Auto-Snooze Threshold</div>
          <div style={styles.statValue}>
            {stats.activity_snooze_threshold || <span style={{ color: '#9ca3af' }}>Not Set</span>}
          </div>
          {entityType === 'camera' && accountStats && stats.activity_snooze_threshold === null && (
            <div style={styles.statSubtext}>Using account default: {accountStats.activity_snooze_threshold || 'None'}</div>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {(stats.activity_snooze_threshold || stats.activity_threshold_warning) && (
        <div style={styles.progressSection}>
          <div style={styles.progressLabel}>
            <span>Progress to {stats.activity_snooze_threshold ? 'Auto-Snooze' : 'Warning'}</span>
            <span style={{ fontWeight: 600 }}>{Math.round(getProgressPercentage())}%</span>
          </div>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${getProgressPercentage()}%`,
                backgroundColor: getProgressColor()
              }}
            />
          </div>
        </div>
      )}

      {/* Warning Status */}
      {stats.activity_last_warning_sent_at && !stats.is_auto_snoozed && (
        <div style={styles.warningAlert}>
          <AlertTriangle size={18} />
          <div>
            <div style={{ fontWeight: 600 }}>Warning Sent</div>
            <div style={{ fontSize: '13px', marginTop: '4px' }}>
              Last warning sent: {new Date(stats.activity_last_warning_sent_at).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Auto-Snooze Status */}
      {stats.is_auto_snoozed && (
        <div style={styles.snoozeAlert}>
          <BellOff size={18} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>
              {entityType === 'account' ? 'Account' : 'Camera'} Auto-Snoozed
            </div>
            <div style={{ fontSize: '13px', marginTop: '4px' }}>
              Auto-snoozed on {new Date(stats.activity_auto_snoozed_at).toLocaleString()}
            </div>
            <div style={{ fontSize: '13px', marginTop: '8px', color: '#f59e0b' }}>
              ⚠️ You must set NEW thresholds higher than current count ({stats.monthly_event_count}) to unsnooze
            </div>
          </div>
        </div>
      )}

      {/* Unsnooze Section */}
      {stats.is_auto_snoozed && (
        <div style={styles.unsnoozeSection}>
          <h4 style={styles.subsectionTitle}>Unsnooze with New Thresholds</h4>
          <div style={styles.inputGrid}>
            <div>
              <label style={styles.label}>New Warning Threshold</label>
              <input
                type="number"
                value={unsnoozeWarning}
                onChange={(e) => setUnsnoozeWarning(e.target.value)}
                placeholder={`Must be > ${stats.monthly_event_count}`}
                style={styles.input}
                min={stats.monthly_event_count + 1}
              />
            </div>
            <div>
              <label style={styles.label}>New Snooze Threshold</label>
              <input
                type="number"
                value={unsnoozeSnooze}
                onChange={(e) => setUnsnoozeSnooze(e.target.value)}
                placeholder={`Must be > ${stats.monthly_event_count}`}
                style={styles.input}
                min={stats.monthly_event_count + 1}
              />
            </div>
          </div>
          <button onClick={unsnoozeEntity} style={styles.unsnoozeButton}>
            <RefreshCw size={16} />
            Unsnooze {entityType === 'account' ? 'Account' : 'Camera'}
          </button>
        </div>
      )}

      {/* Edit Thresholds Section */}
      {!stats.is_auto_snoozed && (
        <div style={styles.editSection}>
          <div style={styles.editHeader}>
            <h4 style={styles.subsectionTitle}>Threshold Settings</h4>
            {!isEditing && (
              <button onClick={() => setIsEditing(true)} style={styles.editButton}>
                <TrendingUp size={16} />
                Edit Thresholds
              </button>
            )}
          </div>

          {isEditing && (
            <div style={styles.editForm}>
              {entityType === 'camera' && (
                <div style={styles.infoBox}>
                  💡 Leave fields empty to use account defaults. Set values to override for this camera only.
                </div>
              )}

              <div style={styles.inputGrid}>
                <div>
                  <label style={styles.label}>
                    Warning Threshold
                    {entityType === 'camera' && <span style={{ fontSize: '12px', color: '#6b7280' }}> (optional)</span>}
                  </label>
                  <input
                    type="number"
                    value={warningThreshold}
                    onChange={(e) => setWarningThreshold(e.target.value)}
                    placeholder={entityType === 'camera' ? 'Use account default' : 'e.g., 100'}
                    style={styles.input}
                  />
                  <div style={styles.inputHelp}>Send email alert when this count is reached</div>
                </div>

                <div>
                  <label style={styles.label}>
                    Auto-Snooze Threshold
                    {entityType === 'camera' && <span style={{ fontSize: '12px', color: '#6b7280' }}> (optional)</span>}
                  </label>
                  <input
                    type="number"
                    value={snoozeThreshold}
                    onChange={(e) => setSnoozeThreshold(e.target.value)}
                    placeholder={entityType === 'camera' ? 'Use account default' : 'e.g., 200'}
                    style={styles.input}
                  />
                  <div style={styles.inputHelp}>Automatically snooze when this count is reached</div>
                </div>
              </div>

              <div style={styles.buttonRow}>
                <button onClick={updateThresholds} style={styles.saveButton}>
                  Save Thresholds
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false)
                    setWarningThreshold(stats.activity_threshold_warning || '')
                    setSnoozeThreshold(stats.activity_snooze_threshold || '')
                  }}
                  style={styles.cancelButton}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!isEditing && usingAccountDefaults && (
            <div style={styles.infoBox}>
              ℹ️ This camera is using account-level thresholds. Click "Edit Thresholds" to set camera-specific values.
            </div>
          )}
        </div>
      )}

      {/* Account Stats (when viewing camera) */}
      {entityType === 'camera' && accountStats && (
        <div style={styles.accountStatsBox}>
          <h4 style={styles.subsectionTitle}>Account Total</h4>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>
            <div><strong>Account Events:</strong> {accountStats.monthly_event_count}</div>
            <div><strong>Account Warning:</strong> {accountStats.activity_threshold_warning || 'Not set'}</div>
            <div><strong>Account Snooze:</strong> {accountStats.activity_snooze_threshold || 'Not set'}</div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    marginBottom: '24px',
    border: '1px solid #334155'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px'
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  title: {
    fontSize: '20px',
    fontWeight: 600,
    margin: 0,
    color: '#e2e8f0'
  },
  autoSnoozedBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: '#78350f',
    color: '#fef3c7',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 600
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#94a3b8'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px'
  },
  statCard: {
    padding: '16px',
    backgroundColor: '#0f172a',
    borderRadius: '8px',
    border: '1px solid #334155'
  },
  statLabel: {
    fontSize: '13px',
    color: '#94a3b8',
    marginBottom: '8px',
    fontWeight: 500
  },
  statValue: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#e2e8f0'
  },
  statSubtext: {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '4px'
  },
  progressSection: {
    marginBottom: '24px'
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    color: '#cbd5e1',
    marginBottom: '8px'
  },
  progressBar: {
    width: '100%',
    height: '12px',
    backgroundColor: '#334155',
    borderRadius: '6px',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.3s ease, background-color 0.3s ease',
    borderRadius: '6px'
  },
  warningAlert: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '16px',
    backgroundColor: '#78350f',
    border: '1px solid #f59e0b',
    borderRadius: '8px',
    marginBottom: '16px',
    color: '#fbbf24'
  },
  snoozeAlert: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '16px',
    backgroundColor: '#7f1d1d',
    border: '1px solid #ef4444',
    borderRadius: '8px',
    marginBottom: '16px',
    color: '#fca5a5'
  },
  infoBox: {
    padding: '12px 16px',
    backgroundColor: '#1e3a5f',
    border: '1px solid #3b82f6',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#93c5fd',
    marginBottom: '16px'
  },
  editSection: {
    borderTop: '1px solid #334155',
    paddingTop: '24px',
    marginTop: '24px'
  },
  editHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  subsectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    margin: 0,
    color: '#e2e8f0'
  },
  editButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer'
  },
  editForm: {
    marginTop: '16px'
  },
  inputGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
    marginBottom: '16px'
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: '#cbd5e1',
    marginBottom: '8px'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #334155',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box',
    backgroundColor: '#0f172a',
    color: '#e2e8f0'
  },
  inputHelp: {
    fontSize: '12px',
    color: '#94a3b8',
    marginTop: '4px'
  },
  buttonRow: {
    display: 'flex',
    gap: '12px'
  },
  saveButton: {
    padding: '10px 20px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer'
  },
  cancelButton: {
    padding: '10px 20px',
    backgroundColor: '#334155',
    color: '#e2e8f0',
    border: '1px solid #475569',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer'
  },
  unsnoozeSection: {
    borderTop: '1px solid #334155',
    paddingTop: '24px',
    marginTop: '24px'
  },
  unsnoozeButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '16px'
  },
  accountStatsBox: {
    marginTop: '24px',
    padding: '16px',
    backgroundColor: '#0f172a',
    borderRadius: '8px',
    border: '1px solid #334155',
    color: '#cbd5e1'
  }
}

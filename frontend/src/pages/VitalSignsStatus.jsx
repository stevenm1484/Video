import React, { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import { Activity, CheckCircle, XCircle, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, Image as ImageIcon, X } from 'lucide-react'
import api from '../api/axios'

export default function VitalSignsStatus() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedAccounts, setExpandedAccounts] = useState({})
  const [checkingCameras, setCheckingCameras] = useState({})
  const [filter, setFilter] = useState('all') // all, issues, healthy
  const [imageModalData, setImageModalData] = useState(null) // For showing before/after images

  useEffect(() => {
    loadVitalSigns()
    // Refresh every 30 seconds
    const interval = setInterval(loadVitalSigns, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadVitalSigns = async () => {
    try {
      const response = await api.get('/vital-signs/status')
      setAccounts(response.data)
    } catch (error) {
      toast.error('Failed to load vital signs status')
    } finally {
      setLoading(false)
    }
  }

  const toggleAccount = (accountId) => {
    setExpandedAccounts(prev => ({
      ...prev,
      [accountId]: !prev[accountId]
    }))
  }

  const triggerCameraCheck = async (cameraId) => {
    setCheckingCameras(prev => ({ ...prev, [cameraId]: true }))
    try {
      await api.post(`/vital-signs/cameras/${cameraId}/check?check_type=both`)
      toast.success('Check triggered successfully')
      // Reload after a short delay to get updated results
      setTimeout(loadVitalSigns, 2000)
    } catch (error) {
      toast.error('Failed to trigger check')
    } finally {
      setCheckingCameras(prev => ({ ...prev, [cameraId]: false }))
    }
  }

  const hasIssues = (account) => {
    return account.connectivity_issues_count > 0 || account.image_change_issues_count > 0
  }

  const filteredAccounts = accounts.filter(account => {
    if (filter === 'issues') return hasIssues(account)
    if (filter === 'healthy') return !hasIssues(account)
    return true
  })

  const totalIssues = accounts.reduce((sum, acc) =>
    sum + acc.connectivity_issues_count + acc.image_change_issues_count, 0
  )

  const totalCameras = accounts.reduce((sum, acc) => sum + acc.total_cameras, 0)

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading vital signs status...</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Camera Vital Signs</h1>
          <p style={styles.subtitle}>
            Real-time health monitoring grouped by account
          </p>
        </div>
        <button
          style={styles.refreshBtn}
          onClick={loadVitalSigns}
        >
          <RefreshCw size={20} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryCards}>
        <div style={styles.summaryCard}>
          <Activity size={24} style={{ color: '#60a5fa' }} />
          <div>
            <div style={styles.summaryValue}>{accounts.length}</div>
            <div style={styles.summaryLabel}>Accounts Monitored</div>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <Activity size={24} style={{ color: '#60a5fa' }} />
          <div>
            <div style={styles.summaryValue}>{totalCameras}</div>
            <div style={styles.summaryLabel}>Total Cameras</div>
          </div>
        </div>
        <div style={{ ...styles.summaryCard, borderColor: totalIssues > 0 ? '#ef4444' : '#334155' }}>
          <AlertTriangle size={24} style={{ color: totalIssues > 0 ? '#ef4444' : '#64748b' }} />
          <div>
            <div style={styles.summaryValue}>{totalIssues}</div>
            <div style={styles.summaryLabel}>Total Issues</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={styles.filters}>
        <button
          style={filter === 'all' ? styles.filterActive : styles.filterBtn}
          onClick={() => setFilter('all')}
        >
          All ({accounts.length})
        </button>
        <button
          style={filter === 'issues' ? styles.filterActive : styles.filterBtn}
          onClick={() => setFilter('issues')}
        >
          Issues ({accounts.filter(hasIssues).length})
        </button>
        <button
          style={filter === 'healthy' ? styles.filterActive : styles.filterBtn}
          onClick={() => setFilter('healthy')}
        >
          Healthy ({accounts.filter(a => !hasIssues(a)).length})
        </button>
      </div>

      {/* Accounts List */}
      <div style={styles.accountsList}>
        {filteredAccounts.length === 0 ? (
          <div style={styles.emptyState}>
            <Activity size={48} style={{ color: '#475569' }} />
            <h3>No accounts found</h3>
            <p>Try adjusting your filters</p>
          </div>
        ) : (
          filteredAccounts.map(account => (
            <AccountRow
              key={account.account_id}
              account={account}
              expanded={expandedAccounts[account.account_id] || false}
              onToggle={() => toggleAccount(account.account_id)}
              checkingCameras={checkingCameras}
              onTriggerCheck={triggerCameraCheck}
              onShowImages={setImageModalData}
            />
          ))
        )}
      </div>

      {/* Image Comparison Modal */}
      {imageModalData && (
        <ImageComparisonModal
          data={imageModalData}
          onClose={() => setImageModalData(null)}
        />
      )}
    </div>
  )
}

function AccountRow({ account, expanded, onToggle, checkingCameras, onTriggerCheck, onShowImages }) {
  const hasIssues = account.connectivity_issues_count > 0 || account.image_change_issues_count > 0
  const totalIssues = account.connectivity_issues_count + account.image_change_issues_count

  return (
    <div style={styles.accountCard}>
      {/* Account Header - Clickable to expand/collapse */}
      <div style={styles.accountHeader} onClick={onToggle}>
        <div style={styles.accountHeaderLeft}>
          <button style={styles.expandBtn}>
            {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </button>
          <div>
            <h3 style={styles.accountName}>{account.account_name}</h3>
            <p style={styles.accountSubtext}>{account.total_cameras} camera{account.total_cameras !== 1 ? 's' : ''} monitored</p>
          </div>
        </div>

        <div style={styles.accountHeaderRight}>
          {/* Connectivity Status */}
          {account.connectivity_enabled_count > 0 && (
            <div style={styles.statusBadge}>
              <div style={styles.statusBadgeHeader}>
                <span style={styles.statusBadgeLabel}>Connectivity</span>
                {account.connectivity_issues_count === 0 ? (
                  <CheckCircle size={16} style={{ color: '#22c55e' }} />
                ) : (
                  <XCircle size={16} style={{ color: '#ef4444' }} />
                )}
              </div>
              <div style={styles.statusBadgeValue}>
                {account.connectivity_issues_count === 0 ? (
                  <span style={{ color: '#22c55e' }}>
                    {account.connectivity_enabled_count} Online
                  </span>
                ) : (
                  <span style={{ color: '#ef4444' }}>
                    {account.connectivity_issues_count} Issue{account.connectivity_issues_count !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Image Change Status */}
          {account.image_change_enabled_count > 0 && (
            <div style={styles.statusBadge}>
              <div style={styles.statusBadgeHeader}>
                <span style={styles.statusBadgeLabel}>Image Change</span>
                {account.image_change_issues_count === 0 ? (
                  <CheckCircle size={16} style={{ color: '#22c55e' }} />
                ) : (
                  <AlertTriangle size={16} style={{ color: '#ef4444' }} />
                )}
              </div>
              <div style={styles.statusBadgeValue}>
                {account.image_change_issues_count === 0 ? (
                  <span style={{ color: '#22c55e' }}>
                    {account.image_change_enabled_count} Normal
                  </span>
                ) : (
                  <span style={{ color: '#ef4444' }}>
                    {account.image_change_issues_count} Changed
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Overall Status */}
          <div style={{ ...styles.overallStatus, ...(hasIssues ? styles.overallStatusIssue : styles.overallStatusHealthy) }}>
            {hasIssues ? (
              <>
                <AlertTriangle size={18} />
                <span>{totalIssues} Issue{totalIssues !== 1 ? 's' : ''}</span>
              </>
            ) : (
              <>
                <CheckCircle size={18} />
                <span>All Good</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Camera List */}
      {expanded && (
        <div style={styles.camerasList}>
          {account.cameras.map(camera => (
            <CameraRow
              key={camera.camera_id}
              camera={camera}
              timezone={account.timezone}
              isChecking={checkingCameras[camera.camera_id] || false}
              onTriggerCheck={() => onTriggerCheck(camera.camera_id)}
              onShowImages={onShowImages}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CameraRow({ camera, timezone, isChecking, onTriggerCheck, onShowImages }) {
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Never'

    // Ensure the timestamp string ends with 'Z' to indicate UTC
    let isoString = timestamp
    if (!isoString.endsWith('Z') && !isoString.includes('+') && !isoString.includes('-', 10)) {
      isoString = timestamp + 'Z'
    }

    const date = new Date(isoString)

    // Use Intl.DateTimeFormat for reliable timezone conversion
    const formatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone || 'UTC',
      timeZoneName: 'short'
    })

    return formatter.format(date)
  }

  const getNextCheckTime = (lastCheck, intervalMinutes) => {
    if (!lastCheck) return 'Pending'

    // Ensure the timestamp string ends with 'Z' to indicate UTC
    let isoString = lastCheck
    if (!isoString.endsWith('Z') && !isoString.includes('+') && !isoString.includes('-', 10)) {
      isoString = lastCheck + 'Z'
    }

    const lastCheckDate = new Date(isoString)
    const nextCheck = new Date(lastCheckDate.getTime() + intervalMinutes * 60000)

    // Use Intl.DateTimeFormat for reliable timezone conversion
    const formatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone || 'UTC',
      timeZoneName: 'short'
    })

    return formatter.format(nextCheck)
  }

  const getConnectivityIcon = (status) => {
    switch (status) {
      case 'online':
        return <CheckCircle size={18} style={{ color: '#22c55e' }} />
      case 'offline':
        return <XCircle size={18} style={{ color: '#ef4444' }} />
      case 'error':
        return <AlertTriangle size={18} style={{ color: '#f59e0b' }} />
      default:
        return <div style={{ width: '18px', height: '18px', backgroundColor: '#475569', borderRadius: '50%' }} />
    }
  }

  const getImageChangeIcon = (status) => {
    switch (status) {
      case 'normal':
        return <CheckCircle size={18} style={{ color: '#22c55e' }} />
      case 'changed':
        return <AlertTriangle size={18} style={{ color: '#ef4444' }} />
      default:
        return <div style={{ width: '18px', height: '18px', backgroundColor: '#475569', borderRadius: '50%' }} />
    }
  }

  return (
    <div style={styles.cameraRow}>
      <div style={styles.cameraName}>{camera.camera_name}</div>

      <div style={styles.cameraRowRight}>
        <div style={styles.cameraStatuses}>
        {/* Connectivity */}
        {camera.settings?.connectivity_enabled && (
          <div style={styles.cameraStatus}>
            {getConnectivityIcon(camera.status?.connectivity_status)}
            <div>
              <div style={styles.cameraStatusLabel}>Connectivity</div>
              <div style={styles.cameraStatusValue}>
                {camera.status?.connectivity_status || 'unknown'}
              </div>
              <div style={styles.cameraStatusDetail}>
                Last: {formatTimestamp(camera.status?.connectivity_last_check)}
              </div>
              <div style={styles.cameraStatusDetail}>
                Next: {getNextCheckTime(camera.status?.connectivity_last_check, 60)}
              </div>
            </div>
          </div>
        )}

        {/* Image Change */}
        {camera.settings?.image_change_enabled && (
          <div style={styles.cameraStatus}>
            {getImageChangeIcon(camera.status?.image_change_status)}
            <div>
              <div style={styles.cameraStatusLabel}>Image Change</div>
              <div style={styles.cameraStatusValue}>
                {camera.status?.image_change_status || 'unknown'}
                {camera.status?.image_change_percentage !== null && camera.status?.image_change_percentage !== undefined && (
                  <span> ({camera.status.image_change_percentage}%)</span>
                )}
              </div>
              <div style={styles.cameraStatusDetail}>
                Last: {formatTimestamp(camera.status?.image_change_last_check)}
              </div>
              <div style={styles.cameraStatusDetail}>
                Next: {getNextCheckTime(camera.status?.image_change_last_check, 720)}
              </div>
            </div>
          </div>
        )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {/* View Images button - only show if image change detected and images available */}
          {camera.status?.image_change_status === 'changed' &&
           camera.status?.previous_image_path &&
           camera.status?.current_image_path && (
            <button
              style={styles.viewImagesBtn}
              onClick={(e) => {
                e.stopPropagation()
                onShowImages({
                  cameraName: camera.camera_name,
                  previousImage: camera.status.previous_image_path,
                  currentImage: camera.status.current_image_path,
                  changePercentage: camera.status.image_change_percentage
                })
              }}
            >
              <ImageIcon size={16} />
              <span>View Images</span>
            </button>
          )}

          <button
            style={styles.checkNowBtn}
            onClick={(e) => {
              e.stopPropagation()
              onTriggerCheck()
            }}
            disabled={isChecking}
          >
            <RefreshCw size={16} style={{ animation: isChecking ? 'spin 1s linear infinite' : 'none' }} />
            <span>{isChecking ? 'Checking...' : 'Check Now'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function ImageComparisonModal({ data, onClose }) {
  const { cameraName, previousImage, currentImage, changePercentage } = data
  const baseUrl = window.location.origin.replace(':3000', ':8000') // API URL

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div>
            <h2 style={styles.modalTitle}>Image Change Detected - {cameraName}</h2>
            <p style={styles.modalSubtitle}>Change detected: {changePercentage}%</p>
          </div>
          <button style={styles.modalCloseBtn} onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div style={styles.imageComparisonContainer}>
          <div style={styles.imageBox}>
            <h3 style={styles.imageBoxTitle}>Previous Image</h3>
            <img
              src={`${baseUrl}/${previousImage}`}
              alt="Previous camera view"
              style={styles.comparisonImage}
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'block'
              }}
            />
            <div style={{ ...styles.imageError, display: 'none' }}>
              Failed to load image
            </div>
          </div>

          <div style={styles.imageBox}>
            <h3 style={styles.imageBoxTitle}>Current Image</h3>
            <img
              src={`${baseUrl}/${currentImage}`}
              alt="Current camera view"
              style={styles.comparisonImage}
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'block'
              }}
            />
            <div style={{ ...styles.imageError, display: 'none' }}>
              Failed to load image
            </div>
          </div>
        </div>

        <div style={styles.modalFooter}>
          <button style={styles.modalCloseFooterBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    color: '#94a3b8',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #1e293b',
    borderTop: '4px solid #60a5fa',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '1rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start',
    marginBottom: '2rem',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    color: '#f1f5f9',
    marginBottom: '0.5rem',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '0.95rem',
  },
  refreshBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.5rem',
    backgroundColor: '#334155',
    color: '#f1f5f9',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.95rem',
    transition: 'all 0.2s',
  },
  summaryCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginBottom: '2rem',
  },
  summaryCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '1.5rem',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '0.75rem',
  },
  summaryValue: {
    fontSize: '2rem',
    fontWeight: 'bold',
    color: '#f1f5f9',
  },
  summaryLabel: {
    color: '#94a3b8',
    fontSize: '0.875rem',
  },
  filters: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1.5rem',
  },
  filterBtn: {
    padding: '0.5rem 1rem',
    backgroundColor: '#1e293b',
    color: '#94a3b8',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    transition: 'all 0.2s',
  },
  filterActive: {
    padding: '0.5rem 1rem',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: '1px solid #3b82f6',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  accountsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  accountCard: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '0.75rem',
    overflow: 'hidden',
  },
  accountHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.5rem',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  accountHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  expandBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    padding: 0,
  },
  accountName: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    color: '#f1f5f9',
    marginBottom: '0.25rem',
  },
  accountSubtext: {
    fontSize: '0.875rem',
    color: '#94a3b8',
  },
  accountHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  statusBadge: {
    padding: '0.75rem 1rem',
    backgroundColor: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155',
  },
  statusBadgeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.25rem',
  },
  statusBadgeLabel: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  statusBadgeValue: {
    fontSize: '0.875rem',
    fontWeight: '600',
  },
  overallStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.25rem',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
  },
  overallStatusHealthy: {
    backgroundColor: '#14532d',
    color: '#22c55e',
    border: '1px solid #16a34a',
  },
  overallStatusIssue: {
    backgroundColor: '#7f1d1d',
    color: '#ef4444',
    border: '1px solid #dc2626',
  },
  camerasList: {
    borderTop: '1px solid #334155',
    backgroundColor: '#0f172a',
  },
  cameraRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 1.5rem',
    borderBottom: '1px solid #1e293b',
  },
  cameraName: {
    fontSize: '0.95rem',
    fontWeight: '500',
    color: '#e2e8f0',
  },
  cameraRowRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '2rem',
  },
  cameraStatuses: {
    display: 'flex',
    gap: '2rem',
  },
  checkNowBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    backgroundColor: '#334155',
    color: '#f1f5f9',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  cameraStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  cameraStatusLabel: {
    fontSize: '0.75rem',
    color: '#94a3b8',
  },
  cameraStatusValue: {
    fontSize: '0.875rem',
    color: '#f1f5f9',
    textTransform: 'capitalize',
    marginBottom: '0.25rem',
  },
  cameraStatusDetail: {
    fontSize: '0.75rem',
    color: '#64748b',
  },
  cameraStatusTime: {
    color: '#64748b',
  },
  emptyState: {
    textAlign: 'center',
    padding: '4rem 2rem',
    color: '#64748b',
  },
  viewImagesBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    backgroundColor: '#f59e0b',
    color: '#ffffff',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '2rem',
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderRadius: '1rem',
    maxWidth: '1200px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    border: '1px solid #334155',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start',
    padding: '1.5rem',
    borderBottom: '1px solid #334155',
  },
  modalTitle: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#f1f5f9',
    marginBottom: '0.5rem',
  },
  modalSubtitle: {
    fontSize: '0.95rem',
    color: '#f59e0b',
    fontWeight: '600',
  },
  modalCloseBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '0.5rem',
    borderRadius: '0.375rem',
    transition: 'all 0.2s',
  },
  imageComparisonContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
    gap: '2rem',
    padding: '2rem',
  },
  imageBox: {
    backgroundColor: '#0f172a',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    border: '1px solid #334155',
  },
  imageBoxTitle: {
    fontSize: '1.1rem',
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: '1rem',
    textAlign: 'center',
  },
  comparisonImage: {
    width: '100%',
    height: 'auto',
    borderRadius: '0.5rem',
    border: '2px solid #334155',
  },
  imageError: {
    padding: '2rem',
    textAlign: 'center',
    color: '#ef4444',
    fontSize: '0.95rem',
  },
  modalFooter: {
    padding: '1.5rem',
    borderTop: '1px solid #334155',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  modalCloseFooterBtn: {
    padding: '0.75rem 2rem',
    backgroundColor: '#334155',
    color: '#f1f5f9',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.95rem',
    transition: 'all 0.2s',
  },
}

// Add keyframes for spinner animation
const styleSheet = document.styleSheets[0]
const keyframes = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`
if (styleSheet) {
  try {
    styleSheet.insertRule(keyframes, styleSheet.cssRules.length)
  } catch (e) {
    // Rule might already exist
  }
}

export { styles }

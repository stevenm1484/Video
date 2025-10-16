import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { Calendar, Search, Filter, Eye, Clock, Image as ImageIcon, Video as VideoIcon, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../api/axios'
import { formatTimestampInTimezone } from '../utils/timezone'

export default function History() {
  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  }

  const [alarms, setAlarms] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedAccount, setSelectedAccount] = useState('')
  const [startDate, setStartDate] = useState(getTodayDate())
  const [endDate, setEndDate] = useState(getTodayDate())
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [showMediaModal, setShowMediaModal] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState(null)
  const pageSize = 25
  const navigate = useNavigate()

  useEffect(() => {
    loadAccounts()
  }, [])

  useEffect(() => {
    loadHistory()
  }, [currentPage])

  const loadAccounts = async () => {
    try {
      const response = await api.get('/accounts')
      setAccounts(response.data)
    } catch (error) {
      toast.error('Failed to load accounts')
    }
  }

  const loadHistory = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedAccount) params.append('account_id', selectedAccount)
      if (startDate) params.append('start_date', startDate)
      if (endDate) params.append('end_date', endDate)
      params.append('page', currentPage)
      params.append('page_size', pageSize)

      const response = await api.get(`/history?${params.toString()}`)
      setAlarms(response.data.items)
      setTotalPages(response.data.total_pages)
      setTotalCount(response.data.total_count)
    } catch (error) {
      toast.error('Failed to load history')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    setCurrentPage(1)  // Reset to first page when searching
    loadHistory()
  }

  const handleReset = () => {
    setSelectedAccount('')
    setStartDate(getTodayDate())
    setEndDate(getTodayDate())
    setSearchTerm('')
    setCurrentPage(1)
  }

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage)
    }
  }

  const filteredAlarms = alarms.filter(alarm => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      alarm.account_name?.toLowerCase().includes(search) ||
      alarm.account_number?.toLowerCase().includes(search) ||
      alarm.camera_name?.toLowerCase().includes(search) ||
      alarm.location?.toLowerCase().includes(search)
    )
  })

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading history...</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Alarm History</h1>
      </div>

      <div style={styles.filterContainer}>
        <div style={styles.filterRow}>
          <div style={styles.filterGroup}>
            <label style={styles.label}>
              <Calendar size={16} />
              <span>Start Date</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.label}>
              <Calendar size={16} />
              <span>End Date</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.label}>
              <Filter size={16} />
              <span>Account</span>
            </label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              style={styles.select}
            >
              <option value="">All Accounts</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.account_number} - {account.name}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.label}>
              <Search size={16} />
              <span>Search</span>
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by account, camera, location..."
              style={styles.input}
            />
          </div>

          <div style={styles.buttonGroup}>
            <label style={styles.label}>&nbsp;</label>
            <div style={styles.buttonRow}>
              <button onClick={handleSearch} style={styles.searchBtn}>
                <Search size={18} />
                <span>Apply Filters</span>
              </button>
              <button onClick={handleReset} style={styles.resetBtn}>
                <span>Reset Filters</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {filteredAlarms.length === 0 ? (
        <div style={styles.emptyState}>
          <Clock size={64} color="#64748b" />
          <h2 style={styles.emptyTitle}>No History Found</h2>
          <p style={styles.emptyText}>
            {selectedAccount || startDate || endDate || searchTerm
              ? 'No alarms match your current filters.'
              : 'No historical alarms to display.'}
          </p>
        </div>
      ) : (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>Date/Time</th>
                <th style={styles.th}>Account Number</th>
                <th style={styles.th}>Account Name</th>
                <th style={styles.th}>Camera</th>
                <th style={styles.th}>Operator</th>
                <th style={styles.th}>Video Type</th>
                <th style={styles.th}>Resolution</th>
                <th style={styles.th}>Calls</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlarms.map(alarm => (
                <HistoryRow
                  key={alarm.id}
                  alarm={alarm}
                  navigate={navigate}
                  onViewMedia={(path, type) => {
                    setSelectedMedia({ path, type })
                    setShowMediaModal(true)
                  }}
                />
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div style={styles.pagination}>
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                style={{
                  ...styles.paginationBtn,
                  ...(currentPage === 1 ? styles.paginationBtnDisabled : {})
                }}
              >
                <ChevronLeft size={18} />
                <span>Previous</span>
              </button>

              <div style={styles.paginationInfo}>
                <span style={styles.paginationText}>
                  Page {currentPage} of {totalPages}
                </span>
              </div>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                style={{
                  ...styles.paginationBtn,
                  ...(currentPage === totalPages ? styles.paginationBtnDisabled : {})
                }}
              >
                <span>Next</span>
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Media Modal */}
      {showMediaModal && selectedMedia && (
        <div style={styles.modalOverlay} onClick={() => setShowMediaModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Media Viewer</h3>
              <button onClick={() => setShowMediaModal(false)} style={styles.closeButton}>×</button>
            </div>
            <div style={styles.modalBody}>
              {selectedMedia.path.endsWith('.wav') || selectedMedia.path.endsWith('.mp3') || selectedMedia.path.endsWith('.ogg') ? (
                <audio
                  src={`/${selectedMedia.path}`}
                  controls
                  autoPlay
                  style={{...styles.mediaViewer, width: '500px'}}
                />
              ) : selectedMedia.type === 'video' || selectedMedia.type === 'call' || selectedMedia.path.endsWith('.mp4') || selectedMedia.path.endsWith('.avi') || selectedMedia.path.endsWith('.mov') ? (
                <video
                  src={`/${selectedMedia.path}`}
                  controls
                  autoPlay
                  style={styles.mediaViewer}
                />
              ) : (
                <img
                  src={`/${selectedMedia.path}`}
                  alt="Event media"
                  style={styles.mediaViewer}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HistoryRow({ alarm, navigate, onViewMedia }) {
  const callCount = alarm.call_logs ? alarm.call_logs.length : 0
  const contactedCalls = alarm.call_logs ? alarm.call_logs.filter(log => log.resolution === 'Contacted').length : 0

  return (
    <tr style={styles.tableRow}>
      <td style={styles.td}>
        <div style={styles.dateCell}>
          <Clock size={14} color="#94a3b8" />
          <span>{formatTimestampInTimezone(alarm.timestamp, alarm.account_timezone, { showTimezone: true })}</span>
        </div>
      </td>
      <td style={styles.td}>
        <div style={styles.accountNumber}>{alarm.account_number}</div>
      </td>
      <td style={styles.td}>
        <div style={styles.accountName}>{alarm.account_name}</div>
      </td>
      <td style={styles.td}>{alarm.camera_name}</td>
      <td style={styles.td}>{alarm.operator_name || 'N/A'}</td>
      <td style={styles.td}>
        {alarm.media_type ? (
          <span style={styles.videoTypeBadge}>
            {alarm.media_type === 'video' ? 'Video' : 'Image'}
          </span>
        ) : (
          <span style={{color: '#64748b', fontSize: '0.75rem'}}>N/A</span>
        )}
      </td>
      <td style={styles.td}>
        {alarm.resolution ? (
          <span style={styles.resolutionBadge}>
            {alarm.resolution}
          </span>
        ) : (
          <span style={{color: '#64748b', fontSize: '0.75rem'}}>N/A</span>
        )}
      </td>
      <td style={styles.td}>
        {callCount > 0 ? (
          <div style={styles.callsCell}>
            <span style={styles.callCount}>{callCount} call{callCount > 1 ? 's' : ''}</span>
            {contactedCalls > 0 && (
              <span style={styles.contactedCount}>({contactedCalls} contacted)</span>
            )}
          </div>
        ) : (
          <span style={{color: '#64748b', fontSize: '0.75rem'}}>None</span>
        )}
      </td>
      <td style={styles.td}>
        <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap'}}>
          {alarm.media_paths && alarm.media_paths.length > 0 ? (
            <>
              {alarm.media_paths
                .filter(path => !path.endsWith('.wav') && !path.endsWith('.mp3') && !path.endsWith('.ogg'))
                .slice(0, 3)
                .map((path, idx) => (
                  <button
                    key={idx}
                    onClick={() => onViewMedia(path, alarm.media_type)}
                    style={styles.mediaLink}
                    title="View media"
                  >
                    {alarm.media_type === 'video' || alarm.media_type === 'call' || path.endsWith('.mp4') || path.endsWith('.avi') || path.endsWith('.mov') ? (
                      <VideoIcon size={16} color="#3b82f6" />
                    ) : (
                      <ImageIcon size={16} color="#3b82f6" />
                    )}
                  </button>
                ))}
              {alarm.media_paths.filter(path => !path.endsWith('.wav') && !path.endsWith('.mp3') && !path.endsWith('.ogg')).length > 3 && (
                <span style={{fontSize: '0.7rem', color: '#94a3b8'}}>
                  +{alarm.media_paths.filter(path => !path.endsWith('.wav') && !path.endsWith('.mp3') && !path.endsWith('.ogg')).length - 3}
                </span>
              )}
            </>
          ) : (
            <span style={{color: '#64748b', fontSize: '0.75rem', fontStyle: 'italic'}}>
              No Media
            </span>
          )}
          {alarm.alarm_id && (
            <button
              onClick={() => navigate(`/alarm-history/${alarm.alarm_id}`)}
              style={styles.viewBtn}
            >
              <Eye size={14} />
              <span>View</span>
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

const styles = {
  container: {
    width: '100%'
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
  title: {
    fontSize: '2rem',
    fontWeight: '700',
    margin: 0,
    color: '#e2e8f0'
  },
  filterContainer: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    padding: '1.5rem',
    marginBottom: '2rem'
  },
  filterRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem'
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: '#cbd5e1',
    fontSize: '0.875rem',
    fontWeight: '500'
  },
  input: {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    padding: '0.625rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    outline: 'none'
  },
  select: {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    padding: '0.625rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    outline: 'none',
    cursor: 'pointer'
  },
  buttonRow: {
    display: 'flex',
    gap: '0.5rem'
  },
  searchBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.5rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  resetBtn: {
    padding: '0.75rem 1.5rem',
    background: '#475569',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem',
    background: '#1e293b',
    borderRadius: '1rem',
    border: '1px solid #334155'
  },
  emptyTitle: {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#e2e8f0',
    marginTop: '1rem',
    marginBottom: '0.5rem'
  },
  emptyText: {
    color: '#94a3b8'
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
  tableHeader: {
    background: '#0f172a',
    borderBottom: '1px solid #334155'
  },
  th: {
    padding: '0.5rem 0.75rem',
    textAlign: 'left',
    color: '#cbd5e1',
    fontWeight: '600',
    fontSize: '0.8rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  tableRow: {
    borderBottom: '1px solid #334155',
    transition: 'background 0.2s'
  },
  td: {
    padding: '0.5rem 0.75rem',
    color: '#e2e8f0',
    fontSize: '0.8rem'
  },
  dateCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  accountNumber: {
    fontWeight: '600',
    color: '#3b82f6',
    fontSize: '0.8rem'
  },
  accountName: {
    fontSize: '0.8rem',
    color: '#e2e8f0'
  },
  mediaCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  statusBadge: {
    display: 'inline-block',
    padding: '0.2rem 0.6rem',
    borderRadius: '9999px',
    fontSize: '0.7rem',
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  statusResolved: {
    background: '#065f46',
    color: '#10b981'
  },
  statusActive: {
    background: '#78350f',
    color: '#fbbf24'
  },
  viewBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.4rem 0.8rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.4rem',
    color: '#fff',
    fontWeight: '600',
    fontSize: '0.75rem',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  resolutionBadge: {
    display: 'inline-block',
    padding: '0.2rem 0.6rem',
    borderRadius: '0.3rem',
    fontSize: '0.7rem',
    fontWeight: '600',
    background: '#1e40af',
    color: '#93c5fd'
  },
  videoTypeBadge: {
    display: 'inline-block',
    padding: '0.2rem 0.6rem',
    borderRadius: '0.3rem',
    fontSize: '0.7rem',
    fontWeight: '600',
    background: '#6d28d9',
    color: '#c4b5fd'
  },
  callsCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem'
  },
  callCount: {
    fontSize: '0.75rem',
    color: '#e2e8f0',
    fontWeight: '500'
  },
  contactedCount: {
    fontSize: '0.7rem',
    color: '#10b981',
    fontWeight: '500'
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 1.5rem',
    background: '#0f172a',
    borderTop: '1px solid #334155'
  },
  paginationBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  paginationBtnDisabled: {
    background: '#334155',
    color: '#64748b',
    cursor: 'not-allowed',
    opacity: 0.5
  },
  paginationInfo: {
    display: 'flex',
    alignItems: 'center'
  },
  paginationText: {
    color: '#e2e8f0',
    fontSize: '0.875rem',
    fontWeight: '600'
  },
  mediaLink: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.4rem',
    background: '#1e293b',
    border: '1px solid #3b82f6',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textDecoration: 'none'
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
    zIndex: 10000,
    padding: '2rem'
  },
  modalContent: {
    background: '#1e293b',
    borderRadius: '1rem',
    border: '2px solid #3b82f6',
    maxWidth: '90vw',
    maxHeight: '90vh',
    width: 'auto',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 1.5rem',
    borderBottom: '1px solid #334155'
  },
  modalTitle: {
    margin: 0,
    color: '#e2e8f0',
    fontSize: '1.25rem',
    fontWeight: '600'
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    fontSize: '2rem',
    cursor: 'pointer',
    padding: '0',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '0.375rem',
    transition: 'all 0.2s'
  },
  modalBody: {
    padding: '1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'auto',
    maxHeight: 'calc(90vh - 80px)'
  },
  mediaViewer: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    borderRadius: '0.5rem'
  }
}

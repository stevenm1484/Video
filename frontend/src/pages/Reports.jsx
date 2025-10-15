import React, { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import {
  FileText, Calendar, Users, Clock, TrendingUp, BarChart3,
  Download, Filter, RefreshCw
} from 'lucide-react'
import api from '../api/axios'
import { formatTimestampInTimezone } from '../utils/timezone'
import { useAuthStore } from '../store/authStore'

export default function Reports() {
  const currentUser = useAuthStore(state => state.user)
  const [selectedReport, setSelectedReport] = useState('alarms_handled')
  const [operators, setOperators] = useState([])
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState(null)

  // Filter states
  const [selectedOperator, setSelectedOperator] = useState('')
  const [startDate, setStartDate] = useState(getTodayDate())
  const [endDate, setEndDate] = useState(getTodayDate())
  const [eventType, setEventType] = useState('')
  const [priority, setPriority] = useState('')
  const [detailLevel, setDetailLevel] = useState('summary') // summary or detailed

  useEffect(() => {
    loadOperators()
  }, [])

  function getTodayDate() {
    const today = new Date()
    return today.toISOString().split('T')[0]
  }

  const loadOperators = async () => {
    try {
      const response = await api.get('/users')
      setOperators(response.data)
    } catch (error) {
      // If 403 Forbidden (user doesn't have permission to access users), silently set empty operators
      if (error.response?.status === 403) {
        console.log('User does not have permission to view operators list')
        setOperators([])
      } else {
        toast.error('Failed to load operators')
        console.error('Failed to load operators:', error)
      }
    }
  }

  const runReport = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedOperator) params.append('operator_id', selectedOperator)
      if (startDate) params.append('start_date', startDate)
      if (endDate) params.append('end_date', endDate)
      if (eventType) params.append('event_type', eventType)
      if (priority) params.append('priority', priority)
      if (detailLevel) params.append('detail_level', detailLevel)

      const response = await api.get(`/reports/${selectedReport}?${params.toString()}`)
      setReportData(response.data)
    } catch (error) {
      toast.error('Failed to generate report')
      console.error('Report error:', error)
    } finally {
      setLoading(false)
    }
  }

  const exportToCSV = () => {
    if (!reportData) return

    // Convert report data to CSV
    let csvContent = ''

    if (reportData.headers && reportData.rows) {
      csvContent = reportData.headers.join(',') + '\n'
      reportData.rows.forEach(row => {
        csvContent += row.join(',') + '\n'
      })
    }

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedReport}_${startDate}_to_${endDate}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  // Check if user is dealer or customer level
  const isRestrictedLevel = currentUser?.access_level === 'dealer' || currentUser?.access_level === 'customer'

  // All available reports
  const allReports = [
    { id: 'operator_login', name: 'Operator Login Report', icon: Users },
    { id: 'operator_receiving', name: 'Operator Receiving Report', icon: TrendingUp },
    { id: 'avg_time_receive', name: 'Average Time to Receive Events', icon: Clock },
    { id: 'avg_time_handle', name: 'Average Time to Handle Alarms', icon: Clock },
    { id: 'total_handle_time', name: 'Total Operator Handle Time', icon: BarChart3 },
    { id: 'alarms_handled', name: 'Alarms Handled Report', icon: FileText }
  ]

  // Filter reports based on access level
  const reports = isRestrictedLevel
    ? allReports.filter(report => report.id === 'alarms_handled')
    : allReports

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <FileText size={32} color="#3b82f6" />
          <h1 style={styles.title}>Reports</h1>
        </div>
        <p style={styles.subtitle}>Generate detailed reports and analytics</p>
      </div>

      <div style={styles.contentGrid}>
        {/* Report Selection Sidebar */}
        <div style={styles.sidebar}>
          <h3 style={styles.sidebarTitle}>Report Types</h3>
          <div style={styles.reportList}>
            {reports.map(report => {
              const Icon = report.icon
              return (
                <button
                  key={report.id}
                  style={{
                    ...styles.reportItem,
                    ...(selectedReport === report.id ? styles.reportItemActive : {})
                  }}
                  onClick={() => {
                    setSelectedReport(report.id)
                    setReportData(null)
                  }}
                >
                  <Icon size={20} />
                  <span>{report.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Report Configuration & Results */}
        <div style={styles.mainContent}>
          {/* Filters */}
          <div style={styles.filterSection}>
            <div style={styles.filterHeader}>
              <div style={styles.filterTitleRow}>
                <Filter size={20} />
                <h3 style={styles.filterTitle}>Report Filters</h3>
              </div>
            </div>

            <div style={styles.filterGrid}>
              {/* Date Range */}
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

              {/* Operator Filter */}
              <div style={styles.filterGroup}>
                <label style={styles.label}>
                  <Users size={16} />
                  <span>Operator</span>
                </label>
                <select
                  value={selectedOperator}
                  onChange={(e) => setSelectedOperator(e.target.value)}
                  style={styles.select}
                >
                  <option value="">All Operators</option>
                  {operators.map(op => (
                    <option key={op.id} value={op.id}>
                      {op.full_name || op.username}
                    </option>
                  ))}
                </select>
              </div>

              {/* Event Type Filter (for certain reports) */}
              {['avg_time_receive', 'avg_time_handle', 'total_handle_time', 'alarms_handled'].includes(selectedReport) && (
                <div style={styles.filterGroup}>
                  <label style={styles.label}>Event Type</label>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    style={styles.select}
                  >
                    <option value="">All Types</option>
                    <option value="alarm">Alarm</option>
                    <option value="event">Event</option>
                    <option value="escalated">Escalated</option>
                  </select>
                </div>
              )}

              {/* Priority Filter */}
              {['avg_time_receive', 'avg_time_handle', 'total_handle_time', 'alarms_handled'].includes(selectedReport) && (
                <div style={styles.filterGroup}>
                  <label style={styles.label}>Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    style={styles.select}
                  >
                    <option value="">All Priorities</option>
                    <option value="1">1 - Highest</option>
                    <option value="2">2 - High</option>
                    <option value="3">3 - Medium</option>
                    <option value="4">4 - Low</option>
                    <option value="5">5 - Lowest</option>
                  </select>
                </div>
              )}

              {/* Detail Level (for receiving report) */}
              {selectedReport === 'operator_receiving' && (
                <div style={styles.filterGroup}>
                  <label style={styles.label}>Detail Level</label>
                  <select
                    value={detailLevel}
                    onChange={(e) => setDetailLevel(e.target.value)}
                    style={styles.select}
                  >
                    <option value="summary">Summary</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </div>
              )}
            </div>

            <div style={styles.filterActions}>
              <button onClick={runReport} style={styles.runBtn} disabled={loading}>
                {loading ? (
                  <>
                    <RefreshCw size={18} className="spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <BarChart3 size={18} />
                    <span>Generate Report</span>
                  </>
                )}
              </button>
              {reportData && (
                <button onClick={exportToCSV} style={styles.exportBtn}>
                  <Download size={18} />
                  <span>Export CSV</span>
                </button>
              )}
            </div>
          </div>

          {/* Report Results */}
          {reportData && (
            <div style={styles.resultsSection}>
              <div style={styles.resultsHeader}>
                <h3 style={styles.resultsTitle}>Report Results</h3>
                {reportData.summary && (
                  <div style={styles.summaryCards}>
                    {Object.entries(reportData.summary).map(([key, value]) => (
                      <div key={key} style={styles.summaryCard}>
                        <div style={styles.summaryLabel}>{key}</div>
                        <div style={styles.summaryValue}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Table */}
              {reportData.headers && reportData.rows && (
                <div style={styles.tableContainer}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        {reportData.headers.map((header, idx) => (
                          <th key={idx} style={styles.th}>{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.rows.map((row, idx) => (
                        <tr key={idx} style={styles.tr}>
                          {row.map((cell, cellIdx) => (
                            <td key={cellIdx} style={styles.td}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {reportData.rows && reportData.rows.length === 0 && (
                <div style={styles.emptyState}>
                  <FileText size={48} color="#64748b" />
                  <p>No data found for the selected filters</p>
                </div>
              )}
            </div>
          )}

          {!reportData && !loading && (
            <div style={styles.placeholder}>
              <BarChart3 size={64} color="#64748b" />
              <h3 style={styles.placeholderTitle}>Select Filters and Generate Report</h3>
              <p style={styles.placeholderText}>
                Choose your filters above and click "Generate Report" to view the data
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    padding: '2rem',
    width: '100%'
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
  contentGrid: {
    display: 'grid',
    gridTemplateColumns: '280px 1fr',
    gap: '1.5rem'
  },
  sidebar: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    padding: '1.5rem',
    height: 'fit-content'
  },
  sidebarTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: '1rem',
    margin: 0
  },
  reportList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginTop: '1rem'
  },
  reportItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    color: '#cbd5e1',
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'left'
  },
  reportItemActive: {
    background: '#3b82f6',
    borderColor: '#3b82f6',
    color: '#fff',
    fontWeight: '600'
  },
  mainContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem'
  },
  filterSection: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    padding: '1.5rem'
  },
  filterHeader: {
    marginBottom: '1.5rem'
  },
  filterTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  filterTitle: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: '#e2e8f0',
    margin: 0
  },
  filterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginBottom: '1.5rem'
  },
  filterGroup: {
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
  filterActions: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'flex-end'
  },
  runBtn: {
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
  exportBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.5rem',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  resultsSection: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    overflow: 'hidden'
  },
  resultsHeader: {
    padding: '1.5rem',
    borderBottom: '1px solid #334155'
  },
  resultsTitle: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: '#e2e8f0',
    margin: 0,
    marginBottom: '1rem'
  },
  summaryCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '1rem'
  },
  summaryCard: {
    background: '#0f172a',
    padding: '1rem',
    borderRadius: '0.5rem',
    border: '1px solid #334155'
  },
  summaryLabel: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.5rem'
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#3b82f6'
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
    color: '#cbd5e1',
    fontWeight: '600',
    fontSize: '0.875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #334155',
    background: '#0f172a'
  },
  tr: {
    borderBottom: '1px solid #334155'
  },
  td: {
    padding: '1rem',
    color: '#e2e8f0',
    fontSize: '0.875rem'
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem',
    gap: '1rem',
    color: '#94a3b8'
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem',
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    gap: '1rem'
  },
  placeholderTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#e2e8f0',
    margin: 0
  },
  placeholderText: {
    color: '#94a3b8',
    margin: 0
  }
}

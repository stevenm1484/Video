import React, { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import { FileText, Download, Calendar, TrendingUp, AlertCircle, DollarSign, Camera as CameraIcon } from 'lucide-react'
import api from '../api/axios'

export default function BillingReport() {
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [accounts, setAccounts] = useState([])
  const [expandedAccounts, setExpandedAccounts] = useState(new Set())

  useEffect(() => {
    // Set default dates (current month)
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    setStartDate(firstDay.toISOString().split('T')[0])
    setEndDate(now.toISOString().split('T')[0])

    loadAccounts()
  }, [])

  const loadAccounts = async () => {
    try {
      const response = await api.get('/accounts')
      setAccounts(response.data)
    } catch (error) {
      console.error('Failed to load accounts:', error)
    }
  }

  const generateReport = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (startDate) params.append('start_date', startDate)
      if (endDate) params.append('end_date', endDate)
      if (selectedAccountId) params.append('account_id', selectedAccountId)

      const response = await api.get(`/billing-report?${params.toString()}`)
      setReportData(response.data)
      toast.success('Report generated successfully')
    } catch (error) {
      console.error('Failed to generate report:', error)
      toast.error('Failed to generate billing report')
    } finally {
      setLoading(false)
    }
  }

  const exportToCSV = () => {
    if (!reportData) return

    let csv = 'Account ID,Account Name,Account Number,Total Events,Warning Threshold,Snooze Threshold,Auto-Snoozed,Camera Count\n'

    reportData.accounts.forEach(account => {
      csv += `${account.account_id},"${account.account_name}","${account.account_number}",${account.total_events},${account.warning_threshold || 'N/A'},${account.snooze_threshold || 'N/A'},${account.is_auto_snoozed ? 'Yes' : 'No'},${account.camera_count}\n`

      // Add camera details
      account.cameras.forEach(camera => {
        csv += `  Camera ${camera.camera_number},"${camera.camera_name}","",${camera.event_count},${camera.warning_threshold || 'N/A'},${camera.snooze_threshold || 'N/A'},${camera.is_auto_snoozed ? 'Yes' : 'No'},""\n`
      })
    })

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `billing_report_${startDate}_to_${endDate}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
    toast.success('Report exported to CSV')
  }

  const toggleAccountExpanded = (accountId) => {
    const newExpanded = new Set(expandedAccounts)
    if (newExpanded.has(accountId)) {
      newExpanded.delete(accountId)
    } else {
      newExpanded.add(accountId)
    }
    setExpandedAccounts(newExpanded)
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <FileText size={32} color="#3b82f6" />
          <h1 style={styles.title}>Activity Billing Report</h1>
        </div>
      </div>

      {/* Filters */}
      <div style={styles.filtersCard}>
        <h2 style={styles.filterTitle}>Report Filters</h2>
        <div style={styles.filtersGrid}>
          <div style={styles.filterGroup}>
            <label style={styles.label}>
              <Calendar size={16} />
              Start Date
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
              End Date
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
              <DollarSign size={16} />
              Account (Optional)
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              style={styles.input}
            >
              <option value="">All Accounts</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.account_number})
                </option>
              ))}
            </select>
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.label}>&nbsp;</label>
            <button
              onClick={generateReport}
              disabled={loading}
              style={styles.generateBtn}
            >
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {/* Report Summary */}
      {reportData && (
        <>
          <div style={styles.summaryCard}>
            <h2 style={styles.sectionTitle}>Report Summary</h2>
            <div style={styles.summaryGrid}>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>Report Date</div>
                <div style={styles.summaryValue}>
                  {new Date(reportData.report_date).toLocaleString()}
                </div>
              </div>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>Period</div>
                <div style={styles.summaryValue}>
                  {reportData.period_start} to {reportData.period_end}
                </div>
              </div>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>Total Accounts</div>
                <div style={{...styles.summaryValue, color: '#3b82f6'}}>
                  {reportData.total_accounts}
                </div>
              </div>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>Total Events</div>
                <div style={{...styles.summaryValue, color: '#10b981'}}>
                  {reportData.total_events.toLocaleString()}
                </div>
              </div>
            </div>

            <button
              onClick={exportToCSV}
              style={styles.exportBtn}
            >
              <Download size={18} />
              Export to CSV
            </button>
          </div>

          {/* Detailed Account Breakdown */}
          <div style={styles.detailsCard}>
            <h2 style={styles.sectionTitle}>Account Breakdown</h2>

            {reportData.accounts.length === 0 ? (
              <div style={styles.emptyState}>
                <AlertCircle size={48} color="#64748b" />
                <p>No accounts found for the selected period</p>
              </div>
            ) : (
              <div style={styles.accountsList}>
                {reportData.accounts.map(account => (
                  <div key={account.account_id} style={styles.accountCard}>
                    <div
                      style={styles.accountHeader}
                      onClick={() => toggleAccountExpanded(account.account_id)}
                    >
                      <div style={styles.accountInfo}>
                        <div style={styles.accountName}>
                          {account.account_name}
                          {account.is_auto_snoozed && (
                            <span style={styles.snoozedBadge}>AUTO-SNOOZED</span>
                          )}
                        </div>
                        <div style={styles.accountNumber}>{account.account_number}</div>
                      </div>

                      <div style={styles.accountMetrics}>
                        <div style={styles.metric}>
                          <div style={styles.metricLabel}>Total Events</div>
                          <div style={{...styles.metricValue, color: '#3b82f6'}}>
                            {account.total_events.toLocaleString()}
                          </div>
                        </div>
                        <div style={styles.metric}>
                          <div style={styles.metricLabel}>Warning Threshold</div>
                          <div style={styles.metricValue}>
                            {account.warning_threshold || 'N/A'}
                          </div>
                        </div>
                        <div style={styles.metric}>
                          <div style={styles.metricLabel}>Snooze Threshold</div>
                          <div style={styles.metricValue}>
                            {account.snooze_threshold || 'N/A'}
                          </div>
                        </div>
                        <div style={styles.metric}>
                          <div style={styles.metricLabel}>Cameras</div>
                          <div style={styles.metricValue}>{account.camera_count}</div>
                        </div>
                      </div>

                      <div style={styles.expandIcon}>
                        {expandedAccounts.has(account.account_id) ? '▼' : '▶'}
                      </div>
                    </div>

                    {/* Camera Breakdown */}
                    {expandedAccounts.has(account.account_id) && account.cameras.length > 0 && (
                      <div style={styles.camerasSection}>
                        <h3 style={styles.camerasTitle}>
                          <CameraIcon size={18} />
                          Camera Breakdown
                        </h3>
                        <div style={styles.camerasTable}>
                          <table style={styles.table}>
                            <thead>
                              <tr>
                                <th style={styles.th}>Camera</th>
                                <th style={styles.th}>Events</th>
                                <th style={styles.th}>Warning</th>
                                <th style={styles.th}>Snooze</th>
                                <th style={styles.th}>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {account.cameras.map(camera => (
                                <tr key={camera.camera_id} style={styles.tr}>
                                  <td style={styles.td}>
                                    <div style={styles.cameraName}>
                                      {camera.camera_name}
                                    </div>
                                    <div style={styles.cameraNumber}>
                                      #{camera.camera_number}
                                    </div>
                                  </td>
                                  <td style={styles.td}>
                                    <span style={{...styles.badge, background: '#3b82f6'}}>
                                      {camera.event_count}
                                    </span>
                                  </td>
                                  <td style={styles.td}>
                                    {camera.warning_threshold || 'N/A'}
                                  </td>
                                  <td style={styles.td}>
                                    {camera.snooze_threshold || 'N/A'}
                                  </td>
                                  <td style={styles.td}>
                                    {camera.is_auto_snoozed ? (
                                      <span style={{...styles.badge, background: '#f59e0b'}}>
                                        Snoozed
                                      </span>
                                    ) : (
                                      <span style={{...styles.badge, background: '#10b981'}}>
                                        Active
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const styles = {
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '2rem'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  title: {
    fontSize: '2rem',
    fontWeight: '700',
    color: '#e2e8f0',
    margin: 0
  },
  filtersCard: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    padding: '1.5rem',
    marginBottom: '2rem'
  },
  filterTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: '1rem'
  },
  filtersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1.5rem'
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#94a3b8',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  input: {
    padding: '0.75rem',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.375rem',
    color: '#e2e8f0',
    fontSize: '0.875rem'
  },
  generateBtn: {
    padding: '0.75rem 1.5rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  summaryCard: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    padding: '1.5rem',
    marginBottom: '2rem'
  },
  sectionTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: '1.5rem'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1.5rem',
    marginBottom: '1.5rem'
  },
  summaryItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  summaryLabel: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#e2e8f0'
  },
  exportBtn: {
    padding: '0.75rem 1.5rem',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    transition: 'background 0.2s'
  },
  detailsCard: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    padding: '1.5rem'
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '3rem',
    gap: '1rem',
    color: '#64748b'
  },
  accountsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  accountCard: {
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155',
    overflow: 'hidden'
  },
  accountHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    padding: '1.5rem',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  accountInfo: {
    flex: '0 0 250px'
  },
  accountName: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#e2e8f0',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '0.25rem'
  },
  accountNumber: {
    fontSize: '0.75rem',
    color: '#64748b'
  },
  snoozedBadge: {
    fontSize: '0.625rem',
    fontWeight: '700',
    background: '#f59e0b',
    color: '#fff',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem'
  },
  accountMetrics: {
    display: 'flex',
    gap: '2rem',
    flex: 1
  },
  metric: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  metricLabel: {
    fontSize: '0.75rem',
    color: '#94a3b8'
  },
  metricValue: {
    fontSize: '1.25rem',
    fontWeight: '700',
    color: '#e2e8f0'
  },
  expandIcon: {
    fontSize: '1.25rem',
    color: '#64748b'
  },
  camerasSection: {
    padding: '0 1.5rem 1.5rem 1.5rem',
    borderTop: '1px solid #334155'
  },
  camerasTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: '1rem',
    marginBottom: '1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  camerasTable: {
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    textAlign: 'left',
    padding: '0.75rem',
    background: '#1e293b',
    color: '#94a3b8',
    fontSize: '0.75rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #334155'
  },
  tr: {
    borderBottom: '1px solid #334155'
  },
  td: {
    padding: '0.75rem',
    color: '#e2e8f0',
    fontSize: '0.875rem'
  },
  cameraName: {
    fontWeight: '600',
    color: '#e2e8f0'
  },
  cameraNumber: {
    fontSize: '0.75rem',
    color: '#64748b',
    marginTop: '0.25rem'
  },
  badge: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: '700',
    color: '#fff'
  }
}

// Add hover styles
const styleSheet = document.createElement("style")
styleSheet.textContent = `
  button:hover {
    opacity: 0.9;
  }

  .account-header:hover {
    background: #1e293b !important;
  }
`
if (!document.getElementById('billing-report-styles')) {
  styleSheet.id = 'billing-report-styles'
  document.head.appendChild(styleSheet)
}

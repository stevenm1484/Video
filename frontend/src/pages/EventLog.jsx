import React, { useState, useEffect, useRef } from 'react'
import { toast } from 'react-toastify'
import { Activity, Filter, Search, Clock, CheckCircle, XCircle, Ban, AlertTriangle } from 'lucide-react'
import api from '../api/axios'

export default function EventLog() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    outcome: '',
    source_type: '',
    limit: 100
  })
  const [searchTerm, setSearchTerm] = useState('')
  const wsRef = useRef(null)

  useEffect(() => {
    loadEvents()
    setupWebSocket()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [filters])

  const setupWebSocket = () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws`
      console.log('[EventLog] Connecting to WebSocket:', wsUrl)
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[EventLog] WebSocket connected')
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'inbound_event') {
            console.log('[EventLog] New inbound event:', data.event)
            // Add new event to the top of the list
            setEvents(prev => [data.event, ...prev].slice(0, filters.limit))
          } else if (data.type === 'inbound_event_updated') {
            console.log('[EventLog] Inbound event updated:', data.event)
            // Update existing event in the list
            setEvents(prev => prev.map(evt =>
              evt.id === data.event.id
                ? { ...evt, ...data.event }
                : evt
            ))
          }
        } catch (error) {
          console.error('[EventLog] Error parsing WebSocket message:', error)
        }
      }

      ws.onerror = (error) => {
        console.error('[EventLog] WebSocket error:', error)
      }

      ws.onclose = () => {
        console.log('[EventLog] WebSocket disconnected, reconnecting in 3s...')
        setTimeout(setupWebSocket, 3000)
      }
    } catch (error) {
      console.error('[EventLog] Error setting up WebSocket:', error)
    }
  }

  const loadEvents = async () => {
    try {
      const params = new URLSearchParams()
      params.append('limit', filters.limit)
      if (filters.outcome) params.append('outcome', filters.outcome)
      if (filters.source_type) params.append('source_type', filters.source_type)

      const response = await api.get(`/inbound-events?${params.toString()}`)
      setEvents(response.data)
    } catch (error) {
      console.error('Failed to load events:', error)
      toast.error('Failed to load event log')
    } finally {
      setLoading(false)
    }
  }

  const getOutcomeStyle = (outcome) => {
    switch (outcome) {
      case 'pending_created':
        return { background: '#10b981', icon: CheckCircle }
      case 'snoozed':
        return { background: '#f59e0b', icon: Ban }
      case 'disarmed':
        return { background: '#64748b', icon: XCircle }
      case 'no_camera_match':
      case 'no_account_match':
        return { background: '#ef4444', icon: AlertTriangle }
      case 'error':
        return { background: '#dc2626', icon: XCircle }
      // Final outcomes
      case 'dismissed':
        return { background: '#64748b', icon: XCircle }
      case 'alarm_created':
        return { background: '#ef4444', icon: AlertTriangle }
      case 'alarm_resolved':
        return { background: '#10b981', icon: CheckCircle }
      case 'on_hold':
        return { background: '#f59e0b', icon: Clock }
      default:
        return { background: '#334155', icon: Activity }
    }
  }

  const getSourceIcon = (sourceType) => {
    switch (sourceType) {
      case 'smtp':
        return '📧'
      case 'call':
        return '📞'
      case 'webhook':
        return '🔗'
      case 'api':
        return '⚡'
      default:
        return '📥'
    }
  }

  const filteredEvents = events.filter(event => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      event.camera_name?.toLowerCase().includes(search) ||
      event.account_name?.toLowerCase().includes(search) ||
      event.account_number?.toLowerCase().includes(search) ||
      event.source_identifier?.toLowerCase().includes(search) ||
      event.caller_id_num?.toLowerCase().includes(search)
    )
  })

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading event log...</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <Activity size={32} color="#3b82f6" />
          <div>
            <h1 style={styles.title}>Event Log</h1>
            <p style={styles.subtitle}>Real-time inbound event monitoring</p>
          </div>
        </div>
        <div style={styles.liveIndicator}>
          <div style={styles.liveDot}></div>
          <span>LIVE</span>
        </div>
      </div>

      {/* Filters */}
      <div style={styles.filtersCard}>
        <div style={styles.filtersGrid}>
          <div style={styles.searchBox}>
            <Search size={18} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search by camera, account, phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={styles.searchInput}
            />
          </div>

          <select
            value={filters.outcome}
            onChange={(e) => setFilters({ ...filters, outcome: e.target.value })}
            style={styles.select}
          >
            <option value="">All Outcomes</option>
            <option value="pending_created">✅ Created</option>
            <option value="snoozed">🔕 Snoozed</option>
            <option value="disarmed">⛔ Disarmed</option>
            <option value="no_camera_match">❌ No Match</option>
            <option value="error">⚠️ Error</option>
          </select>

          <select
            value={filters.source_type}
            onChange={(e) => setFilters({ ...filters, source_type: e.target.value })}
            style={styles.select}
          >
            <option value="">All Sources</option>
            <option value="smtp">📧 SMTP</option>
            <option value="call">📞 Call</option>
            <option value="webhook">🔗 Webhook</option>
            <option value="api">⚡ API</option>
          </select>

          <select
            value={filters.limit}
            onChange={(e) => setFilters({ ...filters, limit: parseInt(e.target.value) })}
            style={styles.select}
          >
            <option value="50">50 events</option>
            <option value="100">100 events</option>
            <option value="250">250 events</option>
            <option value="500">500 events</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div style={styles.statsGrid}>
        <StatCard
          title="Total Events"
          value={filteredEvents.length}
          color="#3b82f6"
        />
        <StatCard
          title="Created"
          value={filteredEvents.filter(e => e.outcome === 'pending_created').length}
          color="#10b981"
        />
        <StatCard
          title="Filtered"
          value={filteredEvents.filter(e => ['snoozed', 'disarmed'].includes(e.outcome)).length}
          color="#f59e0b"
        />
        <StatCard
          title="Errors"
          value={filteredEvents.filter(e => e.outcome === 'error').length}
          color="#ef4444"
        />
      </div>

      {/* Events Table */}
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Date</th>
              <th style={styles.th}>Time</th>
              <th style={styles.th}>Source</th>
              <th style={styles.th}>Camera</th>
              <th style={styles.th}>Account</th>
              <th style={styles.th}>Account #</th>
              <th style={styles.th}>Initial</th>
              <th style={styles.th}>Final Status</th>
              <th style={styles.th}>Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.length === 0 ? (
              <tr>
                <td colSpan="9" style={styles.emptyRow}>
                  <Activity size={48} color="#64748b" />
                  <p>No events found</p>
                </td>
              </tr>
            ) : (
              filteredEvents.map((event) => {
                const outcomeStyle = getOutcomeStyle(event.outcome)
                const OutcomeIcon = outcomeStyle.icon

                // Get final outcome style if it exists
                const finalOutcomeStyle = event.final_outcome ? getOutcomeStyle(event.final_outcome) : null
                const FinalOutcomeIcon = finalOutcomeStyle?.icon

                return (
                  <tr key={event.id} style={styles.tr}>
                    <td style={styles.td}>
                      <span style={styles.singleLineText}>
                        {new Date(event.timestamp).toLocaleDateString()}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.timeCell}>
                        <Clock size={14} />
                        <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.sourceCell}>
                        <span style={styles.sourceIcon}>{getSourceIcon(event.source_type)}</span>
                        <span>{event.source_type.toUpperCase()}</span>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.singleLineText}>{event.camera_name}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.singleLineText}>{event.account_name}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.singleLineText}>{event.account_number || 'N/A'}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.outcomeText}>
                        {event.outcome.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {event.final_outcome ? (
                        event.final_outcome === 'alarm_resolved' && event.alarm_resolution ? (
                          <span style={styles.resolutionOnlyText}>
                            {event.alarm_resolution}
                          </span>
                        ) : (
                          <span style={styles.outcomeText}>
                            {event.final_outcome.replace(/_/g, ' ')}
                          </span>
                        )
                      ) : (
                        <span style={{color: '#64748b', fontSize: '0.75rem'}}>—</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <div style={styles.reasonCell}>
                        {event.outcome_reason || '-'}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ title, value, color }) {
  return (
    <div style={{...styles.statCard, borderColor: color}}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statTitle}>{title}</div>
    </div>
  )
}

const styles = {
  container: {
    maxWidth: '1600px',
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
  subtitle: {
    fontSize: '0.875rem',
    color: '#94a3b8',
    margin: '0.25rem 0 0 0'
  },
  liveIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    background: '#1e293b',
    border: '1px solid #10b981',
    borderRadius: '9999px',
    color: '#10b981',
    fontSize: '0.875rem',
    fontWeight: '600'
  },
  liveDot: {
    width: '8px',
    height: '8px',
    background: '#10b981',
    borderRadius: '50%',
    animation: 'pulse 2s infinite'
  },
  filtersCard: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    padding: '1.5rem',
    marginBottom: '1.5rem'
  },
  filtersGrid: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 1fr',
    gap: '1rem'
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.375rem'
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#e2e8f0',
    fontSize: '0.875rem'
  },
  select: {
    padding: '0.75rem',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.375rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    cursor: 'pointer'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1rem',
    marginBottom: '1.5rem'
  },
  statCard: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '2px solid',
    padding: '1.5rem',
    textAlign: 'center'
  },
  statValue: {
    fontSize: '2rem',
    fontWeight: '700',
    color: '#e2e8f0'
  },
  statTitle: {
    fontSize: '0.875rem',
    color: '#94a3b8',
    marginTop: '0.5rem'
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
    padding: '0.5rem',
    background: '#0f172a',
    color: '#94a3b8',
    fontSize: '0.75rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #334155'
  },
  tr: {
    borderBottom: '1px solid #334155',
    transition: 'background 0.2s'
  },
  td: {
    padding: '0.5rem',
    color: '#e2e8f0',
    fontSize: '0.875rem'
  },
  singleLineText: {
    color: '#e2e8f0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  timeCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: '#e2e8f0'
  },
  sourceCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  sourceIcon: {
    fontSize: '1.25rem'
  },
  outcomeText: {
    fontSize: '0.875rem',
    color: '#e2e8f0',
    textTransform: 'capitalize'
  },
  resolutionOnlyText: {
    fontSize: '0.875rem',
    color: '#10b981',
    fontWeight: '500'
  },
  reasonCell: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    maxWidth: '300px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  emptyRow: {
    padding: '3rem',
    textAlign: 'center',
    color: '#94a3b8',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem'
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
  }
}

// Add CSS animations
const styleSheet = document.createElement("style")
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  tr:hover {
    background: #334155 !important;
  }
`
if (!document.getElementById('event-log-styles')) {
  styleSheet.id = 'event-log-styles'
  document.head.appendChild(styleSheet)
}

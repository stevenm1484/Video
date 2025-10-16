import { useState, useEffect } from 'react'
import { Clock, Calendar, Search, Camera, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../api/axios'
import { formatTimestampInTimezone } from '../utils/timezone'

const AccountHistory = ({ accountId, timezone }) => {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [expandedEvents, setExpandedEvents] = useState({})
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalEvents, setTotalEvents] = useState(0)
  const pageSize = 15

  useEffect(() => {
    // Set default date range to last 2 days
    const now = new Date()
    const twoDaysAgo = new Date(now)
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

    setStartDate(twoDaysAgo.toISOString().split('T')[0])
    setEndDate(now.toISOString().split('T')[0])
  }, [])

  useEffect(() => {
    if (startDate && endDate) {
      setCurrentPage(1) // Reset to page 1 when dates change
      loadHistory(1)
    }
  }, [accountId, startDate, endDate])

  useEffect(() => {
    if (startDate && endDate && currentPage > 1) {
      loadHistory(currentPage)
    }
  }, [currentPage])

  const loadHistory = async (page = 1) => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        account_id: accountId,
        start_date: startDate,
        end_date: endDate,
        page: page,
        page_size: pageSize
      })

      const response = await api.get(`/history?${params}`)

      // Group by event_id
      const grouped = groupByEvent(response.data.items || [])
      setHistory(grouped)

      // Update pagination info
      setTotalEvents(response.data.total || 0)
      setTotalPages(response.data.total_pages || 1)

      // Start with all events collapsed by default
      setExpandedEvents({})
    } catch (error) {
      console.error('Failed to load history:', error)
    } finally {
      setLoading(false)
    }
  }

  const groupByEvent = (items) => {
    // Group items by event_id
    const eventMap = new Map()

    items.forEach(item => {
      const eventId = item.event_id || item.id

      if (!eventMap.has(eventId)) {
        eventMap.set(eventId, {
          event_id: eventId,
          timestamp: item.timestamp,
          sort_timestamp: item.sort_timestamp || item.timestamp,
          camera_name: item.camera_name,
          camera_id: item.camera_id,
          location: item.location,
          media_type: item.media_type,
          media_paths: item.media_paths,
          items: []
        })
      }

      eventMap.get(eventId).items.push(item)
    })

    // Convert to array and sort by most recent first
    return Array.from(eventMap.values()).sort((a, b) => {
      const dateA = new Date(a.sort_timestamp)
      const dateB = new Date(b.sort_timestamp)
      return dateB - dateA // Most recent first
    })
  }

  const toggleExpand = (eventId) => {
    setExpandedEvents(prev => ({
      ...prev,
      [eventId]: !prev[eventId]
    }))
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'resolved':
        return <CheckCircle size={20} color="#10b981" />
      case 'dismissed':
        return <XCircle size={20} color="#6b7280" />
      case 'snoozed':
        return <Clock size={20} color="#f59e0b" />
      default:
        return <AlertTriangle size={20} color="#ef4444" />
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'resolved':
        return '#10b981'
      case 'dismissed':
        return '#6b7280'
      case 'snoozed':
        return '#f59e0b'
      default:
        return '#ef4444'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'resolved':
        return 'Resolved'
      case 'dismissed':
        return 'Dismissed'
      case 'snoozed':
        return 'Snoozed'
      case 'pending':
        return 'Pending'
      case 'active':
        return 'Active'
      default:
        return status
    }
  }

  if (loading) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        color: '#94a3b8'
      }}>
        Loading history...
      </div>
    )
  }

  return (
    <div style={{
      padding: '1.5rem',
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header with date filters */}
      <div style={{
        marginBottom: '1.5rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid #334155'
      }}>
        <h2 style={{
          fontSize: '1.25rem',
          fontWeight: '600',
          color: '#e2e8f0',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <Clock size={22} />
          Event History
        </h2>

        {/* Date range picker */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={18} color="#94a3b8" />
            <label style={{ fontSize: '0.875rem', color: '#94a3b8' }}>From:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                padding: '0.5rem',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '0.375rem',
                color: '#e2e8f0',
                fontSize: '0.875rem'
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.875rem', color: '#94a3b8' }}>To:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                padding: '0.5rem',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '0.375rem',
                color: '#e2e8f0',
                fontSize: '0.875rem'
              }}
            />
          </div>

          <button
            onClick={() => {
              setCurrentPage(1)
              loadHistory(1)
            }}
            style={{
              padding: '0.5rem 1rem',
              background: '#3b82f6',
              border: 'none',
              borderRadius: '0.375rem',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Search size={16} />
            Search
          </button>
        </div>

        <div style={{
          marginTop: '0.75rem',
          fontSize: '0.875rem',
          color: '#94a3b8'
        }}>
          Showing {history.length} of {totalEvents} event{totalEvents !== 1 ? 's' : ''} (Page {currentPage} of {totalPages})
        </div>
      </div>

      {/* History list */}
      <div style={{
        flex: 1,
        overflowY: 'auto'
      }}>
        {history.length === 0 ? (
          <div style={{
            padding: '2rem',
            textAlign: 'center',
            color: '#94a3b8'
          }}>
            No history found for this date range
          </div>
        ) : (
          history.map((event) => {
            const isExpanded = expandedEvents[event.event_id]
            const alarmItems = event.items.filter(item => item.alarm_id)
            const activityItems = event.items.filter(item => !item.alarm_id)

            return (
              <div
                key={event.event_id}
                style={{
                  marginBottom: '1rem',
                  background: '#1e293b',
                  borderRadius: '0.5rem',
                  border: '1px solid #334155',
                  overflow: 'hidden'
                }}
              >
                {/* Event header */}
                <button
                  onClick={() => toggleExpand(event.event_id)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#0f172a'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {/* Thumbnail */}
                  {event.media_paths && event.media_paths.length > 0 && (
                    <img
                      src={`/${event.media_paths[0]}`}
                      alt="Event preview"
                      style={{
                        width: '60px',
                        height: '45px',
                        objectFit: 'cover',
                        borderRadius: '0.25rem',
                        border: '1px solid #334155',
                        flexShrink: 0
                      }}
                      onError={(e) => {
                        e.target.style.display = 'none'
                      }}
                    />
                  )}

                  {/* Single line info */}
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    fontSize: '0.875rem',
                    minWidth: 0
                  }}>
                    {/* Camera name */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      minWidth: 0,
                      flex: '0 1 auto'
                    }}>
                      <Camera size={16} color="#3b82f6" style={{ flexShrink: 0 }} />
                      <span style={{
                        fontWeight: '500',
                        color: '#e2e8f0',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {event.camera_name}
                      </span>
                    </div>

                    {/* Divider */}
                    <span style={{ color: '#475569', flexShrink: 0 }}>•</span>

                    {/* Date/Time */}
                    <span style={{
                      color: '#94a3b8',
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}>
                      {formatTimestampInTimezone(event.timestamp, timezone, { showDate: true, showTime: true })}
                    </span>

                    {/* Divider */}
                    <span style={{ color: '#475569', flexShrink: 0 }}>•</span>

                    {/* Status badges and resolution */}
                    <div style={{
                      display: 'flex',
                      gap: '0.5rem',
                      flexShrink: 0,
                      alignItems: 'center'
                    }}>
                      {alarmItems.length > 0 && (
                        <span style={{
                          padding: '0.125rem 0.5rem',
                          background: '#3b82f620',
                          borderRadius: '0.25rem',
                          color: '#3b82f6',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          whiteSpace: 'nowrap'
                        }}>
                          {alarmItems.length} alarm{alarmItems.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {activityItems.length > 0 && (
                        <span style={{
                          padding: '0.125rem 0.5rem',
                          background: '#f59e0b20',
                          borderRadius: '0.25rem',
                          color: '#f59e0b',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          whiteSpace: 'nowrap'
                        }}>
                          {activityItems.length} action{activityItems.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {/* Show resolution for resolved alarms */}
                      {(() => {
                        const resolvedAlarm = event.items.find(item => item.status === 'resolved' && item.resolution)
                        if (resolvedAlarm) {
                          return (
                            <>
                              <span style={{ color: '#475569', flexShrink: 0 }}>•</span>
                              <span style={{
                                color: '#10b981',
                                fontSize: '0.75rem',
                                fontWeight: '500',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '200px'
                              }}>
                                {resolvedAlarm.resolution}
                              </span>
                            </>
                          )
                        }
                        return null
                      })()}
                    </div>
                  </div>

                  {/* Expand indicator */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    color: '#3b82f6',
                    flexShrink: 0
                  }}>
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{
                    borderTop: '1px solid #334155',
                    background: '#0f172a',
                    padding: '1rem'
                  }}>
                    {event.items.map((item, index) => (
                      <div
                        key={index}
                        style={{
                          marginBottom: index === event.items.length - 1 ? 0 : '0.75rem',
                          padding: '0.75rem',
                          background: '#1e293b',
                          borderRadius: '0.375rem',
                          borderLeft: `3px solid ${getStatusColor(item.status)}`
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '0.5rem'
                        }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            {getStatusIcon(item.status)}
                            <span style={{
                              fontSize: '0.875rem',
                              fontWeight: '500',
                              color: '#e2e8f0'
                            }}>
                              {item.alarm_id ? `Alarm #${item.alarm_id}` : 'Event Activity'}
                            </span>
                            <span style={{
                              padding: '0.125rem 0.5rem',
                              background: `${getStatusColor(item.status)}20`,
                              borderRadius: '0.25rem',
                              color: getStatusColor(item.status),
                              fontSize: '0.75rem',
                              fontWeight: '500'
                            }}>
                              {getStatusText(item.status)}
                            </span>
                          </div>
                          <div style={{
                            fontSize: '0.75rem',
                            color: '#94a3b8'
                          }}>
                            {formatTimestampInTimezone(item.created_at || item.timestamp, timezone, { showTime: true })}
                          </div>
                        </div>

                        {item.operator_name && (
                          <div style={{
                            fontSize: '0.75rem',
                            color: '#94a3b8',
                            marginBottom: '0.5rem'
                          }}>
                            Operator: {item.operator_name}
                          </div>
                        )}

                        {item.resolution && (
                          <div style={{
                            fontSize: '0.875rem',
                            color: '#cbd5e1',
                            marginBottom: '0.5rem'
                          }}>
                            <strong>Resolution:</strong> {item.resolution}
                          </div>
                        )}

                        {item.notes && (
                          <div style={{
                            fontSize: '0.875rem',
                            color: '#cbd5e1',
                            padding: '0.5rem',
                            background: '#0f172a',
                            borderRadius: '0.25rem',
                            marginTop: '0.5rem'
                          }}>
                            <strong>Notes:</strong> {item.notes}
                          </div>
                        )}

                        {item.snooze_reason && (
                          <div style={{
                            fontSize: '0.875rem',
                            color: '#cbd5e1'
                          }}>
                            <strong>Reason:</strong> {item.snooze_reason}
                          </div>
                        )}

                        {item.call_logs && item.call_logs.length > 0 && (
                          <div style={{
                            marginTop: '0.5rem',
                            padding: '0.5rem',
                            background: '#0f172a',
                            borderRadius: '0.25rem',
                            fontSize: '0.75rem',
                            color: '#94a3b8'
                          }}>
                            {item.call_logs.length} call{item.call_logs.length !== 1 ? 's' : ''} made
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          borderTop: '1px solid #334155',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            style={{
              padding: '0.5rem 1rem',
              background: currentPage === 1 ? '#1e293b' : '#3b82f6',
              border: '1px solid #334155',
              borderRadius: '0.375rem',
              color: currentPage === 1 ? '#64748b' : '#fff',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <ChevronLeft size={16} />
            Previous
          </button>

          <div style={{
            fontSize: '0.875rem',
            color: '#94a3b8'
          }}>
            Page {currentPage} of {totalPages}
          </div>

          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            style={{
              padding: '0.5rem 1rem',
              background: currentPage === totalPages ? '#1e293b' : '#3b82f6',
              border: '1px solid #334155',
              borderRadius: '0.375rem',
              color: currentPage === totalPages ? '#64748b' : '#fff',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

export default AccountHistory

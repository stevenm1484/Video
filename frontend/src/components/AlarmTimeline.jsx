import { useState, useEffect } from 'react'
import {
  Clock,
  User,
  Eye,
  Pause,
  Play,
  AlertTriangle,
  CheckCircle,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  Zap,
  FileText,
  Video,
  Camera,
  Voicemail,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import api from '../api/axios'

const AlarmTimeline = ({ alarmId, eventId }) => {
  const [timeline, setTimeline] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedItems, setExpandedItems] = useState({})

  useEffect(() => {
    loadTimeline()
  }, [alarmId, eventId])

  const loadTimeline = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/alarms/${alarmId}/timeline`)

      // Group timeline into main events with nested actions
      const grouped = groupTimelineByEvent(response.data)
      setTimeline(grouped)

      // Auto-expand all items that have details by default
      const autoExpandItems = {}
      grouped.forEach(event => {
        // Expand main event if it has actions
        if (event.actions && event.actions.length > 0) {
          autoExpandItems[event.id] = true
        }
        // Expand nested action items that have details
        if (event.actions) {
          event.actions.forEach(item => {
            if (hasDetailsCheck(item)) {
              autoExpandItems[item.id] = true
            }
          })
        }
      })
      setExpandedItems(autoExpandItems)
    } catch (error) {
      console.error('Failed to load timeline:', error)
    } finally {
      setLoading(false)
    }
  }

  // Helper function to check if item has details (used before state is set)
  const hasDetailsCheck = (item) => {
    const details = item.details || {}

    if (item.action === 'final_resolution') {
      return !!(details.notes || details.resolution || details.eyes_on_count)
    }

    if (item.action === 'phone_call') {
      return !!(details.outcome || details.notes || details.duration || details.recording_url)
    }

    if (item.action === 'phone_call_completed') {
      return !!(details.recording_url || details.duration)
    }

    if (item.action === 'note_added') {
      return !!(details.note_text)
    }

    if (item.action === 'tool_activated' || item.action === 'tool_triggered') {
      return !!(details.relay_number || details.tool_type || details.mode || details.webhook_url)
    }

    if (item.action === 'phone_call_parked' || item.action === 'phone_call_retrieved') {
      return !!(details.parked_slot)
    }

    const meaningfulKeys = Object.keys(details).filter(key =>
      !['contact_name', 'phone_number', 'tool_name', 'camera_name', 'call_type', 'tool_id', 'camera_id'].includes(key)
    )

    return meaningfulKeys.length > 0
  }

  const groupTimelineByEvent = (timelineData) => {
    // Find the main event (alarm received or event received)
    const mainEvent = timelineData.find(item =>
      item.action === 'event_received' || item.action === 'alarm_generated'
    )

    if (!mainEvent) {
      return []
    }

    // Get all other actions (everything that happened after the event was received)
    const actions = timelineData.filter(item =>
      item.action !== 'event_received' && item.action !== 'alarm_generated'
    )

    // Return array with single grouped event
    return [{
      id: mainEvent.id,
      timestamp: mainEvent.timestamp,
      action: mainEvent.action,
      username: mainEvent.username,
      details: mainEvent.details,
      actions: actions // All nested actions under this event
    }]
  }

  const toggleExpand = (id) => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  const getActionIcon = (action) => {
    const iconProps = { size: 18 }

    switch (action) {
      case 'event_received':
      case 'alarm_generated':
        return <AlertTriangle {...iconProps} color="#f59e0b" />
      case 'alarm_viewed':
      case 'event_viewed':
        return <Eye {...iconProps} color="#3b82f6" />
      case 'alarm_held':
      case 'event_held':
        return <Pause {...iconProps} color="#8b5cf6" />
      case 'alarm_unheld':
      case 'event_unheld':
        return <Play {...iconProps} color="#10b981" />
      case 'event_escalated':
        return <AlertTriangle {...iconProps} color="#ef4444" />
      case 'alarm_resolved':
        return <CheckCircle {...iconProps} color="#10b981" />
      case 'event_dismissed':
        return <CheckCircle {...iconProps} color="#6b7280" />
      case 'phone_call_initiated':
        return <PhoneCall {...iconProps} color="#3b82f6" />
      case 'phone_call_answered':
        return <PhoneIncoming {...iconProps} color="#10b981" />
      case 'phone_call_missed':
        return <PhoneMissed {...iconProps} color="#ef4444" />
      case 'phone_call_completed':
        return <Phone {...iconProps} color="#10b981" />
      case 'phone_call':
        return <PhoneCall {...iconProps} color="#3b82f6" />
      case 'tool_activated':
      case 'tool_triggered':
        return <Zap {...iconProps} color="#f59e0b" />
      case 'camera_switched':
      case 'camera_view_changed':
        return <Camera {...iconProps} color="#8b5cf6" />
      case 'view_mode_changed':
        return <Video {...iconProps} color="#8b5cf6" />
      case 'note_added':
        return <FileText {...iconProps} color="#3b82f6" />
      case 'recording_available':
        return <Voicemail {...iconProps} color="#8b5cf6" />
      case 'final_resolution':
        return <CheckCircle {...iconProps} color="#10b981" />
      case 'phone_call_parked':
        return <Phone {...iconProps} color="#f59e0b" />
      case 'phone_call_retrieved':
        return <PhoneIncoming {...iconProps} color="#10b981" />
      default:
        return <Clock {...iconProps} color="#6b7280" />
    }
  }

  const getActionColor = (action) => {
    switch (action) {
      case 'event_received':
      case 'alarm_generated':
        return '#f59e0b'
      case 'alarm_viewed':
      case 'event_viewed':
        return '#3b82f6'
      case 'alarm_held':
      case 'event_held':
        return '#8b5cf6'
      case 'alarm_unheld':
      case 'event_unheld':
        return '#10b981'
      case 'event_escalated':
        return '#ef4444'
      case 'alarm_resolved':
        return '#10b981'
      case 'event_dismissed':
        return '#6b7280'
      case 'phone_call_initiated':
        return '#3b82f6'
      case 'phone_call_answered':
        return '#10b981'
      case 'phone_call_missed':
        return '#ef4444'
      case 'phone_call_completed':
        return '#10b981'
      case 'phone_call':
        return '#3b82f6'
      case 'tool_activated':
      case 'tool_triggered':
        return '#f59e0b'
      case 'camera_switched':
      case 'camera_view_changed':
      case 'view_mode_changed':
        return '#8b5cf6'
      case 'note_added':
        return '#3b82f6'
      case 'recording_available':
        return '#8b5cf6'
      case 'final_resolution':
        return '#10b981'
      case 'phone_call_parked':
        return '#f59e0b'
      case 'phone_call_retrieved':
        return '#10b981'
      default:
        return '#6b7280'
    }
  }

  const formatActionText = (item) => {
    const action = item.action
    const details = item.details || {}

    switch (action) {
      case 'event_received':
        return 'Alarm Event Received from Camera'
      case 'alarm_generated':
        return `Alarm Generated from ${details.related_event_count || 1} Related Event(s)`
      case 'alarm_viewed':
        return 'Alarm viewed'
      case 'event_viewed':
        return 'Event viewed'
      case 'alarm_held':
        return 'Alarm put on hold'
      case 'event_held':
        return 'Event held'
      case 'alarm_unheld':
        return 'Alarm resumed from hold'
      case 'event_unheld':
        return 'Event resumed'
      case 'event_escalated':
        return 'Event escalated to alarm'
      case 'alarm_resolved':
        return `Alarm resolved: ${details.resolution || 'No resolution specified'}`
      case 'event_dismissed':
        return 'Event dismissed as false alarm'
      case 'phone_call_initiated':
        return `Call initiated to ${details.contact_name || details.phone_number || 'contact'}`
      case 'phone_call_answered':
        return `Call answered by ${details.contact_name || 'contact'}`
      case 'phone_call_missed':
        return `Call to ${details.contact_name || details.phone_number || 'contact'} - No answer`
      case 'phone_call_completed':
        return `Call completed (${details.duration || 'unknown duration'})`
      case 'phone_call':
        return `Call initiated to ${details.contact_name || details.phone_number || 'contact'}`
      case 'tool_activated':
      case 'tool_triggered':
        // Show more specific info based on tool type
        if (details.tool_type === 'cbw_relay' && details.relay_number) {
          const relayDesc = details.relay_description || `Relay ${details.relay_number}`
          const mode = details.mode ? ` (${details.mode})` : ''
          return `${details.tool_name}: ${relayDesc}${mode}`
        } else if (details.tool_type === 'camera_view') {
          const cameraCount = details.camera_count || 1
          const viewType = details.view_type || 'single'
          return `${details.tool_name} - ${viewType === 'grid' ? `${cameraCount} cameras` : 'camera view'}`
        } else if (details.tool_type === 'webhook') {
          return `${details.tool_name} (webhook)`
        }
        return `Tool triggered: ${details.tool_name || 'Unknown tool'}`
      case 'camera_switched':
        return `Switched to camera: ${details.camera_name || 'Unknown camera'}`
      case 'camera_view_changed':
        return `Switched to camera: ${details.camera_name || 'Unknown camera'}`
      case 'view_mode_changed':
        return `Switched to ${details.view_mode === 'grid' ? 'grid view' : 'single camera view'}`
      case 'note_added':
        return 'Note added'
      case 'recording_available':
        return 'Voice recording available'
      case 'final_resolution':
        return `✓ ALARM RESOLVED: ${details.resolution || 'No resolution specified'}`
      case 'phone_call_parked':
        return `Call parked in slot ${details.parked_slot || 'unknown'}`
      case 'phone_call_retrieved':
        return `Call retrieved from slot ${details.parked_slot || 'unknown'}`
      default:
        return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    }
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
  }

  const formatDate = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const hasDetails = (item) => {
    const details = item.details || {}

    // Check for specific action types with meaningful details
    if (item.action === 'final_resolution') {
      return !!(details.notes || details.resolution || details.eyes_on_count)
    }

    if (item.action === 'phone_call') {
      return !!(details.outcome || details.notes || details.duration || details.recording_url)
    }

    if (item.action === 'phone_call_completed') {
      return !!(details.recording_url || details.duration)
    }

    if (item.action === 'note_added') {
      return !!(details.note_text)
    }

    if (item.action === 'tool_activated' || item.action === 'tool_triggered') {
      return !!(details.relay_number || details.tool_type || details.mode || details.webhook_url)
    }

    if (item.action === 'phone_call_parked' || item.action === 'phone_call_retrieved') {
      return !!(details.parked_slot)
    }

    // Check if details has meaningful content (not just basic identifiers)
    const meaningfulKeys = Object.keys(details).filter(key =>
      !['contact_name', 'phone_number', 'tool_name', 'camera_name', 'call_type', 'tool_id', 'camera_id'].includes(key)
    )

    return meaningfulKeys.length > 0
  }

  const renderDetails = (item) => {
    const details = item.details || {}

    // Special rendering for final resolution
    if (item.action === 'final_resolution') {
      return (
        <div style={{
          marginTop: '0.75rem',
          padding: '1rem',
          background: '#10b98120',
          borderRadius: '0.375rem',
          border: '2px solid #10b981'
        }}>
          <div style={{
            fontSize: '0.875rem',
            fontWeight: '600',
            color: '#10b981',
            marginBottom: '0.5rem'
          }}>
            Final Resolution
          </div>
          <div style={{
            fontSize: '0.875rem',
            color: '#e2e8f0',
            marginBottom: '0.5rem'
          }}>
            <strong>Resolution Type:</strong> {details.resolution || 'None specified'}
          </div>
          {details.notes && (
            <div style={{
              marginTop: '0.5rem',
              padding: '0.75rem',
              background: '#1e293b',
              borderRadius: '0.375rem',
              border: '1px solid #334155'
            }}>
              <div style={{
                fontSize: '0.75rem',
                fontWeight: '500',
                color: '#e2e8f0',
                marginBottom: '0.5rem'
              }}>
                Notes:
              </div>
              <div style={{
                fontSize: '0.875rem',
                color: '#cbd5e1',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap'
              }}>
                {details.notes}
              </div>
            </div>
          )}
          {details.eyes_on_count > 0 && (
            <div style={{
              marginTop: '0.5rem',
              fontSize: '0.75rem',
              color: '#94a3b8'
            }}>
              Eyes-on verification: {details.eyes_on_count} operator(s)
            </div>
          )}
        </div>
      )
    }

    // Special rendering for phone call completed
    if (item.action === 'phone_call_completed' && details.recording_url) {
      return (
        <div style={{
          marginTop: '0.75rem',
          padding: '0.75rem',
          background: '#1e293b',
          borderRadius: '0.375rem',
          border: '1px solid #334155'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Voicemail size={16} color="#8b5cf6" />
            <span style={{ fontSize: '0.875rem', color: '#e2e8f0', fontWeight: '500' }}>
              Call Recording
            </span>
          </div>
          <audio
            controls
            style={{
              width: '100%',
              marginTop: '0.5rem',
              height: '32px'
            }}
          >
            <source src={details.recording_url} type="audio/mpeg" />
            Your browser does not support audio playback.
          </audio>
          {details.duration && (
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>
              Duration: {details.duration}
            </div>
          )}
        </div>
      )
    }

    if (item.action === 'note_added' && details.note_text) {
      return (
        <div style={{
          marginTop: '0.75rem',
          padding: '0.75rem',
          background: '#1e293b',
          borderRadius: '0.375rem',
          border: '1px solid #334155',
          fontSize: '0.875rem',
          color: '#cbd5e1',
          lineHeight: '1.5'
        }}>
          {details.note_text}
        </div>
      )
    }

    // Special rendering for phone_call (grouped call with nested details)
    if (item.action === 'phone_call') {
      return (
        <div style={{
          marginTop: '0.75rem',
          padding: '0.75rem',
          background: '#1e293b',
          borderRadius: '0.375rem',
          border: '1px solid #334155'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
            {/* Call Outcome */}
            {details.outcome && (
              <div style={{
                marginBottom: '0.75rem',
                padding: '0.5rem',
                background: details.outcome === 'answered' ? '#10b98120' : '#f59e0b20',
                borderRadius: '0.25rem',
                border: `1px solid ${details.outcome === 'answered' ? '#10b981' : '#f59e0b'}`
              }}>
                <div style={{
                  color: details.outcome === 'answered' ? '#10b981' : '#f59e0b',
                  fontWeight: '600',
                  marginBottom: '0.25rem'
                }}>
                  Call {details.outcome === 'answered' ? 'Answered' : details.outcome === 'no_answer' ? 'No Answer' : details.outcome === 'voicemail' ? 'Went to Voicemail' : details.outcome}
                </div>
                {details.duration && (
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    Duration: {details.duration}
                  </div>
                )}
              </div>
            )}

            {/* Call Notes */}
            {details.notes && (
              <div style={{
                marginBottom: details.recording_url ? '0.75rem' : 0,
                padding: '0.5rem',
                background: '#0f172a',
                borderRadius: '0.25rem',
                border: '1px solid #334155'
              }}>
                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  color: '#e2e8f0',
                  marginBottom: '0.25rem'
                }}>
                  Call Notes:
                </div>
                <div style={{
                  fontSize: '0.875rem',
                  color: '#cbd5e1',
                  lineHeight: '1.5',
                  whiteSpace: 'pre-wrap'
                }}>
                  {details.notes}
                </div>
              </div>
            )}

            {/* Recording */}
            {details.recording_url && (
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem'
                }}>
                  <Voicemail size={16} color="#8b5cf6" />
                  <span style={{ fontSize: '0.875rem', color: '#e2e8f0', fontWeight: '500' }}>
                    Call Recording
                  </span>
                </div>
                <audio
                  controls
                  style={{
                    width: '100%',
                    height: '32px'
                  }}
                >
                  <source src={details.recording_url} type="audio/mpeg" />
                  Your browser does not support audio playback.
                </audio>
              </div>
            )}
          </div>
        </div>
      )
    }

    // Special rendering for tool_triggered
    if (item.action === 'tool_triggered' || item.action === 'tool_activated') {
      return (
        <div style={{
          marginTop: '0.75rem',
          padding: '0.75rem',
          background: '#1e293b',
          borderRadius: '0.375rem',
          border: '1px solid #334155'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
            {/* Tool Type */}
            {details.tool_type && (
              <div style={{ marginBottom: '0.5rem' }}>
                <strong style={{ color: '#94a3b8' }}>Type:</strong>{' '}
                <span style={{
                  padding: '0.125rem 0.5rem',
                  background: '#f59e0b20',
                  borderRadius: '0.25rem',
                  color: '#f59e0b',
                  fontSize: '0.75rem',
                  fontWeight: '500'
                }}>
                  {details.tool_type.toUpperCase()}
                </span>
              </div>
            )}

            {/* Relay Details (for ControlByWeb) */}
            {details.relay_number && (
              <div style={{ marginBottom: '0.5rem' }}>
                <strong style={{ color: '#94a3b8' }}>Relay:</strong> #{details.relay_number}
                {details.mode && (
                  <span style={{ marginLeft: '0.5rem', color: '#3b82f6' }}>
                    ({details.mode})
                  </span>
                )}
              </div>
            )}

            {/* Webhook Details */}
            {details.webhook_url && (
              <div style={{ marginBottom: '0.5rem' }}>
                <strong style={{ color: '#94a3b8' }}>Webhook:</strong>
                <div style={{
                  marginTop: '0.25rem',
                  padding: '0.5rem',
                  background: '#0f172a',
                  borderRadius: '0.25rem',
                  border: '1px solid #334155',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  color: '#3b82f6',
                  wordBreak: 'break-all'
                }}>
                  {details.webhook_method || 'POST'} {details.webhook_url}
                </div>
              </div>
            )}

            {/* Tool Description */}
            {details.tool_description && (
              <div style={{ marginBottom: '0.5rem' }}>
                <strong style={{ color: '#94a3b8' }}>Action:</strong> {details.tool_description}
              </div>
            )}

            {/* Result */}
            {details.result && (
              <div style={{
                marginTop: '0.5rem',
                padding: '0.5rem',
                background: details.result === 'success' ? '#10b98120' : '#ef444420',
                borderRadius: '0.25rem',
                color: details.result === 'success' ? '#10b981' : '#ef4444',
                fontWeight: '500'
              }}>
                Result: {details.result}
              </div>
            )}
          </div>
        </div>
      )
    }

    // Return null if no special rendering needed
    return null
  }

  if (loading) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        color: '#94a3b8'
      }}>
        Loading timeline...
      </div>
    )
  }

  if (timeline.length === 0) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        color: '#94a3b8'
      }}>
        No timeline events found
      </div>
    )
  }

  return (
    <div style={{
      padding: '1.5rem',
      maxHeight: 'calc(100vh - 200px)',
      overflowY: 'auto',
      width: '100%'
    }}>
      <h2 style={{
        fontSize: '1.25rem',
        fontWeight: '600',
        color: '#e2e8f0',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        <Clock size={22} />
        Event History
      </h2>

      {timeline.map((event) => {
        const isExpanded = expandedItems[event.id]
        const actionCount = event.actions?.length || 0

        return (
          <div key={event.id} style={{ marginBottom: '1.5rem', width: '100%' }}>
            {/* Main Event Card */}
            <div style={{
              background: '#1e293b',
              borderRadius: '0.5rem',
              border: `2px solid ${getActionColor(event.action)}`,
              overflow: 'hidden'
            }}>
              {/* Main Event Header - Clickable to expand/collapse */}
              <button
                onClick={() => toggleExpand(event.id)}
                style={{
                  width: '100%',
                  padding: '1rem 1.25rem',
                  background: 'transparent',
                  border: 'none',
                  cursor: actionCount > 0 ? 'pointer' : 'default',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'background 0.2s',
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => {
                  if (actionCount > 0) {
                    e.currentTarget.style.background = `${getActionColor(event.action)}10`
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                {/* Left side: Icon, title, metadata */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                  {/* Icon */}
                  <div style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: '50%',
                    background: '#0f172a',
                    border: `2px solid ${getActionColor(event.action)}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {getActionIcon(event.action)}
                  </div>

                  {/* Title and metadata */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '1rem',
                      fontWeight: '600',
                      color: '#e2e8f0',
                      marginBottom: '0.25rem'
                    }}>
                      {formatActionText(event)}
                    </div>
                    <div style={{
                      fontSize: '0.75rem',
                      color: '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      flexWrap: 'wrap'
                    }}>
                      <span>{formatDate(event.timestamp)} at {formatTime(event.timestamp)}</span>
                      {actionCount > 0 && (
                        <span style={{
                          padding: '0.125rem 0.5rem',
                          background: `${getActionColor(event.action)}30`,
                          borderRadius: '0.25rem',
                          color: getActionColor(event.action),
                          fontWeight: '500'
                        }}>
                          {actionCount} action{actionCount !== 1 ? 's' : ''} taken
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side: Expand/collapse indicator */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: getActionColor(event.action),
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  flexShrink: 0,
                  marginLeft: '1rem'
                }}>
                  {actionCount > 0 && (
                    <>
                      <span>{isExpanded ? 'Hide' : 'Show'} Details</span>
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </>
                  )}
                </div>
              </button>

              {/* Expandable Actions List */}
              {isExpanded && actionCount > 0 && (
                <div style={{
                  borderTop: `1px solid ${getActionColor(event.action)}30`,
                  background: '#0f172a',
                  padding: '1rem'
                }}>
                  {event.actions.map((item, index) => (
                    <div
                      key={item.id}
                      style={{
                        marginBottom: index === event.actions.length - 1 ? 0 : '0.75rem',
                        paddingLeft: '1rem',
                        borderLeft: `2px solid ${getActionColor(item.action)}`,
                        paddingTop: '0.5rem',
                        paddingBottom: '0.5rem'
                      }}
                    >
                      {/* Action Line */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '1rem'
                      }}>
                        {/* Left: Icon and text */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                          <div style={{
                            width: '1.5rem',
                            height: '1.5rem',
                            borderRadius: '50%',
                            background: '#1e293b',
                            border: `1px solid ${getActionColor(item.action)}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            {getActionIcon(item.action)}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: '0.875rem',
                              color: '#e2e8f0',
                              fontWeight: '500'
                            }}>
                              {formatActionText(item)}
                            </div>
                            {item.username && (
                              <div style={{
                                fontSize: '0.75rem',
                                color: '#94a3b8',
                                marginTop: '0.125rem'
                              }}>
                                by {item.username}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: Time and details button */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          flexShrink: 0
                        }}>
                          <div style={{
                            fontSize: '0.75rem',
                            color: '#94a3b8',
                            whiteSpace: 'nowrap'
                          }}>
                            {formatTime(item.timestamp)}
                          </div>
                          {hasDetails(item) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleExpand(item.id)
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                background: 'transparent',
                                border: `1px solid ${getActionColor(item.action)}60`,
                                borderRadius: '0.25rem',
                                padding: '0.25rem 0.5rem',
                                color: getActionColor(item.action),
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                whiteSpace: 'nowrap'
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.background = `${getActionColor(item.action)}20`
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.background = 'transparent'
                              }}
                            >
                              {expandedItems[item.id] ? (
                                <>
                                  <ChevronUp size={12} />
                                  <span>Hide</span>
                                </>
                              ) : (
                                <>
                                  <ChevronDown size={12} />
                                  <span>Details</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expandable item details */}
                      {expandedItems[item.id] && renderDetails(item)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default AlarmTimeline

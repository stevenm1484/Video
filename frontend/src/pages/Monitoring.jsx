import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import {
  AlertCircle, X, CheckCircle, Clock, Video as VideoIcon,
  PlayCircle, Users, Camera as CameraIcon, ArrowUpCircle, Power,
  ChevronLeft, ChevronRight
} from 'lucide-react'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import SnoozeButton from '../components/SnoozeButton'
import QuickToolsTrigger from '../components/QuickToolsTrigger'
import { formatTimestampInTimezone } from '../utils/timezone'

export default function Monitoring() {
  const [pendingGroups, setPendingGroups] = useState([]) // All unclaimed events
  const [onHoldGroups, setOnHoldGroups] = useState([]) // Events on hold
  const [activeGroup, setActiveGroup] = useState(null) // Current user's active event
  const [isReceiving, setIsReceiving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [holdSidebarCollapsed, setHoldSidebarCollapsed] = useState(false)
  const [pendingSidebarCollapsed, setPendingSidebarCollapsed] = useState(false)
  const [showAllHolds, setShowAllHolds] = useState(false) // Toggle between my holds and all holds
  const navigate = useNavigate()
  const currentUser = useAuthStore(state => state.user)
  const wsRef = React.useRef(null)

  useEffect(() => {
    // Auto-disable receiving on page load/refresh
    const autoDisableReceiving = async () => {
      try {
        const response = await api.post('/users/me/auto-disable-receiving?reason=page_refresh')
        // Update local state to match backend
        if (response.data.is_receiving !== undefined) {
          setIsReceiving(response.data.is_receiving)
        }
      } catch (error) {
        console.error('Failed to auto-disable receiving:', error)
      }
    }
    autoDisableReceiving()

    loadDashboardData()
    const cleanup = setupWebSocket()

    // Clear any existing notifications on component mount
    toast.dismiss()

    // Return cleanup function
    return () => {
      // Notify backend that we're leaving the dashboard
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'left_dashboard' }))
      }
      cleanup()
    }
  }, [])

  // Auto-disable receiving on tab blur/focus loss
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        // Tab lost focus - auto-disable receiving
        try {
          const response = await api.post('/users/me/auto-disable-receiving?reason=tab_blur')
          if (response.data.is_receiving !== undefined) {
            setIsReceiving(response.data.is_receiving)
          }
        } catch (error) {
          console.error('Failed to auto-disable receiving on tab blur:', error)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Auto-disable receiving when there's an active event, restore when it's gone
  useEffect(() => {
    const manageReceivingForActiveEvent = async () => {
      if (activeGroup && isReceiving) {
        // User has an active event and is receiving - auto-disable and save state
        try {
          const response = await api.post('/users/me/auto-disable-receiving?reason=active_event')
          if (response.data.is_receiving !== undefined) {
            setIsReceiving(response.data.is_receiving)
          }
          console.log('[Dashboard] Auto-disabled receiving due to active event')
        } catch (error) {
          console.error('Failed to auto-disable receiving for active event:', error)
        }
      } else if (!activeGroup && !isReceiving) {
        // No active event - try to restore previous receiving state
        try {
          const response = await api.post('/users/me/restore-receiving')
          if (response.data.restored && response.data.is_receiving !== undefined) {
            setIsReceiving(response.data.is_receiving)
            console.log('[Dashboard] Restored receiving state after event completion')
          }
        } catch (error) {
          console.error('Failed to restore receiving state:', error)
        }
      }
    }
    manageReceivingForActiveEvent()
  }, [activeGroup])

  // Set initial receiving status from user profile
  useEffect(() => {
    if (currentUser) {
      setIsReceiving(currentUser.is_receiving || false)
    }
  }, [currentUser])

  // Reload dashboard when showAllHolds toggle changes
  useEffect(() => {
    if (!loading) {
      loadDashboardData()
    }
  }, [showAllHolds])

  const loadDashboardData = async () => {
    try {
      const response = await api.get(`/dashboard-items?show_all_holds=${showAllHolds}`)
      const allGroups = response.data

      // Separate into 3 categories:
      // 1. On Hold - items where on_hold === true
      // 2. Active - claimed by current user
      // 3. Pending - unclaimed events (not on hold)
      const onHold = allGroups.filter(g => g.on_hold === true)
      const active = allGroups.find(g => g.claimed_by && g.claimed_by.user_id === currentUser.id)
      const pending = allGroups.filter(g => !g.claimed_by && !g.on_hold)

      // Sort pending by priority (lower number = higher priority = comes first)
      pending.sort((a, b) => {
        const priorityA = a.priority || 5  // Default to 5 if not set
        const priorityB = b.priority || 5
        return priorityA - priorityB  // Lower numbers come first
      })

      setOnHoldGroups(onHold)
      setPendingGroups(pending)
      setActiveGroup(active || null)
    } catch (error) {
      toast.error('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  const setupWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`
    console.log('[WebSocket] Connecting to:', wsUrl)
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[WebSocket] Connected successfully!')
      ws.send(JSON.stringify({ type: 'on_dashboard' }))
    }

    ws.onmessage = (event) => {
      console.log('[WebSocket] Received message:', event.data)
      const data = JSON.parse(event.data)

      if (data.type === 'new_event' || data.type === 'alarm_generated' ||
          data.type === 'event_dismissed' || data.type === 'alarm_resolved' ||
          data.type === 'alarm_reverted' || data.type === 'event_escalated' ||
          data.type === 'event_held' || data.type === 'event_unheld') {
        loadDashboardData()
      } else if (data.type === 'event_auto_assigned' || data.type === 'escalated_event_auto_assigned' || data.type === 'account_claimed') {
        // Event was auto-assigned or manually claimed
        loadDashboardData()
        if (data.user_id === currentUser.id) {
        }
      } else if (data.type === 'account_released') {
        loadDashboardData()
      } else if (data.type === 'operator_receiving_status_changed') {
        // Update receiving status if it's for the current user
        if (data.user_id === currentUser.id) {
          setIsReceiving(data.is_receiving)
        }
        console.log(`${data.username} is now ${data.is_receiving ? 'receiving' : 'not receiving'}`)
      }
    }

    ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error)
    }

    ws.onclose = () => {
      console.log('[WebSocket] Connection closed')
    }

    return () => {
      console.log('[WebSocket] Cleaning up connection')
      ws.close()
    }
  }

  const handleToggleReceiving = async () => {
    try {
      const newStatus = !isReceiving
      await api.put(`/users/me/receiving-status?is_receiving=${newStatus}`)
      setIsReceiving(newStatus)
    } catch (error) {
      toast.error('Failed to toggle receiving status')
    }
  }

  const handleClaimPending = async (accountId) => {
    try {
      await api.post(`/accounts/${accountId}/claim`)
      // Reload dashboard to move from pending to active
      loadDashboardData()
    } catch (error) {
      if (error.response?.status === 409) {
        toast.error(error.response.data.detail)
      } else {
        toast.error('Failed to claim event')
      }
    }
  }

  const handleUnholdEvent = async (eventId) => {
    try {
      await api.put(`/events/${eventId}/unhold`)
      // Reload dashboard after unholding
      loadDashboardData()
    } catch (error) {
      if (error.response?.status === 400 || error.response?.status === 404) {
        toast.error(error.response.data.detail)
      } else {
        toast.error('Failed to unhold event')
      }
    }
  }

  const handleSimulateTestAlarm = async () => {
    try {
      const response = await api.post('/test/simulate-alarm')
    } catch (error) {
      toast.error('Failed to create test alarm')
      console.error('Test alarm error:', error)
    }
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div style={styles.pageContainer}>
      {/* Header with Simulate Test Alarm (left) and Receiving Toggle (right) */}
      <div style={styles.header}>
        <div style={styles.headerTop}>
          <button style={styles.testBtn} onClick={handleSimulateTestAlarm}>
            <PlayCircle size={18} />
            <span>Simulate Test Alarm</span>
          </button>
          <div style={styles.receivingToggle}>
            <button
              style={{
                ...styles.toggleBtn,
                ...(isReceiving ? styles.toggleBtnOn : styles.toggleBtnOff)
              }}
              onClick={handleToggleReceiving}
            >
              <Power size={20} />
              <span>{isReceiving ? 'RECEIVING' : 'NOT RECEIVING'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content with 3-Column Layout */}
      <div style={styles.layoutContainer}>
        {/* Left Sidebar - Hold Events */}
        <div style={{
          ...styles.sidebar,
          width: holdSidebarCollapsed ? '80px' : '16.666%' // 1/6 of screen
        }}>
          {holdSidebarCollapsed ? (
            /* Collapsed View */
            <div style={styles.collapsedSidebar}>
              <button
                style={styles.collapsedToggleBtn}
                onClick={() => setHoldSidebarCollapsed(false)}
                title="Expand Hold sidebar"
              >
                <ChevronRight size={20} />
              </button>
              <div style={styles.collapsedContent}>
                <div style={styles.collapsedTitle}>Hold</div>
                <div style={styles.collapsedCount}>{onHoldGroups.length}</div>
              </div>
            </div>
          ) : (
            <>
              {/* Collapse Toggle Button */}
              <button
                style={styles.collapseBtn}
                onClick={() => setHoldSidebarCollapsed(true)}
                title="Collapse sidebar"
              >
                <ChevronLeft size={20} />
              </button>

              <div style={styles.sidebarHeader}>
                <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <h3 style={styles.sidebarTitle}>Hold</h3>
                    <span style={styles.sidebarCount}>{onHoldGroups.length}</span>
                  </div>
                  <div style={styles.toggleSwitchContainer}>
                    <span style={{...styles.toggleSwitchLabel, color: !showAllHolds ? '#10b981' : '#64748b'}}>My Holds</span>
                    <button
                      style={{
                        ...styles.toggleSwitch,
                        background: showAllHolds ? '#10b981' : '#475569'
                      }}
                      onClick={() => setShowAllHolds(!showAllHolds)}
                    >
                      <div style={{
                        ...styles.toggleSwitchKnob,
                        transform: showAllHolds ? 'translateX(20px)' : 'translateX(2px)'
                      }}></div>
                    </button>
                    <span style={{...styles.toggleSwitchLabel, color: showAllHolds ? '#10b981' : '#64748b'}}>All Holds</span>
                  </div>
                </div>
              </div>
              <div style={styles.pendingList}>
                {onHoldGroups.length === 0 ? (
                  <div style={styles.emptyPendingSidebar}>
                    <CheckCircle size={32} color="#10b981" />
                    <p>No holds</p>
                  </div>
                ) : (
                  onHoldGroups.map(group => (
                    <HoldSidebarCard
                      key={group.account_id}
                      group={group}
                      onUnhold={handleUnholdEvent}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* Main Content Area - Active Event */}
        <div style={styles.mainContent}>
          {activeGroup ? (
            <ActiveEventCard
              group={activeGroup}
              currentUser={currentUser}
              onReload={loadDashboardData}
            />
          ) : (
            <div style={styles.emptyActive}>
              <Clock size={48} color="#64748b" />
              <p>No active event</p>
              <p style={styles.emptyHint}>
                {isReceiving
                  ? 'Waiting for next event...'
                  : 'Click a pending event or enable Receiving mode'}
              </p>
            </div>
          )}
        </div>

        {/* Right Sidebar - Pending Events */}
        <div style={{
          ...styles.sidebar,
          width: pendingSidebarCollapsed ? '80px' : '16.666%' // 1/6 of screen
        }}>
          {pendingSidebarCollapsed ? (
            /* Collapsed View */
            <div style={styles.collapsedSidebar}>
              <button
                style={styles.collapsedToggleBtn}
                onClick={() => setPendingSidebarCollapsed(false)}
                title="Expand Pending sidebar"
              >
                <ChevronLeft size={20} />
              </button>
              <div style={styles.collapsedContent}>
                <div style={styles.collapsedTitle}>Pending</div>
                <div style={styles.collapsedCount}>{pendingGroups.length}</div>
              </div>
            </div>
          ) : (
            <>
              {/* Collapse Toggle Button */}
              <button
                style={styles.collapseBtn}
                onClick={() => setPendingSidebarCollapsed(true)}
                title="Collapse sidebar"
              >
                <ChevronRight size={20} />
              </button>

              <div style={styles.sidebarHeader}>
                <h3 style={styles.sidebarTitle}>Pending</h3>
                <span style={styles.sidebarCount}>{pendingGroups.length}</span>
              </div>
              <div style={styles.pendingList}>
                {pendingGroups.length === 0 ? (
                  <div style={styles.emptyPendingSidebar}>
                    <CheckCircle size={32} color="#10b981" />
                    <p>No pending</p>
                  </div>
                ) : (
                  pendingGroups.map(group => (
                    <PendingSidebarCard
                      key={group.account_id}
                      group={group}
                      onClaim={handleClaimPending}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Hold Sidebar Card - compact vertical card for hold sidebar
function HoldSidebarCard({ group, onUnhold }) {
  const [isHovering, setIsHovering] = React.useState(false)
  const videoRef = React.useRef(null)
  const firstEvent = group.events[0]
  const mediaPaths = firstEvent?.media_paths || []
  const hasMedia = mediaPaths.length > 0
  const isVideo = firstEvent?.media_type === 'video' || mediaPaths[0]?.endsWith('.mp4')

  // Get hold notes from the first event's notes field and extract just the user's notes
  const rawNotes = firstEvent?.notes || ''

  // Extract just the "Hold notes:" parts from the formatted text
  const holdNotes = React.useMemo(() => {
    if (!rawNotes) return ''

    // Split by lines and extract only the "Hold notes:" lines
    const lines = rawNotes.split('\n')
    const noteLines = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.startsWith('Hold notes:')) {
        // Extract everything after "Hold notes: "
        noteLines.push(line.substring('Hold notes:'.length).trim())
      }
    }

    // Join multiple hold notes with line breaks
    return noteLines.join('\n')
  }, [rawNotes])

  const handleMouseEnter = () => {
    setIsHovering(true)
    if (isVideo && videoRef.current) {
      videoRef.current.play()
    }
  }

  const handleMouseLeave = () => {
    setIsHovering(false)
    if (isVideo && videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }

  return (
    <div
      style={{...styles.pendingSidebarCard, position: 'relative'}}
      onClick={() => onUnhold(firstEvent.id)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div style={{...styles.pendingSidebarMedia, position: 'relative'}}>
        {hasMedia ? (
          isVideo ? (
            <video
              ref={videoRef}
              src={`/${mediaPaths[0]}`}
              style={styles.sidebarMediaElement}
              muted
              loop
            />
          ) : (
            <img
              src={`/${mediaPaths[0]}`}
              alt="Event"
              style={styles.sidebarMediaElement}
            />
          )
        ) : (
          <div style={styles.sidebarNoMedia}>No media</div>
        )}

        {/* Event/Camera count badges overlay */}
        <div style={styles.sidebarBadgeOverlay}>
          <div style={styles.sidebarBadgeOverlayItem}>
            <AlertCircle size={10} />
            <span>{group.event_count}</span>
          </div>
          <div style={styles.sidebarBadgeOverlayItem}>
            <CameraIcon size={10} />
            <span>{group.camera_count}</span>
          </div>
        </div>

        {/* Hold Notes Tooltip - shown on hover over the video */}
        {isHovering && holdNotes && (
          <div style={styles.holdNotesTooltipOverlay}>
            <div style={styles.holdNotesTooltipHeader}>Hold Notes:</div>
            <div style={styles.holdNotesTooltipContent}>{holdNotes}</div>
          </div>
        )}
      </div>
      <div style={styles.pendingSidebarInfo}>
        <div style={styles.sidebarAccountName}>{group.account_name}</div>
      </div>
    </div>
  )
}

// Pending Sidebar Card - compact vertical card for sidebar
function PendingSidebarCard({ group, onClaim }) {
  const firstEvent = group.events[0]
  const mediaPaths = firstEvent?.media_paths || []
  const hasMedia = mediaPaths.length > 0

  return (
    <div style={styles.pendingSidebarCard} onClick={() => onClaim(group.account_id)}>
      <div style={{...styles.pendingSidebarMedia, position: 'relative'}}>
        {hasMedia ? (
          firstEvent.media_type === 'video' || mediaPaths[0]?.endsWith('.mp4') ? (
            <video
              src={`/${mediaPaths[0]}`}
              style={styles.sidebarMediaElement}
              autoPlay
              muted
              loop
            />
          ) : (
            <img
              src={`/${mediaPaths[0]}`}
              alt="Event"
              style={styles.sidebarMediaElement}
            />
          )
        ) : (
          <div style={styles.sidebarNoMedia}>No media</div>
        )}

        {/* Event/Camera count badges overlay */}
        <div style={styles.sidebarBadgeOverlay}>
          <div style={styles.sidebarBadgeOverlayItem}>
            <AlertCircle size={10} />
            <span>{group.event_count}</span>
          </div>
          <div style={styles.sidebarBadgeOverlayItem}>
            <CameraIcon size={10} />
            <span>{group.camera_count}</span>
          </div>
        </div>
      </div>
      <div style={styles.pendingSidebarInfo}>
        <div style={styles.sidebarAccountName}>{group.account_name}</div>
      </div>
    </div>
  )
}

// Active Event Card - full-featured card matching current dashboard functionality
function ActiveEventCard({ group, currentUser, onReload }) {
  const navigate = useNavigate()
  const [selectedEventIndex, setSelectedEventIndex] = useState(0)
  const [viewedEvents, setViewedEvents] = useState(new Set([0]))
  const [liveStreamUrl, setLiveStreamUrl] = useState(null)
  const [streamLoading, setStreamLoading] = useState(false)
  const [showEscalateModal, setShowEscalateModal] = useState(false)
  const [escalateNotes, setEscalateNotes] = useState('')
  const videoRef = React.useRef(null)
  const hlsRef = React.useRef(null)

  const selectedEvent = group.events[selectedEventIndex]
  const mediaPaths = selectedEvent?.media_paths || []
  const hasMedia = mediaPaths.length > 0
  const allEventsViewed = viewedEvents.size === group.events.length

  // Start live stream when component mounts
  useEffect(() => {
    if (selectedEvent && selectedEvent.camera_id) {
      // Small delay to ensure video element is rendered
      const timer = setTimeout(() => {
        startLiveStream(selectedEvent.camera_id)
      }, 100)

      return () => {
        clearTimeout(timer)
        if (hlsRef.current) {
          hlsRef.current.destroy()
          hlsRef.current = null
        }
      }
    }

    // Cleanup on unmount
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [selectedEvent?.camera_id])

  const startLiveStream = async (cameraId) => {
    console.log('[LiveStream] Starting stream for camera ID:', cameraId)
    setStreamLoading(true)
    try {
      const response = await api.post(`/cameras/${cameraId}/start-stream`)
      console.log('[LiveStream] Stream response:', response.data)
      const streamUrl = response.data.stream_url
      setLiveStreamUrl(streamUrl)

      // Wait for video element to be available
      if (!videoRef.current) {
        console.error('[LiveStream] Video element not available')
        setStreamLoading(false)
        return
      }

      // Initialize HLS.js
      if (window.Hls && window.Hls.isSupported()) {
        console.log('[LiveStream] Initializing HLS.js with URL:', streamUrl)
        const hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90
        })
        hlsRef.current = hls
        hls.loadSource(streamUrl)
        hls.attachMedia(videoRef.current)

        // Add event listener to hide spinner only when video actually starts playing
        videoRef.current.addEventListener('playing', () => {
          console.log('[LiveStream] Video is now playing')
          setStreamLoading(false)

          // Start capturing after stream is confirmed playing (5 second delay to ensure RTSP is stable)
          setTimeout(() => {
            if (selectedEvent && selectedEvent.id) {
              console.log(`[Monitoring] Starting capture for event ${selectedEvent.id}, camera ${cameraId}`)
              api.post(`/events/${selectedEvent.id}/start-capture`, null, {
                params: {
                  camera_id: cameraId
                }
              }).catch(err => {
                console.error('[Monitoring] Failed to start capture:', err)
              })
            }
          }, 5000)
        }, { once: true })

        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          console.log('[LiveStream] HLS manifest parsed, starting playback')
          videoRef.current.play().catch(err => {
            console.log('[LiveStream] Autoplay prevented:', err)
            setStreamLoading(false)
          })
        })
        hls.on(window.Hls.Events.ERROR, (event, data) => {
          console.error('[LiveStream] HLS error:', data)
          if (data.fatal) {
            console.error('[LiveStream] HLS fatal error, stopping')
            setStreamLoading(false)
          }
        })
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        console.log('[LiveStream] Using native HLS support')
        videoRef.current.src = streamUrl

        // Add event listener to hide spinner only when video actually starts playing
        videoRef.current.addEventListener('playing', () => {
          console.log('[LiveStream] Video is now playing')
          setStreamLoading(false)

          // Start capturing after stream is confirmed playing (5 second delay to ensure RTSP is stable)
          setTimeout(() => {
            if (selectedEvent && selectedEvent.id) {
              console.log(`[Monitoring] Starting capture for event ${selectedEvent.id}, camera ${cameraId}`)
              api.post(`/events/${selectedEvent.id}/start-capture`, null, {
                params: {
                  camera_id: cameraId
                }
              }).catch(err => {
                console.error('[Monitoring] Failed to start capture:', err)
              })
            }
          }, 5000)
        }, { once: true })

        videoRef.current.addEventListener('loadedmetadata', () => {
          console.log('[LiveStream] Video metadata loaded, starting playback')
          videoRef.current.play().catch(err => {
            console.log('[LiveStream] Autoplay prevented:', err)
            setStreamLoading(false)
          })
        })
      } else {
        console.error('[LiveStream] HLS not supported')
        setStreamLoading(false)
      }
    } catch (error) {
      console.error('[LiveStream] Failed to start:', error)
      console.error('[LiveStream] Error details:', error.response?.data || error.message)
      setStreamLoading(false)
    }
  }

  const handleEventClick = (index) => {
    setViewedEvents(prev => new Set([...prev, index]))
    setSelectedEventIndex(index)
  }

  const handleDismissAll = async () => {
    if (!allEventsViewed) {
      toast.warning('Please view all events before dismissing')
      return
    }

    // Check if user can override eyes on requirement
    const canOverride = currentUser && ['admin', 'supervisor', 'super_admin', 'super_admin'].includes(currentUser.role)
    const eventNeedingOverride = group.events.find(evt => {
      const eyesOnRequired = evt.eyes_on_required || 1
      const eyesOnCurrent = evt.eyes_on_current || 0
      return eyesOnRequired > 1 && eyesOnCurrent < eyesOnRequired
    })

    if (canOverride && eventNeedingOverride) {
      const eyesOnRequired = eventNeedingOverride.eyes_on_required || 1
      const eyesOnCurrent = eventNeedingOverride.eyes_on_current || 0
      const confirmed = window.confirm(
        `This account has ${eyesOnRequired} eyes on requirement, but only ${eyesOnCurrent} have reviewed it. Do you want to override this?\n\nClicking Yes will dismiss all events.`
      )
      if (!confirmed) return
    }

    try {
      // Stop capture before dismissing
      if (selectedEvent && selectedEvent.camera_id) {
        await api.post(`/events/${selectedEvent.id}/stop-capture`, null, {
          params: {
            camera_id: selectedEvent.camera_id
          }
        }).catch(err => console.error('Failed to stop capture:', err))
      }

      for (const event of group.events) {
        if (event.type === 'alarm' && event.alarm_id) {
          await api.put(`/alarms/${event.alarm_id}/resolve`, {
            notes: '',
            resolution: 'Video False'
          })
        } else {
          await api.put(`/events/${event.id}/dismiss`)
        }
      }

      // Release claim
      await api.post(`/accounts/${group.account_id}/release`)
      onReload()
    } catch (error) {
      if (error.response?.status === 400 && error.response?.data?.detail) {
        toast.error(error.response.data.detail)
      } else {
        toast.error('Failed to dismiss events')
      }
    }
  }

  const handleGenerateAlarm = async () => {
    try {
      // Auto-disable receiving before navigating to alarm detail
      try {
        const response = await api.post('/users/me/auto-disable-receiving?reason=alarm_navigation')
        if (response.data.is_receiving !== undefined) {
          setIsReceiving(response.data.is_receiving)
        }
      } catch (error) {
        console.error('Failed to auto-disable receiving on alarm navigation:', error)
      }

      // Check if current selected event already has an alarm
      if (selectedEvent.type === 'alarm' && selectedEvent.alarm_id) {
        // Navigate directly to existing alarm
        navigate(`/alarm/${selectedEvent.alarm_id}`, { state: { liveStreamUrl } })
      } else {
        // Generate new alarm for this event
        const response = await api.post(`/events/${selectedEvent.id}/generate-alarm`, {
          notes: ''
        })
        // Navigate with state to pass the existing stream URL
        navigate(`/alarm/${response.data.id}`, { state: { liveStreamUrl } })
      }
    } catch (error) {
      toast.error('Failed to generate alarm')
    }
  }

  const handleEscalate = () => {
    setShowEscalateModal(true)
  }

  const handleConfirmEscalate = async () => {
    try {
      // Stop capture before escalating
      if (selectedEvent && selectedEvent.camera_id) {
        await api.post(`/events/${selectedEvent.id}/stop-capture`, null, {
          params: {
            camera_id: selectedEvent.camera_id
          }
        }).catch(err => console.error('Failed to stop capture:', err))
      }

      const notesToSend = escalateNotes.trim() || undefined
      await api.put(`/events/${selectedEvent.id}/escalate`, {
        notes: notesToSend
      })
      setShowEscalateModal(false)
      setEscalateNotes('')
      onReload()
    } catch (error) {
      if (error.response?.status === 400 && error.response?.data?.detail) {
        toast.error(error.response.data.detail)
      } else {
        toast.error('Failed to escalate event')
      }
    }
  }

  const handleCancelEscalate = () => {
    setShowEscalateModal(false)
    setEscalateNotes('')
  }

  return (
    <div style={styles.activeCard}>
      {/* Account Header */}
      <div style={styles.activeHeader}>
        <div style={styles.activeAccountInfo}>
          <div style={styles.activeAccountNumber}>{group.account_number}</div>
          <div style={styles.activeAccountName}>{group.account_name}</div>
        </div>
        <div style={styles.activeBadges}>
          <div style={styles.activeBadge}>
            <AlertCircle size={16} />
            <span>{group.event_count} event{group.event_count > 1 ? 's' : ''}</span>
          </div>
          <div style={styles.activeBadge}>
            <CameraIcon size={16} />
            <span>{group.camera_count} camera{group.camera_count > 1 ? 's' : ''}</span>
          </div>
          <div style={styles.activeBadge}>
            <VideoIcon size={16} />
            <span>{group.total_media_count} clip{group.total_media_count > 1 ? 's' : ''}</span>
          </div>
          {selectedEvent && selectedEvent.eyes_on_required > 1 && (
            <div style={{...styles.activeBadge, background: '#3b82f6'}} title="Eyes On">
              <Users size={16} />
              <span>{selectedEvent.eyes_on_current || 0}/{selectedEvent.eyes_on_required}</span>
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      {group.events.length > 1 && (
        <div style={styles.activeTimeline}>
          {group.events.map((evt, idx) => (
            <div
              key={evt.id}
              style={{
                ...styles.timelineItem,
                ...(selectedEventIndex === idx ? styles.timelineItemActive : {}),
                ...(viewedEvents.has(idx) ? styles.timelineItemViewed : {})
              }}
              onClick={() => handleEventClick(idx)}
            >
              <div style={styles.timelineIcon}>
                {evt.type === 'alarm' ? <AlertCircle size={12} /> : <Clock size={12} />}
              </div>
              <div style={styles.timelineText}>
                <div style={styles.timelineCamera}>{evt.camera_name}</div>
                <div style={styles.timelineTime}>
                  {formatTimestampInTimezone(evt.timestamp, group.account_timezone, { showDate: false, showTime: true })}
                </div>
              </div>
              <div style={styles.timelineBadge}>{evt.media_count}</div>
              {viewedEvents.has(idx) && (
                <div style={styles.viewedCheckmark}>
                  <CheckCircle size={12} color="#10b981" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Event Display */}
      {selectedEvent && (
        <>
          <div style={styles.activeEventHeader}>
            <div style={styles.activeEventTitle}>
              <AlertCircle size={18} color={selectedEvent.type === 'alarm' ? "#f59e0b" : "#ef4444"} />
              <span>
                {selectedEvent.type === 'alarm' ? `Alarm #${selectedEvent.alarm_id}` : `Event #${selectedEvent.id}`}
              </span>
            </div>
            <div style={styles.activeEventMeta}>
              <CameraIcon size={14} />
              <span>{selectedEvent.camera_name}</span>
            </div>
          </div>

          {/* Media Display - Live + Recorded Side by Side */}
          <div style={styles.mediaGrid}>
            {/* Live Video */}
            <div style={styles.mediaSection}>
              <div style={styles.mediaLabel}>
                <span style={styles.liveDot}></span>
                <span>LIVE</span>
              </div>
              <div style={styles.mediaBox}>
                <video
                  ref={videoRef}
                  style={{
                    ...styles.media,
                    display: (streamLoading || !liveStreamUrl) ? 'none' : 'block'
                  }}
                  muted
                  playsInline
                />
                {streamLoading && (
                  <div style={styles.streamLoading}>
                    <div style={styles.spinner}></div>
                    <p>Loading stream...</p>
                  </div>
                )}
                {!streamLoading && !liveStreamUrl && (
                  <div style={styles.noStream}>Live stream unavailable</div>
                )}
              </div>
            </div>

            {/* Recorded Clip */}
            <div style={styles.mediaSection}>
              <div style={styles.mediaLabel}>RECORDED</div>
              <div style={styles.mediaBox}>
                {hasMedia ? (
                  selectedEvent.media_type === 'video' || mediaPaths[0]?.endsWith('.mp4') ? (
                    <video
                      src={`/${mediaPaths[0]}`}
                      style={styles.media}
                      controls
                      autoPlay
                      muted
                      loop
                    />
                  ) : (
                    <img
                      src={`/${mediaPaths[0]}`}
                      alt="Alarm"
                      style={styles.media}
                    />
                  )
                ) : selectedEvent.media_type === 'alert' ? (
                  <div style={styles.vitalSignsAlert}>
                    <AlertCircle size={48} color="#ef4444" />
                    <div style={styles.vitalSignsTitle}>Video Loss Detected</div>
                    <div style={styles.vitalSignsMessage}>
                      Camera connectivity failure
                    </div>
                    <div style={styles.vitalSignsTimestamp}>
                      Last detected: {formatTimestampInTimezone(selectedEvent.timestamp, group.account_timezone, { showTimezone: true })}
                    </div>
                  </div>
                ) : (
                  <div style={styles.noStream}>No media available</div>
                )}
              </div>
            </div>
          </div>

          {/* Event Info */}
          <div style={styles.activeInfo}>
            <div style={styles.activeInfoRow}>
              <span style={styles.activeInfoLabel}>Camera:</span>
              <span style={styles.activeInfoValue}>{selectedEvent.camera_name}</span>
            </div>
            <div style={styles.activeInfoRow}>
              <span style={styles.activeInfoLabel}>Location:</span>
              <span style={styles.activeInfoValue}>{selectedEvent.camera_location || 'N/A'}</span>
            </div>
            <div style={styles.activeInfoRow}>
              <span style={styles.activeInfoLabel}>Time:</span>
              <span style={styles.activeInfoValue}>
                {formatTimestampInTimezone(selectedEvent.timestamp, group.account_timezone, { showTimezone: true })}
              </span>
            </div>
            {selectedEvent.notes && (
              <div style={styles.activeNotesSection}>
                <span style={styles.activeNotesLabel}>Notes:</span>
                <div style={styles.activeNotesContent}>
                  {selectedEvent.notes}
                </div>
              </div>
            )}
          </div>

          {/* Quick Tools Trigger Panel */}
          <QuickToolsTrigger accountId={group.account_id} />
        </>
      )}

      {/* Actions */}
      {selectedEvent && (
        <div style={styles.activeActions}>
          {selectedEvent.eyes_on_required > 1 && (
            <button style={styles.eyesOnBtn} title={`Eyes On: ${selectedEvent.eyes_on_current || 0}/${selectedEvent.eyes_on_required}`}>
              <Users size={18} />
              <span>Eyes On</span>
            </button>
          )}
          <SnoozeButton
            type="camera"
            id={selectedEvent.camera_id}
            snoozedUntil={selectedEvent.camera_snoozed_until}
            onSnoozeUpdate={onReload}
            buttonStyle={{ flex: 1, padding: '0.75rem' }}
            showLabel={true}
          />
          {/* Only show dismiss button if allow_dismiss is true (or undefined/null for backward compatibility) */}
          {group.allow_dismiss !== false && (
            <button
              style={{
                ...styles.dismissBtn,
                ...(allEventsViewed ? {} : styles.dismissBtnDisabled)
              }}
              onClick={handleDismissAll}
              disabled={!allEventsViewed}
              title={allEventsViewed ? "Dismiss all events" : `View all events first (${viewedEvents.size}/${group.events.length})`}
            >
              <X size={18} />
              <span>Dismiss</span>
            </button>
          )}
          {selectedEvent.type !== 'alarm' && (
            <button style={styles.escalateBtn} onClick={handleEscalate} title="Escalate">
              <ArrowUpCircle size={18} />
              <span>Escalate</span>
            </button>
          )}
          <button style={styles.alarmBtn} onClick={handleGenerateAlarm} title="Generate Alarm">
            <AlertCircle size={18} />
            <span>Alarm</span>
          </button>
        </div>
      )}

      {/* Escalate Modal */}
      {showEscalateModal && (
        <div style={styles.modalOverlay} onClick={handleCancelEscalate}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Escalate Event</h3>
              <button style={styles.modalCloseBtn} onClick={handleCancelEscalate}>
                <X size={20} />
              </button>
            </div>
            <div style={styles.modalBody}>
              <label style={styles.modalLabel}>Add notes for escalation (optional):</label>
              <textarea
                style={styles.modalTextarea}
                placeholder="Describe why this event needs escalation..."
                value={escalateNotes}
                onChange={(e) => setEscalateNotes(e.target.value)}
                rows={5}
                autoFocus
              />
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.modalCancelBtn} onClick={handleCancelEscalate}>
                Cancel
              </button>
              <button style={styles.modalConfirmBtn} onClick={handleConfirmEscalate}>
                <ArrowUpCircle size={18} />
                <span>Escalate</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  pageContainer: {
    width: '100%',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  },
  layoutContainer: {
    display: 'flex',
    flex: 1,
    gap: '1rem',
    padding: '0 1.5rem 1.5rem 1.5rem',
    overflow: 'hidden',
    alignItems: 'flex-start'
  },
  mainContent: {
    flex: 1,
    overflow: 'auto'
  },
  sidebar: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    transition: 'width 0.3s ease',
    overflow: 'hidden'
  },
  collapseBtn: {
    position: 'absolute',
    top: '50%',
    right: '-18px',
    transform: 'translateY(-50%)',
    background: '#334155',
    border: '2px solid #1e293b',
    borderRadius: '50%',
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#e2e8f0',
    cursor: 'pointer',
    transition: 'all 0.2s',
    zIndex: 10
  },
  sidebarHeader: {
    padding: '1rem 1rem 1rem 1rem',
    borderBottom: '1px solid #334155',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: '60px'
  },
  sidebarTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#e2e8f0',
    margin: 0
  },
  sidebarCount: {
    background: '#ef4444',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '700',
    padding: '0.25rem 0.6rem',
    borderRadius: '9999px'
  },
  pendingList: {
    flex: 1,
    overflowY: 'auto',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  emptyPendingSidebar: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1rem',
    gap: '0.5rem',
    color: '#94a3b8',
    fontSize: '0.875rem'
  },
  pendingSidebarCard: {
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '2px solid #334155',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  pendingSidebarMedia: {
    width: '100%',
    height: '150px',
    background: '#000'
  },
  sidebarMediaElement: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  sidebarNoMedia: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#64748b',
    fontSize: '0.75rem'
  },
  pendingSidebarInfo: {
    padding: '0.5rem 0.75rem',
    minHeight: '2.5rem',
    display: 'flex',
    alignItems: 'center'
  },
  sidebarAccountName: {
    fontSize: '0.85rem',
    fontWeight: '600',
    color: '#e2e8f0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  sidebarBadgeOverlay: {
    position: 'absolute',
    top: '0.5rem',
    right: '0.5rem',
    display: 'flex',
    gap: '0.25rem',
    zIndex: 5
  },
  sidebarBadgeOverlayItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    background: 'rgba(51, 65, 85, 0.9)',
    backdropFilter: 'blur(4px)',
    padding: '0.25rem 0.5rem',
    borderRadius: '9999px',
    fontSize: '0.65rem',
    color: '#e2e8f0',
    fontWeight: '600',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
  },
  header: {
    padding: '1rem 1.5rem 1rem 1.5rem'
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
  headerTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%'
  },
  receivingToggle: {
    display: 'flex',
    alignItems: 'center'
  },
  toggleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1.5rem',
    border: 'none',
    borderRadius: '0.5rem',
    fontWeight: '700',
    fontSize: '1rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
  },
  toggleBtnOn: {
    background: '#10b981',
    color: '#fff'
  },
  toggleBtnOff: {
    background: '#64748b',
    color: '#fff'
  },
  testBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.5rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    fontSize: '0.9rem',
    cursor: 'pointer',
    transition: 'background 0.2s',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
  },
  section: {
    marginBottom: 0
  },
  sectionCount: {
    marginLeft: '0.5rem',
    color: '#94a3b8',
    fontWeight: '400'
  },
  emptyActive: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem',
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    gap: '1rem',
    color: '#94a3b8'
  },
  emptyHint: {
    fontSize: '0.9rem',
    color: '#64748b',
    margin: 0
  },
  activeCard: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '2px solid #10b981',
    overflow: 'hidden',
    boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3)'
  },
  activeHeader: {
    padding: '1rem',
    borderBottom: '1px solid #334155',
    background: '#0f172a',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  activeAccountInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  activeAccountNumber: {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#10b981'
  },
  activeAccountName: {
    fontSize: '0.875rem',
    color: '#94a3b8'
  },
  activeBadges: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap'
  },
  activeBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    background: '#334155',
    padding: '0.25rem 0.6rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    color: '#cbd5e1'
  },
  activeTimeline: {
    display: 'flex',
    overflowX: 'auto',
    gap: '0.5rem',
    padding: '0.75rem',
    background: '#0f172a',
    borderBottom: '1px solid #334155'
  },
  timelineItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.5rem',
    background: '#1e293b',
    borderRadius: '0.5rem',
    border: '2px solid transparent',
    minWidth: '100px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    position: 'relative'
  },
  timelineItemActive: {
    border: '2px solid #3b82f6',
    background: '#334155'
  },
  timelineItemViewed: {
    opacity: 0.7
  },
  viewedCheckmark: {
    position: 'absolute',
    top: '0.25rem',
    right: '0.25rem'
  },
  timelineIcon: {
    color: '#94a3b8'
  },
  timelineText: {
    textAlign: 'center',
    width: '100%'
  },
  timelineCamera: {
    fontSize: '0.7rem',
    fontWeight: '600',
    color: '#e2e8f0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  timelineTime: {
    fontSize: '0.65rem',
    color: '#64748b'
  },
  timelineBadge: {
    background: '#3b82f6',
    color: '#fff',
    fontSize: '0.65rem',
    fontWeight: '700',
    padding: '0.125rem 0.375rem',
    borderRadius: '9999px'
  },
  activeEventHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #334155'
  },
  activeEventTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontWeight: '600',
    fontSize: '0.9rem',
    color: '#e2e8f0'
  },
  activeEventMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    color: '#94a3b8'
  },
  mediaGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem',
    padding: '1rem',
    background: '#0f172a'
  },
  mediaSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  mediaLabel: {
    fontSize: '0.75rem',
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  liveDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#ef4444',
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
  },
  mediaBox: {
    width: '100%',
    height: '250px',
    background: '#000',
    borderRadius: '0.5rem',
    overflow: 'hidden',
    position: 'relative'
  },
  media: {
    width: '100%',
    height: '100%',
    objectFit: 'contain'
  },
  noStream: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#64748b',
    fontSize: '0.875rem'
  },
  streamLoading: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    color: '#94a3b8'
  },
  activeInfo: {
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  activeInfoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.9rem'
  },
  activeInfoLabel: {
    color: '#94a3b8'
  },
  activeInfoValue: {
    color: '#e2e8f0',
    fontWeight: '500'
  },
  activeNotesSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginTop: '0.5rem',
    paddingTop: '0.5rem',
    borderTop: '1px solid #334155'
  },
  activeNotesLabel: {
    color: '#94a3b8',
    fontSize: '0.875rem',
    fontWeight: '600'
  },
  activeNotesContent: {
    color: '#e2e8f0',
    fontSize: '0.875rem',
    background: '#0f172a',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    border: '1px solid #334155',
    whiteSpace: 'pre-wrap',
    lineHeight: '1.5'
  },
  activeActions: {
    padding: '1rem',
    display: 'flex',
    gap: '0.75rem',
    borderTop: '1px solid #334155'
  },
  dismissBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    background: '#64748b',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  dismissBtnDisabled: {
    background: '#475569',
    color: '#94a3b8',
    cursor: 'not-allowed',
    opacity: 0.5
  },
  escalateBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    background: '#f59e0b',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  alarmBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    background: '#ef4444',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  eyesOnBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  // Modal styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    width: '90%',
    maxWidth: '500px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.5rem',
    borderBottom: '1px solid #334155'
  },
  modalTitle: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#e2e8f0'
  },
  modalCloseBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    transition: 'color 0.2s'
  },
  modalBody: {
    padding: '1.5rem'
  },
  modalLabel: {
    display: 'block',
    marginBottom: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#cbd5e1'
  },
  modalTextarea: {
    width: '100%',
    padding: '0.75rem',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    resize: 'vertical',
    minHeight: '120px'
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    padding: '1.5rem',
    borderTop: '1px solid #334155'
  },
  modalCancelBtn: {
    padding: '0.75rem 1.5rem',
    background: '#475569',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  modalConfirmBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.5rem',
    background: '#f59e0b',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  toggleViewBtn: {
    padding: '0.5rem 0.75rem',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
    width: '100%'
  },
  toggleSwitchContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem'
  },
  toggleSwitchLabel: {
    fontSize: '0.7rem',
    fontWeight: '600',
    transition: 'color 0.2s'
  },
  toggleSwitch: {
    position: 'relative',
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.3s',
    padding: 0
  },
  toggleSwitchKnob: {
    position: 'absolute',
    top: '2px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: '#fff',
    transition: 'transform 0.3s',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
  },
  collapsedSidebar: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '1rem 0.5rem',
    height: '100%'
  },
  collapsedToggleBtn: {
    background: '#334155',
    border: '2px solid #1e293b',
    borderRadius: '50%',
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#e2e8f0',
    cursor: 'pointer',
    marginBottom: '1rem',
    transition: 'all 0.2s'
  },
  collapsedContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem'
  },
  collapsedTitle: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#e2e8f0',
    writingMode: 'vertical-rl',
    textOrientation: 'mixed'
  },
  collapsedCount: {
    background: '#ef4444',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '700',
    padding: '0.25rem 0.5rem',
    borderRadius: '9999px',
    minWidth: '28px',
    textAlign: 'center'
  },
  holdNotesTooltipOverlay: {
    position: 'absolute',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    background: 'rgba(15, 23, 42, 0.95)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '1rem',
    zIndex: 10,
    pointerEvents: 'none'
  },
  holdNotesTooltipHeader: {
    fontSize: '0.75rem',
    fontWeight: '700',
    color: '#3b82f6',
    marginBottom: '0.5rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    textAlign: 'center'
  },
  holdNotesTooltipContent: {
    fontSize: '0.75rem',
    color: '#e2e8f0',
    lineHeight: '1.4',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    textAlign: 'center',
    maxHeight: '120px',
    overflowY: 'auto'
  },
  vitalSignsAlert: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    padding: '2rem',
    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    border: '2px dashed #ef4444',
    borderRadius: '0.5rem'
  },
  vitalSignsTitle: {
    fontSize: '1.125rem',
    fontWeight: '700',
    color: '#ef4444',
    textAlign: 'center'
  },
  vitalSignsMessage: {
    fontSize: '0.875rem',
    color: '#94a3b8',
    textAlign: 'center'
  },
  vitalSignsTimestamp: {
    fontSize: '0.75rem',
    color: '#64748b',
    textAlign: 'center',
    marginTop: '0.5rem',
    paddingTop: '0.75rem',
    borderTop: '1px solid #334155'
  }
}

// Add CSS animations
const styleSheet = document.createElement("style")
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .pending-card:hover {
    transform: translateY(-4px);
    border-color: #3b82f6;
    box-shadow: 0 8px 16px rgba(59, 130, 246, 0.3);
  }

  .pending-card:hover .pending-claim-hint {
    opacity: 1;
  }
`
if (!document.getElementById('dashboard-styles')) {
  styleSheet.id = 'dashboard-styles'
  document.head.appendChild(styleSheet)
}

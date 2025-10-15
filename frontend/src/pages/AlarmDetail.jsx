import React, { useState, useEffect, useRef } from 'react'
// Import styles
import { styles } from './AlarmDetail/styles'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'react-toastify'
import ReactPlayer from 'react-player'
import {
  ArrowLeft, Phone, PhoneOff, FileText, Video as VideoIcon,
  CheckCircle, AlertTriangle, MapPin, X, Camera as CameraIcon, ArrowUpCircle, Pause
} from 'lucide-react'
import api from '../api/axios'
import CallModal from '../components/CallModal'
import SnoozeButton from '../components/SnoozeButton'
import { formatTimestampInTimezone } from '../utils/timezone'
import ActionPlan from './AlarmDetail/components/ActionPlan'
import LiveCameraFeed from './AlarmDetail/components/LiveCameraFeed'
import { usePBXStore } from '../store/pbxStore'
import ToolsManager from '../components/ToolsManager'

export default function AlarmDetail() {
  const { alarmId } = useParams()
  const navigate = useNavigate()
  const { state } = useLocation()
  const fromHistory = state?.fromHistory || false
  const [alarm, setAlarm] = useState(null)
  const [event, setEvent] = useState(null)
  const [camera, setCamera] = useState(null)
  const [account, setAccount] = useState(null)
  const [allCameras, setAllCameras] = useState([])
  const [filteredCameras, setFilteredCameras] = useState(null) // For camera tool - null means show all
  const [selectedCameraId, setSelectedCameraId] = useState(null)
  const [notes, setNotes] = useState('')
  const [accountNotes, setAccountNotes] = useState('')
  const [resolution, setResolution] = useState('')
  const [callLogs, setCallLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0)
  const [viewMode, setViewMode] = useState('single') // 'single' or 'grid'
  const [accountEvents, setAccountEvents] = useState([])
  const [selectedEventIndex, setSelectedEventIndex] = useState(0)
  const [showAllEvents, setShowAllEvents] = useState(false)
  const [showGridViewModal, setShowGridViewModal] = useState(false)
  const [actionPlanState, setActionPlanState] = useState({})
  const [newEventIds, setNewEventIds] = useState([]) // Track new events for blinking
  const [newEventNotification, setNewEventNotification] = useState(null) // Popup notification for new events
  const [showEscalateModal, setShowEscalateModal] = useState(false)
  const [escalateNotes, setEscalateNotes] = useState('')
  const [showHoldModal, setShowHoldModal] = useState(false)
  const [holdNotes, setHoldNotes] = useState('')
  const [activeTab, setActiveTab] = useState('media') // 'media', 'action-plan', 'contacts', 'tenants', 'notes', 'actions'
  const [pbxConfig, setPbxConfig] = useState(null)

  // Tenants state
  const [apartments, setApartments] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTenants, setSelectedTenants] = useState([])
  const [notificationType, setNotificationType] = useState('Package Delivery')
  const [tenantNotes, setTenantNotes] = useState('')
  const [sendingNotifications, setSendingNotifications] = useState(false)
  const [expandedApartments, setExpandedApartments] = useState({})
  const [userExtension, setUserExtension] = useState(null)
  const [showCallModal, setShowCallModal] = useState(false)
  const [selectedContact, setSelectedContact] = useState(null)
  const [activeCalls, setActiveCalls] = useState({}) // Map of contact phone -> {session, callState, contact}
  const liveVideoRef = useRef(null)
  const activeCallSessionsRef = useRef({})
  const hlsRef = useRef(null)
  const hlsInstancesRef = useRef({}) // For grid view - multiple HLS instances
  const previousCameraIdRef = useRef(null)
  const wsRef = useRef(null)
  const autoDialedRef = useRef(false) // Track if we've already auto-dialed
  const remoteAudioRef = useRef(null) // For playing remote audio from calls

  // PBX Store for WebRTC calling
  const { makeCall, isRegistered } = usePBXStore()

  useEffect(() => {
    loadAlarmDetails()
    loadPbxConfig()
  }, [alarmId])

  // Auto-dial parking slot for call events
  useEffect(() => {
    console.log('[Auto-Dial] useEffect triggered', {
      hasEvent: !!event,
      mediaType: event?.media_type,
      parkedSlot: event?.parked_slot,
      isRegistered,
      autoDialed: autoDialedRef.current,
      fromHistory
    })

    if (event && event.media_type === 'call' && event.parked_slot && isRegistered && !autoDialedRef.current && !fromHistory) {
      console.log(`[Auto-Dial] Call event detected with parking slot ${event.parked_slot}`)

      // Mark as auto-dialed to prevent multiple attempts
      autoDialedRef.current = true

      // Store as active call with parking slot info
      const parkContact = {
        name: `Parking Slot ${event.parked_slot}`,
        phone: event.parked_slot
      }

      // Create event handlers (MUST be passed to makeCall for proper audio setup)
      const eventHandlers = {
        'progress': () => {
          console.log('[Auto-Dial] Call ringing...')
          setActiveCalls(prev => ({
            ...prev,
            [event.parked_slot]: { ...prev[event.parked_slot], callState: 'ringing' }
          }))
        },
        'confirmed': () => {
          console.log('[Auto-Dial] Call connected!')
          toast.success(`Connected to parking slot ${event.parked_slot}`)
          setActiveCalls(prev => ({
            ...prev,
            [event.parked_slot]: { ...prev[event.parked_slot], callState: 'connected' }
          }))
        },
        'ended': () => {
          console.log('[Auto-Dial] Call ended')
          setActiveCalls(prev => {
            const newCalls = { ...prev }
            delete newCalls[event.parked_slot]
            return newCalls
          })
          delete activeCallSessionsRef.current[event.parked_slot]
        },
        'failed': (e) => {
          console.error('[Auto-Dial] Call failed:', e)
          toast.error(`Failed to connect to parking slot ${event.parked_slot}`)
          setActiveCalls(prev => {
            const newCalls = { ...prev }
            delete newCalls[event.parked_slot]
            return newCalls
          })
          delete activeCallSessionsRef.current[event.parked_slot]
        },
        'peerconnection': (e) => {
          console.log('[Auto-Dial] Peer connection event - setting up audio streams')
          const peerconnection = e.peerconnection

          peerconnection.addEventListener('addstream', (event) => {
            console.log('[Auto-Dial] addstream event fired')
            if (remoteAudioRef.current) {
              remoteAudioRef.current.srcObject = event.stream
              remoteAudioRef.current.play().catch(err => {
                console.error('[Auto-Dial] Audio playback error:', err)
              })
              console.log('[Auto-Dial] Remote audio stream attached via addstream')
            }
          })

          peerconnection.addEventListener('track', (event) => {
            console.log('[Auto-Dial] track event fired')
            if (remoteAudioRef.current && event.streams && event.streams[0]) {
              remoteAudioRef.current.srcObject = event.streams[0]
              remoteAudioRef.current.play().catch(err => {
                console.error('[Auto-Dial] Audio playback error:', err)
              })
              console.log('[Auto-Dial] Remote audio stream attached via track')
            }
          })
        }
      }

      // Dial the parking slot through WebRTC WITH event handlers
      const session = makeCall(event.parked_slot, pbxConfig, eventHandlers)

      if (session) {
        console.log(`[Auto-Dial] Initiated WebRTC call to parking slot ${event.parked_slot}`)
        toast.success(`Dialing parking slot ${event.parked_slot}...`)

        setActiveCalls(prev => ({
          ...prev,
          [event.parked_slot]: {
            session,
            callState: 'connecting',
            contact: parkContact
          }
        }))
        activeCallSessionsRef.current[event.parked_slot] = session
      } else {
        console.error('[Auto-Dial] Failed to initiate call - makeCall returned null')
        toast.error('Failed to initiate call. Please check your phone connection.')
      }
    }
  }, [event, isRegistered, makeCall, pbxConfig, fromHistory])

  const loadPbxConfig = async () => {
    try {
      const response = await api.get('/pbx/config')
      setPbxConfig(response.data)
      setUserExtension(response.data.userExtension)
    } catch (error) {
      console.error('Failed to load PBX config:', error)
      // PBX config is optional, so don't show error to user
    }
  }

  useEffect(() => {
    // Handle view mode changes
    if (viewMode === 'grid' && allCameras.length > 0) {
      // Don't stop single camera stream - let backend grace period handle it
      // if (previousCameraIdRef.current) {
      //   api.post(`/cameras/${previousCameraIdRef.current}/stop-stream`)
      //     .catch(err => console.error('Failed to stop stream:', err))
      // }
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }

      // Load grid view after a short delay to ensure video elements are rendered
      setTimeout(() => loadCameraGrid(), 100)
    } else if (viewMode === 'single') {
      // Stop all grid streams
      stopAllGridStreams()

      // Reload single camera stream after stopping grid streams
      if (selectedCameraId && liveVideoRef.current) {
        const selectedCam = (filteredCameras || allCameras).find(c => c.id === selectedCameraId)
        if (selectedCam?.rtsp_url) {
          setTimeout(() => loadLiveStream(selectedCameraId), 200)
        }
      }
    }
  }, [viewMode, allCameras, filteredCameras])

  useEffect(() => {
    // Load HLS stream when camera changes
    if (selectedCameraId && liveVideoRef.current) {
      const selectedCam = (filteredCameras || allCameras).find(c => c.id === selectedCameraId)
      if (selectedCam?.rtsp_url) {
        // Don't stop previous camera's stream - let backend grace period handle it
        // if (previousCameraIdRef.current && previousCameraIdRef.current !== selectedCameraId) {
        //   console.log(`Switching from camera ${previousCameraIdRef.current} to ${selectedCameraId}`)
        //   api.post(`/cameras/${previousCameraIdRef.current}/stop-stream`)
        //     .catch(err => console.error('Failed to stop previous stream:', err))
        // }

        // Destroy existing HLS instance before loading new stream
        if (hlsRef.current) {
          hlsRef.current.destroy()
          hlsRef.current = null
        }

        // Load the new camera stream
        loadLiveStream(selectedCameraId)

        // Update the previous camera ref
        previousCameraIdRef.current = selectedCameraId
      }
    }

    return () => {
      // Only stop stream when component unmounts (not when camera changes)
      // We use a flag to distinguish between camera change and unmount
      const currentCameraId = previousCameraIdRef.current

      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }

      // NOTE: Don't stop stream on component unmount
      // Let the backend's 30-second grace period and reference counting handle cleanup
      // This allows streams to persist when navigating between Dashboard and Alarm Detail
      // if (currentCameraId) {
      //   console.log('Component unmounting, stopping stream for camera', currentCameraId)
      //   api.post(`/cameras/${currentCameraId}/stop-stream`)
      //     .catch(err => console.error('Failed to stop stream:', err))
      // }
    }
  }, [selectedCameraId, allCameras])

  // WebSocket listener for new events
  useEffect(() => {
    if (!account) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`

    console.log('🔌 Connecting to WebSocket for new events:', wsUrl)
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('✅ WebSocket connected for alarm detail')
      // Notify backend that we're viewing this alarm
      ws.send(JSON.stringify({
        type: 'viewing_alarm',
        alarm_id: parseInt(alarmId),
        account_id: account.id
      }))
    }

    ws.onmessage = (wsEvent) => {
      try {
        const data = JSON.parse(wsEvent.data)
        console.log('📨 WebSocket message received:', data)

        // Check if this is an update for the current event (parking slot or media)
        if (data.type === 'event_updated' && data.event_id && alarm && data.event_id === alarm.event_id) {
          console.log('🔄 Event updated for current event:', data)

          // Update event state with any changes
          setEvent(prev => {
            const updates = {}

            if (data.parked_slot) {
              console.log('[Auto-Dial] Updating event with parking slot:', data.parked_slot)
              updates.parked_slot = data.parked_slot
            }

            if (data.media_paths) {
              console.log('📹 Updating event with media_paths:', data.media_paths)
              updates.media_paths = data.media_paths
            }

            return {
              ...prev,
              ...updates
            }
          })

          // Pre-start the camera stream when parking slot is assigned
          if (data.parked_slot && event?.camera_id && liveVideoRef.current) {
            console.log('📹 Pre-starting camera stream for call event')
            loadLiveStream(event.camera_id).catch(err => {
              console.error('Failed to pre-start stream:', err)
            })
          }
        }

        // Check if this is a new event for the same account
        if (data.type === 'new_event' && data.account_id === account.id) {
          console.log('🆕 New event for current account:', data)

          // Add to accountEvents at the beginning
          const newEvent = {
            event_id: data.event_id,
            camera_id: data.camera_id,
            camera_name: data.camera_name,
            timestamp: data.timestamp,
            media_paths: data.media_paths || [],
            media_type: data.media_type || 'image',
            media_count: data.media_paths?.length || 0,
            is_current_alarm: false
          }

          setAccountEvents(prev => [newEvent, ...prev])

          // Mark as new for blinking animation
          setNewEventIds(prev => [...prev, data.event_id])

          // Remove from newEventIds after 3 blinks (3 seconds)
          setTimeout(() => {
            setNewEventIds(prev => prev.filter(id => id !== data.event_id))
          }, 3000)

          // Show prominent popup notification
          setNewEventNotification({
            event_id: data.event_id,
            camera_name: data.camera_name,
            timestamp: data.timestamp,
            media_paths: data.media_paths || []
          })

          // Auto-hide notification after 10 seconds
          setTimeout(() => {
            setNewEventNotification(null)
          }, 10000)
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error)
      }
    }

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error)
    }

    ws.onclose = () => {
      console.log('🔌 WebSocket disconnected')
    }

    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('🔌 Leaving alarm view, notifying backend')
        wsRef.current.send(JSON.stringify({
          type: 'left_alarm',
          alarm_id: parseInt(alarmId),
          account_id: account.id
        }))
        wsRef.current.close()
        wsRef.current = null
      }

      // Release the account claim when component unmounts
      if (account) {
        api.post(`/accounts/${account.id}/release`)
          .catch(err => console.error('Failed to release claim on unmount:', err))
      }
    }
  }, [account, alarmId])

  const loadAlarmDetails = async () => {
    try {
      // Get alarm directly by ID
      const alarmResponse = await api.get(`/alarms/${alarmId}`)
      const alarmData = alarmResponse.data

      if (!alarmData) {
        toast.error('Alarm not found')
        navigate('/')
        return
      }

      setAlarm(alarmData)
      setNotes(alarmData.notes || '')
      setResolution(alarmData.resolution || '')
      setCallLogs(alarmData.call_logs || [])
      setActionPlanState(alarmData.action_plan_state || {})

      // Track that this alarm has been viewed (for audit logging)
      api.put(`/alarms/${alarmId}/viewed`).catch(err => {
        console.error('Failed to track alarm view:', err)
      })

      // Get event
      const eventsResponse = await api.get('/events')
      const eventData = eventsResponse.data.find(e => e.id === alarmData.event_id)
      setEvent(eventData)

      if (eventData) {
        // Get all cameras
        const camerasResponse = await api.get('/cameras')
        const cameraData = camerasResponse.data.find(c => c.id === eventData.camera_id)
        setCamera(cameraData)

        if (cameraData) {
          // Get account
          const accountResponse = await api.get(`/accounts/${cameraData.account_id}`)
          setAccount(accountResponse.data)
          setAccountNotes(accountResponse.data.notes || '')

          // Load apartments if account is Doorman type
          if (accountResponse.data.video_type === 'Doorman') {
            try {
              const apartmentsResponse = await api.get(`/accounts/${cameraData.account_id}/apartments`)
              setApartments(apartmentsResponse.data || [])
            } catch (error) {
              console.error('Failed to load apartments:', error)
            }
          }

          // Get all cameras for this account
          const accountCameras = camerasResponse.data.filter(c => c.account_id === cameraData.account_id)
          setAllCameras(accountCameras)

          // Get all events for this account
          const accountEventsResponse = await api.get(`/alarms/${alarmId}/account-events`)
          setAccountEvents(accountEventsResponse.data)

          // Find the index of the current alarm event
          const currentEventIndex = accountEventsResponse.data.findIndex(e => e.is_current_alarm)
          if (currentEventIndex !== -1) {
            setSelectedEventIndex(currentEventIndex)
          }

          // Set selected camera ID AFTER allCameras is set (to trigger useEffect properly)
          setSelectedCameraId(eventData.camera_id)
        }
      }
    } catch (error) {
      toast.error('Failed to load alarm details')
    } finally {
      setLoading(false)
    }
  }

  const loadLiveStream = async (cameraId) => {
    if (!liveVideoRef.current) return

    try {
      console.log('loadLiveStream: Starting stream for camera', cameraId)

      // First, check stream status
      const statusResponse = await api.get(`/cameras/${cameraId}/stream-status`)
      console.log('Stream status:', statusResponse.data)

      // Auto-capture this live view in the background (don't wait for it)
      // Trigger capture regardless of whether stream was already running or not
      if (alarm && alarm.event_id) {
        console.log(`Auto-capturing live view for camera ${cameraId}, event ${alarm.event_id}`)
        api.post(`/events/${alarm.event_id}/capture-live-view`, null, {
          params: {
            camera_id: cameraId,
            duration_seconds: 10
          }
        }).catch(err => {
          console.error('Failed to auto-capture live view:', err)
          // Don't show error to user - this is a background operation
        })
      }

      // If stream is already running, just load it immediately (no polling needed)
      if (statusResponse.data.is_streaming && statusResponse.data.stream_url) {
        console.log('Stream already running, loading immediately without polling')
      }
      // If stream is not running, start it and wait for it
      else if (!statusResponse.data.is_streaming) {
        console.log('Stream not running, starting automatically...')
        // Use medium quality for single camera view
        await api.post(`/cameras/${cameraId}/start-stream?quality=medium`)
        console.log('Stream start command sent')

        // Poll for stream readiness
        console.log('Polling for stream readiness...')
        for (let attempt = 0; attempt < 60; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 500))
          const status = await api.get(`/cameras/${cameraId}/stream-status`)
          if (status.data.stream_url) {
            const readyTime = (attempt + 1) * 500
            console.log(`✓ Stream ready after ${readyTime}ms`)
            break
          }
        }
      }
      // Stream is running but stream_url not yet available (rare case)
      else {
        console.log('Stream running but URL not ready, polling...')
        for (let attempt = 0; attempt < 10; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 200))
          const status = await api.get(`/cameras/${cameraId}/stream-status`)
          if (status.data.stream_url) {
            const readyTime = (attempt + 1) * 200
            console.log(`✓ Stream URL ready after ${readyTime}ms`)
            break
          }
        }
      }

      const streamUrl = `/streams/${cameraId}/playlist.m3u8`
      console.log('loadLiveStream: Loading stream:', streamUrl)

      if (window.Hls && window.Hls.isSupported()) {
        console.log('HLS.js is supported, loading source')

        // Destroy existing HLS instance
        if (hlsRef.current) {
          hlsRef.current.destroy()
        }

        const hls = new window.Hls({
          debug: false,
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 10,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 5,
          maxBufferLength: 10,
          maxMaxBufferLength: 20,
          highBufferWatchdogPeriod: 1
        })

        hls.loadSource(streamUrl)
        hls.attachMedia(liveVideoRef.current)

        // Add video element event listeners
        const videoEl = liveVideoRef.current
        videoEl.addEventListener('loadstart', () => console.log('Video loading started'))
        videoEl.addEventListener('loadedmetadata', () => console.log('Video metadata loaded'))
        videoEl.addEventListener('loadeddata', () => console.log('Video data loaded'))
        videoEl.addEventListener('canplay', () => console.log('Video can play'))
        videoEl.addEventListener('playing', () => console.log('Video playback started successfully'))
        videoEl.addEventListener('error', (e) => console.error('Video element error:', e))

        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          console.log('HLS manifest parsed, attempting to play')
          liveVideoRef.current.play().catch(e => console.log('Autoplay prevented:', e))
        })

        hls.on(window.Hls.Events.MEDIA_ATTACHED, () => {
          console.log('Media attached to video element')
        })

        hls.on(window.Hls.Events.FRAG_LOADED, () => {
          console.log('Fragment loaded successfully')
        })

        hls.on(window.Hls.Events.ERROR, (event, data) => {
          console.log('HLS error:', data)
          if (data.fatal) {
            console.error('HLS fatal error:', data)
            switch (data.type) {
              case window.Hls.ErrorTypes.NETWORK_ERROR:
                console.log('Network error - attempting to recover by reloading')
                hls.startLoad()
                // If recovery fails after 3 seconds, restart the stream
                setTimeout(() => {
                  if (hls && liveVideoRef.current) {
                    console.log('Reloading stream after network error')
                    hls.detachMedia()
                    hls.loadSource(streamUrl)
                    hls.attachMedia(liveVideoRef.current)
                  }
                }, 3000)
                break
              case window.Hls.ErrorTypes.MEDIA_ERROR:
                console.log('Media error - attempting to recover')
                hls.recoverMediaError()
                break
              default:
                console.error('Unrecoverable HLS error, restarting stream')
                toast.error('Stream error, reconnecting...')
                setTimeout(() => {
                  if (liveVideoRef.current && selectedCameraId) {
                    console.log('Reloading live stream after fatal error')
                    loadLiveStream(selectedCameraId)
                  }
                }, 2000)
                break
            }
          }
        })

        hlsRef.current = hls
      } else if (liveVideoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        liveVideoRef.current.src = streamUrl
        liveVideoRef.current.play().catch(e => console.log('Autoplay prevented:', e))
      }
    } catch (error) {
      console.error('Failed to load live stream:', error)
      toast.error('Failed to load live stream')
    }
  }

  const loadCameraGrid = async () => {
    // Use filtered cameras if set, otherwise all cameras
    const cameras = filteredCameras || allCameras
    console.log('AlarmDetail: Loading grid streams for', cameras.length, 'cameras', filteredCameras ? '(filtered)' : '(all)')

    // Load each camera stream independently - show as soon as ready
    cameras
      .filter(cam => cam.rtsp_url)
      .forEach(async (cam) => {
        try {
          // Start the stream
          console.log(`Starting stream for camera ${cam.id}:`, cam.name)
          const statusResponse = await api.get(`/cameras/${cam.id}/stream-status`)
          if (!statusResponse.data.is_streaming) {
            await api.post(`/cameras/${cam.id}/start-stream?quality=low`)
            console.log(`Stream started for camera ${cam.id} (${cam.name}) in LOW quality`)
          } else {
            console.log(`Stream already running for camera ${cam.id} (${cam.name})`)
          }

          // Poll for playlist readiness
          console.log(`Polling for camera ${cam.id} (${cam.name}) playlist...`)
          for (let attempt = 0; attempt < 60; attempt++) {
            try {
              const status = await api.get(`/cameras/${cam.id}/stream-status`)
              if (status.data.stream_url) {
                const readyTime = (attempt + 1) * 500
                console.log(`✓ Camera ${cam.id} (${cam.name}) ready after ${readyTime}ms - loading now!`)

                // Auto-capture this live view in the background (don't wait for it)
                if (alarm && alarm.event_id) {
                  console.log(`Auto-capturing grid live view for camera ${cam.id}, event ${alarm.event_id}`)
                  api.post(`/events/${alarm.event_id}/capture-live-view`, null, {
                    params: {
                      camera_id: cam.id,
                      duration_seconds: 10
                    }
                  }).catch(err => {
                    console.error('Failed to auto-capture grid live view:', err)
                    // Don't show error to user - this is a background operation
                  })
                }

                // Load this camera immediately
                await loadSingleGridCamera(cam)
                break
              }
              await new Promise(resolve => setTimeout(resolve, 500))
            } catch (error) {
              console.error(`Error polling camera ${cam.id}:`, error)
              await new Promise(resolve => setTimeout(resolve, 500))
            }
          }
        } catch (error) {
          console.error(`Failed to start stream for camera ${cam.id}:`, error)
        }
      })
  }

  const loadSingleGridCamera = async (cam, retries = 5) => {
    // Retry finding the video element (it might not be in DOM yet)
    let videoEl = null
    for (let i = 0; i < retries; i++) {
      videoEl = document.getElementById(`grid-video-${cam.id}`)
      if (videoEl) break
      await new Promise(resolve => setTimeout(resolve, 200)) // Wait 200ms between retries
    }

    if (!videoEl) {
      console.warn(`Video element for camera ${cam.id} not found after ${retries} retries`)
      return
    }

    if (window.Hls && window.Hls.isSupported()) {
      console.log(`Initializing HLS for camera ${cam.id} (${cam.name})`)
      const hls = new window.Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 10,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 5,
        maxBufferLength: 15,
        maxMaxBufferLength: 30,
        highBufferWatchdogPeriod: 1
      })

      const streamUrl = `/streams/${cam.id}/playlist.m3u8`
      console.log(`Loading HLS source for camera ${cam.id}:`, streamUrl)
      hls.loadSource(streamUrl)
      hls.attachMedia(videoEl)

      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        console.log(`✓ HLS manifest parsed for camera ${cam.id} (${cam.name}), playing now!`)
        videoEl.play().catch(e => console.log(`Autoplay prevented for camera ${cam.id}:`, e))
      })

      hls.on(window.Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error(`HLS fatal error for camera ${cam.id}:`, data)
          switch (data.type) {
            case window.Hls.ErrorTypes.NETWORK_ERROR:
              console.log(`Network error for camera ${cam.id}, attempting recovery...`)
              hls.startLoad()
              break
            case window.Hls.ErrorTypes.MEDIA_ERROR:
              console.log(`Media error for camera ${cam.id}, attempting recovery...`)
              hls.recoverMediaError()
              break
            default:
              console.error(`Unrecoverable error for camera ${cam.id}`)
              break
          }
        }
      })

      hlsInstancesRef.current[cam.id] = hls
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      console.log(`Using native HLS for camera ${cam.id}`)
      videoEl.src = `/streams/${cam.id}/playlist.m3u8`
      videoEl.play().catch(e => console.log('Autoplay prevented:', e))
    }
  }

  const stopAllGridStreams = () => {
    // Clean up all HLS instances
    Object.values(hlsInstancesRef.current).forEach(hls => {
      if (hls) hls.destroy()
    })
    hlsInstancesRef.current = {}

    // Stop all streams
    allCameras.forEach(cam => {
      api.post(`/cameras/${cam.id}/stop-stream`)
        .catch(err => console.error(`Failed to stop stream for camera ${cam.id}:`, err))
    })
  }

  const handleResolve = async () => {
    if (!resolution) {
      toast.error('Please select a resolution before resolving')
      return
    }

    // Validate action plan completion
    if (!isActionPlanComplete()) {
      toast.error('Please complete all required action plan steps before resolving the alarm')
      return
    }

    try {
      await api.put(`/alarms/${alarmId}/resolve`, {
        notes,
        resolution,
        call_logs: callLogs,
        action_plan_state: actionPlanState
      })

      // Restore receiving state if it was saved before navigating to alarm
      try {
        await api.post('/users/me/restore-receiving')
      } catch (error) {
        console.error('Failed to restore receiving state:', error)
      }

      navigate(fromHistory ? '/history' : '/')
    } catch (error) {
      toast.error('Failed to resolve alarm')
    }
  }

  const handleEscalate = () => {
    setShowEscalateModal(true)
  }

  const handleConfirmEscalate = async () => {
    try {
      // Get the event_id from the alarm
      if (alarm?.event_id) {
        // Pass escalation notes (NOT the current notes textarea value)
        await api.put(`/events/${alarm.event_id}/escalate`, {
          notes: escalateNotes.trim() || undefined
        })
        setShowEscalateModal(false)
        setEscalateNotes('')

        // Restore receiving state if it was saved before navigating to alarm
        try {
          await api.post('/users/me/restore-receiving')
        } catch (error) {
          console.error('Failed to restore receiving state:', error)
        }

        navigate(fromHistory ? '/history' : '/')
      } else {
        toast.error('Unable to escalate: No event associated with this alarm')
      }
    } catch (error) {
      if (error.response?.status === 400 && error.response?.data?.detail) {
        toast.error(error.response.data.detail)
      } else {
        toast.error('Failed to escalate alarm')
      }
    }
  }

  const handleCancelEscalate = () => {
    setShowEscalateModal(false)
    setEscalateNotes('')
  }

  const handleHold = () => {
    setShowHoldModal(true)
  }

  const handleConfirmHold = async () => {
    try {
      await api.put(`/alarms/${alarmId}/hold`, {
        notes: holdNotes.trim() || undefined
      })
      setShowHoldModal(false)
      setHoldNotes('')

      // Restore receiving state if it was saved before navigating to alarm
      try {
        await api.post('/users/me/restore-receiving')
      } catch (error) {
        console.error('Failed to restore receiving state:', error)
      }

      navigate(fromHistory ? '/history' : '/')
    } catch (error) {
      if (error.response?.status === 400 && error.response?.data?.detail) {
        toast.error(error.response.data.detail)
      } else {
        toast.error('Failed to place alarm on hold')
      }
    }
  }

  const handleCancelHold = () => {
    setShowHoldModal(false)
    setHoldNotes('')
  }

  const handleSnoozeUpdate = () => {
    // Reload alarm details to get updated snooze status
    loadAlarmDetails()
  }

  const handleSaveCallLog = async (callLog, activeCallInfo) => {
    console.log('AlarmDetail handleSaveCallLog received:', {
      callLog,
      activeCallInfo,
      hasActiveCallInfo: !!activeCallInfo
    })

    const updatedCallLogs = [...callLogs, callLog]
    setCallLogs(updatedCallLogs)

    try {
      console.log('About to save alarm call logs...')
      // Save to alarm call_logs
      await api.put(`/alarms/${alarmId}`, {
        notes,
        resolution,
        call_logs: updatedCallLogs
      })
      console.log('Alarm call logs saved successfully')

      console.log('About to save audit log...')
      // Also log to audit trail (non-blocking - don't wait for response)
      api.post('/audit-log', {
        action: 'contact_called',
        alarm_id: parseInt(alarmId),
        event_id: event?.id,
        details: {
          contact_name: callLog.contact_name,
          contact_phone: callLog.contact_phone,
          call_start: callLog.call_start,
          call_end: callLog.call_end,
          duration: callLog.duration,
          resolution: callLog.resolution,
          notes: callLog.notes
        }
      }).then(() => {
        console.log('Audit log saved successfully')
      }).catch(err => {
        console.error('Failed to save audit log:', err)
      })
      console.log('Audit log request sent (non-blocking)')

      toast.success('Call log saved successfully')
      console.log('Toast shown')

      // If there's an active call, store it and switch to contacts tab
      console.log('Checking activeCallInfo:', !!activeCallInfo)
      if (activeCallInfo) {
        console.log('Setting active call for phone:', activeCallInfo.contact.phone)
        setActiveCalls(prev => {
          const updated = {
            ...prev,
            [activeCallInfo.contact.phone]: activeCallInfo
          }
          console.log('Updated activeCalls:', updated)
          return updated
        })
        activeCallSessionsRef.current[activeCallInfo.contact.phone] = activeCallInfo.session
        setActiveTab('contacts')
        console.log('Switched to contacts tab')
      } else {
        console.log('No activeCallInfo, not storing active call')
      }
      console.log('handleSaveCallLog completed successfully')
    } catch (error) {
      console.error('Error in handleSaveCallLog:', error)
      toast.error('Failed to save call log')
    }
  }

  const handleHangupActiveCall = (contactPhone) => {
    const activeCall = activeCalls[contactPhone]
    if (activeCall && activeCall.session) {
      try {
        activeCall.session.terminate()
      } catch (e) {
        console.error('Error terminating call:', e)
      }
    }

    // Remove from active calls
    setActiveCalls(prev => {
      const newCalls = {...prev}
      delete newCalls[contactPhone]
      return newCalls
    })
    delete activeCallSessionsRef.current[contactPhone]

    toast.success('Call ended')
  }

  const handleDialInboundNumber = (phoneNumber, cameraName) => {
    if (!isRegistered) {
      toast.error('Phone not registered. Please check your connection.')
      return
    }

    console.log(`[Inbound Call] Dialing ${phoneNumber} for ${cameraName}`)

    const contact = {
      name: `${cameraName} - Inbound`,
      phone: phoneNumber
    }

    // Create event handlers for proper audio setup
    const eventHandlers = {
      'progress': () => {
        console.log('[Inbound Call] Call ringing...')
        setActiveCalls(prev => ({
          ...prev,
          [phoneNumber]: { ...prev[phoneNumber], callState: 'ringing' }
        }))
      },
      'confirmed': () => {
        console.log('[Inbound Call] Call connected!')
        toast.success(`Connected to ${cameraName}`)
        setActiveCalls(prev => ({
          ...prev,
          [phoneNumber]: { ...prev[phoneNumber], callState: 'connected' }
        }))
      },
      'ended': () => {
        console.log('[Inbound Call] Call ended')
        setActiveCalls(prev => {
          const newCalls = { ...prev }
          delete newCalls[phoneNumber]
          return newCalls
        })
        delete activeCallSessionsRef.current[phoneNumber]
      },
      'failed': (e) => {
        console.error('[Inbound Call] Call failed:', e)
        toast.error(`Failed to connect to ${cameraName}`)
        setActiveCalls(prev => {
          const newCalls = { ...prev }
          delete newCalls[phoneNumber]
          return newCalls
        })
        delete activeCallSessionsRef.current[phoneNumber]
      },
      'peerconnection': (e) => {
        console.log('[Inbound Call] Peer connection event - setting up audio streams')
        const peerconnection = e.peerconnection

        peerconnection.addEventListener('addstream', (event) => {
          console.log('[Inbound Call] addstream event fired')
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = event.stream
            remoteAudioRef.current.play().catch(err => {
              console.error('[Inbound Call] Audio playback error:', err)
            })
            console.log('[Inbound Call] Remote audio stream attached via addstream')
          }
        })

        peerconnection.addEventListener('track', (event) => {
          console.log('[Inbound Call] track event fired')
          if (remoteAudioRef.current && event.streams && event.streams[0]) {
            remoteAudioRef.current.srcObject = event.streams[0]
            remoteAudioRef.current.play().catch(err => {
              console.error('[Inbound Call] Audio playback error:', err)
            })
            console.log('[Inbound Call] Remote audio stream attached via track')
          }
        })
      }
    }

    // Dial the number through WebRTC WITH event handlers
    const session = makeCall(phoneNumber, pbxConfig, eventHandlers)

    if (session) {
      console.log(`[Inbound Call] Initiated WebRTC call to ${phoneNumber}`)
      toast.success(`Dialing ${cameraName}...`)

      setActiveCalls(prev => ({
        ...prev,
        [phoneNumber]: {
          session,
          callState: 'connecting',
          contact
        }
      }))
      activeCallSessionsRef.current[phoneNumber] = session
    } else {
      console.error('[Inbound Call] Failed to initiate call - makeCall returned null')
      toast.error('Failed to initiate call. Please check your phone connection.')
    }
  }

  const handleDismissNewEvent = async () => {
    if (!newEventNotification) return

    try {
      // Dismiss the new event with "Duplicate" resolution
      await api.put(`/events/${newEventNotification.event_id}/dismiss?resolution=Duplicate`)

      // Remove from accountEvents list
      setAccountEvents(prev => prev.filter(e => e.id !== newEventNotification.event_id))

      // Clear the notification
      setNewEventNotification(null)

    } catch (error) {
      console.error('Failed to dismiss event:', error)
      toast.error('Failed to dismiss event')
    }
  }

  const handleBackToDashboard = async () => {
    try {
      // Only revert if alarm is still active and coming from dashboard (not history)
      if (alarm.status === 'active' && !fromHistory) {
        await api.put(`/alarms/${alarmId}/revert-to-pending`)
      }

      // Release the account claim when leaving
      if (account) {
        await api.post(`/accounts/${account.id}/release`)
          .catch(err => console.error('Failed to release claim:', err))
      }

      navigate(fromHistory ? '/history' : '/')
    } catch (error) {
      console.error('Failed to revert alarm:', error)
      // Navigate anyway even if revert fails
      navigate(fromHistory ? '/history' : '/')
    }
  }

  const handleToggleActionPlanStep = async (stepId) => {
    if (fromHistory) return // Disable toggling when viewing history

    const newState = {
      ...actionPlanState,
      [stepId]: !actionPlanState[stepId]
    }
    setActionPlanState(newState)

    try {
      await api.put(`/alarms/${alarmId}`, {
        notes,
        resolution,
        call_logs: callLogs,
        action_plan_state: newState
      })
    } catch (error) {
      console.error('Failed to update action plan state:', error)
      toast.error('Failed to update action plan')
    }
  }

  const handleWebhookTrigger = async (step) => {
    if (fromHistory) return // Disable tool triggering when viewing history

    try {
      // Use Tools API for tool-type steps
      if (step.tool_id) {
        // Build URL with relay_number parameter if present
        const url = step.relay_number
          ? `/tools/${step.tool_id}/trigger?relay_number=${step.relay_number}`
          : `/tools/${step.tool_id}/trigger`
        const response = await api.post(url)

        if (response.status === 200) {
          toast.success(response.data.message || `${step.label} triggered successfully`)
          // Mark step as complete
          await handleToggleActionPlanStep(step.id)
        } else {
          toast.error(`Failed to trigger ${step.label}`)
        }
      }
      // Legacy webhook support (for old action plans with direct webhook URLs)
      else if (step.url) {
        const response = await fetch(step.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            alarm_id: alarmId,
            account_name: account?.name,
            account_number: account?.account_number,
            timestamp: new Date().toISOString(),
            step_label: step.label
          })
        })

        if (response.ok) {
          toast.success(`${step.label} triggered successfully`)
          // Mark step as complete
          await handleToggleActionPlanStep(step.id)
        } else {
          toast.error(`Failed to trigger ${step.label}`)
        }
      } else {
        toast.error('Tool configuration is missing')
      }
    } catch (error) {
      console.error('Tool trigger error:', error)
      toast.error(`Error triggering ${step.label}`)
    }
  }

  const isActionPlanComplete = () => {
    if (!account?.action_plan || account.action_plan.length === 0) return true

    const checkStep = (step) => {
      if (step.isBoolean) {
        // Boolean step must be answered ('yes' or 'no')
        const answer = actionPlanState[step.id]
        if (answer !== 'yes' && answer !== 'no') {
          return false
        }

        // Check the active branch steps recursively
        const branchSteps = answer === 'yes' ? step.yesSteps : step.noSteps
        if (branchSteps && branchSteps.length > 0) {
          for (const branchStep of branchSteps) {
            if (!checkStep(branchStep)) {
              return false
            }
          }
        }
      } else {
        // Regular step must be completed (true)
        if (actionPlanState[step.id] !== true) {
          return false
        }
      }
      return true
    }

    // Check each top-level step
    for (const step of account.action_plan) {
      if (!checkStep(step)) {
        return false
      }
    }

    return true
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading alarm details...</p>
      </div>
    )
  }

  if (!alarm || !event) {
    return <div style={styles.error}>Alarm not found</div>
  }

  return (
    <div style={styles.container}>
      {/* New Event Notification Popup */}
      {newEventNotification && (
        <div style={styles.newEventNotification} className="blink-red">
          <div style={styles.notificationHeader}>
            <AlertTriangle size={24} color="#ef4444" />
            <span style={styles.notificationTitle}>🚨 NEW EVENT RECEIVED</span>
            <button
              style={styles.notificationCloseBtn}
              onClick={handleDismissNewEvent}
              title="Dismiss as Duplicate"
            >
              <X size={20} />
            </button>
          </div>
          <div style={styles.notificationContent}>
            <div style={styles.notificationInfo}>
              <div style={styles.notificationCamera}>
                Camera: <strong>{newEventNotification.camera_name}</strong>
              </div>
              <div style={styles.notificationTime}>
                {formatTimestampInTimezone(newEventNotification.timestamp, account?.timezone, { showDate: true, showTime: true })}
              </div>
            </div>
            {newEventNotification.media_paths && newEventNotification.media_paths.length > 0 && (
              <img
                src={`/${newEventNotification.media_paths[0]}`}
                alt="New event preview"
                style={styles.notificationThumbnail}
                onError={(e) => { e.target.style.display = 'none' }}
              />
            )}
          </div>
          <div style={styles.notificationFooter}>
            <span style={styles.notificationHint}>Event added to timeline on the right →</span>
          </div>
        </div>
      )}

      {/* Header with status and back button */}
      <div style={styles.header}>
        <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
          <div style={styles.statusBadge}>
            {alarm.status === 'active' ? (
              <>
                <AlertTriangle size={18} />
                <span>Active - {formatTimestampInTimezone(alarm.created_at, account?.timezone, { showTimezone: true })}</span>
              </>
            ) : (
              <>
                <CheckCircle size={18} />
                <span>Resolved - {formatTimestampInTimezone(alarm.created_at, account?.timezone, { showTimezone: true })}</span>
              </>
            )}
          </div>

          {/* Active Call Indicator */}
          {Object.keys(activeCalls).length > 0 && Object.values(activeCalls).map(activeCall => (
            <div key={activeCall.contact.phone} style={styles.activeCallBadge}>
              <Phone size={14} />
              <span style={styles.activeCallText}>
                {activeCall.contact.name} - {activeCall.callState === 'connected' ? 'Connected' : 'Calling...'}
              </span>
              <button
                onClick={() => {
                  setSelectedContact(activeCall.contact)
                  setShowCallModal(true)
                }}
                style={styles.activeCallMaximizeBtn}
                title="Maximize call"
              >
                <span style={{fontSize: '0.75rem'}}>Maximize</span>
              </button>
              <button
                onClick={() => handleHangupActiveCall(activeCall.contact.phone)}
                style={styles.activeCallHangupBtn}
                title="Hang up"
              >
                <PhoneOff size={14} />
              </button>
            </div>
          ))}
        </div>
        <div style={styles.headerActions}>
          {alarm.status === 'active' && (
            <>
              <SnoozeButton alarmId={alarmId} currentSnoozeUntil={alarm?.snoozed_until} onSnooze={handleSnoozeUpdate} />
              <button style={styles.holdBtn} onClick={handleHold}>
                <Pause size={20} />
                <span>Hold</span>
              </button>
              <button style={styles.escalateBtnHeader} onClick={handleEscalate}>
                <ArrowUpCircle size={20} />
                <span>Escalate</span>
              </button>
            </>
          )}
          <button style={styles.backBtn} onClick={handleBackToDashboard}>
            <ArrowLeft size={20} />
            <span>{fromHistory ? 'Back to History' : 'Back to Dashboard'}</span>
          </button>
        </div>
      </div>

      {/* Account and Camera Information Row */}
      <div style={styles.infoRow}>
        {/* Account Information - Left */}
        {account && (
          <div style={styles.accountSection}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
              <h2 style={styles.sectionTitle}>Account Information</h2>
              <SnoozeButton
                type="account"
                id={account.id}
                snoozedUntil={account.snoozed_until}
                onSnoozeUpdate={loadAlarmDetails}
                showLabel={false}
              />
            </div>
            <div style={styles.accountInfoCompact}>
              <div style={styles.compactRow}>
                <div style={styles.compactField}>
                  <span style={styles.compactLabel}>Account:</span>
                  <span style={styles.compactValue}>{account.name}</span>
                </div>
                <div style={styles.compactField}>
                  <span style={styles.compactLabel}>Number:</span>
                  <span style={styles.compactValue}>{account.account_number}</span>
                </div>
              </div>
              {(account.address || account.city || account.state || account.zip_code) && (
                <div style={styles.compactRow}>
                  <div style={styles.compactFieldFull}>
                    <MapPin size={14} style={{flexShrink: 0}} />
                    <div style={styles.addressInline}>
                      {account.address && <span>{account.address}</span>}
                      {(account.city || account.state || account.zip_code) && (
                        <span>
                          {account.address ? ' • ' : ''}
                          {account.city}{account.city && (account.state || account.zip_code) ? ', ' : ''}
                          {account.state} {account.zip_code}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {account.notes && (
                <div style={styles.compactRow}>
                  <div style={styles.compactFieldFull}>
                    <FileText size={14} style={{flexShrink: 0}} />
                    <span style={styles.compactValue}>{account.notes}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Camera Information - Right */}
        {camera && (
          <div style={styles.cameraSection}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
              <h2 style={styles.sectionTitle}>Camera Information</h2>
              <SnoozeButton
                type="camera"
                id={camera.id}
                snoozedUntil={camera.snoozed_until}
                onSnoozeUpdate={loadAlarmDetails}
                showLabel={false}
              />
            </div>
            <div style={styles.infoCard}>
              <div style={styles.compactRow}>
                <div style={styles.compactField}>
                  <span style={styles.compactLabel}>Camera:</span>
                  <span style={styles.compactValue}>{camera.name}</span>
                </div>
              </div>
              {camera.location && (
                <div style={styles.compactRow}>
                  <div style={styles.compactFieldFull}>
                    <MapPin size={14} style={{flexShrink: 0}} />
                    <span style={styles.compactValue}>{camera.location}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>


      {/* Tabbed Layout: Left Panel (Tabs) | Right Panel (Live Feed) */}
      <div style={styles.tabbedLayout}>
        {/* Left Panel: Tabbed Content */}
        <div style={styles.tabbedLeftPanel}>
          {/* Tab Navigation */}
          <div style={styles.tabsNavigation}>
            <button
              style={{
                ...styles.tabButton,
                ...(activeTab === 'media' ? styles.tabButtonActive : {})
              }}
              onClick={() => setActiveTab('media')}
            >
              Media
            </button>
            <button
              style={{
                ...styles.tabButton,
                ...(activeTab === 'notes' ? styles.tabButtonActive : {})
              }}
              onClick={() => setActiveTab('notes')}
            >
              Notes
            </button>
            <button
              style={{
                ...styles.tabButton,
                ...(activeTab === 'tools' ? styles.tabButtonActive : {})
              }}
              onClick={() => setActiveTab('tools')}
            >
              Tools
            </button>
            {account?.video_type === 'Doorman' && (
              <button
                style={{
                  ...styles.tabButton,
                  ...(activeTab === 'tenants' ? styles.tabButtonActive : {})
                }}
                onClick={() => setActiveTab('tenants')}
              >
                Tenants
              </button>
            )}
            <button
              style={{
                ...styles.tabButton,
                ...(activeTab === 'contacts' ? styles.tabButtonActive : {})
              }}
              onClick={() => setActiveTab('contacts')}
            >
              Contacts
            </button>
            {account?.action_plan && account.action_plan.length > 0 && (
              <button
                style={{
                  ...styles.tabButton,
                  ...(activeTab === 'action-plan' ? styles.tabButtonActive : {})
                }}
                onClick={() => setActiveTab('action-plan')}
              >
                Action Plan
              </button>
            )}
            <button
              style={{
                ...styles.tabButton,
                ...(activeTab === 'actions' ? styles.tabButtonActive : {})
              }}
              onClick={() => setActiveTab('actions')}
            >
              Resolve
            </button>
          </div>

          {/* Tab Content */}
          <div style={styles.tabContent}>
            {activeTab === 'media' && (
              <div style={{display: 'grid', gridTemplateColumns: accountEvents.length > 1 ? '1fr 150px' : '1fr', gap: '1rem', height: '100%'}}>
                {/* Event Media */}
                <div style={styles.videoSection}>
                  <div style={styles.videoHeader}>
                    <h2 style={styles.videoTitle}>Event Media</h2>
                    <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
                      {/* Show Connect Call button for call events */}
                      {event.media_type === 'call' && event.parked_slot && !fromHistory && (
                        <button
                          onClick={() => {
                            const session = makeCall(event.parked_slot, pbxConfig)
                            if (session) {
                              toast.success(`Dialing parking slot ${event.parked_slot}...`)
                              const parkContact = {
                                name: `Parking Slot ${event.parked_slot}`,
                                phone: event.parked_slot
                              }
                              setActiveCalls(prev => ({
                                ...prev,
                                [event.parked_slot]: { session, callState: 'connecting', contact: parkContact }
                              }))
                              activeCallSessionsRef.current[event.parked_slot] = session

                              session.on('accepted', () => {
                                setActiveCalls(prev => ({
                                  ...prev,
                                  [event.parked_slot]: { ...prev[event.parked_slot], callState: 'connected' }
                                }))
                                toast.success(`Connected to parking slot ${event.parked_slot}`)
                              })
                              session.on('ended', () => {
                                setActiveCalls(prev => {
                                  const newCalls = { ...prev }
                                  delete newCalls[event.parked_slot]
                                  return newCalls
                                })
                                delete activeCallSessionsRef.current[event.parked_slot]
                              })
                              session.on('failed', () => {
                                toast.error(`Failed to connect to parking slot ${event.parked_slot}`)
                                setActiveCalls(prev => {
                                  const newCalls = { ...prev }
                                  delete newCalls[event.parked_slot]
                                  return newCalls
                                })
                                delete activeCallSessionsRef.current[event.parked_slot]
                              })
                            } else {
                              toast.error('Failed to initiate call')
                            }
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 1rem',
                            background: activeCalls[event.parked_slot] ? '#10b981' : '#3b82f6',
                            border: 'none',
                            borderRadius: '0.5rem',
                            color: '#fff',
                            fontWeight: '600',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            transition: 'background 0.2s'
                          }}
                          disabled={!isRegistered || !!activeCalls[event.parked_slot]}
                        >
                          <Phone size={16} />
                          <span>
                            {activeCalls[event.parked_slot]
                              ? `${activeCalls[event.parked_slot].callState === 'connected' ? 'Connected' : 'Calling...'}`
                              : `Connect to Slot ${event.parked_slot}`}
                          </span>
                        </button>
                      )}
                      <span style={styles.timestamp}>
                        {formatTimestampInTimezone(event.timestamp, account?.timezone, { showTimezone: true })}
                      </span>
                    </div>
                  </div>
                  <div style={styles.videoContainer}>
                    {event.media_paths && event.media_paths.filter(path => !path.endsWith('.wav') && !path.endsWith('.mp3') && !path.endsWith('.ogg')).length > 0 ? (
                      <>
                        {event.media_type === 'video' || event.media_paths[selectedMediaIndex]?.endsWith('.mp4') ? (
                          <video
                            key={event.media_paths[selectedMediaIndex]}
                            src={`/${event.media_paths[selectedMediaIndex]}`}
                            style={styles.video}
                            controls
                            autoPlay
                            loop
                            muted
                          />
                        ) : (
                          <img
                            src={`/${event.media_paths[selectedMediaIndex]}`}
                            alt="Event capture"
                            style={styles.video}
                          />
                        )}
                        {event.media_paths.filter(path => !path.endsWith('.wav') && !path.endsWith('.mp3') && !path.endsWith('.ogg')).length > 1 && (
                          <div style={styles.mediaThumbs}>
                            {event.media_paths.filter(path => !path.endsWith('.wav') && !path.endsWith('.mp3') && !path.endsWith('.ogg')).map((path, idx) => (
                              <div
                                key={idx}
                                style={{
                                  ...styles.thumb,
                                  ...(selectedMediaIndex === idx ? styles.thumbActive : {})
                                }}
                                onClick={() => setSelectedMediaIndex(idx)}
                              >
                                <img src={`/${path}`} alt={`Media ${idx + 1}`} style={styles.thumbImage} />
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={styles.noMedia}>No media available</div>
                    )}
                  </div>
                </div>

                {/* Events Timeline */}
                {accountEvents.length > 1 && (
                  <div style={styles.eventsTimelineVertical}>
                    <div style={styles.timelineHeaderVertical}>
                      <h2 style={styles.videoTitle}>Events ({accountEvents.length})</h2>
                    </div>
                    <div style={styles.timelineScrollVertical}>
                      {accountEvents
                        .slice()
                        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                        .map((evt, displayIdx) => {
                          const actualIdx = accountEvents.findIndex(e => e.event_id === evt.event_id)

                          return (
                            <div
                              key={evt.event_id}
                              className={newEventIds.includes(evt.event_id) ? 'blink-red' : ''}
                              style={{
                                ...styles.timelineEventVertical,
                                ...(selectedEventIndex === actualIdx ? styles.timelineEventVerticalActive : {}),
                                ...(evt.is_current_alarm ? styles.timelineEventCurrent : {})
                              }}
                              onClick={async () => {
                                setSelectedEventIndex(actualIdx)
                                setEvent({
                                  ...event,
                                  media_paths: evt.media_paths,
                                  media_type: evt.media_type,
                                  timestamp: evt.timestamp,
                                  camera_id: evt.camera_id
                                })
                                setSelectedMediaIndex(0)

                                if (evt.camera_id) {
                                  setSelectedCameraId(evt.camera_id)
                                }
                              }}
                            >
                              <div style={styles.timelineEventContentVertical}>
                                {evt.media_paths && evt.media_paths.length > 0 && (
                                  <img
                                    src={`/${evt.media_paths[0]}`}
                                    alt="Preview"
                                    style={styles.timelineEventThumbVertical}
                                    onError={(e) => {
                                      e.target.style.display = 'none'
                                    }}
                                  />
                                )}
                                <div style={styles.timelineEventInfo}>
                                  <div style={styles.timelineEventCamera}>{evt.camera_name}</div>
                                  <div style={styles.timelineEventTime}>
                                    {formatTimestampInTimezone(evt.timestamp, account?.timezone, { showDate: true, showTime: true })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'action-plan' && (
              <ActionPlan
                account={account}
                actionPlanState={actionPlanState}
                onToggleStep={handleToggleActionPlanStep}
                onAnswerQuestion={(stepId, answer) => {
                  const newState = {
                    ...actionPlanState,
                    [stepId]: answer
                  }
                  setActionPlanState(newState)
                  api.put(`/alarms/${alarmId}`, {
                    notes,
                    resolution,
                    call_logs: callLogs,
                    action_plan_state: newState
                  }).catch(err => {
                    console.error('Failed to update action plan state:', err)
                    toast.error('Failed to update action plan')
                  })
                }}
                onWebhookTrigger={handleWebhookTrigger}
                onOpenGridView={() => setShowGridViewModal(true)}
                fromHistory={fromHistory}
                alarmId={alarmId}
                notes={notes}
                callLogs={callLogs}
              />
            )}

            {activeTab === 'contacts' && (
              <div style={styles.videoSection}>
                <div style={styles.videoHeader}>
                  <h2 style={styles.videoTitle}>
                    <Phone size={18} />
                    Contacts to Call
                  </h2>
                </div>
                <div style={{padding: '1.5rem'}}>
                  {account && account.contacts && account.contacts.length > 0 && !fromHistory ? (
                    <div style={styles.contactsListScrollable}>
                      {account.contacts.map((contact, idx) => (
                        <div key={idx} style={styles.compactContactCard}>
                          <div style={styles.compactContactInfo}>
                            <span style={styles.compactContactName}>{contact.name}</span>
                            <span style={styles.compactContactPhone}>{contact.phone}</span>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedContact(contact)
                              setShowCallModal(true)
                            }}
                            style={styles.compactCallBtn}
                            title="Call"
                          >
                            <Phone size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{textAlign: 'center', padding: '3rem', color: '#64748b'}}>
                      <Phone size={48} style={{marginBottom: '1rem', opacity: 0.5}} />
                      <p style={{margin: 0, fontSize: '1.1rem'}}>No contacts available</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'tenants' && account?.video_type === 'Doorman' && (
              <div style={styles.videoSection}>
                <div style={styles.videoHeader}>
                  <h2 style={styles.videoTitle}>Send Tenant Notifications</h2>
                </div>
                <div style={{padding: '1.5rem'}}>
                  {/* Search Box */}
                  <div style={{marginBottom: '1rem'}}>
                    <input
                      type="text"
                      placeholder="Search by apartment number or tenant name..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '0.5rem',
                        color: '#e2e8f0',
                        fontSize: '0.9rem'
                      }}
                    />
                  </div>

                  {/* Apartment and Tenant List */}
                  <div style={{
                    maxHeight: '400px',
                    overflowY: 'auto',
                    marginBottom: '1.5rem',
                    border: '1px solid #334155',
                    borderRadius: '0.5rem',
                    background: '#1e293b'
                  }}>
                    {apartments
                      .filter(apt => {
                        if (!searchTerm) return true
                        const search = searchTerm.toLowerCase()
                        return apt.apartment_number.toLowerCase().includes(search) ||
                               apt.tenants.some(t => t.name.toLowerCase().includes(search))
                      })
                      .slice(0, 10)
                      .map(apartment => {
                        const allTenantsSelected = apartment.tenants.every(t =>
                          selectedTenants.includes(t.id)
                        )
                        const someTenantsSelected = apartment.tenants.some(t =>
                          selectedTenants.includes(t.id)
                        )
                        const isExpanded = expandedApartments[apartment.id]

                        return (
                          <div key={apartment.id} style={{
                            borderBottom: '1px solid #334155',
                            padding: '1rem'
                          }}>
                            {/* Apartment Header with Checkbox and Expand/Collapse */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.75rem'
                            }}>
                              <input
                                type="checkbox"
                                checked={allTenantsSelected}
                                onChange={(e) => {
                                  e.stopPropagation()
                                  if (allTenantsSelected) {
                                    // Deselect all tenants in this apartment
                                    setSelectedTenants(prev =>
                                      prev.filter(id => !apartment.tenants.map(t => t.id).includes(id))
                                    )
                                  } else {
                                    // Select all tenants in this apartment
                                    const tenantIds = apartment.tenants.map(t => t.id)
                                    setSelectedTenants(prev => [...new Set([...prev, ...tenantIds])])
                                  }
                                }}
                                style={{
                                  width: '18px',
                                  height: '18px',
                                  cursor: 'pointer'
                                }}
                              />
                              <div
                                onClick={() => {
                                  setExpandedApartments(prev => ({
                                    ...prev,
                                    [apartment.id]: !prev[apartment.id]
                                  }))
                                }}
                                style={{
                                  flex: 1,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.75rem',
                                  cursor: 'pointer',
                                  padding: '0.5rem',
                                  borderRadius: '0.375rem',
                                  background: someTenantsSelected ? '#1e40af20' : 'transparent',
                                  transition: 'background 0.2s'
                                }}
                              >
                                <span style={{
                                  fontSize: '1rem',
                                  color: '#94a3b8'
                                }}>
                                  {isExpanded ? '▼' : '▶'}
                                </span>
                                <span style={{
                                  fontWeight: '600',
                                  color: '#e2e8f0',
                                  fontSize: '1rem'
                                }}>
                                  Apartment {apartment.apartment_number}
                                </span>
                                <span style={{
                                  fontSize: '0.75rem',
                                  color: '#94a3b8',
                                  marginLeft: 'auto'
                                }}>
                                  {apartment.tenants.length} tenant{apartment.tenants.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>

                            {/* Tenants List (Collapsible) */}
                            {isExpanded && (
                              <div style={{paddingLeft: '2.5rem', marginTop: '0.5rem'}}>
                                {apartment.tenants.map(tenant => (
                                  <div
                                    key={tenant.id}
                                    onClick={() => {
                                      setSelectedTenants(prev => {
                                        if (prev.includes(tenant.id)) {
                                          return prev.filter(id => id !== tenant.id)
                                        } else {
                                          return [...prev, tenant.id]
                                        }
                                      })
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.75rem',
                                      padding: '0.5rem',
                                      marginBottom: '0.5rem',
                                      cursor: 'pointer',
                                      borderRadius: '0.375rem',
                                      background: selectedTenants.includes(tenant.id) ? '#1e40af30' : 'transparent',
                                      transition: 'background 0.2s'
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedTenants.includes(tenant.id)}
                                      onChange={() => {}} // Handled by parent div onClick
                                      style={{
                                        width: '16px',
                                        height: '16px',
                                        cursor: 'pointer'
                                      }}
                                    />
                                    <div style={{flex: 1}}>
                                      <div style={{
                                        color: '#e2e8f0',
                                        fontWeight: '500',
                                        fontSize: '0.9rem'
                                      }}>
                                        {tenant.name}
                                      </div>
                                      <div style={{
                                        fontSize: '0.75rem',
                                        color: '#94a3b8',
                                        marginTop: '0.25rem'
                                      }}>
                                        {tenant.phone_number && tenant.sms_enabled && '📱 SMS '}
                                        {tenant.email && tenant.email_enabled && '📧 Email'}
                                        {(!tenant.phone_number || !tenant.sms_enabled) && (!tenant.email || !tenant.email_enabled) && 'No notifications enabled'}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}

                    {apartments.length === 0 && (
                      <div style={{
                        textAlign: 'center',
                        padding: '2rem',
                        color: '#64748b'
                      }}>
                        No tenants found for this account
                      </div>
                    )}
                  </div>

                  {/* Notification Type Dropdown */}
                  <div style={{marginBottom: '1rem'}}>
                    <label style={{
                      display: 'block',
                      marginBottom: '0.5rem',
                      color: '#e2e8f0',
                      fontWeight: '500'
                    }}>
                      Notification Type
                    </label>
                    <select
                      value={notificationType}
                      onChange={(e) => setNotificationType(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '0.5rem',
                        color: '#e2e8f0',
                        fontSize: '0.9rem',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="Package Delivery">Package Delivery</option>
                      <option value="Dry Cleaning">Dry Cleaning</option>
                    </select>
                  </div>

                  {/* Notes Field */}
                  <div style={{marginBottom: '1.5rem'}}>
                    <label style={{
                      display: 'block',
                      marginBottom: '0.5rem',
                      color: '#e2e8f0',
                      fontWeight: '500'
                    }}>
                      Additional Notes (Optional)
                    </label>
                    <textarea
                      value={tenantNotes}
                      onChange={(e) => setTenantNotes(e.target.value)}
                      placeholder="Add any additional notes to include in the notification..."
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '0.5rem',
                        color: '#e2e8f0',
                        fontSize: '0.9rem',
                        resize: 'vertical',
                        fontFamily: 'inherit'
                      }}
                    />
                  </div>

                  {/* Selected Count and Submit Button */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem'
                  }}>
                    <div style={{color: '#94a3b8', fontSize: '0.9rem'}}>
                      {selectedTenants.length} tenant{selectedTenants.length !== 1 ? 's' : ''} selected
                    </div>
                    <button
                      onClick={async () => {
                        if (selectedTenants.length === 0) {
                          toast.error('Please select at least one tenant')
                          return
                        }

                        try {
                          setSendingNotifications(true)

                          const response = await api.post('/tenants/notify', {
                            tenant_ids: selectedTenants,
                            notification_type: notificationType,
                            notes: tenantNotes,
                            account_id: account.id,
                            alarm_id: parseInt(alarmId)
                          })

                          toast.success(response.data.message || 'Notifications sent successfully')

                          // Clear selections and notes
                          setSelectedTenants([])
                          setTenantNotes('')
                        } catch (error) {
                          console.error('Failed to send notifications:', error)
                          toast.error(error.response?.data?.detail || 'Failed to send notifications')
                        } finally {
                          setSendingNotifications(false)
                        }
                      }}
                      disabled={sendingNotifications || selectedTenants.length === 0}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem 1.5rem',
                        background: selectedTenants.length === 0 ? '#334155' : '#3b82f6',
                        border: 'none',
                        borderRadius: '0.5rem',
                        color: '#fff',
                        fontWeight: '600',
                        fontSize: '0.9rem',
                        cursor: selectedTenants.length === 0 ? 'not-allowed' : 'pointer',
                        opacity: sendingNotifications ? 0.6 : 1,
                        transition: 'all 0.2s'
                      }}
                    >
                      {sendingNotifications ? 'Sending...' : 'Send Notifications'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notes' && (
              <div style={styles.bottomSection}>
                <h2 style={styles.sectionTitle}>Account Notes (Permanent)</h2>
                <textarea
                  style={styles.notesInput}
                  value={accountNotes}
                  onChange={(e) => setAccountNotes(e.target.value)}
                  onBlur={() => {
                    // Auto-save when user stops editing
                    if (account) {
                      api.put(`/accounts/${account.id}`, {
                        ...account,
                        notes: accountNotes
                      }).catch(err => {
                        console.error('Failed to save account notes:', err)
                        toast.error('Failed to save account notes')
                      })
                    }
                  }}
                  placeholder="Add permanent notes about this account (e.g., gate codes, special instructions)..."
                  disabled={fromHistory}
                />
              </div>
            )}

            {activeTab === 'tools' && account && (
              <ToolsManager
                accountId={account.id}
                readOnly={true}
                onRelayTriggered={(data) => {
                  // Handle camera view tool
                  if (typeof data === 'object' && data.type === 'camera_view') {
                    const config = data.config
                    if (config.view_type === 'single' && config.cameras?.length > 0) {
                      // Just switch camera like the dropdown does - don't filter
                      setViewMode('single')
                      setSelectedCameraId(config.cameras[0].id)
                      setFilteredCameras(null) // Don't filter for single view
                    } else if (config.view_type === 'grid' && config.cameras?.length > 0) {
                      // Switch to grid view with only selected cameras
                      setViewMode('grid')
                      setFilteredCameras(config.cameras)
                    }
                  }
                  // Handle legacy relay grid view
                  else if (data === true) {
                    setViewMode('grid')
                    setFilteredCameras(null) // Show all cameras
                  }
                }}
              />
            )}

            {activeTab === 'actions' && !fromHistory && (
              <div style={{padding: '1.5rem'}}>
                {/* Notes Section */}
                <div style={styles.bottomSection}>
                  <h2 style={styles.sectionTitle}>Alarm Notes (Incident-Specific)</h2>
                  <textarea
                    style={styles.notesInput}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={() => {
                      // Auto-save when user stops editing
                      api.put(`/alarms/${alarmId}`, {
                        notes,
                        resolution,
                        call_logs: callLogs,
                        action_plan_state: actionPlanState
                      }).catch(err => {
                        console.error('Failed to save notes:', err)
                        toast.error('Failed to save notes')
                      })
                    }}
                    placeholder="Add notes about this specific alarm incident..."
                    rows={4}
                  />
                </div>

                {/* Resolution Selection */}
                <div style={{...styles.bottomSection, marginTop: '1.5rem'}}>
                  <h2 style={styles.sectionTitle}>Resolution</h2>
                  <div style={styles.field}>
                    <select
                      style={styles.resolutionSelect}
                      value={resolution}
                      onChange={(e) => {
                        setResolution(e.target.value)
                        api.put(`/alarms/${alarmId}`, {
                          notes,
                          resolution: e.target.value,
                          call_logs: callLogs,
                          action_plan_state: actionPlanState
                        }).catch(err => {
                          console.error('Failed to update resolution:', err)
                          toast.error('Failed to update resolution')
                        })
                      }}
                    >
                      <option value="">-- Select Resolution --</option>
                      <option value="False Alarm">False Alarm</option>
                      <option value="Resolved">Resolved</option>
                      <option value="Police Dispatched">Police Dispatched</option>
                      <option value="Fire Department Dispatched">Fire Department Dispatched</option>
                      <option value="Medical Emergency">Medical Emergency</option>
                      <option value="Duplicate">Duplicate</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Resolve Button */}
                <div style={{...styles.actionsContainer, marginTop: '1.5rem'}}>
                  <button style={styles.resolveButton} onClick={handleResolve}>
                    <CheckCircle size={20} />
                    <span>Resolve Alarm</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Live Feed (Always Visible) */}
        <LiveCameraFeed
          fromHistory={fromHistory}
          allCameras={filteredCameras || allCameras}
          camera={camera}
          selectedCameraId={selectedCameraId}
          onCameraChange={setSelectedCameraId}
          viewMode={viewMode}
          onViewModeChange={(mode) => {
            setViewMode(mode)
            // Reset filtered cameras when switching modes manually
            if (mode === 'grid') {
              setFilteredCameras(null)
            }
          }}
          liveVideoRef={liveVideoRef}
          notes={notes}
          callLogs={callLogs}
          account={account}
          event={event}
          formatTimestampInTimezone={formatTimestampInTimezone}
          onDialInboundNumber={handleDialInboundNumber}
          onToolTriggered={(data) => {
            if (data === true) {
              // Boolean true = show all cameras in grid (for relay tools)
              setViewMode('grid')
              setFilteredCameras(null)
            } else if (data && typeof data === 'object' && data.cameras) {
              // Object with cameras = show filtered cameras (for camera view tools)
              if (data.view_type === 'grid') {
                setViewMode('grid')
                setFilteredCameras(data.cameras)
              } else if (data.view_type === 'single' && data.cameras.length > 0) {
                setViewMode('single')
                setSelectedCameraId(data.cameras[0].id)
                setFilteredCameras(null)
              }
            }
          }}
        />
      </div>

      {/* Grid View Modal */}
      {showGridViewModal && allCameras.length > 0 && (
        <CameraGridModalForAlarm
          cameras={allCameras}
          onClose={() => setShowGridViewModal(false)}
        />
      )}

      {/* Escalate Modal */}
      {showEscalateModal && (
        <div style={styles.modalOverlay} onClick={handleCancelEscalate}>
          <div style={styles.escalateModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.escalateModalHeader}>
              <h3 style={styles.escalateModalTitle}>Escalate Alarm</h3>
              <button style={styles.escalateModalCloseBtn} onClick={handleCancelEscalate}>
                <X size={20} />
              </button>
            </div>
            <div style={styles.escalateModalBody}>
              <label style={styles.escalateModalLabel}>Add escalation notes:</label>
              <textarea
                style={styles.escalateModalTextarea}
                placeholder="Describe why this alarm needs escalation..."
                value={escalateNotes}
                onChange={(e) => setEscalateNotes(e.target.value)}
                rows={5}
                autoFocus
              />
            </div>
            <div style={styles.escalateModalFooter}>
              <button style={styles.escalateModalCancelBtn} onClick={handleCancelEscalate}>
                Cancel
              </button>
              <button style={styles.escalateModalConfirmBtn} onClick={handleConfirmEscalate}>
                <ArrowUpCircle size={18} />
                <span>Escalate</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hold Modal */}
      {showHoldModal && (
        <div style={styles.modalOverlay} onClick={handleCancelHold}>
          <div style={styles.escalateModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.escalateModalHeader}>
              <h3 style={styles.escalateModalTitle}>Hold Alarm</h3>
              <button style={styles.escalateModalCloseBtn} onClick={handleCancelHold}>
                <X size={20} />
              </button>
            </div>
            <div style={styles.escalateModalBody}>
              <label style={styles.escalateModalLabel}>Add hold notes:</label>
              <textarea
                style={styles.escalateModalTextarea}
                placeholder="Describe why this alarm needs to be held..."
                value={holdNotes}
                onChange={(e) => setHoldNotes(e.target.value)}
                rows={5}
                autoFocus
              />
            </div>
            <div style={styles.escalateModalFooter}>
              <button style={styles.escalateModalCancelBtn} onClick={handleCancelHold}>
                Cancel
              </button>
              <button style={styles.holdModalConfirmBtn} onClick={handleConfirmHold}>
                <Pause size={18} />
                <span>Hold</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Call Modal */}
      {showCallModal && selectedContact && (
        <CallModal
          contact={selectedContact}
          onClose={() => {
            setShowCallModal(false)
            setSelectedContact(null)
          }}
          onSaveCallLog={handleSaveCallLog}
          alarmId={parseInt(alarmId)}
          eventId={event?.id}
          existingSession={activeCalls[selectedContact.phone]?.session || null}
          existingCallState={activeCalls[selectedContact.phone]?.callState || null}
        />
      )}

      {/* Hidden audio element for remote call audio */}
      <audio ref={remoteAudioRef} autoPlay />
    </div>
  )
}

function CameraGridModalForAlarm({ cameras, onClose }) {
  const hlsInstancesRef = useRef({})
  const camerasRef = useRef(cameras)
  const isMountedRef = useRef(true)

  useEffect(() => {
    camerasRef.current = cameras
  }, [cameras])

  useEffect(() => {
    const loadStreams = async () => {
      console.log('CameraGridModalForAlarm: Loading streams for', cameras.length, 'cameras')

      cameras
        .filter(cam => cam.rtsp_url)
        .forEach(async (cam) => {
          try {
            console.log(`Starting stream for camera ${cam.id}:`, cam.name)
            const statusResponse = await api.get(`/cameras/${cam.id}/stream-status`)
            if (!statusResponse.data.is_streaming) {
              await api.post(`/cameras/${cam.id}/start-stream?quality=low`)
              console.log(`Stream started for camera ${cam.id} (${cam.name}) in LOW quality`)
            } else {
              console.log(`Stream already running for camera ${cam.id} (${cam.name})`)
            }

            console.log(`Polling for camera ${cam.id} (${cam.name}) playlist...`)
            for (let attempt = 0; attempt < 60; attempt++) {
              try {
                const status = await api.get(`/cameras/${cam.id}/stream-status`)
                if (status.data.stream_url) {
                  const readyTime = (attempt + 1) * 500
                  console.log(`✓ Camera ${cam.id} (${cam.name}) ready after ${readyTime}ms - loading now!`)
                  loadSingleCamera(cam)
                  break
                }
                await new Promise(resolve => setTimeout(resolve, 500))
              } catch (error) {
                console.error(`Error polling camera ${cam.id}:`, error)
                await new Promise(resolve => setTimeout(resolve, 500))
              }
            }
          } catch (error) {
            console.error(`Failed to start stream for camera ${cam.id}:`, error)
          }
        })
    }

    const loadSingleCamera = (cam) => {
      const videoEl = document.getElementById(`alarm-grid-video-${cam.id}`)

      if (!videoEl) {
        console.warn(`Video element for camera ${cam.id} not found`)
        return
      }

      if (window.Hls && window.Hls.isSupported()) {
        console.log(`Initializing HLS for camera ${cam.id} (${cam.name})`)
        const hls = new window.Hls({
          debug: false,
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 10,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 5,
          maxBufferLength: 15,
          maxMaxBufferLength: 30,
          highBufferWatchdogPeriod: 1
        })

        const streamUrl = `/streams/${cam.id}/playlist.m3u8`
        console.log(`Loading HLS source for camera ${cam.id}:`, streamUrl)
        hls.loadSource(streamUrl)
        hls.attachMedia(videoEl)

        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          console.log(`✓ HLS manifest parsed for camera ${cam.id} (${cam.name}), playing now!`)
          videoEl.play().catch(e => console.log(`Autoplay prevented for camera ${cam.id}:`, e))
        })

        hls.on(window.Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.error(`HLS fatal error for camera ${cam.id}:`, data)
            switch (data.type) {
              case window.Hls.ErrorTypes.NETWORK_ERROR:
                console.log(`Network error for camera ${cam.id}, attempting recovery...`)
                hls.startLoad()
                break
              case window.Hls.ErrorTypes.MEDIA_ERROR:
                console.log(`Media error for camera ${cam.id}, attempting recovery...`)
                hls.recoverMediaError()
                break
              default:
                console.error(`Unrecoverable error for camera ${cam.id}`)
                break
            }
          }
        })

        hlsInstancesRef.current[cam.id] = hls
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        console.log(`Using native HLS for camera ${cam.id}`)
        videoEl.src = `/streams/${cam.id}/playlist.m3u8`
        videoEl.play().catch(e => console.log('Autoplay prevented:', e))
      }
    }

    loadStreams()

    return () => {
      console.log('CameraGridModalForAlarm: Cleanup called')
      isMountedRef.current = false

      Object.values(hlsInstancesRef.current).forEach(hls => {
        if (hls) hls.destroy()
      })
      hlsInstancesRef.current = {}

      console.log('CameraGridModalForAlarm: Stopping', camerasRef.current.length, 'streams')
      camerasRef.current.forEach(cam => {
        console.log(`Stopping stream for camera ${cam.id}`)
        api.post(`/cameras/${cam.id}/stop-stream`)
          .catch(err => console.error(`Failed to stop stream for camera ${cam.id}:`, err))
      })
    }
  }, [])

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.gridModal} onClick={e => e.stopPropagation()}>
        <div style={styles.gridModalHeader}>
          <h2 style={styles.modalTitle}>
            All Cameras Grid View
          </h2>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div style={styles.gridModalContent}>
          <div style={styles.cameraGrid}>
            {cameras.map(cam => (
              <div key={cam.id} style={styles.gridItem}>
                <div style={styles.gridItemHeader}>
                  <span style={styles.gridCameraName}>{cam.name}</span>
                  {cam.location && (
                    <span style={styles.gridCameraLocation}>{cam.location}</span>
                  )}
                </div>
                {cam.rtsp_url ? (
                  <video
                    id={`alarm-grid-video-${cam.id}`}
                    style={styles.gridVideo}
                    controls
                    muted
                    playsInline
                  />
                ) : (
                  <div style={styles.gridNoFeed}>
                    <CameraIcon size={32} />
                    <span>No RTSP configured</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={styles.gridModalFooter}>
          <button style={styles.cancelBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}



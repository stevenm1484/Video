import { create } from 'zustand'
import * as JsSIP from 'jssip'

export const usePBXStore = create((set, get) => ({
  // State
  isRegistered: false,
  isRegistering: false,
  registrationError: null,
  ua: null,
  activeSession: null,

  // Actions
  setRegistered: (isRegistered) => set({ isRegistered }),
  setRegistering: (isRegistering) => set({ isRegistering }),
  setError: (error) => set({ registrationError: error }),
  setUA: (ua) => set({ ua }),
  setActiveSession: (session) => set({ activeSession: session }),

  // Register to PBX
  register: async (user, pbxConfig = null) => {
    if (!user?.sip_extension) {
      set({ registrationError: 'No SIP extension configured', isRegistered: false })
      return false
    }

    // Default PBX config (you can customize this via environment variables or API)
    const config = pbxConfig || {
      wsServer: import.meta.env.VITE_PBX_WS_SERVER || 'ipbx.statewidecentralstation.com:8089',
      domain: import.meta.env.VITE_PBX_DOMAIN || 'ipbx.statewidecentralstation.com',
      displayName: user.full_name || user.username
    }

    set({ isRegistering: true, registrationError: null })

    try {
      // Disable JsSIP debug mode in production
      if (import.meta.env.PROD) {
        JsSIP.debug.disable('JsSIP:*')
      }

      // Clean up existing UA if any
      const existingUA = get().ua
      if (existingUA) {
        try {
          existingUA.stop()
        } catch (e) {
          console.error('[PBX] Error stopping existing UA:', e)
        }
      }

      // Configure SIP connection
      const wsUrl = `wss://${config.wsServer}/ws`

      const socket = new JsSIP.WebSocketInterface(wsUrl)
      const configuration = {
        sockets: [socket],
        uri: `sip:${user.sip_extension}@${config.domain}`,
        password: user.sip_password || '',
        display_name: config.displayName,
        session_timers: false,
        register: true,
        register_expires: 600, // 10 minutes
        connection_recovery_min_interval: 2,
        connection_recovery_max_interval: 30,
        no_answer_timeout: 60,
        use_preloaded_route: false
      }

      const ua = new JsSIP.UA(configuration)

      // Event handlers
      ua.on('connected', () => {
        // WebSocket connected
      })

      ua.on('disconnected', (e) => {
        set({ isRegistered: false, registrationError: 'Disconnected from PBX' })
      })

      ua.on('registered', () => {
        set({ isRegistered: true, isRegistering: false, registrationError: null })
      })

      ua.on('unregistered', () => {
        set({ isRegistered: false })
      })

      ua.on('registrationFailed', (e) => {

        // Provide more helpful error messages based on SIP response codes
        let errorMessage = 'Registration failed'
        if (e.response) {
          const code = e.response.status_code
          switch (code) {
            case 401:
              errorMessage = 'Authentication failed - Wrong password'
              break
            case 403:
              errorMessage = 'Forbidden - Extension not allowed to register'
              break
            case 404:
              errorMessage = 'Not Found - Extension does not exist'
              break
            case 408:
              errorMessage = 'Request Timeout - Network connectivity issue'
              break
            default:
              errorMessage = `Registration failed: ${e.response.reason_phrase || e.cause || 'Unknown error'}`
          }
        } else if (e.cause) {
          errorMessage = `Registration failed: ${e.cause}`
        }

        set({
          isRegistered: false,
          isRegistering: false,
          registrationError: errorMessage
        })
      })

      ua.on('newRTCSession', (e) => {
        const session = e.session

        if (session.direction === 'incoming') {
          // Handle incoming calls (auto-reject for now, can be customized)
          session.terminate()
        }
      })

      set({ ua })
      ua.start()

      return true
    } catch (error) {
      set({
        isRegistered: false,
        isRegistering: false,
        registrationError: `Failed to initialize: ${error.message}`
      })
      return false
    }
  },

  // Unregister from PBX
  unregister: () => {
    const ua = get().ua
    if (ua) {
      try {
        ua.unregister()
        ua.stop()
      } catch (e) {
        // Silent cleanup
      }
    }
    set({
      isRegistered: false,
      isRegistering: false,
      ua: null,
      activeSession: null,
      registrationError: null
    })
  },

  // Make outbound call
  makeCall: (phoneNumber, pbxConfig, eventHandlers = null, trackingId = null) => {
    const { ua, isRegistered } = get()

    if (!ua || !isRegistered) {
      return null
    }

    const config = pbxConfig || {
      domain: import.meta.env.VITE_PBX_DOMAIN || 'ipbx.statewidecentralstation.com'
    }

    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '')

    const options = {
      mediaConstraints: {
        audio: true,
        video: false
      },
      rtcOfferConstraints: {
        offerToReceiveAudio: 1,
        offerToReceiveVideo: 0
      },
      // Ensure proper audio handling
      pcConfig: {
        iceServers: [],
        rtcpMuxPolicy: 'require'
      },
      rtcAnswerConstraints: {
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      }
    }

    // Add custom SIP headers with tracking ID if provided
    if (trackingId) {
      const trackingParts = trackingId.split('-') // VM-alarmId-eventId-timestamp
      const alarmId = trackingParts[1] || ''
      const eventId = trackingParts[2] || ''

      options.extraHeaders = [
        `X-VM-Tracking-ID: ${trackingId}`,
        `X-VM-Alarm-ID: ${alarmId}`,
        `X-VM-Event-ID: ${eventId}`
      ]
      console.log('[PBX] Adding tracking headers:', options.extraHeaders)
    }

    // Add event handlers if provided (critical for proper audio handling)
    if (eventHandlers) {
      options.eventHandlers = eventHandlers
    }

    try {
      // For parking slot retrieval (2-3 digit numbers), use ParkedCall application
      // instead of direct extension dial to properly retrieve the parked call
      let dialString
      if (cleanNumber.length <= 3) {
        // This is a parking slot - dial it as an extension with ParkedCall
        // FreePBX parking slots are typically 70-79 or similar short numbers
        console.log(`[PBX] Dialing parking slot extension: ${cleanNumber}`)
        dialString = `sip:${cleanNumber}@${config.domain}`
      } else {
        // Regular phone number - dial normally
        console.log(`[PBX] Dialing phone number: ${cleanNumber}`)
        dialString = `sip:${cleanNumber}@${config.domain}`
      }

      const session = ua.call(dialString, options)
      set({ activeSession: session })
      return session
    } catch (error) {
      console.error('[PBX] makeCall error:', error)
      return null
    }
  },

  // End active call
  endCall: () => {
    const session = get().activeSession
    if (session) {
      try {
        session.terminate()
      } catch (e) {
        // Silent cleanup
      }
      set({ activeSession: null })
    }
  },

  // Reset state
  reset: () => {
    const ua = get().ua
    if (ua) {
      try {
        ua.stop()
      } catch (e) {
        // Silent cleanup
      }
    }
    set({
      isRegistered: false,
      isRegistering: false,
      registrationError: null,
      ua: null,
      activeSession: null
    })
  }
}))

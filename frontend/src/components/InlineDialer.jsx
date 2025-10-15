import React, { useState, useEffect, useRef } from 'react'
import { Phone, PhoneOff, Hash } from 'lucide-react'
import { usePBXStore } from '../store/pbxStore'

const InlineDialer = ({ contact, onCallLog }) => {
  const [callState, setCallState] = useState('idle') // idle, connecting, ringing, connected, ended
  const [callDuration, setCallDuration] = useState(0)
  const [callStartTime, setCallStartTime] = useState(null)
  const [showKeypad, setShowKeypad] = useState(false)

  const isRegistered = usePBXStore(state => state.isRegistered)
  const ua = usePBXStore(state => state.ua)

  const sessionRef = useRef(null)
  const timerRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const keypadToggleRef = useRef(null)
  const [keypadPosition, setKeypadPosition] = useState({ top: 0, left: 0 })

  // Call duration timer
  useEffect(() => {
    if (callState === 'connected' && callStartTime) {
      timerRef.current = setInterval(() => {
        const duration = Math.floor((Date.now() - callStartTime) / 1000)
        setCallDuration(duration)
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [callState, callStartTime])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        try {
          sessionRef.current.terminate()
        } catch (e) {
          // Silent cleanup
        }
      }
    }
  }, [])

  const initiateCall = () => {
    if (!ua || !isRegistered) {
      return
    }

    if (!contact.phone) {
      return
    }

    setCallState('connecting')

    const phoneNumber = contact.phone.replace(/[^0-9]/g, '')

    const eventHandlers = {
      'progress': () => {
        setCallState('ringing')
      },
      'confirmed': () => {
        setCallState('connected')
        setCallStartTime(Date.now())
      },
      'ended': () => {
        handleCallEnded()
      },
      'failed': (e) => {
        setCallState('idle')
      },
      'peerconnection': (e) => {
        const peerconnection = e.peerconnection

        peerconnection.addEventListener('addstream', (event) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = event.stream
            remoteAudioRef.current.play().catch(() => {
              // Silent error handling
            })
          }
        })

        peerconnection.addEventListener('track', (event) => {
          if (remoteAudioRef.current && event.streams && event.streams[0]) {
            remoteAudioRef.current.srcObject = event.streams[0]
            remoteAudioRef.current.play().catch(() => {
              // Silent error handling
            })
          }
        })
      }
    }

    const options = {
      eventHandlers: eventHandlers,
      mediaConstraints: {
        audio: true,
        video: false
      },
      rtcOfferConstraints: {
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      },
      pcConfig: {
        rtcpMuxPolicy: 'negotiate',
        iceServers: []
      },
      // Ensure RFC2833 DTMF is negotiated in SDP
      rtcAnswerConstraints: {
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      }
    }

    try {
      const session = ua.call(`sip:${phoneNumber}@${import.meta.env.VITE_PBX_DOMAIN || 'ipbx.statewidecentralstation.com'}`, options)

      if (session) {
        sessionRef.current = session
      }
    } catch (error) {
      setCallState('idle')
    }
  }

  const handleCallEnded = () => {
    const endTime = Date.now()
    const duration = callStartTime ? Math.floor((endTime - callStartTime) / 1000) : 0

    setCallState('idle')
    setCallDuration(0)
    setCallStartTime(null)
    setShowKeypad(false)

    // Save call log
    if (onCallLog) {
      onCallLog({
        contact: contact.name,
        phone: contact.phone,
        timestamp: new Date().toISOString(),
        duration: duration,
        type: 'outbound',
        status: duration > 0 ? 'completed' : 'no-answer'
      })
    }
  }

  const handleEndCall = () => {
    if (sessionRef.current) {
      try {
        sessionRef.current.terminate()
      } catch (e) {
        // Silent cleanup
      }
    }
    handleCallEnded()
  }

  const handleDTMF = (digit) => {
    if (sessionRef.current && callState === 'connected') {
      try {
        const connection = sessionRef.current.connection

        if (connection) {
          const senders = connection.getSenders()
          const audioSender = senders.find(sender => sender.track && sender.track.kind === 'audio')

          if (audioSender && audioSender.dtmf && audioSender.dtmf.canInsertDTMF) {
            // Use RTCDTMFSender for in-band DTMF (RFC2833)
            audioSender.dtmf.insertDTMF(digit, 200, 70)
            return
          }
        }

        // Fallback to JsSIP sendDTMF (will use SIP INFO)
        const options = {
          duration: 200,
          interToneGap: 70
        }
        sessionRef.current.sendDTMF(digit, options)
      } catch (e) {
        // Silent error handling
      }
    }
  }

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getStatusText = () => {
    switch (callState) {
      case 'connecting':
        return 'Connecting...'
      case 'ringing':
        return 'Ringing...'
      case 'connected':
        return formatDuration(callDuration)
      default:
        return ''
    }
  }

  const getStatusColor = () => {
    switch (callState) {
      case 'connecting':
      case 'ringing':
        return '#f59e0b'
      case 'connected':
        return '#10b981'
      default:
        return '#64748b'
    }
  }

  const isInCall = callState !== 'idle'

  return (
    <div style={styles.container}>
      {/* Call/Hangup Button with Status */}
      <div style={styles.callButtonContainer}>
        <button
          onClick={isInCall ? handleEndCall : initiateCall}
          disabled={!isRegistered && !isInCall}
          style={{
            ...styles.callButton,
            ...(isInCall ? styles.hangupButton : styles.dialButton),
            ...((!isRegistered && !isInCall) ? styles.disabledButton : {})
          }}
          title={isInCall ? 'Hang up' : (isRegistered ? 'Call' : 'PBX not connected')}
        >
          {isInCall ? <PhoneOff size={16} /> : <Phone size={16} />}
        </button>

        {isInCall && (
          <span style={{...styles.status, color: getStatusColor()}}>
            {getStatusText()}
          </span>
        )}
      </div>

      {/* Keypad Toggle (only show when connected) */}
      {callState === 'connected' && (
        <button
          ref={keypadToggleRef}
          onClick={() => {
            if (!showKeypad && keypadToggleRef.current) {
              const rect = keypadToggleRef.current.getBoundingClientRect()
              // Position keypad to the right of the buttons to avoid overlap
              setKeypadPosition({
                top: rect.top,
                left: rect.right + 10
              })
            }
            setShowKeypad(!showKeypad)
          }}
          style={styles.keypadToggle}
          title="Toggle keypad"
        >
          <Hash size={16} />
        </button>
      )}

      {/* DTMF Keypad Portal (show when toggled and connected) */}
      {showKeypad && callState === 'connected' && (
        <div style={styles.keypadOverlay}>
          <div style={{
            ...styles.keypad,
            top: `${keypadPosition.top}px`,
            left: `${keypadPosition.left}px`
          }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
              <button
                key={digit}
                onClick={() => handleDTMF(digit)}
                style={styles.keypadButton}
              >
                {digit}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hidden audio element for remote stream */}
      <audio ref={remoteAudioRef} autoPlay />
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    position: 'relative',
    zIndex: 1
  },
  callButtonContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  callButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
    padding: 0
  },
  dialButton: {
    background: '#10b981',
    color: 'white'
  },
  hangupButton: {
    background: '#ef4444',
    color: 'white'
  },
  disabledButton: {
    background: '#475569',
    cursor: 'not-allowed',
    opacity: 0.5
  },
  status: {
    fontSize: '0.875rem',
    fontWeight: '600',
    minWidth: '70px'
  },
  keypadToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#94a3b8',
    cursor: 'pointer',
    transition: 'all 0.2s',
    padding: 0
  },
  keypadOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999999,
    pointerEvents: 'none'
  },
  keypad: {
    position: 'fixed',
    background: '#1e293b',
    border: '2px solid #334155',
    borderRadius: '0.75rem',
    padding: '1rem',
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.75rem',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
    pointerEvents: 'auto'
  },
  keypadButton: {
    width: '50px',
    height: '50px',
    background: '#334155',
    border: 'none',
    color: '#f1f5f9',
    borderRadius: '0.5rem',
    fontSize: '1.25rem',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s'
  }
}

export default InlineDialer

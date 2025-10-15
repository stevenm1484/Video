import React, { useState, useEffect, useRef } from 'react'
import { X, Phone, PhoneOff, Mic, MicOff } from 'lucide-react'
import { usePBXStore } from '../store/pbxStore'

const DialerModal = ({ contact, onClose, onSave }) => {
  const [callState, setCallState] = useState('idle') // idle, connecting, ringing, connected, ended
  const [callDuration, setCallDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [callStartTime, setCallStartTime] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  // Get PBX state from centralized store
  const isRegistered = usePBXStore(state => state.isRegistered)
  const makeCall = usePBXStore(state => state.makeCall)
  const ua = usePBXStore(state => state.ua)

  const sessionRef = useRef(null)
  const timerRef = useRef(null)
  const remoteAudioRef = useRef(null)

  // Auto-dial when component mounts and PBX is registered
  useEffect(() => {
    if (!isRegistered) {
      setErrorMessage('PBX not registered. Please wait for connection.')
      return
    }

    if (!contact.phone) {
      setErrorMessage('No phone number available')
      return
    }

    // Auto-dial once we confirm PBX is registered
    console.log('[DialerModal] PBX registered, initiating call to:', contact.phone)
    initiateCall()

    // Cleanup
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (sessionRef.current) {
        try {
          sessionRef.current.terminate()
        } catch (e) {
          console.error('[DialerModal] Error terminating session:', e)
        }
      }
    }
  }, [isRegistered])

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

  const initiateCall = () => {
    if (!ua || !isRegistered) {
      setErrorMessage('PBX not ready. Please wait.')
      return
    }

    if (!contact.phone) {
      setErrorMessage('No phone number available')
      return
    }

    setCallState('connecting')
    setErrorMessage('')

    console.log('[DialerModal] Initiating call to:', contact.phone)

    const phoneNumber = contact.phone.replace(/[^0-9]/g, '')

    const eventHandlers = {
      'progress': () => {
        console.log('[DialerModal] Call in progress (ringing)')
        setCallState('ringing')
      },
      'confirmed': () => {
        console.log('[DialerModal] Call confirmed (answered)')
        setCallState('connected')
        setCallStartTime(Date.now())
      },
      'ended': () => {
        console.log('[DialerModal] Call ended')
        handleCallEnded()
      },
      'failed': (e) => {
        console.error('[DialerModal] Call failed:', e)
        setErrorMessage(`Call failed: ${e.cause || 'Unknown error'}`)
        setCallState('ended')
      },
      'peerconnection': (e) => {
        console.log('[DialerModal] Peer connection established')
        const peerconnection = e.peerconnection

        peerconnection.addEventListener('addstream', (event) => {
          console.log('[DialerModal] Remote audio stream received')
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = event.stream
            remoteAudioRef.current.play().catch(err => {
              console.error('[DialerModal] Error playing audio:', err)
            })
          }
        })

        // Modern browsers use 'track' event instead of 'addstream'
        peerconnection.addEventListener('track', (event) => {
          console.log('[DialerModal] Remote audio track received')
          if (remoteAudioRef.current && event.streams && event.streams[0]) {
            remoteAudioRef.current.srcObject = event.streams[0]
            remoteAudioRef.current.play().catch(err => {
              console.error('[DialerModal] Error playing audio:', err)
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
      }
    }

    try {
      // Use the centralized makeCall from PBX store
      // But we need to attach event handlers, so we'll call directly on UA
      const session = ua.call(`sip:${phoneNumber}@${import.meta.env.VITE_PBX_DOMAIN || 'ipbx.statewidecentralstation.com'}`, options)

      if (session) {
        sessionRef.current = session
        console.log('[DialerModal] Call session created successfully')
      } else {
        throw new Error('Failed to create call session')
      }
    } catch (error) {
      console.error('[DialerModal] Error making call:', error)
      setErrorMessage('Failed to place call')
      setCallState('ended')
    }
  }

  const handleCallEnded = () => {
    const endTime = Date.now()
    const duration = callStartTime ? Math.floor((endTime - callStartTime) / 1000) : 0

    setCallState('ended')

    // Save call log
    const callLog = {
      contact: contact.name,
      phone: contact.phone,
      timestamp: new Date().toISOString(),
      duration: duration,
      type: 'outbound',
      status: duration > 0 ? 'completed' : 'failed'
    }

    if (onSave) {
      onSave(callLog)
    }

    // Auto-close modal after 2 seconds
    setTimeout(() => {
      onClose()
    }, 2000)
  }

  const handleEndCall = () => {
    if (sessionRef.current) {
      try {
        sessionRef.current.terminate()
      } catch (e) {
        console.error('Error ending call:', e)
      }
    }
    handleCallEnded()
  }

  const handleToggleMute = () => {
    if (sessionRef.current) {
      if (isMuted) {
        sessionRef.current.unmute()
      } else {
        sessionRef.current.mute()
      }
      setIsMuted(!isMuted)
    }
  }

  const handleDTMF = (digit) => {
    if (sessionRef.current && callState === 'connected') {
      try {
        sessionRef.current.sendDTMF(digit)
      } catch (e) {
        console.error('Error sending DTMF:', e)
      }
    }
  }

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getStatusText = () => {
    switch (callState) {
      case 'connecting':
        return 'Connecting...'
      case 'ringing':
        return 'Ringing...'
      case 'connected':
        return formatDuration(callDuration)
      case 'ended':
        return 'Call Ended'
      default:
        return 'Idle'
    }
  }

  const getStatusColor = () => {
    switch (callState) {
      case 'connecting':
      case 'ringing':
        return '#f59e0b'
      case 'connected':
        return '#10b981'
      case 'ended':
        return '#ef4444'
      default:
        return '#64748b'
    }
  }

  const styles = {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      animation: 'fadeIn 0.2s ease-in'
    },
    modal: {
      backgroundColor: '#1e293b',
      borderRadius: '16px',
      width: '90%',
      maxWidth: '400px',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      animation: 'slideUp 0.3s ease-out',
      border: '1px solid #334155'
    },
    header: {
      padding: '1.5rem',
      borderBottom: '1px solid #334155',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    title: {
      margin: 0,
      fontSize: '1.25rem',
      fontWeight: '600',
      color: '#f1f5f9'
    },
    closeBtn: {
      background: 'none',
      border: 'none',
      color: '#94a3b8',
      cursor: 'pointer',
      padding: '0.5rem',
      borderRadius: '6px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.2s'
    },
    body: {
      padding: '2rem'
    },
    contactInfo: {
      textAlign: 'center',
      marginBottom: '2rem'
    },
    contactName: {
      fontSize: '1.5rem',
      fontWeight: '600',
      color: '#f1f5f9',
      marginBottom: '0.5rem'
    },
    contactPhone: {
      fontSize: '1.125rem',
      color: '#94a3b8',
      marginBottom: '1rem'
    },
    statusBadge: {
      display: 'inline-block',
      padding: '0.5rem 1rem',
      borderRadius: '20px',
      fontSize: '0.875rem',
      fontWeight: '600',
      marginTop: '0.5rem'
    },
    errorMessage: {
      backgroundColor: '#fee2e2',
      color: '#991b1b',
      padding: '0.75rem',
      borderRadius: '8px',
      marginBottom: '1rem',
      fontSize: '0.875rem',
      textAlign: 'center'
    },
    dialpad: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '0.75rem',
      marginBottom: '1.5rem'
    },
    dialpadBtn: {
      backgroundColor: '#334155',
      border: 'none',
      color: '#f1f5f9',
      padding: '1rem',
      borderRadius: '12px',
      fontSize: '1.5rem',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s',
      outline: 'none'
    },
    controlButtons: {
      display: 'flex',
      gap: '1rem',
      justifyContent: 'center'
    },
    controlBtn: {
      padding: '1rem',
      borderRadius: '50%',
      border: 'none',
      cursor: 'pointer',
      transition: 'all 0.2s',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '60px',
      height: '60px'
    },
    muteBtn: {
      backgroundColor: '#475569'
    },
    endCallBtn: {
      backgroundColor: '#ef4444'
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Call in Progress</h2>
          <button
            onClick={onClose}
            style={styles.closeBtn}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#334155'
              e.currentTarget.style.color = '#f1f5f9'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = '#94a3b8'
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={styles.body}>
          <div style={styles.contactInfo}>
            <div style={styles.contactName}>{contact.name}</div>
            <div style={styles.contactPhone}>{contact.phone}</div>
            <div
              style={{
                ...styles.statusBadge,
                backgroundColor: getStatusColor() + '20',
                color: getStatusColor()
              }}
            >
              {getStatusText()}
            </div>
          </div>

          {errorMessage && (
            <div style={styles.errorMessage}>{errorMessage}</div>
          )}

          {callState === 'connected' && (
            <div style={styles.dialpad}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                <button
                  key={digit}
                  onClick={() => handleDTMF(digit)}
                  style={styles.dialpadBtn}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#475569'
                    e.currentTarget.style.transform = 'scale(1.05)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#334155'
                    e.currentTarget.style.transform = 'scale(1)'
                  }}
                >
                  {digit}
                </button>
              ))}
            </div>
          )}

          <div style={styles.controlButtons}>
            {callState === 'connected' && (
              <button
                onClick={handleToggleMute}
                style={{ ...styles.controlBtn, ...styles.muteBtn }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#64748b'
                  e.currentTarget.style.transform = 'scale(1.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#475569'
                  e.currentTarget.style.transform = 'scale(1)'
                }}
              >
                {isMuted ? <MicOff size={24} color="#fff" /> : <Mic size={24} color="#fff" />}
              </button>
            )}

            {(callState === 'connecting' || callState === 'ringing' || callState === 'connected') && (
              <button
                onClick={handleEndCall}
                style={{ ...styles.controlBtn, ...styles.endCallBtn }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#dc2626'
                  e.currentTarget.style.transform = 'scale(1.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ef4444'
                  e.currentTarget.style.transform = 'scale(1)'
                }}
              >
                <PhoneOff size={24} color="#fff" />
              </button>
            )}
          </div>
        </div>

        {/* Hidden audio element for remote stream */}
        <audio ref={remoteAudioRef} autoPlay />
      </div>

      <style>
        {`
          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          @keyframes slideUp {
            from {
              transform: translateY(20px);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
        `}
      </style>
    </div>
  )
}

export default DialerModal

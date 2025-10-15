import React, { useState, useEffect, useRef } from 'react'
import { Phone, PhoneOff, Hash, X } from 'lucide-react'
import { usePBXStore } from '../store/pbxStore'

const CallModal = ({ contact, onClose, onSaveCallLog, alarmId, eventId, existingSession = null, existingCallState = null }) => {
  const [callState, setCallState] = useState(existingCallState || 'idle') // idle, connecting, ringing, connected, ended
  const [callDuration, setCallDuration] = useState(0)
  const [callStartTime, setCallStartTime] = useState(null)
  const [callEndTime, setCallEndTime] = useState(null)
  const [showKeypad, setShowKeypad] = useState(false)
  const [notes, setNotes] = useState('')
  const [resolution, setResolution] = useState('')

  const isRegistered = usePBXStore(state => state.isRegistered)
  const ua = usePBXStore(state => state.ua)

  const sessionRef = useRef(existingSession)
  const timerRef = useRef(null)
  const remoteAudioRef = useRef(null)

  const resolutionOptions = [
    { value: '', label: 'Select Resolution...' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'no_answer', label: 'No Answer' },
    { value: 'busy', label: 'Busy' },
    { value: 'not_available', label: 'Not Available' },
    { value: 'answering_machine', label: 'Answering Machine' }
  ]

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

  // Auto-dial on mount if PBX registered and no existing session
  useEffect(() => {
    if (!existingSession && isRegistered && ua && contact.phone) {
      initiateCall()
    }
  }, [isRegistered, ua])

  // Setup audio for existing session
  useEffect(() => {
    if (existingSession && remoteAudioRef.current) {
      const peerConnection = existingSession.connection
      if (peerConnection) {
        const remoteStreams = peerConnection.getRemoteStreams ? peerConnection.getRemoteStreams() : []
        if (remoteStreams.length > 0) {
          remoteAudioRef.current.srcObject = remoteStreams[0]
          remoteAudioRef.current.play().catch(() => {})
        }
      }
    }
  }, [existingSession])

  // Cleanup on unmount - DON'T terminate if we're keeping the call alive
  useEffect(() => {
    return () => {
      // Session cleanup is now handled by the parent component
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
        setCallState('ended')
        setCallEndTime(Date.now())
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
      setCallState('ended')
      setCallEndTime(Date.now())
    }
  }

  const handleCallEnded = () => {
    const endTime = Date.now()
    setCallEndTime(endTime)
    const duration = callStartTime ? Math.floor((endTime - callStartTime) / 1000) : 0

    setCallState('ended')
    setCallDuration(duration)
    setShowKeypad(false)
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

  const handleSave = async () => {
    if (!resolution) {
      alert('Please select a resolution before saving')
      return
    }

    const isCallActive = isInCall

    console.log('CallModal handleSave:', {
      isCallActive,
      callState,
      hasSession: !!sessionRef.current,
      contactPhone: contact.phone
    })

    const callLog = {
      contact_name: contact.name,
      contact_phone: contact.phone,
      call_start: callStartTime ? new Date(callStartTime).toISOString() : new Date().toISOString(),
      call_end: callEndTime ? new Date(callEndTime).toISOString() : (isCallActive ? null : new Date().toISOString()),
      duration: callDuration,
      resolution: resolution,
      notes: notes,
      alarm_id: alarmId,
      event_id: eventId
    }

    // Pass the session and call state back if the call is still active
    const activeCallInfo = isCallActive ? {
      session: sessionRef.current,
      callState: callState,
      contact: contact
    } : null

    console.log('CallModal passing activeCallInfo:', activeCallInfo)

    // Wait for the parent to save the call log and update state
    await onSaveCallLog(callLog, activeCallInfo)

    console.log('CallModal: onSaveCallLog completed, now closing')

    onClose()
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
        return `Connected - ${formatDuration(callDuration)}`
      case 'ended':
        return `Call Ended - Duration: ${formatDuration(callDuration)}`
      default:
        return 'Initializing...'
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
        return '#64748b'
      default:
        return '#64748b'
    }
  }

  const isInCall = callState === 'connected' || callState === 'ringing' || callState === 'connecting'
  const canSave = resolution

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Call Contact</h2>
          <button onClick={onClose} style={styles.closeButton}>
            <X size={20} />
          </button>
        </div>

        {/* Contact Info with inline hangup button when resolution is selected */}
        <div style={styles.contactInfo}>
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%'}}>
            <div style={{flex: 1, textAlign: 'center'}}>
              <div style={styles.contactName}>{contact.name}</div>
              <div style={styles.contactPhone}>{contact.phone}</div>
            </div>
            {isInCall && resolution && (
              <button
                onClick={handleEndCall}
                style={styles.inlineHangupButton}
                title="Hang up"
              >
                <PhoneOff size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Call Status */}
        <div style={styles.statusSection}>
          <div style={{...styles.statusText, color: getStatusColor()}}>
            {getStatusText()}
          </div>
        </div>

        {/* Call Controls - Compact Version */}
        {isInCall && !resolution && (
          <div style={styles.controlsCompact}>
            <button
              onClick={handleEndCall}
              style={styles.hangupButtonCompact}
              title="Hang up"
            >
              <PhoneOff size={16} />
              <span style={styles.buttonLabelCompact}>Hang Up</span>
            </button>

            {callState === 'connected' && (
              <button
                onClick={() => setShowKeypad(!showKeypad)}
                style={styles.keypadButtonCompact}
                title="Toggle keypad"
              >
                <Hash size={16} />
                <span style={styles.buttonLabelCompact}>Keypad</span>
              </button>
            )}
          </div>
        )}

        {/* DTMF Keypad */}
        {showKeypad && callState === 'connected' && (
          <div style={styles.keypadContainer}>
            <div style={styles.keypad}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                <button
                  key={digit}
                  onClick={() => handleDTMF(digit)}
                  style={styles.keypadDigit}
                >
                  {digit}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes Field */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Enter call notes..."
            style={styles.textarea}
            rows={4}
          />
        </div>

        {/* Resolution Dropdown - Now enabled during call */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Call Resolution *</label>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            style={styles.select}
          >
            {resolutionOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div style={styles.actions}>
          <button
            onClick={onClose}
            style={styles.cancelButton}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              ...styles.saveButton,
              ...(canSave ? {} : styles.disabledButton)
            }}
            disabled={!canSave}
          >
            Save Call Log
          </button>
        </div>

        {/* Hidden audio element for remote stream */}
        <audio ref={remoteAudioRef} autoPlay />
      </div>
    </div>
  )
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
    zIndex: 10000
  },
  modal: {
    backgroundColor: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.5rem',
    borderBottom: '1px solid #334155'
  },
  title: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#f1f5f9'
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.2s'
  },
  contactInfo: {
    padding: '1.5rem',
    borderBottom: '1px solid #334155',
    textAlign: 'center'
  },
  contactName: {
    fontSize: '1.5rem',
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: '0.5rem'
  },
  contactPhone: {
    fontSize: '1.125rem',
    color: '#94a3b8'
  },
  statusSection: {
    padding: '1rem 1.5rem',
    textAlign: 'center',
    borderBottom: '1px solid #334155'
  },
  statusText: {
    fontSize: '1rem',
    fontWeight: '600'
  },
  controls: {
    display: 'flex',
    justifyContent: 'center',
    gap: '1rem',
    padding: '1.5rem',
    borderBottom: '1px solid #334155'
  },
  controlsCompact: {
    display: 'flex',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1.5rem',
    borderBottom: '1px solid #334155'
  },
  hangupButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '1rem 2rem',
    background: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '600',
    transition: 'all 0.2s'
  },
  hangupButtonCompact: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.375rem 0.75rem',
    background: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: '600',
    transition: 'all 0.2s'
  },
  keypadButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '1rem 2rem',
    background: '#334155',
    color: '#f1f5f9',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '600',
    transition: 'all 0.2s'
  },
  keypadButtonCompact: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.375rem 0.75rem',
    background: '#334155',
    color: '#f1f5f9',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: '600',
    transition: 'all 0.2s'
  },
  buttonLabel: {
    fontSize: '0.875rem'
  },
  buttonLabelCompact: {
    fontSize: '0.75rem'
  },
  inlineHangupButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.5rem',
    background: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginLeft: '1rem'
  },
  keypadContainer: {
    padding: '1rem 1.5rem',
    borderBottom: '1px solid #334155'
  },
  keypad: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.75rem'
  },
  keypadDigit: {
    padding: '1rem',
    background: '#334155',
    border: 'none',
    color: '#f1f5f9',
    borderRadius: '0.5rem',
    fontSize: '1.25rem',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  formGroup: {
    padding: '1rem 1.5rem'
  },
  label: {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: '0.5rem'
  },
  textarea: {
    width: '100%',
    padding: '0.75rem',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    color: '#f1f5f9',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    resize: 'vertical'
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    color: '#f1f5f9',
    fontSize: '0.875rem',
    cursor: 'pointer'
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    padding: '1.5rem',
    borderTop: '1px solid #334155'
  },
  cancelButton: {
    padding: '0.75rem 1.5rem',
    background: '#334155',
    color: '#f1f5f9',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '600',
    transition: 'all 0.2s'
  },
  saveButton: {
    padding: '0.75rem 1.5rem',
    background: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '600',
    transition: 'all 0.2s'
  },
  disabledButton: {
    background: '#475569',
    cursor: 'not-allowed',
    opacity: 0.5
  }
}

export default CallModal

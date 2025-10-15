import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Video, FileText, Clock } from 'lucide-react'
import api from '../api/axios'
import { formatTimestampInTimezone } from '../utils/timezone'
import AlarmTimeline from '../components/AlarmTimeline'
import AccountHistory from '../components/AccountHistory'

export default function AlarmHistoryView() {
  const { alarmId } = useParams()
  const navigate = useNavigate()

  const [alarm, setAlarm] = useState(null)
  const [event, setEvent] = useState(null)
  const [account, setAccount] = useState(null)
  const [camera, setCamera] = useState(null)
  const [allCameras, setAllCameras] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('history') // 'history', 'live-views'
  const [capturingCamera, setCapturingCamera] = useState(null) // Track which camera is being captured

  useEffect(() => {
    loadAlarmDetails()
  }, [alarmId])

  const loadAlarmDetails = async () => {
    try {
      setLoading(true)

      // Load alarm details
      const alarmResponse = await api.get(`/alarms/${alarmId}`)
      const alarmData = alarmResponse.data

      if (!alarmData) {
        console.error('Alarm not found')
        setLoading(false)
        return
      }

      setAlarm(alarmData)

      // Load event details
      if (alarmData.event_id) {
        // Get all events and find the matching one
        const eventsResponse = await api.get('/events')
        const eventData = eventsResponse.data.find(e => e.id === alarmData.event_id)
        setEvent(eventData)

        // Load camera and account
        if (eventData && eventData.camera_id) {
          const camerasResponse = await api.get('/cameras')
          const cameraData = camerasResponse.data.find(c => c.id === eventData.camera_id)
          setCamera(cameraData)

          if (cameraData && cameraData.account_id) {
            const accountResponse = await api.get(`/accounts/${cameraData.account_id}`)
            setAccount(accountResponse.data)

            // Load all cameras for this account
            const accountCamerasResponse = await api.get(`/api/cameras/account/${cameraData.account_id}`)
            setAllCameras(accountCamerasResponse.data)
          }
        }
      }
    } catch (error) {
      console.error('Failed to load alarm details:', error)
    } finally {
      setLoading(false)
    }
  }

  const captureLiveView = async (cameraId, cameraName) => {
    try {
      setCapturingCamera(cameraId)

      // Call backend to capture live view
      const response = await api.post(`/api/events/${event.id}/capture-live-view`, null, {
        params: {
          camera_id: cameraId,
          duration_seconds: 10
        }
      })

      console.log('Live view captured:', response.data)

      // Reload event details to get updated live_view_captures
      const eventsResponse = await api.get('/events')
      const updatedEvent = eventsResponse.data.find(e => e.id === event.id)
      setEvent(updatedEvent)

      alert(`Successfully captured 10-second clip from ${cameraName}`)
    } catch (error) {
      console.error('Failed to capture live view:', error)
      alert(`Failed to capture live view: ${error.response?.data?.detail || error.message}`)
    } finally {
      setCapturingCamera(null)
    }
  }

  if (loading) {
    return (
      <div style={styles.loading}>
        <div>Loading alarm history...</div>
      </div>
    )
  }

  if (!alarm || !event) {
    return (
      <div style={styles.loading}>
        <div>Alarm not found</div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={() => navigate('/history')} style={styles.backButton}>
          <ArrowLeft size={20} />
          <span>Back to History</span>
        </button>
        <div style={styles.headerInfo}>
          <h1 style={styles.title}>
            Alarm #{alarm.id} - {account?.name || 'Unknown Account'}
          </h1>
          <div style={styles.subtitle}>
            {camera?.name} • {formatTimestampInTimezone(event.timestamp, account?.timezone || 'UTC', { showDate: true, showTime: true })}
          </div>
          {alarm.resolution && (
            <div style={styles.resolution}>
              Resolution: {alarm.resolution}
            </div>
          )}
        </div>
      </div>

      {/* Two Column Layout */}
      <div style={styles.twoColumnLayout}>
        {/* Left Side - Event History / Live Views Tabs */}
        <div style={styles.leftColumn}>
          <div style={styles.tabsContainer}>
            <div style={styles.tabs}>
              <button
                style={{
                  ...styles.tab,
                  ...(activeTab === 'history' ? styles.tabActive : {})
                }}
                onClick={() => setActiveTab('history')}
              >
                <Clock size={16} />
                <span>Event History</span>
              </button>
              <button
                style={{
                  ...styles.tab,
                  ...(activeTab === 'live-views' ? styles.tabActive : {})
                }}
                onClick={() => setActiveTab('live-views')}
              >
                <Video size={16} />
                <span>Live Views</span>
              </button>
            </div>
          </div>

          <div style={styles.tabContentLeft}>
            {activeTab === 'history' && (
              <AlarmTimeline
                alarmId={alarm.id}
                eventId={alarm.event_id}
              />
            )}

            {activeTab === 'live-views' && (
              <div>
                <div style={styles.infoBox}>
                  <p style={{fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem'}}>
                    Click "Capture Live View" to record a 10-second clip from any camera. Clips are saved to this event for future reference.
                  </p>
                  <p style={{fontSize: '0.75rem', color: '#64748b'}}>
                    Note: Only cameras with configured RTSP streams can be captured.
                  </p>
                </div>

                {/* Display captured clips */}
                {event.live_view_captures && event.live_view_captures.length > 0 && (
                  <div style={{marginBottom: '2rem'}}>
                    <h3 style={styles.subsectionTitle}>Captured Live Views</h3>
                    <div style={styles.capturesList}>
                      {event.live_view_captures.map((capture, idx) => (
                        <div key={idx} style={styles.captureItem}>
                          <div style={styles.captureHeader}>
                            <div style={styles.captureInfo}>
                              <Video size={14} color="#10b981" />
                              <span style={{fontSize: '0.875rem', fontWeight: '600', color: '#e2e8f0'}}>
                                {capture.camera_name}
                              </span>
                              <span style={{fontSize: '0.75rem', color: '#94a3b8'}}>
                                {capture.duration_seconds}s clip
                              </span>
                            </div>
                            <span style={{fontSize: '0.75rem', color: '#64748b'}}>
                              {new Date(capture.capture_timestamp).toLocaleString()}
                            </span>
                          </div>
                          <video
                            src={`/${capture.clip_path}`}
                            controls
                            style={styles.captureVideo}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Camera capture controls */}
                <h3 style={styles.subsectionTitle}>Available Cameras</h3>
                {allCameras && allCameras.length > 0 ? (
                  <div style={styles.cameraList}>
                    {allCameras.map(cam => (
                      <div key={cam.id} style={styles.cameraCard}>
                        <div style={styles.cameraHeader}>
                          <div style={styles.cameraInfo}>
                            <Video size={16} color="#3b82f6" />
                            <span style={styles.cameraName}>{cam.name}</span>
                            {cam.id === camera?.id && (
                              <span style={styles.alarmBadge}>ALARM CAMERA</span>
                            )}
                          </div>
                        </div>
                        <div style={styles.cameraBody}>
                          {cam.rtsp_url ? (
                            <div style={styles.streamInfo}>
                              <p style={{fontSize: '0.875rem', color: '#94a3b8', marginBottom: '1rem'}}>
                                RTSP stream configured
                              </p>
                              <button
                                onClick={() => captureLiveView(cam.id, cam.name)}
                                disabled={capturingCamera === cam.id}
                                style={{
                                  ...styles.captureButton,
                                  ...(capturingCamera === cam.id ? styles.captureButtonDisabled : {})
                                }}
                              >
                                <Video size={16} />
                                <span>
                                  {capturingCamera === cam.id ? 'Capturing...' : 'Capture Live View (10s)'}
                                </span>
                              </button>
                            </div>
                          ) : (
                            <div style={styles.streamInfo}>
                              <p style={{fontSize: '0.875rem', color: '#64748b'}}>
                                No RTSP stream configured
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={styles.emptyState}>
                    No cameras available for this account
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Event Media (Always Visible) */}
        <div style={styles.rightColumn}>
          <div style={styles.rightColumnHeader}>
            <h2 style={styles.rightColumnTitle}>Event Media</h2>
          </div>

          <div style={styles.rightColumnContent}>
            <div style={styles.mediaGrid}>
              {event.media_paths && event.media_paths.length > 0 ? (
                event.media_paths.map((path, idx) => (
                  <div key={idx} style={styles.mediaItem}>
                    {path.endsWith('.mp4') || path.endsWith('.avi') || path.endsWith('.mov') ? (
                      <video
                        src={`/${path}`}
                        controls
                        style={styles.mediaVideo}
                      />
                    ) : (
                      <img
                        src={`/${path}`}
                        alt={`Media ${idx + 1}`}
                        style={styles.mediaImage}
                      />
                    )}
                  </div>
                ))
              ) : (
                <div style={styles.emptyState}>
                  No media available for this event
                </div>
              )}
            </div>

            {/* Call Recordings if any */}
            {alarm.call_logs && alarm.call_logs.some(log => log.recording_url) && (
              <div style={{marginTop: '2rem'}}>
                <h3 style={styles.subsectionTitle}>Call Recordings</h3>
                <div style={styles.recordingsList}>
                  {alarm.call_logs
                    .filter(log => log.recording_url)
                    .map((log, index) => (
                      <div key={index} style={styles.recordingItem}>
                        <div style={styles.recordingInfo}>
                          <div style={{fontSize: '0.875rem', fontWeight: '500', color: '#e2e8f0'}}>
                            {log.contact_name || 'Unknown Contact'}
                          </div>
                          <div style={{fontSize: '0.75rem', color: '#94a3b8'}}>
                            {log.contact_phone}
                          </div>
                          {log.notes && (
                            <div style={{fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.25rem'}}>
                              {log.notes}
                            </div>
                          )}
                        </div>
                        <audio controls style={{width: '100%', marginTop: '0.5rem'}}>
                          <source src={log.recording_url} type="audio/mpeg" />
                        </audio>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Notes Section */}
            {alarm.notes && (
              <div style={{marginTop: '2rem'}}>
                <h3 style={styles.subsectionTitle}>Alarm Notes</h3>
                <div style={styles.notesBox}>
                  {alarm.notes}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#0f172a',
    color: '#e2e8f0'
  },
  loading: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f172a',
    color: '#e2e8f0',
    fontSize: '1.125rem'
  },
  header: {
    background: '#1e293b',
    borderBottom: '1px solid #334155',
    padding: '1.5rem 2rem'
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: 'transparent',
    border: 'none',
    color: '#3b82f6',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    marginBottom: '1rem',
    padding: '0.5rem 0',
    transition: 'color 0.2s'
  },
  headerInfo: {
    marginTop: '0.5rem'
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: '600',
    color: '#f1f5f9',
    margin: 0,
    marginBottom: '0.5rem'
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#94a3b8',
    marginBottom: '0.5rem'
  },
  resolution: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    background: '#10b98120',
    border: '1px solid #10b981',
    borderRadius: '0.375rem',
    color: '#10b981',
    fontSize: '0.75rem',
    fontWeight: '500',
    marginTop: '0.5rem'
  },
  tabsContainer: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '0.5rem 0.5rem 0 0'
  },
  tabs: {
    display: 'flex',
    gap: '0.5rem'
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '1rem 1.5rem',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#94a3b8',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  tabActive: {
    color: '#3b82f6',
    borderBottomColor: '#3b82f6'
  },
  twoColumnLayout: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '1.5rem',
    padding: '2rem',
    minHeight: 'calc(100vh - 300px)'
  },
  leftColumn: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '600px'
  },
  rightColumn: {
    background: '#1e293b',
    borderRadius: '0.5rem',
    border: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 'calc(100vh - 250px)',
    position: 'sticky',
    top: '2rem'
  },
  rightColumnHeader: {
    padding: '1rem 1.5rem',
    borderBottom: '1px solid #334155',
    background: '#0f172a'
  },
  rightColumnTitle: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: '#f1f5f9',
    margin: 0
  },
  rightColumnContent: {
    padding: '1.5rem',
    overflowY: 'auto',
    flex: 1
  },
  tabContentLeft: {
    flex: 1,
    background: '#1e293b',
    borderRadius: '0 0 0.5rem 0.5rem',
    border: '1px solid #334155',
    borderTop: 'none',
    padding: '1.5rem',
    overflowY: 'auto'
  },
  subsectionTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: '1rem'
  },
  infoBox: {
    marginBottom: '1.5rem',
    padding: '1rem',
    background: '#1e293b',
    borderRadius: '0.5rem',
    border: '1px solid #334155'
  },
  cameraList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem'
  },
  cameraCard: {
    background: '#1e293b',
    borderRadius: '0.5rem',
    border: '1px solid #334155',
    overflow: 'hidden'
  },
  cameraHeader: {
    padding: '0.75rem 1rem',
    background: '#0f172a',
    borderBottom: '1px solid #334155',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  cameraInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  cameraName: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#e2e8f0'
  },
  alarmBadge: {
    padding: '0.125rem 0.5rem',
    background: '#ef4444',
    borderRadius: '0.25rem',
    fontSize: '0.625rem',
    fontWeight: '700',
    color: '#fff'
  },
  timestamp: {
    fontSize: '0.75rem',
    color: '#94a3b8'
  },
  cameraBody: {
    padding: '1rem'
  },
  streamInfo: {
    background: '#0f172a',
    borderRadius: '0.375rem',
    padding: '1rem',
    textAlign: 'center'
  },
  emptyState: {
    padding: '2rem',
    textAlign: 'center',
    color: '#64748b'
  },
  mediaGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  mediaItem: {
    background: '#0f172a',
    borderRadius: '0.375rem',
    overflow: 'hidden',
    border: '1px solid #334155'
  },
  mediaVideo: {
    width: '100%',
    height: 'auto',
    display: 'block'
  },
  mediaImage: {
    width: '100%',
    height: 'auto',
    display: 'block'
  },
  recordingsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  recordingItem: {
    padding: '1rem',
    background: '#0f172a',
    borderRadius: '0.375rem',
    border: '1px solid #334155'
  },
  recordingInfo: {
    marginBottom: '0.75rem'
  },
  notesBox: {
    padding: '1rem',
    background: '#0f172a',
    borderRadius: '0.375rem',
    border: '1px solid #334155',
    fontSize: '0.875rem',
    color: '#cbd5e1',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap'
  },
  capturesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  captureItem: {
    background: '#0f172a',
    borderRadius: '0.375rem',
    border: '1px solid #334155',
    overflow: 'hidden'
  },
  captureHeader: {
    padding: '0.75rem 1rem',
    background: '#1e293b',
    borderBottom: '1px solid #334155',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  captureInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  captureVideo: {
    width: '100%',
    height: 'auto',
    display: 'block'
  },
  captureButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    width: '100%',
    padding: '0.75rem 1rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  captureButtonDisabled: {
    background: '#64748b',
    cursor: 'not-allowed',
    opacity: 0.6
  }
}

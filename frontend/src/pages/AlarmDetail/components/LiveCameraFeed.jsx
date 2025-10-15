import React, { useState, useEffect } from 'react'
import { FileText, Video as VideoIcon, Phone, Zap, ChevronDown } from 'lucide-react'
import { styles } from '../styles'
import { toast } from 'react-toastify'
import api from '../../../api/axios'

export default function LiveCameraFeed({
  fromHistory,
  allCameras,
  camera,
  selectedCameraId,
  onCameraChange,
  viewMode,
  onViewModeChange,
  liveVideoRef,
  notes,
  callLogs,
  account,
  event,
  formatTimestampInTimezone,
  onDialInboundNumber,
  onToolTriggered
}) {
  const [tools, setTools] = useState({}) // Map of tool_id -> tool object
  const [toolGroups, setToolGroups] = useState({}) // Map of group_id -> group object

  useEffect(() => {
    if (account?.id) {
      loadTools()
      loadToolGroups()
    }
  }, [account?.id])

  const loadTools = async () => {
    try {
      const response = await api.get(`/tools?account_id=${account.id}`)
      const toolsMap = {}
      response.data.forEach(tool => {
        toolsMap[tool.id] = tool
      })
      setTools(toolsMap)
    } catch (error) {
      console.error('Failed to load tools:', error)
    }
  }

  const loadToolGroups = async () => {
    try {
      const response = await api.get(`/tool-groups?account_id=${account.id}`)
      const groupsMap = {}
      response.data.forEach(group => {
        groupsMap[group.id] = group
      })
      setToolGroups(groupsMap)
    } catch (error) {
      console.error('Failed to load tool groups:', error)
    }
  }

  const handleToolTrigger = async (toolId, relayNumber) => {
    // Check if we should switch to camera grid view BEFORE triggering
    // Find the tool and relay config
    const tool = tools[toolId]
    if (tool && tool.tool_type === 'cbw_relay' && tool.config.relays && relayNumber) {
      const relay = tool.config.relays.find(r => r.number === relayNumber)
      if (relay?.showCameraGrid && onToolTriggered) {
        onToolTriggered(true) // Switch to grid immediately
      }
    }

    try {
      const params = relayNumber ? `?relay_number=${relayNumber}` : ''
      const response = await api.post(`/tools/${toolId}/trigger${params}`)
      toast.success(response.data.message || 'Tool triggered successfully')
    } catch (error) {
      toast.error('Failed to trigger tool')
      console.error(error)
    }
  }

  const handleGroupTrigger = async (groupId) => {
    try {
      const response = await api.post(`/tool-groups/${groupId}/trigger`)
      toast.success(response.data.message || 'Tool group triggered successfully')

      // Check if any of the results contain a camera_view that should be opened
      if (response.data.results) {
        const cameraViewResult = response.data.results.find(
          result => result.action === 'camera_view' && result.view_config
        )

        if (cameraViewResult && onToolTriggered) {
          // Pass the view configuration to the parent to show filtered cameras
          onToolTriggered(cameraViewResult.view_config)
        }
      }
    } catch (error) {
      toast.error('Failed to trigger tool group')
      console.error(error)
    }
  }

  const handleActionTrigger = async (action) => {
    if (action.type === 'tool' && action.tool_id) {
      await handleToolTrigger(action.tool_id, action.relay_number)
    } else if (action.type === 'tool_group' && action.group_id) {
      await handleGroupTrigger(action.group_id)
    }
  }
  return (
    <div style={styles.videoSection}>
      <div style={styles.videoHeader}>
        <h2 style={styles.videoTitle}>
          {fromHistory ? (
            <>
              <FileText size={20} />
              Notes & Call Logs
            </>
          ) : (
            <>
              <VideoIcon size={20} />
              Live Camera Feed
            </>
          )}
        </h2>
        {!fromHistory && (
          <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
            {allCameras.length > 1 && viewMode === 'single' && (
              <select
                style={styles.cameraSelect}
                value={selectedCameraId || ''}
                onChange={(e) => onCameraChange(parseInt(e.target.value))}
              >
                {allCameras.map(cam => (
                  <option key={cam.id} value={cam.id}>
                    {cam.name} {cam.id === camera?.id ? '(Alarm Camera)' : ''}
                  </option>
                ))}
              </select>
            )}
            {allCameras.length > 1 && (
              <button
                style={styles.viewModeBtn}
                onClick={() => onViewModeChange(viewMode === 'single' ? 'grid' : 'single')}
              >
                {viewMode === 'single' ? 'Grid View' : 'Single View'}
              </button>
            )}
            {viewMode === 'single' && selectedCameraId && (() => {
              const selectedCam = allCameras.find(c => c.id === selectedCameraId)
              const inboundNumber = selectedCam?.inbound_phone_number || account?.inbound_phone_number
              const actions = selectedCam?.associated_actions || []

              // Get action label for display
              const getActionLabel = (action) => {
                if (action.label) return action.label
                if (action.type === 'tool' && action.tool_id) {
                  const tool = tools[action.tool_id]
                  if (tool) {
                    return action.relay_number ? `${tool.name} (Relay ${action.relay_number})` : tool.name
                  }
                } else if (action.type === 'tool_group' && action.group_id) {
                  const group = toolGroups[action.group_id]
                  if (group) return group.name
                }
                return 'Unknown Action'
              }

              return (
                <>
                  {inboundNumber && onDialInboundNumber && (
                    <button
                      style={styles.callPhoneBtn}
                      onClick={() => onDialInboundNumber(inboundNumber, selectedCam?.name || 'Camera')}
                      title={`Call ${inboundNumber}`}
                    >
                      <Phone size={18} />
                    </button>
                  )}
                  {actions.length === 1 && (
                    <button
                      style={{
                        ...styles.callPhoneBtn,
                        background: '#f59e0b',
                        padding: '0.625rem 1rem'
                      }}
                      onClick={() => handleActionTrigger(actions[0])}
                      title={getActionLabel(actions[0])}
                    >
                      <Zap size={18} />
                      <span style={{marginLeft: '0.5rem', fontSize: '0.875rem', fontWeight: '600'}}>
                        {getActionLabel(actions[0])}
                      </span>
                    </button>
                  )}
                  {actions.length > 1 && (
                    <div style={{position: 'relative', display: 'inline-block'}}>
                      <select
                        style={{
                          ...styles.callPhoneBtn,
                          background: '#f59e0b',
                          padding: '0.625rem 1rem',
                          paddingRight: '2rem',
                          appearance: 'none',
                          cursor: 'pointer'
                        }}
                        onChange={(e) => {
                          const index = parseInt(e.target.value)
                          if (!isNaN(index) && actions[index]) {
                            handleActionTrigger(actions[index])
                          }
                          e.target.value = ''  // Reset selection
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>Select Action</option>
                        {actions.map((action, idx) => (
                          <option key={idx} value={idx}>
                            {getActionLabel(action)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={16} style={{position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none'}} />
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </div>
      <div style={styles.videoContainer}>
        {fromHistory ? (
          // Show Notes and Call Logs when viewing from history
          <div style={styles.historyNotesContainer}>
            <div style={styles.historySection}>
              <h3 style={styles.historySubtitle}>Alarm Notes</h3>
              <div style={styles.historyNotes}>
                {notes || <em style={{color: '#64748b'}}>No notes recorded</em>}
              </div>
            </div>
            {callLogs && callLogs.length > 0 && (
              <div style={styles.historySection}>
                <h3 style={styles.historySubtitle}>Call Logs</h3>
                <div style={styles.callLogsList}>
                  {callLogs.map((log, idx) => (
                    <div key={idx} style={styles.callLogCard}>
                      <div style={styles.callLogHeader}>
                        <div>
                          <div style={styles.callLogContact}>{log.contact_name}</div>
                          <div style={styles.callLogPhone}>{log.contact_phone}</div>
                        </div>
                        <div style={{
                          ...styles.callLogResolution,
                          ...(log.resolution === 'Contacted' ? {background: '#065f46', color: '#10b981'} : {})
                        }}>
                          {log.resolution}
                        </div>
                      </div>
                      {log.notes && (
                        <div style={styles.callLogNotes}>{log.notes}</div>
                      )}
                      <div style={styles.callLogTime}>
                        {formatTimestampInTimezone(log.timestamp, account?.timezone, { showTimezone: true })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {event?.media_paths && event.media_paths.some(path =>
              path.endsWith('.wav') || path.endsWith('.mp3') || path.endsWith('.ogg')
            ) && (
              <div style={styles.historySection}>
                <h3 style={styles.historySubtitle}>Call Recordings</h3>
                <div style={styles.callLogsList}>
                  {event.media_paths
                    .filter(path => path.endsWith('.wav') || path.endsWith('.mp3') || path.endsWith('.ogg'))
                    .map((audioPath, idx) => (
                      <div key={idx} style={styles.callLogCard}>
                        <div style={styles.callLogHeader}>
                          <div style={styles.callLogContact}>
                            Recording {idx + 1}
                          </div>
                        </div>
                        <audio
                          src={`/${audioPath}`}
                          controls
                          muted
                          style={{width: '100%', marginTop: '0.5rem'}}
                        />
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        ) : viewMode === 'single' ? (
          // Single camera view
          selectedCameraId && allCameras.find(c => c.id === selectedCameraId)?.rtsp_url ? (
            <video
              ref={liveVideoRef}
              style={styles.video}
              controls
              muted
              playsInline
            />
          ) : (
            <div style={styles.noMedia}>
              <VideoIcon size={48} />
              <p>No live feed available</p>
            </div>
          )
        ) : (
          // Grid view
          <div style={styles.cameraGrid}>
            {allCameras.map(cam => {
              const inboundNumber = cam.inbound_phone_number || account?.inbound_phone_number
              const actions = cam.associated_actions || []

              // Get action label for display
              const getActionLabel = (action) => {
                if (action.label) return action.label
                if (action.type === 'tool' && action.tool_id) {
                  const tool = tools[action.tool_id]
                  if (tool) {
                    return action.relay_number ? `${tool.name} (Relay ${action.relay_number})` : tool.name
                  }
                } else if (action.type === 'tool_group' && action.group_id) {
                  const group = toolGroups[action.group_id]
                  if (group) return group.name
                }
                return 'Unknown Action'
              }

              return (
                <div key={cam.id} style={styles.gridItem}>
                  <div style={styles.gridItemHeader}>
                    <span>{cam.name}</span>
                    <div style={{display: 'flex', gap: '0.25rem', alignItems: 'center'}}>
                      {inboundNumber && onDialInboundNumber && (
                        <button
                          style={{
                            background: '#10b981',
                            border: 'none',
                            borderRadius: '0.25rem',
                            padding: '0.25rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            color: 'white'
                          }}
                          onClick={() => onDialInboundNumber(inboundNumber, cam.name)}
                          title={`Call ${inboundNumber}`}
                        >
                          <Phone size={14} />
                        </button>
                      )}
                      {actions.length === 1 && (
                        <button
                          style={{
                            background: '#f59e0b',
                            border: 'none',
                            borderRadius: '0.25rem',
                            padding: '0.25rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            color: 'white'
                          }}
                          onClick={() => handleActionTrigger(actions[0])}
                          title={getActionLabel(actions[0])}
                        >
                          <Zap size={14} />
                        </button>
                      )}
                      {actions.length > 1 && (
                        <select
                          style={{
                            background: '#f59e0b',
                            border: 'none',
                            borderRadius: '0.25rem',
                            padding: '0.25rem 1.5rem 0.25rem 0.25rem',
                            cursor: 'pointer',
                            color: 'white',
                            fontSize: '0.75rem',
                            appearance: 'none'
                          }}
                          onChange={(e) => {
                            const index = parseInt(e.target.value)
                            if (!isNaN(index) && actions[index]) {
                              handleActionTrigger(actions[index])
                            }
                            e.target.value = ''  // Reset selection
                          }}
                          defaultValue=""
                          title="Select action"
                        >
                          <option value="" disabled>⚡</option>
                          {actions.map((action, idx) => (
                            <option key={idx} value={idx}>
                              {getActionLabel(action)}
                            </option>
                          ))}
                        </select>
                      )}
                      {cam.id === camera?.id && <span style={styles.alarmBadge}>Alarm</span>}
                    </div>
                  </div>
                  {cam.rtsp_url ? (
                    <video
                      id={`grid-video-${cam.id}`}
                      style={styles.gridVideo}
                      controls
                      muted
                      playsInline
                    />
                  ) : (
                    <div style={styles.gridNoFeed}>
                      <VideoIcon size={32} />
                      <span>No RTSP</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

import React, { useEffect, useRef, useState } from 'react'
import { X, Maximize2, Minimize2, Phone, Zap } from 'lucide-react'
import Hls from 'hls.js'
import { toast } from 'react-toastify'
import api from '../api/axios'

export default function CameraViewModal({ viewConfig, onClose, account, onDialInboundNumber }) {
  if (!viewConfig) return null

  const { view_type, cameras, quality, grid_columns } = viewConfig
  const [tools, setTools] = useState({})
  const [toolGroups, setToolGroups] = useState({})

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
    <div style={styles.modalOverlay} onClick={onClose}>
      <div
        style={{
          ...styles.modalContent,
          ...(view_type === 'grid' ? styles.modalContentGrid : {})
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>
            {view_type === 'single' ? 'Camera View' : `Camera Grid (${cameras.length} cameras)`}
          </h3>
          <button onClick={onClose} style={styles.modalCloseBtn} title="Close">
            <X size={24} />
          </button>
        </div>

        <div
          style={{
            ...styles.modalBody,
            ...(view_type === 'grid' ? {
              display: 'grid',
              gridTemplateColumns: `repeat(${grid_columns || 2}, 1fr)`,
              gap: '1rem',
              padding: '1rem'
            } : {})
          }}
        >
          {cameras.map(camera => (
            <CameraPlayer
              key={camera.id}
              camera={camera}
              isGrid={view_type === 'grid'}
              account={account}
              tools={tools}
              toolGroups={toolGroups}
              onDialInboundNumber={onDialInboundNumber}
              onActionTrigger={handleActionTrigger}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function CameraPlayer({ camera, isGrid, account, tools, toolGroups, onDialInboundNumber, onActionTrigger }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef(null)

  // Get camera's inbound number and associated actions
  const inboundNumber = camera.inbound_phone_number || account?.inbound_phone_number
  const actions = camera.associated_actions || []

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

  useEffect(() => {
    if (!videoRef.current || !camera.stream_url) return

    const video = videoRef.current
    const streamUrl = camera.stream_url

    // Clean up any existing HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 10,
        maxBufferLength: 10,
        maxMaxBufferLength: 10,
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 3,
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 3,
        levelLoadingTimeOut: 10000,
        levelLoadingMaxRetry: 3,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 3
      })

      hlsRef.current = hls

      hls.loadSource(streamUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(err => {
          console.error('Error auto-playing video:', err)
          setError('Click to play')
        })
        setIsLoading(false)
      })

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('Network error', data)
              setError('Network error - retrying...')
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('Media error', data)
              setError('Media error - recovering...')
              hls.recoverMediaError()
              break
            default:
              console.error('Fatal error', data)
              setError('Stream error')
              hls.destroy()
              break
          }
        }
      })

      video.addEventListener('canplay', () => {
        setIsLoading(false)
        setError(null)
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = streamUrl
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(err => {
          console.error('Error auto-playing video:', err)
          setError('Click to play')
        })
        setIsLoading(false)
      })
    } else {
      setError('HLS not supported in this browser')
      setIsLoading(false)
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [camera.stream_url])

  const toggleFullscreen = () => {
    if (!containerRef.current) return

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  return (
    <div ref={containerRef} style={isGrid ? styles.gridCameraContainer : styles.singleCameraContainer}>
      <div style={styles.cameraHeader}>
        <div style={styles.cameraName}>{camera.name}</div>
        <div style={{display: 'flex', gap: '0.25rem', alignItems: 'center'}}>
          {isGrid && inboundNumber && onDialInboundNumber && (
            <button
              style={styles.iconBtn}
              onClick={() => onDialInboundNumber(inboundNumber, camera.name)}
              title={`Call ${inboundNumber}`}
            >
              <Phone size={14} />
            </button>
          )}
          {isGrid && actions.length === 1 && onActionTrigger && (
            <button
              style={styles.iconBtnRelay}
              onClick={() => onActionTrigger(actions[0])}
              title={getActionLabel(actions[0])}
            >
              <Zap size={14} />
            </button>
          )}
          {isGrid && actions.length > 1 && onActionTrigger && (
            <select
              style={{
                ...styles.iconBtnRelay,
                padding: '0.25rem 1.25rem 0.25rem 0.25rem',
                fontSize: '0.75rem',
                appearance: 'none',
                cursor: 'pointer'
              }}
              onChange={(e) => {
                const index = parseInt(e.target.value)
                if (!isNaN(index) && actions[index]) {
                  onActionTrigger(actions[index])
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
          {!isGrid && (
            <button onClick={toggleFullscreen} style={styles.fullscreenBtn} title="Toggle fullscreen">
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          )}
        </div>
      </div>

      <div style={styles.videoWrapper}>
        {isLoading && (
          <div style={styles.loadingOverlay}>
            <div style={styles.spinner}></div>
            <div style={styles.loadingText}>Loading stream...</div>
          </div>
        )}

        {error && (
          <div style={styles.errorOverlay}>
            <div style={styles.errorText}>{error}</div>
          </div>
        )}

        <video
          ref={videoRef}
          style={styles.video}
          controls
          muted
          playsInline
          onClick={() => error === 'Click to play' && videoRef.current?.play()}
        />
      </div>
    </div>
  )
}

const styles = {
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: '1rem'
  },
  modalContent: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    width: '90%',
    maxWidth: '1200px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
  },
  modalContentGrid: {
    maxWidth: '95%'
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
    padding: '1.5rem',
    overflowY: 'auto',
    flex: 1
  },
  singleCameraContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  gridCameraContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155',
    padding: '0.75rem'
  },
  cameraHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  cameraName: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#e2e8f0'
  },
  iconBtn: {
    background: '#10b981',
    border: 'none',
    borderRadius: '0.25rem',
    padding: '0.25rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    color: 'white',
    transition: 'background 0.2s'
  },
  iconBtnRelay: {
    background: '#f59e0b',
    border: 'none',
    borderRadius: '0.25rem',
    padding: '0.25rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    color: 'white',
    transition: 'background 0.2s'
  },
  fullscreenBtn: {
    padding: '0.5rem',
    background: '#334155',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#e2e8f0',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'background 0.2s'
  },
  videoWrapper: {
    position: 'relative',
    width: '100%',
    paddingTop: '56.25%',
    background: '#000',
    borderRadius: '0.5rem',
    overflow: 'hidden'
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain'
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.8)',
    zIndex: 10,
    gap: '1rem'
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #334155',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: '0.875rem'
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.8)',
    zIndex: 10
  },
  errorText: {
    color: '#ef4444',
    fontSize: '0.875rem',
    fontWeight: '600',
    padding: '1rem',
    background: '#1e293b',
    borderRadius: '0.5rem',
    border: '1px solid #ef4444'
  }
}

// Add CSS animation
const styleSheet = document.createElement("style")
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`
if (!document.getElementById('camera-view-modal-styles')) {
  styleSheet.id = 'camera-view-modal-styles'
  document.head.appendChild(styleSheet)
}

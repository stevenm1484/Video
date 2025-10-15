import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Edit, Save, X, Zap } from 'lucide-react'
import { toast } from 'react-toastify'
import api from '../api/axios'
import ToolGroupsManager from './ToolGroupsManager'

export default function ToolsManager({ accountId, onRelayTriggered, readOnly = false, showSubTabs = false }) {
  const [tools, setTools] = useState([])
  const [toolGroups, setToolGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingTool, setEditingTool] = useState(null)
  const [toolType, setToolType] = useState('cbw_relay') // 'cbw_relay', 'webhook', or 'camera_view'
  const [activeSubTab, setActiveSubTab] = useState('tools') // 'tools' or 'groups'

  useEffect(() => {
    loadTools()
    loadToolGroups()
  }, [accountId])

  const loadTools = async () => {
    try {
      const response = await api.get(`/tools?account_id=${accountId}`)
      setTools(response.data)
    } catch (error) {
      toast.error('Failed to load tools')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const loadToolGroups = async () => {
    try {
      const response = await api.get(`/tool-groups?account_id=${accountId}`)
      setToolGroups(response.data)
    } catch (error) {
      console.error('Failed to load tool groups', error)
    }
  }

  const handleExecuteToolGroup = async (toolGroup) => {
    try {
      const response = await api.post(`/tool-groups/${toolGroup.id}/execute`)
      toast.success(response.data.message || 'Tool group executed successfully')

      // Check if any result has camera view data
      if (onRelayTriggered) {
        const results = response.data.results || []
        for (const result of results) {
          if (result.view_config) {
            onRelayTriggered({ type: 'camera_view', config: result.view_config })
            break
          }
        }
      }
    } catch (error) {
      toast.error('Failed to execute tool group')
      console.error(error)
    }
  }

  const handleAddTool = () => {
    setEditingTool(null)
    setToolType('cbw_relay')
    setShowAddModal(true)
  }

  const handleEditTool = (tool) => {
    setEditingTool(tool)
    setToolType(tool.tool_type)
    setShowAddModal(true)
  }

  const handleDeleteTool = async (toolId) => {
    if (!window.confirm('Are you sure you want to delete this tool?')) return

    try {
      await api.delete(`/tools/${toolId}`)
      toast.success('Tool deleted successfully')
      loadTools()
    } catch (error) {
      toast.error('Failed to delete tool')
      console.error(error)
    }
  }

  const handleTestTool = async (tool, relayNumber = null, state = null) => {
    try {
      let params = ''
      if (relayNumber !== null) {
        params = `?relay_number=${relayNumber}`
        if (state !== null) {
          params += `&state=${state}`
        }
      }
      const response = await api.post(`/tools/${tool.id}/trigger${params}`)
      toast.success(response.data.message || 'Tool triggered successfully')

      // Check if we should switch to camera grid view (for relay tools)
      if (response.data.show_camera_grid && onRelayTriggered) {
        onRelayTriggered(true)
      }

      // Handle camera view tool - pass config to parent for display
      if (response.data.tool_type === 'camera_view' && response.data.view_config && onRelayTriggered) {
        onRelayTriggered({ type: 'camera_view', config: response.data.view_config })
      }
    } catch (error) {
      toast.error('Failed to trigger tool')
      console.error(error)
    }
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading tools...</p>
      </div>
    )
  }

  // Filter tools based on hide_in_alarm_view flag when in readonly mode
  const visibleTools = readOnly
    ? tools.filter(t => !t.hide_in_alarm_view)
    : tools

  // Separate camera tools from other tools
  const cameraTools = visibleTools.filter(t => t.tool_type === 'camera_view')
  const otherTools = visibleTools.filter(t => t.tool_type !== 'camera_view')

  return (
    <div style={styles.container}>
      {/* Sub-tabs for edit mode */}
      {showSubTabs && !readOnly && (
        <div style={styles.subTabsContainer}>
          <button
            onClick={() => setActiveSubTab('tools')}
            style={{
              ...styles.subTab,
              ...(activeSubTab === 'tools' ? styles.subTabActive : {})
            }}
          >
            Tools
          </button>
          <button
            onClick={() => setActiveSubTab('groups')}
            style={{
              ...styles.subTab,
              ...(activeSubTab === 'groups' ? styles.subTabActive : {})
            }}
          >
            Groups
          </button>
        </div>
      )}

      {/* Show Tools or Groups based on sub-tab */}
      {showSubTabs && activeSubTab === 'groups' ? (
        <ToolGroupsManager accountId={accountId} onGroupExecuted={onRelayTriggered} readOnly={readOnly} />
      ) : (
        <>
          {!readOnly && (
            <div style={styles.header}>
              <button onClick={handleAddTool} style={styles.addBtn}>
                <Plus size={18} />
                <span>Add Tool</span>
              </button>
            </div>
          )}

      {visibleTools.length === 0 && (!readOnly || toolGroups.length === 0) ? (
        <div style={styles.emptyState}>
          <Zap size={48} color="#64748b" />
          <p>No tools configured for this account</p>
          {!readOnly && <p style={styles.emptyHint}>Add ControlByWeb relays or webhooks to automate actions</p>}
        </div>
      ) : (
        <>
          {/* Tool Groups - Display FIRST in readonly mode */}
          {readOnly && toolGroups.length > 0 && (
            <div>
              <div style={styles.sectionLabel}>Tool Groups</div>
              <div style={styles.toolGroupsList}>
                {toolGroups.map(group => (
                  <div key={group.id} style={styles.toolGroupCard}>
                    <div style={styles.toolGroupName}>{group.name}</div>
                    <button onClick={() => handleExecuteToolGroup(group)} style={styles.toolGroupBtn}>
                      <Zap size={16} />
                      <span>Execute</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Camera Tools - 4 per row in read-only mode */}
          {cameraTools.length > 0 && (
            <>
              <div style={{...styles.sectionLabel, marginTop: readOnly && toolGroups.length > 0 ? '1.5rem' : 0}}>Camera</div>
              <div style={readOnly ? styles.cameraToolsList : styles.toolsList}>
                {cameraTools.map(tool => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    onEdit={readOnly ? null : handleEditTool}
                    onDelete={readOnly ? null : handleDeleteTool}
                    onTest={handleTestTool}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            </>
          )}

          {/* Other Tools - 3 per row for relays */}
          {otherTools.length > 0 && (
            <div style={{...styles.relayToolsList, marginTop: (cameraTools.length > 0 || (readOnly && toolGroups.length > 0)) ? '1.5rem' : 0}}>
              {otherTools.map(tool => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  onEdit={readOnly ? null : handleEditTool}
                  onDelete={readOnly ? null : handleDeleteTool}
                  onTest={handleTestTool}
                  readOnly={readOnly}
                />
              ))}
            </div>
          )}
        </>
      )}

          {showAddModal && (
            <ToolFormModal
              accountId={accountId}
              tool={editingTool}
              toolType={toolType}
              setToolType={setToolType}
              onClose={() => setShowAddModal(false)}
              onSaved={() => {
                setShowAddModal(false)
                loadTools()
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

// Tool Card Component
function ToolCard({ tool, onEdit, onDelete, onTest, readOnly = false }) {
  const [relayStates, setRelayStates] = useState({})
  const [loadingStatus, setLoadingStatus] = useState(false)

  useEffect(() => {
    if (tool.tool_type === 'cbw_relay') {
      loadStatus()
      // Poll status every 3 seconds
      const interval = setInterval(loadStatus, 3000)
      return () => clearInterval(interval)
    }
  }, [tool.id])

  const loadStatus = async () => {
    if (loadingStatus) return
    setLoadingStatus(true)
    try {
      const response = await api.get(`/tools/${tool.id}/status`)
      setRelayStates(response.data.relay_states || {})
    } catch (error) {
      console.error('Failed to load relay status:', error)
    } finally {
      setLoadingStatus(false)
    }
  }

  return (
    <div style={tool.tool_type === 'camera_view' ? styles.cameraToolCard : styles.toolCard}>
      {/* For camera tools, only show edit/delete buttons if not in read-only mode */}
      {tool.tool_type === 'camera_view' ? (
        !readOnly && (
          <div style={{display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem'}}>
            <div style={styles.toolActions}>
              <button onClick={() => onEdit(tool)} style={styles.iconBtn} title="Edit">
                <Edit size={18} />
              </button>
              <button onClick={() => onDelete(tool.id)} style={styles.iconBtnDanger} title="Delete">
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        )
      ) : (
        <>
          <div style={styles.toolHeader}>
            <div>
              <div style={styles.toolName}>{tool.name}</div>
            </div>
            {!readOnly && (
              <div style={styles.toolActions}>
                <button onClick={() => onEdit(tool)} style={styles.iconBtn} title="Edit">
                  <Edit size={18} />
                </button>
                <button onClick={() => onDelete(tool.id)} style={styles.iconBtnDanger} title="Delete">
                  <Trash2 size={18} />
                </button>
              </div>
            )}
          </div>

          {tool.description && (
            <div style={styles.toolDescription}>{tool.description}</div>
          )}
        </>
      )}

      {/* Display config based on type */}
      {tool.tool_type === 'cbw_relay' && (
        <div style={styles.configSection}>
          {!readOnly && (
            <>
              <div style={styles.configRow}>
                <span style={styles.configLabel}>URL:</span>
                <span style={styles.configValue}>{tool.config.url}</span>
              </div>
              <div style={styles.configRow}>
                <span style={styles.configLabel}>Username:</span>
                <span style={styles.configValue}>{tool.config.username || 'N/A'}</span>
              </div>
            </>
          )}
          {tool.config.relays && tool.config.relays.length > 0 && (
            <div style={styles.relaysSection}>
              {!readOnly && <div style={styles.relaysLabel}>Relays:</div>}
              <div style={readOnly ? styles.relaysListCompact : styles.relaysList}>
                {tool.config.relays.map((relay, idx) => (
                  <div key={idx} style={readOnly ? styles.relayCardCompact : styles.relayCard}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1}}>
                      {/* Status Indicator */}
                      <div
                        style={{
                          ...styles.statusIndicator,
                          background: relayStates[relay.number] ? '#10b981' : '#6b7280'
                        }}
                        title={relayStates[relay.number] ? 'ON' : 'OFF'}
                      />
                      <div style={{flex: 1, minWidth: 0}}>
                        <div style={styles.relayNumber}>
                          {relay.description || `Relay ${relay.number}`}
                        </div>
                        {!readOnly && relay.description && (
                          <div style={styles.relayDescription}>
                            {relay.pulse && relay.pulseDuration && (
                              <span style={{color: '#f59e0b'}}>
                                ({relay.pulseDuration / 1000}s)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Show different buttons based on pulse mode */}
                    {relay.pulse ? (
                      // Pulse mode: single "Pulse" button
                      <button
                        onClick={async () => {
                          await onTest(tool, relay.number)
                          setTimeout(loadStatus, 500)
                        }}
                        style={readOnly ? styles.pulseBtnCompact : styles.pulseBtn}
                        title="Pulse this relay (momentary)"
                      >
                        <Zap size={14} />
                        {!readOnly && <span>Pulse</span>}
                      </button>
                    ) : (
                      // Static mode: "Turn On" and "Turn Off" buttons
                      <div style={styles.relayButtonGroup}>
                        <button
                          onClick={async () => {
                            await onTest(tool, relay.number, 1)
                            setTimeout(loadStatus, 500)
                          }}
                          style={readOnly ? styles.turnOnBtnCompact : styles.turnOnBtn}
                          title="Turn relay ON"
                        >
                          <span>{readOnly ? 'On' : 'Turn On'}</span>
                        </button>
                        <button
                          onClick={async () => {
                            await onTest(tool, relay.number, 0)
                            setTimeout(loadStatus, 500)
                          }}
                          style={readOnly ? styles.turnOffBtnCompact : styles.turnOffBtn}
                          title="Turn relay OFF"
                        >
                          <span>{readOnly ? 'Off' : 'Turn Off'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tool.tool_type === 'webhook' && (
        <div style={styles.configSection}>
          {!readOnly && (
            <>
              <div style={styles.configRow}>
                <span style={styles.configLabel}>URL:</span>
                <span style={styles.configValue}>{tool.config.url}</span>
              </div>
              <div style={styles.configRow}>
                <span style={styles.configLabel}>Method:</span>
                <span style={styles.configValue}>{tool.config.method || 'POST'}</span>
              </div>
            </>
          )}
          <button onClick={() => onTest(tool)} style={styles.testBtn}>
            <Zap size={16} />
            <span>Test Webhook</span>
          </button>
        </div>
      )}

      {tool.tool_type === 'camera_view' && (
        <button onClick={() => onTest(tool)} style={styles.cameraBtn}>
          <span>{tool.name}</span>
        </button>
      )}
    </div>
  )
}

// Tool Form Modal Component
function ToolFormModal({ accountId, tool, toolType, setToolType, onClose, onSaved }) {
  const [name, setName] = useState(tool?.name || '')
  const [description, setDescription] = useState(tool?.description || '')

  // CBW Relay fields
  const [cbwUrl, setCbwUrl] = useState(tool?.config?.url || '')
  const [cbwUsername, setCbwUsername] = useState(tool?.config?.username || '')
  const [cbwPassword, setCbwPassword] = useState(tool?.config?.password || '')
  const [relays, setRelays] = useState(tool?.config?.relays || [{ number: 1, description: '' }])

  // Webhook fields
  const [webhookUrl, setWebhookUrl] = useState(tool?.config?.url || '')
  const [webhookMethod, setWebhookMethod] = useState(tool?.config?.method || 'POST')
  const [headers, setHeaders] = useState(JSON.stringify(tool?.config?.headers || {}, null, 2))
  const [body, setBody] = useState(JSON.stringify(tool?.config?.body || {}, null, 2))

  // Camera View fields
  const [viewType, setViewType] = useState(tool?.config?.view_type || 'single')
  const [selectedCameras, setSelectedCameras] = useState(tool?.config?.camera_ids || [])
  const [quality, setQuality] = useState(tool?.config?.quality || 'medium')
  const [gridColumns, setGridColumns] = useState(tool?.config?.grid_columns || 2)
  const [availableCameras, setAvailableCameras] = useState([])
  const [loadingCameras, setLoadingCameras] = useState(false)

  // Hide in alarm view checkbox
  const [hideInAlarmView, setHideInAlarmView] = useState(tool?.hide_in_alarm_view || false)

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (tool) {
      // Editing existing tool
      setName(tool.name)
      setDescription(tool.description || '')
      setToolType(tool.tool_type)
      setHideInAlarmView(tool.hide_in_alarm_view || false)

      if (tool.tool_type === 'cbw_relay') {
        setCbwUrl(tool.config.url || '')
        setCbwUsername(tool.config.username || '')
        setCbwPassword(tool.config.password || '')
        setRelays(tool.config.relays || [{ number: 1, description: '' }])
      } else if (tool.tool_type === 'webhook') {
        setWebhookUrl(tool.config.url || '')
        setWebhookMethod(tool.config.method || 'POST')
        setHeaders(JSON.stringify(tool.config.headers || {}, null, 2))
        setBody(JSON.stringify(tool.config.body || {}, null, 2))
      } else if (tool.tool_type === 'camera_view') {
        setViewType(tool.config.view_type || 'single')
        setSelectedCameras(tool.config.camera_ids || [])
        setQuality(tool.config.quality || 'medium')
        setGridColumns(tool.config.grid_columns || 2)
      }
    }
  }, [tool])

  // Load cameras when camera_view tool type is selected
  useEffect(() => {
    if (toolType === 'camera_view' && accountId) {
      loadCameras()
    }
  }, [toolType, accountId])

  const loadCameras = async () => {
    setLoadingCameras(true)
    try {
      const response = await api.get(`/cameras/account/${accountId}`)
      setAvailableCameras(response.data)
    } catch (error) {
      toast.error('Failed to load cameras')
      console.error(error)
    } finally {
      setLoadingCameras(false)
    }
  }

  const handleAddRelay = () => {
    const nextNumber = relays.length > 0 ? Math.max(...relays.map(r => r.number)) + 1 : 1
    setRelays([...relays, { number: nextNumber, description: '', pulse: false, pulseDuration: 500 }])
  }

  const handleRemoveRelay = (index) => {
    setRelays(relays.filter((_, i) => i !== index))
  }

  const handleRelayChange = (index, field, value) => {
    const newRelays = [...relays]
    if (field === 'number') {
      newRelays[index][field] = parseInt(value) || 1
    } else if (field === 'pulse') {
      newRelays[index][field] = value
      // Set default pulse duration when enabling pulse mode
      if (value && !newRelays[index].pulseDuration) {
        newRelays[index].pulseDuration = 500
      }
    } else if (field === 'pulseDuration') {
      newRelays[index][field] = parseInt(value) || 500
    } else {
      newRelays[index][field] = value
    }
    setRelays(newRelays)
  }

  const toggleCameraSelection = (cameraId) => {
    setSelectedCameras(prev => {
      if (prev.includes(cameraId)) {
        return prev.filter(id => id !== cameraId)
      } else {
        return [...prev, cameraId]
      }
    })
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Tool name is required')
      return
    }

    setSaving(true)
    try {
      let config = {}

      if (toolType === 'cbw_relay') {
        if (!cbwUrl.trim()) {
          toast.error('URL is required for ControlByWeb relay')
          setSaving(false)
          return
        }
        config = {
          url: cbwUrl,
          username: cbwUsername,
          password: cbwPassword,
          relays: relays.filter(r => r.number > 0) // Filter out invalid relays
        }
      } else if (toolType === 'camera_view') {
        if (selectedCameras.length === 0) {
          toast.error('Please select at least one camera')
          setSaving(false)
          return
        }
        config = {
          view_type: viewType,
          camera_ids: selectedCameras,
          quality: quality,
          grid_columns: viewType === 'grid' ? gridColumns : null
        }
      } else if (toolType === 'webhook') {
        if (!webhookUrl.trim()) {
          toast.error('URL is required for webhook')
          setSaving(false)
          return
        }

        // Parse JSON fields
        let parsedHeaders = {}
        let parsedBody = {}
        try {
          parsedHeaders = JSON.parse(headers || '{}')
        } catch (e) {
          toast.error('Invalid JSON in headers')
          setSaving(false)
          return
        }
        try {
          parsedBody = JSON.parse(body || '{}')
        } catch (e) {
          toast.error('Invalid JSON in body')
          setSaving(false)
          return
        }

        config = {
          url: webhookUrl,
          method: webhookMethod,
          headers: parsedHeaders,
          body: parsedBody
        }
      }

      const toolData = {
        account_id: accountId,
        name: name.trim(),
        tool_type: toolType,
        description: description.trim(),
        config: config,
        hide_in_alarm_view: hideInAlarmView
      }

      if (tool) {
        // Update existing tool
        await api.put(`/tools/${tool.id}`, toolData)
        toast.success('Tool updated successfully')
      } else {
        // Create new tool
        await api.post('/tools', toolData)
        toast.success('Tool created successfully')
      }

      onSaved()
    } catch (error) {
      toast.error('Failed to save tool')
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>{tool ? 'Edit Tool' : 'Add New Tool'}</h3>
          <button onClick={onClose} style={styles.modalCloseBtn}>
            <X size={20} />
          </button>
        </div>

        <div style={styles.modalBody}>
          {/* Tool Type Selection (only for new tools) */}
          {!tool && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Tool Type</label>
              <div style={styles.toolTypeButtons}>
                <button
                  onClick={() => setToolType('cbw_relay')}
                  style={{
                    ...styles.toolTypeBtn,
                    ...(toolType === 'cbw_relay' ? styles.toolTypeBtnActive : {})
                  }}
                >
                  ControlByWeb Relay
                </button>
                <button
                  onClick={() => setToolType('camera_view')}
                  style={{
                    ...styles.toolTypeBtn,
                    ...(toolType === 'camera_view' ? styles.toolTypeBtnActive : {})
                  }}
                >
                  Camera View
                </button>
                <button
                  onClick={() => setToolType('webhook')}
                  style={{
                    ...styles.toolTypeBtn,
                    ...(toolType === 'webhook' ? styles.toolTypeBtnActive : {})
                  }}
                >
                  Webhook
                </button>
              </div>
            </div>
          )}

          {/* Common fields */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Tool Name*</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Front Door Relay, Alert Webhook"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this tool"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={hideInAlarmView}
                onChange={(e) => setHideInAlarmView(e.target.checked)}
                style={styles.checkbox}
              />
              <span>Hide in alarm view (useful for tools only used in groups)</span>
            </label>
          </div>

          {/* ControlByWeb Relay Fields */}
          {toolType === 'cbw_relay' && (
            <>
              <div style={styles.formGroup}>
                <label style={styles.label}>Device URL*</label>
                <input
                  type="text"
                  value={cbwUrl}
                  onChange={(e) => setCbwUrl(e.target.value)}
                  placeholder="http://192.168.1.100"
                  style={styles.input}
                />
              </div>

              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Username</label>
                  <input
                    type="text"
                    value={cbwUsername}
                    onChange={(e) => setCbwUsername(e.target.value)}
                    placeholder="admin"
                    style={styles.input}
                    autoComplete="off"
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Password</label>
                  <input
                    type="password"
                    value={cbwPassword}
                    onChange={(e) => setCbwPassword(e.target.value)}
                    placeholder="password"
                    style={styles.input}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <div style={styles.relaysHeader}>
                  <label style={styles.label}>Relays</label>
                  <button onClick={handleAddRelay} style={styles.addRelayBtn}>
                    <Plus size={16} />
                    <span>Add Relay</span>
                  </button>
                </div>
                <div style={styles.relaysFormList}>
                  {relays.map((relay, idx) => (
                    <div key={idx} style={styles.relayFormCard}>
                      <div style={styles.relayFormFields}>
                        <div style={styles.relayNumberInput}>
                          <label style={styles.smallLabel}>Relay #</label>
                          <input
                            type="number"
                            min="1"
                            value={relay.number}
                            onChange={(e) => handleRelayChange(idx, 'number', e.target.value)}
                            style={styles.inputSmall}
                          />
                        </div>
                        <div style={styles.relayDescInput}>
                          <label style={styles.smallLabel}>Description</label>
                          <input
                            type="text"
                            value={relay.description}
                            onChange={(e) => handleRelayChange(idx, 'description', e.target.value)}
                            placeholder="e.g., Front Door, Gate"
                            style={styles.input}
                          />
                        </div>
                        <div style={styles.relayPulseInput}>
                          <label style={styles.smallLabel}>Mode</label>
                          <label style={styles.checkboxLabel}>
                            <input
                              type="checkbox"
                              checked={relay.pulse || false}
                              onChange={(e) => handleRelayChange(idx, 'pulse', e.target.checked)}
                              style={styles.checkbox}
                            />
                            <span>Pulse</span>
                          </label>
                        </div>
                        {relay.pulse && (
                          <div style={styles.pulseDurationInput}>
                            <label style={styles.smallLabel}>Duration (sec)</label>
                            <input
                              type="number"
                              min="0.5"
                              max="10"
                              step="0.5"
                              value={(relay.pulseDuration || 500) / 1000}
                              onChange={(e) => handleRelayChange(idx, 'pulseDuration', parseFloat(e.target.value) * 1000)}
                              style={styles.inputSmall}
                              placeholder="0.5"
                            />
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveRelay(idx)}
                        style={styles.removeRelayBtn}
                        title="Remove relay"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Camera View Fields */}
          {toolType === 'camera_view' && (
            <>
              <div style={styles.formGroup}>
                <label style={styles.label}>View Type*</label>
                <div style={styles.viewTypeButtons}>
                  <button
                    type="button"
                    onClick={() => setViewType('single')}
                    style={{
                      ...styles.viewTypeBtn,
                      ...(viewType === 'single' ? styles.viewTypeBtnActive : {})
                    }}
                  >
                    Single Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewType('grid')}
                    style={{
                      ...styles.viewTypeBtn,
                      ...(viewType === 'grid' ? styles.viewTypeBtnActive : {})
                    }}
                  >
                    Grid View
                  </button>
                </div>
              </div>

              {viewType === 'grid' && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Grid Columns</label>
                  <select value={gridColumns} onChange={(e) => setGridColumns(parseInt(e.target.value))} style={styles.select}>
                    <option value="1">1 Column</option>
                    <option value="2">2 Columns</option>
                    <option value="3">3 Columns</option>
                    <option value="4">4 Columns</option>
                  </select>
                </div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.label}>Stream Quality</label>
                <select value={quality} onChange={(e) => setQuality(e.target.value)} style={styles.select}>
                  <option value="low">Low (360p) - Fastest, best for grids</option>
                  <option value="medium">Medium (540p) - Balanced</option>
                  <option value="high">High (720p) - Best quality</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Select Cameras* ({selectedCameras.length} selected)</label>
                {loadingCameras ? (
                  <div style={styles.loadingCameras}>Loading cameras...</div>
                ) : availableCameras.length === 0 ? (
                  <div style={styles.noCameras}>No cameras available for this account</div>
                ) : (
                  <div style={styles.cameraList}>
                    {availableCameras.map(camera => (
                      <label key={camera.id} style={styles.cameraCheckboxLabel}>
                        <input
                          type="checkbox"
                          checked={selectedCameras.includes(camera.id)}
                          onChange={() => toggleCameraSelection(camera.id)}
                          style={styles.checkbox}
                        />
                        <div style={styles.cameraInfo}>
                          <div style={styles.cameraName}>{camera.name}</div>
                          <div style={styles.cameraLocation}>{camera.location || 'No location'}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Webhook Fields */}
          {toolType === 'webhook' && (
            <>
              <div style={styles.formGroup}>
                <label style={styles.label}>Webhook URL*</label>
                <input
                  type="text"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://example.com/webhook"
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>HTTP Method</label>
                <select value={webhookMethod} onChange={(e) => setWebhookMethod(e.target.value)} style={styles.select}>
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                  <option value="PUT">PUT</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Headers (JSON)</label>
                <textarea
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                  placeholder='{"Content-Type": "application/json"}'
                  style={styles.textarea}
                  rows={4}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Body (JSON)</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder='{"message": "Alarm triggered"}'
                  style={styles.textarea}
                  rows={6}
                />
              </div>
            </>
          )}
        </div>

        <div style={styles.modalFooter}>
          <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
          <button onClick={handleSave} style={styles.saveBtn} disabled={saving}>
            <Save size={18} />
            <span>{saving ? 'Saving...' : 'Save Tool'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    padding: '1.5rem'
  },
  header: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: '1.5rem'
  },
  sectionLabel: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.25rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '3rem',
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
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem 2rem',
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    gap: '1rem'
  },
  emptyHint: {
    fontSize: '0.9rem',
    color: '#64748b',
    margin: 0
  },
  toolsList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
    gap: '1.5rem'
  },
  cameraToolsList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '0.75rem'
  },
  relayToolsList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1rem',
    width: '100%'
  },
  toolCard: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    padding: '1.25rem',
    transition: 'all 0.2s'
  },
  cameraToolCard: {
    background: '#1e293b',
    borderRadius: '0.5rem',
    border: '1px solid #334155',
    padding: '0.5rem',
    transition: 'all 0.2s'
  },
  toolHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem'
  },
  toolName: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: '0.25rem'
  },
  toolType: {
    fontSize: '0.875rem',
    color: '#94a3b8'
  },
  toolActions: {
    display: 'flex',
    gap: '0.5rem'
  },
  iconBtn: {
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
  iconBtnDanger: {
    padding: '0.5rem',
    background: '#334155',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#ef4444',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'background 0.2s'
  },
  toolDescription: {
    fontSize: '0.875rem',
    color: '#cbd5e1',
    marginBottom: '1rem',
    padding: '0.75rem',
    background: '#0f172a',
    borderRadius: '0.375rem',
    border: '1px solid #334155'
  },
  configSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  configRow: {
    display: 'flex',
    fontSize: '0.875rem'
  },
  configLabel: {
    color: '#94a3b8',
    fontWeight: '600',
    minWidth: '90px'
  },
  configValue: {
    color: '#cbd5e1',
    wordBreak: 'break-all'
  },
  relaysSection: {
    marginTop: '0.5rem'
  },
  relaysLabel: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: '0.5rem'
  },
  relaysList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  relaysListCompact: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '0.75rem'
  },
  relayCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem',
    background: '#0f172a',
    borderRadius: '0.375rem',
    border: '1px solid #334155'
  },
  relayCardCompact: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155',
    gap: '1rem'
  },
  statusIndicator: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    flexShrink: 0,
    transition: 'background 0.3s'
  },
  relayNumber: {
    fontSize: '0.85rem',
    fontWeight: '600',
    color: '#3b82f6',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    lineHeight: '1.2'
  },
  relayDescription: {
    fontSize: '0.75rem',
    color: '#94a3b8'
  },
  testRelayBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.375rem 0.75rem',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  pulseBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.375rem 0.75rem',
    background: '#f59e0b',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  pulseBtnCompact: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.5rem 0.75rem',
    background: '#f59e0b',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    fontSize: '0.8rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
    minWidth: '60px'
  },
  relayButtonGroup: {
    display: 'flex',
    gap: '0.375rem'
  },
  turnOnBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.375rem 0.625rem',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    fontSize: '0.7rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  turnOnBtnCompact: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.5rem 0.75rem',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    fontSize: '0.8rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
    minWidth: '50px'
  },
  turnOffBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.375rem 0.625rem',
    background: '#ef4444',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    fontSize: '0.7rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  turnOffBtnCompact: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.5rem 0.75rem',
    background: '#ef4444',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    fontSize: '0.8rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
    minWidth: '50px'
  },
  testBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '0.75rem',
    width: '100%',
    justifyContent: 'center',
    transition: 'background 0.2s'
  },
  cameraBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.5rem 0.75rem',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    fontSize: '0.8rem',
    fontWeight: '600',
    cursor: 'pointer',
    width: '100%',
    transition: 'background 0.2s',
    textAlign: 'center',
    lineHeight: '1.2'
  },
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
    maxWidth: '700px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
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
    padding: '1.5rem',
    overflowY: 'auto',
    flex: 1
  },
  formGroup: {
    marginBottom: '1.25rem'
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem'
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#cbd5e1'
  },
  smallLabel: {
    display: 'block',
    marginBottom: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#94a3b8'
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    fontFamily: 'inherit'
  },
  inputSmall: {
    width: '80px',
    padding: '0.5rem',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.375rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    fontFamily: 'inherit'
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    cursor: 'pointer'
  },
  textarea: {
    width: '100%',
    padding: '0.75rem',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    fontFamily: 'monospace',
    resize: 'vertical',
    minHeight: '100px'
  },
  toolTypeButtons: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '1rem'
  },
  toolTypeBtn: {
    padding: '1rem',
    background: '#0f172a',
    border: '2px solid #334155',
    borderRadius: '0.5rem',
    color: '#cbd5e1',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  toolTypeBtnActive: {
    background: '#1e40af',
    borderColor: '#3b82f6',
    color: '#fff'
  },
  relaysHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem'
  },
  addRelayBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.5rem 0.75rem',
    background: '#334155',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#e2e8f0',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  relaysFormList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  relayFormCard: {
    display: 'flex',
    gap: '0.75rem',
    padding: '0.75rem',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155'
  },
  relayFormFields: {
    display: 'flex',
    gap: '0.75rem',
    flex: 1
  },
  relayNumberInput: {
    flex: '0 0 auto'
  },
  relayDescInput: {
    flex: 1
  },
  relayPulseInput: {
    flex: '0 0 auto',
    display: 'flex',
    flexDirection: 'column'
  },
  pulseDurationInput: {
    flex: '0 0 auto',
    display: 'flex',
    flexDirection: 'column'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    cursor: 'pointer',
    color: '#cbd5e1',
    fontSize: '0.75rem',
    fontWeight: '500'
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
    accentColor: '#10b981'
  },
  removeRelayBtn: {
    padding: '0.5rem',
    background: '#334155',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#ef4444',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'background 0.2s'
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    padding: '1.5rem',
    borderTop: '1px solid #334155'
  },
  cancelBtn: {
    padding: '0.75rem 1.5rem',
    background: '#475569',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  saveBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.5rem',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  viewTypeButtons: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem'
  },
  viewTypeBtn: {
    padding: '0.75rem',
    background: '#0f172a',
    border: '2px solid #334155',
    borderRadius: '0.5rem',
    color: '#cbd5e1',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  viewTypeBtnActive: {
    background: '#1e40af',
    borderColor: '#3b82f6',
    color: '#fff'
  },
  cameraList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    maxHeight: '300px',
    overflowY: 'auto',
    padding: '0.5rem',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155'
  },
  cameraCheckboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem',
    background: '#1e293b',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    transition: 'background 0.2s',
    border: '1px solid transparent'
  },
  cameraInfo: {
    flex: 1
  },
  cameraName: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: '0.25rem'
  },
  cameraLocation: {
    fontSize: '0.75rem',
    color: '#94a3b8'
  },
  loadingCameras: {
    padding: '2rem',
    textAlign: 'center',
    color: '#94a3b8',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155'
  },
  noCameras: {
    padding: '2rem',
    textAlign: 'center',
    color: '#94a3b8',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155'
  },
  toolGroupsList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '0.75rem'
  },
  toolGroupCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.75rem',
    background: '#1e293b',
    borderRadius: '0.5rem',
    border: '1px solid #334155'
  },
  toolGroupName: {
    fontSize: '0.85rem',
    fontWeight: '600',
    color: '#e2e8f0',
    textAlign: 'center'
  },
  toolGroupBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.5rem 0.75rem',
    background: '#8b5cf6',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    fontSize: '0.8rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  subTabsContainer: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1.5rem',
    borderBottom: '2px solid #334155',
    paddingBottom: '0.5rem'
  },
  subTab: {
    padding: '0.5rem 1rem',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#94a3b8',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: '-2px'
  },
  subTabActive: {
    color: '#3b82f6',
    borderBottomColor: '#3b82f6'
  }
}

// Add CSS animation
const styleSheet = document.createElement("style")
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`
if (!document.getElementById('tools-manager-styles')) {
  styleSheet.id = 'tools-manager-styles'
  document.head.appendChild(styleSheet)
}

import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Edit, Save, X, Play, ArrowDown, ArrowRight } from 'lucide-react'
import { toast } from 'react-toastify'
import api from '../api/axios'

export default function ToolGroupsManager({ accountId, onGroupExecuted, readOnly = false }) {
  const [toolGroups, setToolGroups] = useState([])
  const [tools, setTools] = useState([]) // Available tools
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)

  useEffect(() => {
    loadToolGroups()
    loadTools()
  }, [accountId])

  const loadToolGroups = async () => {
    try {
      const response = await api.get(`/tool-groups?account_id=${accountId}`)
      setToolGroups(response.data)
    } catch (error) {
      toast.error('Failed to load tool groups')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const loadTools = async () => {
    try {
      const response = await api.get(`/tools?account_id=${accountId}`)
      setTools(response.data)
    } catch (error) {
      toast.error('Failed to load tools')
      console.error(error)
    }
  }

  const handleAddGroup = () => {
    setEditingGroup(null)
    setShowAddModal(true)
  }

  const handleEditGroup = (group) => {
    setEditingGroup(group)
    setShowAddModal(true)
  }

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Are you sure you want to delete this tool group?')) return

    try {
      await api.delete(`/tool-groups/${groupId}`)
      toast.success('Tool group deleted successfully')
      loadToolGroups()
    } catch (error) {
      toast.error('Failed to delete tool group')
      console.error(error)
    }
  }

  const handleExecuteGroup = async (group) => {
    try {
      const response = await api.post(`/tool-groups/${group.id}/execute`)
      toast.success(response.data.message || 'Tool group executed successfully')

      // Check if we should switch view (for camera_view actions)
      if (onGroupExecuted) {
        // Check if any result has camera view data
        const results = response.data.results || []
        for (const result of results) {
          if (result.view_config) {
            onGroupExecuted({ type: 'camera_view', config: result.view_config })
            break
          }
        }
      }
    } catch (error) {
      toast.error('Failed to execute tool group')
      console.error(error)
    }
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading tool groups...</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {!readOnly && (
        <div style={styles.header}>
          <button onClick={handleAddGroup} style={styles.addBtn}>
            <Plus size={18} />
            <span>Add Tool Group</span>
          </button>
        </div>
      )}

      {toolGroups.length === 0 ? (
        <div style={styles.emptyState}>
          <Play size={48} color="#64748b" />
          <p>No tool groups configured for this account</p>
          {!readOnly && <p style={styles.emptyHint}>Create macros that combine multiple tool actions</p>}
        </div>
      ) : (
        <div style={readOnly ? styles.groupsListCompact : styles.groupsList}>
          {toolGroups.map(group => (
            <ToolGroupCard
              key={group.id}
              group={group}
              tools={tools}
              onEdit={readOnly ? null : handleEditGroup}
              onDelete={readOnly ? null : handleDeleteGroup}
              onExecute={handleExecuteGroup}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      {showAddModal && (
        <ToolGroupFormModal
          accountId={accountId}
          group={editingGroup}
          tools={tools}
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false)
            loadToolGroups()
          }}
        />
      )}
    </div>
  )
}

// Tool Group Card Component
function ToolGroupCard({ group, tools, onEdit, onDelete, onExecute, readOnly = false }) {
  const [expanded, setExpanded] = useState(false)

  const getToolName = (toolId) => {
    const tool = tools.find(t => t.id === toolId)
    return tool ? tool.name : `Tool #${toolId}`
  }

  const getActionDescription = (action) => {
    const toolName = getToolName(action.tool_id)

    if (action.type === 'delay') {
      return `Wait ${action.duration / 1000}s`
    } else if (action.type === 'relay') {
      const relayNum = action.relay_number || 1
      const duration = action.duration ? ` for ${action.duration / 1000}s` : ''
      return `${toolName} - Relay ${relayNum}${duration}`
    } else if (action.type === 'camera_view') {
      const duration = action.duration ? ` for ${action.duration / 1000}s` : ''
      return `${toolName}${duration}`
    } else if (action.type === 'webhook') {
      return `${toolName}`
    }
    return toolName
  }

  return (
    <div style={readOnly ? styles.groupCardCompact : styles.groupCard}>
      <div style={styles.groupHeader}>
        <div style={{flex: 1}}>
          <div style={styles.groupName}>{group.name}</div>
          {group.description && (
            <div style={styles.groupDescription}>{group.description}</div>
          )}
        </div>
        <div style={styles.groupActions}>
          {!readOnly && (
            <>
              <button onClick={() => setExpanded(!expanded)} style={styles.iconBtn} title="View Actions">
                {expanded ? <ArrowDown size={18} /> : <ArrowRight size={18} />}
              </button>
              <button onClick={() => onEdit(group)} style={styles.iconBtn} title="Edit">
                <Edit size={18} />
              </button>
              <button onClick={() => onDelete(group.id)} style={styles.iconBtnDanger} title="Delete">
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {!readOnly && expanded && group.actions && group.actions.length > 0 && (
        <div style={styles.actionsPreview}>
          <div style={styles.actionsLabel}>Actions:</div>
          {group.actions.map((action, idx) => (
            <div key={idx} style={styles.actionItem}>
              <span style={styles.actionNumber}>{idx + 1}.</span>
              <span>{getActionDescription(action)}</span>
              {action.parallel_group !== null && action.parallel_group !== undefined && (
                <span style={styles.parallelBadge}>Parallel #{action.parallel_group}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <button onClick={() => onExecute(group)} style={readOnly ? styles.executeBtnCompact : styles.executeBtn}>
        <Play size={16} />
        <span>Execute</span>
      </button>
    </div>
  )
}

// Tool Group Form Modal Component
function ToolGroupFormModal({ accountId, group, tools, onClose, onSaved }) {
  const [name, setName] = useState(group?.name || '')
  const [description, setDescription] = useState(group?.description || '')
  const [actions, setActions] = useState(group?.actions || [])
  const [saving, setSaving] = useState(false)

  const handleAddAction = () => {
    setActions([...actions, {
      type: 'relay',
      tool_id: tools[0]?.id || null,
      relay_number: 1,
      duration: null,
      parallel_group: null
    }])
  }

  const handleRemoveAction = (index) => {
    setActions(actions.filter((_, i) => i !== index))
  }

  const handleActionChange = (index, field, value) => {
    const newActions = [...actions]
    newActions[index] = {...newActions[index], [field]: value}
    setActions(newActions)
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Tool group name is required')
      return
    }

    if (actions.length === 0) {
      toast.error('At least one action is required')
      return
    }

    setSaving(true)
    try {
      const groupData = {
        account_id: accountId,
        name: name.trim(),
        description: description.trim(),
        actions: actions
      }

      if (group) {
        await api.put(`/tool-groups/${group.id}`, groupData)
        toast.success('Tool group updated successfully')
      } else {
        await api.post('/tool-groups', groupData)
        toast.success('Tool group created successfully')
      }

      onSaved()
    } catch (error) {
      toast.error('Failed to save tool group')
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  const getToolRelays = (toolId) => {
    const tool = tools.find(t => t.id === toolId)
    if (tool && tool.tool_type === 'cbw_relay' && tool.config && tool.config.relays) {
      return tool.config.relays
    }
    return []
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>{group ? 'Edit Tool Group' : 'Add New Tool Group'}</h3>
          <button onClick={onClose} style={styles.modalCloseBtn}>
            <X size={20} />
          </button>
        </div>

        <div style={styles.modalBody}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Group Name*</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Alarm Response"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this macro"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <div style={styles.actionsHeader}>
              <label style={styles.label}>Actions</label>
              <button onClick={handleAddAction} style={styles.addActionBtn}>
                <Plus size={16} />
                <span>Add Action</span>
              </button>
            </div>
            <div style={styles.actionsFormList}>
              {actions.map((action, idx) => (
                <div key={idx} style={styles.actionFormCard}>
                  <div style={styles.actionFormFields}>
                    <div style={styles.actionNumberBadge}>{idx + 1}</div>

                    <div style={styles.actionFieldRow}>
                      <div style={{flex: 1}}>
                        <label style={styles.smallLabel}>Tool</label>
                        <select
                          value={action.tool_id || ''}
                          onChange={(e) => handleActionChange(idx, 'tool_id', parseInt(e.target.value))}
                          style={styles.select}
                        >
                          {tools.map(tool => (
                            <option key={tool.id} value={tool.id}>
                              {tool.name} ({tool.tool_type})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Show relay number selector for CBW relays */}
                      {(() => {
                        const tool = tools.find(t => t.id === action.tool_id)
                        const relays = getToolRelays(action.tool_id)
                        if (tool && tool.tool_type === 'cbw_relay' && relays.length > 0) {
                          return (
                            <div style={{flex: '0 0 120px'}}>
                              <label style={styles.smallLabel}>Relay</label>
                              <select
                                value={action.relay_number || 1}
                                onChange={(e) => handleActionChange(idx, 'relay_number', parseInt(e.target.value))}
                                style={styles.select}
                              >
                                {relays.map(relay => (
                                  <option key={relay.number} value={relay.number}>
                                    {relay.description || `Relay ${relay.number}`}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )
                        }
                        return null
                      })()}

                      <div style={{flex: '0 0 120px'}}>
                        <label style={styles.smallLabel}>Duration (sec)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={action.duration ? action.duration / 1000 : ''}
                          onChange={(e) => handleActionChange(idx, 'duration', e.target.value ? parseFloat(e.target.value) * 1000 : null)}
                          placeholder="None"
                          style={styles.inputSmall}
                        />
                      </div>

                      <div style={{flex: '0 0 120px'}}>
                        <label style={styles.smallLabel}>Parallel Group</label>
                        <input
                          type="number"
                          min="0"
                          value={action.parallel_group !== null && action.parallel_group !== undefined ? action.parallel_group : ''}
                          onChange={(e) => handleActionChange(idx, 'parallel_group', e.target.value ? parseInt(e.target.value) : null)}
                          placeholder="Sequential"
                          style={styles.inputSmall}
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoveAction(idx)}
                    style={styles.removeActionBtn}
                    title="Remove action"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div style={styles.helpText}>
              Tip: Actions run sequentially by default. Set the same Parallel Group number for actions that should run simultaneously.
            </div>
          </div>
        </div>

        <div style={styles.modalFooter}>
          <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
          <button onClick={handleSave} style={styles.saveBtn} disabled={saving}>
            <Save size={18} />
            <span>{saving ? 'Saving...' : 'Save Tool Group'}</span>
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
  groupsList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
    gap: '1.5rem'
  },
  groupsListCompact: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1rem'
  },
  groupCard: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    padding: '1.25rem',
    transition: 'all 0.2s'
  },
  groupCardCompact: {
    background: '#1e293b',
    borderRadius: '0.5rem',
    border: '1px solid #334155',
    padding: '1rem',
    transition: 'all 0.2s'
  },
  groupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem'
  },
  groupName: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: '0.25rem'
  },
  groupDescription: {
    fontSize: '0.875rem',
    color: '#cbd5e1',
    marginTop: '0.25rem'
  },
  groupActions: {
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
  actionsPreview: {
    padding: '0.75rem',
    background: '#0f172a',
    borderRadius: '0.5rem',
    marginBottom: '1rem',
    border: '1px solid #334155'
  },
  actionsLabel: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: '0.5rem',
    textTransform: 'uppercase'
  },
  actionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    color: '#cbd5e1',
    padding: '0.25rem 0'
  },
  actionNumber: {
    color: '#3b82f6',
    fontWeight: '600'
  },
  parallelBadge: {
    fontSize: '0.7rem',
    padding: '0.125rem 0.5rem',
    background: '#f59e0b',
    color: '#000',
    borderRadius: '0.25rem',
    fontWeight: '600',
    marginLeft: 'auto'
  },
  executeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    width: '100%',
    transition: 'background 0.2s'
  },
  executeBtnCompact: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.5rem 0.75rem',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    fontSize: '0.85rem',
    fontWeight: '600',
    cursor: 'pointer',
    width: '100%',
    transition: 'background 0.2s'
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
    maxWidth: '900px',
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
    width: '100%',
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
    padding: '0.5rem',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.375rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    cursor: 'pointer'
  },
  actionsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem'
  },
  addActionBtn: {
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
  actionsFormList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginBottom: '0.5rem'
  },
  actionFormCard: {
    display: 'flex',
    gap: '0.75rem',
    padding: '0.75rem',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155'
  },
  actionFormFields: {
    display: 'flex',
    gap: '0.75rem',
    flex: 1,
    alignItems: 'flex-start'
  },
  actionNumberBadge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    background: '#3b82f6',
    borderRadius: '50%',
    color: '#fff',
    fontWeight: '600',
    fontSize: '0.875rem',
    flexShrink: 0
  },
  actionFieldRow: {
    display: 'flex',
    gap: '0.75rem',
    flex: 1,
    flexWrap: 'wrap'
  },
  removeActionBtn: {
    padding: '0.5rem',
    background: '#334155',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#ef4444',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'background 0.2s',
    alignSelf: 'flex-start'
  },
  helpText: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    fontStyle: 'italic',
    marginTop: '0.5rem'
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
  }
}

// Add CSS animation
const styleSheet = document.createElement("style")
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`
if (!document.getElementById('tool-groups-manager-styles')) {
  styleSheet.id = 'tool-groups-manager-styles'
  document.head.appendChild(styleSheet)
}

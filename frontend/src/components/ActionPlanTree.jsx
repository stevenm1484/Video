import React, { useState } from 'react'
import { Plus, Trash2, GitBranch, ChevronRight, ChevronDown, Edit2, ArrowRight, Check, X } from 'lucide-react'
import { toast } from 'react-toastify'

// Recursive tree node component
function TreeStepNode({ step, path, allSteps, onUpdate, onDelete, level = 0, availableCameras = [], availableTools = [] }) {
  const [expanded, setExpanded] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(step.content || step.label || '')
  const [showAddMenu, setShowAddMenu] = useState(null) // null, 'yes', 'no', 'inline'

  // Configuration states for tool steps
  const [selectedToolId, setSelectedToolId] = useState(step.tool_id || '')
  const [selectedRelayNumber, setSelectedRelayNumber] = useState(step.relay_number || '')
  const [cameraFilter, setCameraFilter] = useState(step.cameraFilter || 'all')
  const [selectedCameras, setSelectedCameras] = useState(step.selectedCameras || [])

  const indent = level * 24

  const handleSave = () => {
    if (step.type === 'tool') {
      if (!selectedToolId) {
        toast.error('Please select a tool')
        return
      }
      const selectedTool = availableTools.find(t => t.id === parseInt(selectedToolId))

      // Check if CBW relay tool requires relay selection
      if (selectedTool?.tool_type === 'cbw_relay' && !selectedRelayNumber) {
        toast.error('Please select a relay number')
        return
      }

      const stepData = {
        ...step,
        label: editContent || selectedTool?.name || 'Trigger Tool',
        content: editContent || selectedTool?.name || 'Trigger Tool',
        tool_id: parseInt(selectedToolId),
        tool_name: selectedTool?.name
      }

      // Add relay number for CBW tools
      if (selectedTool?.tool_type === 'cbw_relay' && selectedRelayNumber) {
        stepData.relay_number = parseInt(selectedRelayNumber)
      }

      onUpdate(path, stepData)
    } else if (step.type === 'view_cameras') {
      onUpdate(path, {
        ...step,
        label: editContent || (cameraFilter === 'all' ? 'View All Cameras' : 'View Selected Cameras'),
        content: editContent || (cameraFilter === 'all' ? 'View All Cameras' : 'View Selected Cameras'),
        cameraFilter: cameraFilter,
        selectedCameras: cameraFilter === 'specific' ? selectedCameras : []
      })
    } else {
      if (!editContent.trim()) {
        toast.error('Content cannot be empty')
        return
      }
      onUpdate(path, { ...step, content: editContent, label: editContent })
    }
    setEditing(false)
  }

  const handleAddStep = (branch, type) => {
    const newStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: type,
      content: '',
      label: ''
    }

    if (type === 'goto') {
      newStep.gotoStep = 1
    } else if (type === 'view_cameras') {
      newStep.label = 'View All Cameras'
      newStep.content = 'View All Cameras'
      newStep.cameraFilter = 'all' // 'all' or specific camera ID
    } else if (type === 'tool') {
      newStep.label = 'Trigger Tool'
      newStep.content = 'Trigger Tool'
      newStep.tool_id = null
    }

    if (branch === 'inline') {
      // Add as next sibling
      const parentPath = path.slice(0, -1)
      const currentIndex = path[path.length - 1]
      onUpdate(parentPath, null, newStep, currentIndex + 1)
    } else {
      // Add to yes/no branch
      const branchKey = branch === 'yes' ? 'yesSteps' : 'noSteps'
      const updatedStep = {
        ...step,
        isBoolean: true,
        yesSteps: step.yesSteps || [],
        noSteps: step.noSteps || []
      }
      updatedStep[branchKey] = [...updatedStep[branchKey], newStep]
      onUpdate(path, updatedStep)
    }
    setShowAddMenu(null)
  }

  const handleMakeBranch = () => {
    onUpdate(path, {
      ...step,
      isBoolean: true,
      yesSteps: step.yesSteps || [],
      noSteps: step.noSteps || []
    })
  }

  const handleRemoveBranch = () => {
    const { isBoolean, yesSteps, noSteps, ...regularStep } = step
    onUpdate(path, regularStep)
  }

  const getStepDisplay = () => {
    if (step.type === 'goto') {
      return (
        <span style={styles.gotoStep}>
          <ArrowRight size={14} />
          Go to Step {step.gotoStep}
        </span>
      )
    } else if (step.type === 'view_cameras') {
      return (
        <span style={styles.toolStepDisplay}>
          <span>📹</span>
          {step.label || 'View All Cameras'}
        </span>
      )
    } else if (step.type === 'tool') {
      const relayText = step.relay_number ? ` - Relay ${step.relay_number}` : ''
      return (
        <span style={styles.toolStepDisplay}>
          <span>⚡</span>
          {step.label || step.tool_name || 'Trigger Tool'}{relayText}
        </span>
      )
    }
    return step.content || step.label || 'Empty step'
  }

  const getStepNumber = () => {
    // Only top-level steps get numbers
    if (level === 0 && path.length === 1) {
      return path[0] + 1
    }
    return null
  }

  return (
    <div style={styles.treeNode}>
      <div style={{...styles.treeNodeContent, marginLeft: `${indent}px`}}>
        {/* Expand/collapse icon */}
        <div style={styles.expandIcon}>
          {step.isBoolean && (
            <button
              type="button"
              style={styles.expandBtn}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
        </div>

        {/* Step number (only for root level) */}
        {getStepNumber() && (
          <div style={styles.stepNumber}>{getStepNumber()}</div>
        )}

        {/* Step content */}
        <div style={styles.stepMain}>
          {editing ? (
            <div style={styles.editMode}>
              {step.type === 'tool' ? (
                <div style={styles.configContainer}>
                  <input
                    type="text"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    style={styles.editInput}
                    placeholder="Step label (e.g., Open Gate)"
                  />
                  <select
                    value={selectedToolId}
                    onChange={(e) => {
                      setSelectedToolId(e.target.value)
                      // Reset relay selection when changing tools
                      setSelectedRelayNumber('')
                    }}
                    style={styles.editSelect}
                  >
                    <option value="">-- Select Tool --</option>
                    {availableTools.map(tool => (
                      <option key={tool.id} value={tool.id}>
                        {tool.name} ({tool.tool_type === 'cbw_relay' ? 'Relay' : 'Webhook'})
                      </option>
                    ))}
                  </select>

                  {/* Show relay selection if CBW tool is selected */}
                  {(() => {
                    const selectedTool = availableTools.find(t => t.id === parseInt(selectedToolId))
                    if (selectedTool && selectedTool.tool_type === 'cbw_relay') {
                      const relays = selectedTool.config?.relays || []
                      return (
                        <select
                          value={selectedRelayNumber}
                          onChange={(e) => setSelectedRelayNumber(e.target.value)}
                          style={styles.editSelect}
                        >
                          <option value="">-- Select Relay --</option>
                          {relays.map(relay => (
                            <option key={relay.number} value={relay.number}>
                              Relay {relay.number} - {relay.label || 'Unlabeled'}
                            </option>
                          ))}
                        </select>
                      )
                    }
                    return null
                  })()}

                  <div style={styles.editActions}>
                    <button type="button" style={styles.saveBtn} onClick={handleSave}>
                      <Check size={14} />
                    </button>
                    <button type="button" style={styles.cancelBtn} onClick={() => setEditing(false)}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : step.type === 'view_cameras' ? (
                <div style={styles.configContainer}>
                  <input
                    type="text"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    style={styles.editInput}
                    placeholder="Step label (e.g., Check all cameras)"
                  />
                  <select
                    value={cameraFilter}
                    onChange={(e) => setCameraFilter(e.target.value)}
                    style={styles.editSelect}
                  >
                    <option value="all">View All Cameras</option>
                    <option value="specific">View Specific Cameras</option>
                  </select>
                  {cameraFilter === 'specific' && availableCameras.length > 0 && (
                    <div style={styles.cameraList}>
                      {availableCameras.map(camera => (
                        <label key={camera.id} style={styles.cameraCheckbox}>
                          <input
                            type="checkbox"
                            checked={selectedCameras.includes(camera.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCameras([...selectedCameras, camera.id])
                              } else {
                                setSelectedCameras(selectedCameras.filter(id => id !== camera.id))
                              }
                            }}
                          />
                          <span>{camera.name} {camera.location && `(${camera.location})`}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <div style={styles.editActions}>
                    <button type="button" style={styles.saveBtn} onClick={handleSave}>
                      <Check size={14} />
                    </button>
                    <button type="button" style={styles.cancelBtn} onClick={() => setEditing(false)}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    style={styles.editInput}
                    autoFocus
                    onKeyPress={(e) => e.key === 'Enter' && handleSave()}
                  />
                  <button type="button" style={styles.saveBtn} onClick={handleSave}>
                    <Check size={14} />
                  </button>
                  <button type="button" style={styles.cancelBtn} onClick={() => setEditing(false)}>
                    <X size={14} />
                  </button>
                </>
              )}
            </div>
          ) : (
            <div style={styles.stepDisplay}>
              <span style={styles.stepText}>{getStepDisplay()}</span>
              {step.isBoolean && <span style={styles.branchBadge}>?</span>}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={styles.stepActions}>
          <button
            type="button"
            style={styles.actionBtn}
            onClick={() => setEditing(true)}
            title="Edit"
          >
            <Edit2 size={14} />
          </button>

          {step.type === 'text' && !step.isBoolean && (
            <button
              type="button"
              style={{...styles.actionBtn, background: '#3b82f6'}}
              onClick={handleMakeBranch}
              title="Make Yes/No question"
            >
              <GitBranch size={14} />
            </button>
          )}

          {step.isBoolean && (
            <button
              type="button"
              style={{...styles.actionBtn, background: '#64748b'}}
              onClick={handleRemoveBranch}
              title="Remove branches"
            >
              <X size={14} />
            </button>
          )}

          <div style={styles.addMenuContainer}>
            <button
              type="button"
              style={{...styles.actionBtn, background: '#10b981'}}
              onClick={() => setShowAddMenu(showAddMenu ? null : 'menu')}
              title="Add step"
            >
              <Plus size={14} />
            </button>

            {showAddMenu && (
              <div style={styles.addMenu}>
                <button type="button" onClick={() => handleAddStep('inline', 'text')} style={styles.addMenuBtn}>
                  + Text Step
                </button>
                <button type="button" onClick={() => handleAddStep('inline', 'view_cameras')} style={styles.addMenuBtn}>
                  📹 View Cameras
                </button>
                <button type="button" onClick={() => handleAddStep('inline', 'tool')} style={styles.addMenuBtn}>
                  ⚡ Tool
                </button>
                <button type="button" onClick={() => handleAddStep('inline', 'goto')} style={styles.addMenuBtn}>
                  → Go to Step
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            style={{...styles.actionBtn, background: '#ef4444'}}
            onClick={() => onDelete(path)}
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* YES/NO branches */}
      {step.isBoolean && expanded && (
        <div style={styles.branches}>
          {/* YES branch */}
          <div style={{...styles.branch, marginLeft: `${indent + 24}px`}}>
            <div style={styles.branchHeader}>
              <span style={styles.yesBadge}>YES</span>
              <button
                type="button"
                style={styles.addToBranchBtn}
                onClick={() => handleAddStep('yes', 'text')}
              >
                <Plus size={12} /> Add step
              </button>
            </div>
            {step.yesSteps && step.yesSteps.length > 0 ? (
              step.yesSteps.map((childStep, index) => (
                <TreeStepNode
                  key={childStep.id}
                  step={childStep}
                  path={[...path, 'yesSteps', index]}
                  allSteps={allSteps}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  level={level + 1}
                  availableCameras={availableCameras}
                  availableTools={availableTools}
                />
              ))
            ) : (
              <div style={styles.emptyBranch}>No steps</div>
            )}
          </div>

          {/* NO branch */}
          <div style={{...styles.branch, marginLeft: `${indent + 24}px`}}>
            <div style={styles.branchHeader}>
              <span style={styles.noBadge}>NO</span>
              <button
                type="button"
                style={styles.addToBranchBtn}
                onClick={() => handleAddStep('no', 'text')}
              >
                <Plus size={12} /> Add step
              </button>
            </div>
            {step.noSteps && step.noSteps.length > 0 ? (
              step.noSteps.map((childStep, index) => (
                <TreeStepNode
                  key={childStep.id}
                  step={childStep}
                  path={[...path, 'noSteps', index]}
                  allSteps={allSteps}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  level={level + 1}
                  availableCameras={availableCameras}
                  availableTools={availableTools}
                />
              ))
            ) : (
              <div style={styles.emptyBranch}>No steps</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ActionPlanTree({ initialSteps = [], onSave, onClose, availableCameras = [], availableTools = [] }) {
  const [steps, setSteps] = useState(initialSteps)

  const updateStep = (path, newStepData, insertStep = null, insertIndex = null) => {
    setSteps(prev => {
      const newSteps = JSON.parse(JSON.stringify(prev))

      // Handle insert operation
      if (insertStep !== null) {
        if (path.length === 0) {
          // Insert at root level
          newSteps.splice(insertIndex, 0, insertStep)
        } else {
          // Navigate to parent and insert
          let current = newSteps
          for (let i = 0; i < path.length; i++) {
            current = current[path[i]]
          }
          current.splice(insertIndex, 0, insertStep)
        }
        return newSteps
      }

      // Handle update operation
      if (path.length === 1) {
        newSteps[path[0]] = newStepData
      } else {
        let current = newSteps
        for (let i = 0; i < path.length - 1; i++) {
          current = current[path[i]]
        }
        current[path[path.length - 1]] = newStepData
      }

      return newSteps
    })
  }

  const deleteStep = (path) => {
    setSteps(prev => {
      const newSteps = JSON.parse(JSON.stringify(prev))

      if (path.length === 1) {
        newSteps.splice(path[0], 1)
      } else {
        let current = newSteps
        for (let i = 0; i < path.length - 1; i++) {
          current = current[path[i]]
        }
        current.splice(path[path.length - 1], 1)
      }

      return newSteps
    })
  }

  const addRootStep = () => {
    const newStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'text',
      content: 'New step'
    }
    setSteps([...steps, newStep])
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Action Plan Builder</h2>
        <button type="button" style={styles.closeBtn} onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div style={styles.treeContainer}>
        {steps.length === 0 ? (
          <div style={styles.emptyState}>
            <p>No steps yet. Click "+ Add Step" to get started.</p>
          </div>
        ) : (
          steps.map((step, index) => (
            <TreeStepNode
              key={step.id}
              step={step}
              path={[index]}
              allSteps={steps}
              onUpdate={updateStep}
              onDelete={deleteStep}
              level={0}
              availableCameras={availableCameras}
              availableTools={availableTools}
            />
          ))
        )}

        <button type="button" style={styles.addRootBtn} onClick={addRootStep}>
          <Plus size={16} />
          Add Step
        </button>
      </div>

      <div style={styles.footer}>
        <button type="button" style={styles.cancelBtnFooter} onClick={onClose}>
          Cancel
        </button>
        <button type="button" style={styles.saveBtn} onClick={() => {
          console.log('ActionPlanTree: Save button clicked, steps:', steps)
          onSave(steps)
        }}>
          Save Action Plan
        </button>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#0f172a'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.5rem',
    borderBottom: '2px solid #334155',
    background: '#1e293b'
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#e2e8f0',
    margin: 0
  },
  closeBtn: {
    background: '#ef4444',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.5rem',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  treeContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '2rem'
  },
  emptyState: {
    textAlign: 'center',
    padding: '4rem',
    color: '#64748b',
    fontSize: '1.1rem'
  },
  treeNode: {
    marginBottom: '0.5rem'
  },
  treeNodeContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#1e293b',
    border: '2px solid #334155',
    borderRadius: '0.5rem',
    padding: '0.75rem',
    transition: 'all 0.2s'
  },
  expandIcon: {
    width: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  expandBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
    alignItems: 'center'
  },
  stepNumber: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '32px',
    height: '32px',
    background: '#3b82f6',
    borderRadius: '50%',
    color: '#fff',
    fontSize: '0.9rem',
    fontWeight: '700'
  },
  stepMain: {
    flex: 1,
    minWidth: 0
  },
  editMode: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center'
  },
  editInput: {
    flex: 1,
    background: '#0f172a',
    border: '1px solid #475569',
    borderRadius: '0.375rem',
    padding: '0.5rem',
    color: '#e2e8f0',
    fontSize: '0.9rem',
    outline: 'none'
  },
  stepDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  stepText: {
    color: '#e2e8f0',
    fontSize: '0.95rem',
    fontWeight: '500'
  },
  branchBadge: {
    background: '#f59e0b',
    color: '#fff',
    padding: '0.125rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: '700'
  },
  gotoStep: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    color: '#3b82f6',
    fontWeight: '600'
  },
  stepActions: {
    display: 'flex',
    gap: '0.375rem',
    position: 'relative'
  },
  actionBtn: {
    background: '#334155',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.5rem',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s'
  },
  addMenuContainer: {
    position: 'relative'
  },
  addMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '0.25rem',
    background: '#1e293b',
    border: '2px solid #334155',
    borderRadius: '0.5rem',
    padding: '0.5rem',
    zIndex: 1000,
    minWidth: '150px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  branches: {
    marginTop: '0.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  branch: {
    borderLeft: '3px solid #334155',
    paddingLeft: '0.5rem'
  },
  branchHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.5rem'
  },
  yesBadge: {
    background: '#10b981',
    color: '#fff',
    padding: '0.25rem 0.75rem',
    borderRadius: '0.375rem',
    fontSize: '0.8rem',
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  noBadge: {
    background: '#ef4444',
    color: '#fff',
    padding: '0.25rem 0.75rem',
    borderRadius: '0.375rem',
    fontSize: '0.8rem',
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  addToBranchBtn: {
    background: '#334155',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.375rem 0.75rem',
    color: '#94a3b8',
    fontSize: '0.8rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    transition: 'all 0.2s'
  },
  emptyBranch: {
    padding: '1rem',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '0.85rem',
    fontStyle: 'italic',
    background: '#0f172a',
    borderRadius: '0.375rem',
    border: '1px dashed #334155'
  },
  addRootBtn: {
    width: '100%',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '1rem',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    marginTop: '1rem',
    transition: 'all 0.2s'
  },
  footer: {
    display: 'flex',
    gap: '1rem',
    padding: '1.5rem',
    borderTop: '2px solid #334155',
    background: '#1e293b'
  },
  cancelBtnFooter: {
    flex: 1,
    background: '#64748b',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.75rem',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  saveBtn: {
    flex: 2,
    background: '#10b981',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.75rem',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  toolStepDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: '#3b82f6',
    fontWeight: '600'
  },
  addMenuBtn: {
    background: 'transparent',
    border: 'none',
    padding: '0.5rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    borderRadius: '0.375rem',
    transition: 'background 0.2s'
  },
  configContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    width: '100%'
  },
  editTextarea: {
    background: '#0f172a',
    border: '1px solid #475569',
    borderRadius: '0.375rem',
    padding: '0.5rem',
    color: '#e2e8f0',
    fontSize: '0.85rem',
    outline: 'none',
    fontFamily: 'monospace',
    resize: 'vertical'
  },
  editSelect: {
    background: '#0f172a',
    border: '1px solid #475569',
    borderRadius: '0.375rem',
    padding: '0.5rem',
    color: '#e2e8f0',
    fontSize: '0.9rem',
    outline: 'none',
    cursor: 'pointer'
  },
  editActions: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center'
  },
  cameraList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    padding: '0.5rem',
    background: '#0f172a',
    borderRadius: '0.375rem',
    border: '1px solid #334155',
    maxHeight: '150px',
    overflowY: 'auto'
  },
  cameraCheckbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: '#e2e8f0',
    fontSize: '0.85rem',
    cursor: 'pointer'
  }
}

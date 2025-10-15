import React from 'react'
import { FileText } from 'lucide-react'
import { styles } from '../styles'
import api from '../../../api/axios'
import { toast } from 'react-toastify'

export default function ActionPlan({
  account,
  actionPlanState,
  onToggleStep,
  onAnswerQuestion,
  onWebhookTrigger,
  onOpenGridView,
  fromHistory,
  alarmId,
  notes,
  callLogs
}) {
  return (
    <div style={styles.actionPlanContainer}>
      {account && account.action_plan && account.action_plan.length > 0 ? (
        <>
          <h2 style={styles.actionPlanTitle}>{fromHistory ? 'Completed Action Plan' : 'Action Plan'}</h2>
          <div style={styles.actionPlanContent}>
            {/* Action Plan Checklist */}
            <div style={styles.actionPlanChecklist}>
              <h3 style={styles.actionPlanSubtitle}>
                {fromHistory ? 'Actions Taken' : `Checklist (${Object.keys(actionPlanState).filter(k => actionPlanState[k]).length}/${account.action_plan.length})`}
              </h3>
              <div style={styles.actionPlanSteps}>
                {account.action_plan.map((step, index) => (
                  <div key={step.id} style={styles.actionPlanStep}>
                    <div style={styles.stepNumber}>{index + 1}</div>
                    <div style={styles.stepContent}>
                      {step.type === 'text' ? (
                        step.isBoolean ? (
                          // Boolean question with YES/NO buttons
                          <div style={styles.booleanStep}>
                            <div style={styles.booleanQuestion}>{step.content}</div>
                            <div style={styles.booleanButtons}>
                              <button
                                style={{
                                  ...styles.booleanBtn,
                                  ...(actionPlanState[step.id] === 'yes' ? styles.booleanBtnYesActive : {})
                                }}
                                onClick={() => {
                                  if (fromHistory) return
                                  const newState = {
                                    ...actionPlanState,
                                    [step.id]: 'yes'
                                  }
                                  onAnswerQuestion(step.id, 'yes')
                                }}
                                disabled={fromHistory}
                              >
                                YES
                              </button>
                              <button
                                style={{
                                  ...styles.booleanBtn,
                                  ...(actionPlanState[step.id] === 'no' ? styles.booleanBtnNoActive : {})
                                }}
                                onClick={() => {
                                  if (fromHistory) return
                                  const newState = {
                                    ...actionPlanState,
                                    [step.id]: 'no'
                                  }
                                  onAnswerQuestion(step.id, 'no')
                                }}
                                disabled={fromHistory}
                              >
                                NO
                              </button>
                            </div>
                            {/* Show conditional steps based on answer */}
                            {actionPlanState[step.id] === 'yes' && step.yesSteps && step.yesSteps.length > 0 && (
                              <div style={styles.branchSteps}>
                                <div style={styles.branchLabel}>→ YES Path:</div>
                                {step.yesSteps.map((branchStep, branchIdx) => (
                                  <div key={branchStep.id} style={styles.branchStepItem}>
                                    <div style={styles.branchStepNumber}>{index + 1}.{branchIdx + 1}</div>
                                    <div style={styles.branchStepContent}>
                                      {branchStep.type === 'text' ? (
                                        branchStep.isBoolean ? (
                                          // Nested Boolean question with YES/NO buttons
                                          <div style={styles.booleanStep}>
                                            <div style={styles.booleanQuestion}>{branchStep.content}</div>
                                            <div style={styles.booleanButtons}>
                                              <button
                                                style={{
                                                  ...styles.booleanBtn,
                                                  ...(actionPlanState[branchStep.id] === 'yes' ? styles.booleanBtnYesActive : {})
                                                }}
                                                onClick={() => {
                                                  onAnswerQuestion(branchStep.id, 'yes')
                                                }}
                                              >
                                                YES
                                              </button>
                                              <button
                                                style={{
                                                  ...styles.booleanBtn,
                                                  ...(actionPlanState[branchStep.id] === 'no' ? styles.booleanBtnNoActive : {})
                                                }}
                                                onClick={() => {
                                                  onAnswerQuestion(branchStep.id, 'no')
                                                }}
                                              >
                                                NO
                                              </button>
                                            </div>
                                            {/* Show nested YES steps */}
                                            {actionPlanState[branchStep.id] === 'yes' && branchStep.yesSteps && branchStep.yesSteps.length > 0 && (
                                              <div style={styles.branchSteps}>
                                                <div style={styles.branchLabel}>→ YES Path:</div>
                                                {branchStep.yesSteps.map((nestedStep, nestedIdx) => (
                                                  <div key={nestedStep.id} style={styles.branchStepItem}>
                                                    <div style={styles.branchStepNumber}>{index + 1}.{branchIdx + 1}.{nestedIdx + 1}</div>
                                                    <div style={styles.branchStepContent}>
                                                      {nestedStep.type === 'text' ? (
                                                        <label style={styles.checkboxLabel}>
                                                          <input
                                                            type="checkbox"
                                                            checked={actionPlanState[nestedStep.id] || false}
                                                            onChange={() => onToggleStep(nestedStep.id)}
                                                            style={styles.checkbox}
                                                          />
                                                          <span style={{...(actionPlanState[nestedStep.id] ? styles.stepTextCompleted : {})}}>{nestedStep.content}</span>
                                                        </label>
                                                      ) : nestedStep.type === 'view_cameras' ? (
                                                        <div style={styles.toolStep}>
                                                          <div style={styles.toolInfo}>
                                                            <span style={styles.toolIcon}>📹</span>
                                                            <span>{nestedStep.label}</span>
                                                            {actionPlanState[nestedStep.id] && <span style={styles.completedBadge}>✓ Completed</span>}
                                                          </div>
                                                          <button
                                                            style={styles.toolButton}
                                                            onClick={async () => {
                                                              onOpenGridView()
                                                              await onToggleStep(nestedStep.id)
                                                            }}
                                                          >
                                                            Open Grid View
                                                          </button>
                                                        </div>
                                                      ) : nestedStep.type === 'webhook' ? (
                                                        <div style={styles.toolStep}>
                                                          <div style={styles.toolInfo}>
                                                            <span style={styles.toolIcon}>🔗</span>
                                                            <span>{nestedStep.label}</span>
                                                            {actionPlanState[nestedStep.id] && <span style={styles.completedBadge}>✓ Completed</span>}
                                                          </div>
                                                          <button
                                                            style={styles.toolButton}
                                                            onClick={() => onWebhookTrigger(nestedStep)}
                                                            disabled={actionPlanState[nestedStep.id]}
                                                          >
                                                            {actionPlanState[nestedStep.id] ? 'Triggered' : 'Trigger'}
                                                          </button>
                                                        </div>
                                                      ) : null}
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                            {/* Show nested NO steps */}
                                            {actionPlanState[branchStep.id] === 'no' && branchStep.noSteps && branchStep.noSteps.length > 0 && (
                                              <div style={styles.branchSteps}>
                                                <div style={styles.branchLabel}>→ NO Path:</div>
                                                {branchStep.noSteps.map((nestedStep, nestedIdx) => (
                                                  <div key={nestedStep.id} style={styles.branchStepItem}>
                                                    <div style={styles.branchStepNumber}>{index + 1}.{branchIdx + 1}.{nestedIdx + 1}</div>
                                                    <div style={styles.branchStepContent}>
                                                      {nestedStep.type === 'text' ? (
                                                        <label style={styles.checkboxLabel}>
                                                          <input
                                                            type="checkbox"
                                                            checked={actionPlanState[nestedStep.id] || false}
                                                            onChange={() => onToggleStep(nestedStep.id)}
                                                            style={styles.checkbox}
                                                          />
                                                          <span style={{...(actionPlanState[nestedStep.id] ? styles.stepTextCompleted : {})}}>{nestedStep.content}</span>
                                                        </label>
                                                      ) : nestedStep.type === 'view_cameras' ? (
                                                        <div style={styles.toolStep}>
                                                          <div style={styles.toolInfo}>
                                                            <span style={styles.toolIcon}>📹</span>
                                                            <span>{nestedStep.label}</span>
                                                            {actionPlanState[nestedStep.id] && <span style={styles.completedBadge}>✓ Completed</span>}
                                                          </div>
                                                          <button
                                                            style={styles.toolButton}
                                                            onClick={async () => {
                                                              onOpenGridView()
                                                              await onToggleStep(nestedStep.id)
                                                            }}
                                                          >
                                                            Open Grid View
                                                          </button>
                                                        </div>
                                                      ) : nestedStep.type === 'webhook' ? (
                                                        <div style={styles.toolStep}>
                                                          <div style={styles.toolInfo}>
                                                            <span style={styles.toolIcon}>🔗</span>
                                                            <span>{nestedStep.label}</span>
                                                            {actionPlanState[nestedStep.id] && <span style={styles.completedBadge}>✓ Completed</span>}
                                                          </div>
                                                          <button
                                                            style={styles.toolButton}
                                                            onClick={() => onWebhookTrigger(nestedStep)}
                                                            disabled={actionPlanState[nestedStep.id]}
                                                          >
                                                            {actionPlanState[nestedStep.id] ? 'Triggered' : 'Trigger'}
                                                          </button>
                                                        </div>
                                                      ) : null}
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <label style={styles.checkboxLabel}>
                                            <input
                                              type="checkbox"
                                              checked={actionPlanState[branchStep.id] || false}
                                              onChange={() => onToggleStep(branchStep.id)}
                                              style={styles.checkbox}
                                            />
                                            <span style={{...(actionPlanState[branchStep.id] ? styles.stepTextCompleted : {})}}>{branchStep.content}</span>
                                          </label>
                                        )
                                      ) : branchStep.type === 'view_cameras' ? (
                                        <div style={styles.toolStep}>
                                          <div style={styles.toolInfo}>
                                            <span style={styles.toolIcon}>📹</span>
                                            <span>{branchStep.label}</span>
                                            {actionPlanState[branchStep.id] && <span style={styles.completedBadge}>✓ Completed</span>}
                                          </div>
                                          <button
                                            style={styles.toolButton}
                                            onClick={async () => {
                                              onOpenGridView()
                                              await onToggleStep(branchStep.id)
                                            }}
                                          >
                                            Open Grid View
                                          </button>
                                        </div>
                                      ) : branchStep.type === 'webhook' ? (
                                        <div style={styles.toolStep}>
                                          <div style={styles.toolInfo}>
                                            <span style={styles.toolIcon}>🔗</span>
                                            <span>{branchStep.label}</span>
                                            {actionPlanState[branchStep.id] && <span style={styles.completedBadge}>✓ Completed</span>}
                                          </div>
                                          <button
                                            style={styles.toolButton}
                                            onClick={() => onWebhookTrigger(branchStep)}
                                            disabled={actionPlanState[branchStep.id]}
                                          >
                                            {actionPlanState[branchStep.id] ? 'Triggered' : 'Trigger'}
                                          </button>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {actionPlanState[step.id] === 'no' && step.noSteps && step.noSteps.length > 0 && (
                              <div style={styles.branchSteps}>
                                <div style={styles.branchLabel}>→ NO Path:</div>
                                {step.noSteps.map((branchStep, branchIdx) => (
                                  <div key={branchStep.id} style={styles.branchStepItem}>
                                    <div style={styles.branchStepNumber}>{index + 1}.{branchIdx + 1}</div>
                                    <div style={styles.branchStepContent}>
                                      {branchStep.type === 'text' ? (
                                        branchStep.isBoolean ? (
                                          // Nested Boolean question with YES/NO buttons
                                          <div style={styles.booleanStep}>
                                            <div style={styles.booleanQuestion}>{branchStep.content}</div>
                                            <div style={styles.booleanButtons}>
                                              <button
                                                style={{
                                                  ...styles.booleanBtn,
                                                  ...(actionPlanState[branchStep.id] === 'yes' ? styles.booleanBtnYesActive : {})
                                                }}
                                                onClick={() => {
                                                  onAnswerQuestion(branchStep.id, 'yes')
                                                }}
                                              >
                                                YES
                                              </button>
                                              <button
                                                style={{
                                                  ...styles.booleanBtn,
                                                  ...(actionPlanState[branchStep.id] === 'no' ? styles.booleanBtnNoActive : {})
                                                }}
                                                onClick={() => {
                                                  onAnswerQuestion(branchStep.id, 'no')
                                                }}
                                              >
                                                NO
                                              </button>
                                            </div>
                                            {/* Show nested YES steps */}
                                            {actionPlanState[branchStep.id] === 'yes' && branchStep.yesSteps && branchStep.yesSteps.length > 0 && (
                                              <div style={styles.branchSteps}>
                                                <div style={styles.branchLabel}>→ YES Path:</div>
                                                {branchStep.yesSteps.map((nestedStep, nestedIdx) => (
                                                  <div key={nestedStep.id} style={styles.branchStepItem}>
                                                    <div style={styles.branchStepNumber}>{index + 1}.{branchIdx + 1}.{nestedIdx + 1}</div>
                                                    <div style={styles.branchStepContent}>
                                                      {nestedStep.type === 'text' ? (
                                                        <label style={styles.checkboxLabel}>
                                                          <input
                                                            type="checkbox"
                                                            checked={actionPlanState[nestedStep.id] || false}
                                                            onChange={() => onToggleStep(nestedStep.id)}
                                                            style={styles.checkbox}
                                                          />
                                                          <span style={{...(actionPlanState[nestedStep.id] ? styles.stepTextCompleted : {})}}>{nestedStep.content}</span>
                                                        </label>
                                                      ) : nestedStep.type === 'view_cameras' ? (
                                                        <div style={styles.toolStep}>
                                                          <div style={styles.toolInfo}>
                                                            <span style={styles.toolIcon}>📹</span>
                                                            <span>{nestedStep.label}</span>
                                                            {actionPlanState[nestedStep.id] && <span style={styles.completedBadge}>✓ Completed</span>}
                                                          </div>
                                                          <button
                                                            style={styles.toolButton}
                                                            onClick={async () => {
                                                              onOpenGridView()
                                                              await onToggleStep(nestedStep.id)
                                                            }}
                                                          >
                                                            Open Grid View
                                                          </button>
                                                        </div>
                                                      ) : nestedStep.type === 'webhook' ? (
                                                        <div style={styles.toolStep}>
                                                          <div style={styles.toolInfo}>
                                                            <span style={styles.toolIcon}>🔗</span>
                                                            <span>{nestedStep.label}</span>
                                                            {actionPlanState[nestedStep.id] && <span style={styles.completedBadge}>✓ Completed</span>}
                                                          </div>
                                                          <button
                                                            style={styles.toolButton}
                                                            onClick={() => onWebhookTrigger(nestedStep)}
                                                            disabled={actionPlanState[nestedStep.id]}
                                                          >
                                                            {actionPlanState[nestedStep.id] ? 'Triggered' : 'Trigger'}
                                                          </button>
                                                        </div>
                                                      ) : null}
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                            {/* Show nested NO steps */}
                                            {actionPlanState[branchStep.id] === 'no' && branchStep.noSteps && branchStep.noSteps.length > 0 && (
                                              <div style={styles.branchSteps}>
                                                <div style={styles.branchLabel}>→ NO Path:</div>
                                                {branchStep.noSteps.map((nestedStep, nestedIdx) => (
                                                  <div key={nestedStep.id} style={styles.branchStepItem}>
                                                    <div style={styles.branchStepNumber}>{index + 1}.{branchIdx + 1}.{nestedIdx + 1}</div>
                                                    <div style={styles.branchStepContent}>
                                                      {nestedStep.type === 'text' ? (
                                                        <label style={styles.checkboxLabel}>
                                                          <input
                                                            type="checkbox"
                                                            checked={actionPlanState[nestedStep.id] || false}
                                                            onChange={() => onToggleStep(nestedStep.id)}
                                                            style={styles.checkbox}
                                                          />
                                                          <span style={{...(actionPlanState[nestedStep.id] ? styles.stepTextCompleted : {})}}>{nestedStep.content}</span>
                                                        </label>
                                                      ) : nestedStep.type === 'view_cameras' ? (
                                                        <div style={styles.toolStep}>
                                                          <div style={styles.toolInfo}>
                                                            <span style={styles.toolIcon}>📹</span>
                                                            <span>{nestedStep.label}</span>
                                                            {actionPlanState[nestedStep.id] && <span style={styles.completedBadge}>✓ Completed</span>}
                                                          </div>
                                                          <button
                                                            style={styles.toolButton}
                                                            onClick={async () => {
                                                              onOpenGridView()
                                                              await onToggleStep(nestedStep.id)
                                                            }}
                                                          >
                                                            Open Grid View
                                                          </button>
                                                        </div>
                                                      ) : nestedStep.type === 'webhook' ? (
                                                        <div style={styles.toolStep}>
                                                          <div style={styles.toolInfo}>
                                                            <span style={styles.toolIcon}>🔗</span>
                                                            <span>{nestedStep.label}</span>
                                                            {actionPlanState[nestedStep.id] && <span style={styles.completedBadge}>✓ Completed</span>}
                                                          </div>
                                                          <button
                                                            style={styles.toolButton}
                                                            onClick={() => onWebhookTrigger(nestedStep)}
                                                            disabled={actionPlanState[nestedStep.id]}
                                                          >
                                                            {actionPlanState[nestedStep.id] ? 'Triggered' : 'Trigger'}
                                                          </button>
                                                        </div>
                                                      ) : null}
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <label style={styles.checkboxLabel}>
                                            <input
                                              type="checkbox"
                                              checked={actionPlanState[branchStep.id] || false}
                                              onChange={() => onToggleStep(branchStep.id)}
                                              style={styles.checkbox}
                                            />
                                            <span style={{...(actionPlanState[branchStep.id] ? styles.stepTextCompleted : {})}}>{branchStep.content}</span>
                                          </label>
                                        )
                                      ) : branchStep.type === 'view_cameras' ? (
                                        <div style={styles.toolStep}>
                                          <div style={styles.toolInfo}>
                                            <span style={styles.toolIcon}>📹</span>
                                            <span>{branchStep.label}</span>
                                            {actionPlanState[branchStep.id] && <span style={styles.completedBadge}>✓ Completed</span>}
                                          </div>
                                          <button
                                            style={styles.toolButton}
                                            onClick={async () => {
                                              onOpenGridView()
                                              await onToggleStep(branchStep.id)
                                            }}
                                          >
                                            Open Grid View
                                          </button>
                                        </div>
                                      ) : branchStep.type === 'webhook' ? (
                                        <div style={styles.toolStep}>
                                          <div style={styles.toolInfo}>
                                            <span style={styles.toolIcon}>🔗</span>
                                            <span>{branchStep.label}</span>
                                            {actionPlanState[branchStep.id] && <span style={styles.completedBadge}>✓ Completed</span>}
                                          </div>
                                          <button
                                            style={styles.toolButton}
                                            onClick={() => onWebhookTrigger(branchStep)}
                                            disabled={actionPlanState[branchStep.id]}
                                          >
                                            {actionPlanState[branchStep.id] ? 'Triggered' : 'Trigger'}
                                          </button>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          // Regular text checklist item
                          <label style={styles.checkboxLabel}>
                            <input
                              type="checkbox"
                              checked={actionPlanState[step.id] || false}
                              onChange={() => onToggleStep(step.id)}
                              style={styles.checkbox}
                            />
                            <span style={{...(actionPlanState[step.id] ? styles.stepTextCompleted : {})}}>{step.content}</span>
                          </label>
                        )
                      ) : step.type === 'view_cameras' ? (
                        <div style={styles.toolStep}>
                          <div style={styles.toolInfo}>
                            <span style={styles.toolIcon}>📹</span>
                            <span>{step.label}</span>
                            {actionPlanState[step.id] && <span style={styles.completedBadge}>✓ Completed</span>}
                          </div>
                          <button
                            style={styles.toolButton}
                            onClick={async () => {
                              onOpenGridView()
                              await onToggleStep(step.id)
                            }}
                          >
                            Open Grid View
                          </button>
                        </div>
                      ) : step.type === 'webhook' ? (
                        <div style={styles.toolStep}>
                          <div style={styles.toolInfo}>
                            <span style={styles.toolIcon}>🔗</span>
                            <span>{step.label}</span>
                            {actionPlanState[step.id] && <span style={styles.completedBadge}>✓ Completed</span>}
                          </div>
                          <button
                            style={styles.toolButton}
                            onClick={() => onWebhookTrigger(step)}
                            disabled={actionPlanState[step.id]}
                          >
                            {actionPlanState[step.id] ? 'Triggered' : 'Trigger'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Tools Sidebar */}
            <div style={styles.quickTools}>
              <h3 style={styles.actionPlanSubtitle}>Quick Tools</h3>
              <div style={styles.quickToolsList}>
                <button
                  style={styles.quickToolBtn}
                  onClick={() => onOpenGridView()}
                >
                  <span style={styles.toolIcon}>📹</span>
                  <span>View All Cameras</span>
                </button>
                {account.action_plan.filter(s => s.type === 'webhook').map(step => (
                  <button
                    key={step.id}
                    style={styles.quickToolBtn}
                    onClick={() => onWebhookTrigger(step)}
                  >
                    <span style={styles.toolIcon}>🔗</span>
                    <span>{step.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <h2 style={styles.actionPlanTitle}>Action Plan</h2>
          <div style={styles.actionPlanContent}>
            <div style={{...styles.noActionPlan, textAlign: 'center', padding: '3rem', color: '#64748b'}}>
              <FileText size={48} style={{marginBottom: '1rem', opacity: 0.5}} />
              <p style={{margin: 0, fontSize: '1.1rem'}}>No action plan configured for this account</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

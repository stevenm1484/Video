import React, { useState, useEffect } from 'react'
import { Zap } from 'lucide-react'
import { toast } from 'react-toastify'
import api from '../api/axios'

export default function QuickToolsTrigger({ accountId }) {
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (accountId) {
      loadTools()
    }
  }, [accountId])

  const loadTools = async () => {
    try {
      const response = await api.get(`/tools?account_id=${accountId}`)
      setTools(response.data)
    } catch (error) {
      console.error('Failed to load tools:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTriggerTool = async (tool, relayNumber = null) => {
    try {
      let params = ''
      if (relayNumber !== null) {
        params = `?relay_number=${relayNumber}`
      }
      const response = await api.post(`/tools/${tool.id}/trigger${params}`)
      toast.success(response.data.message || 'Tool triggered successfully')
    } catch (error) {
      toast.error('Failed to trigger tool')
      console.error(error)
    }
  }

  if (loading || tools.length === 0) {
    return null // Don't show anything if loading or no tools
  }

  return (
    <div style={styles.container}>
      <div style={styles.header} onClick={() => setExpanded(!expanded)}>
        <div style={styles.headerTitle}>
          <Zap size={16} />
          <span>Quick Tools ({tools.length})</span>
        </div>
        <div style={{...styles.expandIcon, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)'}}>
          ▼
        </div>
      </div>

      {expanded && (
        <div style={styles.toolsGrid}>
          {tools.map(tool => (
            <ToolQuickCard
              key={tool.id}
              tool={tool}
              onTrigger={handleTriggerTool}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ToolQuickCard({ tool, onTrigger }) {
  return (
    <div style={styles.toolCard}>
      <div style={styles.toolName}>{tool.name}</div>
      <div style={styles.toolType}>
        {tool.tool_type === 'cbw_relay' ? 'Relay' : 'Webhook'}
      </div>

      {tool.tool_type === 'cbw_relay' && tool.config.relays && tool.config.relays.length > 0 ? (
        <div style={styles.relaysGrid}>
          {tool.config.relays.map((relay, idx) => (
            <button
              key={idx}
              onClick={() => onTrigger(tool, relay.number)}
              style={styles.relayBtn}
              title={relay.description}
            >
              <Zap size={12} />
              <span>R{relay.number}</span>
            </button>
          ))}
        </div>
      ) : (
        <button
          onClick={() => onTrigger(tool)}
          style={styles.triggerBtn}
        >
          <Zap size={14} />
          <span>Trigger</span>
        </button>
      )}
    </div>
  )
}

const styles = {
  container: {
    background: '#1e293b',
    borderRadius: '0.5rem',
    border: '1px solid #334155',
    overflow: 'hidden',
    marginTop: '0.75rem'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    cursor: 'pointer',
    transition: 'background 0.2s',
    background: '#0f172a'
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#e2e8f0'
  },
  expandIcon: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    transition: 'transform 0.2s'
  },
  toolsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '0.75rem',
    padding: '0.75rem'
  },
  toolCard: {
    background: '#0f172a',
    borderRadius: '0.375rem',
    border: '1px solid #334155',
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  toolName: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#e2e8f0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  toolType: {
    fontSize: '0.6875rem',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  relaysGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))',
    gap: '0.375rem',
    marginTop: '0.25rem'
  },
  relayBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.25rem',
    padding: '0.375rem 0.5rem',
    background: '#334155',
    border: 'none',
    borderRadius: '0.25rem',
    color: '#10b981',
    fontSize: '0.6875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  triggerBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    padding: '0.5rem',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
    marginTop: '0.25rem'
  }
}

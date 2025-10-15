import React, { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import {
  Activity, Cpu, HardDrive, Wifi, Database, Video,
  AlertCircle, CheckCircle, AlertTriangle, RefreshCw, Mail
} from 'lucide-react'
import api from '../api/axios'

export default function SystemHealth() {
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [restartingSmtp, setRestartingSmtp] = useState(false)

  useEffect(() => {
    loadHealth()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      loadHealth()
    }, 5000) // Refresh every 5 seconds

    return () => clearInterval(interval)
  }, [autoRefresh])

  const loadHealth = async () => {
    try {
      const response = await api.get('/system-health')
      setHealth(response.data)
      setLoading(false)
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error('Access denied. Superadmin only.')
      } else {
        toast.error('Failed to load system health')
      }
      setLoading(false)
    }
  }

  const handleRestartSmtp = async () => {
    if (!window.confirm('Are you sure you want to restart the SMTP server?')) {
      return
    }

    setRestartingSmtp(true)
    try {
      await api.post('/system-health/smtp/restart')
      toast.success('SMTP server restart initiated')
      // Wait a moment then refresh
      setTimeout(() => {
        loadHealth()
        setRestartingSmtp(false)
      }, 2000)
    } catch (error) {
      toast.error('Failed to restart SMTP server')
      console.error(error)
      setRestartingSmtp(false)
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle size={20} color="#10b981" />
      case 'warning':
        return <AlertTriangle size={20} color="#f59e0b" />
      case 'critical':
        return <AlertCircle size={20} color="#ef4444" />
      default:
        return <Activity size={20} color="#64748b" />
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy':
        return '#10b981'
      case 'warning':
        return '#f59e0b'
      case 'critical':
        return '#ef4444'
      default:
        return '#64748b'
    }
  }

  const formatBytes = (bytes) => {
    return `${bytes} GB`
  }

  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner}></div>
        <p>Loading system health...</p>
      </div>
    )
  }

  if (!health) {
    return (
      <div style={styles.error}>
        <AlertCircle size={48} color="#ef4444" />
        <p>Failed to load system health</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>System Health Monitor</h1>
          <p style={styles.subtitle}>Real-time system metrics and status</p>
        </div>
        <div style={styles.headerActions}>
          <button
            style={{
              ...styles.toggleBtn,
              background: autoRefresh ? '#10b981' : '#64748b'
            }}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw size={18} />
            <span>{autoRefresh ? 'Auto-Refresh On' : 'Auto-Refresh Off'}</span>
          </button>
          <button style={styles.refreshBtn} onClick={loadHealth}>
            <RefreshCw size={18} />
            <span>Refresh Now</span>
          </button>
        </div>
      </div>

      {/* Overall Status Banner */}
      <div
        style={{
          ...styles.overallBanner,
          background: health.overall.status === 'healthy' ? '#10b981' : health.overall.status === 'warning' ? '#f59e0b' : '#ef4444'
        }}
      >
        {getStatusIcon(health.overall.status)}
        <div>
          <div style={styles.overallTitle}>System Status: {health.overall.status.toUpperCase()}</div>
          {health.overall.warnings.length > 0 && (
            <div style={styles.overallList}>
              Warnings: {health.overall.warnings.join(', ')}
            </div>
          )}
          {health.overall.criticals.length > 0 && (
            <div style={styles.overallList}>
              Critical: {health.overall.criticals.join(', ')}
            </div>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={styles.grid}>
        {/* CPU Card */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <Cpu size={24} />
            <h3 style={styles.cardTitle}>CPU</h3>
            {getStatusIcon(health.cpu.status)}
          </div>
          <div style={styles.cardBody}>
            <div style={styles.metricRow}>
              <span>Cores:</span>
              <strong>{health.cpu.cores}</strong>
            </div>
            <div style={styles.metricRow}>
              <span>Average Usage:</span>
              <strong>{health.cpu.average_usage}%</strong>
            </div>
            <div style={styles.metricRow}>
              <span>Load (1/5/15m):</span>
              <strong>{health.cpu.load_average.join('% / ')}%</strong>
            </div>
            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${health.cpu.average_usage}%`,
                  background: getStatusColor(health.cpu.status)
                }}
              />
            </div>
          </div>
        </div>

        {/* GPU Card */}
        {health.gpu.available ? (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <Video size={24} />
              <h3 style={styles.cardTitle}>GPU (NVIDIA)</h3>
              {getStatusIcon(health.gpu.status)}
            </div>
            <div style={styles.cardBody}>
              <div style={styles.metricRow}>
                <span>Utilization:</span>
                <strong>{health.gpu.utilization}%</strong>
              </div>
              <div style={styles.metricRow}>
                <span>Memory:</span>
                <strong>{health.gpu.memory_used_mb} MB / {health.gpu.memory_total_mb} MB</strong>
              </div>
              <div style={styles.metricRow}>
                <span>Temperature:</span>
                <strong>{health.gpu.temperature}°C</strong>
              </div>
              <div style={styles.progressBar}>
                <div
                  style={{
                    ...styles.progressFill,
                    width: `${health.gpu.memory_percent}%`,
                    background: getStatusColor(health.gpu.status)
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <Video size={24} />
              <h3 style={styles.cardTitle}>GPU</h3>
              <AlertCircle size={20} color="#64748b" />
            </div>
            <div style={styles.cardBody}>
              <p style={{ color: '#94a3b8', textAlign: 'center' }}>GPU not available</p>
              <p style={{ color: '#64748b', fontSize: '0.75rem', textAlign: 'center' }}>
                {health.gpu.reason}
              </p>
            </div>
          </div>
        )}

        {/* RAM Card */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <Activity size={24} />
            <h3 style={styles.cardTitle}>RAM</h3>
            {getStatusIcon(health.ram.status)}
          </div>
          <div style={styles.cardBody}>
            <div style={styles.metricRow}>
              <span>Used / Total:</span>
              <strong>{health.ram.used_gb} GB / {health.ram.total_gb} GB</strong>
            </div>
            <div style={styles.metricRow}>
              <span>Available:</span>
              <strong>{health.ram.available_gb} GB</strong>
            </div>
            <div style={styles.metricRow}>
              <span>Usage:</span>
              <strong>{health.ram.percent}%</strong>
            </div>
            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${health.ram.percent}%`,
                  background: getStatusColor(health.ram.status)
                }}
              />
            </div>
            {health.ram.swap_total_gb > 0 && (
              <>
                <div style={{ ...styles.metricRow, marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #334155' }}>
                  <span>Swap Used:</span>
                  <strong>{health.ram.swap_used_gb} GB / {health.ram.swap_total_gb} GB</strong>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Network Card */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <Wifi size={24} />
            <h3 style={styles.cardTitle}>Network</h3>
            {getStatusIcon(health.network.status)}
          </div>
          <div style={styles.cardBody}>
            <div style={styles.metricRow}>
              <span>Sent / Received:</span>
              <strong>{health.network.bytes_sent_gb} GB / {health.network.bytes_recv_gb} GB</strong>
            </div>
            <div style={styles.metricRow}>
              <span>Active Connections:</span>
              <strong>{health.network.active_connections}</strong>
            </div>
            <div style={styles.metricRow}>
              <span>Errors:</span>
              <strong>{health.network.errors_in + health.network.errors_out}</strong>
            </div>
            <div style={styles.metricRow}>
              <span>Drops:</span>
              <strong>{health.network.drops_in + health.network.drops_out}</strong>
            </div>
          </div>
        </div>

        {/* FFmpeg Card */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <Video size={24} />
            <h3 style={styles.cardTitle}>FFmpeg Processes</h3>
            {getStatusIcon(health.ffmpeg.status)}
          </div>
          <div style={styles.cardBody}>
            <div style={styles.metricRow}>
              <span>Active Processes:</span>
              <strong>{health.ffmpeg.active_processes}</strong>
            </div>
            {health.ffmpeg.processes.map((proc, idx) => (
              <div key={idx} style={styles.processItem}>
                <div style={styles.processHeader}>
                  <span>PID {proc.pid}</span>
                  <span style={styles.processRuntime}>{proc.runtime_formatted}</span>
                </div>
                <div style={styles.processStats}>
                  <span>CPU: {proc.cpu_percent}%</span>
                  <span>RAM: {proc.memory_mb} MB</span>
                </div>
              </div>
            ))}
            {health.ffmpeg.active_processes === 0 && (
              <p style={{ color: '#94a3b8', textAlign: 'center', margin: '1rem 0' }}>
                No FFmpeg processes running
              </p>
            )}
          </div>
        </div>

        {/* Redis Card */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <Database size={24} />
            <h3 style={styles.cardTitle}>Redis</h3>
            {health.redis.healthy ? (
              <CheckCircle size={20} color="#10b981" />
            ) : (
              <AlertCircle size={20} color="#ef4444" />
            )}
          </div>
          <div style={styles.cardBody}>
            <div style={styles.metricRow}>
              <span>Status:</span>
              <strong style={{ color: health.redis.healthy ? '#10b981' : '#ef4444' }}>
                {health.redis.status.toUpperCase()}
              </strong>
            </div>
            {health.redis.error && (
              <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                {health.redis.error}
              </p>
            )}
          </div>
        </div>

        {/* Database Card */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <Database size={24} />
            <h3 style={styles.cardTitle}>Database</h3>
            {health.database.healthy ? (
              <CheckCircle size={20} color="#10b981" />
            ) : (
              <AlertCircle size={20} color="#ef4444" />
            )}
          </div>
          <div style={styles.cardBody}>
            <div style={styles.metricRow}>
              <span>Status:</span>
              <strong style={{ color: health.database.healthy ? '#10b981' : '#ef4444' }}>
                {health.database.status.toUpperCase()}
              </strong>
            </div>
            {health.database.error && (
              <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                {health.database.error}
              </p>
            )}
          </div>
        </div>

        {/* Streaming Card */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <Video size={24} />
            <h3 style={styles.cardTitle}>Active Streams</h3>
            {getStatusIcon(health.streaming.status)}
          </div>
          <div style={styles.cardBody}>
            <div style={styles.metricRow}>
              <span>Active Streams:</span>
              <strong>{health.streaming.active_streams}</strong>
            </div>
          </div>
        </div>

        {/* SMTP Server Card */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <Mail size={24} />
            <h3 style={styles.cardTitle}>SMTP Server</h3>
            {health.smtp.running ? (
              <CheckCircle size={20} color="#10b981" />
            ) : (
              <AlertCircle size={20} color="#ef4444" />
            )}
          </div>
          <div style={styles.cardBody}>
            <div style={styles.metricRow}>
              <span>Status:</span>
              <strong style={{ color: health.smtp.running ? '#10b981' : '#ef4444' }}>
                {health.smtp.running ? 'RUNNING' : 'NOT RUNNING'}
              </strong>
            </div>
            <div style={styles.metricRow}>
              <span>Port:</span>
              <strong>{health.smtp.port}</strong>
            </div>
            <p style={{
              color: health.smtp.running ? '#94a3b8' : '#ef4444',
              fontSize: '0.75rem',
              marginTop: '0.5rem',
              lineHeight: '1.4'
            }}>
              {health.smtp.message}
            </p>
            <button
              style={{
                ...styles.restartBtn,
                opacity: restartingSmtp ? 0.6 : 1,
                cursor: restartingSmtp ? 'not-allowed' : 'pointer'
              }}
              onClick={handleRestartSmtp}
              disabled={restartingSmtp}
            >
              <RefreshCw size={16} style={{
                animation: restartingSmtp ? 'spin 1s linear infinite' : 'none'
              }} />
              <span>{restartingSmtp ? 'Restarting...' : 'Restart SMTP'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Disk Usage */}
      <div style={styles.diskSection}>
        <h2 style={styles.sectionTitle}>
          <HardDrive size={24} />
          <span>Disk Usage</span>
        </h2>
        <div style={styles.diskGrid}>
          {health.disks.map((disk, idx) => (
            <div key={idx} style={styles.diskCard}>
              <div style={styles.diskHeader}>
                <div>
                  <div style={styles.diskMount}>{disk.mountpoint}</div>
                  <div style={styles.diskDevice}>{disk.device} ({disk.fstype})</div>
                </div>
                {getStatusIcon(disk.status)}
              </div>
              <div style={styles.diskStats}>
                <div style={styles.diskStat}>
                  <span>Total</span>
                  <strong>{disk.total_gb} GB</strong>
                </div>
                <div style={styles.diskStat}>
                  <span>Used</span>
                  <strong>{disk.used_gb} GB</strong>
                </div>
                <div style={styles.diskStat}>
                  <span>Free</span>
                  <strong>{disk.free_gb} GB</strong>
                </div>
                <div style={styles.diskStat}>
                  <span>Usage</span>
                  <strong>{disk.percent}%</strong>
                </div>
              </div>
              <div style={styles.progressBar}>
                <div
                  style={{
                    ...styles.progressFill,
                    width: `${disk.percent}%`,
                    background: getStatusColor(disk.status)
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Timestamp */}
      <div style={styles.timestamp}>
        Last updated: {new Date(health.overall.timestamp).toLocaleString()}
      </div>
    </div>
  )
}

const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1400px',
    margin: '0 auto'
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    gap: '1rem',
    color: '#94a3b8'
  },
  error: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    gap: '1rem',
    color: '#ef4444'
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #334155',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
    flexWrap: 'wrap',
    gap: '1rem'
  },
  title: {
    fontSize: '2rem',
    fontWeight: '700',
    margin: 0,
    color: '#e2e8f0'
  },
  subtitle: {
    color: '#94a3b8',
    margin: '0.5rem 0 0 0'
  },
  headerActions: {
    display: 'flex',
    gap: '0.75rem'
  },
  toggleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'opacity 0.2s'
  },
  refreshBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  overallBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '1rem 1.5rem',
    borderRadius: '0.75rem',
    marginBottom: '2rem',
    color: '#fff'
  },
  overallTitle: {
    fontSize: '1.25rem',
    fontWeight: '700'
  },
  overallList: {
    fontSize: '0.875rem',
    marginTop: '0.25rem',
    opacity: 0.9
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '1.5rem',
    marginBottom: '2rem'
  },
  card: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    overflow: 'hidden'
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem 1.5rem',
    borderBottom: '1px solid #334155',
    background: '#0f172a'
  },
  cardTitle: {
    flex: 1,
    fontSize: '1rem',
    fontWeight: '600',
    margin: 0,
    color: '#e2e8f0'
  },
  cardBody: {
    padding: '1.5rem'
  },
  metricRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
    fontSize: '0.875rem',
    color: '#94a3b8'
  },
  progressBar: {
    width: '100%',
    height: '8px',
    background: '#334155',
    borderRadius: '9999px',
    overflow: 'hidden',
    marginTop: '1rem'
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.5s ease'
  },
  processItem: {
    background: '#0f172a',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    marginTop: '0.5rem',
    border: '1px solid #334155'
  },
  processHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
    fontSize: '0.75rem',
    color: '#e2e8f0'
  },
  processRuntime: {
    color: '#3b82f6'
  },
  processStats: {
    display: 'flex',
    gap: '1rem',
    fontSize: '0.75rem',
    color: '#94a3b8'
  },
  diskSection: {
    marginTop: '2rem'
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    fontSize: '1.5rem',
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: '1rem'
  },
  diskGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
    gap: '1.5rem'
  },
  diskCard: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    padding: '1.5rem'
  },
  diskHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem'
  },
  diskMount: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: '#e2e8f0'
  },
  diskDevice: {
    fontSize: '0.75rem',
    color: '#64748b',
    marginTop: '0.25rem'
  },
  diskStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1rem',
    marginBottom: '1rem'
  },
  diskStat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  timestamp: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: '0.875rem',
    marginTop: '2rem',
    paddingTop: '2rem',
    borderTop: '1px solid #334155'
  },
  restartBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    width: '100%',
    marginTop: '1rem',
    padding: '0.75rem 1rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    fontSize: '0.875rem',
    transition: 'background 0.2s'
  }
}

import React, { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import { AlertCircle, Clock, Camera, Video, ArrowUpCircle } from 'lucide-react'
import api from '../api/axios'
import { formatTimestampInTimezone } from '../utils/timezone'

export default function PendingStatus() {
  const [pendingGroups, setPendingGroups] = useState([])
  const [escalatedGroups, setEscalatedGroups] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPendingStatus()
    // Refresh every 5 seconds
    const interval = setInterval(loadPendingStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadPendingStatus = async () => {
    try {
      const response = await api.get('/dashboard-items?show_all_holds=false')
      const allGroups = response.data

      // Filter for pending (unclaimed and not on hold)
      const pending = allGroups.filter(g => !g.claimed_by && !g.on_hold && !g.escalated)
      const escalated = allGroups.filter(g => !g.claimed_by && !g.on_hold && g.escalated)

      // Sort by priority
      pending.sort((a, b) => (a.priority || 5) - (b.priority || 5))
      escalated.sort((a, b) => (a.priority || 5) - (b.priority || 5))

      setPendingGroups(pending)
      setEscalatedGroups(escalated)
    } catch (error) {
      toast.error('Failed to load pending status')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading pending status...</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <Clock size={32} color="#3b82f6" />
          <h1 style={styles.title}>Pending Events Status</h1>
        </div>
        <p style={styles.subtitle}>All pending and escalated events awaiting assignment</p>
      </div>

      {/* Escalated Events Section */}
      {escalatedGroups.length > 0 && (
        <div style={{...styles.section, marginBottom: '2rem'}}>
          <div style={styles.sectionHeader}>
            <ArrowUpCircle size={24} color="#f59e0b" />
            <h2 style={{...styles.sectionTitle, color: '#f59e0b'}}>Escalated Pending ({escalatedGroups.length})</h2>
          </div>
          <div style={styles.grid}>
            {escalatedGroups.map(group => (
              <PendingCard key={group.account_id} group={group} isEscalated={true} />
            ))}
          </div>
        </div>
      )}

      {/* Normal Pending Events Section */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <Clock size={24} color="#3b82f6" />
          <h2 style={styles.sectionTitle}>Normal Pending ({pendingGroups.length})</h2>
        </div>
        {pendingGroups.length === 0 ? (
          <div style={styles.emptyState}>
            <Clock size={48} color="#64748b" />
            <p>No pending events</p>
          </div>
        ) : (
          <div style={styles.grid}>
            {pendingGroups.map(group => (
              <PendingCard key={group.account_id} group={group} isEscalated={false} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PendingCard({ group, isEscalated }) {
  const firstEvent = group.events[0]
  const mediaPaths = firstEvent?.media_paths || []
  const hasMedia = mediaPaths.length > 0

  return (
    <div style={{
      ...styles.card,
      borderColor: isEscalated ? '#f59e0b' : '#334155'
    }}>
      {/* Media Preview */}
      <div style={styles.mediaContainer}>
        {hasMedia ? (
          firstEvent.media_type === 'video' || mediaPaths[0]?.endsWith('.mp4') ? (
            <video
              src={`/${mediaPaths[0]}`}
              style={styles.media}
              autoPlay
              muted
              loop
            />
          ) : (
            <img
              src={`/${mediaPaths[0]}`}
              alt="Event"
              style={styles.media}
            />
          )
        ) : (
          <div style={styles.noMedia}>No media</div>
        )}
        {isEscalated && (
          <div style={styles.escalatedBadge}>
            <ArrowUpCircle size={14} />
            <span>ESCALATED</span>
          </div>
        )}
      </div>

      {/* Account Info */}
      <div style={styles.cardContent}>
        <div style={styles.accountHeader}>
          <div style={styles.accountNumber}>{group.account_number}</div>
          <div style={styles.priorityBadge}>P{group.priority || 5}</div>
        </div>
        <div style={styles.accountName}>{group.account_name}</div>

        {/* Event Stats */}
        <div style={styles.stats}>
          <div style={styles.statItem}>
            <AlertCircle size={16} />
            <span>{group.event_count} event{group.event_count > 1 ? 's' : ''}</span>
          </div>
          <div style={styles.statItem}>
            <Camera size={16} />
            <span>{group.camera_count} camera{group.camera_count > 1 ? 's' : ''}</span>
          </div>
          <div style={styles.statItem}>
            <Video size={16} />
            <span>{group.total_media_count} clip{group.total_media_count > 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* First Event Time */}
        <div style={styles.timeInfo}>
          <Clock size={14} color="#94a3b8" />
          <span style={styles.timeText}>
            {formatTimestampInTimezone(firstEvent.timestamp, group.account_timezone, { showTimezone: false })}
          </span>
        </div>

        {/* Escalation Notes if present */}
        {firstEvent.notes && (
          <div style={styles.notes}>
            <strong>Notes:</strong> {firstEvent.notes}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    padding: '2rem'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
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
  header: {
    marginBottom: '2rem'
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '0.5rem'
  },
  title: {
    fontSize: '2rem',
    fontWeight: '700',
    color: '#e2e8f0',
    margin: 0
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '1rem',
    margin: 0,
    marginLeft: '3rem'
  },
  section: {
    marginBottom: '1rem'
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1rem',
    padding: '0.75rem 1rem',
    background: '#1e293b',
    borderRadius: '0.5rem',
    border: '1px solid #334155'
  },
  sectionTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#e2e8f0',
    margin: 0
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '1.5rem'
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem',
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    gap: '1rem',
    color: '#94a3b8'
  },
  card: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '2px solid',
    overflow: 'hidden',
    transition: 'transform 0.2s, box-shadow 0.2s'
  },
  mediaContainer: {
    width: '100%',
    height: '200px',
    background: '#000',
    position: 'relative'
  },
  media: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  noMedia: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#64748b',
    fontSize: '0.875rem'
  },
  escalatedBadge: {
    position: 'absolute',
    top: '0.5rem',
    right: '0.5rem',
    background: '#f59e0b',
    color: '#fff',
    padding: '0.375rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.7rem',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
  },
  cardContent: {
    padding: '1rem'
  },
  accountHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem'
  },
  accountNumber: {
    fontSize: '1.25rem',
    fontWeight: '700',
    color: '#3b82f6'
  },
  priorityBadge: {
    background: '#334155',
    color: '#cbd5e1',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: '600'
  },
  accountName: {
    fontSize: '0.875rem',
    color: '#94a3b8',
    marginBottom: '1rem'
  },
  stats: {
    display: 'flex',
    gap: '0.75rem',
    marginBottom: '0.75rem',
    flexWrap: 'wrap'
  },
  statItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    background: '#334155',
    padding: '0.25rem 0.5rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    color: '#cbd5e1'
  },
  timeInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem',
    background: '#0f172a',
    borderRadius: '0.375rem',
    marginBottom: '0.5rem'
  },
  timeText: {
    fontSize: '0.8rem',
    color: '#cbd5e1'
  },
  notes: {
    fontSize: '0.75rem',
    color: '#cbd5e1',
    background: '#0f172a',
    padding: '0.5rem',
    borderRadius: '0.375rem',
    marginTop: '0.5rem',
    lineHeight: '1.4'
  }
}

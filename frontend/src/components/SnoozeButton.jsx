import React, { useState, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { Clock, X } from 'lucide-react'
import api from '../api/axios'

export default function SnoozeButton({
  type, // 'camera' or 'account'
  id,
  snoozedUntil,
  onSnoozeUpdate,
  buttonStyle = {},
  showLabel = true
}) {
  const [showMenu, setShowMenu] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customDate, setCustomDate] = useState('')
  const [customTime, setCustomTime] = useState('')
  const [loading, setLoading] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  // Quick snooze options in minutes
  const quickOptions = [
    { label: '10 minutes', minutes: 10 },
    { label: '30 minutes', minutes: 30 },
    { label: '1 hour', minutes: 60 },
    { label: '8 hours', minutes: 480 },
    { label: '24 hours', minutes: 1440 }
  ]

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false)
        setShowCustom(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  const handleQuickSnooze = async (minutes) => {
    setLoading(true)
    try {
      const endpoint = type === 'camera'
        ? `/cameras/${id}/snooze`
        : `/accounts/${id}/snooze`

      await api.post(endpoint, { duration_minutes: minutes })

      if (onSnoozeUpdate) {
        onSnoozeUpdate()
      }

      setShowMenu(false)
    } catch (error) {
      console.error('Error snoozing:', error)
      alert('Failed to snooze. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleCustomSnooze = async () => {
    if (!customDate || !customTime) {
      alert('Please select both date and time')
      return
    }

    setLoading(true)
    try {
      const untilDatetime = new Date(`${customDate}T${customTime}`)
      const endpoint = type === 'camera'
        ? `/cameras/${id}/snooze`
        : `/accounts/${id}/snooze`

      await api.post(endpoint, { until_datetime: untilDatetime.toISOString() })

      if (onSnoozeUpdate) {
        onSnoozeUpdate()
      }

      setShowMenu(false)
      setShowCustom(false)
      setCustomDate('')
      setCustomTime('')
    } catch (error) {
      console.error('Error snoozing:', error)
      alert('Failed to snooze. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleUnsnooze = async () => {
    setLoading(true)
    try {
      const endpoint = type === 'camera'
        ? `/cameras/${id}/unsnooze`
        : `/accounts/${id}/unsnooze`

      await api.post(endpoint)

      if (onSnoozeUpdate) {
        onSnoozeUpdate()
      }

      setShowMenu(false)
    } catch (error) {
      console.error('Error unsnoozing:', error)
      alert('Failed to remove snooze. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const isSnoozed = snoozedUntil && new Date(snoozedUntil) > new Date()

  console.log('SnoozeButton render - showMenu:', showMenu, 'isSnoozed:', isSnoozed)

  return (
    <div style={{ position: 'relative', display: 'inline-block', flex: buttonStyle.flex || 0 }}>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation()
          console.log('Snooze button clicked, current showMenu:', showMenu, 'setting to:', !showMenu)

          if (!showMenu && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect()
            const menuHeight = 300 // Approximate menu height
            const spaceBelow = window.innerHeight - rect.bottom
            const spaceAbove = rect.top

            // Position menu above button if not enough space below
            const shouldPositionAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow

            setMenuPosition({
              top: shouldPositionAbove
                ? rect.top + window.scrollY - menuHeight - 8
                : rect.bottom + window.scrollY + 8,
              left: rect.left + window.scrollX // Align left edge of menu with left edge of button
            })
          }

          setShowMenu(!showMenu)
        }}
        disabled={loading}
        style={{
          ...styles.button,
          ...(isSnoozed ? styles.snoozedButton : {}),
          ...buttonStyle,
          width: '100%'
        }}
      >
        <Clock size={16} />
        {showLabel && (
          <span>{isSnoozed ? 'Snoozed' : 'Snooze'}</span>
        )}
      </button>

      {showMenu && ReactDOM.createPortal(
        <div
          ref={menuRef}
          style={{
            ...styles.menu,
            position: 'fixed',
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            console.log('Menu is rendering! isSnoozed:', isSnoozed, 'showCustom:', showCustom)
            return null
          })()}
          {isSnoozed ? (
            <>
              <div style={styles.snoozedInfo}>
                Snoozed until: {new Date(snoozedUntil).toLocaleString()}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleUnsnooze()
                }}
                disabled={loading}
                style={styles.menuItem}
              >
                Remove Snooze
              </button>
            </>
          ) : showCustom ? (
            <div style={styles.customForm}>
              <div style={styles.customHeader}>
                <span style={styles.customTitle}>Custom Snooze</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowCustom(false)
                  }}
                  style={styles.closeBtn}
                >
                  <X size={16} />
                </button>
              </div>
              <div style={styles.customFields}>
                <div style={styles.field}>
                  <label style={styles.label}>Date</label>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    style={styles.input}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Time</label>
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    style={styles.input}
                  />
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleCustomSnooze()
                }}
                disabled={loading || !customDate || !customTime}
                style={styles.confirmBtn}
              >
                {loading ? 'Snoozing...' : 'Confirm'}
              </button>
            </div>
          ) : (
            <>
              {quickOptions.map((option) => (
                <button
                  key={option.minutes}
                  onClick={(e) => {
                    e.stopPropagation()
                    console.log('Quick snooze clicked:', option.minutes)
                    handleQuickSnooze(option.minutes)
                  }}
                  disabled={loading}
                  style={styles.menuItem}
                >
                  {option.label}
                </button>
              ))}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowCustom(true)
                }}
                disabled={loading}
                style={styles.menuItem}
              >
                Custom date/time...
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

const styles = {
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.625rem 1rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
    ':hover': {
      background: '#2563eb'
    }
  },
  snoozedButton: {
    background: '#8b5cf6',
  },
  menu: {
    position: 'absolute',
    top: 'calc(100% + 0.5rem)',
    right: 0,
    background: '#1e293b',
    border: '2px solid #3b82f6',
    borderRadius: '0.5rem',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
    width: '200px',
    maxWidth: '200px',
    zIndex: 9999,
    overflow: 'hidden'
  },
  menuItem: {
    width: '100%',
    padding: '0.75rem 1rem',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid #334155',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'background 0.2s',
    ':last-child': {
      borderBottom: 'none'
    },
    ':hover': {
      background: '#334155'
    },
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed'
    }
  },
  snoozedInfo: {
    padding: '0.75rem 1rem',
    fontSize: '0.8rem',
    color: '#94a3b8',
    borderBottom: '1px solid #334155'
  },
  customForm: {
    padding: '1rem'
  },
  customHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem'
  },
  customTitle: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#e2e8f0'
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
    alignItems: 'center'
  },
  customFields: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginBottom: '1rem'
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  label: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#cbd5e1'
  },
  input: {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.375rem',
    padding: '0.5rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    outline: 'none'
  },
  confirmBtn: {
    width: '100%',
    padding: '0.5rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed'
    }
  }
}

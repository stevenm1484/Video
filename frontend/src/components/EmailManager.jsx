import React, { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'react-toastify'

export default function EmailManager({ emails, onChange }) {
  const [newEmail, setNewEmail] = useState('')
  const [newEmailType, setNewEmailType] = useState('all')

  const addEmail = () => {
    if (!newEmail || !newEmail.includes('@')) {
      toast.error('Please enter a valid email address')
      return
    }

    const emailObj = { email: newEmail.trim(), type: newEmailType }
    onChange([...emails, emailObj])
    setNewEmail('')
    setNewEmailType('all')
  }

  const removeEmail = (index) => {
    onChange(emails.filter((_, i) => i !== index))
  }

  const getTypeLabel = (type) => {
    switch (type) {
      case 'all':
        return 'All'
      case 'general':
        return 'General'
      case 'vital_signs':
        return 'Vital Signs'
      default:
        return type
    }
  }

  return (
    <div style={styles.emailManager}>
      <div style={styles.emailInputRow}>
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          onKeyPress={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail() } }}
          style={{ ...styles.input, flex: 1 }}
          placeholder="email@example.com"
        />
        <select
          value={newEmailType}
          onChange={(e) => setNewEmailType(e.target.value)}
          style={{ ...styles.input, width: '180px' }}
        >
          <option value="all">All Notifications</option>
          <option value="general">General Only</option>
          <option value="vital_signs">Vital Signs Only</option>
        </select>
        <button
          type="button"
          onClick={addEmail}
          style={styles.addEmailBtn}
          title="Add email"
        >
          <Plus size={16} />
        </button>
      </div>
      {emails.length > 0 && (
        <div style={styles.emailList}>
          {emails.map((emailObj, index) => (
            <div key={index} style={styles.emailItem}>
              <span style={styles.emailAddress}>{emailObj.email}</span>
              <span style={styles.emailTypeBadge}>
                {getTypeLabel(emailObj.type)}
              </span>
              <button
                type="button"
                onClick={() => removeEmail(index)}
                style={styles.removeEmailBtn}
                title="Remove email"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles = {
  emailManager: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  emailInputRow: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center'
  },
  input: {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    padding: '0.625rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    outline: 'none'
  },
  addEmailBtn: {
    padding: '0.625rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'background 0.2s'
  },
  emailList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.5rem',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155'
  },
  emailItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem',
    background: '#1e293b',
    borderRadius: '0.375rem'
  },
  emailAddress: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: '0.875rem'
  },
  emailTypeBadge: {
    padding: '0.25rem 0.5rem',
    background: '#334155',
    borderRadius: '0.25rem',
    color: '#94a3b8',
    fontSize: '0.75rem',
    fontWeight: '500'
  },
  removeEmailBtn: {
    padding: '0.375rem',
    background: '#ef4444',
    border: 'none',
    borderRadius: '0.25rem',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    transition: 'background 0.2s'
  }
}

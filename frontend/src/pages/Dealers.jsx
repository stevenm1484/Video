import React, { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import { Building2, Plus, Edit2, Trash2, Shield, X } from 'lucide-react'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import EmailManager from '../components/EmailManager'

export default function Dealers() {
  const [dealers, setDealers] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDealerModal, setShowDealerModal] = useState(false)
  const [editingDealer, setEditingDealer] = useState(null)
  const currentUser = useAuthStore(state => state.user)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [dealersRes, groupsRes] = await Promise.all([
        api.get('/dealers'),
        api.get('/groups')
      ])
      setDealers(dealersRes.data)
      setGroups(groupsRes.data)
    } catch (error) {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteDealer = async (dealerId) => {
    if (!window.confirm('Are you sure you want to delete this dealer? This will affect all users and accounts assigned to it.')) return

    try {
      await api.delete(`/dealers/${dealerId}`)
      loadData()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete dealer')
    }
  }

  const isAdmin = currentUser?.role?.includes('admin')

  if (!isAdmin) {
    return (
      <div style={styles.container}>
        <div style={styles.accessDenied}>
          <Shield size={64} color="#ef4444" />
          <h2 style={styles.accessDeniedTitle}>Access Denied</h2>
          <p style={styles.accessDeniedText}>Only administrators can manage dealers.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading dealers...</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Dealer Management</h1>
          <p style={styles.subtitle}>{dealers.length} total dealers</p>
        </div>
        <button onClick={() => { setEditingDealer(null); setShowDealerModal(true) }} style={styles.addBtn}>
          <Plus size={20} />
          <span>Add Dealer</span>
        </button>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.th}>Dealer Name</th>
              <th style={styles.th}>Group</th>
              <th style={styles.th}>Created</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {dealers.map(dealer => {
              const group = groups.find(g => g.id === dealer.group_id)
              return (
                <tr key={dealer.id} style={styles.tableRow}>
                  <td style={styles.td}>
                    <div style={styles.dealerCell}>
                      <Building2 size={16} color="#94a3b8" />
                      <span style={{ fontWeight: '600' }}>{dealer.name}</span>
                    </div>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.groupBadge}>
                      {group ? group.name : 'No Group'}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {new Date(dealer.created_at).toLocaleDateString()}
                  </td>
                  <td style={styles.td}>
                    <div style={styles.actions}>
                      <button onClick={() => { setEditingDealer(dealer); setShowDealerModal(true) }} style={styles.editBtn} title="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDeleteDealer(dealer.id)} style={styles.deleteBtn} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showDealerModal && (
        <DealerModal
          dealer={editingDealer}
          groups={groups}
          onClose={() => { setShowDealerModal(false); setEditingDealer(null) }}
          onSuccess={() => { setShowDealerModal(false); setEditingDealer(null); loadData() }}
        />
      )}
    </div>
  )
}

function DealerModal({ dealer, groups, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: dealer?.name || '',
    group_id: dealer?.group_id || '',
    address: dealer?.address || '',
    phone: dealer?.phone || '',
    website: dealer?.website || '',
    notification_emails: dealer?.notification_emails || []
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const payload = {
        name: formData.name,
        group_id: parseInt(formData.group_id),
        address: formData.address,
        phone: formData.phone,
        website: formData.website,
        notification_emails: formData.notification_emails
      }

      if (dealer) {
        await api.put(`/dealers/${dealer.id}`, payload)
      } else {
        await api.post('/dealers', payload)
      }
      onSuccess()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save dealer')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{dealer ? 'Edit Dealer' : 'Add New Dealer'}</h2>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Dealer Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              autoComplete="off"
              style={styles.input}
              placeholder="e.g., Acme Security Systems"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Group *</label>
            <select
              name="group_id"
              value={formData.group_id}
              onChange={handleChange}
              required
              style={styles.select}
            >
              <option value="">Select a group</option>
              {groups.map(group => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Address</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              autoComplete="off"
              style={styles.input}
              placeholder="Street address"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Phone</label>
            <input
              type="text"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              autoComplete="off"
              style={styles.input}
              placeholder="Phone number"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Website</label>
            <input
              type="text"
              name="website"
              value={formData.website}
              onChange={handleChange}
              autoComplete="off"
              style={styles.input}
              placeholder="https://example.com"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Notification Emails</label>
            <EmailManager
              emails={formData.notification_emails}
              onChange={(emails) => setFormData(prev => ({ ...prev, notification_emails: emails }))}
            />
          </div>

          <div style={styles.modalFooter}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={styles.saveBtn}>
              {loading ? 'Saving...' : (dealer ? 'Update Dealer' : 'Create Dealer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles = {
  container: {
    width: '100%'
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
  accessDenied: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem',
    background: '#1e293b',
    borderRadius: '1rem',
    border: '1px solid #334155',
    marginTop: '2rem'
  },
  accessDeniedTitle: {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#e2e8f0',
    marginTop: '1rem',
    marginBottom: '0.5rem'
  },
  accessDeniedText: {
    color: '#94a3b8'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem'
  },
  title: {
    fontSize: '2rem',
    fontWeight: '700',
    margin: 0,
    color: '#e2e8f0'
  },
  subtitle: {
    color: '#94a3b8',
    marginTop: '0.25rem'
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.5rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  tableContainer: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    overflow: 'hidden'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  tableHeader: {
    background: '#0f172a',
    borderBottom: '1px solid #334155'
  },
  th: {
    padding: '0.75rem 1rem',
    textAlign: 'left',
    color: '#cbd5e1',
    fontWeight: '600',
    fontSize: '0.875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  tableRow: {
    borderBottom: '1px solid #334155',
    transition: 'background 0.2s'
  },
  td: {
    padding: '0.75rem 1rem',
    color: '#e2e8f0',
    fontSize: '0.875rem'
  },
  dealerCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  groupBadge: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: '600',
    background: '#7c3aed',
    color: '#e9d5ff'
  },
  actions: {
    display: 'flex',
    gap: '0.5rem'
  },
  editBtn: {
    padding: '0.5rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'background 0.2s'
  },
  deleteBtn: {
    padding: '0.5rem',
    background: '#ef4444',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'background 0.2s'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem'
  },
  modal: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'auto'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.5rem',
    borderBottom: '1px solid #334155'
  },
  modalTitle: {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#e2e8f0',
    margin: 0
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '0.25rem',
    display: 'flex',
    alignItems: 'center'
  },
  form: {
    padding: '1.5rem'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '1.5rem'
  },
  label: {
    color: '#cbd5e1',
    fontSize: '0.875rem',
    fontWeight: '500'
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
  select: {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    padding: '0.625rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    outline: 'none',
    cursor: 'pointer'
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '1rem',
    marginTop: '1.5rem',
    paddingTop: '1.5rem',
    borderTop: '1px solid #334155'
  },
  cancelBtn: {
    padding: '0.75rem 1.5rem',
    background: '#475569',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer'
  },
  saveBtn: {
    padding: '0.75rem 1.5rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer'
  }
}

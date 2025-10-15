import React, { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import { Layers, Plus, Edit2, Trash2, Shield, X } from 'lucide-react'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import EmailManager from '../components/EmailManager'

export default function Groups() {
  const [groups, setGroups] = useState([])
  const [countries, setCountries] = useState([])
  const [dealers, setDealers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const currentUser = useAuthStore(state => state.user)

  useEffect(() => {
    loadGroups()
  }, [])

  const loadGroups = async () => {
    setLoading(true)
    try {
      const [groupsRes, countriesRes, dealersRes] = await Promise.all([
        api.get('/groups'),
        api.get('/countries'),
        api.get('/dealers')
      ])
      setGroups(groupsRes.data)
      setCountries(countriesRes.data)
      setDealers(dealersRes.data)
    } catch (error) {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Are you sure you want to delete this group? This will affect all dealers and users assigned to it.')) return

    try {
      await api.delete(`/groups/${groupId}`)
      loadGroups()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete group')
    }
  }

  const isSuperAdmin = currentUser?.role === 'super_admin'

  if (!isSuperAdmin) {
    return (
      <div style={styles.container}>
        <div style={styles.accessDenied}>
          <Shield size={64} color="#ef4444" />
          <h2 style={styles.accessDeniedTitle}>Access Denied</h2>
          <p style={styles.accessDeniedText}>Only super administrators can manage groups.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading groups...</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Group Management</h1>
          <p style={styles.subtitle}>{groups.length} total groups</p>
        </div>
        <button onClick={() => { setEditingGroup(null); setShowGroupModal(true) }} style={styles.addBtn}>
          <Plus size={20} />
          <span>Add Group</span>
        </button>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.th}>Group Name</th>
              <th style={styles.th}>Country</th>
              <th style={styles.th}>Dealers</th>
              <th style={styles.th}>Created</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group => {
              const country = countries.find(c => c.id === group.country_id)
              const groupDealers = dealers.filter(d => d.group_id === group.id)
              return (
                <tr key={group.id} style={styles.tableRow}>
                  <td style={styles.td}>
                    <div style={styles.groupCell}>
                      <Layers size={16} color="#94a3b8" />
                      <span style={{ fontWeight: '600' }}>{group.name}</span>
                    </div>
                  </td>
                  <td style={styles.td}>
                    {country ? (
                      <span style={styles.countryBadge}>{country.name}</span>
                    ) : (
                      <span style={styles.noCountry}>No Country</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <span style={styles.dealerCount}>
                      {groupDealers.length} dealer{groupDealers.length !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {new Date(group.created_at).toLocaleDateString()}
                  </td>
                  <td style={styles.td}>
                    <div style={styles.actions}>
                      <button onClick={() => { setEditingGroup(group); setShowGroupModal(true) }} style={styles.editBtn} title="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDeleteGroup(group.id)} style={styles.deleteBtn} title="Delete">
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

      {showGroupModal && (
        <GroupModal
          group={editingGroup}
          countries={countries}
          dealers={dealers}
          onClose={() => { setShowGroupModal(false); setEditingGroup(null) }}
          onSuccess={() => { setShowGroupModal(false); setEditingGroup(null); loadGroups() }}
        />
      )}
    </div>
  )
}

function GroupModal({ group, countries, dealers, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: group?.name || '',
    country_id: group?.country_id || null,
    address: group?.address || '',
    phone: group?.phone || '',
    website: group?.website || '',
    notification_emails: group?.notification_emails || []
  })
  const [selectedDealers, setSelectedDealers] = useState(
    dealers.filter(d => d.group_id === group?.id).map(d => d.id) || []
  )
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // First, create or update the group
      let groupId = group?.id
      if (group) {
        await api.put(`/groups/${group.id}`, formData)
      } else {
        const response = await api.post('/groups', formData)
        groupId = response.data.id
      }

      // Then update all dealers to set their group_id
      const updatePromises = []

      for (const dealer of dealers) {
        const shouldBelongToGroup = selectedDealers.includes(dealer.id)
        const currentlyBelongs = dealer.group_id === groupId

        if (shouldBelongToGroup && !currentlyBelongs) {
          // Add this dealer to the group
          updatePromises.push(
            api.put(`/dealers/${dealer.id}`, {
              name: dealer.name,
              group_id: groupId
            })
          )
        } else if (!shouldBelongToGroup && currentlyBelongs) {
          // This dealer no longer belongs to this group, but we need to keep them in some group
          // For now, we'll just leave them as is to avoid orphaned dealers
          // In a real app, you might want to prevent unassigning or require reassignment
        }
      }

      await Promise.all(updatePromises)

      onSuccess()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save group')
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
          <h2 style={styles.modalTitle}>{group ? 'Edit Group' : 'Add New Group'}</h2>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Group Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              autoComplete="off"
              style={styles.input}
              placeholder="e.g., National Security, Regional Operations"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Country</label>
            <select
              name="country_id"
              value={formData.country_id || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, country_id: e.target.value ? parseInt(e.target.value) : null }))}
              style={styles.select}
            >
              <option value="">No Country</option>
              {countries.map(country => (
                <option key={country.id} value={country.id}>{country.name}</option>
              ))}
            </select>
            <small style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
              Assign this group to a country (optional)
            </small>
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

          <div style={styles.formGroup}>
            <label style={styles.label}>Assign Dealers</label>
            <div style={styles.checkboxContainer}>
              {dealers.map(dealer => (
                <label key={dealer.id} style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={selectedDealers.includes(dealer.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedDealers(prev => [...prev, dealer.id])
                      } else {
                        setSelectedDealers(prev => prev.filter(id => id !== dealer.id))
                      }
                    }}
                    style={styles.checkbox}
                  />
                  <span>{dealer.name}</span>
                </label>
              ))}
            </div>
            {selectedDealers.length === 0 && (
              <small style={styles.helperText}>No dealers assigned</small>
            )}
            {selectedDealers.length > 0 && (
              <small style={styles.helperText}>{selectedDealers.length} dealer{selectedDealers.length !== 1 ? 's' : ''} selected</small>
            )}
          </div>

          <div style={styles.modalFooter}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={styles.saveBtn}>
              {loading ? 'Saving...' : (group ? 'Update Group' : 'Create Group')}
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
  groupCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
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
  },
  countryBadge: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: '600',
    background: '#059669',
    color: '#d1fae5'
  },
  noCountry: {
    color: '#94a3b8',
    fontSize: '0.875rem'
  },
  dealerCount: {
    color: '#94a3b8',
    fontSize: '0.875rem'
  },
  checkboxContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.5rem',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155',
    maxHeight: '200px',
    overflowY: 'auto'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem',
    cursor: 'pointer',
    borderRadius: '0.375rem',
    transition: 'background 0.2s',
    ':hover': {
      background: '#1e293b'
    }
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer'
  },
  helperText: {
    color: '#94a3b8',
    fontSize: '0.75rem',
    marginTop: '0.25rem'
  }
}

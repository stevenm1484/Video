import React, { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import { Globe, Plus, Edit2, Trash2, Shield, X } from 'lucide-react'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import EmailManager from '../components/EmailManager'

export default function Countries() {
  const [countries, setCountries] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCountryModal, setShowCountryModal] = useState(false)
  const [editingCountry, setEditingCountry] = useState(null)
  const currentUser = useAuthStore(state => state.user)

  useEffect(() => {
    loadCountries()
  }, [])

  const loadCountries = async () => {
    setLoading(true)
    try {
      const [countriesRes, groupsRes] = await Promise.all([
        api.get('/countries'),
        api.get('/groups')
      ])
      setCountries(countriesRes.data)
      setGroups(groupsRes.data)
    } catch (error) {
      toast.error('Failed to load countries')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteCountry = async (countryId) => {
    if (!window.confirm('Are you sure you want to delete this country? This will affect all groups assigned to it.')) return

    try {
      await api.delete(`/countries/${countryId}`)
      loadCountries()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete country')
    }
  }

  const isSuperAdmin = currentUser?.role === 'super_admin'

  if (!isSuperAdmin) {
    return (
      <div style={styles.container}>
        <div style={styles.accessDenied}>
          <Shield size={64} color="#ef4444" />
          <h2 style={styles.accessDeniedTitle}>Access Denied</h2>
          <p style={styles.accessDeniedText}>Only super administrators can manage countries.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading countries...</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Country Management</h1>
          <p style={styles.subtitle}>{countries.length} total countries</p>
        </div>
        <button onClick={() => { setEditingCountry(null); setShowCountryModal(true) }} style={styles.addBtn}>
          <Plus size={20} />
          <span>Add Country</span>
        </button>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.th}>Country Name</th>
              <th style={styles.th}>Groups</th>
              <th style={styles.th}>Created</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {countries.map(country => {
              const countryGroups = groups.filter(g => g.country_id === country.id)
              return (
                <tr key={country.id} style={styles.tableRow}>
                  <td style={styles.td}>
                    <div style={styles.countryCell}>
                      <Globe size={16} color="#94a3b8" />
                      <span style={{ fontWeight: '600' }}>{country.name}</span>
                    </div>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.groupCount}>
                      {countryGroups.length} group{countryGroups.length !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {new Date(country.created_at).toLocaleDateString()}
                  </td>
                  <td style={styles.td}>
                    <div style={styles.actions}>
                      <button onClick={() => { setEditingCountry(country); setShowCountryModal(true) }} style={styles.editBtn} title="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDeleteCountry(country.id)} style={styles.deleteBtn} title="Delete">
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

      {showCountryModal && (
        <CountryModal
          country={editingCountry}
          groups={groups}
          onClose={() => { setShowCountryModal(false); setEditingCountry(null) }}
          onSuccess={() => { setShowCountryModal(false); setEditingCountry(null); loadCountries() }}
        />
      )}
    </div>
  )
}

function CountryModal({ country, groups, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: country?.name || '',
    address: country?.address || '',
    phone: country?.phone || '',
    website: country?.website || '',
    notification_emails: country?.notification_emails || []
  })
  const [selectedGroups, setSelectedGroups] = useState(
    groups.filter(g => g.country_id === country?.id).map(g => g.id) || []
  )
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // First, create or update the country
      let countryId = country?.id
      if (country) {
        await api.put(`/countries/${country.id}`, formData)
      } else {
        const response = await api.post('/countries', formData)
        countryId = response.data.id
      }

      // Then update all groups to set their country_id
      // Update groups that should belong to this country
      const updatePromises = []

      for (const group of groups) {
        const shouldBelongToCountry = selectedGroups.includes(group.id)
        const currentlyBelongs = group.country_id === countryId

        if (shouldBelongToCountry && !currentlyBelongs) {
          // Add this group to the country
          updatePromises.push(
            api.put(`/groups/${group.id}`, {
              name: group.name,
              country_id: countryId
            })
          )
        } else if (!shouldBelongToCountry && currentlyBelongs) {
          // Remove this group from the country
          updatePromises.push(
            api.put(`/groups/${group.id}`, {
              name: group.name,
              country_id: null
            })
          )
        }
      }

      await Promise.all(updatePromises)

      onSuccess()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save country')
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
          <h2 style={styles.modalTitle}>{country ? 'Edit Country' : 'Add New Country'}</h2>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Country Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              autoComplete="off"
              style={styles.input}
              placeholder="e.g., North America, Europe, Asia Pacific"
            />
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
            <label style={styles.label}>Assign Groups</label>
            <div style={styles.checkboxContainer}>
              {groups.map(group => (
                <label key={group.id} style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(group.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedGroups(prev => [...prev, group.id])
                      } else {
                        setSelectedGroups(prev => prev.filter(id => id !== group.id))
                      }
                    }}
                    style={styles.checkbox}
                  />
                  <span>{group.name}</span>
                </label>
              ))}
            </div>
            {selectedGroups.length === 0 && (
              <small style={styles.helperText}>No groups assigned</small>
            )}
            {selectedGroups.length > 0 && (
              <small style={styles.helperText}>{selectedGroups.length} group{selectedGroups.length !== 1 ? 's' : ''} selected</small>
            )}
          </div>

          <div style={styles.modalFooter}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={styles.saveBtn}>
              {loading ? 'Saving...' : (country ? 'Update Country' : 'Create Country')}
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
  countryCell: {
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
  groupCount: {
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

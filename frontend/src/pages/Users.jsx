import React, { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import { Users as UsersIcon, Plus, Edit2, Trash2, Shield, X } from 'lucide-react'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'

export default function Users() {
  const [users, setUsers] = useState([])
  const [countries, setCountries] = useState([])
  const [groups, setGroups] = useState([])
  const [dealers, setDealers] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const currentUser = useAuthStore(state => state.user)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [usersRes, countriesRes, groupsRes, dealersRes, accountsRes] = await Promise.all([
        api.get('/users'),
        api.get('/countries'),
        api.get('/groups'),
        api.get('/dealers'),
        api.get('/accounts')
      ])
      setUsers(usersRes.data)
      setCountries(countriesRes.data)
      setGroups(groupsRes.data)
      setDealers(dealersRes.data)
      setAccounts(accountsRes.data)
    } catch (error) {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return

    try {
      await api.delete(`/users/${userId}`)
      loadData()
    } catch (error) {
      toast.error('Failed to delete user')
    }
  }

  const isAdmin = currentUser?.role?.includes('admin')

  if (!isAdmin) {
    return (
      <div style={styles.container}>
        <div style={styles.accessDenied}>
          <Shield size={64} color="#ef4444" />
          <h2 style={styles.accessDeniedTitle}>Access Denied</h2>
          <p style={styles.accessDeniedText}>Only administrators can manage users.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading users...</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>User Management</h1>
          <p style={styles.subtitle}>{users.length} total users</p>
        </div>
        <button onClick={() => { setEditingUser(null); setShowUserModal(true) }} style={styles.addBtn}>
          <Plus size={20} />
          <span>Add User</span>
        </button>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.th}>Username</th>
              <th style={styles.th}>Full Name</th>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Role</th>
              <th style={styles.th}>Assignment</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <UserRow
                key={user.id}
                user={user}
                groups={groups}
                dealers={dealers}
                accounts={accounts}
                onEdit={() => { setEditingUser(user); setShowUserModal(true) }}
                onDelete={() => handleDeleteUser(user.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {showUserModal && (
        <UserModal
          user={editingUser}
          countries={countries}
          groups={groups}
          dealers={dealers}
          accounts={accounts}
          onClose={() => { setShowUserModal(false); setEditingUser(null) }}
          onSuccess={() => { setShowUserModal(false); setEditingUser(null); loadData() }}
        />
      )}
    </div>
  )
}

function UserRow({ user, groups, dealers, accounts, onEdit, onDelete }) {
  const getRoleBadgeStyle = (role) => {
    const baseStyle = { ...styles.roleBadge }
    if (role === 'super_admin') return { ...baseStyle, background: '#7c3aed', color: '#e9d5ff' }
    if (role.includes('admin')) return { ...baseStyle, background: '#2563eb', color: '#bfdbfe' }
    return { ...baseStyle, background: '#475569', color: '#cbd5e1' }
  }

  const getAssignment = () => {
    const assignments = []

    // Handle multiple customer_ids (new) or single customer_id (legacy)
    const customerIds = user.customer_ids || (user.customer_id ? [user.customer_id] : [])
    if (customerIds.length > 0) {
      const customerNames = customerIds
        .map(id => {
          const account = accounts.find(a => a.id === id)
          return account ? account.name : null
        })
        .filter(Boolean)
      if (customerNames.length > 0) {
        assignments.push(`Customers: ${customerNames.join(', ')}`)
      }
    }

    // Handle multiple dealer_ids (new) or single dealer_id (legacy)
    const dealerIds = user.dealer_ids || (user.dealer_id ? [user.dealer_id] : [])
    if (dealerIds.length > 0) {
      const dealerNames = dealerIds
        .map(id => {
          const dealer = dealers.find(d => d.id === id)
          return dealer ? dealer.name : null
        })
        .filter(Boolean)
      if (dealerNames.length > 0) {
        assignments.push(`Dealers: ${dealerNames.join(', ')}`)
      }
    }

    // Handle multiple group_ids (new) or single group_id (legacy)
    const groupIds = user.group_ids || (user.group_id ? [user.group_id] : [])
    if (groupIds.length > 0) {
      const groupNames = groupIds
        .map(id => {
          const group = groups.find(g => g.id === id)
          return group ? group.name : null
        })
        .filter(Boolean)
      if (groupNames.length > 0) {
        assignments.push(`Groups: ${groupNames.join(', ')}`)
      }
    }

    return assignments.length > 0 ? assignments.join(' | ') : 'None'
  }

  return (
    <tr style={styles.tableRow}>
      <td style={styles.td}>
        <div style={styles.usernameCell}>
          <UsersIcon size={16} color="#94a3b8" />
          <span style={{ fontWeight: '600' }}>{user.username}</span>
        </div>
      </td>
      <td style={styles.td}>{user.full_name}</td>
      <td style={styles.td}>{user.email}</td>
      <td style={styles.td}>
        <span style={getRoleBadgeStyle(user.role)}>
          {user.role.replace('_', ' ').toUpperCase()}
        </span>
      </td>
      <td style={styles.td}>
        <span style={styles.assignmentText}>{getAssignment()}</span>
      </td>
      <td style={styles.td}>
        <span style={user.is_active ? styles.statusActive : styles.statusInactive}>
          {user.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td style={styles.td}>
        <div style={styles.actions}>
          <button onClick={onEdit} style={styles.editBtn} title="Edit">
            <Edit2 size={14} />
          </button>
          <button onClick={onDelete} style={styles.deleteBtn} title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function UserModal({ user, countries, groups, dealers, accounts, onClose, onSuccess }) {
  const currentUser = useAuthStore(state => state.user)

  // Debug: Log user data when modal opens
  console.log('UserModal - User data:', user)
  console.log('UserModal - SIP Extension:', user?.sip_extension)

  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    full_name: user?.full_name || '',
    password: '',
    access_level: user?.access_level || 'customer',
    role_type: user?.role_type || 'user',
    country_ids: user?.country_ids || [],
    group_ids: user?.group_ids || [],
    dealer_ids: user?.dealer_ids || [],
    customer_ids: user?.customer_ids || [],
    video_types: user?.video_types || [],  // Empty array = see all types
    is_active: user?.is_active ?? true,
    // Security fields
    phone_number: user?.phone_number || '',
    two_factor_enabled: user?.two_factor_enabled || false,
    two_factor_method: user?.two_factor_method || null,
    ip_whitelist: user?.ip_whitelist || [],
    require_2fa_or_whitelist: user?.require_2fa_or_whitelist || false,
    // SIP/PBX fields
    sip_extension: user?.sip_extension || '',
    sip_password: user?.sip_password || '',
    phone_dialing_enabled: user?.phone_dialing_enabled ?? false
  })
  const [ipInput, setIpInput] = useState('')
  const [loading, setLoading] = useState(false)

  // Define available access levels and role types based on current user's role
  const accessLevels = (() => {
    if (currentUser.role === 'super_admin' || currentUser.access_level === 'country' || currentUser.access_level === 'super_admin') {
      return [
        { value: 'super_admin', label: 'Super Admin' },
        { value: 'country', label: 'Country' },
        { value: 'group', label: 'Group' },
        { value: 'dealer', label: 'Dealer' },
        { value: 'customer', label: 'Customer' }
      ]
    } else if (currentUser.role === 'group_admin' || currentUser.access_level === 'group') {
      return [
        { value: 'group', label: 'Group' },
        { value: 'dealer', label: 'Dealer' },
        { value: 'customer', label: 'Customer' }
      ]
    } else if (currentUser.role === 'dealer_admin' || currentUser.access_level === 'dealer') {
      return [
        { value: 'dealer', label: 'Dealer' },
        { value: 'customer', label: 'Customer' }
      ]
    } else {
      return [
        { value: 'customer', label: 'Customer' }
      ]
    }
  })()

  const roleTypes = [
    { value: 'super_admin', label: 'Super Admin' },
    { value: 'admin', label: 'Admin' },
    { value: 'supervisor', label: 'Supervisor' },
    { value: 'user', label: 'User' },
    { value: 'user_escalate', label: 'User (Escalate)' }
  ]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Don't send password if editing and password is empty
      const payload = { ...formData }
      if (user && !payload.password) {
        delete payload.password
      }

      // Ensure arrays are sent (empty arrays if nothing selected)
      payload.country_ids = payload.country_ids || []
      payload.group_ids = payload.group_ids || []
      payload.dealer_ids = payload.dealer_ids || []
      payload.customer_ids = payload.customer_ids || []
      payload.video_types = payload.video_types || []
      payload.ip_whitelist = payload.ip_whitelist || []

      if (user) {
        await api.put(`/users/${user.id}`, payload)
      } else {
        await api.post('/users', payload)
      }
      onSuccess()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save user')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  // Role-based restrictions
  const isSuperAdmin = currentUser.role === 'super_admin' || currentUser.access_level === 'super_admin'
  const isGroupAdmin = currentUser.role === 'group_admin' || currentUser.access_level === 'group'
  const isDealerAdmin = currentUser.role === 'dealer_admin' || currentUser.access_level === 'dealer'

  // Filter groups based on selected countries (show groups belonging to ANY selected country)
  const filteredGroups = formData.country_ids && formData.country_ids.length > 0
    ? groups.filter(g => formData.country_ids.includes(g.country_id))
    : groups

  // Filter dealers based on selected groups (show dealers belonging to ANY selected group)
  let filteredDealers = formData.group_ids && formData.group_ids.length > 0
    ? dealers.filter(d => formData.group_ids.includes(d.group_id))
    : dealers

  // If dealer admin, only show their dealers
  if (isDealerAdmin && currentUser.dealer_ids && currentUser.dealer_ids.length > 0) {
    filteredDealers = dealers.filter(d => currentUser.dealer_ids.includes(d.id))
  } else if (isDealerAdmin && currentUser.dealer_id) {
    // Fallback for legacy single dealer_id
    filteredDealers = dealers.filter(d => d.id === currentUser.dealer_id)
  }

  // Filter accounts based on selected dealers (show customers belonging to ANY selected dealer)
  // For super_admin: show all accounts if no dealer selected, otherwise filter by selected dealers
  const filteredAccounts = formData.dealer_ids && formData.dealer_ids.length > 0
    ? accounts.filter(a => formData.dealer_ids.includes(a.dealer_id))
    : (isSuperAdmin ? accounts : [])

  // Auto-populate group/dealer for non-super admins
  React.useEffect(() => {
    if (!user) { // Only for new users
      if (isDealerAdmin) {
        // Dealer admin: auto-assign their dealers and groups
        const dealerIds = currentUser.dealer_ids || (currentUser.dealer_id ? [currentUser.dealer_id] : [])
        if (dealerIds.length > 0) {
          const groupIds = dealerIds
            .map(dealerId => {
              const dealer = dealers.find(d => d.id === dealerId)
              return dealer ? dealer.group_id : null
            })
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i) // unique values

          setFormData(prev => ({
            ...prev,
            group_ids: groupIds,
            dealer_ids: dealerIds
          }))
        }
      } else if (isGroupAdmin) {
        // Group admin: auto-assign their groups
        const groupIds = currentUser.group_ids || (currentUser.group_id ? [currentUser.group_id] : [])
        if (groupIds.length > 0) {
          setFormData(prev => ({
            ...prev,
            group_ids: groupIds
          }))
        }
      }
    }
  }, [user, isDealerAdmin, isGroupAdmin, currentUser, dealers])

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{user ? 'Edit User' : 'Add New User'}</h2>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGrid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Username *</label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                autoComplete="off"
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Full Name *</label>
              <input
                type="text"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                required
                autoComplete="off"
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Email *</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                autoComplete="off"
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Password {!user && '*'}</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required={!user}
                placeholder={user ? 'Leave blank to keep current' : ''}
                autoComplete="new-password"
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Access Level *</label>
              <select
                name="access_level"
                value={formData.access_level}
                onChange={handleChange}
                required
                style={styles.select}
              >
                {accessLevels.map(level => (
                  <option key={level.value} value={level.value}>{level.label}</option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Role Type *</label>
              <select
                name="role_type"
                value={formData.role_type}
                onChange={handleChange}
                required
                style={styles.select}
              >
                {roleTypes.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>
                <input
                  type="checkbox"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleChange}
                  style={{ marginRight: '0.5rem' }}
                />
                Active
              </label>
            </div>
          </div>

          <div style={styles.divider}></div>

          <h3 style={styles.sectionTitle}>Hierarchy Assignment</h3>
          <p style={styles.sectionDesc}>Assign user to a specific level in the organization hierarchy</p>

          <div style={styles.formGrid}>
            {/* Only show Countries for super admins */}
            {isSuperAdmin && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Countries</label>
              <div style={styles.checkboxContainer}>
                {countries.map(country => (
                  <label key={country.id} style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={formData.country_ids.includes(country.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData(prev => ({
                            ...prev,
                            country_ids: [...prev.country_ids, country.id]
                          }))
                        } else {
                          setFormData(prev => ({
                            ...prev,
                            country_ids: prev.country_ids.filter(id => id !== country.id)
                          }))
                        }
                      }}
                      disabled={!isSuperAdmin}
                      style={styles.checkbox}
                    />
                    <span>{country.name}</span>
                  </label>
                ))}
              </div>
              {formData.country_ids.length === 0 && (
                <p style={styles.helperText}>No countries selected</p>
              )}
              {!isSuperAdmin && (
                <p style={styles.helperText}>Only super admins can assign countries</p>
              )}
            </div>
            )}

            {/* Only show Groups for super and group admins */}
            {(isSuperAdmin || isGroupAdmin) && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Groups</label>
              <div style={styles.checkboxContainer}>
                {filteredGroups.map(group => (
                  <label key={group.id} style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={formData.group_ids.includes(group.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Auto-select all dealers in this group
                          const groupDealers = dealers.filter(d => d.group_id === group.id)
                          const newDealerIds = [...new Set([...formData.dealer_ids, ...groupDealers.map(d => d.id)])]

                          // Auto-select all customers in those dealers
                          const dealerCustomers = accounts.filter(a => newDealerIds.includes(a.dealer_id))
                          const newCustomerIds = [...new Set([...formData.customer_ids, ...dealerCustomers.map(a => a.id)])]

                          setFormData(prev => ({
                            ...prev,
                            group_ids: [...prev.group_ids, group.id],
                            dealer_ids: newDealerIds,
                            customer_ids: newCustomerIds
                          }))
                        } else {
                          // Uncheck group: remove dealers in this group and their customers
                          const groupDealers = dealers.filter(d => d.group_id === group.id).map(d => d.id)
                          const newDealerIds = formData.dealer_ids.filter(id => !groupDealers.includes(id))

                          // Remove customers belonging to removed dealers
                          const newCustomerIds = formData.customer_ids.filter(custId => {
                            const account = accounts.find(a => a.id === custId)
                            return account && newDealerIds.includes(account.dealer_id)
                          })

                          setFormData(prev => ({
                            ...prev,
                            group_ids: prev.group_ids.filter(id => id !== group.id),
                            dealer_ids: newDealerIds,
                            customer_ids: newCustomerIds
                          }))
                        }
                      }}
                      disabled={!isSuperAdmin}
                      style={styles.checkbox}
                    />
                    <span>{group.name}</span>
                  </label>
                ))}
              </div>
              {formData.group_ids.length === 0 && (
                <p style={styles.helperText}>No groups selected</p>
              )}
              {!isSuperAdmin && (
                <p style={styles.helperText}>
                  {isGroupAdmin ? 'Automatically set to your groups' : isDealerAdmin ? 'Automatically set to your groups' : ''}
                </p>
              )}
            </div>
            )}

            {/* Only show Dealers for super and group admins (hide from dealer admins) */}
            {(isSuperAdmin || isGroupAdmin) && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Dealers</label>
              <div style={styles.checkboxContainer}>
                {filteredDealers.map(dealer => (
                  <label key={dealer.id} style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={formData.dealer_ids.includes(dealer.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Auto-select all customers in this dealer
                          const dealerCustomers = accounts.filter(a => a.dealer_id === dealer.id)
                          const newCustomerIds = [...new Set([...formData.customer_ids, ...dealerCustomers.map(a => a.id)])]

                          setFormData(prev => ({
                            ...prev,
                            dealer_ids: [...prev.dealer_ids, dealer.id],
                            customer_ids: newCustomerIds
                          }))
                        } else {
                          // Uncheck dealer: remove customers in this dealer
                          const dealerCustomers = accounts.filter(a => a.dealer_id === dealer.id).map(a => a.id)
                          const newCustomerIds = formData.customer_ids.filter(id => !dealerCustomers.includes(id))

                          setFormData(prev => ({
                            ...prev,
                            dealer_ids: prev.dealer_ids.filter(id => id !== dealer.id),
                            customer_ids: newCustomerIds
                          }))
                        }
                      }}
                      disabled={isDealerAdmin}
                      style={styles.checkbox}
                    />
                    <span>{dealer.name}</span>
                  </label>
                ))}
              </div>
              {formData.dealer_ids.length === 0 && (
                <p style={styles.helperText}>No dealers selected</p>
              )}
              {isDealerAdmin && (
                <p style={styles.helperText}>Automatically set to your dealers</p>
              )}
            </div>
            )}

            {/* Customers section - always visible */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Customers</label>
              <div style={styles.checkboxContainer}>
                {filteredAccounts.map(account => (
                  <label key={account.id} style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={formData.customer_ids.includes(account.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData(prev => ({
                            ...prev,
                            customer_ids: [...prev.customer_ids, account.id]
                          }))
                        } else {
                          setFormData(prev => ({
                            ...prev,
                            customer_ids: prev.customer_ids.filter(id => id !== account.id)
                          }))
                        }
                      }}
                      disabled={!isSuperAdmin && formData.dealer_ids.length === 0}
                      style={styles.checkbox}
                    />
                    <span>{account.account_number} - {account.name}</span>
                  </label>
                ))}
              </div>
              {formData.customer_ids.length === 0 && (
                <p style={styles.helperText}>No customers selected</p>
              )}
              {!isSuperAdmin && formData.dealer_ids.length === 0 && (
                <p style={styles.helperText}>Select dealers first to enable customer selection</p>
              )}
              {isSuperAdmin && formData.dealer_ids.length === 0 && filteredAccounts.length === 0 && (
                <p style={styles.helperText}>No customers available. Create some customers first.</p>
              )}
            </div>
          </div>

          <div style={styles.divider}></div>

          <h3 style={styles.sectionTitle}>Video Type Access</h3>
          <p style={styles.sectionDesc}>Select which video types this user can see (leave all unchecked to see ALL types)</p>

          <div style={styles.formGrid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Video Types</label>
              <div style={styles.checkboxContainer}>
                {['Doorman', 'Perimeter', 'Loitering'].map(videoType => (
                  <label key={videoType} style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={formData.video_types.includes(videoType)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData(prev => ({
                            ...prev,
                            video_types: [...prev.video_types, videoType]
                          }))
                        } else {
                          setFormData(prev => ({
                            ...prev,
                            video_types: prev.video_types.filter(t => t !== videoType)
                          }))
                        }
                      }}
                      style={styles.checkbox}
                    />
                    <span>{videoType}</span>
                  </label>
                ))}
              </div>
              {formData.video_types.length === 0 && (
                <p style={styles.helperText}>No restrictions - user can see ALL video types</p>
              )}
            </div>
          </div>

          <div style={styles.divider}></div>

          <h3 style={styles.sectionTitle}>Security Settings</h3>
          <p style={styles.sectionDesc}>Configure IP whitelist and two-factor authentication</p>

          <div style={styles.formGrid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>
                <input
                  type="checkbox"
                  name="require_2fa_or_whitelist"
                  checked={formData.require_2fa_or_whitelist}
                  onChange={handleChange}
                  style={{ marginRight: '0.5rem' }}
                />
                Require IP Whitelist
              </label>
              <p style={styles.helperText}>
                When enabled, user MUST login from a whitelisted IP address
              </p>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Phone Number (for SMS 2FA)</label>
              <input
                type="tel"
                name="phone_number"
                value={formData.phone_number}
                onChange={handleChange}
                placeholder="+1234567890"
                style={styles.input}
              />
              <p style={styles.helperText}>Format: +1234567890 (E.164 format)</p>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>IP Whitelist</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="text"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                placeholder="Enter IP address (e.g., 192.168.1.1 or 192.168.1.0/24)"
                style={{ ...styles.input, flex: 1 }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (ipInput.trim()) {
                      setFormData(prev => ({
                        ...prev,
                        ip_whitelist: [...prev.ip_whitelist, ipInput.trim()]
                      }))
                      setIpInput('')
                    }
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (ipInput.trim()) {
                    setFormData(prev => ({
                      ...prev,
                      ip_whitelist: [...prev.ip_whitelist, ipInput.trim()]
                    }))
                    setIpInput('')
                  }
                }}
                style={{ ...styles.saveBtn, padding: '0.5rem 1rem' }}
              >
                Add IP
              </button>
            </div>

            {formData.ip_whitelist.length > 0 && (
              <div style={styles.ipList}>
                {formData.ip_whitelist.map((ip, index) => (
                  <div key={index} style={styles.ipTag}>
                    <span>{ip}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          ip_whitelist: prev.ip_whitelist.filter((_, i) => i !== index)
                        }))
                      }}
                      style={styles.ipRemoveBtn}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {formData.ip_whitelist.length === 0 && (
              <p style={styles.helperText}>No IP addresses whitelisted. Add IPs to allow login without 2FA.</p>
            )}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              <input
                type="checkbox"
                name="two_factor_enabled"
                checked={formData.two_factor_enabled}
                onChange={handleChange}
                style={{ marginRight: '0.5rem' }}
              />
              Require Two-Factor Authentication
            </label>
            <p style={styles.helperText}>
              When enabled, user MUST use 2FA to login (in addition to IP whitelist if both are required)
            </p>
          </div>

          {formData.two_factor_enabled && (
            <div style={styles.formGroup}>
              <label style={styles.label}>2FA Method</label>
              <select
                name="two_factor_method"
                value={formData.two_factor_method || ''}
                onChange={handleChange}
                required={formData.two_factor_enabled}
                style={styles.select}
              >
                <option value="">Select Method</option>
                <option value="sms">SMS (Text Message)</option>
                <option value="email">Email</option>
                <option value="totp">Authenticator App (TOTP)</option>
              </select>
              <p style={styles.helperText}>
                {formData.two_factor_method === 'sms' && 'User will receive codes via SMS to their phone number'}
                {formData.two_factor_method === 'email' && 'User will receive codes via email'}
                {formData.two_factor_method === 'totp' && 'User will use Google Authenticator or similar app'}
                {!formData.two_factor_method && 'Choose how the user will receive 2FA codes'}
              </p>
            </div>
          )}

          <div style={styles.divider}></div>

          <h3 style={styles.sectionTitle}>Phone Dialing (PBX/SIP)</h3>
          <p style={styles.sectionDesc}>Configure SIP credentials for phone dialing functionality</p>

          <div style={styles.formGrid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>SIP Extension</label>
              <input
                type="text"
                name="sip_extension"
                value={formData.sip_extension}
                onChange={handleChange}
                placeholder="e.g., 2001"
                autoComplete="off"
                style={styles.input}
              />
              <p style={styles.helperText}>User's PBX extension number for making calls</p>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>SIP Password</label>
              <input
                type="password"
                name="sip_password"
                value={formData.sip_password}
                onChange={handleChange}
                placeholder={user ? 'Leave blank to keep current password' : 'SIP password'}
                autoComplete="new-password"
                style={styles.input}
              />
              <p style={styles.helperText}>
                {user ? 'Leave blank to keep current password. Enter new password to change.' : 'SIP authentication password from your PBX'}
              </p>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              <input
                type="checkbox"
                name="phone_dialing_enabled"
                checked={formData.phone_dialing_enabled}
                onChange={handleChange}
                style={{ marginRight: '0.5rem' }}
              />
              Enable Phone Dialing
            </label>
            <p style={styles.helperText}>
              When enabled, user can make phone calls from the dashboard using their SIP credentials. Requires SIP Extension and Password above.
            </p>
          </div>

          <div style={styles.modalFooter}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={styles.saveBtn}>
              {loading ? 'Saving...' : (user ? 'Update User' : 'Create User')}
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
  usernameCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  roleBadge: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: '600'
  },
  assignmentText: {
    color: '#94a3b8',
    fontSize: '0.875rem'
  },
  statusActive: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: '600',
    background: '#065f46',
    color: '#10b981'
  },
  statusInactive: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: '600',
    background: '#7f1d1d',
    color: '#ef4444'
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
    maxWidth: '1100px',
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
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1rem',
    marginBottom: '1rem'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
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
  divider: {
    height: '1px',
    background: '#334155',
    margin: '1.5rem 0'
  },
  sectionTitle: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: '0.5rem'
  },
  sectionDesc: {
    color: '#94a3b8',
    fontSize: '0.875rem',
    marginBottom: '1rem'
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
  helperText: {
    fontSize: '0.75rem',
    color: '#64748b',
    marginTop: '0.25rem',
    fontStyle: 'italic'
  },
  checkboxContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.75rem',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    maxHeight: '200px',
    overflowY: 'auto'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    transition: 'background 0.2s',
    color: '#e2e8f0'
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer'
  },
  ipList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginTop: '0.5rem'
  },
  ipTag: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 0.75rem',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.375rem',
    color: '#e2e8f0',
    fontSize: '0.875rem'
  },
  ipRemoveBtn: {
    background: 'none',
    border: 'none',
    color: '#ef4444',
    cursor: 'pointer',
    padding: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    transition: 'color 0.2s'
  }
}

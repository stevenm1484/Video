import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import {
  ArrowLeft, Edit, Save, X, Plus, Trash2, Camera as CameraIcon,
  Eye, Copy, Grid, ListChecks, Bell, BellOff, Clock, Shield, ShieldOff, RotateCcw, Phone
} from 'lucide-react'
import api from '../api/axios'
import ActionPlanTree from '../components/ActionPlanTree'
import SnoozeButton from '../components/SnoozeButton'
import VitalSignsSettings from '../components/VitalSignsSettings'
import ToolsManager from '../components/ToolsManager'
import ToolGroupsManager from '../components/ToolGroupsManager'
import { formatTimestampInTimezone } from '../utils/timezone'
import { usePBXStore } from '../store/pbxStore'

export default function AccountDetail() {
  const { accountId } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('info')
  const [account, setAccount] = useState(null)
  const [cameras, setCameras] = useState([])
  const [groups, setGroups] = useState([])
  const [dealers, setDealers] = useState([])
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editedAccount, setEditedAccount] = useState(null)

  // PBX/Calling state
  const { makeCall, isRegistered } = usePBXStore()
  const [pbxConfig, setPbxConfig] = useState(null)
  const remoteAudioRef = useRef(null)

  // Modal states
  const [showAddCameraModal, setShowAddCameraModal] = useState(false)
  const [showEditCameraModal, setShowEditCameraModal] = useState(false)
  const [selectedCamera, setSelectedCamera] = useState(null)
  const [showActionPlanModal, setShowActionPlanModal] = useState(false)
  const [showLiveViewModal, setShowLiveViewModal] = useState(false)
  const [liveViewCamera, setLiveViewCamera] = useState(null)
  const [showAllLiveViewModal, setShowAllLiveViewModal] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [schedules, setSchedules] = useState([])

  // Tenants state
  const [apartments, setApartments] = useState([])
  const [loadingApartments, setLoadingApartments] = useState(false)

  // Camera snapshot states
  const [snapshots, setSnapshots] = useState(() => {
    const saved = localStorage.getItem('cameraSnapshots')
    return saved ? JSON.parse(saved) : {}
  })
  const [loadingSnapshots, setLoadingSnapshots] = useState({})

  useEffect(() => {
    if (accountId === 'new') {
      setAccount({
        name: '',
        account_number: '',
        address: '',
        city: '',
        state: '',
        zip_code: '',
        contacts: [],
        notes: '',
        group_id: null,
        dealer_id: null,
        eyes_on_count: 1,
        video_type: null,
        priority: 5,
        allow_dismiss: true,
        timezone: 'UTC',
        disarm_schedules: []
      })
      setEditedAccount({
        name: '',
        account_number: '',
        address: '',
        city: '',
        state: '',
        zip_code: '',
        contacts: [],
        notes: '',
        group_id: null,
        dealer_id: null,
        eyes_on_count: 1,
        video_type: null,
        priority: 5,
        allow_dismiss: true,
        timezone: 'UTC',
        disarm_schedules: []
      })
      setIsEditing(true)
      setLoading(false)
      loadDropdowns()
    } else {
      loadAccountData()
    }
    loadPbxConfig()
  }, [accountId])

  const loadPbxConfig = async () => {
    try {
      const response = await api.get('/pbx/config')
      setPbxConfig(response.data)
    } catch (error) {
      console.error('Failed to load PBX config:', error)
      // PBX config is optional, so don't show error to user
    }
  }

  const loadAccountData = async () => {
    try {
      const [accountRes, camerasRes, groupsRes, dealersRes] = await Promise.all([
        api.get(`/accounts/${accountId}`),
        api.get(`/cameras?account_id=${accountId}`),
        api.get('/groups'),
        api.get('/dealers')
      ])

      const accountData = accountRes.data
      setAccount(accountData)
      setCameras(camerasRes.data)
      setGroups(groupsRes.data)
      setDealers(dealersRes.data)

      // Load schedules from account
      if (accountData.disarm_schedules) {
        try {
          const parsedSchedules = typeof accountData.disarm_schedules === 'string'
            ? JSON.parse(accountData.disarm_schedules)
            : accountData.disarm_schedules
          setSchedules(parsedSchedules || [])
        } catch (e) {
          console.error('Failed to parse schedules:', e)
          setSchedules([])
        }
      } else {
        setSchedules([])
      }
    } catch (error) {
      toast.error('Failed to load account details')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const loadDropdowns = async () => {
    try {
      const [groupsRes, dealersRes] = await Promise.all([
        api.get('/groups'),
        api.get('/dealers')
      ])
      setGroups(groupsRes.data)
      setDealers(dealersRes.data)
    } catch (error) {
      console.error('Failed to load dropdowns', error)
    }
  }

  const loadApartments = async () => {
    if (accountId === 'new') return

    try {
      setLoadingApartments(true)
      const response = await api.get(`/accounts/${accountId}/apartments`)
      setApartments(response.data || [])
    } catch (error) {
      console.error('Failed to load apartments', error)
      toast.error('Failed to load apartments')
    } finally {
      setLoadingApartments(false)
    }
  }

  const handleEdit = () => {
    console.log('Edit clicked, current account:', account)
    setEditedAccount({ ...account })
    setIsEditing(true)
  }

  const handleCancel = () => {
    if (accountId === 'new') {
      navigate('/accounts')
    } else {
      setEditedAccount(null)
      setIsEditing(false)
    }
  }

  const handleSave = async () => {
    try {
      console.log('=== SAVE CLICKED ===')
      console.log('Saving account, editedAccount:', editedAccount)
      console.log('Timezone in editedAccount:', editedAccount?.timezone)
      console.log('Full editedAccount object:', JSON.stringify(editedAccount, null, 2))

      if (accountId === 'new') {
        const response = await api.post('/accounts', editedAccount)
        navigate(`/accounts/${response.data.id}`)
      } else {
        console.log('Sending PUT request to /accounts/' + accountId)
        console.log('Request body:', JSON.stringify(editedAccount, null, 2))
        const response = await api.put(`/accounts/${accountId}`, editedAccount)
        console.log('=== RESPONSE RECEIVED ===')
        console.log('Status:', response.status)
        console.log('Response from server:', response.data)
        console.log('Timezone in response:', response.data?.timezone)
        setAccount(response.data)
        setIsEditing(false)
      }
    } catch (error) {
      console.error('=== ERROR SAVING ===')
      console.error('Error saving account:', error)
      console.error('Error response:', error.response)
      console.error('Error response data:', error.response?.data)
      console.error('Error response status:', error.response?.status)
      toast.error('Failed to save account: ' + (error.response?.data?.detail || error.message))
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this account? This will also delete all associated cameras.')) {
      return
    }

    try {
      await api.delete(`/accounts/${accountId}`)
      navigate('/accounts')
    } catch (error) {
      toast.error('Failed to delete account')
      console.error(error)
    }
  }

  const handleAddContact = () => {
    const data = isEditing ? editedAccount : account
    const newContact = { name: '', phone: '', email: '', notes: '' }
    const updated = {
      ...data,
      contacts: [...(data.contacts || []), newContact]
    }
    if (isEditing) {
      setEditedAccount(updated)
    }
  }

  const handleRemoveContact = (index) => {
    const data = isEditing ? editedAccount : account
    const updated = {
      ...data,
      contacts: data.contacts.filter((_, i) => i !== index)
    }
    if (isEditing) {
      setEditedAccount(updated)
    }
  }

  const handleContactChange = (index, field, value) => {
    const data = isEditing ? editedAccount : account
    const updated = {
      ...data,
      contacts: data.contacts.map((contact, i) =>
        i === index ? { ...contact, [field]: value } : contact
      )
    }
    if (isEditing) {
      setEditedAccount(updated)
    }
  }

  const handleDeleteCamera = async (cameraId) => {
    if (!confirm('Are you sure you want to delete this camera?')) return

    try {
      await api.delete(`/cameras/${cameraId}`)
      setCameras(cameras.filter(c => c.id !== cameraId))
    } catch (error) {
      toast.error('Failed to delete camera')
      console.error(error)
    }
  }

  const handleOpenLiveView = (camera) => {
    setLiveViewCamera(camera)
    setShowLiveViewModal(true)
  }

  const refreshSnapshot = async (cameraId) => {
    setLoadingSnapshots(prev => ({ ...prev, [cameraId]: true }))
    try {
      const response = await api.post(`/cameras/${cameraId}/snapshot`)
      if (response.data.snapshot_url) {
        // Add timestamp to prevent browser caching
        const urlWithCacheBust = `${response.data.snapshot_url}?t=${Date.now()}`
        setSnapshots(prev => ({ ...prev, [cameraId]: urlWithCacheBust }))
        console.log('📸 Snapshot refreshed for camera', cameraId, urlWithCacheBust)
      }
    } catch (error) {
      console.error(`Failed to refresh snapshot for camera ${cameraId}:`, error)
      toast.error('Failed to refresh snapshot')
    } finally {
      setLoadingSnapshots(prev => ({ ...prev, [cameraId]: false }))
    }
  }

  // Save snapshots to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('cameraSnapshots', JSON.stringify(snapshots))
  }, [snapshots])

  // Fetch snapshots for all cameras when cameras change
  useEffect(() => {
    const fetchSnapshots = async () => {
      for (const camera of cameras) {
        // Only fetch if we don't have a snapshot and we're not already loading
        if (camera.rtsp_url && !snapshots[camera.id] && !loadingSnapshots[camera.id]) {
          setLoadingSnapshots(prev => ({ ...prev, [camera.id]: true }))
          try {
            const response = await api.post(`/cameras/${camera.id}/snapshot`)
            if (response.data.snapshot_url) {
              setSnapshots(prev => ({ ...prev, [camera.id]: response.data.snapshot_url }))
            }
          } catch (error) {
            console.error(`Failed to fetch snapshot for camera ${camera.id}:`, error)
          } finally {
            setLoadingSnapshots(prev => ({ ...prev, [camera.id]: false }))
          }
        }
      }
    }

    if (cameras.length > 0 && activeTab === 'cameras') {
      fetchSnapshots()
    }
  }, [cameras, activeTab])

  // Load apartments when tenants tab is active
  useEffect(() => {
    if (activeTab === 'tenants' && accountId !== 'new') {
      loadApartments()
    }
  }, [activeTab, accountId])

  const getGroupName = () => {
    if (!account) return '-'
    if (account.group_id) {
      const group = groups.find(g => g.id === account.group_id)
      return group?.name || '-'
    }
    return account.group || '-'
  }

  const getDealerName = () => {
    if (!account) return '-'
    if (account.dealer_id) {
      const dealer = dealers.find(d => d.id === account.dealer_id)
      return dealer?.name || '-'
    }
    return account.dealer || '-'
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <div style={{color: '#94a3b8'}}>Loading account...</div>
      </div>
    )
  }

  if (!account) {
    return (
      <div style={styles.loadingContainer}>
        <div style={{color: '#94a3b8'}}>Account not found</div>
      </div>
    )
  }

  const displayAccount = isEditing ? editedAccount : account

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button
            onClick={() => navigate('/accounts')}
            style={styles.backBtn}
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 style={styles.title}>
              {accountId === 'new' ? 'New Account' : displayAccount.name}
            </h1>
            <p style={styles.subtitle}>
              {accountId === 'new' ? 'Create a new account' : `Account #${displayAccount.account_number || 'N/A'}`}
            </p>
          </div>
        </div>

        <div style={styles.headerActions}>
          {!isEditing && accountId !== 'new' && (
            <>
              <button onClick={handleEdit} style={styles.editBtn}>
                <Edit size={20} />
                <span>Edit</span>
              </button>
              <button onClick={handleDelete} style={styles.deleteBtn}>
                <Trash2 size={20} />
                <span>Delete</span>
              </button>
            </>
          )}
          {isEditing && (
            <>
              <button onClick={handleCancel} style={styles.cancelBtn}>
                <X size={20} />
                <span>Cancel</span>
              </button>
              <button onClick={handleSave} style={styles.saveBtn}>
                <Save size={20} />
                <span>Save</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabsContainer}>
        <div style={styles.tabs}>
          {['info', 'settings', 'notes', 'contacts', ...(account?.video_type === 'Doorman' ? ['tenants'] : []), 'cameras', 'arm-disarm', 'tools', 'action-plan'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                ...styles.tab,
                ...(activeTab === tab ? styles.tabActive : {})
              }}
            >
              {tab === 'info' && 'Account Information'}
              {tab === 'settings' && 'Settings'}
              {tab === 'notes' && 'Notes'}
              {tab === 'contacts' && `Contacts (${account?.contacts?.length || 0})`}
              {tab === 'cameras' && `Cameras (${cameras.length})`}
              {tab === 'tenants' && `Tenants (${apartments.length})`}
              {tab === 'arm-disarm' && 'Arm/Disarm'}
              {tab === 'tools' && 'Tools'}
              {tab === 'action-plan' && 'Action Plan'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div style={styles.content}>
        {activeTab === 'info' && (
          <InfoTab
            account={displayAccount}
            isEditing={isEditing}
            groups={groups}
            dealers={dealers}
            onUpdate={setEditedAccount}
            getGroupName={getGroupName}
            getDealerName={getDealerName}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            account={displayAccount}
            isEditing={isEditing}
            onUpdate={setEditedAccount}
          />
        )}

        {activeTab === 'notes' && (
          <NotesTab
            account={displayAccount}
            isEditing={isEditing}
            onUpdate={setEditedAccount}
          />
        )}

        {activeTab === 'contacts' && (
          <ContactsTab
            account={displayAccount}
            isEditing={isEditing}
            onUpdate={setEditedAccount}
            onAddContact={handleAddContact}
            onRemoveContact={handleRemoveContact}
            onContactChange={handleContactChange}
          />
        )}

        {activeTab === 'cameras' && (
          <CamerasTab
            account={account}
            cameras={cameras}
            snapshots={snapshots}
            loadingSnapshots={loadingSnapshots}
            onAddCamera={() => setShowAddCameraModal(true)}
            onEditCamera={(camera) => {
              setSelectedCamera(camera)
              setShowEditCameraModal(true)
            }}
            onCopyCamera={(camera) => {
              // Copy camera and open it in the add modal with pre-filled data
              setSelectedCamera({
                ...camera,
                name: `${camera.name} (Copy)`,
                camera_number: '', // Will auto-generate new number
                id: undefined, // Clear ID so it creates new camera
                smtp_email: undefined // Backend will generate new SMTP email
              })
              setShowAddCameraModal(true)
            }}
            onDeleteCamera={handleDeleteCamera}
            onRefreshSnapshot={refreshSnapshot}
            onOpenLiveView={handleOpenLiveView}
            onStartAll={() => setShowAllLiveViewModal(true)}
          />
        )}

        {activeTab === 'tenants' && (
          <TenantsTab
            account={account}
            apartments={apartments}
            loadingApartments={loadingApartments}
            onRefresh={loadApartments}
          />
        )}

        {activeTab === 'arm-disarm' && (
          <ArmDisarmTab
            account={account}
            cameras={cameras}
            schedules={schedules}
            onCreateSchedule={() => {
              setEditingSchedule(null)
              setShowScheduleModal(true)
            }}
            onEditSchedule={(schedule) => {
              setEditingSchedule(schedule)
              setShowScheduleModal(true)
            }}
            onDeleteSchedule={async (scheduleId) => {
              try {
                const updatedSchedules = schedules.filter(s => s.id !== scheduleId)
                const payload = {
                  name: account.name,
                  account_number: account.account_number,
                  account_id: account.account_id,
                  contacts: account.contacts || [],
                  address: account.address || '',
                  city: account.city || '',
                  state: account.state || '',
                  zip_code: account.zip_code || '',
                  notes: account.notes || '',
                  action_plan: account.action_plan,
                  inbound_phone_number: account.inbound_phone_number,
                  group: account.group,
                  dealer: account.dealer,
                  eyes_on_count: account.eyes_on_count || 1,
                  video_type: account.video_type,
                  group_id: account.group_id,
                  dealer_id: account.dealer_id,
                  disarm_schedules: JSON.stringify(updatedSchedules)
                }
                await api.put(`/accounts/${accountId}`, payload)
                setSchedules(updatedSchedules)
              } catch (error) {
                toast.error('Failed to delete schedule')
                console.error(error)
              }
            }}
            onRefresh={loadAccountData}
          />
        )}

        {activeTab === 'tools' && accountId !== 'new' && (
          <ToolsManager accountId={account?.id} showSubTabs={true} />
        )}

        {activeTab === 'action-plan' && (
          <ActionPlanTab
            account={account}
            onManageActionPlan={() => setShowActionPlanModal(true)}
          />
        )}
      </div>

      {/* Modals */}
      {showAddCameraModal && accountId !== 'new' && (
        <AddCameraModal
          account={account}
          initialData={selectedCamera}
          onClose={() => {
            setShowAddCameraModal(false)
            setSelectedCamera(null)
          }}
          onSuccess={() => {
            setShowAddCameraModal(false)
            setSelectedCamera(null)
            loadAccountData()
          }}
        />
      )}

      {showEditCameraModal && selectedCamera && (
        <EditCameraModal
          camera={selectedCamera}
          account={account}
          onClose={() => {
            setShowEditCameraModal(false)
            setSelectedCamera(null)
          }}
          onSuccess={() => {
            setShowEditCameraModal(false)
            setSelectedCamera(null)
            loadAccountData()
          }}
        />
      )}

      {showActionPlanModal && (
        <ActionPlanModal
          account={account}
          cameras={cameras}
          onClose={() => setShowActionPlanModal(false)}
          onSave={(updatedAccount) => {
            setAccount(updatedAccount)
            setShowActionPlanModal(false)
          }}
        />
      )}

      {showLiveViewModal && liveViewCamera && (
        <LiveViewModal
          key={`live-view-${liveViewCamera.id}`}
          camera={liveViewCamera}
          account={account}
          pbxConfig={pbxConfig}
          isRegistered={isRegistered}
          makeCall={makeCall}
          remoteAudioRef={remoteAudioRef}
          onClose={async () => {
            console.log('🔴 Parent onClose called - stopping stream and closing LiveViewModal')
            // Stop the stream when user closes the modal
            try {
              await api.post(`/cameras/${liveViewCamera.id}/stop-stream`)
              activeStreams.delete(liveViewCamera.id)  // Remove from global map
              console.log('✅ Stream stopped successfully')
            } catch (err) {
              console.error('Failed to stop stream:', err)
            }
            setShowLiveViewModal(false)
            setLiveViewCamera(null)
          }}
        />
      )}

      {showAllLiveViewModal && (
        <AllLiveViewModal
          cameras={cameras.filter(c => c.rtsp_url)}
          onClose={async () => {
            console.log('🔴 Closing All Live View - stopping all streams')
            // Stop all streams
            for (const camera of cameras.filter(c => c.rtsp_url)) {
              try {
                await api.post(`/cameras/${camera.id}/stop-stream`)
                activeStreams.delete(camera.id)
              } catch (err) {
                console.error(`Failed to stop stream for camera ${camera.id}:`, err)
              }
            }
            setShowAllLiveViewModal(false)
          }}
        />
      )}

      {showScheduleModal && (
        <ScheduleModal
          schedule={editingSchedule}
          cameras={cameras}
          onClose={() => {
            setShowScheduleModal(false)
            setEditingSchedule(null)
          }}
          onSave={async (schedule) => {
            try {
              let updatedSchedules
              if (editingSchedule) {
                updatedSchedules = schedules.map(s => s.id === schedule.id ? schedule : s)
              } else {
                updatedSchedules = [...schedules, { ...schedule, id: Date.now() }]
              }

              console.log('Saving schedule - Account:', account)
              console.log('Saving schedule - Updated schedules:', updatedSchedules)

              // Save to backend - send only fields needed by VideoAccountCreate schema
              const payload = {
                name: account.name,
                account_number: account.account_number,
                account_id: account.account_id,
                contacts: account.contacts || [],
                address: account.address || '',
                city: account.city || '',
                state: account.state || '',
                zip_code: account.zip_code || '',
                notes: account.notes || '',
                action_plan: account.action_plan,
                inbound_phone_number: account.inbound_phone_number,
                group: account.group,
                dealer: account.dealer,
                eyes_on_count: account.eyes_on_count || 1,
                video_type: account.video_type,
                group_id: account.group_id,
                dealer_id: account.dealer_id,
                disarm_schedules: JSON.stringify(updatedSchedules)
              }

              console.log('Sending payload:', payload)
              const response = await api.put(`/accounts/${accountId}`, payload)
              console.log('Schedule saved successfully:', response.data)

              setSchedules(updatedSchedules)
              setShowScheduleModal(false)
              setEditingSchedule(null)

              // Show success message after API call succeeds
              if (editingSchedule) {
              } else {
              }
            } catch (error) {
              toast.error('Failed to save schedule')
              console.error('Error saving schedule:', error)
              console.error('Error response:', error.response?.data)
            }
          }}
        />
      )}

      {/* Hidden audio element for remote call audio */}
      <audio ref={remoteAudioRef} autoPlay />
    </div>
  )
}

// Info Tab Component
function InfoTab({ account, isEditing, groups, dealers, onUpdate, getGroupName, getDealerName }) {
  return (
    <div style={styles.tabContent}>
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Account Information</h2>

        {/* Row 1: Account Number and Account Name */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <div style={{ width: '200px' }}>
            <FormField
              label="Account Number *"
              value={account.account_number || ''}
              isEditing={isEditing}
              onChange={(val) => onUpdate({ ...account, account_number: val })}
            />
          </div>
          <div style={{ width: '500px' }}>
            <FormField
              label="Account Name *"
              value={account.name}
              isEditing={isEditing}
              onChange={(val) => onUpdate({ ...account, name: val })}
            />
          </div>
        </div>

        {/* Row 2: Group and Dealer */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <div style={{ width: '250px' }}>
            <FormFieldSelect
              label="Group"
              value={account.group_id || ''}
              isEditing={isEditing}
              onChange={(val) => onUpdate({ ...account, group_id: val ? parseInt(val) : null })}
              options={groups}
              placeholder="No Group"
              displayValue={getGroupName()}
            />
          </div>
          <div style={{ width: '250px' }}>
            <FormFieldSelect
              label="Dealer"
              value={account.dealer_id || ''}
              isEditing={isEditing}
              onChange={(val) => onUpdate({ ...account, dealer_id: val ? parseInt(val) : null })}
              options={dealers}
              placeholder="No Dealer"
              displayValue={getDealerName()}
            />
          </div>
        </div>

        {/* Row 3: Street Address, City, State, ZIP, Timezone - All on one row */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <div style={{ width: '300px' }}>
            <FormField
              label="Street Address"
              value={account.address || ''}
              isEditing={isEditing}
              onChange={(val) => onUpdate({ ...account, address: val })}
            />
          </div>
          <div style={{ width: '150px' }}>
            <FormField
              label="City"
              value={account.city || ''}
              isEditing={isEditing}
              onChange={(val) => onUpdate({ ...account, city: val })}
            />
          </div>
          <div style={{ width: '80px' }}>
            <FormField
              label="State"
              value={account.state || ''}
              isEditing={isEditing}
              onChange={(val) => onUpdate({ ...account, state: val })}
            />
          </div>
          <div style={{ width: '100px' }}>
            <FormField
              label="ZIP Code"
              value={account.zip_code || ''}
              isEditing={isEditing}
              onChange={(val) => onUpdate({ ...account, zip_code: val })}
            />
          </div>
          <div style={{ width: '170px' }}>
            <FormFieldSelect
              label="Timezone"
              value={account.timezone || 'UTC'}
              isEditing={isEditing}
              onChange={(val) => {
                console.log('Timezone changed to:', val)
                console.log('Current account before update:', account)
                const updated = { ...account, timezone: val || 'UTC' }
                console.log('Updated account:', updated)
                onUpdate(updated)
              }}
              options={[
                { id: 'America/New_York', name: 'Eastern (ET)' },
                { id: 'America/Chicago', name: 'Central (CT)' },
                { id: 'America/Denver', name: 'Mountain (MT)' },
                { id: 'America/Los_Angeles', name: 'Pacific (PT)' },
                { id: 'America/Anchorage', name: 'Alaska (AKT)' },
                { id: 'Pacific/Honolulu', name: 'Hawaii (HST)' },
                { id: 'UTC', name: 'UTC' }
              ]}
              placeholder="UTC"
              displayValue={
                account.timezone === 'America/New_York' ? 'Eastern (ET)' :
                account.timezone === 'America/Chicago' ? 'Central (CT)' :
                account.timezone === 'America/Denver' ? 'Mountain (MT)' :
                account.timezone === 'America/Los_Angeles' ? 'Pacific (PT)' :
                account.timezone === 'America/Anchorage' ? 'Alaska (AKT)' :
                account.timezone === 'Pacific/Honolulu' ? 'Hawaii (HST)' :
                'UTC'
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// Settings Tab Component
function SettingsTab({ account, isEditing, onUpdate }) {
  return (
    <div style={styles.tabContent}>
      {/* Alarm Settings */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Alarm Settings</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <div style={{ width: '150px' }}>
            <FormFieldSelect
              label="Video Type"
              value={account.video_type || ''}
              isEditing={isEditing}
              onChange={(val) => onUpdate({ ...account, video_type: val || null })}
              options={[
                { id: 'Doorman', name: 'Doorman' },
                { id: 'Perimeter', name: 'Perimeter' },
                { id: 'Loitering', name: 'Loitering' }
              ]}
              placeholder="All Types"
              displayValue={account.video_type || 'All Types'}
            />
          </div>
          <div style={{ width: '150px' }}>
            <FormField
              label="Eyes On Priority"
              type="number"
              value={account.eyes_on_count || 1}
              isEditing={isEditing}
              onChange={(val) => onUpdate({ ...account, eyes_on_count: parseInt(val) || 1 })}
              min={1}
            />
          </div>
          <div style={{ width: '150px' }}>
            <FormField
              label="Priority (1-10)"
              type="number"
              value={account.priority || 5}
              isEditing={isEditing}
              onChange={(val) => onUpdate({ ...account, priority: parseInt(val) || 5 })}
              min={1}
              max={10}
            />
          </div>
          <div style={{ width: '150px' }}>
            <FormFieldSelect
              label="Allow Dismiss"
              value={account.allow_dismiss !== false ? 'true' : 'false'}
              isEditing={isEditing}
              onChange={(val) => onUpdate({ ...account, allow_dismiss: val === 'true' })}
              options={[
                { id: 'true', name: 'Yes' },
                { id: 'false', name: 'No' }
              ]}
              displayValue={account.allow_dismiss !== false ? 'Yes' : 'No'}
            />
          </div>
        </div>
      </div>

      {/* Vital Signs Monitoring */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Vital Signs Monitoring</h2>
        {isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="vital_signs_connectivity_enabled"
                  checked={account.vital_signs_connectivity_enabled || false}
                  onChange={(e) => onUpdate({ ...account, vital_signs_connectivity_enabled: e.target.checked })}
                  style={{ marginRight: '0.75rem', width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="vital_signs_connectivity_enabled" style={{ fontSize: '0.95rem', fontWeight: '500', color: '#e2e8f0', cursor: 'pointer' }}>
                  Enable RTSP Connectivity Monitoring
                </label>
              </div>
              <p style={{ marginLeft: '2rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                Check camera RTSP connection every hour and alert if offline
              </p>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="vital_signs_image_change_enabled"
                  checked={account.vital_signs_image_change_enabled || false}
                  onChange={(e) => onUpdate({ ...account, vital_signs_image_change_enabled: e.target.checked })}
                  style={{ marginRight: '0.75rem', width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="vital_signs_image_change_enabled" style={{ fontSize: '0.95rem', fontWeight: '500', color: '#e2e8f0', cursor: 'pointer' }}>
                  Enable Image Change Detection
                </label>
              </div>
              <p style={{ marginLeft: '2rem', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '1rem' }}>
                Detect if camera was moved or blocked (checked every 12 hours)
              </p>

              <div style={{ marginLeft: '2rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#cbd5e1', marginBottom: '0.5rem' }}>
                  Image Change Threshold (%)
                </label>
                <input
                  type="number"
                  value={account.vital_signs_image_change_threshold || 50}
                  onChange={(e) => onUpdate({ ...account, vital_signs_image_change_threshold: parseInt(e.target.value) || 50 })}
                  min="1"
                  max="100"
                  disabled={!account.vital_signs_image_change_enabled}
                  style={{
                    width: '150px',
                    padding: '0.5rem',
                    backgroundColor: account.vital_signs_image_change_enabled ? '#1e293b' : '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.375rem',
                    color: account.vital_signs_image_change_enabled ? '#f1f5f9' : '#64748b',
                    fontSize: '0.875rem'
                  }}
                />
                <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                  Percentage of image difference to trigger alert (default: 50%)
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#cbd5e1' }}>RTSP Connectivity: </span>
              <span style={{ fontSize: '0.875rem', color: account.vital_signs_connectivity_enabled ? '#22c55e' : '#94a3b8' }}>
                {account.vital_signs_connectivity_enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div>
              <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#cbd5e1' }}>Image Change Detection: </span>
              <span style={{ fontSize: '0.875rem', color: account.vital_signs_image_change_enabled ? '#22c55e' : '#94a3b8' }}>
                {account.vital_signs_image_change_enabled ? 'Enabled' : 'Disabled'}
              </span>
              {account.vital_signs_image_change_enabled && (
                <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                  {' '}(Threshold: {account.vital_signs_image_change_threshold || 50}%)
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Notes Tab Component
function NotesTab({ account, isEditing, onUpdate }) {
  return (
    <div style={styles.tabContent}>
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Notes</h2>
        {isEditing ? (
          <textarea
            value={account.notes || ''}
            onChange={(e) => onUpdate({ ...account, notes: e.target.value })}
            rows={10}
            style={styles.textarea}
            placeholder="Add notes about this account..."
          />
        ) : (
          <p style={styles.notesText}>{account.notes || 'No notes'}</p>
        )}
      </div>
    </div>
  )
}

// Contacts Tab Component
function ContactsTab({ account, isEditing, onUpdate, onAddContact, onRemoveContact, onContactChange }) {
  return (
    <div style={styles.tabContent}>
      <div style={styles.cameraHeader}>
        <h2 style={styles.cardTitle}>Contacts</h2>
        {isEditing && (
          <button onClick={onAddContact} style={styles.addBtn}>
            <Plus size={20} />
            <span>Add Contact</span>
          </button>
        )}
      </div>

      {account.contacts && account.contacts.length > 0 ? (
        <div style={styles.contactsList}>
          {account.contacts.map((contact, index) => (
            <div key={index} style={styles.contactCard}>
              <div style={styles.contactHeader}>
                <h3 style={styles.contactName}>
                  {contact.name || `Contact ${index + 1}`}
                </h3>
                {isEditing && (
                  <button onClick={() => onRemoveContact(index)} style={styles.iconBtnRed}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <div style={styles.formGrid}>
                <FormField
                  label="Name"
                  value={contact.name || ''}
                  isEditing={isEditing}
                  onChange={(val) => onContactChange(index, 'name', val)}
                />
                <FormField
                  label="Phone"
                  value={contact.phone || ''}
                  isEditing={isEditing}
                  onChange={(val) => onContactChange(index, 'phone', val)}
                />
                <FormField
                  label="Email"
                  value={contact.email || ''}
                  isEditing={isEditing}
                  onChange={(val) => onContactChange(index, 'email', val)}
                />
                <FormField
                  label="Notes"
                  value={contact.notes || ''}
                  isEditing={isEditing}
                  onChange={(val) => onContactChange(index, 'notes', val)}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.card}>
          <div style={styles.emptyState}>
            <div style={{fontSize: '3rem', marginBottom: '1rem'}}>👤</div>
            <p style={styles.emptyText}>No contacts added</p>
            {isEditing && (
              <p style={styles.emptySubtext}>Click "Add Contact" to create a new contact</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Form Field Component
function FormField({ label, value, type = 'text', isEditing, onChange }) {
  return (
    <div>
      <label style={styles.label}>{label}</label>
      {isEditing ? (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={styles.input}
        />
      ) : (
        <p style={styles.value}>{value || '-'}</p>
      )}
    </div>
  )
}

// Form Select Field Component
function FormFieldSelect({ label, value, isEditing, onChange, options, placeholder, displayValue }) {
  return (
    <div>
      <label style={styles.label}>{label}</label>
      {isEditing ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={styles.select}
        >
          <option value="">{placeholder}</option>
          {options.map(opt => (
            <option key={opt.id} value={opt.id}>{opt.name}</option>
          ))}
        </select>
      ) : (
        <p style={styles.value}>{displayValue}</p>
      )}
    </div>
  )
}

// Cameras Tab Component
function CamerasTab({ account, cameras, snapshots, loadingSnapshots, onAddCamera, onEditCamera, onCopyCamera, onDeleteCamera, onRefreshSnapshot, onOpenLiveView, onStartAll }) {
  if (!account || account.id === undefined) {
    return (
      <div style={styles.card}>
        <p style={styles.emptyText}>Save the account first before adding cameras</p>
      </div>
    )
  }

  const handleStartAll = () => {
    // Open all cameras live view
    const camerasWithRtsp = cameras.filter(c => c.rtsp_url)
    if (camerasWithRtsp.length > 0) {
      onStartAll()
    }
  }

  return (
    <div style={styles.tabContent}>
      <div style={styles.cameraHeader}>
        <h2 style={styles.cardTitle}>Cameras</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleStartAll}
            style={{
              ...styles.addBtn,
              background: '#10b981'
            }}
            disabled={cameras.length === 0 || cameras.every(c => !c.rtsp_url)}
          >
            <Grid size={20} />
            <span>View All</span>
          </button>
          <button onClick={onAddCamera} style={styles.addBtn}>
            <Plus size={20} />
            <span>Add Camera</span>
          </button>
        </div>
      </div>

      {cameras.length === 0 ? (
        <div style={styles.card}>
          <div style={styles.emptyState}>
            <CameraIcon size={48} style={{color: '#475569', marginBottom: '1rem'}} />
            <p style={styles.emptyText}>No cameras configured</p>
          </div>
        </div>
      ) : (
        <div style={styles.camerasGrid}>
          {cameras.map((camera) => (
            <div key={camera.id} style={styles.cameraCard}>
              {/* Camera Preview Thumbnail */}
              <div
                style={{
                  ...styles.cameraThumbnail,
                  ...(camera.rtsp_url ? styles.cameraThumbnailClickable : {})
                }}
                onClick={() => camera.rtsp_url && onOpenLiveView(camera)}
                title={camera.rtsp_url ? 'Click to view live stream' : ''}
              >
                {loadingSnapshots[camera.id] ? (
                  <div style={styles.thumbnailLoading}>
                    <div style={styles.smallSpinner}></div>
                    <span style={styles.thumbnailText}>Loading...</span>
                  </div>
                ) : snapshots[camera.id] ? (
                  <img
                    src={snapshots[camera.id]}
                    alt={camera.name}
                    style={styles.thumbnailImage}
                    onError={(e) => {
                      e.target.style.display = 'none'
                      e.target.parentElement.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center; gap: 4px;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg><span style="font-size: 0.7rem; color: #64748b;">No Preview</span></div>'
                    }}
                  />
                ) : (
                  <div style={styles.thumbnailEmpty}>
                    <CameraIcon size={32} color="#64748b" />
                    <span style={styles.thumbnailText}>No Preview</span>
                  </div>
                )}
                {camera.rtsp_url && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRefreshSnapshot(camera.id)
                    }}
                    style={styles.refreshBtn}
                    disabled={loadingSnapshots[camera.id]}
                  >
                    <Eye size={16} />
                  </button>
                )}
              </div>

              <div style={styles.cameraHeader2}>
                <div style={styles.cameraTitle}>
                  <CameraIcon size={20} style={{color: '#3b82f6'}} />
                  <h3 style={styles.cameraName}>{camera.name}</h3>
                </div>
                <div style={styles.cameraActions}>
                  <button onClick={() => onCopyCamera(camera)} style={styles.iconBtn} title="Copy camera with RTSP credentials">
                    <Copy size={16} />
                  </button>
                  <button onClick={() => onEditCamera(camera)} style={styles.iconBtn}>
                    <Edit size={16} />
                  </button>
                  <button onClick={() => onDeleteCamera(camera.id)} style={styles.iconBtnRed}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div style={styles.cameraDetails}>
                <div style={styles.cameraDetail}>
                  <span style={styles.detailLabel}>Camera #:</span>
                  <span style={styles.detailValue}>{camera.camera_number || 'N/A'}</span>
                </div>
                {camera.location && (
                  <div style={styles.cameraDetail}>
                    <span style={styles.detailLabel}>Location:</span>
                    <span style={styles.detailValue}>{camera.location}</span>
                  </div>
                )}
                {camera.inbound_phone_number && (
                  <div style={styles.cameraDetail}>
                    <span style={styles.detailLabel}>Inbound Phone:</span>
                    <span style={styles.detailValue}>{camera.inbound_phone_number}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Action Plan Tab Component
function ActionPlanTab({ account, onManageActionPlan }) {
  const hasActionPlan = account?.action_plan && account.action_plan.length > 0

  return (
    <div style={styles.tabContent}>
      <div style={styles.cameraHeader}>
        <h2 style={styles.cardTitle}>Action Plan</h2>
        <button onClick={onManageActionPlan} style={styles.addBtn}>
          <ListChecks size={20} />
          <span>{hasActionPlan ? 'Edit Action Plan' : 'Create Action Plan'}</span>
        </button>
      </div>

      <div style={styles.card}>
        {hasActionPlan ? (
          <ActionPlanTree steps={account.action_plan} readOnly />
        ) : (
          <div style={styles.emptyState}>
            <ListChecks size={48} style={{color: '#475569', marginBottom: '1rem'}} />
            <p style={styles.emptyText}>No action plan configured</p>
            <p style={styles.emptySubtext}>Create an action plan to guide operators when viewing alarms</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Snooze Tab Component
function SnoozeTab({ account, onUpdate }) {
  return (
    <div style={styles.tabContent}>
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Account Snooze Settings</h2>
        <p style={styles.snoozeDesc}>
          Snoozing an account will suppress all alarm creation for this account until the snooze expires.
          Events will still be logged but no alarms will be generated.
        </p>

        <div style={styles.snoozeStatus}>
          <div>
            <div style={styles.snoozeStatusTitle}>Current Status</div>
            {account.snoozed_until ? (
              <div style={styles.snoozedText}>
                <BellOff size={16} style={{marginRight: '0.5rem'}} />
                Snoozed until {formatTimestampInTimezone(account.snoozed_until, account.timezone, { showTimezone: true })}
              </div>
            ) : (
              <div style={styles.activeText}>
                <Bell size={16} style={{marginRight: '0.5rem'}} />
                Active - Alarms enabled
              </div>
            )}
          </div>
          <SnoozeButton
            type="account"
            id={account.id}
            snoozedUntil={account.snoozed_until}
            onSnoozeChange={onUpdate}
          />
        </div>
      </div>
    </div>
  )
}

// Tenants Tab Component
function TenantsTab({ account, apartments, loadingApartments, onRefresh }) {
  const [expandedApartments, setExpandedApartments] = useState({})
  const [editingApartment, setEditingApartment] = useState(null)
  const [editingTenant, setEditingTenant] = useState(null)
  const [showAddApartmentModal, setShowAddApartmentModal] = useState(false)
  const [showAddTenantModal, setShowAddTenantModal] = useState(false)
  const [selectedApartmentId, setSelectedApartmentId] = useState(null)

  const toggleApartment = (aptId) => {
    setExpandedApartments(prev => ({ ...prev, [aptId]: !prev[aptId] }))
  }

  const handleAddApartment = async (apartmentData) => {
    try {
      await api.post('/apartments', {
        account_id: account.id,
        ...apartmentData
      })
      toast.success('Apartment added successfully')
      setShowAddApartmentModal(false)
      onRefresh()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add apartment')
    }
  }

  const handleUpdateApartment = async (aptId, apartmentData) => {
    try {
      await api.put(`/apartments/${aptId}`, apartmentData)
      toast.success('Apartment updated successfully')
      setEditingApartment(null)
      onRefresh()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update apartment')
    }
  }

  const handleDeleteApartment = async (aptId) => {
    if (!confirm('Are you sure you want to delete this apartment and all its tenants?')) return

    try {
      await api.delete(`/apartments/${aptId}`)
      toast.success('Apartment deleted successfully')
      onRefresh()
    } catch (error) {
      toast.error('Failed to delete apartment')
    }
  }

  const handleAddTenant = async (tenantData) => {
    try {
      await api.post('/tenants', {
        apartment_id: selectedApartmentId,
        ...tenantData
      })
      toast.success('Tenant added successfully')
      setShowAddTenantModal(false)
      setSelectedApartmentId(null)
      onRefresh()
    } catch (error) {
      toast.error('Failed to add tenant')
    }
  }

  const handleUpdateTenant = async (tenantId, tenantData) => {
    try {
      await api.put(`/tenants/${tenantId}`, tenantData)
      toast.success('Tenant updated successfully')
      setEditingTenant(null)
      onRefresh()
    } catch (error) {
      toast.error('Failed to update tenant')
    }
  }

  const handleDeleteTenant = async (tenantId) => {
    if (!confirm('Are you sure you want to delete this tenant?')) return

    try {
      await api.delete(`/tenants/${tenantId}`)
      toast.success('Tenant deleted successfully')
      onRefresh()
    } catch (error) {
      toast.error('Failed to delete tenant')
    }
  }

  if (loadingApartments) {
    return (
      <div style={styles.tabContent}>
        <div style={styles.card}>
          <p style={{textAlign: 'center', padding: '2rem'}}>Loading apartments...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.tabContent}>
      <div style={styles.cameraHeader}>
        <h2 style={styles.cardTitle}>Building Tenants</h2>
        <button onClick={() => setShowAddApartmentModal(true)} style={styles.addBtn}>
          <Plus size={20} />
          <span>Add Apartment</span>
        </button>
      </div>

      {apartments.length === 0 ? (
        <div style={styles.card}>
          <div style={styles.emptyState}>
            <div style={{fontSize: '3rem', marginBottom: '1rem'}}>🏢</div>
            <p style={styles.emptyText}>No apartments added</p>
            <p style={styles.emptySubtext}>Click "Add Apartment" to create a new apartment</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {apartments.map((apartment) => (
            <div key={apartment.id} style={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button
                    onClick={() => toggleApartment(apartment.id)}
                    style={{ ...styles.iconBtn, padding: '0.5rem' }}
                  >
                    <span style={{ transform: expandedApartments[apartment.id] ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform 0.2s' }}>
                      ▶
                    </span>
                  </button>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                    Apartment {apartment.apartment_number}
                  </h3>
                  {apartment.tenants?.length > 0 && (
                    <span style={{ fontSize: '0.875rem', color: '#64748b', backgroundColor: '#f1f5f9', padding: '0.25rem 0.75rem', borderRadius: '1rem' }}>
                      {apartment.tenants.length} tenant{apartment.tenants.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => {
                      setSelectedApartmentId(apartment.id)
                      setShowAddTenantModal(true)
                    }}
                    style={styles.iconBtn}
                    title="Add Tenant"
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    onClick={() => setEditingApartment(apartment)}
                    style={styles.iconBtn}
                    title="Edit Apartment"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteApartment(apartment.id)}
                    style={styles.iconBtnRed}
                    title="Delete Apartment"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {apartment.notes && (
                <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1rem', fontStyle: 'italic' }}>
                  Note: {apartment.notes}
                </p>
              )}

              {expandedApartments[apartment.id] && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                  {apartment.tenants?.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>
                      No tenants in this apartment
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {apartment.tenants.map((tenant) => (
                        <div key={tenant.id} style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                            <div>
                              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#e2e8f0' }}>
                                {tenant.name}
                              </h4>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                                {tenant.phone_number && <div>📞 {tenant.phone_number}</div>}
                                {tenant.email && <div>📧 {tenant.email}</div>}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                onClick={() => setEditingTenant(tenant)}
                                style={styles.iconBtn}
                                title="Edit Tenant"
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteTenant(tenant.id)}
                                style={styles.iconBtnRed}
                                title="Delete Tenant"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#e2e8f0' }}>
                              <input
                                type="checkbox"
                                checked={tenant.sms_enabled}
                                onChange={(e) => handleUpdateTenant(tenant.id, { sms_enabled: e.target.checked })}
                                style={{ cursor: 'pointer' }}
                              />
                              <span>SMS Notifications</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#e2e8f0' }}>
                              <input
                                type="checkbox"
                                checked={tenant.email_enabled}
                                onChange={(e) => handleUpdateTenant(tenant.id, { email_enabled: e.target.checked })}
                                style={{ cursor: 'pointer' }}
                              />
                              <span>Email Notifications</span>
                            </label>
                          </div>

                          {tenant.notes && (
                            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.75rem', fontStyle: 'italic' }}>
                              Note: {tenant.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Apartment Modal */}
      {showAddApartmentModal && (
        <ApartmentModal
          onClose={() => setShowAddApartmentModal(false)}
          onSave={handleAddApartment}
        />
      )}

      {/* Edit Apartment Modal */}
      {editingApartment && (
        <ApartmentModal
          apartment={editingApartment}
          onClose={() => setEditingApartment(null)}
          onSave={(data) => handleUpdateApartment(editingApartment.id, data)}
        />
      )}

      {/* Add Tenant Modal */}
      {showAddTenantModal && (
        <TenantModal
          onClose={() => {
            setShowAddTenantModal(false)
            setSelectedApartmentId(null)
          }}
          onSave={handleAddTenant}
        />
      )}

      {/* Edit Tenant Modal */}
      {editingTenant && (
        <TenantModal
          tenant={editingTenant}
          onClose={() => setEditingTenant(null)}
          onSave={(data) => handleUpdateTenant(editingTenant.id, data)}
        />
      )}
    </div>
  )
}

// Apartment Modal Component
function ApartmentModal({ apartment, onClose, onSave }) {
  const [formData, setFormData] = useState({
    apartment_number: apartment?.apartment_number || '',
    notes: apartment?.notes || ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.apartment_number.trim()) {
      toast.error('Apartment number is required')
      return
    }
    onSave(formData)
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            {apartment ? 'Edit Apartment' : 'Add Apartment'}
          </h2>
          <button onClick={onClose} style={styles.iconBtn}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} style={styles.modalBody}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Apartment Number *</label>
            <input
              type="text"
              value={formData.apartment_number}
              onChange={(e) => setFormData({ ...formData, apartment_number: e.target.value })}
              style={styles.input}
              placeholder="e.g., 101, 2B, etc."
              required
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
              placeholder="Optional notes about this apartment"
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" style={styles.saveBtn}>
              {apartment ? 'Update' : 'Add'} Apartment
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Tenant Modal Component
function TenantModal({ tenant, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: tenant?.name || '',
    phone_number: tenant?.phone_number || '',
    email: tenant?.email || '',
    notes: tenant?.notes || '',
    sms_enabled: tenant?.sms_enabled ?? true,
    email_enabled: tenant?.email_enabled ?? true
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      toast.error('Tenant name is required')
      return
    }
    onSave(formData)
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            {tenant ? 'Edit Tenant' : 'Add Tenant'}
          </h2>
          <button onClick={onClose} style={styles.iconBtn}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} style={styles.modalBody}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={styles.input}
              placeholder="Tenant name"
              required
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Phone Number</label>
            <input
              type="tel"
              value={formData.phone_number}
              onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
              style={styles.input}
              placeholder="e.g., (555) 123-4567"
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              style={styles.input}
              placeholder="tenant@example.com"
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              style={{ ...styles.input, minHeight: '60px', resize: 'vertical' }}
              placeholder="Optional notes about this tenant"
            />
          </div>
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#1e293b', borderRadius: '0.5rem', border: '1px solid #334155' }}>
            <label style={{ ...styles.label, marginBottom: '0.75rem' }}>Notification Preferences</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#e2e8f0' }}>
                <input
                  type="checkbox"
                  checked={formData.sms_enabled}
                  onChange={(e) => setFormData({ ...formData, sms_enabled: e.target.checked })}
                  style={{ cursor: 'pointer' }}
                />
                <span>Enable SMS Notifications</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#e2e8f0' }}>
                <input
                  type="checkbox"
                  checked={formData.email_enabled}
                  onChange={(e) => setFormData({ ...formData, email_enabled: e.target.checked })}
                  style={{ cursor: 'pointer' }}
                />
                <span>Enable Email Notifications</span>
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" style={styles.saveBtn}>
              {tenant ? 'Update' : 'Add'} Tenant
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Arm/Disarm Tab Component
function ArmDisarmTab({ account, cameras, schedules, onCreateSchedule, onEditSchedule, onDeleteSchedule, onRefresh }) {
  const [cameraStates, setCameraStates] = useState({})
  const [loadingCameras, setLoadingCameras] = useState({})
  const [loadingBulk, setLoadingBulk] = useState(false)

  // Function to check if camera is currently disarmed based on schedule
  const isCurrentlyDisarmed = (camera, schedule) => {
    if (!schedule || !schedule.periods || schedule.periods.length === 0) {
      return false
    }

    const now = new Date()
    const currentDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()]
    const currentTime = now.getHours() * 60 + now.getMinutes() // minutes since midnight

    for (const period of schedule.periods) {
      if (period.days.includes(currentDay)) {
        const [startHour, startMin] = period.start_time.split(':').map(Number)
        const [endHour, endMin] = period.end_time.split(':').map(Number)
        const startTime = startHour * 60 + startMin
        const endTime = endHour * 60 + endMin

        if (currentTime >= startTime && currentTime <= endTime) {
          return true
        }
      }
    }
    return false
  }

  // Get the current arm/disarm state for a camera
  const getCameraState = (camera) => {
    // Manual override takes precedence
    if (camera.manual_arm_state === true) return { armed: true, manual: true }
    if (camera.manual_arm_state === false) return { armed: false, manual: true }

    // Check schedule
    const schedule = schedules.find(s =>
      s.cameraFilter === 'all' ||
      (s.cameraIds && s.cameraIds.includes(camera.id))
    )

    if (schedule && isCurrentlyDisarmed(camera, schedule)) {
      return { armed: false, manual: false, scheduleName: schedule.name }
    }

    return { armed: true, manual: false }
  }

  const handleManualToggle = async (camera, armed) => {
    setLoadingCameras({ ...loadingCameras, [camera.id]: true })
    try {
      await api.put(`/cameras/${camera.id}`, {
        manual_arm_state: armed
      })
      // Trigger a refresh by updating state
      setCameraStates({ ...cameraStates, [camera.id]: armed })
      // Reload the account data without full page reload
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error) {
      toast.error('Failed to update camera state')
      console.error(error)
    } finally {
      setLoadingCameras({ ...loadingCameras, [camera.id]: false })
    }
  }

  const clearManualOverride = async (camera) => {
    setLoadingCameras({ ...loadingCameras, [camera.id]: true })
    try {
      await api.put(`/cameras/${camera.id}`, {
        manual_arm_state: null
      })
      setCameraStates({ ...cameraStates, [camera.id]: null })
      // Reload the account data without full page reload
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error) {
      toast.error('Failed to clear manual override')
      console.error(error)
    } finally {
      setLoadingCameras({ ...loadingCameras, [camera.id]: false })
    }
  }

  const handleArmAll = async () => {
    setLoadingBulk(true)
    try {
      await Promise.all(cameras.map(camera =>
        api.put(`/cameras/${camera.id}`, { manual_arm_state: true })
      ))
      if (onRefresh) await onRefresh()
    } catch (error) {
      toast.error('Failed to arm all cameras')
    } finally {
      setLoadingBulk(false)
    }
  }

  const handleDisarmAll = async () => {
    setLoadingBulk(true)
    try {
      await Promise.all(cameras.map(camera =>
        api.put(`/cameras/${camera.id}`, { manual_arm_state: false })
      ))
      if (onRefresh) await onRefresh()
    } catch (error) {
      toast.error('Failed to disarm all cameras')
    } finally {
      setLoadingBulk(false)
    }
  }

  return (
    <div style={styles.tabContent}>
      {/* Bulk Actions Header */}
      <div style={styles.cameraHeader}>
        <div>
          <h2 style={styles.cardTitle}>Arm/Disarm Controls</h2>
          <p style={styles.armDisarmDesc}>Control camera arming status and manage schedules</p>
        </div>
        <div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
          <button
            onClick={handleArmAll}
            style={{...styles.bulkArmBtn, ...(loadingBulk ? {opacity: 0.6} : {})}}
            disabled={loadingBulk}
          >
            <Shield size={20} />
            <span>{loadingBulk ? 'Arming...' : 'Arm All'}</span>
          </button>
          <button
            onClick={handleDisarmAll}
            style={{...styles.bulkDisarmBtn, ...(loadingBulk ? {opacity: 0.6} : {})}}
            disabled={loadingBulk}
          >
            <ShieldOff size={20} />
            <span>{loadingBulk ? 'Disarming...' : 'Disarm All'}</span>
          </button>
          <SnoozeButton
            type="account"
            id={account.id}
            snoozedUntil={account.snoozed_until}
            onSnoozeUpdate={onRefresh}
            buttonStyle={{padding: '0.75rem 1.5rem'}}
            showLabel={true}
          />
          <button onClick={onCreateSchedule} style={styles.addBtn}>
            <Plus size={20} />
            <span>Create Schedule</span>
          </button>
        </div>
      </div>

      {/* Camera Status & Manual Controls */}
      {cameras.length > 0 && (
        <div style={styles.card}>
          <h3 style={styles.sectionTitle}>Camera Controls</h3>
          <div style={styles.cameraGrid}>
            {cameras.map(camera => {
              const state = getCameraState(camera)
              return (
                <div key={camera.id} style={styles.cameraRow}>
                  {/* Camera Name */}
                  <div style={styles.cameraNameInline}>
                    <CameraIcon size={14} style={{color: '#3b82f6', minWidth: '14px'}} />
                    <span style={styles.cameraNameText}>{camera.name}</span>
                  </div>

                  {/* Control Buttons - Status shown by button color */}
                  <div style={styles.cameraRowActions}>
                    <button
                      onClick={() => handleManualToggle(camera, true)}
                      style={{
                        ...styles.armBtnInline,
                        ...(state.armed ? styles.armBtnArmed : {}),
                        ...(loadingCameras[camera.id] ? { opacity: 0.6, cursor: 'not-allowed' } : {})
                      }}
                      disabled={state.armed && state.manual || loadingCameras[camera.id]}
                      title={state.armed ? "Currently armed" : "Arm camera"}
                    >
                      <Shield size={14} />
                    </button>
                    <button
                      onClick={() => handleManualToggle(camera, false)}
                      style={{
                        ...styles.disarmBtnInline,
                        ...(!state.armed ? styles.disarmBtnDisarmed : {}),
                        ...(loadingCameras[camera.id] ? { opacity: 0.6, cursor: 'not-allowed' } : {})
                      }}
                      disabled={!state.armed && state.manual || loadingCameras[camera.id]}
                      title={!state.armed ? "Currently disarmed" : "Disarm camera"}
                    >
                      <ShieldOff size={14} />
                    </button>

                    <SnoozeButton
                      type="camera"
                      id={camera.id}
                      snoozedUntil={camera.snoozed_until}
                      onSnoozeUpdate={onRefresh}
                      buttonStyle={{padding: '0.375rem', minWidth: '32px'}}
                      showLabel={false}
                    />

                    {state.manual && (
                      <button
                        onClick={() => clearManualOverride(camera)}
                        style={{
                          ...styles.clearOverrideBtnInline,
                          ...(loadingCameras[camera.id] ? { opacity: 0.6, cursor: 'not-allowed' } : {})
                        }}
                        disabled={loadingCameras[camera.id]}
                        title="Clear manual override"
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Schedules List - Only show if schedules exist */}
      {schedules.length > 0 && (
        <div style={styles.card}>
          <h3 style={styles.sectionTitle}>Disarm Schedules</h3>
          <div style={styles.schedulesList}>
            {schedules.map(schedule => (
              <div key={schedule.id} style={styles.scheduleCard}>
                <div style={styles.scheduleHeader}>
                  <div>
                    <h4 style={styles.scheduleName}>{schedule.name}</h4>
                    {schedule.description && (
                      <p style={styles.scheduleDesc}>{schedule.description}</p>
                    )}
                  </div>
                  <div style={styles.scheduleActions}>
                    <button onClick={() => onEditSchedule(schedule)} style={styles.iconBtn}>
                      <Edit size={16} />
                    </button>
                    <button onClick={() => onDeleteSchedule(schedule.id)} style={styles.iconBtnRed}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div style={styles.scheduleInfo}>
                  <div style={{marginBottom: '0.75rem'}}>
                    <span style={styles.scheduleMetaLabel}>Cameras: </span>
                    <span style={styles.scheduleMetaValue}>
                      {schedule.cameraFilter === 'all' ? (
                        'All Cameras'
                      ) : schedule.cameraIds && schedule.cameraIds.length > 0 ? (
                        schedule.cameraIds.map(camId => {
                          const cam = cameras.find(c => c.id === camId)
                          return cam?.name
                        }).filter(Boolean).join(', ')
                      ) : (
                        'No cameras selected'
                      )}
                    </span>
                  </div>

                  <div style={styles.schedulePeriods}>
                    {schedule.periods && schedule.periods.length > 0 ? (
                      schedule.periods.map((period, index) => (
                        <div key={index} style={styles.periodChip}>
                          <ShieldOff size={14} style={{marginRight: '0.25rem'}} />
                          {period.days.join(', ')}: {period.start_time} - {period.end_time}
                        </div>
                      ))
                    ) : (
                      <span style={styles.emptyText}>No periods defined</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Add Camera Modal
function AddCameraModal({ account, initialData, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    account_id: account.id,
    camera_number: initialData?.camera_number || '',
    name: initialData?.name || '',
    rtsp_url: initialData?.rtsp_url || '',
    rtsp_username: initialData?.rtsp_username || '',
    rtsp_password: initialData?.rtsp_password || '',
    location: initialData?.location || '',
    inbound_phone_number: initialData?.inbound_phone_number || '',
    priority: initialData?.priority || null,
    allow_dismiss: initialData?.allow_dismiss || null,
    video_type: initialData?.video_type || account.video_type || null
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Clean up form data - convert empty strings to null for optional fields
      const cleanedData = {
        ...formData,
        camera_number: formData.camera_number === '' ? null : parseInt(formData.camera_number) || null,
        rtsp_username: formData.rtsp_username === '' ? null : formData.rtsp_username,
        rtsp_password: formData.rtsp_password === '' ? null : formData.rtsp_password,
        location: formData.location === '' ? null : formData.location,
        inbound_phone_number: formData.inbound_phone_number === '' ? null : formData.inbound_phone_number
      }
      await api.post('/cameras', cleanedData)
      onSuccess()
    } catch (error) {
      toast.error('Failed to add camera')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{initialData ? 'Copy Camera' : 'Add Camera'}</h2>
          <button onClick={onClose} style={styles.modalClose}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.modalForm}>
          <div>
            <label style={styles.label}>Camera Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={styles.input}
              required
            />
          </div>

          <div>
            <label style={styles.label}>Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              style={styles.input}
              placeholder="e.g., Front Entrance"
            />
          </div>

          <div style={{display: 'flex', gap: '1rem'}}>
            <div style={{flex: 1}}>
              <label style={styles.label}>Camera Number (optional)</label>
              <input
                type="text"
                value={formData.camera_number}
                onChange={(e) => setFormData({ ...formData, camera_number: e.target.value })}
                style={styles.input}
                placeholder="Auto-generated if blank"
              />
            </div>

            <div style={{flex: 1}}>
              <label style={styles.label}>Inbound Phone Number</label>
              <input
                type="text"
                value={formData.inbound_phone_number || ''}
                onChange={(e) => setFormData({ ...formData, inbound_phone_number: e.target.value })}
                style={styles.input}
                placeholder="e.g., 5551234567"
              />
            </div>
          </div>

          <div>
            <label style={styles.label}>RTSP URL</label>
            <input
              type="text"
              value={formData.rtsp_url}
              onChange={(e) => setFormData({ ...formData, rtsp_url: e.target.value })}
              style={styles.input}
              placeholder="rtsp://..."
            />
          </div>

          <div style={{display: 'flex', gap: '1rem'}}>
            <div style={{flex: 1}}>
              <label style={styles.label}>RTSP Username (optional)</label>
              <input
                type="text"
                value={formData.rtsp_username || ''}
                onChange={(e) => setFormData({ ...formData, rtsp_username: e.target.value })}
                style={styles.input}
                placeholder="username"
                autoComplete="off"
              />
            </div>

            <div style={{flex: 1}}>
              <label style={styles.label}>RTSP Password (optional)</label>
              <input
                type="password"
                value={formData.rtsp_password || ''}
                onChange={(e) => setFormData({ ...formData, rtsp_password: e.target.value })}
                style={styles.input}
                placeholder="password"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div>
            <label style={styles.label}>Priority (Lower = Higher Priority)</label>
            <input
              type="number"
              value={formData.priority || ''}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value ? parseInt(e.target.value) : null })}
              style={styles.input}
              placeholder={`Uses account default (${account.priority || 5})`}
              min={1}
              max={10}
            />
          </div>

          <div>
            <label style={styles.label}>Allow Dismiss on Dashboard</label>
            <select
              value={formData.allow_dismiss === null || formData.allow_dismiss === undefined ? '' : (formData.allow_dismiss ? 'true' : 'false')}
              onChange={(e) => setFormData({ ...formData, allow_dismiss: e.target.value === '' ? null : e.target.value === 'true' })}
              style={styles.select}
            >
              <option value="">Use Account Default ({account.allow_dismiss !== false ? 'Yes' : 'No'})</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>

          <div>
            <label style={styles.label}>Video Type</label>
            <select
              value={formData.video_type || ''}
              onChange={(e) => setFormData({ ...formData, video_type: e.target.value || null })}
              style={styles.select}
            >
              <option value="">All Types</option>
              <option value="Doorman">Doorman</option>
              <option value="Perimeter">Perimeter</option>
              <option value="Loitering">Loitering</option>
            </select>
          </div>

          <div style={styles.modalActions}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={styles.saveBtn}>
              {loading ? 'Adding...' : 'Add Camera'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Edit Camera Modal
function EditCameraModal({ camera, account, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    camera_number: camera.camera_number || '',
    name: camera.name,
    rtsp_url: camera.rtsp_url || '',
    rtsp_username: camera.rtsp_username || '',
    rtsp_password: camera.rtsp_password || '',
    location: camera.location || '',
    inbound_phone_number: camera.inbound_phone_number || '',
    priority: camera.priority,
    allow_dismiss: camera.allow_dismiss,
    video_type: camera.video_type || null,
    associated_tool_id: camera.associated_tool_id || null,
    associated_relay_number: camera.associated_relay_number || null,
    associated_actions: camera.associated_actions || []
  })
  const [loading, setLoading] = useState(false)
  const [tools, setTools] = useState([])
  const [toolGroups, setToolGroups] = useState([])
  const [selectedToolRelays, setSelectedToolRelays] = useState([])

  useEffect(() => {
    loadTools()
    loadToolGroups()
  }, [account.id])

  useEffect(() => {
    // When tool is selected, load its relays
    if (formData.associated_tool_id) {
      const tool = tools.find(t => t.id === formData.associated_tool_id)
      if (tool && tool.tool_type === 'cbw_relay' && tool.config.relays) {
        setSelectedToolRelays(tool.config.relays)
      } else {
        setSelectedToolRelays([])
      }
    } else {
      setSelectedToolRelays([])
    }
  }, [formData.associated_tool_id, tools])

  const loadTools = async () => {
    try {
      const response = await api.get(`/tools?account_id=${account.id}`)
      setTools(response.data)
    } catch (error) {
      console.error('Failed to load tools:', error)
    }
  }

  const loadToolGroups = async () => {
    try {
      const response = await api.get(`/tool-groups?account_id=${account.id}`)
      setToolGroups(response.data)
    } catch (error) {
      console.error('Failed to load tool groups:', error)
    }
  }

  const handleAddAction = () => {
    setFormData({
      ...formData,
      associated_actions: [...formData.associated_actions, { type: 'tool', tool_id: null, relay_number: null, label: '' }]
    })
  }

  const handleRemoveAction = (index) => {
    const newActions = formData.associated_actions.filter((_, i) => i !== index)
    setFormData({ ...formData, associated_actions: newActions })
  }

  const handleActionChange = (index, field, value) => {
    const newActions = [...formData.associated_actions]
    newActions[index] = { ...newActions[index], [field]: value }

    // If changing type or tool/group, reset related fields
    if (field === 'type') {
      newActions[index] = { type: value, label: newActions[index].label }
      if (value === 'tool') {
        newActions[index].tool_id = null
        newActions[index].relay_number = null
      } else {
        newActions[index].group_id = null
      }
    }

    // If changing tool, reset relay
    if (field === 'tool_id') {
      newActions[index].relay_number = null
    }

    setFormData({ ...formData, associated_actions: newActions })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      await api.put(`/cameras/${camera.id}`, formData)
      onSuccess()
    } catch (error) {
      toast.error('Failed to update camera')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Edit Camera</h2>
          <button onClick={onClose} style={styles.modalClose}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.modalForm}>
          <div>
            <label style={styles.label}>Camera Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={styles.input}
              required
            />
          </div>

          <div>
            <label style={styles.label}>Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              style={styles.input}
            />
          </div>

          <div style={{display: 'flex', gap: '1rem'}}>
            <div style={{flex: 1}}>
              <label style={styles.label}>Camera Number</label>
              <input
                type="text"
                value={formData.camera_number}
                onChange={(e) => setFormData({ ...formData, camera_number: e.target.value })}
                style={styles.input}
              />
            </div>

            <div style={{flex: 1}}>
              <label style={styles.label}>Inbound Phone Number</label>
              <input
                type="text"
                value={formData.inbound_phone_number || ''}
                onChange={(e) => setFormData({ ...formData, inbound_phone_number: e.target.value })}
                style={styles.input}
                placeholder="e.g., 5551234567"
              />
            </div>
          </div>

          <div>
            <label style={styles.label}>SMTP Email</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                value={camera.smtp_email}
                style={{ ...styles.input, flex: 1 }}
                readOnly
                disabled
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(camera.smtp_email)
                }}
                style={{
                  ...styles.copyBtn,
                  padding: '0.75rem',
                  borderRadius: '0.375rem',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
                title="Copy email to clipboard"
              >
                <Copy size={16} />
                Copy
              </button>
            </div>
          </div>

          <div>
            <label style={styles.label}>RTSP URL</label>
            <input
              type="text"
              value={formData.rtsp_url}
              onChange={(e) => setFormData({ ...formData, rtsp_url: e.target.value })}
              style={styles.input}
            />
          </div>

          <div style={{display: 'flex', gap: '1rem'}}>
            <div style={{flex: 1}}>
              <label style={styles.label}>RTSP Username (optional)</label>
              <input
                type="text"
                value={formData.rtsp_username || ''}
                onChange={(e) => setFormData({ ...formData, rtsp_username: e.target.value })}
                style={styles.input}
                placeholder="username"
                autoComplete="off"
              />
            </div>

            <div style={{flex: 1}}>
              <label style={styles.label}>RTSP Password (optional)</label>
              <input
                type="text"
                value={formData.rtsp_password || ''}
                onChange={(e) => setFormData({ ...formData, rtsp_password: e.target.value })}
                style={styles.input}
                placeholder="password"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div>
            <label style={styles.label}>Priority (Lower = Higher Priority)</label>
            <input
              type="number"
              value={formData.priority || ''}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value ? parseInt(e.target.value) : null })}
              style={styles.input}
              placeholder={`Uses account default (${account.priority || 5})`}
              min={1}
              max={10}
            />
          </div>

          <div>
            <label style={styles.label}>Allow Dismiss on Dashboard</label>
            <select
              value={formData.allow_dismiss === null || formData.allow_dismiss === undefined ? '' : (formData.allow_dismiss ? 'true' : 'false')}
              onChange={(e) => setFormData({ ...formData, allow_dismiss: e.target.value === '' ? null : e.target.value === 'true' })}
              style={styles.select}
            >
              <option value="">Use Account Default ({account.allow_dismiss !== false ? 'Yes' : 'No'})</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>

          <div>
            <label style={styles.label}>Video Type</label>
            <select
              value={formData.video_type || ''}
              onChange={(e) => setFormData({ ...formData, video_type: e.target.value || null })}
              style={styles.select}
            >
              <option value="">All Types</option>
              <option value="Doorman">Doorman</option>
              <option value="Perimeter">Perimeter</option>
              <option value="Loitering">Loitering</option>
            </select>
          </div>

          <div style={{borderTop: '1px solid #334155', paddingTop: '1rem', marginTop: '1rem'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
              <h3 style={{...styles.label, fontSize: '1rem', margin: 0}}>Tool Associations</h3>
              <button
                type="button"
                onClick={handleAddAction}
                style={{
                  ...styles.iconBtn,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem'
                }}
              >
                <Plus size={16} />
                Add Action
              </button>
            </div>

            {formData.associated_actions.length === 0 && (
              <div style={{
                padding: '1rem',
                background: '#0f172a',
                borderRadius: '0.5rem',
                color: '#64748b',
                fontSize: '0.875rem',
                textAlign: 'center'
              }}>
                No tool associations. Click "Add Action" to assign tools or tool groups.
              </div>
            )}

            {formData.associated_actions.map((action, index) => {
              const selectedTool = action.type === 'tool' && action.tool_id ? tools.find(t => t.id === action.tool_id) : null
              const toolRelays = selectedTool?.tool_type === 'cbw_relay' && selectedTool?.config?.relays ? selectedTool.config.relays : []

              return (
                <div key={index} style={{
                  padding: '1rem',
                  background: '#0f172a',
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  border: '1px solid #334155'
                }}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem'}}>
                    <span style={{fontSize: '0.875rem', fontWeight: '600', color: '#e2e8f0'}}>
                      Action {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAction(index)}
                      style={{
                        background: '#ef4444',
                        border: 'none',
                        borderRadius: '0.25rem',
                        padding: '0.25rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        color: 'white'
                      }}
                      title="Remove action"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
                    <div>
                      <label style={{...styles.label, fontSize: '0.875rem'}}>Type</label>
                      <select
                        value={action.type || 'tool'}
                        onChange={(e) => handleActionChange(index, 'type', e.target.value)}
                        style={styles.select}
                      >
                        <option value="tool">Tool</option>
                        <option value="tool_group">Tool Group</option>
                      </select>
                    </div>

                    {action.type === 'tool' && (
                      <>
                        <div>
                          <label style={{...styles.label, fontSize: '0.875rem'}}>Tool</label>
                          <select
                            value={action.tool_id || ''}
                            onChange={(e) => handleActionChange(index, 'tool_id', e.target.value ? parseInt(e.target.value) : null)}
                            style={styles.select}
                          >
                            <option value="">Select Tool</option>
                            {tools.map(tool => (
                              <option key={tool.id} value={tool.id}>{tool.name}</option>
                            ))}
                          </select>
                        </div>

                        {toolRelays.length > 0 && (
                          <div>
                            <label style={{...styles.label, fontSize: '0.875rem'}}>Relay Number (optional)</label>
                            <select
                              value={action.relay_number || ''}
                              onChange={(e) => handleActionChange(index, 'relay_number', e.target.value ? parseInt(e.target.value) : null)}
                              style={styles.select}
                            >
                              <option value="">All Relays</option>
                              {toolRelays.map(relay => (
                                <option key={relay.number} value={relay.number}>
                                  Relay {relay.number} {relay.description && `- ${relay.description}`}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </>
                    )}

                    {action.type === 'tool_group' && (
                      <div>
                        <label style={{...styles.label, fontSize: '0.875rem'}}>Tool Group</label>
                        <select
                          value={action.group_id || ''}
                          onChange={(e) => handleActionChange(index, 'group_id', e.target.value ? parseInt(e.target.value) : null)}
                          style={styles.select}
                        >
                          <option value="">Select Tool Group</option>
                          {toolGroups.map(group => (
                            <option key={group.id} value={group.id}>{group.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label style={{...styles.label, fontSize: '0.875rem'}}>Button Label (optional)</label>
                      <input
                        type="text"
                        value={action.label || ''}
                        onChange={(e) => handleActionChange(index, 'label', e.target.value)}
                        style={styles.input}
                        placeholder={action.type === 'tool' ? 'e.g., Unlock Door' : 'e.g., Open Gate'}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={styles.modalActions}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={styles.saveBtn}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Action Plan Modal
function ActionPlanModal({ account, cameras, onClose, onSave }) {
  const [actionPlan, setActionPlan] = useState(account.action_plan || [])
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingTools, setLoadingTools] = useState(true)

  useEffect(() => {
    loadTools()
  }, [account.id])

  const loadTools = async () => {
    try {
      const response = await api.get(`/tools?account_id=${account.id}`)
      setTools(response.data)
    } catch (error) {
      console.error('Failed to load tools:', error)
      toast.error('Failed to load tools')
    } finally {
      setLoadingTools(false)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const response = await api.put(`/accounts/${account.id}`, {
        ...account,
        action_plan: actionPlan
      })
      onSave(response.data)
    } catch (error) {
      toast.error('Failed to save action plan')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.modalOverlay}>
      <div style={{...styles.modal, maxWidth: '800px', maxHeight: '80vh', overflowY: 'auto'}}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Manage Action Plan</h2>
          <button onClick={onClose} style={styles.modalClose}>
            <X size={24} />
          </button>
        </div>

        <div style={styles.modalForm}>
          {loadingTools ? (
            <div style={{padding: '2rem', textAlign: 'center', color: '#94a3b8'}}>
              Loading tools and cameras...
            </div>
          ) : (
            <ActionPlanTree
              initialSteps={actionPlan}
              onSave={setActionPlan}
              onClose={onClose}
              availableCameras={cameras || []}
              availableTools={tools}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// Schedule Modal
function ScheduleModal({ schedule, cameras, onClose, onSave }) {
  const [formData, setFormData] = useState(schedule || {
    name: '',
    description: '',
    periods: [],
    cameraFilter: 'all', // 'all' or 'specific'
    cameraIds: [] // Array of camera IDs when cameraFilter is 'specific'
  })
  const [editingPeriod, setEditingPeriod] = useState(null)
  const [showAddPeriod, setShowAddPeriod] = useState(false)

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  const handleToggleCamera = (cameraId) => {
    if (formData.cameraIds.includes(cameraId)) {
      setFormData({
        ...formData,
        cameraIds: formData.cameraIds.filter(id => id !== cameraId)
      })
    } else {
      setFormData({
        ...formData,
        cameraIds: [...formData.cameraIds, cameraId]
      })
    }
  }

  const handleAddPeriod = () => {
    setEditingPeriod({
      days: [],
      start_time: '00:00',
      end_time: '23:59'
    })
    setShowAddPeriod(true)
  }

  const handleSavePeriod = () => {
    if (editingPeriod.days.length === 0) {
      toast.error('Please select at least one day')
      return
    }
    setFormData({
      ...formData,
      periods: [...formData.periods, editingPeriod]
    })
    setEditingPeriod(null)
    setShowAddPeriod(false)
  }

  const handleRemovePeriod = (index) => {
    setFormData({
      ...formData,
      periods: formData.periods.filter((_, i) => i !== index)
    })
  }

  const handleToggleDay = (day) => {
    if (editingPeriod.days.includes(day)) {
      setEditingPeriod({
        ...editingPeriod,
        days: editingPeriod.days.filter(d => d !== day)
      })
    } else {
      setEditingPeriod({
        ...editingPeriod,
        days: [...editingPeriod.days, day]
      })
    }
  }

  const handleSave = async () => {
    console.log('handleSave called in ScheduleModal')
    if (!formData.name) {
      toast.error('Please enter a schedule name')
      return
    }
    if (formData.cameraFilter === 'specific' && formData.cameraIds.length === 0) {
      toast.error('Please select at least one camera or choose "All Cameras"')
      return
    }
    console.log('Calling onSave with:', { ...formData, id: schedule?.id })
    try {
      await onSave({ ...formData, id: schedule?.id })
    } catch (error) {
      console.error('Error in handleSave:', error)
    }
  }

  return (
    <div style={styles.modalOverlay}>
      <div style={{...styles.modal, maxWidth: '700px'}}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            {schedule ? 'Edit Schedule' : 'Create Schedule'}
          </h2>
          <button onClick={onClose} style={styles.modalClose}>
            <X size={24} />
          </button>
        </div>

        <div style={styles.modalForm}>
          <div>
            <label style={styles.label}>Schedule Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={styles.input}
              placeholder="e.g., Weekend Schedule"
            />
          </div>

          <div>
            <label style={styles.label}>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              style={styles.textarea}
              placeholder="Optional description..."
            />
          </div>

          {/* Camera Selection */}
          <div>
            <label style={styles.label}>Apply to Cameras *</label>
            <div style={{marginBottom: '0.75rem'}}>
              <label style={{...styles.radioLabel, marginRight: '1.5rem'}}>
                <input
                  type="radio"
                  checked={formData.cameraFilter === 'all'}
                  onChange={() => setFormData({ ...formData, cameraFilter: 'all', cameraIds: [] })}
                  style={styles.radio}
                />
                <span style={{marginLeft: '0.5rem'}}>All Cameras</span>
              </label>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  checked={formData.cameraFilter === 'specific'}
                  onChange={() => setFormData({ ...formData, cameraFilter: 'specific' })}
                  style={styles.radio}
                />
                <span style={{marginLeft: '0.5rem'}}>Specific Cameras</span>
              </label>
            </div>

            {formData.cameraFilter === 'specific' && (
              <div style={styles.cameraSelectionGrid}>
                {cameras.map(camera => (
                  <label key={camera.id} style={styles.cameraCheckboxLabel}>
                    <input
                      type="checkbox"
                      checked={formData.cameraIds.includes(camera.id)}
                      onChange={() => handleToggleCamera(camera.id)}
                      style={styles.checkbox}
                    />
                    <span style={{marginLeft: '0.5rem'}}>{camera.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem'}}>
              <label style={styles.label}>Disarm Periods</label>
              <button onClick={handleAddPeriod} style={styles.addContactBtn}>
                <Plus size={16} />
                <span>Add Period</span>
              </button>
            </div>

            {formData.periods.length > 0 && (
              <div style={styles.periodsList}>
                {formData.periods.map((period, index) => (
                  <div key={index} style={styles.periodItem}>
                    <div style={styles.periodInfo}>
                      <div style={styles.periodDays}>{period.days.join(', ')}</div>
                      <div style={styles.periodTime}>
                        {period.start_time} - {period.end_time}
                      </div>
                    </div>
                    <button onClick={() => handleRemovePeriod(index)} style={styles.removeBtn}>
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showAddPeriod && editingPeriod && (
              <div style={styles.periodEditor}>
                <div>
                  <label style={styles.label}>Select Days</label>
                  <div style={styles.daysGrid}>
                    {daysOfWeek.map(day => (
                      <button
                        key={day}
                        onClick={() => handleToggleDay(day)}
                        style={{
                          ...styles.dayButton,
                          ...(editingPeriod.days.includes(day) ? styles.dayButtonActive : {})
                        }}
                      >
                        {day.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={styles.timeRow}>
                  <div style={{flex: 1}}>
                    <label style={styles.label}>Start Time</label>
                    <input
                      type="time"
                      value={editingPeriod.start_time}
                      onChange={(e) => setEditingPeriod({ ...editingPeriod, start_time: e.target.value })}
                      style={styles.input}
                    />
                  </div>
                  <div style={{flex: 1}}>
                    <label style={styles.label}>End Time</label>
                    <input
                      type="time"
                      value={editingPeriod.end_time}
                      onChange={(e) => setEditingPeriod({ ...editingPeriod, end_time: e.target.value })}
                      style={styles.input}
                    />
                  </div>
                </div>

                <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'flex-end'}}>
                  <button
                    onClick={() => {
                      setShowAddPeriod(false)
                      setEditingPeriod(null)
                    }}
                    style={styles.cancelBtn}
                  >
                    Cancel
                  </button>
                  <button onClick={handleSavePeriod} style={styles.saveBtn}>
                    Add Period
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={styles.modalActions}>
            <button onClick={onClose} style={styles.cancelBtn}>
              Cancel
            </button>
            <button onClick={handleSave} style={styles.saveBtn}>
              {schedule ? 'Update Schedule' : 'Create Schedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Global map to track which streams are running (persists across component remounts)
const activeStreams = new Map()

// Live View Modal
function LiveViewModal({ camera, account, pbxConfig, isRegistered, makeCall, remoteAudioRef, onClose }) {
  console.log('🟢 LiveViewModal MOUNTED - Camera:', camera.id, camera.name, 'Active stream?', activeStreams.has(camera.id))

  const [streamUrl, setStreamUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeCall, setActiveCall] = useState(null)
  const videoRef = useRef(null)
  const hlsRef = useRef(null)

  useEffect(() => {
    console.log('🔵 LiveViewModal useEffect RUNNING - Camera:', camera.id, 'Active?', activeStreams.has(camera.id))

    // Prevent multiple stream starts using global map
    if (activeStreams.has(camera.id)) {
      console.log('⏭️  Stream already active for camera', camera.id, 'skipping start')
      return
    }

    activeStreams.set(camera.id, true)
    let isMounted = true
    let pollInterval = null

    const startStream = async () => {
      console.log('🚀 Starting stream for camera:', camera.id)
      setLoading(true)
      setError(null)
      try {
        const response = await api.post(`/cameras/${camera.id}/start-stream?quality=low`)

        if (response.data.stream_url) {
          if (isMounted) {
            setStreamUrl(response.data.stream_url)
            setLoading(false)
          }
        } else {
          // Stream started but playlist not ready yet, poll for status
          pollInterval = setInterval(async () => {
            try {
              const statusResponse = await api.get(`/cameras/${camera.id}/stream-status`)
              if (statusResponse.data.stream_url && isMounted) {
                setStreamUrl(statusResponse.data.stream_url)
                setLoading(false)
                clearInterval(pollInterval)
              }
            } catch (err) {
              console.error('Failed to check stream status:', err)
            }
          }, 1000) // Poll every second

          // Timeout after 15 seconds
          setTimeout(() => {
            if (isMounted && !streamUrl) {
              setError('Stream took too long to start')
              setLoading(false)
              if (pollInterval) clearInterval(pollInterval)
            }
          }, 15000)
        }
      } catch (err) {
        console.error('Failed to start stream:', err)
        if (isMounted) {
          setError('Failed to start camera stream')
          setLoading(false)
        }
      }
    }

    startStream()

    // Cleanup: clear intervals only (stream will be stopped by parent onClose)
    return () => {
      console.log('🟡 LiveViewModal cleanup running - clearing intervals only')
      isMounted = false
      if (pollInterval) clearInterval(pollInterval)
      // NOTE: Stream is stopped by parent's onClose handler, not here
      // This prevents stopping the stream when React StrictMode causes re-mounts
    }
  }, [])

  // Load HLS.js when streamUrl becomes available
  useEffect(() => {
    if (!streamUrl || !videoRef.current) return

    console.log('🎬 Loading HLS stream:', streamUrl)

    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: true,
        maxBufferLength: 10,
        maxMaxBufferLength: 20,
        maxBufferSize: 10 * 1000 * 1000,
        maxBufferHole: 0.5,
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 4,
        startPosition: -1, // Start from live edge
      })
      hlsRef.current = hls

      hls.loadSource(streamUrl)
      hls.attachMedia(videoRef.current)

      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        console.log('✅ HLS manifest parsed, playing video')
        videoRef.current.play().catch(e => console.error('Play failed:', e))
      })

      hls.on(window.Hls.Events.ERROR, (event, data) => {
        console.error('HLS error:', data)
        if (data.fatal) {
          setError(`HLS Error: ${data.details}`)
        }
      })
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS support
      console.log('Using native HLS support (Safari)')
      videoRef.current.src = streamUrl
      videoRef.current.play().catch(e => console.error('Play failed:', e))
    } else {
      setError('HLS is not supported in this browser')
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [streamUrl])

  const handleOverlayClick = (e) => {
    // Only close if clicking directly on the overlay, not its children
    if (e.target === e.currentTarget) {
      console.log('🔴 LiveViewModal - Overlay clicked, closing modal')
      onClose()
    }
  }

  const handleDialInboundNumber = () => {
    const inboundNumber = camera.inbound_phone_number || account?.inbound_phone_number
    if (!inboundNumber) {
      toast.error('No inbound phone number configured')
      return
    }

    if (!isRegistered) {
      toast.error('Phone not registered. Please check your connection.')
      return
    }

    console.log(`[Inbound Call] Dialing ${inboundNumber} for ${camera.name}`)

    const contact = {
      name: `${camera.name} - Inbound`,
      phone: inboundNumber
    }

    // Create event handlers for proper audio setup
    const eventHandlers = {
      'progress': () => {
        console.log('[Inbound Call] Call ringing...')
        setActiveCall({ ...activeCall, callState: 'ringing' })
      },
      'confirmed': () => {
        console.log('[Inbound Call] Call connected!')
        toast.success(`Connected to ${camera.name}`)
        setActiveCall({ ...activeCall, callState: 'connected' })
      },
      'ended': () => {
        console.log('[Inbound Call] Call ended')
        setActiveCall(null)
      },
      'failed': (e) => {
        console.error('[Inbound Call] Call failed:', e)
        toast.error(`Failed to connect to ${camera.name}`)
        setActiveCall(null)
      },
      'peerconnection': (e) => {
        console.log('[Inbound Call] Peer connection event - setting up audio streams')
        const peerconnection = e.peerconnection

        peerconnection.addEventListener('addstream', (event) => {
          console.log('[Inbound Call] addstream event fired')
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = event.stream
            remoteAudioRef.current.play().catch(err => {
              console.error('[Inbound Call] Audio playback error:', err)
            })
            console.log('[Inbound Call] Remote audio stream attached via addstream')
          }
        })

        peerconnection.addEventListener('track', (event) => {
          console.log('[Inbound Call] track event fired')
          if (remoteAudioRef.current && event.streams && event.streams[0]) {
            remoteAudioRef.current.srcObject = event.streams[0]
            remoteAudioRef.current.play().catch(err => {
              console.error('[Inbound Call] Audio playback error:', err)
            })
            console.log('[Inbound Call] Remote audio stream attached via track')
          }
        })
      }
    }

    // Dial the number through WebRTC WITH event handlers
    const session = makeCall(inboundNumber, pbxConfig, eventHandlers)

    if (session) {
      console.log(`[Inbound Call] Initiated WebRTC call to ${inboundNumber}`)
      toast.success(`Dialing ${camera.name}...`)

      setActiveCall({
        session,
        callState: 'connecting',
        contact
      })
    } else {
      console.error('[Inbound Call] Failed to initiate call - makeCall returned null')
      toast.error('Failed to initiate call. Please check your phone connection.')
    }
  }

  const handleHangup = () => {
    if (activeCall && activeCall.session) {
      try {
        activeCall.session.terminate()
      } catch (e) {
        console.error('Error terminating call:', e)
      }
    }
    setActiveCall(null)
    toast.success('Call ended')
  }

  const inboundNumber = camera.inbound_phone_number || account?.inbound_phone_number

  return (
    <div style={styles.modalOverlay} onClick={handleOverlayClick}>
      <div style={styles.liveViewModal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div>
            <h2 style={styles.modalTitle}>{camera.name}</h2>
            {camera.location && (
              <p style={styles.liveViewSubtitle}>{camera.location}</p>
            )}
          </div>
          <div style={{display: 'flex', gap: '0.75rem', alignItems: 'center'}}>
            {inboundNumber && (
              activeCall ? (
                <button
                  onClick={handleHangup}
                  style={{
                    ...styles.callPhoneBtn,
                    background: activeCall.callState === 'connected' ? '#ef4444' : '#f59e0b'
                  }}
                  title={activeCall.callState === 'connected' ? 'Hang up' : 'Calling...'}
                >
                  <Phone size={18} />
                  <span style={{fontSize: '0.875rem', marginLeft: '0.5rem'}}>
                    {activeCall.callState === 'connected' ? 'Hang Up' : 'Calling...'}
                  </span>
                </button>
              ) : (
                <button
                  onClick={handleDialInboundNumber}
                  style={styles.callPhoneBtn}
                  title={`Call ${inboundNumber}`}
                >
                  <Phone size={18} />
                </button>
              )
            )}
            <button onClick={onClose} style={styles.modalClose}>
              <X size={24} />
            </button>
          </div>
        </div>

        <div style={styles.liveViewContainer}>
          {loading ? (
            <div style={styles.liveViewLoading}>
              <div style={styles.spinner}></div>
              <p style={{color: '#94a3b8', marginTop: '1rem'}}>Starting live stream...</p>
            </div>
          ) : error ? (
            <div style={styles.liveViewError}>
              <div style={{fontSize: '3rem', marginBottom: '1rem'}}>⚠️</div>
              <p style={{color: '#ef4444', fontSize: '1rem'}}>{error}</p>
              <p style={{color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.5rem'}}>
                Make sure the camera RTSP URL is configured correctly
              </p>
            </div>
          ) : streamUrl ? (
            <video
              ref={videoRef}
              style={styles.liveViewVideo}
              controls
              autoPlay
              muted
              playsInline
            />

          ) : (
            <div style={styles.liveViewError}>
              <p style={{color: '#94a3b8'}}>No stream available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// All Live View Modal - Grid view of all camera streams
function AllLiveViewModal({ cameras, onClose }) {
  const [streamUrls, setStreamUrls] = useState({})
  const [loading, setLoading] = useState({})
  const [errors, setErrors] = useState({})
  const videoRefs = useRef({})
  const hlsRefs = useRef({})

  useEffect(() => {
    // Start all streams
    cameras.forEach(async (camera) => {
      if (activeStreams.has(camera.id)) {
        console.log('⏭️  Stream already active for camera', camera.id)
        return
      }

      activeStreams.set(camera.id, true)
      setLoading(prev => ({ ...prev, [camera.id]: true }))

      try {
        const response = await api.post(`/cameras/${camera.id}/start-stream?quality=low`)

        if (response.data.stream_url) {
          setStreamUrls(prev => ({ ...prev, [camera.id]: response.data.stream_url }))
          setLoading(prev => ({ ...prev, [camera.id]: false }))
        } else {
          // Poll for stream status
          const pollInterval = setInterval(async () => {
            try {
              const statusResponse = await api.get(`/cameras/${camera.id}/stream-status`)
              if (statusResponse.data.stream_url) {
                setStreamUrls(prev => ({ ...prev, [camera.id]: statusResponse.data.stream_url }))
                setLoading(prev => ({ ...prev, [camera.id]: false }))
                clearInterval(pollInterval)
              }
            } catch (err) {
              console.error('Failed to check stream status:', err)
            }
          }, 1000)

          setTimeout(() => {
            if (!streamUrls[camera.id]) {
              setErrors(prev => ({ ...prev, [camera.id]: 'Timeout' }))
              setLoading(prev => ({ ...prev, [camera.id]: false }))
              clearInterval(pollInterval)
            }
          }, 15000)
        }
      } catch (err) {
        console.error('Failed to start stream for camera', camera.id, err)
        setErrors(prev => ({ ...prev, [camera.id]: 'Failed to start' }))
        setLoading(prev => ({ ...prev, [camera.id]: false }))
      }
    })

    return () => {
      // Cleanup HLS instances
      Object.values(hlsRefs.current).forEach(hls => {
        if (hls) {
          hls.destroy()
        }
      })
    }
  }, [])

  // Load HLS for each camera
  useEffect(() => {
    Object.entries(streamUrls).forEach(([cameraId, url]) => {
      const videoElement = videoRefs.current[cameraId]
      if (!videoElement || !url) return

      if (window.Hls && window.Hls.isSupported()) {
        if (hlsRefs.current[cameraId]) {
          hlsRefs.current[cameraId].destroy()
        }

        const hls = new window.Hls({
          debug: false,
          enableWorker: true,
          lowLatencyMode: true,
          maxBufferLength: 10,
          maxMaxBufferLength: 20,
        })
        hlsRefs.current[cameraId] = hls

        hls.loadSource(url)
        hls.attachMedia(videoElement)

        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          videoElement.play()
        })

        hls.on(window.Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.error('HLS fatal error for camera', cameraId, data)
          }
        })
      } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        videoElement.src = url
        videoElement.play()
      }
    })
  }, [streamUrls])

  const gridCols = cameras.length === 1 ? 1 : cameras.length === 2 ? 2 : cameras.length <= 4 ? 2 : 3

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.95)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '2rem'
    }}>
      <div style={{
        width: '100%',
        height: '100%',
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 1rem'
        }}>
          <h2 style={{ color: 'white', margin: 0 }}>All Camera Streams ({cameras.length})</h2>
          <button
            onClick={onClose}
            style={{
              background: '#ef4444',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              color: 'white',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <X size={20} />
            Close All
          </button>
        </div>

        {/* Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          gap: '1rem',
          flex: 1,
          overflow: 'auto'
        }}>
          {cameras.map((camera) => (
            <div key={camera.id} style={{
              background: '#1e293b',
              borderRadius: '0.5rem',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{
                padding: '0.75rem 1rem',
                background: '#0f172a',
                borderBottom: '1px solid #334155'
              }}>
                <h3 style={{ color: 'white', margin: 0, fontSize: '1rem' }}>{camera.name}</h3>
              </div>
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#000',
                position: 'relative',
                minHeight: '200px'
              }}>
                {loading[camera.id] ? (
                  <div style={{ color: 'white', textAlign: 'center' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      border: '4px solid #334155',
                      borderTop: '4px solid #3b82f6',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      margin: '0 auto 1rem'
                    }}></div>
                    <p>Starting stream...</p>
                  </div>
                ) : errors[camera.id] ? (
                  <div style={{ color: '#ef4444', textAlign: 'center' }}>
                    <p>Error: {errors[camera.id]}</p>
                  </div>
                ) : streamUrls[camera.id] ? (
                  <video
                    ref={el => videoRefs.current[camera.id] = el}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain'
                    }}
                    controls
                    muted
                    playsInline
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Styles
const styles = {
  container: {
    padding: '1.5rem',
    width: '100%'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    gap: '1rem'
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
    marginBottom: '1.5rem'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  backBtn: {
    padding: '0.5rem',
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    borderRadius: '0.5rem',
    transition: 'background 0.2s'
  },
  title: {
    fontSize: '1.875rem',
    fontWeight: '700',
    color: '#e2e8f0',
    marginBottom: '0.25rem'
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '0.875rem'
  },
  headerActions: {
    display: 'flex',
    gap: '0.75rem'
  },
  editBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.75rem 1.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer'
  },
  deleteBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#ef4444',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.75rem 1.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer'
  },
  cancelBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#475569',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.75rem 1.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer'
  },
  saveBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.75rem 1.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer'
  },
  tabsContainer: {
    borderBottom: '1px solid #334155',
    marginBottom: '1.5rem'
  },
  tabs: {
    display: 'flex',
    gap: '2rem'
  },
  tab: {
    paddingBottom: '1rem',
    paddingLeft: '0.25rem',
    paddingRight: '0.25rem',
    borderBottom: '2px solid transparent',
    background: 'transparent',
    border: 'none',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#94a3b8',
    cursor: 'pointer',
    transition: 'color 0.2s'
  },
  tabActive: {
    borderBottom: '2px solid #3b82f6',
    color: '#3b82f6'
  },
  content: {
    width: '100%'
  },
  tabContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem'
  },
  card: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    border: '1px solid #334155'
  },
  cardTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: '1rem'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem'
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1rem'
  },
  formGridCompact: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: '1rem'
  },
  label: {
    display: 'block',
    fontSize: '1rem',
    fontWeight: '500',
    color: '#94a3b8',
    marginBottom: '0.5rem'
  },
  input: {
    width: '100%',
    padding: '0.5rem 1rem',
    background: '#0f172a',
    color: '#e2e8f0',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    outline: 'none'
  },
  select: {
    width: '100%',
    padding: '0.5rem 1rem',
    background: '#0f172a',
    color: '#e2e8f0',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    outline: 'none',
    cursor: 'pointer'
  },
  textarea: {
    width: '100%',
    padding: '0.75rem 1rem',
    background: '#0f172a',
    color: '#e2e8f0',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit'
  },
  value: {
    color: '#e2e8f0',
    fontSize: '1rem'
  },
  contactsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  contactCard: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    border: '1px solid #334155'
  },
  contactHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
    paddingBottom: '0.75rem',
    borderBottom: '1px solid #334155'
  },
  contactName: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: '#e2e8f0',
    margin: 0
  },
  contactRemove: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: '0.5rem'
  },
  removeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#ef4444',
    cursor: 'pointer',
    padding: '0.25rem'
  },
  addContactBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.5rem 0.75rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  emptyText: {
    color: '#94a3b8',
    textAlign: 'center'
  },
  notesText: {
    color: '#e2e8f0',
    whiteSpace: 'pre-wrap'
  },
  cameraHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem'
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.75rem 1.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer'
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '2rem',
    textAlign: 'center'
  },
  emptySubtext: {
    fontSize: '0.875rem',
    color: '#64748b',
    marginTop: '0.5rem'
  },
  camerasGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '1rem'
  },
  cameraCard: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '0.75rem',
    padding: '1rem'
  },
  cameraHeader2: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem'
  },
  cameraTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  cameraName: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#e2e8f0'
  },
  cameraActions: {
    display: 'flex',
    gap: '0.5rem'
  },
  iconBtn: {
    background: '#334155',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.5rem',
    color: '#e2e8f0',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center'
  },
  iconBtnRed: {
    background: '#334155',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.5rem',
    color: '#ef4444',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center'
  },
  cameraDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  cameraDetail: {
    fontSize: '0.875rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  detailLabel: {
    color: '#94a3b8'
  },
  detailValue: {
    color: '#e2e8f0'
  },
  emailContainer: {
    fontSize: '0.875rem'
  },
  emailRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '0.25rem'
  },
  emailCode: {
    fontSize: '0.75rem',
    background: '#0f172a',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    color: '#60a5fa',
    flex: 1
  },
  copyBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '0.25rem',
    display: 'flex',
    alignItems: 'center'
  },
  cameraThumbnail: {
    position: 'relative',
    width: '100%',
    height: '180px',
    background: '#0f172a',
    borderRadius: '0.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '0.75rem',
    overflow: 'hidden'
  },
  cameraThumbnailClickable: {
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s'
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  thumbnailLoading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem'
  },
  thumbnailEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem'
  },
  thumbnailText: {
    fontSize: '0.75rem',
    color: '#64748b'
  },
  smallSpinner: {
    width: '24px',
    height: '24px',
    border: '3px solid #334155',
    borderTop: '3px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  refreshBtn: {
    position: 'absolute',
    bottom: '0.5rem',
    right: '0.5rem',
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid #334155',
    borderRadius: '0.375rem',
    padding: '0.5rem',
    color: '#e2e8f0',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    backdropFilter: 'blur(4px)'
  },
  snoozeDesc: {
    color: '#94a3b8',
    marginBottom: '1.5rem',
    fontSize: '0.875rem'
  },
  snoozeStatus: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#0f172a',
    borderRadius: '0.5rem',
    padding: '1rem'
  },
  snoozeStatusTitle: {
    fontWeight: '500',
    color: '#e2e8f0',
    marginBottom: '0.25rem'
  },
  snoozedText: {
    fontSize: '0.875rem',
    color: '#fb923c',
    display: 'flex',
    alignItems: 'center'
  },
  activeText: {
    fontSize: '0.875rem',
    color: '#10b981',
    display: 'flex',
    alignItems: 'center'
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    padding: '1rem'
  },
  modal: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    maxWidth: '500px',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem'
  },
  modalTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#e2e8f0'
  },
  modalClose: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '0.25rem',
    display: 'flex',
    alignItems: 'center'
  },
  callPhoneBtn: {
    background: '#10b981',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.5rem 0.75rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    outline: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s'
  },
  modalForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    marginTop: '1.5rem'
  },
  liveViewModal: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    maxWidth: '800px',
    width: '60vw',
    maxHeight: '70vh',
    display: 'flex',
    flexDirection: 'column'
  },
  liveViewSubtitle: {
    color: '#94a3b8',
    fontSize: '0.875rem',
    marginTop: '0.25rem'
  },
  liveViewContainer: {
    flex: 1,
    background: '#0f172a',
    borderRadius: '0.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    overflow: 'hidden'
  },
  liveViewVideo: {
    width: '100%',
    height: '100%',
    maxHeight: '50vh',
    objectFit: 'contain'
  },
  liveViewLoading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem'
  },
  liveViewError: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    textAlign: 'center'
  },
  armDisarmDesc: {
    color: '#94a3b8',
    fontSize: '0.875rem',
    marginTop: '0.25rem'
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: '1rem'
  },
  schedulesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  scheduleCard: {
    background: '#0f172a',
    borderRadius: '0.5rem',
    padding: '1rem',
    border: '1px solid #334155'
  },
  scheduleHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '0.75rem'
  },
  scheduleName: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: '#e2e8f0',
    margin: 0
  },
  scheduleDesc: {
    fontSize: '0.875rem',
    color: '#94a3b8',
    marginTop: '0.25rem'
  },
  scheduleActions: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center'
  },
  assignAllBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.5rem 0.75rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  schedulePeriods: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem'
  },
  periodChip: {
    display: 'inline-flex',
    alignItems: 'center',
    background: '#334155',
    color: '#e2e8f0',
    fontSize: '0.75rem',
    padding: '0.375rem 0.75rem',
    borderRadius: '0.375rem'
  },
  cameraAssignmentsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  cameraAssignment: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155'
  },
  cameraAssignmentInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flex: 1
  },
  cameraAssignmentName: {
    fontSize: '0.875rem',
    color: '#e2e8f0',
    fontWeight: '500'
  },
  assignedScheduleBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    background: '#1e40af',
    color: '#93c5fd',
    fontSize: '0.75rem',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    marginLeft: '0.5rem'
  },
  periodsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '1rem'
  },
  periodItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155'
  },
  periodInfo: {
    flex: 1
  },
  periodDays: {
    fontSize: '0.875rem',
    color: '#e2e8f0',
    fontWeight: '500'
  },
  periodTime: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    marginTop: '0.25rem'
  },
  periodEditor: {
    background: '#0f172a',
    borderRadius: '0.5rem',
    padding: '1rem',
    border: '1px solid #334155',
    marginTop: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  daysGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '0.5rem'
  },
  dayButton: {
    padding: '0.5rem',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '0.375rem',
    color: '#94a3b8',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  dayButtonActive: {
    background: '#3b82f6',
    borderColor: '#3b82f6',
    color: '#fff'
  },
  timeRow: {
    display: 'flex',
    gap: '1rem'
  },
  radioLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    cursor: 'pointer'
  },
  radio: {
    cursor: 'pointer'
  },
  checkbox: {
    cursor: 'pointer'
  },
  cameraSelectionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '0.5rem',
    padding: '1rem',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155',
    maxHeight: '200px',
    overflowY: 'auto'
  },
  cameraCheckboxLabel: {
    display: 'flex',
    alignItems: 'center',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    cursor: 'pointer',
    padding: '0.5rem',
    borderRadius: '0.375rem',
    transition: 'background 0.2s'
  },
  scheduleInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  scheduleMetaLabel: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    fontWeight: '600'
  },
  scheduleMetaValue: {
    fontSize: '0.875rem',
    color: '#e2e8f0'
  },
  cameraStatusList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  cameraStatusCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155'
  },
  cameraStatusInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  cameraStatusHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  cameraStatusName: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#e2e8f0',
    flex: 1
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.375rem 0.75rem',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: '700',
    letterSpacing: '0.025em'
  },
  statusArmed: {
    background: '#065f46',
    color: '#6ee7b7'
  },
  statusDisarmed: {
    background: '#7c2d12',
    color: '#fca5a5'
  },
  cameraStatusDetails: {
    paddingLeft: '1.625rem'
  },
  statusNote: {
    fontSize: '0.875rem',
    color: '#94a3b8'
  },
  cameraStatusActions: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center'
  },
  clearOverrideBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    background: '#475569',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.5rem 0.75rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  armBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    background: '#334155',
    border: '1px solid #dc2626',
    borderRadius: '0.375rem',
    padding: '0.5rem 0.75rem',
    color: '#dc2626',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  armBtnActive: {
    background: '#dc2626',
    color: '#fff',
    borderColor: '#dc2626'
  },
  disarmBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    background: '#334155',
    border: '1px solid #10b981',
    borderRadius: '0.375rem',
    padding: '0.5rem 0.75rem',
    color: '#10b981',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  disarmBtnActive: {
    background: '#10b981',
    color: '#fff',
    borderColor: '#10b981'
  },
  bulkArmBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#dc2626',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.75rem 1.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  bulkDisarmBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.75rem 1.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  cameraGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '0.75rem',
    marginBottom: '1rem'
  },
  cameraRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem',
    background: '#0f172a',
    borderRadius: '0.375rem',
    border: '1px solid #334155'
  },
  cameraNameInline: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    flex: '1',
    minWidth: 0
  },
  cameraNameText: {
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#e2e8f0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  statusBadgeInline: {
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.65rem',
    fontWeight: '700',
    letterSpacing: '0.025em',
    textAlign: 'center',
    minWidth: '65px'
  },
  cameraRowActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem'
  },
  armBtnInline: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#475569',
    border: '1px solid #64748b',
    borderRadius: '0.25rem',
    padding: '0.375rem',
    color: '#94a3b8',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minWidth: '32px'
  },
  armBtnArmed: {
    background: '#dc2626',
    border: '1px solid #dc2626',
    color: '#fff'
  },
  disarmBtnInline: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#475569',
    border: '1px solid #64748b',
    borderRadius: '0.25rem',
    padding: '0.375rem',
    color: '#94a3b8',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minWidth: '32px'
  },
  disarmBtnDisarmed: {
    background: '#10b981',
    border: '1px solid #10b981',
    color: '#fff'
  },
  clearOverrideBtnInline: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#475569',
    border: 'none',
    borderRadius: '0.25rem',
    padding: '0.375rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
    minWidth: '32px'
  },
  accountSnoozeSection: {
    marginTop: '1.5rem',
    padding: '1rem',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155'
  },
  accountSnoozeLabel: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: '0.75rem'
  }
}

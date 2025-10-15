import React, { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import { Shield, User, Phone, Mail, Key, QrCode, CheckCircle, XCircle } from 'lucide-react'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'

export default function Profile() {
  const { user, setUser } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [twoFactorMethod, setTwoFactorMethod] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [totpSecret, setTotpSecret] = useState('')
  const [showSetup, setShowSetup] = useState(false)
  const [phoneDialingEnabled, setPhoneDialingEnabled] = useState(false)

  useEffect(() => {
    if (user) {
      setPhoneNumber(user.phone_number || '')
      setPhoneDialingEnabled(user.phone_dialing_enabled !== false)
    }
  }, [user])

  const handleSetup2FA = async (method) => {
    setLoading(true)
    try {
      const payload = { method }

      if (method === 'sms' && !phoneNumber) {
        toast.error('Please enter a phone number first')
        setLoading(false)
        return
      }

      if (method === 'sms') {
        payload.phone_number = phoneNumber
      }

      const response = await api.post('/api/2fa/setup', payload)

      if (method === 'totp') {
        setQrCode(response.data.qr_code)
        setTotpSecret(response.data.secret)
      }

      setTwoFactorMethod(method)
      setShowSetup(true)

      // Refresh user data
      const userResponse = await api.get('/api/users/me')
      setUser(userResponse.data)
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to setup 2FA')
    } finally {
      setLoading(false)
    }
  }

  const handleDisable2FA = async () => {
    if (!window.confirm('Are you sure you want to disable two-factor authentication?')) {
      return
    }

    setLoading(true)
    try {
      await api.post('/api/2fa/disable')
      setShowSetup(false)
      setQrCode('')
      setTotpSecret('')
      setVerificationCode('')

      // Refresh user data
      const userResponse = await api.get('/api/users/me')
      setUser(userResponse.data)
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to disable 2FA')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdatePhone = async () => {
    setLoading(true)
    try {
      // Update phone via user update endpoint
      const response = await api.put(`/api/users/${user.id}`, {
        ...user,
        phone_number: phoneNumber
      })

      setUser(response.data)
      toast.success('Phone number updated successfully')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update phone number')
    } finally {
      setLoading(false)
    }
  }

  const handleTogglePhoneDialing = async () => {
    setLoading(true)
    try {
      const newValue = !phoneDialingEnabled
      const response = await api.put(`/api/users/${user.id}`, {
        ...user,
        phone_dialing_enabled: newValue
      })

      setUser(response.data)
      setPhoneDialingEnabled(newValue)
      toast.success(`Phone dialing ${newValue ? 'enabled' : 'disabled'} successfully`)
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update phone dialing setting')
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return <div style={styles.container}>Loading...</div>
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <User size={32} color="#3b82f6" />
          <div>
            <h1 style={styles.title}>Profile & Security</h1>
            <p style={styles.subtitle}>Manage your account and security settings</p>
          </div>
        </div>
      </div>

      <div style={styles.content}>
        {/* User Info Section */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <User size={24} color="#3b82f6" />
            <h2 style={styles.cardTitle}>User Information</h2>
          </div>
          <div style={styles.infoGrid}>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Username:</span>
              <span style={styles.infoValue}>{user.username}</span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Email:</span>
              <span style={styles.infoValue}>{user.email}</span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Full Name:</span>
              <span style={styles.infoValue}>{user.full_name}</span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Role:</span>
              <span style={styles.infoValue}>{user.role}</span>
            </div>
          </div>
        </div>

        {/* Security Status */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <Shield size={24} color="#3b82f6" />
            <h2 style={styles.cardTitle}>Security Status</h2>
          </div>

          <div style={styles.statusGrid}>
            <div style={styles.statusItem}>
              <div style={styles.statusHeader}>
                <span style={styles.statusLabel}>Two-Factor Authentication</span>
                {user.two_factor_enabled ? (
                  <span style={styles.statusEnabled}>
                    <CheckCircle size={16} /> Enabled
                  </span>
                ) : (
                  <span style={styles.statusDisabled}>
                    <XCircle size={16} /> Disabled
                  </span>
                )}
              </div>
              {user.two_factor_enabled && user.two_factor_method && (
                <p style={styles.statusDetail}>
                  Method: <strong>{user.two_factor_method.toUpperCase()}</strong>
                </p>
              )}
            </div>

            <div style={styles.statusItem}>
              <div style={styles.statusHeader}>
                <span style={styles.statusLabel}>Security Requirement</span>
                {user.require_2fa_or_whitelist ? (
                  <span style={styles.statusEnabled}>
                    <CheckCircle size={16} /> Active
                  </span>
                ) : (
                  <span style={styles.statusWarning}>
                    <XCircle size={16} /> Inactive
                  </span>
                )}
              </div>
              {user.require_2fa_or_whitelist && (
                <p style={styles.statusDetail}>
                  You must use either 2FA or login from a whitelisted IP address
                </p>
              )}
            </div>

            {user.ip_whitelist && user.ip_whitelist.length > 0 && (
              <div style={styles.statusItem}>
                <div style={styles.statusHeader}>
                  <span style={styles.statusLabel}>IP Whitelist</span>
                  <span style={styles.statusValue}>{user.ip_whitelist.length} IPs</span>
                </div>
                <div style={styles.ipList}>
                  {user.ip_whitelist.map((ip, index) => (
                    <span key={index} style={styles.ipTag}>{ip}</span>
                  ))}
                </div>
              </div>
            )}

            {user.last_login_ip && (
              <div style={styles.statusItem}>
                <span style={styles.statusLabel}>Last Login IP:</span>
                <span style={styles.statusValue}>{user.last_login_ip}</span>
              </div>
            )}
          </div>
        </div>

        {/* Phone Number */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <Phone size={24} color="#3b82f6" />
            <h2 style={styles.cardTitle}>Phone Number</h2>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Phone Number (for SMS 2FA)</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1234567890"
                style={{ ...styles.input, flex: 1 }}
              />
              <button
                onClick={handleUpdatePhone}
                disabled={loading || phoneNumber === user.phone_number}
                style={styles.btnPrimary}
              >
                Update
              </button>
            </div>
            <p style={styles.helperText}>Format: +1234567890 (E.164 format)</p>
          </div>
        </div>

        {/* Phone Dialing Feature */}
        {user.sip_extension && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <Phone size={24} color="#3b82f6" />
              <h2 style={styles.cardTitle}>Phone Dialing</h2>
            </div>
            <div style={styles.statusGrid}>
              <div style={styles.statusItem}>
                <div style={styles.statusHeader}>
                  <span style={styles.statusLabel}>Phone Dialing Feature</span>
                  {phoneDialingEnabled ? (
                    <span style={styles.statusEnabled}>
                      <CheckCircle size={16} /> Enabled
                    </span>
                  ) : (
                    <span style={styles.statusDisabled}>
                      <XCircle size={16} /> Disabled
                    </span>
                  )}
                </div>
                <p style={styles.statusDetail}>
                  SIP Extension: <strong>{user.sip_extension}</strong>
                </p>
                <p style={styles.description}>
                  {phoneDialingEnabled
                    ? 'Phone dialing is enabled. You can make calls from the dashboard.'
                    : 'Phone dialing is disabled. Enable it to make calls from the dashboard.'}
                </p>
                <button
                  onClick={handleTogglePhoneDialing}
                  disabled={loading}
                  style={phoneDialingEnabled ? styles.btnDanger : styles.btnPrimary}
                >
                  {phoneDialingEnabled ? 'Disable Phone Dialing' : 'Enable Phone Dialing'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Two-Factor Authentication Setup */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <Key size={24} color="#3b82f6" />
            <h2 style={styles.cardTitle}>Two-Factor Authentication</h2>
          </div>

          {!user.two_factor_enabled ? (
            <div>
              <p style={styles.description}>
                Enhance your account security by enabling two-factor authentication.
                Choose from SMS, Email, or Authenticator App (TOTP).
              </p>

              <div style={styles.methodGrid}>
                <button
                  onClick={() => handleSetup2FA('sms')}
                  disabled={loading || !phoneNumber}
                  style={styles.methodBtn}
                >
                  <Phone size={32} />
                  <h3 style={styles.methodTitle}>SMS</h3>
                  <p style={styles.methodDesc}>Receive codes via text message</p>
                  {!phoneNumber && (
                    <p style={styles.methodWarning}>Phone number required</p>
                  )}
                </button>

                <button
                  onClick={() => handleSetup2FA('email')}
                  disabled={loading}
                  style={styles.methodBtn}
                >
                  <Mail size={32} />
                  <h3 style={styles.methodTitle}>Email</h3>
                  <p style={styles.methodDesc}>Receive codes via email</p>
                </button>

                <button
                  onClick={() => handleSetup2FA('totp')}
                  disabled={loading}
                  style={styles.methodBtn}
                >
                  <QrCode size={32} />
                  <h3 style={styles.methodTitle}>Authenticator App</h3>
                  <p style={styles.methodDesc}>Use Google Authenticator or similar</p>
                </button>
              </div>

              {showSetup && twoFactorMethod === 'totp' && qrCode && (
                <div style={styles.setupBox}>
                  <h3 style={styles.setupTitle}>Scan QR Code</h3>
                  <p style={styles.setupDesc}>
                    Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                  </p>
                  <div style={styles.qrContainer}>
                    <img src={qrCode} alt="QR Code" style={styles.qrCode} />
                  </div>
                  <div style={styles.secretBox}>
                    <p style={styles.secretLabel}>Manual Entry Code:</p>
                    <code style={styles.secretCode}>{totpSecret}</code>
                  </div>
                  <p style={styles.setupNote}>
                    2FA has been enabled. Next time you login, you'll need to enter a code from your authenticator app.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={styles.enabledBox}>
                <CheckCircle size={48} color="#10b981" />
                <h3 style={styles.enabledTitle}>Two-Factor Authentication Enabled</h3>
                <p style={styles.enabledDesc}>
                  Your account is protected with {user.two_factor_method?.toUpperCase()} two-factor authentication.
                </p>
              </div>

              <button
                onClick={handleDisable2FA}
                disabled={loading}
                style={styles.btnDanger}
              >
                Disable 2FA
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1200px',
    margin: '0 auto'
  },
  header: {
    marginBottom: '2rem'
  },
  headerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  title: {
    fontSize: '2rem',
    fontWeight: '700',
    color: '#e2e8f0',
    marginBottom: '0.25rem'
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '1rem'
  },
  content: {
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
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1.5rem'
  },
  cardTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#e2e8f0'
  },
  infoGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.75rem',
    background: '#0f172a',
    borderRadius: '0.5rem'
  },
  infoLabel: {
    color: '#94a3b8',
    fontWeight: '500'
  },
  infoValue: {
    color: '#e2e8f0',
    fontWeight: '500'
  },
  statusGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  statusItem: {
    padding: '1rem',
    background: '#0f172a',
    borderRadius: '0.5rem'
  },
  statusHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem'
  },
  statusLabel: {
    color: '#cbd5e1',
    fontWeight: '500'
  },
  statusValue: {
    color: '#e2e8f0',
    fontWeight: '600'
  },
  statusDetail: {
    color: '#94a3b8',
    fontSize: '0.875rem',
    marginTop: '0.5rem'
  },
  statusEnabled: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    color: '#10b981',
    fontWeight: '600',
    fontSize: '0.875rem'
  },
  statusDisabled: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    color: '#ef4444',
    fontWeight: '600',
    fontSize: '0.875rem'
  },
  statusWarning: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    color: '#f59e0b',
    fontWeight: '600',
    fontSize: '0.875rem'
  },
  ipList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginTop: '0.5rem'
  },
  ipTag: {
    background: '#334155',
    color: '#e2e8f0',
    padding: '0.25rem 0.75rem',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    fontFamily: 'monospace'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  label: {
    color: '#cbd5e1',
    fontWeight: '500',
    fontSize: '0.9rem'
  },
  input: {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    padding: '0.75rem 1rem',
    color: '#e2e8f0',
    fontSize: '1rem',
    outline: 'none'
  },
  helperText: {
    color: '#64748b',
    fontSize: '0.875rem',
    margin: 0
  },
  description: {
    color: '#94a3b8',
    marginBottom: '1.5rem',
    lineHeight: '1.5'
  },
  methodGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginBottom: '1.5rem'
  },
  methodBtn: {
    background: '#0f172a',
    border: '2px solid #334155',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'center',
    color: '#e2e8f0',
    ':hover': {
      borderColor: '#3b82f6'
    }
  },
  methodTitle: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: '#e2e8f0',
    margin: '0.5rem 0'
  },
  methodDesc: {
    color: '#94a3b8',
    fontSize: '0.875rem',
    margin: 0
  },
  methodWarning: {
    color: '#f59e0b',
    fontSize: '0.75rem',
    marginTop: '0.5rem'
  },
  setupBox: {
    background: '#0f172a',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    border: '1px solid #334155'
  },
  setupTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: '0.5rem'
  },
  setupDesc: {
    color: '#94a3b8',
    marginBottom: '1rem'
  },
  qrContainer: {
    display: 'flex',
    justifyContent: 'center',
    padding: '1rem',
    background: '#fff',
    borderRadius: '0.5rem',
    marginBottom: '1rem'
  },
  qrCode: {
    maxWidth: '256px',
    width: '100%',
    height: 'auto'
  },
  secretBox: {
    background: '#1e293b',
    padding: '1rem',
    borderRadius: '0.5rem',
    marginBottom: '1rem'
  },
  secretLabel: {
    color: '#94a3b8',
    fontSize: '0.875rem',
    marginBottom: '0.5rem'
  },
  secretCode: {
    color: '#3b82f6',
    fontSize: '1rem',
    fontFamily: 'monospace',
    wordBreak: 'break-all'
  },
  setupNote: {
    color: '#10b981',
    fontSize: '0.875rem',
    fontWeight: '500'
  },
  enabledBox: {
    textAlign: 'center',
    padding: '2rem',
    marginBottom: '1.5rem'
  },
  enabledTitle: {
    fontSize: '1.5rem',
    fontWeight: '600',
    color: '#e2e8f0',
    marginTop: '1rem',
    marginBottom: '0.5rem'
  },
  enabledDesc: {
    color: '#94a3b8',
    marginBottom: 0
  },
  btnPrimary: {
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.75rem 1.5rem',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  btnDanger: {
    background: '#ef4444',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.75rem 1.5rem',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
    width: '100%'
  }
}

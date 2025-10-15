import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { Video, LogIn, Shield } from 'lucide-react'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { usePBXStore } from '../store/pbxStore'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [requires2FA, setRequires2FA] = useState(false)
  const [tempToken, setTempToken] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const navigate = useNavigate()
  const setAuth = useAuthStore(state => state.setAuth)
  const registerPBX = usePBXStore(state => state.register)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('username', username)
      formData.append('password', password)

      const response = await axios.post('/api/token', formData)
      const { access_token, requires_2fa, temp_token } = response.data

      if (requires_2fa) {
        // 2FA is required
        setRequires2FA(true)
        setTempToken(temp_token)
      } else {
        // No 2FA required, login successful
        // Get user info
        const userResponse = await axios.get('/api/users/me', {
          headers: { Authorization: `Bearer ${access_token}` }
        })

        setAuth(access_token, userResponse.data)

        // Auto-register to PBX if user has SIP extension
        if (userResponse.data.sip_extension) {
          registerPBX(userResponse.data)
        }

        navigate('/')
      }
    } catch (error) {
      const errorDetail = error.response?.data?.detail || 'Login failed'

      // Provide helpful guidance for security-related errors
      if (errorDetail.includes('Two-factor authentication is required') ||
          errorDetail.includes('IP whitelist') ||
          errorDetail.includes('security')) {
        toast.error(
          'Security setup required. Please ask an administrator to either:\n' +
          '1. Add your IP address to the whitelist, OR\n' +
          '2. Set up two-factor authentication for your account',
          { autoClose: 10000 }
        )
      } else {
        toast.error(errorDetail)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleVerify2FA = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await axios.post('/api/2fa/verify', {
        code: verificationCode,
        temp_token: tempToken
      })

      const { access_token } = response.data

      // Get user info
      const userResponse = await axios.get('/api/users/me', {
        headers: { Authorization: `Bearer ${access_token}` }
      })

      setAuth(access_token, userResponse.data)

      // Auto-register to PBX if user has SIP extension
      if (userResponse.data.sip_extension) {
        registerPBX(userResponse.data)
      }

      navigate('/')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid verification code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.loginBox}>
        <div style={styles.header}>
          {requires2FA ? <Shield size={48} color="#3b82f6" /> : <Video size={48} color="#3b82f6" />}
          <h1 style={styles.title}>
            {requires2FA ? 'Two-Factor Authentication' : 'Video Monitoring Dashboard'}
          </h1>
          <p style={styles.subtitle}>
            {requires2FA ? 'Enter verification code sent to your phone/email' : 'Sign in to continue'}
          </p>
        </div>

        {!requires2FA ? (
          <form onSubmit={handleLogin} style={styles.form}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={styles.input}
                required
              />
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                required
              />
            </div>

            <button type="submit" style={styles.button} disabled={loading}>
              <LogIn size={20} />
              <span>{loading ? 'Signing in...' : 'Sign In'}</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify2FA} style={styles.form}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Verification Code</label>
              <input
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                style={styles.input}
                placeholder="Enter 6-digit code"
                maxLength={6}
                required
                autoFocus
              />
            </div>

            <button type="submit" style={styles.button} disabled={loading}>
              <Shield size={20} />
              <span>{loading ? 'Verifying...' : 'Verify Code'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRequires2FA(false)
                setVerificationCode('')
                setTempToken('')
              }}
              style={styles.backButton}
            >
              Back to Login
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    padding: '2rem'
  },
  loginBox: {
    background: '#1e293b',
    borderRadius: '1rem',
    padding: '3rem',
    width: '100%',
    maxWidth: '450px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
    border: '1px solid #334155'
  },
  header: {
    textAlign: 'center',
    marginBottom: '2rem'
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: '700',
    color: '#e2e8f0',
    marginTop: '1rem',
    marginBottom: '0.5rem'
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '0.95rem'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  label: {
    color: '#cbd5e1',
    fontSize: '0.9rem',
    fontWeight: '500'
  },
  input: {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    padding: '0.75rem 1rem',
    color: '#e2e8f0',
    fontSize: '1rem',
    outline: 'none',
    transition: 'border-color 0.2s'
  },
  button: {
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.875rem',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'background 0.2s',
    marginTop: '1rem'
  },
  backButton: {
    background: 'transparent',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    padding: '0.75rem',
    color: '#94a3b8',
    fontSize: '0.9rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginTop: '0.5rem'
  }
}

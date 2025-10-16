import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const api = axios.create({
  baseURL: '/api'
})

// Track last activity time
let lastActivityTime = Date.now()
let refreshTimer = null

// Update activity time on user interaction
const updateActivity = () => {
  lastActivityTime = Date.now()
}

// Add event listeners for user activity
if (typeof window !== 'undefined') {
  window.addEventListener('mousemove', updateActivity)
  window.addEventListener('keydown', updateActivity)
  window.addEventListener('click', updateActivity)
  window.addEventListener('scroll', updateActivity)
}

// Function to refresh token
const refreshToken = async () => {
  try {
    const token = useAuthStore.getState().token
    if (!token) return

    // Only refresh if user was active in the last 30 minutes
    const inactiveMinutes = (Date.now() - lastActivityTime) / 1000 / 60
    if (inactiveMinutes > 30) {
      console.log('User inactive, skipping token refresh')
      return
    }

    const response = await axios.post('/api/token/refresh', {}, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (response.data.access_token) {
      const user = useAuthStore.getState().user
      useAuthStore.getState().setAuth(response.data.access_token, user)
      console.log('Token refreshed successfully')
    }
  } catch (error) {
    console.error('Token refresh failed:', error)
    // If refresh fails, user will need to log in again when token expires
  }
}

// Start automatic token refresh every 4 hours (half the token lifetime)
const startTokenRefresh = () => {
  if (refreshTimer) clearInterval(refreshTimer)

  // Refresh every 4 hours (240 minutes)
  refreshTimer = setInterval(() => {
    refreshToken()
  }, 4 * 60 * 60 * 1000)
}

// Start refresh timer when module loads
startTokenRefresh()

// Add token to requests
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
      if (refreshTimer) clearInterval(refreshTimer)
    }
    return Promise.reject(error)
  }
)

export default api

import React, { useState, useEffect } from 'react'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { usePBXStore } from '../store/pbxStore'
import { Video, Users, LogOut, Home, History, Shield, Globe, Layers, Building2, Settings, ChevronDown, Menu, X, Activity, BarChart3, Clock, Pause, FileText, Phone, PhoneOff, Monitor, DollarSign } from 'lucide-react'
import axios from 'axios'

export default function Layout() {
  const user = useAuthStore(state => state.user)
  const token = useAuthStore(state => state.token)
  const logout = useAuthStore(state => state.logout)
  const setAuth = useAuthStore(state => state.setAuth)
  const navigate = useNavigate()
  const [showSetupDropdown, setShowSetupDropdown] = useState(false)
  const [showStatusDropdown, setShowStatusDropdown] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)

  // PBX Store
  const isRegistered = usePBXStore(state => state.isRegistered)
  const isRegistering = usePBXStore(state => state.isRegistering)
  const registrationError = usePBXStore(state => state.registrationError)
  const registerPBX = usePBXStore(state => state.register)
  const unregisterPBX = usePBXStore(state => state.unregister)

  // Auto-refresh user data if role_type field is missing (for users logged in before role system update)
  useEffect(() => {
    const refreshUserData = async () => {
      if (user && token && !user.role_type) {
        try {
          const response = await axios.get('/api/users/me', {
            headers: { Authorization: `Bearer ${token}` }
          })
          setAuth(token, response.data)
          console.log('User data refreshed with new role fields')
        } catch (error) {
          console.error('Failed to refresh user data:', error)
        }
      }
    }
    refreshUserData()
  }, [user, token, setAuth])

  // Auto-register to PBX if user has SIP extension, phone dialing is enabled, and is not already registered
  useEffect(() => {
    // Explicitly check that phone_dialing_enabled is true (not just "not false")
    if (user?.sip_extension && user?.phone_dialing_enabled === true && !isRegistered && !isRegistering) {
      console.log('[Layout] Auto-registering to PBX for user:', user.username, 'Extension:', user.sip_extension)
      registerPBX(user)
    } else if (user?.sip_extension && user?.phone_dialing_enabled !== true) {
      console.log('[Layout] PBX registration skipped - phone dialing disabled for user:', user.username)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.sip_extension, user?.phone_dialing_enabled, user?.username, isRegistered, isRegistering])

  const handleLogout = () => {
    unregisterPBX() // Unregister from PBX on logout
    logout()
    navigate('/login')
  }

  const closeMobileMenu = () => {
    setShowMobileMenu(false)
    setShowSetupDropdown(false)
    setShowStatusDropdown(false)
  }

  // Role-based access control - only admins can access Setup
  const isAdmin = user?.role_type === 'admin' || user?.role_type === 'super_admin'
  const isSuperAdmin = (user?.access_level === 'super_admin' || user?.access_level === 'country') && isAdmin
  const isGroupAdmin = user?.access_level === 'group' && isAdmin
  const isDealerAdmin = user?.access_level === 'dealer' && isAdmin
  const isCustomerAdmin = user?.access_level === 'customer' && isAdmin

  // Determine if user is at dealer or customer level (any role)
  const isDealerLevel = user?.access_level === 'dealer'
  const isCustomerLevel = user?.access_level === 'customer'
  const isRestrictedLevel = isDealerLevel || isCustomerLevel

  // Determine if user has access to setup menu - only admins
  const hasSetupAccess = isAdmin

  // Determine which navigation items to show
  // Dealer and Customer level users only see: Dashboard, Accounts, History, Reports, Vital Signs
  const showMonitoring = !isRestrictedLevel
  const showStatusMenu = true // Everyone sees Status menu, but Vital Signs is filtered inside

  return (
    <div style={styles.container}>
      <style>{`
        .nav-link:hover {
          background: #334155 !important;
          color: #fff !important;
        }
        .dropdown-item:hover {
          background: #334155 !important;
          color: #fff !important;
        }
        .dropdown-item:last-child {
          border-bottom: none !important;
        }
        @media (max-width: 768px) {
          .mobile-menu-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 998;
          }
          .hamburger-button {
            display: flex !important;
          }
          .nav-links-desktop {
            display: none !important;
          }
          .user-section-desktop {
            display: none !important;
          }
          .mobile-logo-text {
            font-size: 1.1rem !important;
          }
        }
        @media (min-width: 769px) {
          .hamburger-button {
            display: none !important;
          }
          .mobile-menu {
            display: none !important;
          }
        }
      `}</style>
      <nav style={styles.nav}>
        <div style={styles.navContent}>
          {/* Logo and Hamburger */}
          <div style={styles.logo}>
            <img
              src="/logo.png"
              alt="Logo"
              style={styles.logoImage}
              onError={(e) => { e.target.style.display = 'none' }}
            />
            <span style={styles.logoText} className="mobile-logo-text">Video Monitoring</span>
          </div>

          {/* Hamburger Button (Mobile Only) */}
          <button style={styles.hamburger} className="hamburger-button" onClick={() => setShowMobileMenu(!showMobileMenu)}>
            {showMobileMenu ? <X size={24} /> : <Menu size={24} />}
          </button>

          {/* Desktop Navigation Links */}
          <div style={styles.navLinks} className="nav-links-desktop">
            <div style={styles.leftNav}>
              <Link to="/" style={styles.navLink} className="nav-link">
                <Home size={20} />
                <span>Dashboard</span>
              </Link>
              <Link to="/accounts" style={styles.navLink} className="nav-link">
                <Video size={20} />
                <span>Accounts</span>
              </Link>
              {showMonitoring && (
                <Link to="/monitoring" style={styles.navLink} className="nav-link">
                  <Monitor size={20} />
                  <span>Monitoring</span>
                </Link>
              )}
              <Link to="/history" style={styles.navLink} className="nav-link">
                <History size={20} />
                <span>History</span>
              </Link>
              <Link to="/reports" style={styles.navLink} className="nav-link">
                <FileText size={20} />
                <span>Reports</span>
              </Link>
              <Link to="/billing-report" style={styles.navLink} className="nav-link">
                <DollarSign size={20} />
                <span>Billing</span>
              </Link>
              {isRestrictedLevel && (
                <Link to="/status/vital-signs" style={styles.navLink} className="nav-link">
                  <Activity size={20} />
                  <span>Vital Signs</span>
                </Link>
              )}
            </div>

            <div style={styles.rightNav}>
            {/* Setup Dropdown Menu - Desktop */}
            {hasSetupAccess && (
              <div
                style={styles.dropdownContainer}
                onMouseLeave={() => setShowSetupDropdown(false)}
              >
                <button
                  style={styles.navLink}
                  className="nav-link"
                  onClick={() => setShowSetupDropdown(!showSetupDropdown)}
                  onMouseEnter={() => setShowSetupDropdown(true)}
                >
                  <Settings size={20} />
                  <span>Setup</span>
                  <ChevronDown size={16} style={{ marginLeft: '0.25rem' }} />
                </button>

                {showSetupDropdown && (
                  <div style={styles.dropdown}>
                    <div style={styles.dropdownInner}>
                      {isSuperAdmin && (
                        <>
                          <Link to="/countries" style={styles.dropdownItem} className="dropdown-item" onClick={() => setShowSetupDropdown(false)}>
                            <Globe size={18} />
                            <span>Countries</span>
                          </Link>
                          <Link to="/groups" style={styles.dropdownItem} className="dropdown-item" onClick={() => setShowSetupDropdown(false)}>
                            <Layers size={18} />
                            <span>Groups</span>
                          </Link>
                          <Link to="/dealers" style={styles.dropdownItem} className="dropdown-item" onClick={() => setShowSetupDropdown(false)}>
                            <Building2 size={18} />
                            <span>Dealers</span>
                          </Link>
                          <Link to="/users" style={styles.dropdownItem} className="dropdown-item" onClick={() => setShowSetupDropdown(false)}>
                            <Shield size={18} />
                            <span>Users</span>
                          </Link>
                        </>
                      )}
                      {isGroupAdmin && !isSuperAdmin && (
                        <>
                          <Link to="/dealers" style={styles.dropdownItem} className="dropdown-item" onClick={() => setShowSetupDropdown(false)}>
                            <Building2 size={18} />
                            <span>Dealers</span>
                          </Link>
                          <Link to="/users" style={styles.dropdownItem} className="dropdown-item" onClick={() => setShowSetupDropdown(false)}>
                            <Shield size={18} />
                            <span>Users</span>
                          </Link>
                        </>
                      )}
                      {isDealerAdmin && !isSuperAdmin && !isGroupAdmin && (
                        <Link to="/users" style={styles.dropdownItem} className="dropdown-item" onClick={() => setShowSetupDropdown(false)}>
                          <Shield size={18} />
                          <span>Users</span>
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Status Dropdown Menu - Desktop - Only show for non-restricted users */}
            {!isRestrictedLevel && (
              <div
                style={styles.dropdownContainer}
                onMouseLeave={() => setShowStatusDropdown(false)}
              >
                <button
                  style={styles.navLink}
                  className="nav-link"
                  onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                  onMouseEnter={() => setShowStatusDropdown(true)}
                >
                  <BarChart3 size={20} />
                  <span>Status</span>
                  <ChevronDown size={16} style={{ marginLeft: '0.25rem' }} />
                </button>

                {showStatusDropdown && (
                  <div style={styles.dropdown}>
                    <div style={styles.dropdownInner}>
                      <Link to="/status/overall" style={styles.dropdownItem} className="dropdown-item" onClick={() => setShowStatusDropdown(false)}>
                        <BarChart3 size={18} />
                        <span>Overall Status</span>
                      </Link>
                      <Link to="/status/users" style={styles.dropdownItem} className="dropdown-item" onClick={() => setShowStatusDropdown(false)}>
                        <Users size={18} />
                        <span>User Dashboard</span>
                      </Link>
                      <Link to="/status/pending" style={styles.dropdownItem} className="dropdown-item" onClick={() => setShowStatusDropdown(false)}>
                        <Clock size={18} />
                        <span>Pending Status</span>
                      </Link>
                      <Link to="/status/on-hold" style={styles.dropdownItem} className="dropdown-item" onClick={() => setShowStatusDropdown(false)}>
                        <Pause size={18} />
                        <span>On Hold Status</span>
                      </Link>
                      <Link to="/status/vital-signs" style={styles.dropdownItem} className="dropdown-item" onClick={() => setShowStatusDropdown(false)}>
                        <Activity size={18} />
                        <span>Vital Signs</span>
                      </Link>
                      <Link to="/status/event-log" style={styles.dropdownItem} className="dropdown-item" onClick={() => setShowStatusDropdown(false)}>
                        <FileText size={18} />
                        <span>Event Log</span>
                      </Link>
                      {isSuperAdmin && (
                        <Link to="/system-health" style={styles.dropdownItem} className="dropdown-item" onClick={() => setShowStatusDropdown(false)}>
                          <Activity size={18} />
                          <span>System Health</span>
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>

          {/* Desktop User Section */}
          <div style={styles.userSection} className="user-section-desktop">
            {/* PBX Status Indicator - Only show if phone dialing is enabled */}
            {user?.sip_extension && user?.phone_dialing_enabled && (
              <div
                style={{
                  ...styles.pbxStatus,
                  backgroundColor: isRegistered ? '#10b98120' : (isRegistering ? '#f59e0b20' : '#ef444420'),
                  border: `1px solid ${isRegistered ? '#10b981' : (isRegistering ? '#f59e0b' : '#ef4444')}`
                }}
                title={isRegistered ? 'PBX Connected' : (isRegistering ? 'PBX Connecting...' : registrationError || 'PBX Disconnected')}
              >
                {isRegistered ? (
                  <Phone size={16} style={{ color: '#10b981' }} />
                ) : (
                  <PhoneOff size={16} style={{ color: isRegistering ? '#f59e0b' : '#ef4444' }} />
                )}
                <span style={{
                  color: isRegistered ? '#10b981' : (isRegistering ? '#f59e0b' : '#ef4444'),
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}>
                  {isRegistered ? 'PBX' : (isRegistering ? 'Connecting' : 'PBX')}
                </span>
              </div>
            )}
            <Link to="/profile" style={styles.profileLink} className="nav-link">
              <Shield size={18} />
              <span style={styles.userName}>{user?.full_name || user?.username}</span>
            </Link>
            <button onClick={handleLogout} style={styles.logoutBtn}>
              <LogOut size={20} />
            </button>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        {showMobileMenu && (
          <div className="mobile-menu-overlay" onClick={closeMobileMenu} />
        )}

        {/* Mobile Menu */}
        {showMobileMenu && (
          <div style={styles.mobileMenu} className="mobile-menu">
            <Link to="/" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
              <Home size={20} />
              <span>Dashboard</span>
            </Link>
            <Link to="/accounts" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
              <Video size={20} />
              <span>Accounts</span>
            </Link>
            {showMonitoring && (
              <Link to="/monitoring" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
                <Monitor size={20} />
                <span>Monitoring</span>
              </Link>
            )}
            <Link to="/history" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
              <History size={20} />
              <span>History</span>
            </Link>
            <Link to="/reports" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
              <FileText size={20} />
              <span>Reports</span>
            </Link>
            <Link to="/billing-report" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
              <DollarSign size={20} />
              <span>Billing</span>
            </Link>
            {isRestrictedLevel && (
              <Link to="/status/vital-signs" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
                <Activity size={20} />
                <span>Vital Signs</span>
              </Link>
            )}

            {/* Status Section - Mobile - Only show for non-restricted users */}
            {!isRestrictedLevel && (
              <>
                <div style={styles.mobileSectionTitle}>Status</div>
                <Link to="/status/overall" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
                  <BarChart3 size={18} />
                  <span>Overall Status</span>
                </Link>
                <Link to="/status/users" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
                  <Users size={18} />
                  <span>User Dashboard</span>
                </Link>
                <Link to="/status/pending" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
                  <Clock size={18} />
                  <span>Pending Status</span>
                </Link>
                <Link to="/status/on-hold" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
                  <Pause size={18} />
                  <span>On Hold Status</span>
                </Link>
                <Link to="/status/vital-signs" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
                  <Activity size={18} />
                  <span>Vital Signs</span>
                </Link>
                <Link to="/status/event-log" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
                  <FileText size={18} />
                  <span>Event Log</span>
                </Link>
                {isSuperAdmin && (
                  <Link to="/system-health" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
                    <Activity size={18} />
                    <span>System Health</span>
                  </Link>
                )}
              </>
            )}

            {/* Setup Section - Mobile */}
            {hasSetupAccess && (
              <>
                <div style={styles.mobileSectionTitle}>Setup</div>
                {isSuperAdmin && (
                  <>
                    <Link to="/countries" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
                      <Globe size={18} />
                      <span>Countries</span>
                    </Link>
                    <Link to="/groups" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
                      <Layers size={18} />
                      <span>Groups</span>
                    </Link>
                    <Link to="/dealers" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
                      <Building2 size={18} />
                      <span>Dealers</span>
                    </Link>
                    <Link to="/users" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
                      <Shield size={18} />
                      <span>Users</span>
                    </Link>
                  </>
                )}
                {isGroupAdmin && !isSuperAdmin && (
                  <>
                    <Link to="/dealers" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
                      <Building2 size={18} />
                      <span>Dealers</span>
                    </Link>
                    <Link to="/users" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
                      <Shield size={18} />
                      <span>Users</span>
                    </Link>
                  </>
                )}
                {isDealerAdmin && !isSuperAdmin && !isGroupAdmin && (
                  <Link to="/users" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
                    <Shield size={18} />
                    <span>Users</span>
                  </Link>
                )}
              </>
            )}

            {/* User Section - Mobile */}
            <div style={styles.mobileSectionTitle}>Account</div>
            {/* PBX Status - Mobile - Only show if phone dialing is enabled */}
            {user?.sip_extension && user?.phone_dialing_enabled && (
              <div style={{
                ...styles.mobilePBXStatus,
                backgroundColor: isRegistered ? '#10b98120' : (isRegistering ? '#f59e0b20' : '#ef444420'),
                border: `1px solid ${isRegistered ? '#10b981' : (isRegistering ? '#f59e0b' : '#ef4444')}`
              }}>
                {isRegistered ? (
                  <Phone size={18} style={{ color: '#10b981' }} />
                ) : (
                  <PhoneOff size={18} style={{ color: isRegistering ? '#f59e0b' : '#ef4444' }} />
                )}
                <span style={{
                  color: isRegistered ? '#10b981' : (isRegistering ? '#f59e0b' : '#ef4444'),
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}>
                  PBX: {isRegistered ? 'Connected' : (isRegistering ? 'Connecting...' : 'Disconnected')}
                </span>
              </div>
            )}
            <Link to="/profile" style={styles.mobileNavLink} className="nav-link" onClick={closeMobileMenu}>
              <Shield size={18} />
              <span>{user?.full_name || user?.username}</span>
            </Link>
            <button onClick={() => { closeMobileMenu(); handleLogout(); }} style={styles.mobileLogoutBtn} className="nav-link">
              <LogOut size={20} />
              <span>Logout</span>
            </button>
          </div>
        )}
      </nav>
      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column'
  },
  nav: {
    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    borderBottom: '1px solid #334155',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
    position: 'relative'
  },
  navContent: {
    maxWidth: '1920px',
    margin: '0 auto',
    padding: '1rem 2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '2rem'
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    color: '#3b82f6'
  },
  logoImage: {
    height: '40px',
    width: 'auto',
    objectFit: 'contain'
  },
  logoText: {
    fontSize: '1.5rem',
    fontWeight: '700'
  },
  navLinks: {
    display: 'flex',
    gap: '1rem',
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  leftNav: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center'
  },
  rightNav: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center'
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    color: '#cbd5e1',
    textDecoration: 'none',
    transition: 'all 0.2s',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap'
  },
  dropdownContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center'
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: '0',
    paddingTop: '0.5rem',
    background: 'transparent',
    minWidth: '180px',
    zIndex: 1000
  },
  dropdownInner: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
    overflow: 'hidden'
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    color: '#cbd5e1',
    textDecoration: 'none',
    transition: 'all 0.2s',
    background: '#1e293b',
    borderBottom: '1px solid #334155',
    whiteSpace: 'nowrap'
  },
  userSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  profileLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    color: '#cbd5e1',
    textDecoration: 'none',
    transition: 'all 0.2s',
    border: '1px solid #334155'
  },
  userName: {
    color: '#cbd5e1',
    fontSize: '0.9rem'
  },
  logoutBtn: {
    background: '#ef4444',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.5rem',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'background 0.2s'
  },
  main: {
    flex: 1,
    padding: '2rem',
    maxWidth: '1920px',
    width: '100%',
    margin: '0 auto'
  },
  hamburger: {
    display: 'none',
    background: 'none',
    border: 'none',
    color: '#cbd5e1',
    cursor: 'pointer',
    padding: '0.5rem'
  },
  mobileMenu: {
    position: 'fixed',
    top: '73px',
    left: 0,
    right: 0,
    bottom: 0,
    background: '#1e293b',
    zIndex: 999,
    overflowY: 'auto',
    padding: '1rem'
  },
  mobileNavLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    borderRadius: '0.5rem',
    color: '#cbd5e1',
    textDecoration: 'none',
    transition: 'all 0.2s',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    fontFamily: 'inherit',
    width: '100%',
    textAlign: 'left',
    marginBottom: '0.5rem'
  },
  mobileSectionTitle: {
    color: '#94a3b8',
    fontSize: '0.875rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: '1rem 1rem 0.5rem',
    marginTop: '1rem',
    borderTop: '1px solid #334155'
  },
  mobileLogoutBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    borderRadius: '0.5rem',
    color: '#fff',
    background: '#ef4444',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    fontFamily: 'inherit',
    width: '100%',
    textAlign: 'left',
    marginTop: '0.5rem',
    transition: 'background 0.2s'
  },
  pbxStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
    cursor: 'help'
  },
  mobilePBXStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    borderRadius: '0.5rem',
    marginBottom: '0.5rem',
    transition: 'all 0.2s'
  }
}

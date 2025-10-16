import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { useAuthStore } from './store/authStore'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Monitoring from './pages/Monitoring'
import AccountsLookup from './pages/AccountsLookup'
import AccountDetail from './pages/AccountDetail'
import AlarmDetail from './pages/AlarmDetail'
import AlarmHistoryView from './pages/AlarmHistoryView'
import History from './pages/History'
import Users from './pages/Users'
import Profile from './pages/Profile'
import Countries from './pages/Countries'
import Groups from './pages/Groups'
import Dealers from './pages/Dealers'
import SystemHealth from './pages/SystemHealth'
import UserDashboardStatus from './pages/UserDashboardStatus'
import PendingStatus from './pages/PendingStatus'
import OnHoldStatus from './pages/OnHoldStatus'
import OverallStatus from './pages/OverallStatus'
import VitalSignsStatus from './pages/VitalSignsStatus'
import Reports from './pages/Reports'
import BillingReport from './pages/BillingReport'
import EventLog from './pages/EventLog'
import Layout from './components/Layout'

function PrivateRoute({ children }) {
  const token = useAuthStore(state => state.token)
  return token ? children : <Navigate to="/login" />
}

function App() {
  return (
    <Router>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
        limit={3}
        enableMultiContainer={false}
      />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="monitoring" element={<Monitoring />} />
          <Route path="accounts" element={<AccountsLookup />} />
          <Route path="accounts/:accountId" element={<AccountDetail />} />
          <Route path="history" element={<History />} />
          <Route path="users" element={<Users />} />
          <Route path="profile" element={<Profile />} />
          <Route path="countries" element={<Countries />} />
          <Route path="groups" element={<Groups />} />
          <Route path="dealers" element={<Dealers />} />
          <Route path="system-health" element={<SystemHealth />} />
          <Route path="status/overall" element={<OverallStatus />} />
          <Route path="status/users" element={<UserDashboardStatus />} />
          <Route path="status/pending" element={<PendingStatus />} />
          <Route path="status/on-hold" element={<OnHoldStatus />} />
          <Route path="status/vital-signs" element={<VitalSignsStatus />} />
          <Route path="status/event-log" element={<EventLog />} />
          <Route path="reports" element={<Reports />} />
          <Route path="billing-report" element={<BillingReport />} />
          <Route path="alarm/:alarmId" element={<AlarmDetail />} />
          <Route path="alarm-history/:alarmId" element={<AlarmHistoryView />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App

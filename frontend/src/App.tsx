import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/auth-context'
import { RequireAnon, RequireAuth, RequireRole } from './auth/guards'
import { AppShell, DashboardShell } from './components/Layout'
import { Landing } from './pages/Landing'
import { Login } from './pages/auth/Login'
import { Register } from './pages/auth/Register'
import { ForgotPassword } from './pages/auth/ForgotPassword'
import { ResetPassword } from './pages/auth/ResetPassword'
import { VerifyEmail } from './pages/auth/VerifyEmail'
import { DashboardHome } from './pages/DashboardHome'

function DashboardIndex() {
  const { user } = useAuth()
  if (!user) return null
  return <Navigate to={`/dashboard/${user.role}`} replace />
}

function NotFound() {
  return (
    <div className="container centered" style={{ textAlign: 'center' }}>
      <div>
        <h1>404</h1>
        <p className="muted">This page went offside. Back to the <a href="/">pitch</a>?</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Landing />} />
        <Route element={<RequireAnon />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Route>
        <Route path="/verify-email" element={<VerifyEmail />} />

        <Route element={<RequireAuth />}>
          <Route element={<DashboardShell />}>
            <Route path="/dashboard" element={<DashboardIndex />} />
            <Route element={<RequireRole role="athlete" />}>
              <Route path="/dashboard/athlete" element={<DashboardHome />} />
            </Route>
            <Route element={<RequireRole role="scout" />}>
              <Route path="/dashboard/scout" element={<DashboardHome />} />
            </Route>
            <Route element={<RequireRole role="organizer" />}>
              <Route path="/dashboard/organizer" element={<DashboardHome />} />
            </Route>
            <Route element={<RequireRole role="sponsor" />}>
              <Route path="/dashboard/sponsor" element={<DashboardHome />} />
            </Route>
            <Route element={<RequireRole role="admin" />}>
              <Route path="/dashboard/admin" element={<DashboardHome />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
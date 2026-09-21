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

import { AthleteHome } from './pages/athlete/Home'
import { AthleteProfile } from './pages/athlete/Profile'
import { AthleteApplications } from './pages/athlete/Applications'

import { ScoutHome } from './pages/scout/Home'
import { ScoutTalent } from './pages/scout/Talent'
import { ScoutAthleteDetail } from './pages/scout/AthleteDetail'
import { ScoutShortlist } from './pages/scout/Shortlist'

import { OrganizerHome } from './pages/organizer/Home'
import { OrganizerTournaments } from './pages/organizer/Tournaments'
import { OrganizerTournamentForm } from './pages/organizer/TournamentForm'
import { OrganizerTournamentDetail } from './pages/organizer/TournamentDetail'

import { SponsorHome } from './pages/sponsor/Home'
import { SponsorRequests } from './pages/sponsor/Requests'

import { AdminHome } from './pages/admin/Home'
import { AdminUsers } from './pages/admin/Users'
import { AdminVerifications } from './pages/admin/Verifications'

import { Messages } from './pages/shared/Messages'
import { Notifications } from './pages/shared/Notifications'
import { Settings } from './pages/shared/Settings'

import { PublicTournaments } from './pages/public/Tournaments'
import { PublicTournamentDetail } from './pages/public/TournamentDetail'
import { PublicTalent } from './pages/public/Talent'

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
        <Route path="/tournaments" element={<PublicTournaments />} />
        <Route path="/tournaments/:id" element={<PublicTournamentDetail />} />
        <Route path="/talent" element={<PublicTalent />} />

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
              <Route path="/dashboard/athlete" element={<AthleteHome />} />
              <Route path="/dashboard/athlete/profile" element={<AthleteProfile />} />
              <Route path="/dashboard/athlete/applications" element={<AthleteApplications />} />
            </Route>

            <Route element={<RequireRole role="scout" />}>
              <Route path="/dashboard/scout" element={<ScoutHome />} />
              <Route path="/dashboard/scout/talent" element={<ScoutTalent />} />
              <Route path="/dashboard/scout/athletes/:id" element={<ScoutAthleteDetail />} />
              <Route path="/dashboard/scout/shortlist" element={<ScoutShortlist />} />
            </Route>

            <Route element={<RequireRole role="organizer" />}>
              <Route path="/dashboard/organizer" element={<OrganizerHome />} />
              <Route path="/dashboard/organizer/tournaments" element={<OrganizerTournaments />} />
              <Route path="/dashboard/organizer/tournaments/new" element={<OrganizerTournamentForm />} />
              <Route path="/dashboard/organizer/tournaments/:id" element={<OrganizerTournamentDetail />} />
            </Route>

            <Route element={<RequireRole role="sponsor" />}>
              <Route path="/dashboard/sponsor" element={<SponsorHome />} />
              <Route path="/dashboard/sponsor/requests" element={<SponsorRequests />} />
            </Route>

            <Route element={<RequireRole role="admin" />}>
              <Route path="/dashboard/admin" element={<AdminHome />} />
              <Route path="/dashboard/admin/users" element={<AdminUsers />} />
              <Route path="/dashboard/admin/verifications" element={<AdminVerifications />} />
            </Route>

            <Route path="/dashboard/messages" element={<Messages />} />
            <Route path="/dashboard/notifications" element={<Notifications />} />
            <Route path="/dashboard/settings" element={<Settings />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
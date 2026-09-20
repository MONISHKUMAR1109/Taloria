import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './auth-context'
import type { Role } from '../lib/types'

function Spinner() {
  return (
    <div className="centered">
      <div className="spinner" role="status" aria-label="Loading" />
    </div>
  )
}

/** Blocks anonymous users. Remembered the attempted URL for a post-login return. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <Spinner />
  if (status === 'anon') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

/** Blocks authenticated users from auth-only pages (login/register). */
export function RequireAnon() {
  const { status } = useAuth()

  if (status === 'loading') return <Spinner />
  if (status === 'authed') return <Navigate to="/dashboard" replace />
  return <Outlet />
}

const ROLE_HOME: Record<Role, string> = {
  athlete: '/dashboard/athlete',
  scout: '/dashboard/scout',
  organizer: '/dashboard/organizer',
  sponsor: '/dashboard/sponsor',
  admin: '/dashboard/admin',
}

/** Role-scoped guard — redirects to that role's dashboard on a mismatch. */
export function RequireRole({ role }: { role: Role }) {
  const { status, user } = useAuth()

  if (status === 'loading') return <Spinner />
  if (status === 'anon') return <Navigate to="/login" replace />
  if (user && user.role !== role) return <Navigate to={ROLE_HOME[user.role]} replace />
  return <Outlet />
}
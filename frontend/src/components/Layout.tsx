import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import { Button, RoleBadge, ThemeToggle } from './ui'

export function AppShell() {
  return (
    <>
      <PublicNav />
      <Outlet />
      <Footer />
    </>
  )
}

function PublicNav() {
  const { status, user, logout } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          TALORIA
        </Link>
        <nav className="nav-links" aria-label="Primary">
          {status === 'authed' && user ? (
            <>
              <NavLink className="nav-link" to="/dashboard">
                Dashboard
              </NavLink>
              <RoleBadge role={user.role} />
              <Button
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await logout()
                    navigate('/')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <NavLink className="nav-link" to="/login">
                Log in
              </NavLink>
              <Link to="/register">
                <Button variant="primary">Join free</Button>
              </Link>
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <p className="small">TALORIA — Where Talent Finds Its Stage. Now in Phase 2 (frontend build-out).</p>
      </div>
    </footer>
  )
}

const DASH_ITEMS = [
  { to: '/dashboard/athlete', label: 'Athlete' },
  { to: '/dashboard/scout', label: 'Scout' },
  { to: '/dashboard/organizer', label: 'Organizer' },
  { to: '/dashboard/sponsor', label: 'Sponsor' },
  { to: '/dashboard/admin', label: 'Admin' },
]

export function DashboardShell() {
  const { status } = useAuth()

  if (status === 'loading') {
    return (
      <div className="centered">
        <div className="spinner" role="status" aria-label="Loading" />
      </div>
    )
  }

  return (
    <div className="container">
      <div className="dash-grid">
        <aside className="dash-nav">
          {DASH_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `dash-nav-link${isActive ? ' dash-nav-link-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </aside>
        <main className="dash-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
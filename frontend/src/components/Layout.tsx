import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import { notificationsApi } from '../lib/endpoints'
import { formatDateTime } from '../lib/format'
import type { AppNotification, Role } from '../lib/types'
import { Button, RoleBadge, Spinner, ThemeToggle } from './ui'
import { Avatar } from './ui'
import {
  IconBell,
  IconCalendar,
  IconChat,
  IconChevronRight,
  IconCard,
  IconEdit,
  IconHome,
  IconLogout,
  IconPlus,
  IconSearch,
  IconSettings,
  IconShield,
  IconStar,
  IconTrophy,
  IconUsers,
  IconBriefcase,
} from './Icons'

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
          <NavLink className="nav-link" to="/tournaments">
            Tournaments
          </NavLink>
          <NavLink className="nav-link" to="/talent">
            Talent
          </NavLink>
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
        <p className="small">TALORIA — Where Talent Finds Its Stage.</p>
      </div>
    </footer>
  )
}

/* ------------------------------------------------------------------ */
/* Dashboard shell                                                     */
/* ------------------------------------------------------------------ */

export interface NavItem {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: Record<Role, NavGroup[]> = {
  athlete: [
    {
      label: 'My career',
      items: [
        { to: '/dashboard/athlete', label: 'Overview', icon: <IconHome size={17} />, end: true },
        { to: '/dashboard/athlete/profile', label: 'Profile', icon: <IconEdit size={17} /> },
        { to: '/dashboard/athlete/applications', label: 'Applications', icon: <IconCard size={17} /> },
      ],
    },
    {
      label: 'Connect',
      items: [
        { to: '/dashboard/messages', label: 'Messages', icon: <IconChat size={17} /> },
        { to: '/dashboard/settings', label: 'Settings', icon: <IconSettings size={17} /> },
      ],
    },
  ],
  scout: [
    {
      label: 'Discover',
      items: [
        { to: '/dashboard/scout', label: 'Overview', icon: <IconHome size={17} />, end: true },
        { to: '/dashboard/scout/talent', label: 'Talent search', icon: <IconSearch size={17} /> },
        { to: '/dashboard/scout/shortlist', label: 'Shortlist', icon: <IconStar size={17} /> },
      ],
    },
    {
      label: 'Connect',
      items: [
        { to: '/dashboard/messages', label: 'Messages', icon: <IconChat size={17} /> },
        { to: '/dashboard/settings', label: 'Settings', icon: <IconSettings size={17} /> },
      ],
    },
  ],
  organizer: [
    {
      label: 'Tournaments',
      items: [
        { to: '/dashboard/organizer', label: 'Overview', icon: <IconHome size={17} />, end: true },
        { to: '/dashboard/organizer/tournaments', label: 'My tournaments', icon: <IconTrophy size={17} /> },
        { to: '/dashboard/organizer/tournaments/new', label: 'Create tournament', icon: <IconPlus size={17} /> },
      ],
    },
    {
      label: 'Account',
      items: [{ to: '/dashboard/settings', label: 'Settings', icon: <IconSettings size={17} /> }],
    },
  ],
  sponsor: [
    {
      label: 'Sponsorship',
      items: [
        { to: '/dashboard/sponsor', label: 'Overview', icon: <IconHome size={17} />, end: true },
        { to: '/dashboard/sponsor/requests', label: 'My requests', icon: <IconBriefcase size={17} /> },
      ],
    },
    {
      label: 'Explore',
      items: [
        { to: '/tournaments', label: 'Browse tournaments', icon: <IconCalendar size={17} /> },
        { to: '/dashboard/settings', label: 'Settings', icon: <IconSettings size={17} /> },
      ],
    },
  ],
  admin: [
    {
      label: 'Platform',
      items: [
        { to: '/dashboard/admin', label: 'Overview', icon: <IconHome size={17} />, end: true },
        { to: '/dashboard/admin/users', label: 'Users', icon: <IconUsers size={17} /> },
        { to: '/dashboard/admin/verifications', label: 'Verifications', icon: <IconShield size={17} /> },
      ],
    },
    {
      label: 'System',
      items: [{ to: '/dashboard/settings', label: 'Settings', icon: <IconSettings size={17} /> }],
    },
  ],
}

export function DashboardShell() {
  const { status, user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [busy, setBusy] = useState(false)

  if (status === 'loading') {
    return (
      <div className="centered">
        <Spinner />
      </div>
    )
  }

  if (status !== 'authed' || !user) {
    return (
      <div className="centered">
        <p>Please log in.</p>
      </div>
    )
  }

  const groups = NAV_GROUPS[user.role]
  const current = groups
    .flatMap((g) => g.items)
    .find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)))

  return (
    <div className="shell">
      <aside className="shell-side">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          TALORIA
        </Link>

        <nav className="shell-nav" aria-label="Dashboard">
          {groups.map((group) => (
            <div key={group.label} className="shell-nav-group">
              <p className="shell-nav-label">{group.label}</p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `shell-nav-item${isActive ? ' shell-nav-item-active' : ''}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="shell-side-foot">
          <div className="shell-user">
            <Avatar name={user.email} size="sm" />
            <div className="truncate">
              <p className="small" style={{ fontWeight: 700, margin: 0 }}>{user.email.split('@')[0]}</p>
              <p className="tiny muted" style={{ margin: 0 }}>{user.role}</p>
            </div>
            <RoleBadge role={user.role} />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
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
            <IconLogout size={15} /> Sign out
          </Button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-top">
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>{user.role}</p>
            <h1 style={{ margin: 0 }}>{current?.label ?? 'Dashboard'}</h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>
        <main className="container shell-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Notifications bell                                                  */
/* ------------------------------------------------------------------ */

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await notificationsApi.list({ page: 1, pageSize: 8 })
      setItems(res.items)
      setUnread(res.unread)
    } catch {
      /* the bell stays quiet if notifications are unavailable */
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 30000)
    return () => clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [])

  async function markAllRead() {
    const unreadOnes = items.filter((i) => !i.read_at)
    await Promise.all(unreadOnes.map((i) => notificationsApi.markRead(i.id).catch(() => undefined)))
    await refresh()
  }

  return (
    <div className="notif" ref={ref}>
      <button
        type="button"
        className="btn btn-ghost notif-btn"
        aria-label={`Notifications, ${unread} unread`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="badge-dot">
          <IconBell size={18} />
          {unread > 0 ? <span className="count">{unread > 9 ? '9+' : unread}</span> : null}
        </span>
      </button>

      {open ? (
        <div className="notif-pop">
          <div className="notif-head">
            <span style={{ fontWeight: 700 }}>Notifications</span>
            {unread > 0 ? (
              <button type="button" className="link-btn" onClick={markAllRead}>Mark all read</button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="small muted" style={{ padding: 'var(--space-4)' }}>Nothing here yet.</p>
          ) : (
            <div className="notif-list">
              {items.map((n) => (
                <Link key={n.id} to="/dashboard/notifications" className={`notif-item${n.read_at ? '' : ' notif-item-unread'}`} onClick={() => setOpen(false)}>
                  <span className="dot" style={{ background: n.read_at ? 'var(--surface-3)' : 'var(--brand-500)', flexShrink: 0 }} />
                  <span style={{ minWidth: 0 }}>
                    <span className="small" style={{ fontWeight: n.read_at ? 500 : 700 }}>{n.title}</span>
                    {n.body ? <span className="tiny muted" style={{ display: 'block' }}>{n.body}</span> : null}
                    <span className="tiny muted" style={{ display: 'block' }}>{formatDateTime(n.created_at)}</span>
                  </span>
                  <IconChevronRight size={14} className="muted-icon" />
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
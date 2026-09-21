import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Card, EmptyState, Progress, Spinner } from '../../components/ui'
import { IconCard, IconChevronRight, IconShield, IconTarget, IconTrophy, IconUsers } from '../../components/Icons'
import { adminApi } from '../../lib/endpoints'
import { formatDate } from '../../lib/format'
import type { AdminAnalytics } from '../../lib/types'
import { ROLE_LABELS } from '../../lib/types'

export function AdminHome() {
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let alive = true
    setLoading(true)
    adminApi
      .analytics()
      .then((a) => {
        if (!alive) return
        setAnalytics(a)
        setError(null)
      })
      .catch((err: Error) => {
        if (alive) setError(err.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading || !analytics) {
    return loading ? <Spinner /> : <Alert tone="danger">{error ?? 'Unable to load analytics.'}</Alert>
  }

  const { users = 0, athletes = 0, applications = 0, tournaments = 0, active_sponsorships = 0, verification_queue = 0 } =
    analytics.totals ?? {}

  const tiles = [
    { label: 'Users', value: users, icon: <IconUsers size={22} />, cls: 'tile-ico' },
    { label: 'Athletes', value: athletes, icon: <IconTarget size={22} />, cls: 'tile-ico-green' },
    { label: 'Applications', value: applications, icon: <IconCard size={22} />, cls: 'tile-ico-violet' },
    { label: 'Tournaments', value: tournaments, icon: <IconTrophy size={22} />, cls: 'tile-ico-alt' },
    { label: 'Active sponsorships', value: active_sponsorships, icon: <IconShield size={22} />, cls: 'tile-ico' },
    { label: 'Verification queue', value: verification_queue, icon: <IconShield size={22} />, cls: 'tile-ico-green' },
  ]

  const byRole = analytics.usersByRole ?? []
  const byRoleMax = Math.max(0, ...byRole.map((r) => r.total))
  const weeks = (analytics.weeklyRegistrations ?? []).slice(-6)
  const weeksMax = Math.max(0, ...weeks.map((w) => w.total))

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Admin workspace</p>
          <h1>Platform overview</h1>
          <p className="muted">
            Live counters from the database{analytics.generatedAt ? `, updated ${formatDate(analytics.generatedAt)}` : ''}.
          </p>
        </div>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid-4 mt-5">
        {tiles.map((t) => (
          <div key={t.label} className="tile">
            <div className={t.cls}>{t.icon}</div>
            <div className="tile-label">{t.label}</div>
            <div className="tile-value">{t.value}</div>
          </div>
        ))}
      </div>

      <div className="grid-2 mt-5">
        <Card>
          <div className="card-head">
            <h3>Users by role</h3>
            <IconUsers size={18} className="muted-icon" />
          </div>
          <div className="card-body">
            {byRole.length === 0 ? (
              <EmptyState icon="📊" title="No data yet" />
            ) : (
              byRole.map((r) => (
                <div key={r.role} className="mb-4">
                  <div className="flex items-center justify-between small mb-2">
                    <span style={{ fontWeight: 600 }}>{ROLE_LABELS[r.role] ?? r.role}</span>
                    <span className="muted">{r.total}</span>
                  </div>
                  <Progress value={byRoleMax > 0 ? Math.round((r.total / byRoleMax) * 100) : 0} />
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <div className="card-head">
            <h3>Weekly registrations</h3>
            <IconTarget size={18} className="muted-icon" />
          </div>
          <div className="card-body">
            {weeks.length === 0 ? (
              <EmptyState icon="📈" title="No registrations yet" />
            ) : (
              weeks.map((w) => (
                <div key={w.week} className="mb-4">
                  <div className="flex items-center justify-between small mb-2">
                    <span style={{ fontWeight: 600 }}>{formatDate(w.week)}</span>
                    <span className="muted">{w.total}</span>
                  </div>
                  <Progress value={weeksMax > 0 ? Math.round((w.total / weeksMax) * 100) : 0} />
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="grid-2 mt-5">
        <Card>
          <div className="card-head">
            <h3>User management</h3>
            <IconUsers size={18} className="muted-icon" />
          </div>
          <div className="card-body">
            <p className="small muted">
              Search every account, suspend or activate users, and change roles when needed.
            </p>
            <Link className="inline-link mt-3" to="/dashboard/admin/users">
              Manage users <IconChevronRight size={14} />
            </Link>
          </div>
        </Card>

        <Card>
          <div className="card-head">
            <h3>Verification queue</h3>
            <IconShield size={18} className="muted-icon" />
          </div>
          <div className="card-body">
            <p className="small muted">
              Review athlete verification requests and approve verified badges. {verification_queue} pending
              {verification_queue === 1 ? ' request' : ' requests'}.
            </p>
            <Link className="inline-link mt-3" to="/dashboard/admin/verifications">
              Review verifications <IconChevronRight size={14} />
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
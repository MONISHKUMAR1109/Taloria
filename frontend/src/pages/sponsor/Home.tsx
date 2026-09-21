import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { Alert, Button, Card, Spinner, Tag } from '../../components/ui'
import { IconBriefcase, IconCalendar, IconChevronRight, IconShield, IconTrophy } from '../../components/Icons'
import { sponsorshipsApi } from '../../lib/endpoints'
import { formatDate } from '../../lib/format'
import type { SponsorshipRequest } from '../../lib/types'
import { SPONSORSHIP_STATUS_META } from '../athlete/status'

export function SponsorHome() {
  const { user } = useAuth()
  const [recent, setRecent] = useState<SponsorshipRequest[]>([])
  const [activeCount, setActiveCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      sponsorshipsApi.list({ status: 'active', pageSize: 1 }),
      sponsorshipsApi.list({ status: 'pending', pageSize: 1 }),
      sponsorshipsApi.list({ pageSize: 1 }),
      sponsorshipsApi.list({ sort: 'requested_at', order: 'desc', pageSize: 5 }),
    ])
      .then(([active, pending, all, latest]) => {
        if (!alive) return
        setActiveCount(Number(active.meta?.total ?? 0))
        setPendingCount(Number(pending.meta?.total ?? 0))
        setTotalCount(Number(all.meta?.total ?? 0))
        setRecent(latest.data)
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

  if (loading) return <Spinner />

  const firstName = user?.email?.split('@')[0] ?? 'there'
  const tiles = [
    { label: 'Active sponsorships', value: activeCount, icon: <IconShield size={22} />, cls: 'tile-ico-alt' },
    { label: 'Pending requests', value: pendingCount, icon: <IconCalendar size={22} />, cls: 'tile-ico-green' },
    { label: 'Total requests', value: totalCount, icon: <IconBriefcase size={22} />, cls: 'tile-ico-violet' },
  ]
  const steps = [
    'Pick a tournament and a package that fits your brand.',
    'Send a request — the organizer reviews it.',
    'Approved requests go active and you are listed as a sponsor.',
  ]

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Sponsor workspace</p>
          <h1>Welcome back, {firstName}</h1>
          <p className="muted">Back the tournaments that matter and track every request here.</p>
        </div>
        <Link to="/tournaments">
          <Button variant="primary">Browse tournaments</Button>
        </Link>
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
            <h3>Discover tournaments to sponsor</h3>
            <IconTrophy size={18} className="muted-icon" />
          </div>
          <div className="card-body">
            <p className="small muted">
              Browse open tournaments, pick a package that fits your brand, and send a request. Once the organizer
              approves it, your sponsorship goes active.
            </p>
            <Link className="inline-link mt-3" to="/tournaments">
              Explore tournaments <IconChevronRight size={14} />
            </Link>
          </div>
        </Card>

        <Card>
          <div className="card-head">
            <h3>How sponsorship works</h3>
            <IconShield size={18} className="muted-icon" />
          </div>
          <div className="card-body">
            {steps.map((step, i) => (
              <div key={step} className="flex items-center gap-2 mb-2 small">
                <span
                  style={{
                    width: '1.15rem',
                    height: '1.15rem',
                    flex: 'none',
                    borderRadius: 'var(--radius-full)',
                    display: 'grid',
                    placeItems: 'center',
                    background: 'var(--brand-300)',
                    color: 'var(--brand-700)',
                    fontWeight: 700,
                    fontSize: '0.7rem',
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ color: 'var(--ink-2)' }}>{step}</span>
              </div>
            ))}
            <Link className="inline-link mt-3" to="/dashboard/sponsor/requests">
              Manage my requests <IconChevronRight size={14} />
            </Link>
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <div className="card-head">
          <h3>Recent requests</h3>
          <Link className="inline-link" to="/dashboard/sponsor/requests">
            View all
          </Link>
        </div>
        <div className="table-wrap card-body" style={{ paddingTop: 0 }}>
          {recent.length === 0 ? (
            <div className="empty" style={{ padding: 'var(--space-6) 0' }}>
              <div>
                <p className="muted small" style={{ maxWidth: '40ch' }}>
                  You haven&apos;t requested any sponsorships yet. Find a tournament and take your brand to the stage.
                </p>
                <div className="mt-3">
                  <Link to="/tournaments">
                    <Button variant="primary" size="sm">Browse tournaments</Button>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Tournament</th>
                  <th>Requested</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => {
                  const meta = SPONSORSHIP_STATUS_META[r.status] ?? SPONSORSHIP_STATUS_META.pending
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link to={`/tournaments/${r.tournament_id}`} className="table-link">{r.tournament_title}</Link>
                      </td>
                      <td className="muted small">{formatDate(r.requested_at)}</td>
                      <td>
                        <Tag tone={meta.tone}>{meta.label}</Tag>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}
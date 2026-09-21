import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { Alert, Button, Card, EmptyState, Spinner, Tag } from '../../components/ui'
import { IconBriefcase, IconCalendar, IconChevronRight, IconPlus, IconTarget, IconTrophy, IconUsers } from '../../components/Icons'
import { applicationsApi, tournamentsApi } from '../../lib/endpoints'
import { formatDateTime } from '../../lib/format'
import type { Tournament } from '../../lib/types'
import { TOURNAMENT_STATUS_META } from '../athlete/status'

export function OrganizerHome() {
  const { user } = useAuth()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [deadlines, setDeadlines] = useState<Tournament[]>([])
  const [waiting, setWaiting] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      tournamentsApi.mine({ pageSize: 100 }),
      applicationsApi.list({ status: 'pending', pageSize: 100 }),
      applicationsApi.list({ status: 'waitlisted', pageSize: 100 }),
    ])
      .then(([mine, pending, waitlisted]) => {
        if (!alive) return
        const upcoming = mine.data
          .filter((t) => ['registration_open', 'published'].includes(t.status))
          .filter((t) => new Date(t.registration_deadline).getTime() > Date.now())
          .sort((a, b) => new Date(a.registration_deadline).getTime() - new Date(b.registration_deadline).getTime())
          .slice(0, 5)
        setTournaments(mine.data)
        setDeadlines(upcoming)
        setWaiting(Number(pending.meta?.total ?? 0) + Number(waitlisted.meta?.total ?? 0))
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

  const firstName = user?.email?.split('@')[0] ?? 'organizer'
  const completed = tournaments.filter((t) => t.status === 'completed').length
  const sponsorships = tournaments.reduce((n, t) => n + (t.sponsor_count ?? 0), 0)

  const tiles = [
    { label: 'My tournaments', value: tournaments.length, icon: <IconTarget size={22} />, cls: 'tile-ico' },
    { label: 'Applications waiting', value: waiting, icon: <IconUsers size={22} />, cls: 'tile-ico-alt' },
    { label: 'Completed', value: completed, icon: <IconTrophy size={22} />, cls: 'tile-ico-violet' },
    { label: 'Active sponsorships', value: sponsorships, icon: <IconBriefcase size={22} />, cls: 'tile-ico-green' },
  ]

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Organizer workspace</p>
          <h1>Welcome back, {firstName}</h1>
          <p className="muted">Run tournaments end to end, from draft to finalized results.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/dashboard/organizer/tournaments">
            <Button variant="secondary">My tournaments</Button>
          </Link>
          <Link to="/dashboard/organizer/tournaments/new">
            <Button variant="primary"><IconPlus size={15} /> Create tournament</Button>
          </Link>
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
            <h3>Upcoming registration deadlines</h3>
            <IconCalendar size={18} className="muted-icon" />
          </div>
          <div className="card-body">
            {deadlines.length === 0 ? (
              <EmptyState
                icon="🗓"
                title="No open registrations"
                body="Publish a tournament or open registration to start receiving applications."
              />
            ) : (
              <div className="flex flex-col gap-3">
                {deadlines.map((t) => {
                  const meta = TOURNAMENT_STATUS_META[t.status] ?? TOURNAMENT_STATUS_META.draft
                  return (
                    <div className="row" key={t.id}>
                      <div className="tile-ico" style={{ width: '2.5rem', height: '2.5rem', fontSize: '0.8rem' }}><IconCalendar size={15} /></div>
                      <div style={{ flex: 1 }}>
                        <Link className="table-link" to={`/dashboard/organizer/tournaments/${t.id}`}>{t.title}</Link>
                        <p className="tiny muted" style={{ margin: 0 }}>
                          {[t.location_city, t.location_country].filter(Boolean).join(', ') || 'Online'} · {formatDateTime(t.registration_deadline)}
                        </p>
                      </div>
                      <Tag tone={meta.tone}>{meta.label}</Tag>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="card-head">
            <h3>Quick actions</h3>
          </div>
          <div className="card-body">
            <div className="flex flex-col gap-3">
              <Link className="row" to="/dashboard/organizer/tournaments/new" style={{ textDecoration: 'none' }}>
                <div className="tile-ico" style={{ width: '2.5rem', height: '2.5rem' }}><IconPlus size={15} /></div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, margin: 0 }}>Create tournament</p>
                  <p className="tiny muted" style={{ margin: 0 }}>Start a new draft and publish it when ready.</p>
                </div>
                <IconChevronRight size={16} />
              </Link>
              <Link className="row" to="/dashboard/organizer/tournaments" style={{ textDecoration: 'none' }}>
                <div className="tile-ico-violet" style={{ width: '2.5rem', height: '2.5rem' }}><IconTrophy size={15} /></div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, margin: 0 }}>My tournaments</p>
                  <p className="tiny muted" style={{ margin: 0 }}>Review applications, sponsors, and results.</p>
                </div>
                <IconChevronRight size={16} />
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
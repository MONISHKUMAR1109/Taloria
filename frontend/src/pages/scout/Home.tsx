import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { Alert, Button, Card, Spinner, Tag, VerificationTag } from '../../components/ui'
import { IconChat, IconChevronRight, IconSearch, IconStar } from '../../components/Icons'
import { authApi, messagesApi, scoutingApi } from '../../lib/endpoints'
import { relativeTime } from '../../lib/format'
import type { MeResult, MessageThread, ShortlistedAthlete } from '../../lib/types'

export function ScoutHome() {
  const { user } = useAuth()
  const [me, setMe] = useState<MeResult | null>(null)
  const [shortlist, setShortlist] = useState<ShortlistedAthlete[]>([])
  const [threads, setThreads] = useState<MessageThread[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let alive = true
    setLoading(true)
    Promise.all([authApi.me(), scoutingApi.shortlist(), messagesApi.threads()])
      .then(([m, sl, th]) => {
        if (!alive) return
        setMe(m)
        setShortlist(sl)
        setThreads(th)
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
  if (error) return <Alert tone="danger">{error}</Alert>

  const firstName = me?.user?.email?.split('@')[0] ?? user?.email?.split('@')[0] ?? 'scout'
  const tiles = [
    { label: 'Shortlist', value: shortlist.length, icon: <IconStar size={22} />, cls: 'tile-ico' },
    { label: 'Messages', value: threads.length, icon: <IconChat size={22} />, cls: 'tile-ico-green' },
  ]
  const preview = shortlist.slice(0, 3)

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Scout workspace</p>
          <h1>Welcome back, {firstName}</h1>
          <p className="muted">
            Search every eligible athlete, shortlist the ones that fit, and start conversations.
          </p>
        </div>
        <Link to="/dashboard/scout/talent">
          <Button variant="primary"><IconSearch size={15} /> Find talent</Button>
        </Link>
      </div>

      <div className="grid-2 mt-5">
        {tiles.map((t) => (
          <div key={t.label} className="tile">
            <div className={t.cls}>{t.icon}</div>
            <div className="tile-label">{t.label}</div>
            <div className="tile-value">{t.value}</div>
          </div>
        ))}
      </div>

      <div className="grid-2 mt-5">
        <Card className="card-soft">
          <div className="card-head">
            <h3>Start scouting</h3>
            <IconSearch size={18} className="muted-icon" />
          </div>
          <div className="card-body">
            <p className="small muted">
              Filter discoverable athlete profiles by sport, age category, location, experience and
              verification status.
            </p>
            <div className="flex items-center gap-3 mt-3">
              <Link to="/dashboard/scout/talent">
                <Button variant="primary"><IconSearch size={15} /> Explore talent</Button>
              </Link>
              <Link className="inline-link" to="/dashboard/scout/shortlist">
                My shortlist <IconChevronRight size={14} />
              </Link>
            </div>
          </div>
        </Card>

        <Card>
          <div className="card-head">
            <h3>Recent messages</h3>
            <IconChat size={18} className="muted-icon" />
          </div>
          <div className="card-body">
            {threads.length === 0 ? (
              <div className="empty" style={{ padding: 'var(--space-4) 0' }}>
                <div>
                  <p className="muted small" style={{ maxWidth: '32ch' }}>
                    No conversations yet. Message an athlete from their profile to start one.
                  </p>
                  <div className="mt-3">
                    <Link to="/dashboard/scout/talent">
                      <Button variant="secondary" size="sm">Find an athlete</Button>
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {threads.slice(0, 3).map((t) => (
                  <div className="row" key={t.id}>
                    <div className="tile-ico-green" style={{ width: '2.5rem', height: '2.5rem', fontSize: '0.8rem' }}><IconChat size={15} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="small" style={{ fontWeight: 700, margin: 0 }}>{t.athlete_name}</p>
                      <p className="tiny muted truncate" style={{ margin: 0 }}>{t.last_message ?? 'No messages yet'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="tiny muted">{relativeTime(t.last_message_at)}</span>
                      {t.unread_count > 0 ? <Tag tone="brand">{t.unread_count} new</Tag> : null}
                    </div>
                  </div>
                ))}
                <Link className="inline-link" to="/dashboard/messages">
                  Open inbox <IconChevronRight size={14} />
                </Link>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <div className="card-head">
          <h3>Shortlist</h3>
          <Link className="inline-link" to="/dashboard/scout/shortlist">
            View shortlist <IconChevronRight size={14} />
          </Link>
        </div>
        <div className="card-body" style={{ paddingTop: 0 }}>
          {preview.length === 0 ? (
            <div className="empty" style={{ padding: 'var(--space-6) 0' }}>
              <div>
                <p className="muted small" style={{ maxWidth: '40ch' }}>
                  Nothing shortlisted yet. Star athletes you want to follow up on.
                </p>
                <div className="mt-3">
                  <Link to="/dashboard/scout/talent">
                    <Button variant="primary" size="sm">Build your shortlist</Button>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {preview.map((s) => (
                <div className="row" key={s.id}>
                  <div className="tile-ico" style={{ width: '2.5rem', height: '2.5rem', fontSize: '0.8rem' }}><IconStar size={15} /></div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, margin: 0 }}>
                      <Link className="table-link" to={`/dashboard/scout/athletes/${s.id}`}>{s.name}</Link>
                    </p>
                    <p className="tiny muted" style={{ margin: 0 }}>
                      {[s.city, s.country].filter(Boolean).join(' · ') || '—'} · {s.sport_count} sports
                    </p>
                    {s.note ? <p className="tiny muted" style={{ margin: 0, marginTop: 'var(--space-1)' }}>{s.note}</p> : null}
                  </div>
                  <VerificationTag status={s.verification_status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { useProfileId } from '../../auth/useProfile'
import { Alert, Button, Card, EmptyState, Spinner, Tag, VerificationTag } from '../../components/ui'
import {
  IconChat,
  IconCheck,
  IconChevronRight,
  IconFilm,
  IconShield,
  IconTarget,
  IconTrending,
  IconTrophy,
} from '../../components/Icons'
import { applicationsApi, athletesApi, verificationApi } from '../../lib/endpoints'
import { formatDate } from '../../lib/format'
import type { ApplicationRow, AthleteDetail } from '../../lib/types'
import { APPLICATIONS_STATUS_META } from './status'

export function AthleteHome() {
  const { user } = useAuth()
  const { profileId, loading: profileLoading } = useProfileId()

  const [athlete, setAthlete] = useState<AthleteDetail | null>(null)
  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!profileId) return
    let alive = true
    setLoading(true)
    Promise.all([
      athletesApi.get(profileId),
      applicationsApi.list({ sort: 'applied_at', order: 'desc', pageSize: 5 }),
    ])
      .then(([a, apps]) => {
        if (!alive) return
        setAthlete(a)
        setApplications(apps.data)
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
  }, [profileId])

  useEffect(() => {
    load()
  }, [load])

  async function requestVerification() {
    if (!athlete) return
    setVerifyBusy(true)
    setNotice(null)
    try {
      await verificationApi.submit()
      setNotice('Verification request submitted. An admin will review your profile.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the verification request.')
    } finally {
      setVerifyBusy(false)
    }
  }

  if (profileLoading) return <Spinner />
  if (profileId && (loading || !athlete)) {
    return loading ? <Spinner /> : error ? <Alert tone="danger">{error}</Alert> : null
  }
  if (!athlete) {
    return <EmptyState icon="🔭" title="No athlete profile yet" body="You registered but no profile row exists yet. Contact support." />
  }

  const firstName = athlete.first_name ?? user?.email?.split('@')[0] ?? 'there'
  const checklist = [
    { label: 'Basic details (name, location)', done: Boolean(athlete.first_name && athlete.last_name && athlete.country && athlete.city) },
    { label: 'Profile picture', done: Boolean(athlete.profile_picture_key) },
    { label: 'At least one sport', done: athlete.sport_count > 0 },
    { label: 'A recorded statistic', done: athlete.statistics.length > 0 },
    { label: 'An achievement', done: athlete.achievements.length > 0 },
    { label: 'A performance video', done: athlete.videos.length > 0 },
  ]
  const doneCount = checklist.filter((c) => c.done).length

  const tiles = [
    { label: 'Sports', value: athlete.sport_count, icon: <IconTarget size={22} />, cls: 'tile-ico' },
    { label: 'Statistics', value: athlete.statistics.length, icon: <IconTrending size={22} />, cls: 'tile-ico-green' },
    { label: 'Achievements', value: athlete.achievements.length, icon: <IconTrophy size={22} />, cls: 'tile-ico-violet' },
    { label: 'Applications', value: applications.length, icon: <IconShield size={22} />, cls: 'tile-ico-alt' },
  ]

  const canRequestVerification = ['unverified', 'rejected'].includes(athlete.verification_status)

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Athlete workspace</p>
          <h1>Welcome back, {firstName}</h1>
          <p className="muted">
            {athlete.city || 'Your city'} · {athlete.country || 'your country'} · <VerificationTag status={athlete.verification_status} />
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/dashboard/athlete/profile">
            <Button variant="secondary">Manage profile</Button>
          </Link>
          {canRequestVerification ? (
            <Button variant="primary" disabled={verifyBusy} onClick={requestVerification}>
              {verifyBusy ? 'Submitting…' : 'Request verification'}
            </Button>
          ) : null}
        </div>
      </div>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
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
            <h3>Profile completeness</h3>
            <span className="tile-value" style={{ fontSize: '1.1rem' }}>{athlete.completeness}%</span>
          </div>
          <div className="card-body">
            <p className="small muted">
              Discoverable athletes — found by scouts through search — need a complete profile. You&apos;re at{' '}
              {doneCount}/{checklist.length} core items.
            </p>
            <div className="mt-3">
              {checklist.map((c) => (
                <div key={c.label} className="flex items-center gap-2 mb-2 small">
                  <span
                    style={{
                      width: '1.15rem',
                      height: '1.15rem',
                      borderRadius: 'var(--radius-full)',
                      display: 'grid',
                      placeItems: 'center',
                      background: c.done ? 'var(--success-bg)' : 'var(--surface-3)',
                      color: c.done ? 'var(--success-fg)' : 'var(--muted)',
                    }}
                  >
                    {c.done ? <IconCheck size={11} /> : null}
                  </span>
                  <span style={{ color: c.done ? 'var(--ink)' : 'var(--muted)' }}>{c.label}</span>
                </div>
              ))}
            </div>
            <Link className="inline-link mt-3" to="/dashboard/athlete/profile">
              Improve my profile <IconChevronRight size={14} />
            </Link>
          </div>
        </Card>

        <Card>
          <div className="card-head">
            <h3>Get found faster</h3>
            <IconShield size={18} className="muted-icon" />
          </div>
          <div className="card-body">
            <p className="small muted">
              Verified athletes and complete profiles are always shown first to scouts and featured on the public talent
              page.
            </p>
            <div className="flex items-center gap-3 mt-3 card-soft" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)' }}>
              <div style={{ flex: 1 }}>
                <p className="small" style={{ fontWeight: 600 }}>Talk to scouts</p>
                <p className="tiny muted">Scouts can message athletes who appear in search.</p>
              </div>
              <Link to="/dashboard/messages">
                <Button variant="secondary" size="sm"><IconChat size={15} /> Inbox</Button>
              </Link>
            </div>
            {athlete.videos.length === 0 ? (
              <div className="flex items-center gap-3 mt-3 card-soft" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)' }}>
                <div style={{ flex: 1 }}>
                  <p className="small" style={{ fontWeight: 600 }}>Add a showreel</p>
                  <p className="tiny muted">Athletes with videos get noticeably more attention.</p>
                </div>
                <Link to="/dashboard/athlete/profile">
                  <Button variant="ghost" size="sm"><IconFilm size={15} /></Button>
                </Link>
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <div className="card-head">
          <h3>My applications</h3>
          <Link className="inline-link" to="/dashboard/athlete/applications">
            View all
          </Link>
        </div>
        <div className="table-wrap card-body" style={{ paddingTop: 0 }}>
          {applications.length === 0 ? (
            <div className="empty" style={{ padding: 'var(--space-6) 0' }}>
              <div>
                <p className="muted small" style={{ maxWidth: '40ch' }}>
                  You haven&apos;t applied to any tournaments yet. Find one that fits and take the stage.
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
                  <th>Applied</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => {
                  const meta = APPLICATIONS_STATUS_META[a.status] ?? APPLICATIONS_STATUS_META.pending
                  return (
                    <tr key={a.id}>
                      <td>
                        <Link to={`/tournaments/${a.tournament_id}`} className="table-link">{a.tournament_title}</Link>
                      </td>
                      <td className="muted small">{formatDate(a.applied_at)}</td>
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
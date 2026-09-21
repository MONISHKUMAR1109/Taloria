import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { Alert, Button, Card, EmptyState, Field, Modal, Spinner, Tag, VerificationTag } from '../../components/ui'
import { IconBriefcase } from '../../components/Icons'
import { ApiError } from '../../lib/api'
import { applicationsApi, displayName, sponsorshipsApi, tournamentsApi } from '../../lib/endpoints'
import { formatDate, formatDateTime, isFuture } from '../../lib/format'
import type { ApplicationRow, SponsorshipPackage, TournamentDetail } from '../../lib/types'
import { APPLICATIONS_STATUS_META, TOURNAMENT_STATUS_META } from '../athlete/status'

const ACCEPTING_STATUSES = ['published', 'registration_open', 'registration_closed', 'ongoing']

export function PublicTournamentDetail() {
  const params = useParams()
  const id = params.id
  const { status, user } = useAuth()
  const [detail, setDetail] = useState<TournamentDetail | null>(null)
  const [ownApp, setOwnApp] = useState<ApplicationRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [applyOpen, setApplyOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [applyBusy, setApplyBusy] = useState(false)
  const [withdrawBusy, setWithdrawBusy] = useState(false)
  const [sponsorOpen, setSponsorOpen] = useState(false)
  const [sponsorPkg, setSponsorPkg] = useState<SponsorshipPackage | null>(null)
  const [sponsorBusy, setSponsorBusy] = useState(false)
  const [requestedPkgId, setRequestedPkgId] = useState<string | null>(null)

  const isAthlete = user?.role === 'athlete'
  const isSponsor = user?.role === 'sponsor'

  const loadDetail = useCallback(() => {
    if (!id) return
    let alive = true
    setLoading(true)
    tournamentsApi
      .get(id)
      .then((d) => {
        if (!alive) return
        setDetail(d)
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
  }, [id])

  const loadOwnApp = useCallback(() => {
    if (!id || !isAthlete) {
      setOwnApp(null)
      return
    }
    let alive = true
    applicationsApi
      .list({ pageSize: 100 })
      .then(({ data }) => {
        if (alive) setOwnApp(data.find((a) => a.tournament_id === id) ?? null)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [id, isAthlete])

  useEffect(() => loadDetail(), [loadDetail])
  useEffect(() => loadOwnApp(), [loadOwnApp])

  async function submitApply() {
    if (!id) return
    setApplyBusy(true)
    setActionError(null)
    setActionNotice(null)
    try {
      await tournamentsApi.apply(id, { notes: notes.trim() || undefined })
      setApplyOpen(false)
      setNotes('')
      setActionNotice('Your application was submitted.')
      loadDetail()
      loadOwnApp()
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null
      setActionError(err instanceof Error ? err.message : 'Could not apply.')
      if (code === 'ALREADY_APPLIED') {
        setApplyOpen(false)
        loadDetail()
        loadOwnApp()
      }
    } finally {
      setApplyBusy(false)
    }
  }

  async function withdraw() {
    if (!id) return
    setWithdrawBusy(true)
    setActionError(null)
    setActionNotice(null)
    try {
      await tournamentsApi.withdraw(id)
      setActionNotice('Application withdrawn.')
      loadDetail()
      loadOwnApp()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not withdraw.')
    } finally {
      setWithdrawBusy(false)
    }
  }

  function openSponsor(pkg: SponsorshipPackage) {
    setSponsorPkg(pkg)
    setSponsorOpen(true)
  }

  async function confirmSponsor() {
    if (!id || !sponsorPkg) return
    setSponsorBusy(true)
    setActionError(null)
    setActionNotice(null)
    try {
      await sponsorshipsApi.request(id, sponsorPkg.id)
      setRequestedPkgId(sponsorPkg.id)
      setSponsorOpen(false)
      setActionNotice('Sponsorship request sent. The organizer will review it.')
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null
      if (code === 'SPONSORSHIP_ALREADY_REQUESTED') setRequestedPkgId(sponsorPkg.id)
      setActionError(err instanceof Error ? err.message : 'Could not request sponsorship.')
    } finally {
      setSponsorBusy(false)
    }
  }

  if (status === 'loading') return <Spinner />

  if (!id) {
    return (
      <EmptyState
        icon="🏆"
        title="Tournament not found"
        body="We could not find that tournament."
        action={
          <Link to="/tournaments">
            <Button variant="secondary">Back to tournaments</Button>
          </Link>
        }
      />
    )
  }

  if (detail === null) {
    return loading ? <Spinner /> : <Alert tone="danger">{error ?? 'Unable to load this tournament.'}</Alert>
  }

  const meta = TOURNAMENT_STATUS_META[detail.status] ?? TOURNAMENT_STATUS_META.published
  const accepting = ACCEPTING_STATUSES.includes(detail.status)
  const deadlinePassed = !isFuture(detail.registration_deadline)
  const appMeta = ownApp ? (APPLICATIONS_STATUS_META[ownApp.status] ?? APPLICATIONS_STATUS_META.pending) : null
  const canWithdraw = Boolean(ownApp && ['pending', 'waitlisted', 'approved'].includes(ownApp.status))
  const showApply = isAthlete && !ownApp && accepting && !deadlinePassed
  const showDeadlineBanner = (isAthlete || status === 'anon') && deadlinePassed && !ownApp
  const location = [detail.location_city, detail.location_country].filter(Boolean).join(', ') || 'TBA'

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Tournament directory</p>
          <h1>{detail.title}</h1>
          <div className="pill-row">
            {detail.category_name ? <Tag tone="info">{detail.category_name}</Tag> : null}
            <Tag tone={meta.tone}>{meta.label}</Tag>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status === 'anon' ? (
            <Link to="/login">
              <Button variant="primary">Log in to apply</Button>
            </Link>
          ) : isAthlete ? (
            ownApp ? (
              <>
                <Tag tone={appMeta?.tone ?? 'warning'}>{appMeta?.label ?? 'Pending'}</Tag>
                {canWithdraw ? (
                  <Button variant="danger-soft" disabled={withdrawBusy} onClick={withdraw}>
                    {withdrawBusy ? 'Withdrawing…' : 'Withdraw application'}
                  </Button>
                ) : null}
              </>
            ) : showApply ? (
              <Button variant="primary" onClick={() => setApplyOpen(true)}>Apply</Button>
            ) : null
          ) : null}
        </div>
      </div>

      {showDeadlineBanner ? (
        <Alert tone="warning">The registration deadline has passed. You can no longer apply to this tournament.</Alert>
      ) : null}
      {actionNotice ? <Alert tone="success">{actionNotice}</Alert> : null}
      {actionError ? <Alert tone="danger">{actionError}</Alert> : null}

      <div className="grid-2 mt-5">
        <Card>
          <div className="card-head">
            <h3>Tournament details</h3>
          </div>
          <div className="card-body">
            <dl className="kv">
              <dt>Location</dt>
              <dd>{location}</dd>
              <dt>Start date</dt>
              <dd>{formatDate(detail.start_date)}</dd>
              <dt>End date</dt>
              <dd>{formatDate(detail.end_date)}</dd>
              <dt>Registration deadline</dt>
              <dd>{formatDateTime(detail.registration_deadline)}</dd>
              <dt>Participants</dt>
              <dd>
                {detail.participant_count} of {detail.max_participants}
              </dd>
              <dt>Sponsors</dt>
              <dd>{detail.sponsor_count ?? 0}</dd>
            </dl>
          </div>
        </Card>

        <Card>
          <div className="card-head">
            <h3>About this tournament</h3>
          </div>
          <div className="card-body">
            <p className="small">{detail.description || 'No description provided.'}</p>
            {detail.eligibility_requirements ? (
              <p className="small muted">Eligibility: {detail.eligibility_requirements}</p>
            ) : null}
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <div className="card-head">
          <h3>Sponsorship packages</h3>
          <Tag tone={detail.packages.length ? 'brand' : 'muted'}>{detail.packages.length}</Tag>
        </div>
        <div className="card-body">
          {detail.packages.length === 0 ? (
            <EmptyState icon="🤝" title="No sponsorship packages yet" body="This tournament has not published sponsorship packages." />
          ) : (
            <div className="grid-3">
              {detail.packages.map((pkg) => {
                const requested = requestedPkgId === pkg.id
                return (
                  <div className="card card-soft" key={pkg.id}>
                    <div className="flex items-center justify-between">
                      <h4 style={{ margin: 0 }}>{pkg.name}</h4>
                      <Tag tone="brand">
                        {pkg.currency} {String(pkg.price)}
                      </Tag>
                    </div>
                    {pkg.benefits_description ? <p className="small muted mt-3">{pkg.benefits_description}</p> : null}
                    <p className="tiny muted mt-3">
                      {pkg.active_slots}/{pkg.max_slots} slots filled
                    </p>
                    <div className="mt-3">
                      {isSponsor ? (
                        accepting ? (
                          requested ? (
                            <Tag tone="success">Requested</Tag>
                          ) : (
                            <Button variant="secondary" size="sm" onClick={() => openSponsor(pkg)}>
                              Request sponsorship
                            </Button>
                          )
                        ) : (
                          <Tag tone="muted">Not accepting requests</Tag>
                        )
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>

      <Card className="mt-5">
        <div className="card-head">
          <h3>Participants</h3>
          <Tag tone={detail.participants.length ? 'brand' : 'muted'}>{detail.participants.length}</Tag>
        </div>
        <div className="table-wrap card-body" style={{ padding: 0 }}>
          {detail.participants.length === 0 ? (
            <div className="empty">
              <div>
                <p className="muted small" style={{ maxWidth: '40ch' }}>
                  No participants registered yet. Be the first to take the stage.
                </p>
              </div>
            </div>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Athlete</th>
                  <th>Location</th>
                  <th>Verification</th>
                  <th style={{ textAlign: 'right' }}>Sports</th>
                </tr>
              </thead>
              <tbody>
                {detail.participants.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="table-link">{displayName(p)}</span>
                    </td>
                    <td className="muted small">{[p.city, p.country].filter(Boolean).join(', ') || '—'}</td>
                    <td>
                      <VerificationTag status={p.verification_status} />
                    </td>
                    <td className="muted small" style={{ textAlign: 'right' }}>{p.sport_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Card className="mt-5">
        <div className="card-head">
          <h3>Sponsors</h3>
          <Tag tone={detail.activeSponsors.length ? 'brand' : 'muted'}>{detail.activeSponsors.length}</Tag>
        </div>
        <div className="card-body">
          {detail.activeSponsors.length === 0 ? (
            <p className="small muted">No active sponsors yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {detail.activeSponsors.map((s) => (
                <div className="row" key={s.id}>
                  <div className="tile-ico" style={{ width: '2.5rem', height: '2.5rem', fontSize: '0.8rem' }}>
                    <IconBriefcase size={15} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, margin: 0 }}>{s.company_name || 'Sponsor'}</p>
                    <p className="tiny muted" style={{ margin: 0 }}>{s.country || '—'}</p>
                  </div>
                  <Tag tone="info">{s.package_name}</Tag>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        title="Apply to this tournament"
        footer={
          <>
            <Button variant="secondary" onClick={() => setApplyOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={applyBusy} onClick={submitApply}>
              {applyBusy ? 'Applying…' : 'Submit application'}
            </Button>
          </>
        }
      >
        {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
        <Field label="Notes" hint="Optional — anything the organizer should know.">
          <textarea
            className="input"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. I play striker for my local club and have 8 years of competitive experience."
          />
        </Field>
      </Modal>

      <Modal
        open={sponsorOpen}
        onClose={() => setSponsorOpen(false)}
        title="Request sponsorship"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSponsorOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={sponsorBusy} onClick={confirmSponsor}>
              {sponsorBusy ? 'Sending…' : 'Send request'}
            </Button>
          </>
        }
      >
        {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
        {sponsorPkg ? (
          <>
            <p className="small">
              Request the <strong>{sponsorPkg.name}</strong> package for{' '}
              <strong>
                {sponsorPkg.currency} {String(sponsorPkg.price)}
              </strong>
              . The organizer will review your request.
            </p>
            {sponsorPkg.benefits_description ? <p className="small muted">{sponsorPkg.benefits_description}</p> : null}
          </>
        ) : null}
      </Modal>
    </div>
  )
}
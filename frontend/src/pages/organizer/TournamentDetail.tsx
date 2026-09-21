import { useCallback, useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Alert, Avatar, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, Tabs, Tag, VerificationTag } from '../../components/ui'
import { IconEdit, IconPlus, IconSettings, IconTrophy, IconUsers } from '../../components/Icons'
import { applicationsApi, displayName, tournamentsApi } from '../../lib/endpoints'
import { formatDate, formatDateTime } from '../../lib/format'
import type {
  ActiveSponsor,
  ApplicationRow,
  ApplicationStatus,
  SponsorshipPackage,
  TournamentCategory,
  TournamentDetail,
  TournamentParticipant,
  TournamentStatus,
} from '../../lib/types'
import { APPLICATIONS_STATUS_META, TOURNAMENT_STATUS_META } from '../athlete/status'

type Decision = Extract<ApplicationStatus, 'approved' | 'rejected' | 'waitlisted'>

const TRANSITIONS: Record<TournamentStatus, readonly TournamentStatus[]> = {
  draft: ['published', 'cancelled'],
  published: ['draft', 'registration_open', 'cancelled'],
  registration_open: ['registration_closed', 'published', 'cancelled'],
  registration_closed: ['registration_open', 'ongoing', 'cancelled'],
  ongoing: ['completed', 'registration_closed', 'cancelled'],
  completed: [],
  cancelled: [],
}

const RESULTS_ENABLED: TournamentStatus[] = ['ongoing', 'completed']

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function OrganizerTournamentDetail() {
  const { id } = useParams()
  const [tournament, setTournament] = useState<TournamentDetail | null>(null)
  const [categories, setCategories] = useState<TournamentCategory[]>([])
  const [apps, setApps] = useState<ApplicationRow[]>([])
  const [tab, setTab] = useState('applications')
  const [editOpen, setEditOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [packageOpen, setPackageOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!id) return
    let alive = true
    setLoading(true)
    Promise.all([
      tournamentsApi.get(id),
      applicationsApi.list({ tournament_id: id, sort: 'applied_at', order: 'desc', pageSize: 100 }),
      tournamentsApi.categories(),
    ])
      .then(([t, appRes, cats]) => {
        if (!alive) return
        setTournament(t)
        setApps(appRes.data)
        setCategories(cats ?? [])
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

  useEffect(() => {
    load()
  }, [load])

  if (!id) return <Alert tone="danger">Tournament not found.</Alert>
  if (loading || !tournament) {
    return loading ? <Spinner /> : <Alert tone="danger">{error ?? 'Unable to load tournament.'}</Alert>
  }

  const tMeta = TOURNAMENT_STATUS_META[tournament.status] ?? TOURNAMENT_STATUS_META.draft
  const location = [tournament.location_city, tournament.location_country].filter(Boolean).join(', ') || 'Online'
  const resultsEnabled = RESULTS_ENABLED.includes(tournament.status)

  const tabs = [
    { key: 'applications', label: 'Applications', count: apps.length },
    { key: 'participants', label: 'Participants', count: tournament.participants.length },
    { key: 'packages', label: 'Packages', count: tournament.packages.length },
    { key: 'sponsors', label: 'Sponsors', count: tournament.activeSponsors.length },
    { key: 'results', label: 'Results' },
  ]

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Organizer workspace</p>
          <h1>{tournament.title}</h1>
          <p className="muted">
            {tournament.category_name ?? 'Uncategorized'} · <Tag tone={tMeta.tone}>{tMeta.label}</Tag> · {location}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditOpen(true)}><IconEdit size={15} /> Edit</Button>
          <Button variant="secondary" onClick={() => setStatusOpen(true)}><IconSettings size={15} /> Change status</Button>
          <Button variant="secondary" onClick={() => setPackageOpen(true)}><IconPlus size={15} /> Add package</Button>
          <Button variant="primary" disabled={!resultsEnabled} onClick={() => setTab('results')}><IconTrophy size={15} /> Enter results</Button>
        </div>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card className="mt-5">
        <div className="card-body" style={{ padding: 'var(--space-4)' }}>
          <div className="grid-4">
            <div>
              <p className="tiny muted" style={{ marginBottom: '0.2rem' }}>Dates</p>
              <p style={{ fontWeight: 600, margin: 0 }}>{formatDate(tournament.start_date)}{tournament.end_date ? ` → ${formatDate(tournament.end_date)}` : ''}</p>
            </div>
            <div>
              <p className="tiny muted" style={{ marginBottom: '0.2rem' }}>Registration deadline</p>
              <p style={{ fontWeight: 600, margin: 0 }}>{formatDateTime(tournament.registration_deadline)}</p>
            </div>
            <div>
              <p className="tiny muted" style={{ marginBottom: '0.2rem' }}>Location</p>
              <p style={{ fontWeight: 600, margin: 0 }}>{location}</p>
            </div>
            <div>
              <p className="tiny muted" style={{ marginBottom: '0.2rem' }}>Capacity</p>
              <p style={{ fontWeight: 600, margin: 0 }}>{tournament.participant_count} / {tournament.max_participants}</p>
            </div>
          </div>
        </div>
      </Card>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="mt-5">
        {tab === 'applications' ? <ApplicationsTab apps={apps} onChanged={load} /> : null}
        {tab === 'participants' ? <ParticipantsTab participants={tournament.participants} /> : null}
        {tab === 'packages' ? <PackagesTab packages={tournament.packages} /> : null}
        {tab === 'sponsors' ? <SponsorsTab sponsors={tournament.activeSponsors} /> : null}
        {tab === 'results' ? <ResultsTab tournamentId={tournament.id} participants={tournament.participants} status={tournament.status} onChanged={load} /> : null}
      </div>

      <EditDetailsModal open={editOpen} onClose={() => setEditOpen(false)} tournament={tournament} categories={categories} onSaved={load} />
      <ChangeStatusModal open={statusOpen} onClose={() => setStatusOpen(false)} tournament={tournament} onSaved={load} />
      <AddPackageModal open={packageOpen} onClose={() => setPackageOpen(false)} tournament={tournament} onSaved={load} />
    </div>
  )
}

function ApplicationsTab({ apps, onChanged }: { apps: ApplicationRow[]; onChanged: () => void }) {
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const filters: { value: ApplicationStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'waitlisted', label: 'Waitlisted' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'withdrawn', label: 'Withdrawn' },
  ]

  const rows = filter === 'all' ? apps : apps.filter((a) => a.status === filter)

  async function decide(row: ApplicationRow, next: Decision) {
    setBusyId(row.id)
    setError(null)
    setNotice(null)
    try {
      await applicationsApi.decide(row.id, next)
      setNotice(`Application ${next}.`)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the application.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card className="side-page">
      <div className="card-body" style={{ padding: 0 }}>
        <div style={{ padding: 'var(--space-4) var(--space-5)' }}>
          {notice ? <Alert tone="success">{notice}</Alert> : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex gap-2">
            {filters.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`chip${filter === f.value ? ' chip-active' : ''}`}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon="👥"
            title="No applications here"
            body="Applications appear the moment athletes apply. Open registration to receive them."
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Athlete</th>
                <th>Applied</th>
                <th>Status</th>
                <th>Notes</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const meta = APPLICATIONS_STATUS_META[a.status] ?? APPLICATIONS_STATUS_META.pending
                const busy = busyId === a.id
                return (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.athlete_name ?? '—'}</td>
                    <td className="muted small">{formatDate(a.applied_at)}</td>
                    <td><Tag tone={meta.tone}>{meta.label}</Tag></td>
                    <td className="muted small">{a.notes ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {a.status === 'pending' || a.status === 'waitlisted' ? (
                        <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                          <Button variant="primary" size="sm" disabled={busy} onClick={() => decide(a, 'approved')}>{busy ? '…' : 'Approve'}</Button>
                          {a.status === 'pending' ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => decide(a, 'waitlisted')}>Waitlist</Button> : null}
                          <Button variant="danger-soft" size="sm" disabled={busy} onClick={() => decide(a, 'rejected')}>Reject</Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  )
}

function ParticipantsTab({ participants }: { participants: TournamentParticipant[] }) {
  return (
    <Card className="side-page">
      <div className="card-head">
        <h3>Participants</h3>
        <IconUsers size={18} className="muted-icon" />
      </div>
      <div className="card-body">
        {participants.length === 0 ? (
          <EmptyState
            icon="👥"
            title="No participants yet"
            body="Approve applications and confirmed athletes will show up here."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {participants.map((p) => (
              <div className="row" key={p.id}>
                <Avatar name={`${p.first_name ?? ''} ${p.last_name ?? ''}`} size="sm" />
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, margin: 0 }}>{displayName(p)}</p>
                  <p className="tiny muted" style={{ margin: 0 }}>
                    {[p.city, p.country].filter(Boolean).join(', ') || '—'} · {p.sport_count} sport{p.sport_count === 1 ? '' : 's'}
                  </p>
                </div>
                <VerificationTag status={p.verification_status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

function PackagesTab({ packages }: { packages: SponsorshipPackage[] }) {
  const sorted = [...packages].sort((a, b) => Number(b.price) - Number(a.price))
  return (
    <Card className="side-page">
      <div className="card-head">
        <h3>Sponsorship packages</h3>
      </div>
      <div className="card-body">
        {sorted.length === 0 ? (
          <EmptyState
            icon="🎁"
            title="No packages yet"
            body="Add sponsorship packages so sponsors can request slots for this tournament."
          />
        ) : (
          <div className="grid-2">
            {sorted.map((p) => (
              <Card key={p.id}>
                <div className="card-head">
                  <h3>{p.name}</h3>
                  <Tag tone="brand">{String(p.price)} {p.currency}</Tag>
                </div>
                <div className="card-body" style={{ paddingTop: 0 }}>
                  {p.benefits_description ? <p className="small muted">{p.benefits_description}</p> : <p className="small muted">No benefits described.</p>}
                  <p className="tiny muted" style={{ marginTop: 'var(--space-3)' }}>Slots {p.active_slots}/{p.max_slots}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

function SponsorsTab({ sponsors }: { sponsors: ActiveSponsor[] }) {
  return (
    <Card className="side-page">
      <div className="card-head">
        <h3>Active sponsors</h3>
      </div>
      <div className="card-body">
        {sponsors.length === 0 ? (
          <EmptyState
            icon="🤝"
            title="No active sponsors"
            body="Sponsors that request and get approved for a package will appear here."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {sponsors.map((s) => (
              <div className="row" key={s.id}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, margin: 0 }}>{s.company_name ?? '—'}</p>
                  <p className="tiny muted" style={{ margin: 0 }}>{s.country ?? '—'}</p>
                </div>
                <Tag tone="info">{s.package_name}</Tag>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

function ResultsTab({ tournamentId, participants, status, onChanged }: { tournamentId: string; participants: TournamentParticipant[]; status: TournamentStatus; onChanged: () => void }) {
  const [entries, setEntries] = useState<Record<string, { placement: string; prize: string }>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const enabled = RESULTS_ENABLED.includes(status)

  useEffect(() => {
    setEntries((prev) => {
      const next = { ...prev }
      for (const p of participants) {
        if (!next[p.id]) next[p.id] = { placement: '', prize: '' }
      }
      return next
    })
  }, [participants])

  const setField = (id: string, key: 'placement' | 'prize', value: string) =>
    setEntries((prev) => {
      const cur = prev[id] ?? { placement: '', prize: '' }
      return { ...prev, [id]: { ...cur, [key]: value } }
    })

  async function save() {
    const results = participants
      .map((p) => {
        const entry = entries[p.id]
        const placement = Number(entry?.placement)
        if (!entry?.placement || !Number.isInteger(placement) || placement < 1) return null
        return { athlete_id: p.id, placement, prize_description: entry.prize.trim() || undefined }
      })
      .filter((r): r is { athlete_id: string; placement: number; prize_description: string | undefined } => r !== null)

    if (results.length === 0) {
      setError('Enter a placement for at least one participant.')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const { tournamentStatus } = await tournamentsApi.enterResults(tournamentId, results)
      setNotice(`Saved results for ${results.length} athlete${results.length === 1 ? '' : 's'}.${tournamentStatus === 'completed' && status === 'ongoing' ? ' Tournament marked completed.' : ''}`)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save results.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="side-page">
      <div className="card-head">
        <h3>Enter results</h3>
        {notice ? <span className="small" style={{ color: 'var(--success-fg)' }}>{notice}</span> : null}
      </div>
      <div className="card-body">
        {!enabled ? (
          <Alert tone="info">Results can be entered once the tournament is ongoing or completed.</Alert>
        ) : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {participants.length === 0 ? (
          <EmptyState
            icon="🏆"
            title="No participants to rank"
            body="Approved applications become participants you can enter results for."
          />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {participants.map((p) => (
                <div className="row" key={p.id}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, margin: 0 }}>{displayName(p)}</p>
                    <p className="tiny muted" style={{ margin: 0 }}>{p.city || p.country || '—'}</p>
                  </div>
                  <Input type="number" min={1} step={1} value={entries[p.id]?.placement ?? ''} onChange={(e) => setField(p.id, 'placement', e.target.value)} placeholder="Placement" style={{ width: '7.5rem' }} />
                  <Input value={entries[p.id]?.prize ?? ''} onChange={(e) => setField(p.id, 'prize', e.target.value)} placeholder="Prize (optional)" style={{ width: '11rem' }} />
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Button variant="primary" disabled={busy || !enabled} onClick={save}>{busy ? 'Saving…' : 'Save results'}</Button>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

interface EditForm {
  title: string
  category_id: string
  description: string
  eligibility_requirements: string
  location_country: string
  location_city: string
  registration_deadline: string
  start_date: string
  end_date: string
  max_participants: string
}

function toEditForm(t: TournamentDetail): EditForm {
  return {
    title: t.title,
    category_id: t.category_id ?? '',
    description: t.description ?? '',
    eligibility_requirements: t.eligibility_requirements ?? '',
    location_country: t.location_country ?? '',
    location_city: t.location_city ?? '',
    registration_deadline: toLocalInput(t.registration_deadline),
    start_date: t.start_date,
    end_date: t.end_date ?? '',
    max_participants: String(t.max_participants),
  }
}

function EditDetailsModal({ open, onClose, tournament, categories, onSaved }: { open: boolean; onClose: () => void; tournament: TournamentDetail; categories: TournamentCategory[]; onSaved: () => void }) {
  const [form, setForm] = useState<EditForm>(() => toEditForm(tournament))
  const [errors, setErrors] = useState<Partial<Record<keyof EditForm, string>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(toEditForm(tournament))
      setErrors({})
      setError(null)
    }
  }, [open, tournament])

  const set = (key: keyof EditForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  async function save() {
    const e: Partial<Record<keyof EditForm, string>> = {}
    if (!form.title.trim()) e.title = 'Title is required.'
    if (!form.registration_deadline) e.registration_deadline = 'Registration deadline is required.'
    if (!form.start_date) e.start_date = 'Start date is required.'
    if (!form.max_participants || Number(form.max_participants) < 1) e.max_participants = 'Max participants must be at least 1.'
    if (form.end_date && form.start_date && form.end_date < form.start_date) e.end_date = 'End date must be after the start date.'
    setErrors(e)
    if (Object.keys(e).length > 0) return
    setBusy(true)
    setError(null)
    try {
      await tournamentsApi.update(tournament.id, {
        title: form.title.trim() || undefined,
        description: form.description.trim() || undefined,
        category_id: form.category_id || undefined,
        eligibility_requirements: form.eligibility_requirements.trim() || undefined,
        location_country: form.location_country.trim() || undefined,
        location_city: form.location_city.trim() || undefined,
        registration_deadline: new Date(form.registration_deadline).toISOString(),
        start_date: form.start_date,
        end_date: form.end_date || undefined,
        max_participants: Math.floor(Number(form.max_participants)),
      })
      onClose()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit tournament details" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</Button>
      </>
    }>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-col gap-3">
        <Field label="Title" error={errors.title}>
          <Input value={form.title} onChange={set('title')} />
        </Field>
        {categories.length > 0 ? (
          <Field label="Category">
            <Select
              options={[{ value: '', label: 'No category' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
              value={form.category_id}
              onChange={set('category_id')}
            />
          </Field>
        ) : null}
        <Field label="Description">
          <textarea className="input" rows={3} value={form.description} onChange={set('description')} placeholder="What should athletes know?" />
        </Field>
        <Field label="Eligibility requirements">
          <textarea className="input" rows={2} value={form.eligibility_requirements} onChange={set('eligibility_requirements')} placeholder="Age limits, ranking thresholds…" />
        </Field>
        <div className="grid-2">
          <Field label="Country">
            <Input value={form.location_country} onChange={set('location_country')} placeholder="Country" />
          </Field>
          <Field label="City">
            <Input value={form.location_city} onChange={set('location_city')} placeholder="City" />
          </Field>
        </div>
        <Field label="Registration deadline" error={errors.registration_deadline}>
          <Input type="datetime-local" value={form.registration_deadline} onChange={set('registration_deadline')} />
        </Field>
        <div className="grid-2">
          <Field label="Start date" error={errors.start_date}>
            <Input type="date" value={form.start_date} onChange={set('start_date')} />
          </Field>
          <Field label="End date" error={errors.end_date}>
            <Input type="date" value={form.end_date} onChange={set('end_date')} />
          </Field>
        </div>
        <Field label="Max participants" error={errors.max_participants}>
          <Input type="number" min={1} max={100000} value={form.max_participants} onChange={set('max_participants')} />
        </Field>
      </div>
    </Modal>
  )
}

function ChangeStatusModal({ open, onClose, tournament, onSaved }: { open: boolean; onClose: () => void; tournament: TournamentDetail; onSaved: () => void }) {
  const allowed = TRANSITIONS[tournament.status]
  const [target, setTarget] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTarget(TRANSITIONS[tournament.status][0] ?? '')
      setError(null)
    }
  }, [open, tournament.status])

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await tournamentsApi.update(tournament.id, { status: target as TournamentStatus })
      onClose()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the status.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Change tournament status" footer={
      allowed.length === 0 ? (
        <Button variant="secondary" onClick={onClose}>Close</Button>
      ) : (
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || !target} onClick={save}>{busy ? 'Saving…' : 'Save status'}</Button>
        </>
      )
    }>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {allowed.length === 0 ? (
        <p className="small muted">This tournament has no allowed status changes remaining.</p>
      ) : (
        <Field label="Next status">
          <Select
            options={allowed.map((s) => ({ value: s, label: TOURNAMENT_STATUS_META[s]?.label ?? s }))}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </Field>
      )}
    </Modal>
  )
}

function AddPackageModal({ open, onClose, tournament, onSaved }: { open: boolean; onClose: () => void; tournament: TournamentDetail; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [benefits, setBenefits] = useState('')
  const [maxSlots, setMaxSlots] = useState('')
  const [errors, setErrors] = useState<{ name?: string; price?: string; maxSlots?: string }>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setPrice('')
      setCurrency('USD')
      setBenefits('')
      setMaxSlots('')
      setErrors({})
      setError(null)
    }
  }, [open])

  async function save() {
    const e: { name?: string; price?: string; maxSlots?: string } = {}
    if (!name.trim()) e.name = 'Name is required.'
    if (price === '' || !Number.isFinite(Number(price)) || Number(price) < 0) e.price = 'Price must be a number, 0 or higher.'
    if (maxSlots !== '' && (!Number.isInteger(Number(maxSlots)) || Number(maxSlots) < 1)) e.maxSlots = 'Slots must be a whole number, 1 or more.'
    setErrors(e)
    if (Object.keys(e).length > 0) return
    setBusy(true)
    setError(null)
    try {
      await tournamentsApi.addPackage(tournament.id, {
        name: name.trim(),
        price: Number(price),
        currency: currency || 'USD',
        benefits_description: benefits.trim() || undefined,
        max_slots: maxSlots ? Math.floor(Number(maxSlots)) : 1,
      })
      onClose()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the package.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add sponsorship package" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={busy} onClick={save}>{busy ? 'Adding…' : 'Add package'}</Button>
      </>
    }>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-col gap-3">
        <Field label="Name" error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Title sponsor" />
        </Field>
        <div className="grid-2">
          <Field label="Price" error={errors.price}>
            <Input type="number" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 2500" />
          </Field>
          <Field label="Currency">
            <Select options={[{ value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }, { value: 'GBP', label: 'GBP' }]} value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </Field>
        </div>
        <Field label="Available slots" hint="How many sponsors can take this package. Leave empty for 1." error={errors.maxSlots}>
          <Input type="number" min={1} max={1000} value={maxSlots} onChange={(e) => setMaxSlots(e.target.value)} placeholder="1" />
        </Field>
        <Field label="Benefits">
          <textarea className="input" rows={3} value={benefits} onChange={(e) => setBenefits(e.target.value)} placeholder="Banner placement, trophy naming, mentions…" />
        </Field>
      </div>
    </Modal>
  )
}
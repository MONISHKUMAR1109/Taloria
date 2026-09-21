import { useCallback, useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Field, Input, Select, Spinner } from '../../components/ui'
import { tournamentsApi } from '../../lib/endpoints'
import type { TournamentCategory } from '../../lib/types'

interface FormState {
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

const EMPTY: FormState = {
  title: '',
  category_id: '',
  description: '',
  eligibility_requirements: '',
  location_country: '',
  location_city: '',
  registration_deadline: '',
  start_date: '',
  end_date: '',
  max_participants: '',
}

type FormErrors = Partial<Record<keyof FormState, string>>

export function OrganizerTournamentForm() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<TournamentCategory[]>([])
  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<FormErrors>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const set = (key: keyof FormState) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const load = useCallback(() => {
    let alive = true
    tournamentsApi
      .categories()
      .then((cats) => {
        if (alive) {
          setCategories(cats ?? [])
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <Spinner />

  function validate(): FormErrors {
    const e: FormErrors = {}
    if (!form.title.trim()) e.title = 'Title is required.'
    if (!form.registration_deadline) e.registration_deadline = 'Registration deadline is required.'
    if (!form.start_date) e.start_date = 'Start date is required.'
    const max = Number(form.max_participants)
    if (!form.max_participants || !Number.isFinite(max) || max < 1) e.max_participants = 'Max participants must be at least 1.'
    if (form.end_date && form.start_date && form.end_date < form.start_date) e.end_date = 'End date must be after the start date.'
    return e
  }

  async function submit() {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length > 0) return
    setBusy(true)
    setError(null)
    try {
      const created = await tournamentsApi.create({
        title: form.title.trim(),
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
      navigate(`/dashboard/organizer/tournaments/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the tournament.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Organizer workspace</p>
          <h1>Create a tournament</h1>
          <p className="muted">New tournaments start as drafts and only become visible once you publish them.</p>
        </div>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card className="side-page mt-5">
        <div className="card-head">
          <h3>Tournament details</h3>
        </div>
        <div className="card-body">
          <div className="grid-2">
            <Field label="Title" error={errors.title}>
              <Input value={form.title} onChange={set('title')} placeholder="e.g. National U-18 Open Championship" />
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
          </div>
          <div className="mt-3">
            <Field label="Description">
              <textarea className="input" rows={4} value={form.description} onChange={set('description')} placeholder="What should athletes know about this tournament?" />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Eligibility requirements">
              <textarea className="input" rows={3} value={form.eligibility_requirements} onChange={set('eligibility_requirements')} placeholder="Age limits, ranking thresholds, gear requirements…" />
            </Field>
          </div>
          <div className="grid-2 mt-3">
            <Field label="Country">
              <Input value={form.location_country} onChange={set('location_country')} placeholder="Country" />
            </Field>
            <Field label="City">
              <Input value={form.location_city} onChange={set('location_city')} placeholder="City" />
            </Field>
          </div>
          <div className="grid-2 mt-3">
            <Field label="Registration deadline" hint="Applications close at this moment." error={errors.registration_deadline}>
              <Input type="datetime-local" value={form.registration_deadline} onChange={set('registration_deadline')} />
            </Field>
            <Field label="Max participants" error={errors.max_participants}>
              <Input type="number" min={1} max={100000} value={form.max_participants} onChange={set('max_participants')} placeholder="e.g. 32" />
            </Field>
          </div>
          <div className="grid-2 mt-3">
            <Field label="Start date" error={errors.start_date}>
              <Input type="date" value={form.start_date} onChange={set('start_date')} />
            </Field>
            <Field label="End date" error={errors.end_date}>
              <Input type="date" value={form.end_date} onChange={set('end_date')} />
            </Field>
          </div>
          <div className="mt-4">
            <Button variant="primary" disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create tournament'}</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
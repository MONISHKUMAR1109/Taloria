import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useProfileId } from '../../auth/useProfile'
import { Alert, Avatar, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, Tabs, Tag } from '../../components/ui'
import { IconCheck, IconFilm, IconPlus, IconTrophy, IconUpload } from '../../components/Icons'
import { athletesApi, mediaUrl, sportsApi } from '../../lib/endpoints'
import { formatDate } from '../../lib/format'
import type { AthleteAchievement, AthleteDetail, AthleteSport, AthleteStatistic, Sport } from '../../lib/types'

type TabKey = 'overview' | 'sports' | 'statistics' | 'achievements' | 'videos'

export function AthleteProfile() {
  const { profileId, loading: profileLoading } = useProfileId()
  const [athlete, setAthlete] = useState<AthleteDetail | null>(null)
  const [sports, setSports] = useState<Sport[]>([])
  const [tab, setTab] = useState<TabKey>('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!profileId) return
    let alive = true
    setLoading(true)
    Promise.all([athletesApi.get(profileId), sportsApi.list()])
      .then(([a, s]) => {
        if (!alive) return
        setAthlete(a)
        setSports(s)
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

  if (profileLoading || loading || !athlete) {
    return loading ? <Spinner /> : <Alert tone="danger">{error ?? 'Unable to load your profile.'}</Alert>
  }

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'sports', label: 'Sports', count: athlete.sports.length },
    { key: 'statistics', label: 'Statistics', count: athlete.statistics.length },
    { key: 'achievements', label: 'Achievements', count: athlete.achievements.length },
    { key: 'videos', label: 'Videos', count: athlete.videos.length },
  ]

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Athlete workspace</p>
          <h1>My profile</h1>
          <p className="muted">Your profile is how scouts, organizers, and sponsors see you.</p>
        </div>
        <div className="flex gap-2">
          <ProfilePictureButton athlete={athlete} onDone={load} />
        </div>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex items-center gap-3 mt-4 mb-1">
        <Avatar name={`${athlete.first_name ?? ''} ${athlete.last_name ?? ''}`} src={mediaUrl(athlete.profile_picture_key)} size="xl" />
        <div>
          <h2 style={{ margin: 0 }}>
            {athlete.first_name ?? 'Unnamed'} {athlete.last_name ?? ''}
          </h2>
          <p className="small muted">
            {athlete.city || '—'} · {athlete.country || '—'} · Completeness {athlete.completeness}%
          </p>
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={(k) => setTab(k as TabKey)} />

      <div className="mt-5">
        {tab === 'overview' ? <OverviewTab athlete={athlete} onSaved={load} /> : null}
        {tab === 'sports' ? <SportsTab athlete={athlete} sports={sports} onChanged={load} /> : null}
        {tab === 'statistics' ? <StatisticsTab athlete={athlete} sports={sports} onChanged={load} /> : null}
        {tab === 'achievements' ? <AchievementsTab athlete={athlete} onChanged={load} /> : null}
        {tab === 'videos' ? <VideosTab athlete={athlete} onChanged={load} /> : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Picture upload                                                      */
/* ------------------------------------------------------------------ */

function ProfilePictureButton({ athlete, onDone }: { athlete: AthleteDetail; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await athletesApi.uploadPicture(athlete.id, file)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <Button variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
        <IconUpload size={15} /> {busy ? 'Uploading…' : athlete.profile_picture_key ? 'Change photo' : 'Add photo'}
      </Button>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Overview (edit base fields)                                         */
/* ------------------------------------------------------------------ */

function OverviewTab({ athlete, onSaved }: { athlete: AthleteDetail; onSaved: () => void }) {
  const [form, setForm] = useState({
    first_name: athlete.first_name ?? '',
    last_name: athlete.last_name ?? '',
    date_of_birth: athlete.date_of_birth ?? '',
    country: athlete.country ?? '',
    city: athlete.city ?? '',
    bio: athlete.bio ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  async function save() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await athletesApi.update(athlete.id, {
        first_name: form.first_name.trim() || undefined,
        last_name: form.last_name.trim() || undefined,
        date_of_birth: form.date_of_birth || undefined,
        country: form.country.trim() || undefined,
        city: form.city.trim() || undefined,
        bio: form.bio.trim() || undefined,
      })
      setNotice('Profile saved.')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="side-page">
      <div className="card-head">
        <h3>Basic details</h3>
      </div>
      <div className="card-body">
        {notice ? <Alert tone="success">{notice}</Alert> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="grid-2">
          <Field label="First name">
            <Input value={form.first_name} onChange={set('first_name')} placeholder="Alex" />
          </Field>
          <Field label="Last name">
            <Input value={form.last_name} onChange={set('last_name')} placeholder="Morgan" />
          </Field>
        </div>
        <div className="grid-2 mt-3">
          <Field label="Date of birth">
            <Input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
          </Field>
          <Field label="Country">
            <Input value={form.country} onChange={set('country')} placeholder="Country" />
          </Field>
        </div>
        <div className="grid-2 mt-3">
          <Field label="City">
            <Input value={form.city} onChange={set('city')} placeholder="City" />
          </Field>
          <Field label="Age category" hint={`Used by scouts for age filters.`}>
            <Input value={ageFromDob(form.date_of_birth)} disabled />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Bio" hint="Tell scouts what makes you stand out.">
            <textarea className="input" rows={4} value={form.bio} onChange={set('bio')} placeholder="I'm a midfielder with 8 years of competitive experience…" />
          </Field>
        </div>
        <div className="mt-4">
          <Button variant="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </div>
    </Card>
  )
}

function ageFromDob(iso: string | null | undefined): string {
  if (!iso) return '—'
  const dob = new Date(iso)
  if (Number.isNaN(dob.getTime())) return '—'
  const age = Math.max(0, Math.floor((Date.now() - dob.getTime()) / 31557600000))
  return `${age} years`
}

/* ------------------------------------------------------------------ */
/* Sports                                                              */
/* ------------------------------------------------------------------ */

function SportsTab({ athlete, sports, onChanged }: { athlete: AthleteDetail; sports: Sport[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [sportId, setSportId] = useState('')
  const [position, setPosition] = useState('')
  const [years, setYears] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const linked = new Set(athlete.sports.map((s) => s.id))
  const options = sports.filter((s) => !linked.has(s.id))

  async function submit() {
    if (!sportId) {
      setError('Pick a sport.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await athletesApi.addSport(athlete.id, {
        sport_id: sportId,
        position: position.trim() || undefined,
        years_experience: years ? Number(years) : undefined,
      })
      setOpen(false)
      setSportId('')
      setPosition('')
      setYears('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="side-page">
      <div className="card-head">
        <h3>Sports</h3>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><IconPlus size={14} /> Add sport</Button>
      </div>
      <div className="card-body">
        {athlete.sports.length === 0 ? (
          <EmptyState
            icon="🏅"
            title="No sports yet"
            body="Add at least one sport so scouts can find you and you can apply to tournaments."
            action={<Button variant="primary" size="sm" onClick={() => setOpen(true)}>Add your first sport</Button>}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {athlete.sports.map((s) => (
              <SportRow key={s.id} sport={s} />
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add a sport" footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={submit}>{busy ? 'Adding…' : 'Add sport'}</Button>
        </>
      }>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {options.length === 0 ? (
          <p className="small muted">All sports are already on your profile. You could update position or experience via the edit fields above.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label="Sport">
              <Select options={options.map((s) => ({ value: s.id, label: s.name }))} value={sportId} onChange={(e) => setSportId(e.target.value)} />
            </Field>
            <Field label="Position" hint="e.g. Striker, Point guard">
              <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Position" />
            </Field>
            <Field label="Years of experience">
              <Input type="number" min={0} max={60} value={years} onChange={(e) => setYears(e.target.value)} placeholder="Years" />
            </Field>
          </div>
        )}
      </Modal>
    </Card>
  )
}

function SportRow({ sport }: { sport: AthleteSport }) {
  return (
    <div className="row">
      <div className="tile-ico" style={{ width: '2.5rem', height: '2.5rem', fontSize: '0.8rem' }}>{sport.name.slice(0, 2).toUpperCase()}</div>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 700, margin: 0 }}>{sport.name}</p>
        <p className="tiny muted" style={{ margin: 0 }}>{[sport.position, sport.years_experience ? `${sport.years_experience} yrs` : null].filter(Boolean).join(' · ') || 'No position or experience set'}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

function StatisticsTab({ athlete, sports, onChanged }: { athlete: AthleteDetail; sports: Sport[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [sportId, setSportId] = useState('')
  const [recordedOn, setRecordedOn] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sport = sports.find((s) => s.id === sportId)
  const template = Array.isArray(sport?.stat_template) ? sport.stat_template : []
  const available = athlete.sports

  async function submit() {
    if (!sportId) {
      setError('Pick a sport.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const parsed: Record<string, string | number | boolean> = {}
      for (const row of template) {
        const raw = values[row.key]
        if (!raw) continue
        if (row.type === 'boolean') parsed[row.key] = raw === 'true'
        else if (row.type === 'int' || row.type === 'number') parsed[row.key] = Number(raw)
        else parsed[row.key] = raw
      }
      await athletesApi.addStatistic(athlete.id, {
        sport_id: sportId,
        recorded_on: recordedOn || undefined,
        stat_values: parsed,
      })
      setOpen(false)
      setSportId('')
      setRecordedOn('')
      setValues({})
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="side-page">
      <div className="card-head">
        <h3>Statistics</h3>
        <Button variant="secondary" size="sm" disabled={available.length === 0} onClick={() => setOpen(true)}><IconPlus size={14} /> Record statistic</Button>
      </div>
      <div className="card-body">
        {athlete.statistics.length === 0 ? (
          <EmptyState
            icon="📊"
            title="No statistics yet"
            body={
              available.length === 0
                ? 'Add a sport to your profile before recording statistics.'
                : 'Record measurable stats — scouts filter by them, e.g. fastest 100m or rebounds per game.'
            }
            action={available.length > 0 ? <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Record your first stat</Button> : undefined}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {athlete.statistics.map((st) => (
              <StatRow key={st.id} stat={st} />
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Record a statistic" footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Save statistic'}</Button>
        </>
      }>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="flex flex-col gap-3">
          <Field label="Sport">
            <Select
              options={available.map((s) => ({ value: s.id, label: s.name }))}
              value={sportId}
              onChange={(e) => {
                setSportId(e.target.value)
                setValues({})
              }}
            />
          </Field>
          <Field label="Recorded on">
            <Input type="date" value={recordedOn} onChange={(e) => setRecordedOn(e.target.value)} />
          </Field>
          {sportId ? (
            template.length === 0 ? (
              <p className="small muted">This sport has no statistic fields defined yet.</p>
            ) : (
              template.map((row) => (
                <Field key={row.key} label={row.label}>
                  {row.type === 'boolean' ? (
                    <Select options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} value={values[row.key] ?? 'true'} onChange={(e) => setValues((v) => ({ ...v, [row.key]: e.target.value }))} />
                  ) : row.type === 'int' || row.type === 'number' ? (
                    <Input type="number" step="any" value={values[row.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [row.key]: e.target.value }))} placeholder={row.label} />
                  ) : row.type === 'date' ? (
                    <Input type="date" value={values[row.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [row.key]: e.target.value }))} />
                  ) : (
                    <Input value={values[row.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [row.key]: e.target.value }))} placeholder={row.label} />
                  )}
                </Field>
              ))
            )
          ) : null}
        </div>
      </Modal>
    </Card>
  )
}

function StatRow({ stat }: { stat: AthleteStatistic }) {
  const entries = Object.entries(stat.stat_values)
  return (
    <div className="row">
      <div className="tile-ico-green" style={{ width: '2.5rem', height: '2.5rem', fontSize: '0.8rem' }}>📊</div>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 700, margin: 0 }}>{stat.sport_name}</p>
        <p className="tiny muted" style={{ margin: 0 }}>Recorded {formatDate(stat.recorded_on)}</p>
      </div>
      <div className="flex gap-2">
        {entries.map(([k, v]) => (
          <Tag key={k} tone="info">{k}: {String(v)}</Tag>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Achievements                                                        */
/* ------------------------------------------------------------------ */

function AchievementsTab({ athlete, onChanged }: { athlete: AthleteDetail; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [achievedAt, setAchievedAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!title.trim()) {
      setError('Give the achievement a title.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await athletesApi.addAchievement(athlete.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        achieved_at: achievedAt || undefined,
      })
      setOpen(false)
      setTitle('')
      setDescription('')
      setAchievedAt('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="side-page">
      <div className="card-head">
        <h3>Achievements</h3>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><IconPlus size={14} /> Add achievement</Button>
      </div>
      <div className="card-body">
        {athlete.achievements.length === 0 ? (
          <EmptyState
            icon="🏆"
            title="No achievements yet"
            body="Championships, selections, personal bests — anything that proves your level."
            action={<Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Add an achievement</Button>}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {athlete.achievements.map((a) => (
              <AchievementRow key={a.id} achievement={a} />
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add an achievement" footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Save achievement'}</Button>
        </>
      }>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="flex flex-col gap-3">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. National U-18 Champion" />
          </Field>
          <Field label="Description">
            <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What did you achieve and in what context?" />
          </Field>
          <Field label="Achieved on">
            <Input type="date" value={achievedAt} onChange={(e) => setAchievedAt(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </Card>
  )
}

function AchievementRow({ achievement }: { achievement: AthleteAchievement }) {
  return (
    <div className="row">
      <div className="tile-ico-violet" style={{ width: '2.5rem', height: '2.5rem', fontSize: '0.8rem' }}><IconTrophy size={15} /></div>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 700, margin: 0 }}>{achievement.title}</p>
        {achievement.description ? <p className="tiny muted" style={{ margin: 0 }}>{achievement.description}</p> : null}
      </div>
      {achievement.achieved_at ? <Tag tone="muted">{formatDate(achievement.achieved_at)}</Tag> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Videos                                                              */
/* ------------------------------------------------------------------ */

function VideosTab({ athlete, onChanged }: { athlete: AthleteDetail; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const MAX = 200 * 1024 * 1024
  const full = athlete.videos.length >= 3

  async function submit() {
    if (!title.trim()) {
      setError('Give the video a title.')
      return
    }
    if (!file) {
      setError('Choose a video file (MP4 or MOV).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await athletesApi.uploadVideo(athlete.id, title.trim(), file)
      setOpen(false)
      setTitle('')
      setFile(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="side-page">
      <div className="card-head">
        <h3>Performance videos</h3>
        <Button variant="secondary" size="sm" disabled={full} onClick={() => setOpen(true)}><IconPlus size={14} /> Upload video{full ? ' (limit 3)' : ''}</Button>
      </div>
      <div className="card-body">
        {athlete.videos.length === 0 ? (
          <EmptyState
            icon="🎬"
            title="No videos yet"
            body="Upload up to three short showreels (MP4/MOV, max 200 MB) so scouts can watch you play."
            action={<Button variant="secondary" size="sm" disabled={full} onClick={() => setOpen(true)}>Upload a video</Button>}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {athlete.videos.map((v) => (
              <div className="row" key={v.id}>
                <div className="tile-ico" style={{ width: '2.5rem', height: '2.5rem', fontSize: '0.8rem' }}><IconFilm size={15} /></div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, margin: 0 }}>{v.title}</p>
                  <p className="tiny muted" style={{ margin: 0 }}>{formatDate(v.created_at)} · {Math.max(1, Math.round(v.size_bytes / 1048576))} MB</p>
                </div>
                <video
                  src={mediaUrl(v.object_key)}
                  controls
                  preload="metadata"
                  style={{ width: '12rem', borderRadius: 'var(--radius-md)', aspectRatio: '16 / 9', background: '#000' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Upload a performance video" footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={submit}>{busy ? 'Uploading…' : 'Upload video'}</Button>
        </>
      }>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="flex flex-col gap-3">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 2026 season highlights" />
          </Field>
          <Field label="File" hint="MP4 or MOV, up to 200 MB.">
            <Input
              type="file"
              accept="video/mp4,video/quicktime"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f && f.size > MAX) {
                  setError('File is larger than 200 MB.')
                  setFile(null)
                } else {
                  setError(null)
                  setFile(f ?? null)
                }
              }}
            />
          </Field>
          {file ? (
            <p className="small muted">
              <IconCheck size={13} /> Ready: {file.name} ({Math.max(1, Math.round(file.size / 1048576))} MB)
            </p>
          ) : null}
        </div>
      </Modal>
    </Card>
  )
}
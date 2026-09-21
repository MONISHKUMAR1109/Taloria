import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, Avatar, Button, Card, Field, Modal, Progress, Spinner, Tabs, Tag, VerificationTag } from '../../components/ui'
import { IconChat, IconEdit, IconFilm, IconStar, IconTrophy, IconTrending } from '../../components/Icons'
import { athletesApi, displayName, mediaUrl, messagesApi, scoutingApi } from '../../lib/endpoints'
import { formatDate } from '../../lib/format'
import type { ApplicationStatus, AthleteDetail, ShortlistedAthlete } from '../../lib/types'
import { APPLICATIONS_STATUS_META } from '../athlete/status'

type TabKey = 'sports' | 'achievements' | 'videos' | 'tournaments'

export function ScoutAthleteDetail() {
  const { id } = useParams<{ id: string }>()
  const [athlete, setAthlete] = useState<AthleteDetail | null>(null)
  const [shortlist, setShortlist] = useState<ShortlistedAthlete[]>([])
  const [tab, setTab] = useState<TabKey>('sports')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msgOpen, setMsgOpen] = useState(false)
  const [msgText, setMsgText] = useState('')
  const [msgBusy, setMsgBusy] = useState(false)
  const [msgError, setMsgError] = useState<string | null>(null)
  const [msgNotice, setMsgNotice] = useState<string | null>(null)
  const [shortlistBusy, setShortlistBusy] = useState(false)
  const [shortlistNotice, setShortlistNotice] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!id) return
    let alive = true
    setLoading(true)
    Promise.all([athletesApi.get(id), scoutingApi.shortlist()])
      .then(([a, sl]) => {
        if (!alive) return
        setAthlete(a)
        setShortlist(sl)
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

  if (loading) return <Spinner />
  if (!athlete) return error ? <Alert tone="danger">{error}</Alert> : null

  const a = athlete
  const isShortlisted = shortlist.some((s) => s.id === a.id)
  const firstName = a.first_name ?? 'Athlete'

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'sports', label: 'Sports & stats' },
    { key: 'achievements', label: 'Achievements', count: athlete.achievements.length },
    { key: 'videos', label: 'Videos', count: athlete.videos.length },
    { key: 'tournaments', label: 'Tournaments', count: athlete.results.length + athlete.applications.length },
  ]

  async function sendMessage() {
    if (!msgText.trim()) {
      setMsgError('Write a message first.')
      return
    }
    setMsgBusy(true)
    setMsgError(null)
    setMsgNotice(null)
    try {
      await messagesApi.start(a.id, msgText.trim())
      setMsgNotice('Message sent. Follow up in your inbox.')
      setMsgOpen(false)
      setMsgText('')
    } catch (err) {
      setMsgError(err instanceof Error ? err.message : 'Could not send the message.')
    } finally {
      setMsgBusy(false)
    }
  }

  async function toggleShortlist() {
    setShortlistBusy(true)
    setShortlistNotice(null)
    setError(null)
    try {
      if (isShortlisted) {
        await scoutingApi.remove(a.id)
        setShortlist((sl) => sl.filter((s) => s.id !== a.id))
        setShortlistNotice('Removed from shortlist.')
      } else {
        await scoutingApi.add(a.id)
        setShortlist((sl) => [...sl, { id: a.id, name: displayName(a), country: a.country, city: a.city, date_of_birth: a.date_of_birth, verification_status: a.verification_status, sport_count: a.sport_count, note: null, shortlisted_at: new Date().toISOString() }])
        setShortlistNotice('Added to shortlist.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the shortlist.')
    } finally {
      setShortlistBusy(false)
    }
  }

  async function saveNote() {
    setNoteBusy(true)
    setNoteError(null)
    try {
      await scoutingApi.updateNote(a.id, noteText.trim())
      setNoteOpen(false)
      setShortlist((sl) => sl.map((s) => (s.id === a.id ? { ...s, note: noteText.trim() } : s)))
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : 'Could not save the note.')
    } finally {
      setNoteBusy(false)
    }
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Scout workspace</p>
          <h1>{displayName(athlete)}</h1>
          <p className="muted">Athlete profile · view stats, achievements, videos and tournament history.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { setNoteText(shortlist.find((s) => s.id === a.id)?.note ?? ''); setNoteError(null); setNoteOpen(true) }}>
            <IconEdit size={15} /> Notebook
          </Button>
          <Button variant="secondary" disabled={shortlistBusy} onClick={toggleShortlist}>
            <IconStar size={15} /> {shortlistBusy ? 'Updating…' : isShortlisted ? 'Shortlisted' : 'Shortlist'}
          </Button>
          <Button variant="primary" onClick={() => { setMsgError(null); setMsgNotice(null); setMsgOpen(true) }}>
            <IconChat size={15} /> Message
          </Button>
        </div>
      </div>

      {shortlistNotice ? <Alert tone="success">{shortlistNotice}</Alert> : null}
      {msgNotice ? (
        <Alert tone="success">{msgNotice} <Link to="/dashboard/messages" className="inline-link" style={{ marginLeft: '0.5rem' }}>Open inbox →</Link></Alert>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex items-center gap-4 mt-4">
        <Avatar
          name={displayName(athlete)}
          src={mediaUrl(athlete.profile_picture_key)}
          size="xl"
        />
        <div style={{ flex: 1 }}>
          <div className="flex items-center gap-2">
            <h2 style={{ margin: 0 }}>{displayName(athlete)}</h2>
            <VerificationTag status={athlete.verification_status} />
          </div>
          <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
            {athlete.city || '—'} · {athlete.country || '—'} · {athlete.sport_count} sports
          </p>
          {athlete.bio ? <p className="small muted" style={{ maxWidth: '60ch', margin: '0.5rem 0 0' }}>{athlete.bio}</p> : null}
        </div>
        <div style={{ width: '11rem' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="tiny muted">Completeness</span>
            <span className="tiny" style={{ fontWeight: 700 }}>{athlete.completeness}%</span>
          </div>
          <Progress value={athlete.completeness} />
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={(k) => setTab(k as TabKey)} />

      <div className="mt-5">
        {tab === 'sports' ? <SportsStatsTab athlete={athlete} /> : null}
        {tab === 'achievements' ? <AchievementsTab athlete={athlete} /> : null}
        {tab === 'videos' ? <VideosTab athlete={athlete} /> : null}
        {tab === 'tournaments' ? <TournamentsTab athlete={athlete} /> : null}
      </div>

      <Modal
        open={msgOpen}
        onClose={() => setMsgOpen(false)}
        title={`Message ${firstName}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMsgOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={msgBusy} onClick={sendMessage}>{msgBusy ? 'Sending…' : 'Send message'}</Button>
          </>
        }
      >
        {msgError ? <Alert tone="danger">{msgError}</Alert> : null}
        <div className="flex flex-col gap-3">
          <Field label="First message" hint="This starts a conversation with the athlete.">
            <textarea className="input" rows={5} value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder={`Hi ${firstName}, I'm a scout and would love to talk about…`} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        title={`Notebook · ${firstName}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setNoteOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={noteBusy} onClick={saveNote}>{noteBusy ? 'Saving…' : 'Save note'}</Button>
          </>
        }
      >
        {noteError ? <Alert tone="danger">{noteError}</Alert> : null}
        <div className="flex flex-col gap-3">
          <Field label="Private note" hint="Visible only to you, alongside this athlete on your shortlist.">
            <textarea className="input" rows={6} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Scouting notes, recruitment thoughts, follow-ups…" />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sports & statistics                                                */
/* ------------------------------------------------------------------ */

function SportsStatsTab({ athlete }: { athlete: AthleteDetail }) {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="card-head">
          <h3>Sports</h3>
        </div>
        <div className="card-body">
          {athlete.sports.length === 0 ? (
            <p className="small muted">No sports on record.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {athlete.sports.map((s) => (
                <div className="row" key={s.id}>
                  <div className="tile-ico" style={{ width: '2.5rem', height: '2.5rem', fontSize: '0.8rem' }}>{s.name.slice(0, 2).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, margin: 0 }}>{s.name}</p>
                    <p className="tiny muted" style={{ margin: 0 }}>{[s.position, s.years_experience ? `${s.years_experience} yrs` : null].filter(Boolean).join(' · ') || 'No position or experience set'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="card-head">
          <h3>Statistics</h3>
        </div>
        <div className="card-body">
          {athlete.statistics.length === 0 ? (
            <p className="small muted">No statistics recorded yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {athlete.statistics.map((st) => (
                <div className="row" key={st.id}>
                  <div className="tile-ico-green" style={{ width: '2.5rem', height: '2.5rem', fontSize: '0.8rem' }}><IconTrending size={15} /></div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, margin: 0 }}>{st.sport_name}</p>
                    <p className="tiny muted" style={{ margin: 0 }}>Recorded {formatDate(st.recorded_on)}</p>
                  </div>
                  <div className="flex gap-2">
                    {Object.entries(st.stat_values).map(([k, v]) => (
                      <Tag key={k} tone="info">{k}: {String(v)}</Tag>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Achievements                                                       */
/* ------------------------------------------------------------------ */

function AchievementsTab({ athlete }: { athlete: AthleteDetail }) {
  return (
    <Card>
      <div className="card-head">
        <h3>Achievements</h3>
      </div>
      <div className="card-body">
        {athlete.achievements.length === 0 ? (
          <p className="small muted">No achievements on record.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {athlete.achievements.map((a) => (
              <div className="row" key={a.id}>
                <div className="tile-ico-violet" style={{ width: '2.5rem', height: '2.5rem', fontSize: '0.8rem' }}><IconTrophy size={15} /></div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, margin: 0 }}>{a.title}</p>
                  {a.description ? <p className="tiny muted" style={{ margin: 0 }}>{a.description}</p> : null}
                </div>
                {a.achieved_at ? <Tag tone="muted">{formatDate(a.achieved_at)}</Tag> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Videos                                                             */
/* ------------------------------------------------------------------ */

function VideosTab({ athlete }: { athlete: AthleteDetail }) {
  return (
    <Card>
      <div className="card-head">
        <h3>Performance videos</h3>
      </div>
      <div className="card-body">
        {athlete.videos.length === 0 ? (
          <p className="small muted">No performance videos uploaded.</p>
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
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Tournaments (results + applications)                               */
/* ------------------------------------------------------------------ */

function TournamentsTab({ athlete }: { athlete: AthleteDetail }) {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="card-head">
          <h3>Results</h3>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {athlete.results.length === 0 ? (
            <p className="small muted" style={{ padding: 'var(--space-5)' }}>No results on record.</p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Tournament</th>
                  <th>Placement</th>
                  <th>Prize</th>
                </tr>
              </thead>
              <tbody>
                {athlete.results.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link className="table-link" to={`/tournaments/${r.tournament_id}`}>{r.tournament_title}</Link>
                    </td>
                    <td><Tag tone="brand">{ordinal(r.placement)}</Tag></td>
                    <td className="muted small">{r.prize_description ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Card>
        <div className="card-head">
          <h3>Applications</h3>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {athlete.applications.length === 0 ? (
            <p className="small muted" style={{ padding: 'var(--space-5)' }}>No applications recorded.</p>
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
                {athlete.applications.map((a) => {
                  const meta = a.status ? (APPLICATIONS_STATUS_META[a.status as ApplicationStatus] ?? APPLICATIONS_STATUS_META.pending) : undefined
                  return (
                    <tr key={a.id}>
                      <td>
                        <Link className="table-link" to={`/tournaments/${a.tournament_id}`}>{a.tournament_title}</Link>
                      </td>
                      <td className="muted small">{formatDate(a.applied_at)}</td>
                      <td>{meta ? <Tag tone={meta.tone}>{meta.label}</Tag> : <span className="muted small">—</span>}</td>
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

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Card, EmptyState, Field, Modal, Spinner, Tag, VerificationTag } from '../../components/ui'
import { IconEdit, IconSearch, IconStar } from '../../components/Icons'
import { scoutingApi } from '../../lib/endpoints'
import { formatDate } from '../../lib/format'
import type { ShortlistedAthlete } from '../../lib/types'

export function ScoutShortlist() {
  const [rows, setRows] = useState<ShortlistedAthlete[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [editing, setEditing] = useState<ShortlistedAthlete | null>(null)
  const [noteText, setNoteText] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)

  const load = useCallback(() => {
    let alive = true
    setLoading(true)
    scoutingApi
      .shortlist()
      .then((data) => {
        if (!alive) return
        setRows(data)
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

  async function remove(row: ShortlistedAthlete) {
    setRemoving(row.id)
    setError(null)
    setNotice(null)
    try {
      await scoutingApi.remove(row.id)
      setRows((r) => r.filter((x) => x.id !== row.id))
      setNotice(`${row.name} removed from your shortlist.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the athlete.')
    } finally {
      setRemoving(null)
    }
  }

  async function saveNote() {
    if (!editing) return
    setNoteBusy(true)
    setNoteError(null)
    try {
      await scoutingApi.updateNote(editing.id, noteText.trim())
      setRows((r) => r.map((x) => (x.id === editing.id ? { ...x, note: noteText.trim() } : x)))
      setEditing(null)
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
          <h1>Shortlist</h1>
          <p className="muted">Athletes you&apos;re tracking, with your private notes.</p>
        </div>
        <Link to="/dashboard/scout/talent">
          <Button variant="primary"><IconSearch size={15} /> Find talent</Button>
        </Link>
      </div>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card className="mt-5">
        <div className="card-body">
          {loading ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="⭐"
              title="No shortlisted athletes yet"
              body="Build your shortlist by hitting the star on any athlete."
              action={
                <Link to="/dashboard/scout/talent">
                  <Button variant="primary" size="sm">Start scouting</Button>
                </Link>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((row) => (
                <div className="row" key={row.id}>
                  <div className="tile-ico" style={{ width: '2.5rem', height: '2.5rem', fontSize: '0.8rem' }}><IconStar size={15} /></div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, margin: 0 }}>
                      <Link className="table-link" to={`/dashboard/scout/athletes/${row.id}`}>{row.name}</Link>
                    </p>
                    <p className="tiny muted" style={{ margin: 0 }}>
                      {[row.city, row.country].filter(Boolean).join(' · ') || '—'} · {row.sport_count} sports · shortlisted {formatDate(row.shortlisted_at)}
                    </p>
                    {row.note ? (
                      <p className="tiny muted" style={{ margin: '0.25rem 0 0' }}>
                        <Tag tone="info">Note</Tag> {row.note}
                      </p>
                    ) : null}
                  </div>
                  <VerificationTag status={row.verification_status} />
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setEditing(row); setNoteText(row.note ?? ''); setNoteError(null) }}
                    >
                      <IconEdit size={13} /> Note
                    </Button>
                    <Button variant="danger-soft" size="sm" disabled={removing === row.id} onClick={() => remove(row)}>
                      {removing === row.id ? 'Removing…' : 'Remove'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Notebook · ${editing.name}` : 'Notebook'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
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
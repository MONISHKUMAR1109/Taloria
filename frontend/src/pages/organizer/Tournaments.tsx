import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Pager, Select, Spinner, Tag } from '../../components/ui'
import { IconPlus } from '../../components/Icons'
import { tournamentsApi } from '../../lib/endpoints'
import { formatDate, formatDateTime } from '../../lib/format'
import type { Tournament } from '../../lib/types'
import { TOURNAMENT_STATUS_META } from '../athlete/status'

const PAGE_SIZE = 10

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'registration_open', label: 'Registration open' },
  { value: 'registration_closed', label: 'Registration closed' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
]

export function OrganizerTournaments() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Tournament[]>([])
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('all')
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((p: number, s: string) => {
    setLoading(true)
    tournamentsApi
      .mine({
        sort: 'created_at',
        order: 'desc',
        page: p,
        pageSize: PAGE_SIZE,
        status: s === 'all' ? undefined : s,
      })
      .then(({ data, meta }) => {
        setRows(data)
        setTotal(Number(meta?.total ?? 0))
        setTotalPages(Number(meta?.totalPages ?? 1))
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const loadPage = (p: number) => {
    setPage(p)
    load(p, status)
  }

  const changeStatus = (s: string) => {
    setStatus(s)
    setPage(1)
    load(1, s)
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Organizer workspace</p>
          <h1>My tournaments</h1>
          <p className="muted">Review applications, sponsorship slots, and results for every tournament you run.</p>
        </div>
        <Link to="/dashboard/organizer/tournaments/new">
          <Button variant="primary"><IconPlus size={15} /> Create tournament</Button>
        </Link>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="mt-5 mb-3" style={{ maxWidth: '16rem' }}>
        <Select options={STATUS_FILTERS} value={status} onChange={(e) => changeStatus(e.target.value)} />
      </div>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <div className="empty">
              <div>
                <p className="muted small" style={{ maxWidth: '40ch' }}>
                  No tournaments yet. Create your first tournament and publish it to start accepting applications.
                </p>
                <div className="mt-3">
                  <Link to="/dashboard/organizer/tournaments/new"><Button variant="primary" size="sm">Create tournament</Button></Link>
                </div>
              </div>
            </div>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Tournament</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Registration window</th>
                  <th>Participants</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const meta = TOURNAMENT_STATUS_META[t.status] ?? TOURNAMENT_STATUS_META.draft
                  return (
                    <tr key={t.id} className="clickable" onClick={() => navigate(`/dashboard/organizer/tournaments/${t.id}`)}>
                      <td>
                        <Link className="table-link" to={`/dashboard/organizer/tournaments/${t.id}`}>{t.title}</Link>
                      </td>
                      <td className="muted small">{t.category_name ?? '—'}</td>
                      <td><Tag tone={meta.tone}>{meta.label}</Tag></td>
                      <td className="small">
                        <div>Deadline {formatDateTime(t.registration_deadline)}</div>
                        <div className="muted">{formatDate(t.start_date)}{t.end_date ? ` → ${formatDate(t.end_date)}` : ''}</div>
                      </td>
                      <td className="small">{t.participant_count} / {t.max_participants}</td>
                      <td style={{ textAlign: 'right' }}>
                        <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/organizer/tournaments/${t.id}`) }}>View</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {totalPages > 1 ? (
        <Pager page={page} totalPages={totalPages} total={total} onChange={loadPage} />
      ) : null}
    </div>
  )
}
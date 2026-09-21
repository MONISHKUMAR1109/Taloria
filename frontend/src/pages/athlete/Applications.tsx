import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Card, Pager, Spinner, Tag } from '../../components/ui'
import { IconPlus } from '../../components/Icons'
import { applicationsApi, tournamentsApi } from '../../lib/endpoints'
import { formatDate } from '../../lib/format'
import type { ApplicationRow } from '../../lib/types'
import { APPLICATIONS_STATUS_META } from './status'

const PAGE_SIZE = 10

export function AthleteApplications() {
  const [rows, setRows] = useState<ApplicationRow[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback((p: number) => {
    setLoading(true)
    applicationsApi
      .list({ sort: 'applied_at', order: 'desc', page: p, pageSize: PAGE_SIZE })
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
    load(p)
  }

  async function withdraw(tournamentId: string) {
    setBusyId(tournamentId)
    setError(null)
    setNotice(null)
    try {
      await tournamentsApi.withdraw(tournamentId)
      setNotice('Application withdrawn.')
      load(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not withdraw the application.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Athlete workspace</p>
          <h1>My applications</h1>
          <p className="muted">Track every tournament you&apos;ve applied to.</p>
        </div>
        <Link to="/tournaments">
          <Button variant="primary"><IconPlus size={15} /> Browse tournaments</Button>
        </Link>
      </div>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card className="mt-5">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <div className="empty">
              <div>
                <p className="muted small" style={{ maxWidth: '40ch' }}>
                  No applications yet. Find an open tournament and take the stage.
                </p>
                <div className="mt-3">
                  <Link to="/tournaments"><Button variant="primary" size="sm">Explore tournaments</Button></Link>
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
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const meta = APPLICATIONS_STATUS_META[a.status] ?? APPLICATIONS_STATUS_META.pending
                  const canWithdraw = a.status !== 'withdrawn' && a.status !== 'rejected'
                  return (
                    <tr key={a.id}>
                      <td>
                        <Link className="table-link" to={`/tournaments/${a.tournament_id}`}>{a.tournament_title}</Link>
                      </td>
                      <td className="muted small">{formatDate(a.applied_at)}</td>
                      <td><Tag tone={meta.tone}>{meta.label}</Tag></td>
                      <td style={{ textAlign: 'right' }}>
                        {canWithdraw ? (
                          <Button variant="danger-soft" size="sm" disabled={busyId === a.tournament_id} onClick={() => withdraw(a.tournament_id)}>
                            {busyId === a.tournament_id ? 'Withdrawing…' : 'Withdraw'}
                          </Button>
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

      {totalPages > 1 ? (
        <Pager page={page} totalPages={totalPages} total={total} onChange={loadPage} />
      ) : null}
    </div>
  )
}
import { useCallback, useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Card, EmptyState, Pager, Select, Spinner, Tag } from '../../components/ui'
import { sponsorshipsApi } from '../../lib/endpoints'
import { formatDate } from '../../lib/format'
import type { SponsorshipRequest } from '../../lib/types'
import { SPONSORSHIP_STATUS_META } from '../athlete/status'

const PAGE_SIZE = 10

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
]

function money(price: string | number, currency: string): string {
  const n = Number(price)
  const formatted = Number.isFinite(n)
    ? n.toLocaleString(undefined, { maximumFractionDigits: n % 1 === 0 ? 0 : 2 })
    : String(price)
  return `${formatted} ${currency}`
}

export function SponsorRequests() {
  const [rows, setRows] = useState<SponsorshipRequest[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(
    (p: number) => {
      let alive = true
      setLoading(true)
      sponsorshipsApi
        .list({ sort: 'requested_at', order: 'desc', page: p, pageSize: PAGE_SIZE, status: status || undefined })
        .then(({ data, meta }) => {
          if (!alive) return
          setRows(data)
          setTotal(Number(meta?.total ?? 0))
          setTotalPages(Number(meta?.totalPages ?? 1))
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
    },
    [status],
  )

  useEffect(() => {
    load(page)
  }, [load, page])

  function onStatusChange(e: ChangeEvent<HTMLSelectElement>) {
    setStatus(e.target.value)
    setPage(1)
  }

  async function cancel(id: string) {
    setBusyId(id)
    setError(null)
    setNotice(null)
    try {
      await sponsorshipsApi.decide(id, 'cancelled')
      setNotice('Request cancelled.')
      load(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel the request.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Sponsor workspace</p>
          <h1>My sponsorship requests</h1>
          <p className="muted">Track every package you&apos;ve asked to back.</p>
        </div>
        <Link to="/tournaments">
          <Button variant="primary">Browse tournaments</Button>
        </Link>
      </div>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="toolbar mt-5">
        <Select options={STATUS_FILTERS} value={status} onChange={onStatusChange} aria-label="Filter by status" />
      </div>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="🤝"
              title="No sponsorship requests"
              body={
                status
                  ? `No ${status} requests right now. Try a different status filter.`
                  : 'You have not requested any sponsorships yet. Find a tournament and pick a package.'
              }
              action={<Link to="/tournaments"><Button variant="primary" size="sm">Browse tournaments</Button></Link>}
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Tournament</th>
                  <th>Package</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const meta = SPONSORSHIP_STATUS_META[r.status] ?? SPONSORSHIP_STATUS_META.pending
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link to={`/tournaments/${r.tournament_id}`} className="table-link">{r.tournament_title}</Link>
                      </td>
                      <td className="small">{r.package_name}</td>
                      <td className="small">{money(r.price, r.currency)}</td>
                      <td>
                        <Tag tone={meta.tone}>{meta.label}</Tag>
                      </td>
                      <td className="muted small">{formatDate(r.requested_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {r.status === 'pending' ? (
                          <Button variant="danger-soft" size="sm" disabled={busyId === r.id} onClick={() => cancel(r.id)}>
                            {busyId === r.id ? 'Cancelling…' : 'Cancel request'}
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
        <Pager page={page} totalPages={totalPages} total={total} onChange={setPage} />
      ) : null}
    </div>
  )
}
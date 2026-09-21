import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Card, EmptyState, Input, Pager, Select, Spinner, Tag } from '../../components/ui'
import { IconCalendar, IconUsers } from '../../components/Icons'
import { tournamentsApi } from '../../lib/endpoints'
import { formatDate, relativeTime } from '../../lib/format'
import type { Tournament, TournamentCategory } from '../../lib/types'
import { TOURNAMENT_STATUS_META } from '../athlete/status'

const PAGE_SIZE = 12

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'registration_open', label: TOURNAMENT_STATUS_META.registration_open.label },
  { value: 'published', label: TOURNAMENT_STATUS_META.published.label },
  { value: 'registration_closed', label: TOURNAMENT_STATUS_META.registration_closed.label },
  { value: 'ongoing', label: TOURNAMENT_STATUS_META.ongoing.label },
  { value: 'completed', label: TOURNAMENT_STATUS_META.completed.label },
]

export function PublicTournaments() {
  const [rows, setRows] = useState<Tournament[]>([])
  const [categories, setCategories] = useState<TournamentCategory[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<'open' | 'all'>('open')
  const [q, setQ] = useState('')
  const [qApplied, setQApplied] = useState('')
  const [category, setCategory] = useState('')
  const [country, setCountry] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    let alive = true
    tournamentsApi.categories().then((cats) => {
      if (alive) setCategories(cats ?? [])
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setQApplied(q)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [q])

  useEffect(() => {
    let alive = true
    setLoading(true)
    tournamentsApi
      .list({
        page,
        pageSize: PAGE_SIZE,
        q: qApplied || undefined,
        category_id: category || undefined,
        country: country || undefined,
        status: status || undefined,
        scope: scope === 'all' ? 'all' : undefined,
      })
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
  }, [page, qApplied, category, country, status, scope])

  function clearFilters() {
    setQ('')
    setQApplied('')
    setCategory('')
    setCountry('')
    setStatus('')
    setScope('open')
    setPage(1)
  }

  const hasFilters = Boolean(qApplied || category || country || status)

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Tournament directory</p>
          <h1>Open tournaments</h1>
          <p className="muted">Find a competition, check who is sponsoring it, and apply.</p>
        </div>
        <div className="filter-group">
          <button
            type="button"
            className={`chip${scope === 'open' ? ' chip-active' : ''}`}
            onClick={() => {
              setScope('open')
              setPage(1)
            }}
          >
            Open
          </button>
          <button
            type="button"
            className={`chip${scope === 'all' ? ' chip-active' : ''}`}
            onClick={() => {
              setScope('all')
              setPage(1)
            }}
          >
            All (incl. completed)
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tournaments…" aria-label="Search tournaments" />
        </div>
        <div style={{ width: '13rem', flexShrink: 0 }}>
          <Select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value)
              setPage(1)
            }}
            options={[{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </div>
        <div style={{ width: '11rem', flexShrink: 0 }}>
          <Input
            value={country}
            onChange={(e) => {
              setCountry(e.target.value)
              setPage(1)
            }}
            placeholder="Country"
            aria-label="Filter by country"
          />
        </div>
        <div style={{ width: '13rem', flexShrink: 0 }}>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
            options={STATUS_OPTIONS}
          />
        </div>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="🏆"
            title="No tournaments found"
            body={hasFilters ? 'Nothing matches those filters. Try widening your search.' : 'No tournaments have been published yet.'}
            action={
              hasFilters ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid-3">
          {rows.map((t) => {
            const meta = TOURNAMENT_STATUS_META[t.status] ?? TOURNAMENT_STATUS_META.published
            const location = [t.location_city, t.location_country].filter(Boolean).join(', ') || 'Location TBA'
            return (
              <Card key={t.id} className="card-hover">
                <div className="flex items-center gap-2">
                  {t.category_name ? <Tag tone="info">{t.category_name}</Tag> : null}
                  <Tag tone={meta.tone}>{meta.label}</Tag>
                </div>
                <h3 style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-2)', fontSize: 'var(--text-lg)' }}>
                  <Link to={`/tournaments/${t.id}`} className="table-link">{t.title}</Link>
                </h3>
                <p className="small muted" style={{ marginBottom: 'var(--space-2)' }}>{location}</p>
                <p className="small muted" style={{ marginBottom: 'var(--space-2)' }}>
                  <IconCalendar size={13} /> {formatDate(t.start_date)} → {formatDate(t.end_date)}
                </p>
                <div className="flex gap-3 small" style={{ color: 'var(--muted)', marginBottom: 'var(--space-3)' }}>
                  <span>
                    <IconUsers size={13} /> {t.participant_count}/{t.max_participants}
                  </span>
                  <span>Sponsors: {t.sponsor_count ?? 0}</span>
                  <span>Closes {relativeTime(t.registration_deadline)}</span>
                </div>
                <Link className="inline-link" to={`/tournaments/${t.id}`}>
                  View tournament
                </Link>
              </Card>
            )
          })}
        </div>
      )}

      {totalPages > 1 ? <Pager page={page} totalPages={totalPages} total={total} onChange={loadPage} /> : null}
    </div>
  )

  function loadPage(p: number) {
    setPage(p)
  }
}
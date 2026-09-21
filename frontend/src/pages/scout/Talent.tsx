import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Input, Pager, Select, Spinner, VerificationTag } from '../../components/ui'
import { IconSearch } from '../../components/Icons'
import { athletesApi, displayName, sportsApi } from '../../lib/endpoints'
import type { AthleteSearchRow, Sport } from '../../lib/types'

const PAGE_SIZE = 10

export function ScoutTalent() {
  const navigate = useNavigate()
  const [sports, setSports] = useState<Sport[]>([])
  const [ageCategories, setAgeCategories] = useState<string[]>([])
  const [rows, setRows] = useState<AthleteSearchRow[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [sport, setSport] = useState('')
  const [ageCategory, setAgeCategory] = useState('')
  const [country, setCountry] = useState('')
  const [verified, setVerified] = useState('')
  const [minExp, setMinExp] = useState('')
  const [maxExp, setMaxExp] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    let alive = true
    sportsApi
      .list()
      .then((s) => {
        if (alive) setSports(s)
      })
      .catch((err: Error) => {
        if (alive) setError(err.message)
      })
    return () => {
      alive = false
    }
  }, [])

  const load = useCallback(
    (p: number) => {
      let alive = true
      setLoading(true)
      athletesApi
        .search({
          q: debouncedQ || undefined,
          sport: sport || undefined,
          ageCategory: ageCategory || undefined,
          country: country || undefined,
          verified: verified || undefined,
          minExperience: sport && minExp ? Number(minExp) : undefined,
          maxExperience: sport && maxExp ? Number(maxExp) : undefined,
          page: p,
          pageSize: PAGE_SIZE,
        })
        .then(({ data, meta }) => {
          if (!alive) return
          setRows(data)
          setTotal(Number(meta?.total ?? 0))
          setTotalPages(Number(meta?.totalPages ?? 1))
          const filters = (meta?.filters ?? {}) as { availableAgeCategories?: string[] }
          if (filters.availableAgeCategories) setAgeCategories(filters.availableAgeCategories)
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
    [debouncedQ, sport, ageCategory, country, verified, minExp, maxExp],
  )

  useEffect(() => {
    setPage(1)
    return load(1)
  }, [load])

  const loadPage = (p: number) => {
    setPage(p)
    load(p)
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Scout workspace</p>
          <h1>Talent search</h1>
          <p className="muted">Find discoverable athletes using deterministic filters.</p>
        </div>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="toolbar mt-4">
        <div className="search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name…"
            aria-label="Search athletes by name"
          />
        </div>
        <div className="filter-group">
          <Select
            options={[{ value: '', label: 'All sports' }, ...sports.map((s) => ({ value: s.id, label: s.name }))]}
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            style={{ width: 'auto' }}
          />
          <Select
            options={[{ value: '', label: 'Any age' }, ...ageCategories.map((c) => ({ value: c, label: c }))]}
            value={ageCategory}
            onChange={(e) => setAgeCategory(e.target.value)}
            style={{ width: 'auto' }}
          />
          <Select
            options={[{ value: '', label: 'Any status' }, { value: 'true', label: 'Verified only' }]}
            value={verified}
            onChange={(e) => setVerified(e.target.value)}
            style={{ width: 'auto' }}
          />
          <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" style={{ width: '10rem' }} />
        </div>
      </div>

      {sport ? (
        <div className="filter-group mt-2">
          <Input
            type="number"
            min={0}
            max={60}
            value={minExp}
            onChange={(e) => setMinExp(e.target.value)}
            placeholder="Min experience (yrs)"
            style={{ width: '11rem' }}
          />
          <Input
            type="number"
            min={0}
            max={60}
            value={maxExp}
            onChange={(e) => setMaxExp(e.target.value)}
            placeholder="Max experience (yrs)"
            style={{ width: '11rem' }}
          />
        </div>
      ) : null}

      <p className="small muted mt-2">
        Scope: only discoverable profiles are listed — athletes need at least one sport and 50% profile
        completeness to appear here.
      </p>

      <Card className="mt-4">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <div className="empty">
              <div>
                <p className="muted small" style={{ maxWidth: '40ch' }}>
                  No athletes match those filters. Try widening the search or clearing a filter.
                </p>
                <div className="mt-3">
                  <Button variant="secondary" size="sm" onClick={() => { setQ(''); setSport(''); setAgeCategory(''); setCountry(''); setVerified(''); setMinExp(''); setMaxExp('') }}>
                    Clear filters
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Athlete</th>
                  <th>Location</th>
                  <th>Sports</th>
                  <th>Completeness</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="clickable"
                    onClick={() => navigate(`/dashboard/scout/athletes/${r.id}`)}
                  >
                    <td>
                      <Link className="table-link" to={`/dashboard/scout/athletes/${r.id}`}>{displayName(r)}</Link>
                    </td>
                    <td className="muted small">{[r.city, r.country].filter(Boolean).join(', ') || '—'}</td>
                    <td className="muted small">{r.sport_count}</td>
                    <td className="muted small">{r.completeness}%</td>
                    <td><VerificationTag status={r.verification_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {totalPages > 1 ? (
        <Pager page={page} totalPages={totalPages} total={total} onChange={loadPage} />
      ) : null}

      <p className="tiny muted mt-3">
        <IconSearch size={12} /> Search is debounced — results update as you type.
      </p>
    </div>
  )
}
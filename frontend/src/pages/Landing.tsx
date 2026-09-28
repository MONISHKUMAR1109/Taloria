import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Input } from '../components/ui'
import {
  IconBriefcase,
  IconCalendar,
  IconChevronRight,
  IconSearch,
  IconTrophy,
  IconUsers,
} from '../components/Icons'
import { publicApi } from '../lib/endpoints'
import { formatDate } from '../lib/format'
import type { PublicStats, PublicTournament } from '../lib/types'

const STAT_ITEMS = [
  { key: 'verifiedAthletes', label: 'Verified athletes' },
  { key: 'tournaments', label: 'Tournaments' },
  { key: 'applications', label: 'Applications submitted' },
  { key: 'activeSponsorships', label: 'Active sponsorships' },
] as const

const FEATURES = [
  {
    title: 'Athletes',
    body: 'A complete, verified profile: sports, statistics, achievements, and video. Request verification and stand out.',
    icon: <IconUsers size={20} />,
  },
  {
    title: 'Scouts & coaches',
    body: 'Deterministic search and filters over every eligible athlete. Shortlist, message, and move first.',
    icon: <IconSearch size={20} />,
  },
  {
    title: 'Organizers',
    body: 'Run tournaments end to end — publish, gather applications, approve, waitlist, and enter results.',
    icon: <IconCalendar size={20} />,
  },
  {
    title: 'Sponsors',
    body: 'Discover competitions, request sponsorship slots, and manage active partnerships.',
    icon: <IconBriefcase size={20} />,
  },
]

export function Landing() {
  const [stats, setStats] = useState<PublicStats | null>(null)
  const [tournaments, setTournaments] = useState<PublicTournament[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    let alive = true
    Promise.allSettled([publicApi.stats(), publicApi.tournaments(4)])
      .then(([statsRes, tRes]) => {
        if (!alive) return
        setStats(statsRes.status === 'fulfilled' ? statsRes.value : null)
        setTournaments(tRes.status === 'fulfilled' ? tRes.value ?? [] : [])
        setLoading(false)
      })
      .catch(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  function onSearch(e: FormEvent) {
    e.preventDefault()
    const term = q.trim()
    navigate(term ? `/tournaments?q=${encodeURIComponent(term)}` : '/tournaments')
  }

  return (
    <>
      <section className="landing-hero">
        <div className="container landing-hero-inner">
          <div>
            <p className="eyebrow mb-3">Athlete discovery · Verified profiles · Deterministic search</p>
            <h1 className="hero-title">The verified marketplace for sport.</h1>
            <p className="landing-lede">
              TALORIA brings athletes, scouts, organizers, and sponsors onto one platform — profiles that are
              verified, talent that is searchable, and tournaments that run end to end.
            </p>
            <form className="landing-search" onSubmit={onSearch} role="search">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search open tournaments…"
                aria-label="Search tournaments"
                style={{ padding: '0.75rem 1rem' }}
              />
              <Button type="submit" className="btn-lg">Search</Button>
            </form>
            <div className="hero-actions mt-5">
              <Link to="/register">
                <Button variant="primary">Join free</Button>
              </Link>
              <Link to="/talent">
                <Button variant="secondary">Browse verified athletes</Button>
              </Link>
            </div>
          </div>

          <div className="landing-board">
            <div className="card-head" style={{ alignItems: 'baseline' }}>
              <h3 style={{ fontSize: 'var(--text-base)', letterSpacing: '-0.01em' }}>Latest on the circuit</h3>
              <Link to="/tournaments" className="inline-link">
                All tournaments
              </Link>
            </div>
            {loading ? (
              <div className="landing-board-empty">Loading upcoming tournaments…</div>
            ) : tournaments.length === 0 ? (
              <div className="landing-board-empty">No public tournaments yet — the first ones land here.</div>
            ) : (
              tournaments.map((t) => (
                <Link key={t.id} to={`/tournaments/${t.id}`} className="landing-board-row">
                  <span className="tile-ico" style={{ width: '2.2rem', height: '2.2rem' }}>
                    <IconTrophy size={15} />
                  </span>
                  <span className="grow">
                    <span className="small" style={{ fontWeight: 650, display: 'block' }}>{t.title}</span>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {[t.category_name, t.location_city ?? t.location_country].filter(Boolean).join(' · ') || 'Open registration'}
                      {' · '}
                      {formatDate(t.start_date)}
                    </span>
                  </span>
                  <IconChevronRight size={15} className="muted-icon" />
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="landing-stats">
        {STAT_ITEMS.map((item) => (
          <div className="stat" key={item.key}>
            <div className="stat-value">{stats ? (stats[item.key] ?? 0).toLocaleString() : '—'}</div>
            <div className="stat-label">{item.label}</div>
          </div>
        ))}
      </section>

      <section className="container mt-7">
        <p className="eyebrow mb-3">Built for every side of the game</p>
        <div className="section-head" style={{ marginBottom: 0 }}>
          <h2>One platform, four seat types.</h2>
        </div>
        <div className="card-grid mt-5">
          {FEATURES.map((f) => (
            <div className="card card-body" key={f.title}>
              <div className="landing-feature-ico">{f.icon}</div>
              <h3 style={{ marginBottom: 'var(--space-2)' }}>{f.title}</h3>
              <p className="muted small" style={{ marginBottom: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-cta mt-7">
        <div className="container">
          <div className="flex items-center justify-between gap-5 flex-wrap">
            <div>
              <h2 style={{ marginBottom: 'var(--space-2)' }}>Talent in. Stage on.</h2>
              <p style={{ color: 'rgb(255 255 255 / 0.82)', maxWidth: '46ch', marginBottom: 0 }}>
                Create a verified profile in minutes — free for athletes, built for careers.
              </p>
            </div>
            <div className="hero-actions">
              <Link to="/register">
                <Button variant="secondary">Join as an athlete</Button>
              </Link>
              <Link to="/tournaments" className="landing-cta-link">
                Browse tournaments
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
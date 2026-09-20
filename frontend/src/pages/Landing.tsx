import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { PublicStats } from '../lib/types'
import { Button } from '../components/ui'

function usePublicStats() {
  const [stats, setStats] = useState<PublicStats | null>(null)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    let alive = true
    api<PublicStats>('/api/public/stats')
      .then((s) => {
        if (alive) {
          setStats(s)
          setOffline(false)
        }
      })
      .catch(() => {
        if (alive) setOffline(true)
      })
    return () => {
      alive = false
    }
  }, [])

  return { stats, offline }
}

const STAT_ITEMS = [
  { key: 'verifiedAthletes', label: 'Verified athletes' },
  { key: 'tournaments', label: 'Tournaments' },
  { key: 'applications', label: 'Applications submitted' },
  { key: 'activeSponsorships', label: 'Active sponsorships' },
] as const

function StatValue({ mutation, label }: { mutation?: number | null; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{mutation === undefined || mutation === null ? '—' : mutation.toLocaleString()}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

export function Landing() {
  const { stats, offline } = usePublicStats()

  return (
    <>
      <section className="hero">
        <div className="container">
          <p className="eyebrow mb-2">Talent discovery, no guesswork</p>
          <h1 className="hero-title">Where talent finds its stage.</h1>
          <p className="hero-sub mt-4">
            TALORIA is the verified marketplace for athletes, scouts, tournament organizers, and sponsors. Deterministic
            search, verified profiles, and opportunities that move careers forward.
          </p>
          <div className="hero-actions mt-5">
            <Link to="/register">
              <Button>Join as an athlete</Button>
            </Link>
            <Link to="/login">
              <Button variant="secondary">Log in</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="container mt-5">
        <h2>Platform in numbers</h2>
        {offline ? (
          <p className="muted">
            The API is offline right now — start it with <code>npm run dev</code> in <code>backend/</code> to see live
            counts.
          </p>
        ) : stats ? (
          <div className="stat-grid">
            {STAT_ITEMS.map((item) => (
              <StatValue key={item.key} mutation={stats[item.key]} label={item.label} />
            ))}
          </div>
        ) : (
          <div className="stat-grid">
            {STAT_ITEMS.map((item) => (
              <StatValue key={item.key} label={item.label} />
            ))}
          </div>
        )}
      </section>

      <section className="container mt-5">
        <h2>Built for every side of the game</h2>
        <div className="card-grid">
          <CardBlock title="Athletes" body="A complete, verified profile: sports, statistics, achievements, and video. Request verification and stand out." />
          <CardBlock title="Scouts & coaches" body="Deterministic search and filters over every eligible athlete. Shortlist, message, and move first." />
          <CardBlock title="Organizers" body="Run tournaments end to end — publish, gather applications, approve, waitlist, and enter results." />
          <CardBlock title="Sponsors" body="Discover competitions, request sponsorship slots, and manage active partnerships." />
        </div>
      </section>
    </>
  )
}

function CardBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <p className="muted">{body}</p>
    </div>
  )
}
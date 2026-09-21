import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { Alert, Avatar, Button, Card, EmptyState, Progress, Spinner, VerificationTag } from '../../components/ui'
import { displayName, mediaUrl, publicApi } from '../../lib/endpoints'
import type { PublicAthlete } from '../../lib/types'

export function PublicTalent() {
  const { status, user } = useAuth()
  const [athletes, setAthletes] = useState<PublicAthlete[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    publicApi
      .talent(9)
      .then((list) => {
        if (alive) setAthletes(list)
      })
      .catch((err: Error) => {
        if (alive) setError(err.message)
      })
    return () => {
      alive = false
    }
  }, [])

  if (error) return <Alert tone="danger">{error}</Alert>
  if (athletes === null) return <Spinner />

  const isScout = status === 'authed' && user?.role === 'scout'

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Public talent</p>
          <h1>Featured verified athletes</h1>
          <p className="muted">
            Verified athletes with complete profiles are featured here first. Scouts start conversations from their
            dashboard.
          </p>
        </div>
      </div>

      {athletes.length === 0 ? (
        <Card>
          <EmptyState
            icon="⭐"
            title="Nothing to feature yet"
            body="Once athletes verify their profiles and complete them, they will appear here."
          />
        </Card>
      ) : (
        <div className="grid-3">
          {athletes.map((a) => (
            <Card key={a.id} className="card-hover">
              <div className="flex items-center gap-3 mb-3">
                <Avatar name={displayName(a)} src={mediaUrl(a.profile_picture_key)} size="xl" />
                <div style={{ minWidth: 0 }}>
                  <p className="truncate" style={{ fontWeight: 700, margin: 0 }}>{displayName(a)}</p>
                  <p className="tiny muted" style={{ margin: 0 }}>
                    {[a.city, a.country].filter(Boolean).join(', ') || 'Location TBA'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <VerificationTag status={a.verification_status} />
                <span className="tiny muted">
                  {a.sport_count} sports · {a.stat_count} stats
                </span>
              </div>
              <div className="mb-3">
                <div className="flex items-center justify-between small mb-1">
                  <span className="tiny muted">Profile completeness</span>
                  <span className="tiny muted">{a.completeness}%</span>
                </div>
                <Progress value={a.completeness} />
              </div>
              <div>
                {status === 'authed' ? (
                  <>
                    <Button variant="secondary" size="sm" disabled>
                      Contact
                    </Button>
                    <p className="tiny muted mt-2" style={{ marginBottom: 0 }}>
                      {isScout ? 'Start a conversation from your scouting dashboard.' : 'Direct contact is available to scouts.'}
                    </p>
                  </>
                ) : (
                  <Link to="/login">
                    <Button variant="secondary" size="sm">Log in to connect</Button>
                  </Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
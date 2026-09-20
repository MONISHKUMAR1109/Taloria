import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { Alert, Button, Card, Field, Input } from '../../components/ui'
import { messageForCode } from '../../lib/format'
import { ApiError } from '../../lib/api'
import { REGISTRABLE_ROLES, ROLE_LABELS } from '../../lib/types'

type RegistrableRole = 'athlete' | 'scout' | 'organizer' | 'sponsor'

const ROLE_BLURBS: Record<string, string> = {
  athlete: 'Play the game',
  scout: 'Find the talent',
  organizer: 'Run events',
  sponsor: 'Back competitions',
}

export function Register() {
  const { register } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<RegistrableRole>('athlete')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const result = await register({ email: email.trim(), password, role })
      setNotice(result.message)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(messageForCode(err.code) ?? err.message)
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <Card className="auth-card">
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-sub">Choose how you want to take part.</p>

        {notice && (
          <div className="mb-3">
            <Alert tone="success">
              {notice} You can log in as soon as your email is verified.
            </Alert>
          </div>
        )}
        {error && (
          <div className="mb-3">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        {!notice ? (
          <form onSubmit={onSubmit} noValidate>
            <Field label="I am a…">
              <div className="role-picker" role="group" aria-label="Role">
                {REGISTRABLE_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="role-option"
                    aria-pressed={role === r}
                    onClick={() => setRole(r)}
                  >
                    <strong>{ROLE_LABELS[r]}</strong>
                    <span>{ROLE_BLURBS[r]}</span>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Email">
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </Field>
            <Field label="Password" hint="At least 8 characters.">
              <Input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </Field>
            <Button type="submit" className="btn-block" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </Button>
          </form>
        ) : (
          <Link to="/login">
            <Button variant="secondary" className="btn-block">
              Go to log in
            </Button>
          </Link>
        )}

        <hr className="divider" />
        <p className="small text-center muted">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </Card>
    </div>
  )
}
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { Alert, Button, Card, Field, Input } from '../../components/ui'
import { messageForCode } from '../../lib/format'
import { ApiError } from '../../lib/api'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const redirect = await login(email.trim(), password)
      navigate(redirect || from)
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
        <h1 className="auth-title">Log in</h1>
        <p className="auth-sub">Welcome back to TALORIA.</p>

        {error && (
          <div className="mb-3">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        <form onSubmit={onSubmit} noValidate>
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
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </Field>
          <div className="pill-row mb-4">
            <Link className="small" to="/forgot-password">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" className="btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Log in'}
          </Button>
        </form>

        <hr className="divider" />
        <p className="small text-center muted">
          New to TALORIA? <Link to="/register">Create an account</Link>
        </p>
      </Card>
    </div>
  )
}
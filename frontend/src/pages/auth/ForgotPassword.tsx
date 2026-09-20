import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Card, Field, Input } from '../../components/ui'
import { api } from '../../lib/api'
import { messageForCode } from '../../lib/format'
import { ApiError } from '../../lib/api'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const data = await api<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      })
      setNotice(data.message)
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
        <h1 className="auth-title">Reset your password</h1>
        <p className="auth-sub">Enter your email and we&apos;ll send a reset link (logged to the API console in this phase).</p>

        {notice && (
          <div className="mb-3">
            <Alert tone="success">{notice}</Alert>
          </div>
        )}
        {error && (
          <div className="mb-3">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        {!notice ? (
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
            <Button type="submit" className="btn-block" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        ) : (
          <Link to="/login">
            <Button variant="secondary" className="btn-block">
              Back to log in
            </Button>
          </Link>
        )}

        <hr className="divider" />
        <p className="small text-center muted">
          Remembered it? <Link to="/login">Log in</Link>
        </p>
      </Card>
    </div>
  )
}
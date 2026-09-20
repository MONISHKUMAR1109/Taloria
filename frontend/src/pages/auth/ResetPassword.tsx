import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, Field, Input } from '../../components/ui'
import { api } from '../../lib/api'
import { messageForCode } from '../../lib/format'
import { ApiError } from '../../lib/api'

export function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const data = await api<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword: password }),
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
        <h1 className="auth-title">Choose a new password</h1>
        <p className="auth-sub">Reset link tokens are single-use and expire after 1 hour.</p>

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

        {!token ? (
          <Alert tone="warning">This page needs a <code>?token=</code> from your reset email.</Alert>
        ) : notice ? (
          <Link to="/login">
            <Button variant="secondary" className="btn-block">
              Back to log in
            </Button>
          </Link>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <Field label="New password" hint="At least 8 characters.">
              <Input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <Field label="Confirm new password">
              <Input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" className="btn-block" disabled={busy}>
              {busy ? 'Resetting…' : 'Update password'}
            </Button>
          </form>
        )}

        <hr className="divider" />
        <p className="small text-center muted">
          Remembered it? <Link to="/login">Log in</Link>
        </p>
      </Card>
    </div>
  )
}
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { Alert, Button, Card, EmptyState, Field, Input, RoleBadge, Spinner, Tag } from '../../components/ui'
import { IconSettings } from '../../components/Icons'
import { authApi } from '../../lib/endpoints'

export function Settings() {
  const { status, user } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  async function submit() {
    setFieldError(null)
    setError(null)
    setNotice(null)
    if (!current || !next || !confirm) {
      setFieldError('Fill in all password fields.')
      return
    }
    if (next.length < 8) {
      setFieldError('The new password must be at least 8 characters.')
      return
    }
    if (next !== confirm) {
      setFieldError('The new password confirmation does not match.')
      return
    }
    setBusy(true)
    try {
      const res = await authApi.changePassword(current, next)
      setNotice(res.message || 'Password changed.')
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password.')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') return <Spinner />

  if (!user) {
    return (
      <div>
        <div className="section-head">
          <div>
            <p className="eyebrow">Settings</p>
            <h1>Account settings</h1>
          </div>
        </div>
        <EmptyState
          icon="⚙️"
          title="Log in to manage your account"
          body="Sign in to update your password and review your account details."
          action={
            <Link to="/login">
              <Button variant="primary">Log in</Button>
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Account settings</h1>
          <p className="muted">Review your account and keep your credentials secure.</p>
        </div>
      </div>

      <div className="grid-2">
        <Card>
          <div className="card-head">
            <h3>
              <IconSettings size={16} /> Account
            </h3>
          </div>
          <div className="card-body">
            <div className="field">
              <label className="field-label">Email</label>
              <Input value={user.email} disabled />
            </div>
            <div className="field">
              <label className="field-label">Role</label>
              <RoleBadge role={user.role} />
            </div>
            <div className="field">
              <label className="field-label">Email verification</label>
              {user.emailVerified ? <Tag tone="success">Verified</Tag> : <Tag tone="warning">Verify your email</Tag>}
            </div>
            <p className="tiny muted">
              Demo tip: seeded accounts cover every role, so you can explore each workspace with the sample logins shown
              on the login screen.
            </p>
          </div>
        </Card>

        <Card>
          <div className="card-head">
            <h3>Change password</h3>
          </div>
          <div className="card-body">
            {notice ? <Alert tone="success">{notice}</Alert> : null}
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Field label="Current password">
              <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </Field>
            <Field label="New password" hint="At least 8 characters." error={fieldError}>
              <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password">
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </Field>
            <Button variant="primary" disabled={busy || !current || !next || !confirm} onClick={submit}>
              {busy ? 'Saving…' : 'Change password'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
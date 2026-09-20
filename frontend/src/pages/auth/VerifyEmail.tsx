import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card } from '../../components/ui'
import { api } from '../../lib/api'
import { messageForCode } from '../../lib/format'
import { ApiError } from '../../lib/api'

export function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const ran = useRef(false)

  const [state, setState] = useState<'working' | 'done' | 'error'>('working')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!token || ran.current) return
    ran.current = true
    api<{ message: string }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then((data) => {
        setMessage(data.message)
        setState('done')
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          setMessage(messageForCode(err.code) ?? err.message)
        } else {
          setMessage('Something went wrong. Please try again.')
        }
        setState('error')
      })
  }, [token])

  return (
    <div className="auth-wrap">
      <Card className="auth-card">
        <h1 className="auth-title">Verify your email</h1>
        {!token ? (
          <Alert tone="warning">This link is missing a token. Please use the full link from your email.</Alert>
        ) : state === 'working' ? (
          <p className="auth-sub">Verifying…</p>
        ) : null}
        {message && (
          <div className="mt-3">
            <Alert tone={state === 'done' ? 'success' : state === 'error' ? 'danger' : 'info'}>{message}</Alert>
          </div>
        )}
        {(state === 'done' || state === 'error') && (
          <Link to="/login" className="mt-4" style={{ display: 'inline-block' }}>
            <Button variant="secondary">Go to log in</Button>
          </Link>
        )}
      </Card>
    </div>
  )
}
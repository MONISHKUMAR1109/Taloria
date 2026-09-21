import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { Alert, Button, Card, EmptyState, Pager, Spinner } from '../../components/ui'
import { IconBell } from '../../components/Icons'
import { notificationsApi } from '../../lib/endpoints'
import { formatDateTime } from '../../lib/format'
import type { AppNotification } from '../../lib/types'

const PAGE_SIZE = 20

export function Notifications() {
  const { status, user } = useAuth()
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback((p: number) => {
    let alive = true
    setLoading(true)
    notificationsApi
      .list({ page: p, pageSize: PAGE_SIZE })
      .then((res) => {
        if (!alive) return
        setItems(res.items)
        setUnread(res.unread)
        setTotal(res.total)
        setTotalPages(res.totalPages)
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
  }, [])

  useEffect(() => load(1), [load])

  async function markRead(n: AppNotification) {
    setBusyId(n.id)
    setError(null)
    try {
      await notificationsApi.markRead(n.id)
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
      setUnread((u) => Math.max(0, u - 1))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark as read.')
    } finally {
      setBusyId(null)
    }
  }

  async function markAllRead() {
    const unreadOnes = items.filter((n) => !n.read_at)
    setError(null)
    setNotice(null)
    try {
      await Promise.all(unreadOnes.map((n) => notificationsApi.markRead(n.id).catch(() => undefined)))
      setNotice('All notifications marked as read.')
      load(page)
    } catch {
      setError('Could not mark everything as read.')
    }
  }

  function loadPage(p: number) {
    setPage(p)
    load(p)
  }

  if (status === 'loading') return <Spinner />

  if (!user) {
    return (
      <div>
        <div className="section-head">
          <div>
            <p className="eyebrow">Notifications</p>
            <h1>Your notifications</h1>
          </div>
        </div>
        <EmptyState
          icon="🔔"
          title="Log in to see your notifications"
          body="Updates about applications, sponsorships, and messages will appear here."
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
          <p className="eyebrow">Notifications</p>
          <h1>Your notifications</h1>
          <p className="muted">{unread > 0 ? `${unread} unread` : 'You are all caught up.'}</p>
        </div>
        {unread > 0 ? (
          <Button variant="secondary" onClick={markAllRead}>
            <IconBell size={15} /> Mark all read
          </Button>
        ) : null}
      </div>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card className="mt-5">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <Spinner />
          ) : items.length === 0 ? (
            <EmptyState
              icon="🔔"
              title="Nothing here yet"
              body="Notifications about your applications, sponsorships, and messages will show up here."
            />
          ) : (
            <div>
              {items.map((n, i) => (
                <div
                  key={n.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-4) var(--space-5)',
                    borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--border)',
                  }}
                >
                  <span
                    className="dot"
                    style={{ background: n.read_at ? 'var(--surface-3)' : 'var(--brand-500)', flexShrink: 0, marginTop: '0.35rem' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: n.read_at ? 500 : 700, margin: 0 }}>{n.title}</p>
                    {n.body ? <p className="small muted" style={{ margin: '0.15rem 0' }}>{n.body}</p> : null}
                    <p className="tiny muted" style={{ margin: 0 }}>{formatDateTime(n.created_at)}</p>
                  </div>
                  {!n.read_at ? (
                    <Button variant="ghost" size="sm" disabled={busyId === n.id} onClick={() => markRead(n)}>
                      {busyId === n.id ? 'Reading…' : 'Mark read'}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {totalPages > 1 ? <Pager page={page} totalPages={totalPages} total={total} onChange={loadPage} /> : null}
    </div>
  )
}
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { Alert, Avatar, Button, Card, EmptyState, Input, Modal, Spinner, Tag } from '../../components/ui'
import { IconChat } from '../../components/Icons'
import { messagesApi } from '../../lib/endpoints'
import { relativeTime } from '../../lib/format'
import type { MessageThread, ThreadDetail } from '../../lib/types'

function sortThreads(list: MessageThread[]): MessageThread[] {
  return [...list].sort((a, b) => {
    const at = a.last_message_at ?? a.thread_created_at
    const bt = b.last_message_at ?? b.thread_created_at
    return new Date(bt).getTime() - new Date(at).getTime()
  })
}

export function Messages() {
  const { status, user } = useAuth()
  const [threads, setThreads] = useState<MessageThread[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [thread, setThread] = useState<ThreadDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [blockError, setBlockError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const activeIdRef = useRef<string | null>(null)

  const isAthlete = user?.role === 'athlete'
  const isScout = user?.role === 'scout'

  const loadThreads = useCallback((initial = false) => {
    let alive = true
    if (initial) setLoading(true)
    messagesApi
      .threads()
      .then((list) => {
        if (!alive) return
        setThreads(sortThreads(list))
        setError(null)
      })
      .catch((err: Error) => {
        if (alive && initial) setError(err.message)
      })
      .finally(() => {
        if (alive && initial) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const loadThread = useCallback((id: string) => {
    let alive = true
    messagesApi
      .get(id)
      .then((detail) => {
        if (alive) {
          setThread(detail)
          setError(null)
        }
      })
      .catch((err: Error) => {
        if (alive) setError(err.message)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => loadThreads(true), [loadThreads])

  useEffect(() => {
    const timer = setInterval(() => {
      loadThreads(false)
      if (activeIdRef.current) loadThread(activeIdRef.current)
    }, 8000)
    return () => clearInterval(timer)
  }, [loadThreads, loadThread])

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollTop = bottomRef.current.scrollHeight
  }, [thread?.id, thread?.messages.length])

  function openThread(id: string) {
    activeIdRef.current = id
    setActiveId(id)
    loadThread(id)
    loadThreads(false)
  }

  function counterpartName(t: MessageThread): string {
    return isAthlete ? (t.scout_name || 'Scout') : (t.athlete_name || 'Athlete')
  }

  function receivedName(): string {
    return isAthlete ? thread?.scout?.name || 'Scout' : thread?.athlete?.name || 'Athlete'
  }

  async function send() {
    const body = draft.trim()
    if (!body || !activeId) return
    setSending(true)
    setSendError(null)
    try {
      const message = await messagesApi.send(activeId, body)
      setThread((prev) => (prev ? { ...prev, messages: [...prev.messages, message] } : prev))
      setDraft('')
      loadThreads(false)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send the message.')
    } finally {
      setSending(false)
    }
  }

  async function confirmBlock() {
    if (!activeId) return
    setBlocking(true)
    setBlockError(null)
    try {
      await messagesApi.block(activeId)
      setBlockOpen(false)
      loadThreads(false)
      if (activeIdRef.current) loadThread(activeIdRef.current)
    } catch (err) {
      setBlockError(err instanceof Error ? err.message : 'Could not block this scout.')
    } finally {
      setBlocking(false)
    }
  }

  if (status === 'loading') return <Spinner />

  if (!user) {
    return (
      <div>
        <div className="section-head">
          <div>
            <p className="eyebrow">Messages</p>
            <h1>Your inbox</h1>
          </div>
        </div>
        <EmptyState
          icon="💬"
          title="Log in to read your messages"
          body="Scouts and verified athletes talk here. Sign in to keep the conversation going."
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
          <p className="eyebrow">Messages</p>
          <h1>Your inbox</h1>
          <p className="muted">Conversations with athletes and scouts, refreshed automatically.</p>
        </div>
        {isScout ? (
          <Link to="/dashboard/scout/talent">
            <Button variant="secondary">
              <IconChat size={15} /> Find athletes to contact
            </Button>
          </Link>
        ) : null}
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 'var(--space-5)', alignItems: 'start' }}>
        <Card className="card-flush">
          <div className="card-head">
            <h3>Threads</h3>
            <Tag tone={threads.length ? 'brand' : 'muted'}>{threads.length}</Tag>
          </div>
          <div className="card-body" style={{ padding: 'var(--space-3)' }}>
            {loading ? (
              <Spinner />
            ) : threads.length === 0 ? (
              <EmptyState
                icon="💬"
                title="No conversations yet"
                body={isScout ? 'Find an athlete in the scouting dashboard and start a conversation there.' : 'Scouts will reach out to you here once they find your profile.'}
              />
            ) : (
              <div className="flex flex-col gap-2">
                {threads.map((t) => {
                  const selected = t.id === activeId
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => openThread(t.id)}
                      className="row row-click"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        borderColor: selected ? 'var(--brand-500)' : undefined,
                        background: selected ? 'color-mix(in srgb, var(--brand-300) 16%, var(--surface-1))' : undefined,
                      }}
                    >
                      <Avatar name={counterpartName(t)} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="small" style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', fontWeight: 700 }}>
                          <span className="truncate">{counterpartName(t)}</span>
                          <span className="tiny muted" style={{ flexShrink: 0 }}>{relativeTime(t.last_message_at)}</span>
                        </span>
                        <span className="tiny muted truncate" style={{ display: 'block', marginTop: 2 }}>
                          {t.last_message || 'No messages yet'}
                        </span>
                      </span>
                      {t.unread_count > 0 ? <span className="badge badge-brand">{t.unread_count}</span> : null}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </Card>

        <Card className="card-flush">
          {!thread ? (
            <div className="empty">
              <div>
                <p style={{ fontWeight: 700, color: 'var(--ink)' }}>Pick a conversation</p>
                <p className="small muted">Select a thread on the left to read and reply.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="card-head">
                <div className="flex items-center gap-2">
                  <Avatar name={receivedName()} size="sm" />
                  <div>
                    <p style={{ fontWeight: 700, margin: 0 }}>{receivedName()}</p>
                    <p className="tiny muted" style={{ margin: 0 }}>
                      {isAthlete ? (thread.scout?.organization || 'Independent scout') : 'Athlete'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {thread.blockedAt ? <Tag tone="danger">Conversation blocked</Tag> : null}
                  {isAthlete && !thread.blockedAt ? (
                    <Button variant="danger-soft" size="sm" onClick={() => setBlockOpen(true)}>Block scout</Button>
                  ) : null}
                </div>
              </div>

              <div
                ref={bottomRef}
                className="card-body"
                style={{ maxHeight: '26rem', minHeight: '16rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', background: 'var(--surface-2)' }}
              >
                {thread.messages.length === 0 ? (
                  <p className="small muted" style={{ textAlign: 'center', margin: 'auto' }}>No messages yet. Say hello.</p>
                ) : (
                  thread.messages.map((m) => {
                    const mine = m.sender_user_id === user.id
                    const sender = mine ? 'You' : (m.sender_role === 'scout' ? thread.scout?.name : thread.athlete?.name) || receivedName()
                    return (
                      <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                        <div
                          style={{
                            maxWidth: '75%',
                            padding: '0.6rem 0.95rem',
                            borderRadius: 'var(--radius-lg)',
                            background: mine ? 'var(--brand-300)' : 'var(--surface-1)',
                            color: 'var(--ink)',
                            boxShadow: 'var(--shadow-xs)',
                          }}
                        >
                          <p className="tiny muted" style={{ margin: '0 0 0.2rem', fontWeight: 600 }}>
                            {sender} · {relativeTime(m.created_at)}
                          </p>
                          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.body}</p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {thread.blockedAt ? (
                <div className="card-foot">
                  <span className="tiny muted">This conversation is blocked. You can no longer send or receive messages here.</span>
                </div>
              ) : (
                <div className="card-foot" style={{ flexWrap: 'wrap' }}>
                  <div className="w-full">{sendError ? <Alert tone="danger">{sendError}</Alert> : null}</div>
                  <div className="flex gap-2 w-full">
                    <Input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Write a message…"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          send()
                        }
                      }}
                    />
                    <Button size="sm" disabled={sending || !draft.trim()} onClick={send}>
                      {sending ? 'Sending…' : 'Send'}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <Modal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        title="Block this scout?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBlockOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={blocking} onClick={confirmBlock}>
              {blocking ? 'Blocking…' : 'Block scout'}
            </Button>
          </>
        }
      >
        {blockError ? <Alert tone="danger">{blockError}</Alert> : null}
        <p className="small muted">
          They will no longer be able to message you. Existing messages stay visible and this action can be reviewed by an admin.
        </p>
      </Modal>
    </div>
  )
}
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, EmptyState, Field, Modal, Spinner, Tag } from '../../components/ui'
import { verificationApi } from '../../lib/endpoints'
import { formatDate } from '../../lib/format'
import type { VerificationRequest } from '../../lib/types'

export function AdminVerifications() {
  const [rows, setRows] = useState<VerificationRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<VerificationRequest | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [rejectBusy, setRejectBusy] = useState(false)
  const [rejectError, setRejectError] = useState<string | null>(null)

  const load = useCallback(() => {
    let alive = true
    setLoading(true)
    verificationApi
      .list()
      .then((data) => {
        if (!alive) return
        setRows(data)
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

  useEffect(() => {
    load()
  }, [load])

  const pending = rows.filter((r) => r.status === 'pending')
  const reviewed = rows.filter((r) => r.status !== 'pending')

  async function approve(request: VerificationRequest) {
    setBusyId(request.id)
    setError(null)
    setNotice(null)
    try {
      await verificationApi.review(request.id, 'verified')
      setNotice(`${request.athlete_name}'s profile is now verified.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review the request.')
    } finally {
      setBusyId(null)
    }
  }

  async function confirmReject() {
    if (!rejecting) return
    setRejectBusy(true)
    setRejectError(null)
    setError(null)
    setNotice(null)
    try {
      await verificationApi.review(rejecting.id, 'rejected', rejectNote.trim() || undefined)
      setNotice(`${rejecting.athlete_name}'s request was rejected.`)
      setRejecting(null)
      setRejectNote('')
      await load()
    } catch (err) {
      setRejectError(err instanceof Error ? err.message : 'Could not reject the request.')
    } finally {
      setRejectBusy(false)
    }
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Admin workspace</p>
          <h1>Verification requests</h1>
          <p className="muted">Review athletes who asked to be verified.</p>
        </div>
      </div>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="mt-5">
        <div className="flex items-center gap-3 mb-3">
          <h2 style={{ margin: 0 }}>Pending</h2>
          <Tag tone={pending.length > 0 ? 'warning' : 'muted'}>{pending.length}</Tag>
        </div>

        {loading ? (
          <Spinner />
        ) : pending.length === 0 ? (
          <EmptyState
            icon="✅"
            title="No pending verifications"
            body="All requests have been reviewed. New requests from athletes will appear here."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map((r) => (
              <Card key={r.id}>
                <div className="row" style={{ border: 'none', boxShadow: 'none', padding: 0 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <p style={{ fontWeight: 700, margin: 0 }}>{r.athlete_name}</p>
                      <p className="small muted" style={{ margin: 0 }}>
                        {[r.country, r.city].filter(Boolean).join(' · ') || 'Location not set'}
                        {' · '}
                        {r.sport_count} sport{r.sport_count === 1 ? '' : 's'}
                      </p>
                      <Tag tone="muted">Requested {formatDate(r.requested_at)}</Tag>
                    </div>
                    {r.bio ? (
                      <p className="small muted mt-2" style={{ maxWidth: '60ch' }}>{r.bio}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" disabled={busyId === r.id} onClick={() => approve(r)}>
                      {busyId === r.id ? 'Approving…' : 'Approve'}
                    </Button>
                    <Button
                      variant="danger-soft"
                      size="sm"
                      disabled={busyId === r.id}
                      onClick={() => {
                        setRejecting(r)
                        setRejectNote('')
                        setRejectError(null)
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {reviewed.length > 0 ? (
        <div className="mt-5">
          <h2 style={{ fontSize: 'var(--text-xl)' }}>Reviewed</h2>
          <Card className="mt-3">
            <div className="card-body">
              <div className="flex flex-col gap-3">
                {reviewed.map((r) => (
                  <div key={r.id} className="row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-3 flex-wrap">
                        <p style={{ fontWeight: 700, margin: 0 }}>{r.athlete_name}</p>
                        <Tag tone={r.status === 'verified' ? 'success' : 'danger'}>
                          {r.status === 'verified' ? 'Verified' : 'Rejected'}
                        </Tag>
                        <p className="tiny muted" style={{ margin: 0 }}>
                          Reviewed {formatDate(r.reviewed_at)}
                        </p>
                      </div>
                      {r.review_note ? (
                        <p className="small muted mt-2" style={{ margin: 0 }}>{r.review_note}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {rejecting ? (
        <Modal
          open
          onClose={() => setRejecting(null)}
          title={`Reject verification for ${rejecting.athlete_name}`}
          footer={
            <>
              <Button variant="secondary" disabled={rejectBusy} onClick={() => setRejecting(null)}>Cancel</Button>
              <Button variant="danger" disabled={rejectBusy} onClick={confirmReject}>
                {rejectBusy ? 'Rejecting…' : 'Reject request'}
              </Button>
            </>
          }
        >
          {rejectError ? <Alert tone="danger">{rejectError}</Alert> : null}
          <Field label="Review note (optional)" hint="Shared with the athlete and stored with the review.">
            <textarea
              className="input"
              rows={4}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="e.g. No documentary evidence of the claimed achievement."
            />
          </Field>
        </Modal>
      ) : null}
    </div>
  )
}
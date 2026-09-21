import { useCallback, useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Alert, Button, Card, EmptyState, Field, Input, Modal, Pager, RoleBadge, Select, Spinner, Tag } from '../../components/ui'
import { IconCheck } from '../../components/Icons'
import { adminApi } from '../../lib/endpoints'
import { formatDate } from '../../lib/format'
import type { AdminUser, Role } from '../../lib/types'
import { ROLE_LABELS } from '../../lib/types'

const PAGE_SIZE = 10

const ROLES: Role[] = ['athlete', 'scout', 'organizer', 'sponsor', 'admin']
const CHANGABLE_ROLES: Exclude<Role, 'admin'>[] = ['athlete', 'scout', 'organizer', 'sponsor']

const ROLE_FILTERS = [
  { value: '', label: 'All roles' },
  ...ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
]

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
]

interface ConfirmTarget {
  user: AdminUser
  next: 'active' | 'suspended'
}

export function AdminUsers() {
  const [rows, setRows] = useState<AdminUser[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ q: '', role: '', status: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null)
  const [roleDraft, setRoleDraft] = useState<string>('')
  const [roleBusy, setRoleBusy] = useState(false)
  const [roleError, setRoleError] = useState<string | null>(null)

  const load = useCallback(
    (p: number) => {
      let alive = true
      setLoading(true)
      adminApi
        .users({
          sort: 'created_at',
          order: 'desc',
          page: p,
          pageSize: PAGE_SIZE,
          q: filters.q || undefined,
          role: filters.role || undefined,
          account_status: filters.status || undefined,
        })
        .then(({ data, meta }) => {
          if (!alive) return
          setRows(data)
          setTotal(Number(meta?.total ?? 0))
          setTotalPages(Number(meta?.totalPages ?? 1))
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
    },
    [filters],
  )

  useEffect(() => {
    load(page)
  }, [load, page])

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFilters((f) => ({ ...f, q: search.trim() }))
    setPage(1)
  }

  function onRoleFilter(e: ChangeEvent<HTMLSelectElement>) {
    setFilters((f) => ({ ...f, role: e.target.value }))
    setPage(1)
  }

  function onStatusFilter(e: ChangeEvent<HTMLSelectElement>) {
    setFilters((f) => ({ ...f, status: e.target.value }))
    setPage(1)
  }

  async function applyStatus(target: ConfirmTarget) {
    setConfirmBusy(true)
    setError(null)
    setNotice(null)
    try {
      await adminApi.setUserStatus(target.user.id, target.next)
      setNotice(target.next === 'suspended' ? `${target.user.email} was suspended.` : `${target.user.email} was activated.`)
      setConfirm(null)
      load(page)
    } catch (err) {
      setConfirm(null)
      setError(err instanceof Error ? err.message : 'Could not update the account.')
    } finally {
      setConfirmBusy(false)
    }
  }

  function openRoleModal(user: AdminUser) {
    setRoleTarget(user)
    setRoleDraft(user.role === 'admin' ? '' : user.role)
    setRoleError(null)
  }

  async function applyRole() {
    if (!roleTarget || !roleDraft) return
    setRoleBusy(true)
    setRoleError(null)
    setError(null)
    setNotice(null)
    try {
      await adminApi.changeRole(roleTarget.id, roleDraft as Exclude<Role, 'admin'>)
      setNotice(`Role changed for ${roleTarget.email}. Their sessions were revoked.`)
      setRoleTarget(null)
      load(page)
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : 'Could not change the role.')
    } finally {
      setRoleBusy(false)
    }
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">Admin workspace</p>
          <h1>Users</h1>
          <p className="muted">Manage accounts across the platform.</p>
        </div>
      </div>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <form className="toolbar mt-5" onSubmit={onSearch}>
        <div className="search" style={{ flex: '1 1 18rem' }}>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email…"
            aria-label="Search users by email"
          />
        </div>
        <Select options={ROLE_FILTERS} value={filters.role} onChange={onRoleFilter} aria-label="Filter by role" />
        <Select options={STATUS_FILTERS} value={filters.status} onChange={onStatusFilter} aria-label="Filter by status" />
        <Button variant="secondary" type="submit">Search</Button>
      </form>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="👥"
              title="No users found"
              body="Try a different search term or clear the role and status filters."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Email verified</th>
                  <th>Active sessions</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td className="small" style={{ fontWeight: 600 }}>{u.email}</td>
                    <td><RoleBadge role={u.role} /></td>
                    <td>
                      <Tag tone={u.account_status === 'active' ? 'success' : 'danger'}>
                        {u.account_status === 'active' ? 'Active' : 'Suspended'}
                      </Tag>
                    </td>
                    <td className="small muted">
                      {u.email_verified_at ? (
                        <span className="flex items-center gap-1">
                          <IconCheck size={13} />
                          {formatDate(u.email_verified_at)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="small muted">{u.active_sessions}</td>
                    <td className="small muted">{formatDate(u.created_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant={u.account_status === 'active' ? 'danger-soft' : 'secondary'}
                          size="sm"
                          onClick={() => setConfirm({ user: u, next: u.account_status === 'active' ? 'suspended' : 'active' })}
                        >
                          {u.account_status === 'active' ? 'Suspend' : 'Activate'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={u.role === 'admin' || u.account_status === 'suspended'}
                          onClick={() => openRoleModal(u)}
                        >
                          Change role
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {totalPages > 1 ? (
        <Pager page={page} totalPages={totalPages} total={total} onChange={setPage} />
      ) : null}

      {confirm ? (
        <Modal
          open
          onClose={() => setConfirm(null)}
          title={confirm.next === 'suspended' ? 'Suspend account' : 'Activate account'}
          footer={
            <>
              <Button variant="secondary" disabled={confirmBusy} onClick={() => setConfirm(null)}>Cancel</Button>
              <Button
                variant={confirm.next === 'suspended' ? 'danger' : 'primary'}
                disabled={confirmBusy}
                onClick={() => applyStatus(confirm)}
              >
                {confirmBusy ? 'Saving…' : confirm.next === 'suspended' ? 'Suspend' : 'Activate'}
              </Button>
            </>
          }
        >
          <p className="small muted">
            {confirm.next === 'suspended'
              ? `Suspend ${confirm.user.email}? They will be signed out and blocked from logging in until reactivated.`
              : `Reactivate ${confirm.user.email}? They will be able to log in again.`}
          </p>
        </Modal>
      ) : null}

      {roleTarget ? (
        <Modal
          open
          onClose={() => setRoleTarget(null)}
          title={`Change role for ${roleTarget.email}`}
          footer={
            <>
              <Button variant="secondary" disabled={roleBusy} onClick={() => setRoleTarget(null)}>Cancel</Button>
              <Button variant="primary" disabled={roleBusy || !roleDraft} onClick={applyRole}>
                {roleBusy ? 'Saving…' : 'Change role'}
              </Button>
            </>
          }
        >
          {roleError ? <Alert tone="danger">{roleError}</Alert> : null}
          <Field label="New role" hint="Changing roles archives the old profile and creates a fresh one. Sessions are revoked.">
            <Select
              options={CHANGABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
              value={roleDraft}
              onChange={(e) => setRoleDraft(e.target.value)}
            />
          </Field>
        </Modal>
      ) : null}
    </div>
  )
}
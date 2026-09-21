import { useState } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import type { Role } from '../lib/types'
import { ROLE_LABELS } from '../lib/types'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-soft'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'lg'
}

export function Button({ variant = 'primary', size, className, type = 'button', ...rest }: ButtonProps) {
  const sizeClass = size === 'sm' ? ' btn-sm' : size === 'lg' ? ' btn-lg' : ''
  const variantClass = variant === 'danger-soft' ? ' btn-danger-soft' : ` btn-${variant}`
  return <button type={type} className={`btn${variantClass}${sizeClass}${className ? ` ${className}` : ''}`} {...rest} />
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input${props.className ? ` ${props.className}` : ''}`} />
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options?: { value: string; label: string }[]
}

export function Select({ options, children, ...rest }: SelectProps) {
  return (
    <select {...rest} className={`input${rest.className ? ` ${rest.className}` : ''}`}>
      {options?.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {children}
    </select>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string | null
  children: ReactNode
}) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
      {error ? <span className="field-error" role="alert">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}

type AlertTone = 'success' | 'warning' | 'danger' | 'info'

export function Alert({ tone = 'info', children }: { tone?: AlertTone; children: ReactNode }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span>{children}</span>
    </div>
  )
}

export function Badge({ tone, children }: { tone?: 'verified' | 'pending' | 'danger' | 'brand'; children: ReactNode }) {
  return <span className={`badge${tone ? ` badge-${tone}` : ''}`}>{children}</span>
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`card${className ? ` ${className}` : ''}`}>{children}</div>
}

export function Spinner() {
  return (
    <div className="centered">
      <div className="spinner" role="status" aria-label="Loading" />
    </div>
  )
}

export function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    try {
      return document.documentElement.dataset.theme === 'dark'
    } catch {
      return false
    }
  })

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light mode' : 'Dark mode'}
      onClick={() => {
        const next = !dark
        setDark(next)
        document.documentElement.dataset.theme = next ? 'dark' : 'light'
        try {
          localStorage.setItem('taloria-theme', next ? 'dark' : 'light')
        } catch {
          /* ignore */
        }
      }}
    >
      {dark ? '☀' : '☾'}
    </button>
  )
}

export function RoleBadge({ role }: { role: Role }) {
  return <Badge tone="brand">{ROLE_LABELS[role]}</Badge>
}

type TagTone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'muted'
export type { TagTone }

export function Tag({ tone = 'muted', children }: { tone?: TagTone; children: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>
}

export function VerificationTag({ status }: { status: string | null | undefined }) {
  const tone: TagTone = status === 'verified' ? 'success' : status === 'pending' ? 'warning' : status === 'rejected' ? 'danger' : 'muted'
  const label = status === 'verified' ? 'Verified' : status === 'pending' ? 'Pending review' : status === 'rejected' ? 'Rejected' : 'Unverified'
  return <Tag tone={tone}>{label}</Tag>
}

export function Progress({ value, size }: { value: number; size?: 'sm' | 'lg' }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={`progress${size === 'lg' ? ' progress-lg' : ''}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-bar" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Avatar({ name, src, size, tone }: { name?: string | null; src?: string | null; size?: 'sm' | 'lg' | 'xl'; tone?: 1 | 2 | 3 }) {
  const initials = (name ?? '—')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const sizeClass = size === 'lg' ? ' avatar-lg' : size === 'xl' ? ' avatar-xl' : ''
  const toneClass = tone === 2 ? ' avatar-2' : tone === 3 ? ' avatar-3' : ''
  return (
    <span className={`avatar${sizeClass}${toneClass}`}>
      {src ? <img src={src} alt={`Avatar of ${name ?? 'user'}`} /> : initials || '?'}
    </span>
  )
}

export function EmptyState({ icon, title, body, action }: { icon?: string; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div>
        {icon ? <div className="empty-ico">{icon}</div> : null}
        <p style={{ fontWeight: 700, color: 'var(--ink)' }}>{title}</p>
        {body ? <p className="small muted" style={{ maxWidth: '34ch' }}>{body}</p> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <Button variant="ghost" aria-label="Close" onClick={onClose}>✕</Button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  )
}

export interface TabItem {
  key: string
  label: string
  count?: number
}

export function Tabs({ tabs, active, onChange }: { tabs: TabItem[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          className={`tab${active === t.key ? ' tab-active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {typeof t.count === 'number' ? <span style={{ marginLeft: '0.4rem', opacity: 0.7 }}>({t.count})</span> : null}
        </button>
      ))}
    </div>
  )
}

export function Pager({ page, totalPages, onChange, total }: { page: number; totalPages: number; onChange: (page: number) => void; total?: number }) {
  const canPrev = page > 1
  const canNext = page < totalPages
  return (
    <div className="pager">
      <Button variant="secondary" size="sm" disabled={!canPrev} onClick={() => onChange(page - 1)}>← Prev</Button>
      <span className="pager-info">
        Page {page} of {Math.max(totalPages, 1)}
        {typeof total === 'number' ? ` · ${total} total` : ''}
      </span>
      <Button variant="secondary" size="sm" disabled={!canNext} onClick={() => onChange(page + 1)}>Next →</Button>
    </div>
  )
}
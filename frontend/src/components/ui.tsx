import { useState } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import type { Role } from '../lib/types'
import { ROLE_LABELS } from '../lib/types'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'primary', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={`btn btn-${variant}${className ? ` ${className}` : ''}`} {...rest} />
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
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/utils/cn'

export const fieldClass =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-ink shadow-sm outline-none transition-colors placeholder:text-stone-400 focus:border-amber-700 disabled:bg-stone-100'

export function Field({
  label,
  hint,
  error,
  children,
  light = false,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
  light?: boolean
}) {
  return (
    <label className="block space-y-1.5">
      <span className={cn('text-sm font-medium', light ? 'text-amber-50/85' : 'text-ink')}>{label}</span>
      {children}
      {error ? <span className={cn('block text-sm', light ? 'text-rose-200' : 'text-rose-700')}>{error}</span> : hint ? <span className={cn('block text-sm', light ? 'text-white/60' : 'text-stone-500')}>{hint}</span> : null}
    </label>
  )
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, className)} {...props} />
}

export function NumberInput({
  value,
  onValueChange,
  className,
  onFocus,
  onBlur,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null
  onValueChange: (value: number | null) => void
}) {
  const [text, setText] = useState(value == null || Number.isNaN(value) ? '' : String(value))
  const editing = useRef(false)

  useEffect(() => {
    if (editing.current) return
    setText(value == null || Number.isNaN(value) ? '' : String(value))
  }, [value])

  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={cn(fieldClass, className)}
      value={text}
      onFocus={(event) => {
        editing.current = true
        onFocus?.(event)
      }}
      onBlur={(event) => {
        editing.current = false
        if (text.trim() === '') onValueChange(null)
        else if (Number.isFinite(Number(text))) onValueChange(Number(text))
        onBlur?.(event)
      }}
      onChange={(event) => {
        const raw = event.target.value
        if (raw !== '' && !/^\d+$/.test(raw)) return
        setText(raw)
        onValueChange(raw === '' ? null : Number(raw))
      }}
    />
  )
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClass, 'min-h-24 resize-y', className)} {...props} />
}

export function SelectInput({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldClass, className)} {...props}>
      {children}
    </select>
  )
}

export function Checkbox({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input type="checkbox" className="h-4 w-4 accent-amber-700" {...props} />
      {label}
    </label>
  )
}

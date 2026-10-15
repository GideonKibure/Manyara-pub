import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'

const variants = {
  primary: 'bg-charcoal text-white hover:bg-black',
  gold: 'bg-amber-700 text-white hover:bg-amber-800',
  secondary: 'border border-stone-300 bg-white text-ink hover:bg-stone-50',
  ghost: 'text-ink hover:bg-stone-200/70',
  danger: 'bg-rose-700 text-white hover:bg-rose-800',
}

const sizes = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  loading?: boolean
  children: ReactNode
}) {
  return (
    <button
      className={cn(
        'inline-flex touch-manipulation items-center justify-center gap-2 rounded-lg font-semibold transition duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}

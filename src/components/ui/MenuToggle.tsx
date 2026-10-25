import { cn } from '@/utils/cn'

export function MenuToggle({
  open,
  onClick,
  label,
  className,
}: {
  open: boolean
  onClick: () => void
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      className={cn('menu-toggle', open && 'on', className)}
      aria-label={label}
      aria-expanded={open}
      onClick={onClick}
    >
      <span className="menu-toggle-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </button>
  )
}

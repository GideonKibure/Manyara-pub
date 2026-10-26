import { cn } from '@/utils/cn'

export const LOGO_SRC = '/logo.png'
export const LOGO_MARK_SRC = '/logo-mark.png'

export function BrandLogo({
  className,
  alt = 'Manyara Pub',
  framed = false,
}: {
  className?: string
  alt?: string
  framed?: boolean
}) {
  const image = (
    <img
      src={framed ? LOGO_MARK_SRC : LOGO_SRC}
      alt={alt}
      className={cn(framed ? 'nav-logo-mark' : 'object-contain', !framed && className)}
    />
  )
  if (!framed) return image
  return <span className={cn('nav-logo', className)}>{image}</span>
}

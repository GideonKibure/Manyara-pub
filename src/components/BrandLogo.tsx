import { cn } from '@/utils/cn'

export const LOGO_SRC = '/logo.png'

export function BrandLogo({
  className,
  alt = 'Manyara Pub',
}: {
  className?: string
  alt?: string
}) {
  return <img src={LOGO_SRC} alt={alt} className={cn('object-contain', className)} />
}

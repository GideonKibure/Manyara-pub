import { forwardRef, useEffect, useRef, type HTMLAttributes, type MutableRefObject, type Ref } from 'react'
import { cn } from '@/utils/cn'

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === 'function') ref(node)
      else (ref as MutableRefObject<T | null>).current = node
    }
  }
}

function canScroll(node: HTMLElement) {
  const style = getComputedStyle(node)
  const overflowY = style.overflowY
  return (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && node.scrollHeight > node.clientHeight + 1
}

function nearestScroller(from: HTMLElement) {
  let node: HTMLElement | null = from.parentElement
  while (node && node !== document.body && node !== document.documentElement) {
    if (canScroll(node)) return node
    node = node.parentElement
  }
  return (document.scrollingElement ?? document.documentElement) as HTMLElement
}

function shiftScroll(node: HTMLElement, delta: number) {
  const max = Math.max(0, node.scrollHeight - node.clientHeight)
  node.scrollTop = Math.min(max, Math.max(0, node.scrollTop + delta))
}

export const ChainScroll = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function ChainScroll(
  { className, onScroll, ...props },
  forwarded,
) {
  const inner = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = inner.current
    if (!el) return

    const atEdge = (delta: number) => {
      const max = el.scrollHeight - el.clientHeight
      if (max <= 1) return true
      return (delta < 0 && el.scrollTop <= 0) || (delta > 0 && el.scrollTop >= max - 1)
    }

    const pass = (delta: number) => {
      shiftScroll(nearestScroller(el), delta)
    }

    const onWheel = (event: WheelEvent) => {
      if (!atEdge(event.deltaY)) return
      pass(event.deltaY)
      event.preventDefault()
    }

    let lastY = 0
    const onStart = (event: TouchEvent) => {
      lastY = event.touches[0]?.clientY ?? 0
    }
    const onMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? lastY
      const delta = lastY - y
      lastY = y
      if (!delta || !atEdge(delta)) return
      pass(delta)
      event.preventDefault()
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
    }
  }, [])

  return <div ref={mergeRefs(inner, forwarded)} className={cn(className)} onScroll={onScroll} {...props} />
})

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Bell, LogOut, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PersonPhoto, productFromNotice, ProductThumb } from '@/components/ProductPicker'
import { noticeGroups, noticesIn } from '@/features/notifications/groups'
import { ToastViewport } from '@/components/ui/Feedback'
import { useApp } from '@/context/AppContext'
import { LanguageSwitch, useI18n } from '@/i18n/LanguageContext'
import { cn } from '@/utils/cn'

export interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
  end?: boolean
  menu?: boolean
}

export interface NavSection {
  label: string
  items: NavItem[]
}

export function AppShell({
  sections,
  bottom,
}: {
  sections: NavSection[]
  bottom?: NavItem[]
}) {
  const { user, settings, unreadCount, logout, idlePrompt, idleLeft, staySignedIn, toasts, dismissToast, notifications, products } = useApp()
  const { t } = useI18n()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('manyara.sidebar') === '1')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)
  const home = user?.role === 'admin' ? '/admin/notifications' : '/employee/notifications'
  const current = sections
    .flatMap((section) => section.items)
    .filter((item) => !item.menu)
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => (item.end ? location.pathname === item.to : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)))

  useEffect(() => {
    setMobileOpen(false)
    setBellOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileOpen && !bellOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMobileOpen(false)
      setBellOpen(false)
    }
    document.addEventListener('keydown', onKey)
    if (mobileOpen) document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [mobileOpen, bellOpen])

  useEffect(() => {
    if (!bellOpen) return
    const onPointer = (event: PointerEvent) => {
      if (!bellRef.current?.contains(event.target as Node)) setBellOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [bellOpen])

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      localStorage.setItem('manyara.sidebar', current ? '0' : '1')
      return !current
    })
  }

  const profileTo = user?.role === 'admin' ? '/admin/profile' : '/employee/profile'
  const links = (items: NavItem[], compact = false, roomy = false, glass = false) =>
    items.filter((item) => !item.menu).map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        title={item.label}
        className={({ isActive }) =>
          cn(
            'group flex min-h-11 touch-manipulation items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium transition duration-150 active:scale-[0.98]',
            glass ? 'text-stone-800 hover:bg-white/70' : 'text-stone-100 hover:bg-white/10 hover:text-white',
            roomy && 'min-h-12 py-3 text-base leading-5',
            isActive && 'bg-amber-700 text-white shadow-[0_8px_18px_rgba(180,83,9,0.28)] hover:bg-amber-700 hover:text-white',
            compact && 'justify-center px-2',
          )
        }
      >
        <span className="relative">
          <item.icon className="h-5 w-5 shrink-0" />
          {compact && item.badge ? <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-amber-300 ring-2 ring-charcoal" /> : null}
        </span>
        {!compact && <span className={cn('min-w-0 flex-1', roomy ? 'whitespace-normal leading-5' : 'truncate')}>{item.label}</span>}
        {!compact && item.badge ? <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', glass ? 'bg-amber-100 text-amber-950' : 'bg-white/20 text-white')}>{item.badge}</span> : null}
      </NavLink>
    ))

  const sidebar = (compact: boolean, onClose?: () => void) => {
    const glass = Boolean(onClose)
    return (
    <div className="flex h-full flex-col">
      <div className={cn('flex items-center gap-3 px-4 py-5', compact && 'justify-center px-2', glass && 'pt-[max(1.25rem,env(safe-area-inset-top))]')}>
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-700 font-display text-lg text-white shadow-md shadow-amber-900/20">M</div>
        {!compact && (
          <div className="min-w-0 flex-1">
            <p className={cn('font-display text-lg leading-tight', glass ? 'text-ink' : 'text-white')}>{settings.businessName}</p>
            <p className={cn('mt-1 text-xs uppercase tracking-wider', glass ? 'text-stone-500' : 'text-stone-300')}>{t('management')}</p>
          </div>
        )}
        {onClose && (
          <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-white/70 bg-white/50 text-stone-700 shadow-sm backdrop-blur hover:bg-white/80" aria-label={t('closeMenu')} onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Main">
        {sections.map((section) => (
          <div key={section.label}>
            {!compact && <p className={cn('mb-2 px-3 text-xs font-semibold uppercase tracking-wider', glass ? 'text-stone-500' : 'text-stone-400', onClose && !glass && 'text-[13px] text-stone-200')}>{section.label}</p>}
            <div className="space-y-1">{links(section.items, compact, Boolean(onClose), glass)}</div>
          </div>
        ))}
      </nav>
      <div className={cn('p-3', glass ? 'border-t border-white/50 bg-white/25 pb-[max(0.75rem,env(safe-area-inset-bottom))]' : 'border-t border-white/10')}>
        {onClose && (
          <div className="mb-3">
            <p className={cn('mb-2 px-2 text-xs font-semibold uppercase tracking-wider', glass ? 'text-stone-500' : 'text-stone-200')}>{t('language')}</p>
            <LanguageSwitch roomy />
          </div>
        )}
        <Link to={profileTo} className={cn('mb-3 flex items-center gap-3 rounded-2xl px-2 py-2', glass ? 'hover:bg-white/60' : 'hover:bg-white/10', compact && 'justify-center px-0')}>
          <PersonPhoto src={user?.imageUrl} name={user?.fullName ?? 'M'} className="h-10 w-10" />
          {!compact && (
            <div className="min-w-0">
              <p className={cn('text-sm font-semibold leading-5', glass ? 'text-ink' : 'text-white')}>{user?.fullName}</p>
              <p className={cn('text-xs capitalize', glass ? 'text-stone-500' : 'text-stone-300')}>{user?.role}</p>
            </div>
          )}
        </Link>
        <button type="button" className={cn('flex min-h-11 w-full touch-manipulation items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition active:scale-[0.98]', glass ? 'text-stone-800 hover:bg-white/70' : 'text-stone-100 hover:bg-white/10 hover:text-white', compact && 'justify-center')} onClick={logout}>
          <LogOut className="h-5 w-5" />
          {!compact && t('signOut')}
        </button>
      </div>
    </div>
    )
  }

  return (
    <div className="app-canvas min-h-screen text-ink">
      <aside className={cn('no-print fixed inset-y-0 left-0 z-30 hidden bg-charcoal transition-[width] duration-200 md:block', collapsed ? 'w-20' : 'w-72')}>{sidebar(collapsed)}</aside>
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-stone-950/30 backdrop-blur-xl" aria-label={t('closeMenu')} onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[70vw] overflow-hidden border-r border-white/70 bg-white/40 shadow-[16px_0_50px_rgba(28,25,23,0.18)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/55 via-white/25 to-amber-100/35" />
            <div className="relative h-full">{sidebar(false, () => setMobileOpen(false))}</div>
          </aside>
        </div>
      )}
      <div className={cn('min-h-screen transition-[padding] duration-200', collapsed ? 'md:pl-20' : 'md:pl-72')}>
        <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-line bg-paper/95 px-3 py-2 backdrop-blur md:justify-start sm:px-4">
          <button type="button" className="rounded-full ring-2 ring-amber-700/40 ring-offset-2 ring-offset-paper md:hidden" aria-label={t('openMenu')} aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>
            <PersonPhoto src={user?.imageUrl} name={user?.fullName ?? 'M'} className="h-11 w-11 text-base" />
          </button>
          <button type="button" className="hidden h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-stone-200 md:grid" aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')} aria-expanded={!collapsed} onClick={toggleCollapsed}>
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
          <p className="hidden min-w-0 flex-1 truncate text-sm font-semibold text-ink md:block sm:text-base">{current?.label ?? settings.businessName}</p>
          <span className="hidden md:inline-flex">
            <PersonPhoto src={user?.imageUrl} name={user?.fullName ?? 'M'} className="h-9 w-9" />
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="hidden md:block">
              <LanguageSwitch />
            </div>
            <div className="relative" ref={bellRef}>
            <button type="button" className="relative grid h-11 w-11 place-items-center rounded-xl hover:bg-stone-200" aria-label={unreadCount > 0 ? `${t('notifications')} ${unreadCount}` : t('notifications')} aria-expanded={bellOpen} onClick={() => setBellOpen((open) => !open)}>
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && <span className="absolute left-1/2 top-0 grid h-3.5 min-w-3.5 -translate-x-1/2 place-items-center rounded-full bg-rose-700 px-1 text-[9px] font-bold leading-none text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>
            {bellOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-white p-3 shadow-xl">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-semibold">{t('notifications')}</p>
                  <button type="button" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-stone-100" aria-label={t('closeNotifications')} onClick={() => setBellOpen(false)}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {user?.role === 'admin' && (
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    {noticeGroups.filter((item) => item.id !== 'all').map((item) => {
                      const count = noticesIn(notifications, item.types).length
                      return (
                        <Link key={item.id} to="/admin/notifications" className="rounded-xl bg-stone-50 px-2 py-2 text-sm hover:bg-stone-100">
                          <span className="block text-lg font-semibold">{count}</span>
                          <span className="block text-stone-500">{t(item.labelKey)}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
                <div className="max-h-80 space-y-2 overflow-y-auto">
                  {notifications.slice(0, 5).map((item) => {
                    const product = productFromNotice(products, item)
                    return (
                      <Link key={item.id} to={item.href} className="flex items-start gap-2 rounded-xl bg-stone-50 px-3 py-2 text-sm hover:bg-stone-100">
                        {product && <ProductThumb src={product.imageUrl} name={product.name} className="mt-0.5 h-8 w-8 shrink-0" />}
                        <span>
                          <span className="font-medium">{item.title}</span>
                          <span className="mt-0.5 block text-stone-500">{item.message}</span>
                        </span>
                      </Link>
                    )
                  })}
                  {!notifications.length && <p className="text-sm text-stone-500">{t('noNotifications')}</p>}
                </div>
                <Link to={home} className="mt-3 block rounded-lg px-1 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50" onClick={() => setBellOpen(false)}>
                  {t('viewAll')}
                </Link>
              </div>
            )}
            </div>
          </div>
        </header>
        <main className={cn('px-3 py-4 sm:px-4 sm:py-6 md:px-8', bottom && 'pb-36 md:pb-8')}>
          <Outlet />
        </main>
      </div>
      {bottom && (
        <nav className="no-print fixed inset-x-2 z-30 md:hidden" style={{ bottom: 'max(0.4rem, env(safe-area-inset-bottom))' }} aria-label="Quick actions">
          <div className="grid items-end rounded-[1.75rem] border border-amber-100/80 bg-white/95 px-1.5 py-2 shadow-[0_10px_28px_rgba(28,25,23,0.14)] backdrop-blur" style={{ gridTemplateColumns: `repeat(${bottom.length}, minmax(0, 1fr))` }}>
            {bottom.map((item) => {
              const active = item.menu ? mobileOpen : item.end ? location.pathname === item.to : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
              const body = (
                <>
                  <span className={cn('nav-tab relative grid aspect-square w-full max-w-11 place-items-center rounded-full transition duration-200', active ? 'scale-105 bg-amber-700 text-white shadow-[0_6px_14px_rgba(180,83,9,0.35)]' : 'bg-stone-100 text-stone-600 active:scale-90')}>
                    <item.icon className="h-[1.15rem] w-[1.15rem]" />
                    {item.badge ? <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-700 px-1 text-[9px] font-bold text-white ring-2 ring-white">{item.badge}</span> : null}
                  </span>
                  <span className={cn('flex min-h-8 max-w-full items-start justify-center break-words text-center text-[11px] font-semibold leading-tight', active ? 'text-amber-900' : 'text-stone-600')}>{item.label}</span>
                </>
              )
              const className = 'flex min-w-0 touch-manipulation flex-col items-center gap-1 px-0.5'
              return item.menu ? (
                <button key="menu" type="button" className={className} aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>{body}</button>
              ) : (
                <NavLink key={item.to} to={item.to} end={item.end} className={className}>{body}</NavLink>
              )
            })}
          </div>
        </nav>
      )}
      {idlePrompt && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/60" />
          <div role="dialog" aria-modal="true" aria-labelledby="idle-title" className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h2 id="idle-title" className="text-xl font-semibold text-ink">{t('idleTitle')}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">{t('idleBody')}</p>
            <p className="mt-3 text-sm font-semibold text-amber-900">{t('idleRemain')} {idleLeft}s</p>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button variant="gold" onClick={staySignedIn}>{t('idleStay')}</Button>
              <Button variant="secondary" onClick={logout}>{t('idleLeave')}</Button>
            </div>
          </div>
        </div>
      )}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <span className="sr-only">{mobileOpen ? 'Menu open' : ''}</span>
    </div>
  )
}

export function GuardMessage({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-lg py-16 text-center">{children}</div>
}

import { Link } from 'react-router-dom'
import { useApp } from '@/context/AppContext'

export function AccessDeniedPage() {
  const { user } = useApp()
  const home = user?.role === 'admin' ? '/admin/dashboard' : '/employee/dashboard'
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-3xl font-semibold">Access denied</h1>
      <p className="mt-3 text-sm leading-6 text-stone-600">Your account does not have permission to open that page.</p>
      <Link to={home} className="mt-6 inline-flex h-11 items-center rounded-lg bg-charcoal px-4 text-sm font-semibold text-white">
        Go to your dashboard
      </Link>
    </div>
  )
}

import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="mt-3 text-sm text-stone-600">That address is not part of Manyara Pub.</p>
      <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-lg bg-charcoal px-4 text-sm font-semibold text-white">
        Continue
      </Link>
    </div>
  )
}

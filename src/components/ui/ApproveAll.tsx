import { Button } from '@/components/ui/Button'
import { useI18n } from '@/i18n/LanguageContext'

export function ApproveAllButton({
  count,
  loading,
  label,
  onClick,
}: {
  count: number
  loading?: boolean
  label: string
  onClick: () => void
}) {
  const { t } = useI18n()
  if (count < 1) return null
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-stone-600">{count} {t('statusPending').toLowerCase()}</p>
      <Button variant="gold" className="w-full sm:w-auto" loading={loading} onClick={onClick}>
        {label}
      </Button>
    </div>
  )
}

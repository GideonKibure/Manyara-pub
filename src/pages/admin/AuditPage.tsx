import { useMemo, useState } from 'react'
import { DataTable } from '@/components/ui/DataTable'
import { TextInput } from '@/components/ui/Fields'
import { StaffCell } from '@/components/ProductPicker'
import { PageHeader } from '@/components/ui/Feedback'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/i18n/LanguageContext'
import { formatDateTime } from '@/utils/dates'

export function AuditPage() {
  const { auditLogs, nameOf } = useApp()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const rows = useMemo(
    () => auditLogs.filter((log) => `${log.summary} ${log.action} ${nameOf(log.actorId)}`.toLowerCase().includes(query.trim().toLowerCase())),
    [auditLogs, nameOf, query],
  )
  return (
    <div>
      <PageHeader title={t('pageAudit')} description={t('pageAuditBody')} />
      <TextInput className="mb-4" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchAudit')} aria-label={t('searchAudit')} />
      <DataTable
        rows={rows}
        getRowId={(row) => row.id}
        resetKey={query}
        emptyTitle={t('emptyAudit')}
        columns={[
          { key: 'when', header: t('whenCol'), sortValue: (row) => row.createdAt, render: (row) => formatDateTime(row.createdAt) },
          { key: 'who', header: t('whoCol'), render: (row) => <StaffCell id={row.actorId} /> },
          { key: 'action', header: t('actionCol'), className: 'hidden md:table-cell', render: (row) => row.action },
          { key: 'summary', header: t('summaryCol'), render: (row) => row.summary },
        ]}
      />
    </div>
  )
}

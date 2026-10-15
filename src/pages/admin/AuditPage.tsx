import { useMemo, useState } from 'react'
import { DataTable } from '@/components/ui/DataTable'
import { TextInput } from '@/components/ui/Fields'
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
      <TextInput className="mb-4" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the log" aria-label="Search audit log" />
      <DataTable
        rows={rows}
        getRowId={(row) => row.id}
        resetKey={query}
        emptyTitle="No log entries"
        columns={[
          { key: 'when', header: 'When', sortValue: (row) => row.createdAt, render: (row) => formatDateTime(row.createdAt) },
          { key: 'who', header: 'Who', render: (row) => nameOf(row.actorId) },
          { key: 'action', header: 'Action', className: 'hidden md:table-cell', render: (row) => row.action },
          { key: 'summary', header: 'What happened', render: (row) => row.summary },
        ]}
      />
    </div>
  )
}

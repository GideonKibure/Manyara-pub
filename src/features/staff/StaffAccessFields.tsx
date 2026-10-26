import { Checkbox, Field, SelectInput } from '@/components/ui/Fields'
import { useI18n } from '@/i18n/LanguageContext'
import type { AssignedRole } from '@/utils/access'

export function StaffAccessFields({
  assignedRole,
  onRole,
  canSubmitActivities,
  onSubmitActivities,
  canViewStock,
  onViewStock,
  canViewSuppliers,
  onViewSuppliers,
}: {
  assignedRole: AssignedRole
  onRole: (role: AssignedRole) => void
  canSubmitActivities: boolean
  onSubmitActivities: (value: boolean) => void
  canViewStock: boolean
  onViewStock: (value: boolean) => void
  canViewSuppliers: boolean
  onViewSuppliers: (value: boolean) => void
}) {
  const { t } = useI18n()
  const locked = assignedRole === 'admin'
  const supplierLocked = locked || assignedRole === 'manager'
  return (
    <div className="space-y-3">
      <Field label={t('roleCol')}>
        <SelectInput value={assignedRole} onChange={(event) => onRole(event.target.value as AssignedRole)}>
          <option value="employee">{t('profileRoleEmployee')}</option>
          <option value="manager">{t('profileRoleManager')}</option>
          <option value="admin">{t('profileRoleAdmin')}</option>
        </SelectInput>
      </Field>
      <Checkbox
        label={t('canSubmitActivities')}
        checked={locked || canSubmitActivities}
        disabled={locked}
        onChange={(event) => onSubmitActivities(event.target.checked)}
      />
      <Checkbox
        label={t('canViewStock')}
        checked={locked || canViewStock}
        disabled={locked}
        onChange={(event) => onViewStock(event.target.checked)}
      />
      <Checkbox
        label={t('canViewSuppliers')}
        checked={supplierLocked || canViewSuppliers}
        disabled={supplierLocked}
        onChange={(event) => onViewSuppliers(event.target.checked)}
      />
    </div>
  )
}

import type { Profile, Role, StaffTitle } from '@/types'

export type AssignedRole = 'admin' | 'manager' | 'employee'

export function assignedRoleOf(profile: Pick<Profile, 'role' | 'staffTitle'>): AssignedRole {
  if (profile.role === 'admin') return 'admin'
  if (profile.staffTitle === 'manager') return 'manager'
  return 'employee'
}

export function accessFromAssigned(
  assigned: AssignedRole,
  flags?: { canSubmitActivities?: boolean; canViewStock?: boolean; canViewSuppliers?: boolean },
) {
  const admin = assigned === 'admin'
  const manager = assigned === 'manager'
  return {
    role: (admin ? 'admin' : 'employee') as Role,
    staffTitle: (manager ? 'manager' : 'staff') as StaffTitle,
    canSubmitActivities: admin ? true : Boolean(flags?.canSubmitActivities),
    canViewStock: admin ? true : flags?.canViewStock !== false,
    canViewSuppliers: admin || manager || Boolean(flags?.canViewSuppliers),
  }
}

export function canViewSupplierContacts(user?: Pick<Profile, 'role' | 'staffTitle' | 'canViewSuppliers'> | null) {
  if (!user) return false
  return user.role === 'admin' || user.staffTitle === 'manager' || user.canViewSuppliers
}

export function roleLabelKey(profile: Pick<Profile, 'role' | 'staffTitle'>) {
  const assigned = assignedRoleOf(profile)
  if (assigned === 'admin') return 'profileRoleAdmin' as const
  if (assigned === 'manager') return 'profileRoleManager' as const
  return 'profileRoleEmployee' as const
}

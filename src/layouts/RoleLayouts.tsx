import {
  BarChart3,
  Bell,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Gamepad2,
  House,
  LayoutDashboard,
  Menu,
  Package,
  PackagePlus,
  Receipt,
  ScrollText,
  Wallet,
  Settings,
  ShoppingCart,
  Tags,
  UserRound,
  Users,
} from 'lucide-react'
import { AppShell, type NavSection } from '@/layouts/AppShell'
import { useApp } from '@/context/AppContext'
import { pendingForAdmin } from '@/features/sales/holds'
import { useI18n } from '@/i18n/LanguageContext'

export function AdminLayout() {
  const { stockIns, sales, activities, expenses, unreadCount } = useApp()
  const { t } = useI18n()
  const pending =
    stockIns.filter((item) => item.status === 'pending').length +
    sales.filter((item) => pendingForAdmin(item)).length +
    activities.filter((item) => item.status === 'pending').length +
    expenses.filter((item) => item.status === 'pending').length
  const sections: NavSection[] = [
    {
      label: t('navOverview'),
      items: [
        { to: '/admin/dashboard', label: t('navDashboard'), icon: LayoutDashboard, end: true },
        { to: '/admin/approvals', label: t('navApprovals'), icon: ClipboardList, badge: pending },
      ],
    },
    {
      label: t('navOperations'),
      items: [
        { to: '/admin/stock-in', label: t('navStockIn'), icon: PackagePlus },
        { to: '/admin/sales', label: t('navSales'), icon: Receipt },
        { to: '/admin/bills', label: t('navBills'), icon: ScrollText },
        { to: '/admin/expenses', label: t('navExpenses'), icon: Wallet },
        { to: '/admin/activities', label: t('navActivities'), icon: Gamepad2 },
        { to: '/admin/inventory', label: t('navInventory'), icon: Boxes },
        { to: '/admin/remaining', label: t('navRemaining'), icon: ClipboardCheck },
      ],
    },
    {
      label: t('navCatalog'),
      items: [
        { to: '/admin/products', label: t('navProducts'), icon: Package },
        { to: '/admin/categories', label: t('navCategories'), icon: Tags },
      ],
    },
    {
      label: t('navInsight'),
      items: [
        { to: '/admin/reports', label: t('navReports'), icon: BarChart3 },
        { to: '/admin/notifications', label: t('navNotifications'), icon: Bell, badge: unreadCount },
        { to: '/admin/audit-logs', label: t('navAudit'), icon: ScrollText },
        { to: '/admin/employees', label: t('navEmployees'), icon: Users },
        { to: '/admin/settings', label: t('navSettings'), icon: Settings },
        { to: '/admin/profile', label: t('navProfile'), icon: UserRound },
      ],
    },
  ]
  return (
    <AppShell
      sections={sections}
      bottom={[
        { to: '/admin/dashboard', label: t('navHome'), icon: House, end: true },
        { to: '/admin/approvals', label: t('navApprovals'), icon: ClipboardList, badge: pending },
        { to: '/admin/stock-in', label: t('navStock'), icon: PackagePlus },
        { to: '/admin/sales', label: t('navSales'), icon: Receipt },
        { to: '/admin/dashboard', label: t('navMenu'), icon: Menu, menu: true },
      ]}
    />
  )
}

export function EmployeeLayout() {
  const { user, unreadCount } = useApp()
  const { t } = useI18n()
  const items = [
    { to: '/employee/dashboard', label: t('navDashboard'), icon: House, end: true },
    { to: '/employee/orders', label: t('dashOrders'), icon: ScrollText },
    { to: '/employee/stock-in', label: t('navStockIn'), icon: PackagePlus },
    { to: '/employee/sales', label: t('navSales'), icon: ShoppingCart },
    { to: '/employee/bills', label: t('navBills'), icon: Receipt },
    { to: '/employee/expenses', label: t('navExpenses'), icon: Wallet },
    ...(user?.canSubmitActivities ? [{ to: '/employee/activities', label: t('navActivities'), icon: Gamepad2 }] : []),
    { to: '/employee/submissions', label: t('navSubmissions'), icon: ClipboardList },
    { to: '/employee/notifications', label: t('navNotifications'), icon: Bell, badge: unreadCount },
    { to: '/employee/profile', label: t('navProfile'), icon: UserRound },
  ]
  const sections: NavSection[] = [
    { label: t('remainSection'), items: [{ to: '/employee/remaining', label: t('navRemaining'), icon: ClipboardCheck }] },
    { label: t('navYourWork'), items },
  ]
  return (
    <AppShell
      sections={sections}
      bottom={[
        { to: '/employee/dashboard', label: t('navHome'), icon: House, end: true },
        { to: '/employee/stock-in', label: t('navStock'), icon: PackagePlus },
        { to: '/employee/sales', label: t('navSales'), icon: ShoppingCart },
        { to: '/employee/bills', label: t('navBills'), icon: Receipt },
        { to: '/employee/expenses', label: t('navExpenses'), icon: Wallet },
        { to: '/employee/submissions', label: t('navHistory'), icon: ClipboardList },
      ]}
    />
  )
}

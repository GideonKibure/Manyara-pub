import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { AuthLayout } from '@/layouts/AuthLayout'
import { AdminLayout, EmployeeLayout } from '@/layouts/RoleLayouts'
import { AccessDeniedPage } from '@/pages/AccessDeniedPage'
import { ActivitiesPage as AdminActivitiesPage } from '@/pages/admin/ActivitiesPage'
import { ApprovalsPage } from '@/pages/admin/ApprovalsPage'
import { AuditPage } from '@/pages/admin/AuditPage'
import { CategoriesPage } from '@/pages/admin/CategoriesPage'
import { DashboardPage as AdminDashboardPage } from '@/pages/admin/DashboardPage'
import { EmployeesPage } from '@/pages/admin/EmployeesPage'
import { ExpensesPage as AdminExpensesPage } from '@/pages/admin/ExpensesPage'
import { InventoryPage } from '@/pages/admin/InventoryPage'
import { NotificationsPage as AdminNotificationsPage } from '@/pages/admin/NotificationsPage'
import { ProductsPage } from '@/pages/admin/ProductsPage'
import { ReportsPage } from '@/pages/admin/ReportsPage'
import { SalesPage as AdminSalesPage } from '@/pages/admin/SalesPage'
import { SettingsPage } from '@/pages/admin/SettingsPage'
import { StockInPage as AdminStockInPage } from '@/pages/admin/StockInPage'
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from '@/pages/auth/AuthPages'
import { ActivitiesPage as EmployeeActivitiesPage } from '@/pages/employee/ActivitiesPage'
import { DashboardPage as EmployeeDashboardPage } from '@/pages/employee/DashboardPage'
import { ExpensesPage as EmployeeExpensesPage } from '@/pages/employee/ExpensesPage'
import { NotificationsPage as EmployeeNotificationsPage } from '@/pages/employee/NotificationsPage'
import { OrdersPage } from '@/pages/employee/OrdersPage'
import { ProfilePage } from '@/pages/employee/ProfilePage'
import { SalesPage as EmployeeSalesPage } from '@/pages/employee/SalesPage'
import { RemainingStockPage } from '@/pages/employee/RemainingStockPage'
import { StockInPage as EmployeeStockInPage } from '@/pages/employee/StockInPage'
import { SubmissionsPage } from '@/pages/employee/SubmissionsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import type { Role } from '@/types'

function RequireAuth() {
  const { user } = useApp()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

function RequireRole({ role }: { role: Role }) {
  const { user } = useApp()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to="/access-denied" replace />
  return <Outlet />
}

function HomeRedirect() {
  const { user } = useApp()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/employee/dashboard'} replace />
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/access-denied" element={<AccessDeniedPage />} />
        <Route element={<RequireRole role="admin" />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/products" element={<ProductsPage />} />
            <Route path="/admin/categories" element={<CategoriesPage />} />
            <Route path="/admin/stock-in" element={<AdminStockInPage />} />
            <Route path="/admin/stock-in/new" element={<EmployeeStockInPage />} />
            <Route path="/admin/stock-in/edit" element={<EmployeeStockInPage />} />
            <Route path="/admin/sales" element={<AdminSalesPage kind="sale" />} />
            <Route path="/admin/sales/new" element={<EmployeeSalesPage kind="sale" />} />
            <Route path="/admin/sales/edit" element={<EmployeeSalesPage kind="sale" />} />
            <Route path="/admin/bills" element={<AdminSalesPage kind="bill" />} />
            <Route path="/admin/bills/new" element={<EmployeeSalesPage kind="bill" />} />
            <Route path="/admin/bills/edit" element={<EmployeeSalesPage kind="bill" />} />
            <Route path="/admin/approvals" element={<ApprovalsPage />} />
            <Route path="/admin/inventory" element={<InventoryPage />} />
            <Route path="/admin/remaining" element={<RemainingStockPage />} />
            <Route path="/admin/expenses" element={<AdminExpensesPage />} />
            <Route path="/admin/expenses/new" element={<EmployeeExpensesPage />} />
            <Route path="/admin/activities" element={<AdminActivitiesPage />} />
            <Route path="/admin/reports" element={<ReportsPage />} />
            <Route path="/admin/employees" element={<EmployeesPage />} />
            <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
            <Route path="/admin/audit-logs" element={<AuditPage />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
            <Route path="/admin/profile" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route element={<RequireRole role="employee" />}>
          <Route element={<EmployeeLayout />}>
            <Route path="/employee/dashboard" element={<EmployeeDashboardPage />} />
            <Route path="/employee/stock-in" element={<EmployeeStockInPage />} />
            <Route path="/employee/remaining" element={<RemainingStockPage />} />
            <Route path="/employee/sales" element={<EmployeeSalesPage kind="sale" />} />
            <Route path="/employee/bills" element={<EmployeeSalesPage kind="bill" />} />
            <Route path="/employee/expenses" element={<EmployeeExpensesPage />} />
            <Route path="/employee/orders" element={<OrdersPage />} />
            <Route path="/employee/activities" element={<EmployeeActivitiesPage />} />
            <Route path="/employee/submissions" element={<SubmissionsPage />} />
            <Route path="/employee/notifications" element={<EmployeeNotificationsPage />} />
            <Route path="/employee/profile" element={<ProfilePage />} />
          </Route>
        </Route>
      </Route>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

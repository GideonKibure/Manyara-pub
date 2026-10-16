import { supabase } from '@/lib/supabase'

async function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured. Add the public URL and anon key.')
  return supabase
}

export async function finalizeStockIn(id: string) {
  const client = await requireClient()
  return client.rpc('finalize_stock_in', { p_id: id })
}

export async function approveStockIn(id: string) {
  const client = await requireClient()
  return client.rpc('approve_stock_in', { p_id: id })
}

export async function rejectStockIn(id: string, reason: string) {
  const client = await requireClient()
  return client.rpc('reject_stock_in', { p_id: id, p_reason: reason })
}

export async function approveSale(id: string) {
  const client = await requireClient()
  return client.rpc('approve_sale', { p_id: id })
}

export async function settleBillLoss(id: string) {
  const client = await requireClient()
  return client.rpc('settle_bill_loss', { p_id: id })
}

export async function rejectSale(id: string, reason: string) {
  const client = await requireClient()
  return client.rpc('reject_sale', { p_id: id, p_reason: reason })
}

export async function approveExpense(id: string) {
  const client = await requireClient()
  return client.rpc('approve_expense', { p_id: id })
}

export async function rejectExpense(id: string, reason: string) {
  const client = await requireClient()
  return client.rpc('reject_expense', { p_id: id, p_reason: reason })
}

export async function submitExpense(payload: Record<string, unknown>) {
  const client = await requireClient()
  return client.rpc('submit_expense', { p_payload: payload })
}

export async function approveActivity(id: string) {
  const client = await requireClient()
  return client.rpc('approve_activity', { p_id: id })
}

export async function rejectActivity(id: string, reason: string) {
  const client = await requireClient()
  return client.rpc('reject_activity', { p_id: id, p_reason: reason })
}

export async function adjustInventory(productId: string, delta: number, reason: string) {
  const client = await requireClient()
  return client.rpc('adjust_inventory', { p_product: productId, p_delta: delta, p_reason: reason })
}

export async function removeSupplier(id: string) {
  const client = await requireClient()
  return client.rpc('remove_supplier', { p_id: id })
}

export async function clearBusinessData() {
  const client = await requireClient()
  return client.rpc('clear_business_data')
}

export async function adminUpdateEmployee(id: string, fullName: string, phone: string, username: string, password: string) {
  const client = await requireClient()
  return client.rpc('admin_update_employee', {
    p_id: id,
    p_full_name: fullName,
    p_phone: phone,
    p_username: username,
    p_password: password,
  })
}

export async function adminDeleteEmployee(id: string) {
  const client = await requireClient()
  return client.rpc('admin_delete_employee', { p_id: id })
}

export async function submitStockIn(payload: Record<string, unknown>) {
  const client = await requireClient()
  return client.rpc('submit_stock_in', { p_payload: payload })
}

export async function submitSale(payload: Record<string, unknown>) {
  const client = await requireClient()
  return client.rpc('submit_sale', { p_payload: payload })
}

export async function submitRemainingCount(payload: Record<string, unknown>) {
  const client = await requireClient()
  return client.rpc('submit_remaining_count', { p_payload: payload })
}

export async function updateSale(id: string, payload: Record<string, unknown>) {
  const client = await requireClient()
  return client.rpc('update_sale', { p_id: id, p_payload: payload })
}

export async function updateStockIn(id: string, payload: Record<string, unknown>) {
  const client = await requireClient()
  return client.rpc('update_stock_in', { p_id: id, p_payload: payload })
}

export async function setBillPayment(id: string, status: string) {
  const client = await requireClient()
  return client.rpc('set_bill_payment', { p_id: id, p_status: status })
}

export async function recordBillPayment(id: string, amount: number) {
  const client = await requireClient()
  return client.rpc('record_bill_payment', { p_id: id, p_amount: amount })
}

export async function appendBillItem(id: string, productId: string, quantity: number, sizeName: string, portion: string) {
  const client = await requireClient()
  return client.rpc('append_bill_item', { p_id: id, p_product: productId, p_quantity: quantity, p_size: sizeName, p_portion: portion })
}

export async function submitActivity(payload: Record<string, unknown>) {
  const client = await requireClient()
  return client.rpc('submit_activity', { p_payload: payload })
}

export async function cancelSubmission(kind: string, id: string, reason: string) {
  const client = await requireClient()
  return client.rpc('cancel_submission', { p_kind: kind, p_id: id, p_reason: reason })
}

export async function emailForLogin(identifier: string) {
  const client = await requireClient()
  return client.rpc('email_for_login', { identifier })
}

export async function staffDirectory() {
  const client = await requireClient()
  return client.rpc('staff_directory')
}

export async function recordAudit(action: string, entityType: string, entityId: string, summary: string) {
  const client = await requireClient()
  return client.rpc('record_audit', {
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_summary: summary,
  })
}

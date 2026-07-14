import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import db from '@adonisjs/lucid/services/db'

type DbClient = typeof db | TransactionClientContract

export type AdminAuditAction =
  | 'admin.login.succeeded'
  | 'admin.pre_registration.approved'
  | 'admin.pre_registration.rejected'
  | 'admin.pre_registration.action_failed'

export type AdminAuditEventInput = {
  action: AdminAuditAction
  adminUserId: number | null
  details?: Record<string, unknown>
  preRegistrationId?: number | null
}

export type AdminAuditEventRow = {
  id: number
  action: string
  admin_user_id: number | string | null
  admin_email: string | null
  pre_registration_id: number | string | null
  details: unknown
  created_at: Date | string
}

function sanitizeDetails(details: Record<string, unknown> | undefined) {
  if (!details) {
    return null
  }

  return JSON.stringify(details)
}

export function buildAdminAuditEvent(input: AdminAuditEventInput) {
  return {
    admin_user_id: input.adminUserId,
    pre_registration_id: input.preRegistrationId ?? null,
    action: input.action,
    details: sanitizeDetails(input.details),
  }
}

export async function recordAdminAuditEvent(input: AdminAuditEventInput, client: DbClient = db) {
  await client.table('admin_audit_events').insert(buildAdminAuditEvent(input))
}

export function toAdminAuditEventDto(row: AdminAuditEventRow) {
  return {
    id: Number(row.id),
    action: row.action,
    adminUserId: row.admin_user_id === null ? null : Number(row.admin_user_id),
    adminEmail: row.admin_email,
    preRegistrationId: row.pre_registration_id === null ? null : Number(row.pre_registration_id),
    details: row.details ?? null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
  }
}

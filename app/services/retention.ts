import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { expireExpiredBookingDrafts } from '#services/booking_drafts'

const DEFAULT_USED_RESET_TOKEN_RETENTION_HOURS = 24

export async function cleanupExpiredSecurityArtifacts() {
  await expireExpiredBookingDrafts()

  await db
    .from('password_reset_tokens')
    .where('expires_at', '<=', DateTime.utc().toJSDate())
    .delete()

  await db
    .from('password_reset_tokens')
    .whereNotNull('used_at')
    .where(
      'used_at',
      '<=',
      DateTime.utc().minus({ hours: DEFAULT_USED_RESET_TOKEN_RETENTION_HOURS }).toJSDate()
    )
    .delete()
}

import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

export async function expireExpiredBookingDrafts(
  client: typeof db | TransactionClientContract = db
) {
  const expiredDrafts = await client
    .from('booking_drafts')
    .where('status', 'pending_payment')
    .where('expires_at', '<=', DateTime.utc().toJSDate())
    .select('id')

  if (expiredDrafts.length === 0) {
    return 0
  }

  const draftIds = expiredDrafts.map((draft) => Number(draft.id))
  await client.from('booking_drafts').whereIn('id', draftIds).update({
    status: 'expired',
    updated_at: DateTime.utc().toJSDate(),
  })
  await client.from('provider_availability_slots').whereIn('booking_draft_id', draftIds).update({
    is_booked: false,
    booking_draft_id: null,
    updated_at: DateTime.utc().toJSDate(),
  })

  return draftIds.length
}

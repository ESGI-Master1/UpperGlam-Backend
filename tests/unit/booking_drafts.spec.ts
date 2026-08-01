import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { expireExpiredBookingDrafts } from '#services/booking_drafts'
import { makeBookingDraft } from '#tests/helpers/factories'

class FakeQuery {
  private selectedTable: string
  private store: FakeDbClient
  private whereInIds: number[] = []

  constructor(store: FakeDbClient, table: string) {
    this.store = store
    this.selectedTable = table
  }

  where() {
    return this
  }

  whereIn(_column: string, ids: number[]) {
    this.whereInIds = ids
    return this
  }

  async select() {
    if (this.selectedTable !== 'booking_drafts') {
      return []
    }

    return this.store.bookingDrafts
      .filter((draft) => draft.status === 'pending_payment')
      .filter((draft) => DateTime.fromJSDate(draft.expires_at) <= DateTime.utc())
      .map((draft) => ({ id: draft.id }))
  }

  async update(values: Record<string, unknown>) {
    this.store.updates.push({ table: this.selectedTable, ids: this.whereInIds, values })
    return this.whereInIds.length
  }
}

class FakeDbClient {
  bookingDrafts: Array<ReturnType<typeof makeBookingDraft>> = []
  updates: Array<{ table: string; ids: number[]; values: Record<string, unknown> }> = []

  from(table: string) {
    return new FakeQuery(this, table)
  }
}

test.group('booking draft expiration', () => {
  test('expires pending drafts and releases linked slots', async ({ assert }) => {
    const client = new FakeDbClient()
    client.bookingDrafts = [
      makeBookingDraft({ id: 1, expires_at: DateTime.utc().minus({ minutes: 1 }).toJSDate() }),
      makeBookingDraft({ id: 2, expires_at: DateTime.utc().plus({ minutes: 1 }).toJSDate() }),
      makeBookingDraft({
        id: 3,
        status: 'completed',
        expires_at: DateTime.utc().minus({ minutes: 1 }).toJSDate(),
      }),
    ]

    const expiredCount = await expireExpiredBookingDrafts(client as never)

    assert.equal(expiredCount, 1)
    assert.deepEqual(client.updates[0]?.table, 'booking_drafts')
    assert.deepEqual(client.updates[0]?.ids, [1])
    assert.equal(client.updates[0]?.values.status, 'expired')
    assert.deepEqual(client.updates[1]?.table, 'provider_availability_slots')
    assert.deepEqual(client.updates[1]?.ids, [1])
    assert.equal(client.updates[1]?.values.is_booked, false)
    assert.isNull(client.updates[1]?.values.booking_draft_id)
  })

  test('does not write when no pending draft is expired', async ({ assert }) => {
    const client = new FakeDbClient()
    client.bookingDrafts = [
      makeBookingDraft({ id: 1, expires_at: DateTime.utc().plus({ minutes: 1 }).toJSDate() }),
    ]

    const expiredCount = await expireExpiredBookingDrafts(client as never)

    assert.equal(expiredCount, 0)
    assert.lengthOf(client.updates, 0)
  })
})

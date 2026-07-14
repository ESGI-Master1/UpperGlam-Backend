import { test } from '@japa/runner'
import { buildAdminAuditEvent, toAdminAuditEventDto } from '#services/admin_audit'

test.group('admin audit service', () => {
  test('builds persisted audit rows without leaking undefined details', ({ assert }) => {
    assert.deepEqual(
      buildAdminAuditEvent({
        action: 'admin.pre_registration.approved',
        adminUserId: 1,
        preRegistrationId: 10,
        details: {
          targetUserId: 20,
          previousReviewStatus: 'submitted',
        },
      }),
      {
        action: 'admin.pre_registration.approved',
        admin_user_id: 1,
        pre_registration_id: 10,
        details: JSON.stringify({
          targetUserId: 20,
          previousReviewStatus: 'submitted',
        }),
      }
    )

    assert.deepEqual(
      buildAdminAuditEvent({
        action: 'admin.login.succeeded',
        adminUserId: 1,
      }),
      {
        action: 'admin.login.succeeded',
        admin_user_id: 1,
        pre_registration_id: null,
        details: null,
      }
    )
  })

  test('maps audit rows to admin DTOs', ({ assert }) => {
    assert.deepEqual(
      toAdminAuditEventDto({
        id: 5,
        action: 'admin.pre_registration.rejected',
        admin_user_id: '1',
        admin_email: 'admin@upperglam.fr',
        pre_registration_id: '10',
        details: { reason: 'Dossier incomplet' },
        created_at: '2026-07-14T12:00:00.000Z',
      }),
      {
        id: 5,
        action: 'admin.pre_registration.rejected',
        adminUserId: 1,
        adminEmail: 'admin@upperglam.fr',
        preRegistrationId: 10,
        details: { reason: 'Dossier incomplet' },
        createdAt: '2026-07-14T12:00:00.000Z',
      }
    )
  })
})

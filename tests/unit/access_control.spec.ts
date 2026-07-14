import { test } from '@japa/runner'
import { canAccessAdminArea, canAccessProviderArea } from '#services/access_control'

test.group('access control', () => {
  test('allows admin area only for admin users', ({ assert }) => {
    assert.isTrue(canAccessAdminArea(true))
    assert.isFalse(canAccessAdminArea(false))
  })

  test('allows provider area only when role and profile both exist', ({ assert }) => {
    assert.isTrue(canAccessProviderArea(true, true))
    assert.isFalse(canAccessProviderArea(true, false))
    assert.isFalse(canAccessProviderArea(false, true))
    assert.isFalse(canAccessProviderArea(false, false))
  })
})

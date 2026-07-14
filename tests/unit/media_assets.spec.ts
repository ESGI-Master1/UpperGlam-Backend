import { test } from '@japa/runner'
import { canReadMediaAsset } from '#services/media_assets'
import { makeMediaAsset } from '#tests/helpers/factories'

test.group('media asset access', () => {
  test('allows owners to read private media', ({ assert }) => {
    assert.isTrue(canReadMediaAsset(makeMediaAsset({ owner_user_id: 7, visibility: 'private' }), 7))
  })

  test('allows every authenticated user to read public media', ({ assert }) => {
    assert.isTrue(canReadMediaAsset(makeMediaAsset({ owner_user_id: 7, visibility: 'public' }), 9))
  })

  test('rejects non owners for private media', ({ assert }) => {
    assert.isFalse(
      canReadMediaAsset(makeMediaAsset({ owner_user_id: 7, visibility: 'private' }), 9)
    )
  })
})

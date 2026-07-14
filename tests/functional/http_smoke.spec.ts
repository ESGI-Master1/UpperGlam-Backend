import { test } from '@japa/runner'

test.group('HTTP smoke', () => {
  test('returns the API health payload', async ({ client }) => {
    const response = await client.get('/')

    response.assertStatus(200)
    response.assertBodyContains({ hello: 'world' })
  })

  test('rejects protected mobile routes without an API token', async ({ client }) => {
    const response = await client.get('/auth/me')

    response.assertStatus(401)
  })

  test('rejects protected admin routes without an API token', async ({ client }) => {
    const response = await client.get('/admin/pre-registrations')

    response.assertStatus(401)
  })
})

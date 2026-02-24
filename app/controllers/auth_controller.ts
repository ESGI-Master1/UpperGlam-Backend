import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import { loginValidator, registerValidator } from '#validators/auth'

export default class AuthController {
  async register({ request, response }: HttpContext) {
    const payload = await request.validateUsing(registerValidator)

    const user = await User.create({
      email: payload.email.toLowerCase(),
      passwordHash: payload.password,
      status: 'pending',
    })

    const token = await User.accessTokens.create(user, ['*'], {
      name: payload.deviceName ?? 'default',
    })

    return response.created({
      user,
      token: token.value?.release(),
      tokenType: 'Bearer',
    })
  }

  async login({ request, response }: HttpContext) {
    const payload = await request.validateUsing(loginValidator)

    const user = await User.verifyCredentials(payload.email.toLowerCase(), payload.password)
    const token = await User.accessTokens.create(user, ['*'], {
      name: payload.deviceName ?? 'default',
    })

    return response.ok({
      user,
      token: token.value?.release(),
      tokenType: 'Bearer',
    })
  }

  async me({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    return response.ok({ user })
  }

  async logout({ auth, response }: HttpContext) {
    await auth.use('api').authenticate()
    await auth.use('api').invalidateToken()
    return response.ok({ message: 'Logged out' })
  }
}

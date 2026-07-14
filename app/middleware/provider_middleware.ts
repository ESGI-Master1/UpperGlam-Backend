import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import db from '@adonisjs/lucid/services/db'
import { canAccessProviderArea } from '#services/access_control'
import { errorResponse } from '#services/http'
import { logBusinessEvent } from '#services/observability'

export default class ProviderMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.getUserOrFail()

    const providerRole = await db
      .from('user_roles as ur')
      .join('roles as r', 'r.id', 'ur.role_id')
      .where('ur.user_id', user.id)
      .where('r.name', 'provider')
      .select('r.id')
      .first()

    const providerProfile = await db
      .from('provider_profiles')
      .where('user_id', user.id)
      .select('id')
      .first()

    if (!canAccessProviderArea(Boolean(providerRole), Boolean(providerProfile))) {
      logBusinessEvent(ctx, 'provider.access.denied', { userId: user.id }, 'warn')
      return ctx.response.forbidden(
        errorResponse({
          code: 'PROVIDER_FORBIDDEN',
          message: 'Accès prestataire requis.',
        })
      )
    }

    return next()
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import db from '@adonisjs/lucid/services/db'
import { errorResponse } from '#services/http'
import { logBusinessEvent } from '#services/observability'

export default class AdminMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.getUserOrFail()

    const adminRole = await db
      .from('user_roles as ur')
      .join('roles as r', 'r.id', 'ur.role_id')
      .where('ur.user_id', user.id)
      .where('r.name', 'admin')
      .select('r.id')
      .first()

    if (!adminRole) {
      logBusinessEvent(ctx, 'admin.access.denied', { userId: user.id }, 'warn')
      return ctx.response.forbidden(
        errorResponse({
          code: 'ADMIN_FORBIDDEN',
          message: 'Accès administrateur requis.',
        })
      )
    }

    return next()
  }
}

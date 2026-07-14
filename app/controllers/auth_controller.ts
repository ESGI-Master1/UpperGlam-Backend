import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import { createHash, randomBytes, randomInt } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import PasswordResetToken from '#models/password_reset_token'
import {
  forgotPasswordValidator,
  loginValidator,
  registerValidator,
  resetPasswordValidator,
  resetPasswordWithCodeValidator,
} from '#validators/auth'
import env from '#start/env'
import { ResendMailSender } from '#infrastructure/integrations/mail/resend_mail_sender'
import { getPasswordChangedConfirmationEmailTemplate } from '#infrastructure/integrations/mail/templates/password_changed_confirmation'
import { getResetPasswordEmailTemplate } from '#infrastructure/integrations/mail/templates/reset_password'
import { dataResponse, errorResponse } from '#services/http'
import { logBusinessEvent } from '#services/observability'
import { cleanupExpiredSecurityArtifacts } from '#services/retention'

const DEFAULT_RESET_TOKEN_EXPIRATION_MINUTES = 60
const RESET_TOKEN_SIZE_IN_BYTES = 32
const RESET_CODE_LENGTH = 6
const mailSender = new ResendMailSender()

function getResetTokenExpirationMinutes(): number {
  const value = env.get('PASSWORD_RESET_TOKEN_EXPIRES_MINUTES')
  if (!value || value <= 0) {
    return DEFAULT_RESET_TOKEN_EXPIRATION_MINUTES
  }

  return value
}

function buildResetPasswordUrl(token: string, email: string): string {
  const baseUrl = env.get('FRONTEND_RESET_PASSWORD_URL') ?? 'http://localhost:5173/reset-password'
  const url = new URL(baseUrl)

  url.searchParams.set('token', token)
  url.searchParams.set('email', email)

  return url.toString()
}

function generateResetCode(): string {
  return randomInt(0, 10 ** RESET_CODE_LENGTH)
    .toString()
    .padStart(RESET_CODE_LENGTH, '0')
}

async function applyPasswordReset(
  resetToken: PasswordResetToken,
  nextPassword: string,
  logger: HttpContext['logger']
) {
  await resetToken.load('user')
  resetToken.user.passwordHash = nextPassword
  await resetToken.user.save()

  resetToken.usedAt = DateTime.now()
  await resetToken.save()

  await PasswordResetToken.query()
    .where('userId', resetToken.userId)
    .whereNot('id', resetToken.id)
    .delete()

  try {
    await mailSender.send({
      to: resetToken.user.email,
      subject: 'Confirmation de modification de mot de passe',
      body: getPasswordChangedConfirmationEmailTemplate(),
    })
  } catch (error) {
    logger.error(
      { error, userId: resetToken.userId },
      'Failed to send password changed confirmation email'
    )
  }
}

async function ensureUserRole(userId: number) {
  const role = await db.from('roles').where('name', 'user').select('id').first()
  if (!role) {
    return
  }

  const existing = await db
    .from('user_roles')
    .where('user_id', userId)
    .where('role_id', Number(role.id))
    .first()
  if (!existing) {
    await db.table('user_roles').insert({
      user_id: userId,
      role_id: Number(role.id),
    })
  }
}

async function ensureUserDefaults(userId: number) {
  const profile = await db.from('user_profiles').where('user_id', userId).select('id').first()
  if (!profile) {
    await db.table('user_profiles').insert({
      user_id: userId,
    })
  }

  const preferences = await db
    .from('user_preferences')
    .where('user_id', userId)
    .select('id')
    .first()
  if (!preferences) {
    await db.table('user_preferences').insert({
      user_id: userId,
      reminder_enabled: true,
      offers_enabled: false,
      analytics_enabled: true,
    })
  }
}

async function presentAuthUser(
  userId: number,
  fallbackEmail?: string,
  fallbackPhone?: string | null
) {
  const [profile, user, roles] = await Promise.all([
    db.from('user_profiles').where('user_id', userId).first(),
    db.from('users').where('id', userId).first(),
    db
      .from('user_roles as ur')
      .join('roles as r', 'r.id', 'ur.role_id')
      .where('ur.user_id', userId)
      .orderBy('r.name', 'asc')
      .select('r.name'),
  ])

  return {
    id: userId,
    email: user?.email ?? fallbackEmail ?? null,
    firstName: profile?.first_name ?? null,
    lastName: profile?.last_name ?? null,
    phone: user?.phone ?? fallbackPhone ?? null,
    roles: roles.map((role) => String(role.name)),
  }
}

export default class AuthController {
  async register({ request, response, logger }: HttpContext) {
    const payload = await request.validateUsing(registerValidator)

    try {
      const user = await User.create({
        email: payload.email.toLowerCase(),
        passwordHash: payload.password,
        status: 'active',
      })

      await ensureUserRole(user.id)
      await ensureUserDefaults(user.id)

      const token = await User.accessTokens.create(user, ['*'], {
        name: payload.deviceName ?? 'default',
      })

      const authUser = await presentAuthUser(user.id, user.email, user.phone)
      logBusinessEvent({ logger }, 'auth.register.succeeded', {
        userId: user.id,
        roles: authUser.roles.join(','),
      })

      return response.created(
        dataResponse({
          token: token.value?.release(),
          expiresAt: token.expiresAt ? new Date(token.expiresAt).toISOString() : null,
          user: authUser,
        })
      )
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        logBusinessEvent({ logger }, 'auth.register.conflict', {}, 'warn')
        return response.conflict(
          errorResponse({
            code: 'AUTH_EMAIL_ALREADY_USED',
            message: 'Cet email est déjà utilisé.',
          })
        )
      }

      throw error
    }
  }

  async login({ request, response, logger }: HttpContext) {
    const payload = await request.validateUsing(loginValidator)
    try {
      const user = await User.verifyCredentials(payload.email.toLowerCase(), payload.password)

      if (user.status !== 'active') {
        logBusinessEvent(
          { logger },
          'auth.login.blocked',
          { userId: user.id, accountStatus: user.status },
          'warn'
        )
        return response.forbidden(
          errorResponse({
            code: 'AUTH_ACCOUNT_NOT_ACTIVE',
            message:
              user.status === 'pending' ? 'Compte en attente de validation.' : 'Compte suspendu.',
          })
        )
      }

      await ensureUserDefaults(user.id)

      const token = await User.accessTokens.create(user, ['*'], {
        name: payload.deviceName ?? 'default',
      })

      const authUser = await presentAuthUser(user.id, user.email, user.phone)
      logBusinessEvent({ logger }, 'auth.login.succeeded', {
        userId: user.id,
        roles: authUser.roles.join(','),
      })
      return response.ok(
        dataResponse({
          token: token.value?.release(),
          expiresAt: token.expiresAt ? new Date(token.expiresAt).toISOString() : null,
          user: authUser,
        })
      )
    } catch {
      logBusinessEvent({ logger }, 'auth.login.failed', {}, 'warn')
      return response.unauthorized(
        errorResponse({
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Identifiants invalides.',
        })
      )
    }
  }

  async forgotPassword({ request, response, logger }: HttpContext) {
    const payload = await request.validateUsing(forgotPasswordValidator)
    await cleanupExpiredSecurityArtifacts()
    const email = payload.email.toLowerCase()

    const user = await User.findBy('email', email)
    if (user) {
      try {
        const resetToken = randomBytes(RESET_TOKEN_SIZE_IN_BYTES).toString('hex')
        const resetCode = generateResetCode()
        const resetTokenHash = createHash('sha256').update(resetToken).digest('hex')
        const resetCodeHash = createHash('sha256').update(resetCode).digest('hex')
        const expiresInMinutes = getResetTokenExpirationMinutes()
        const expiresAt = DateTime.now().plus({ minutes: expiresInMinutes })

        await PasswordResetToken.query().where('userId', user.id).delete()

        await PasswordResetToken.create({
          userId: user.id,
          tokenHash: resetTokenHash,
          resetCodeHash,
          expiresAt,
        })

        const resetPasswordUrl = buildResetPasswordUrl(resetToken, user.email)
        await mailSender.send({
          to: user.email,
          subject: 'Réinitialisez votre mot de passe Upper Glam',
          body: getResetPasswordEmailTemplate(resetPasswordUrl, resetCode, expiresInMinutes),
        })
        logBusinessEvent({ logger }, 'auth.password_reset.requested', {
          userId: user.id,
          expiresInMinutes,
        })
      } catch (error) {
        logger.error({ error, userId: user.id }, 'Failed to create or send password reset token')
      }
    }

    return response.ok(
      dataResponse(
        {
          emailSent: true,
        },
        {
          message: 'Si cet email existe, un code a été envoyé.',
        }
      )
    )
  }

  async resetPassword({ request, response, logger }: HttpContext) {
    const payload = await request.validateUsing(resetPasswordValidator)
    await cleanupExpiredSecurityArtifacts()

    if (payload.password !== payload.passwordConfirmation) {
      return response.unprocessableEntity({
        ...errorResponse({
          code: 'PASSWORD_CONFIRMATION_MISMATCH',
          message: 'Password confirmation does not match password',
        }),
      })
    }

    const resetTokenHash = createHash('sha256').update(payload.token).digest('hex')
    const resetToken = await PasswordResetToken.query()
      .where('tokenHash', resetTokenHash)
      .whereNull('usedAt')
      .first()

    if (!resetToken || resetToken.expiresAt.toMillis() <= DateTime.now().toMillis()) {
      return response.badRequest({
        ...errorResponse({
          code: 'INVALID_OR_EXPIRED_RESET_TOKEN',
          message: 'Token de réinitialisation invalide ou expiré',
        }),
      })
    }

    await applyPasswordReset(resetToken, payload.password, logger)
    logBusinessEvent({ logger }, 'auth.password_reset.completed', {
      userId: resetToken.userId,
      method: 'token',
    })

    return response.ok(
      dataResponse(
        {
          reset: true,
        },
        {
          message: 'Mot de passe mis à jour.',
        }
      )
    )
  }

  async resetPasswordWithCode({ request, response, logger }: HttpContext) {
    const payload = await request.validateUsing(resetPasswordWithCodeValidator)
    await cleanupExpiredSecurityArtifacts()

    if (payload.password !== payload.passwordConfirmation) {
      return response.unprocessableEntity({
        ...errorResponse({
          code: 'PASSWORD_CONFIRMATION_MISMATCH',
          message: 'Password confirmation does not match password',
        }),
      })
    }

    const email = payload.email.toLowerCase()
    const user = await User.findBy('email', email)
    if (!user) {
      return response.badRequest({
        ...errorResponse({
          code: 'INVALID_OR_EXPIRED_RESET_CODE',
          message: 'Code de réinitialisation invalide ou expiré',
        }),
      })
    }

    const resetCodeHash = createHash('sha256').update(payload.code).digest('hex')
    const resetToken = await PasswordResetToken.query()
      .where('userId', user.id)
      .where('resetCodeHash', resetCodeHash)
      .whereNull('usedAt')
      .first()

    if (!resetToken || resetToken.expiresAt.toMillis() <= DateTime.now().toMillis()) {
      return response.badRequest({
        ...errorResponse({
          code: 'INVALID_OR_EXPIRED_RESET_CODE',
          message: 'Code de réinitialisation invalide ou expiré',
        }),
      })
    }

    await applyPasswordReset(resetToken, payload.password, logger)
    logBusinessEvent({ logger }, 'auth.password_reset.completed', {
      userId: resetToken.userId,
      method: 'code',
    })

    return response.ok(
      dataResponse(
        {
          reset: true,
        },
        {
          message: 'Mot de passe mis à jour.',
        }
      )
    )
  }

  async me({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    await ensureUserDefaults(user.id)
    const authUser = await presentAuthUser(user.id, user.email, user.phone)
    return response.ok(dataResponse(authUser))
  }

  async logout({ auth, response, logger }: HttpContext) {
    await auth.use('api').authenticate()
    const user = auth.getUserOrFail()
    await auth.use('api').invalidateToken()
    logBusinessEvent({ logger }, 'auth.logout.succeeded', { userId: user.id })
    return response.ok(dataResponse({ loggedOut: true }))
  }
}

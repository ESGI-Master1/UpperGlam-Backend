import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { dataResponse, errorResponse } from '#services/http'
import { getSignedUrlForMediaId } from '#services/media_assets'
import {
  updateShortcutsValidator,
  updateUserPreferencesValidator,
  updateUserProfileValidator,
} from '#validators/mobile'

function coerceBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null) {
    return fallback
  }
  return Boolean(value)
}

export default class UsersController {
  async me({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()

    const [profile, preferences] = await Promise.all([
      db.from('user_profiles').where('user_id', user.id).first(),
      db.from('user_preferences').where('user_id', user.id).first(),
    ])

    const avatarUrl = profile?.avatar_media_id
      ? await getSignedUrlForMediaId(Number(profile.avatar_media_id))
      : null

    return response.ok(
      dataResponse({
        id: user.id,
        email: user.email,
        firstName: profile?.first_name ?? null,
        lastName: profile?.last_name ?? null,
        phone: user.phone ?? null,
        avatarUrl,
        preferences: {
          reminderEnabled: coerceBoolean(preferences?.reminder_enabled, true),
          offersEnabled: coerceBoolean(preferences?.offers_enabled, false),
          analyticsEnabled: coerceBoolean(preferences?.analytics_enabled, true),
        },
      })
    )
  }

  async updateMe({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(updateUserProfileValidator)

    if (payload.phone !== undefined) {
      user.phone = payload.phone
      await user.save()
    }

    const profile = await db.from('user_profiles').where('user_id', user.id).first()
    if (!profile) {
      await db.table('user_profiles').insert({
        user_id: user.id,
        first_name: payload.firstName ?? null,
        last_name: payload.lastName ?? null,
        updated_at: DateTime.utc().toJSDate(),
      })
    } else {
      await db
        .from('user_profiles')
        .where('user_id', user.id)
        .update({
          first_name: payload.firstName === undefined ? profile.first_name : payload.firstName,
          last_name: payload.lastName === undefined ? profile.last_name : payload.lastName,
          updated_at: DateTime.utc().toJSDate(),
        })
    }

    const updatedProfile = await db.from('user_profiles').where('user_id', user.id).first()

    return response.ok(
      dataResponse({
        id: user.id,
        email: user.email,
        firstName: updatedProfile?.first_name ?? null,
        lastName: updatedProfile?.last_name ?? null,
        phone: user.phone ?? null,
      })
    )
  }

  async updatePreferences({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(updateUserPreferencesValidator)

    const existing = await db.from('user_preferences').where('user_id', user.id).first()
    if (!existing) {
      await db.table('user_preferences').insert({
        user_id: user.id,
        reminder_enabled: payload.reminderEnabled ?? true,
        offers_enabled: payload.offersEnabled ?? false,
        analytics_enabled: payload.analyticsEnabled ?? true,
        updated_at: DateTime.utc().toJSDate(),
      })
    } else {
      await db
        .from('user_preferences')
        .where('user_id', user.id)
        .update({
          reminder_enabled:
            payload.reminderEnabled === undefined
              ? existing.reminder_enabled
              : payload.reminderEnabled,
          offers_enabled:
            payload.offersEnabled === undefined ? existing.offers_enabled : payload.offersEnabled,
          analytics_enabled:
            payload.analyticsEnabled === undefined
              ? existing.analytics_enabled
              : payload.analyticsEnabled,
          updated_at: DateTime.utc().toJSDate(),
        })
    }

    const preferences = await db.from('user_preferences').where('user_id', user.id).first()

    return response.ok(
      dataResponse({
        reminderEnabled: coerceBoolean(preferences?.reminder_enabled, true),
        offersEnabled: coerceBoolean(preferences?.offers_enabled, false),
        analyticsEnabled: coerceBoolean(preferences?.analytics_enabled, true),
      })
    )
  }

  async getShortcuts({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const shortcuts = await db.from('user_shortcuts').where('user_id', user.id).first()

    return response.ok(
      dataResponse({
        recentProviderIds: Array.isArray(shortcuts?.recent_provider_ids)
          ? shortcuts.recent_provider_ids
          : [],
        lastSearch: shortcuts?.last_search ?? null,
      })
    )
  }

  async putShortcuts({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(updateShortcutsValidator)

    const existing = await db.from('user_shortcuts').where('user_id', user.id).first()
    if (!existing) {
      await db.table('user_shortcuts').insert({
        user_id: user.id,
        recent_provider_ids: JSON.stringify(payload.recentProviderIds ?? []),
        last_search: payload.lastSearch ? JSON.stringify(payload.lastSearch) : null,
        updated_at: DateTime.utc().toJSDate(),
      })
    } else {
      await db
        .from('user_shortcuts')
        .where('user_id', user.id)
        .update({
          recent_provider_ids: JSON.stringify(
            payload.recentProviderIds ?? existing.recent_provider_ids ?? []
          ),
          last_search:
            payload.lastSearch === undefined
              ? existing.last_search
              : payload.lastSearch
                ? JSON.stringify(payload.lastSearch)
                : null,
          updated_at: DateTime.utc().toJSDate(),
        })
    }

    const shortcuts = await db.from('user_shortcuts').where('user_id', user.id).first()

    return response.ok(
      dataResponse({
        recentProviderIds: Array.isArray(shortcuts?.recent_provider_ids)
          ? shortcuts.recent_provider_ids
          : [],
        lastSearch: shortcuts?.last_search ?? null,
      })
    )
  }

  async linkAvatar({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const mediaId = Number(request.input('mediaId'))

    if (!Number.isFinite(mediaId) || mediaId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'mediaId invalide',
        })
      )
    }

    const media = await db
      .from('media_assets')
      .where('id', mediaId)
      .where('owner_user_id', user.id)
      .first()
    if (!media) {
      return response.notFound(
        errorResponse({
          code: 'MEDIA_NOT_FOUND',
          message: 'Media introuvable',
        })
      )
    }

    const profile = await db.from('user_profiles').where('user_id', user.id).first()
    if (!profile) {
      await db.table('user_profiles').insert({
        user_id: user.id,
        avatar_media_id: mediaId,
        updated_at: DateTime.utc().toJSDate(),
      })
    } else {
      await db.from('user_profiles').where('user_id', user.id).update({
        avatar_media_id: mediaId,
        updated_at: DateTime.utc().toJSDate(),
      })
    }

    const avatarUrl = await getSignedUrlForMediaId(mediaId)
    return response.ok(dataResponse({ avatarUrl }))
  }
}

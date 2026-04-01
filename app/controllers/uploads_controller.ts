import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { minioStorage } from '#infrastructure/integrations/storage/minio_storage'
import { dataResponse, errorResponse } from '#services/http'
import { uploadCommitValidator, uploadPresignValidator } from '#validators/mobile'

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024

export default class UploadsController {
  async presign({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(uploadPresignValidator)

    if (!ALLOWED_MIME_TYPES.has(payload.mimeType)) {
      return response.unprocessableEntity(
        errorResponse({
          code: 'MEDIA_INVALID_TYPE',
          message: 'Type de fichier non supporté',
          details: { mimeType: payload.mimeType },
        })
      )
    }

    if (payload.sizeBytes > MAX_IMAGE_SIZE_BYTES) {
      return response.unprocessableEntity(
        errorResponse({
          code: 'MEDIA_FILE_TOO_LARGE',
          message: 'La taille du fichier dépasse 10MB',
        })
      )
    }

    const objectKey = minioStorage.createObjectKey({
      userId: user.id,
      category: payload.category,
      extension: payload.extension,
      reviewId: payload.reviewId,
    })

    const uploadUrl = await minioStorage.presignUpload(objectKey)
    return response.ok(
      dataResponse({
        uploadUrl,
        objectKey,
        expiresInSeconds: 120,
      })
    )
  }

  async commit({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(uploadCommitValidator)

    if (!payload.objectKey.startsWith(`users/${user.id}/`)) {
      return response.forbidden(
        errorResponse({
          code: 'MEDIA_FORBIDDEN_PATH',
          message: 'Chemin de média interdit',
        })
      )
    }

    if (!ALLOWED_MIME_TYPES.has(payload.mimeType)) {
      return response.unprocessableEntity(
        errorResponse({
          code: 'MEDIA_INVALID_TYPE',
          message: 'Type de fichier non supporté',
        })
      )
    }

    if (payload.sizeBytes > MAX_IMAGE_SIZE_BYTES) {
      return response.unprocessableEntity(
        errorResponse({
          code: 'MEDIA_FILE_TOO_LARGE',
          message: 'La taille du fichier dépasse 10MB',
        })
      )
    }

    try {
      await minioStorage.assertObjectExists(payload.objectKey)
    } catch {
      return response.badRequest(
        errorResponse({
          code: 'MEDIA_OBJECT_NOT_FOUND',
          message: "L'objet n'a pas été trouvé sur le stockage.",
        })
      )
    }

    const [media] = await db
      .table('media_assets')
      .insert({
        owner_user_id: user.id,
        bucket: minioStorage.getBucketName(),
        object_key: payload.objectKey,
        mime_type: payload.mimeType,
        size_bytes: payload.sizeBytes,
        category: payload.category,
        visibility: 'private',
      })
      .returning(['id', 'object_key'])

    return response.created(
      dataResponse({
        mediaId: Number(media.id),
        objectKey: media.object_key,
        readUrl: `/media/${media.id}`,
      })
    )
  }

  async getMediaUrl({ auth, params, response }: HttpContext) {
    await auth.use('api').authenticate()
    const mediaId = Number(params.mediaId)
    if (!Number.isFinite(mediaId) || mediaId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'mediaId invalide',
        })
      )
    }

    const media = await db.from('media_assets').where('id', mediaId).select('object_key').first()
    if (!media) {
      return response.notFound(
        errorResponse({
          code: 'MEDIA_NOT_FOUND',
          message: 'Media introuvable',
        })
      )
    }

    const url = await minioStorage.presignDownload(String(media.object_key))
    return response.ok(dataResponse({ url }))
  }
}

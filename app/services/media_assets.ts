import db from '@adonisjs/lucid/services/db'
import { minioStorage } from '#infrastructure/integrations/storage/minio_storage'

export async function getSignedUrlsByMediaIds(mediaIds: number[]) {
  const uniqueIds = [...new Set(mediaIds.filter((value) => Number.isFinite(value) && value > 0))]
  const urlById = new Map<number, string>()

  if (!uniqueIds.length) {
    return urlById
  }

  const rows = await db.from('media_assets').select('id', 'object_key').whereIn('id', uniqueIds)

  await Promise.all(
    rows.map(async (row) => {
      const url = await minioStorage.presignDownload(String(row.object_key))
      urlById.set(Number(row.id), url)
    })
  )

  return urlById
}

export async function getSignedUrlForMediaId(mediaId: number | null | undefined) {
  if (!mediaId) {
    return null
  }

  const row = await db.from('media_assets').select('object_key').where('id', mediaId).first()
  if (!row) {
    return null
  }

  return minioStorage.presignDownload(String(row.object_key))
}

import { randomUUID } from 'node:crypto'
import { Client } from 'minio'
import env from '#start/env'

const DEFAULT_UPLOAD_EXPIRY_SECONDS = 120
const DEFAULT_DOWNLOAD_EXPIRY_SECONDS = 300
const DEFAULT_REGION = 'us-east-1'

class MinioStorage {
  private client: Client
  private bucketName: string
  private region: string
  private bucketReady = false

  constructor() {
    this.client = new Client({
      endPoint: env.get('MINIO_ENDPOINT') ?? 'localhost',
      port: env.get('MINIO_PORT') ?? 9000,
      useSSL: env.get('MINIO_USE_SSL') ?? false,
      accessKey: env.get('MINIO_ACCESS_KEY') ?? 'minio',
      secretKey: env.get('MINIO_SECRET_KEY') ?? 'minio123',
    })

    this.bucketName = env.get('MINIO_BUCKET_USER_IMAGES') ?? 'upperglam-user-images'
    this.region = env.get('MINIO_REGION') ?? DEFAULT_REGION
  }

  private async ensureBucket() {
    if (this.bucketReady) {
      return
    }

    const exists = await this.client.bucketExists(this.bucketName)
    if (!exists) {
      await this.client.makeBucket(this.bucketName, this.region)
    }

    this.bucketReady = true
  }

  async presignUpload(objectKey: string, expiresInSeconds = DEFAULT_UPLOAD_EXPIRY_SECONDS) {
    await this.ensureBucket()
    return this.client.presignedPutObject(this.bucketName, objectKey, expiresInSeconds)
  }

  async presignDownload(objectKey: string, expiresInSeconds = DEFAULT_DOWNLOAD_EXPIRY_SECONDS) {
    await this.ensureBucket()
    return this.client.presignedGetObject(this.bucketName, objectKey, expiresInSeconds)
  }

  async assertObjectExists(objectKey: string) {
    await this.ensureBucket()
    await this.client.statObject(this.bucketName, objectKey)
  }

  getBucketName() {
    return this.bucketName
  }

  createObjectKey(input: {
    userId: number
    category: 'profile' | 'review' | 'shop' | 'other'
    extension: string
    reviewId?: number
  }) {
    const extension = input.extension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg'
    const fileName = `${randomUUID()}.${extension}`

    if (input.category === 'profile') {
      return `users/${input.userId}/profile/${fileName}`
    }

    if (input.category === 'review') {
      const reviewPath = input.reviewId ? String(input.reviewId) : 'temp'
      return `users/${input.userId}/reviews/${reviewPath}/${fileName}`
    }

    if (input.category === 'shop') {
      return `users/${input.userId}/shop/${fileName}`
    }

    return `users/${input.userId}/other/${fileName}`
  }
}

export const minioStorage = new MinioStorage()

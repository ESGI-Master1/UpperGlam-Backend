import vine from '@vinejs/vine'

export const createBookingDraftValidator = vine.compile(
  vine.object({
    providerId: vine.number().positive(),
    slot: vine.string().trim(),
    appointmentMode: vine.enum(['home', 'institute'] as const),
    address: vine.string().trim().maxLength(1000).nullable().optional(),
    note: vine.string().trim().maxLength(5000).optional(),
  })
)

export const checkoutDraftValidator = vine.compile(
  vine.object({
    method: vine.enum(['apple_pay', 'google_pay'] as const),
    platformPayToken: vine.string().trim().minLength(8).maxLength(4096),
  })
)

export const paymentIntentValidator = vine.compile(
  vine.object({
    draftId: vine.number().positive(),
    method: vine.enum(['apple_pay', 'google_pay'] as const),
    platformPayToken: vine.string().trim().minLength(8).maxLength(4096),
  })
)

export const updateBookingValidator = vine.compile(
  vine.object({
    slot: vine.string().trim().optional(),
    appointmentMode: vine.enum(['home', 'institute'] as const).optional(),
    address: vine.string().trim().maxLength(1000).nullable().optional(),
    note: vine.string().trim().maxLength(5000).nullable().optional(),
  })
)

export const updateUserProfileValidator = vine.compile(
  vine.object({
    firstName: vine.string().trim().minLength(1).maxLength(120).nullable().optional(),
    lastName: vine.string().trim().minLength(1).maxLength(120).nullable().optional(),
    phone: vine.string().trim().minLength(6).maxLength(30).nullable().optional(),
  })
)

export const updateUserPreferencesValidator = vine.compile(
  vine.object({
    reminderEnabled: vine.boolean().optional(),
    offersEnabled: vine.boolean().optional(),
    analyticsEnabled: vine.boolean().optional(),
  })
)

export const updateShortcutsValidator = vine.compile(
  vine.object({
    recentProviderIds: vine.array(vine.number().positive()).optional(),
    lastSearch: vine
      .object({
        query: vine.string().trim().maxLength(255).optional(),
        tags: vine.array(vine.string().trim().maxLength(60)).optional(),
        location: vine.string().trim().maxLength(255).optional(),
        date: vine.string().trim().optional(),
        updatedAt: vine.string().trim().optional(),
      })
      .nullable()
      .optional(),
  })
)

export const uploadPresignValidator = vine.compile(
  vine.object({
    category: vine.enum(['profile', 'review', 'shop', 'other'] as const),
    extension: vine.string().trim().minLength(2).maxLength(10),
    mimeType: vine.string().trim().minLength(5).maxLength(120),
    sizeBytes: vine.number().positive(),
    reviewId: vine.number().positive().optional(),
  })
)

export const uploadCommitValidator = vine.compile(
  vine.object({
    category: vine.enum(['profile', 'review', 'shop', 'other'] as const),
    objectKey: vine.string().trim().minLength(3).maxLength(1024),
    mimeType: vine.string().trim().minLength(5).maxLength(120),
    sizeBytes: vine.number().positive(),
  })
)

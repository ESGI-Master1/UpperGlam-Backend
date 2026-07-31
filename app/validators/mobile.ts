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
    method: vine.enum(['card', 'apple_pay', 'google_pay'] as const),
    paymentId: vine.string().trim().minLength(4).maxLength(255),
  })
)

export const paymentIntentValidator = vine.compile(
  vine.object({
    draftId: vine.number().positive(),
    method: vine.enum(['card', 'apple_pay', 'google_pay'] as const),
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

export const updateProviderProfileValidator = vine.compile(
  vine.object({
    displayName: vine.string().trim().minLength(2).maxLength(150).optional(),
    city: vine.string().trim().minLength(2).maxLength(150).optional(),
    bio: vine.string().trim().maxLength(5000).nullable().optional(),
    instituteAddress: vine.string().trim().maxLength(1000).nullable().optional(),
    serviceModes: vine.array(vine.enum(['home', 'institute'] as const)).optional(),
    homeServiceZones: vine.array(vine.string().trim().minLength(2).maxLength(120)).optional(),
    priceFromCents: vine.number().min(0).nullable().optional(),
  })
)

export const createProviderAvailabilitySlotValidator = vine.compile(
  vine.object({
    slotStartAt: vine.string().trim(),
    slotEndAt: vine.string().trim(),
  })
)

export const createProviderAvailabilityRuleValidator = vine.compile(
  vine.object({
    weekday: vine.number().min(0).max(6),
    startTime: vine
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}$/),
    endTime: vine
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}$/),
    appointmentMode: vine
      .enum(['home', 'institute'] as const)
      .nullable()
      .optional(),
    isActive: vine.boolean().optional(),
  })
)

export const createProviderAvailabilityClosureValidator = vine.compile(
  vine.object({
    startsAt: vine.string().trim(),
    endsAt: vine.string().trim(),
    reason: vine.string().trim().maxLength(500).nullable().optional(),
  })
)

export const providerServiceValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(150),
    durationMinutes: vine.number().min(5).max(720),
    priceCents: vine.number().min(0).max(1_000_000),
    category: vine.string().trim().minLength(2).maxLength(120),
    isActive: vine.boolean().optional(),
  })
)

export const providerGalleryItemValidator = vine.compile(
  vine.object({
    mediaId: vine.number().positive(),
    title: vine.string().trim().maxLength(255).nullable().optional(),
    position: vine.number().min(0).max(10_000).optional(),
  })
)

export const providerGalleryOrderValidator = vine.compile(
  vine.object({
    itemIds: vine.array(vine.number().positive()).minLength(1),
  })
)

export const providerCustomerNoteValidator = vine.compile(
  vine.object({
    note: vine.string().trim().maxLength(5000).nullable(),
  })
)

export const providerBookingRejectValidator = vine.compile(
  vine.object({
    reason: vine.string().trim().minLength(3).maxLength(1000),
  })
)

export const providerBookingProposeSlotValidator = vine.compile(
  vine.object({
    slotStartAt: vine.string().trim(),
    slotEndAt: vine.string().trim(),
    note: vine.string().trim().maxLength(1000).optional(),
  })
)

export const providerBookingStatusValidator = vine.compile(
  vine.object({
    status: vine.enum(['accepted', 'rejected'] as const),
    reason: vine.string().trim().minLength(3).maxLength(1000).optional(),
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

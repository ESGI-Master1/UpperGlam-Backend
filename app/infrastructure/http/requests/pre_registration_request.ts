import vine from '@vinejs/vine'

export const preRegistrationRequestValidator = vine.compile(
  vine.object({
    role: vine.enum(['user', 'provider'] as const),
    email: vine.string().trim().email(),
    password: vine.string().minLength(8).maxLength(255),
    phone: vine.string().trim().minLength(6).maxLength(30),
    firstName: vine.string().trim().minLength(1).maxLength(120),
    lastName: vine.string().trim().minLength(1).maxLength(120),
    username: vine.string().trim().minLength(2).maxLength(100).optional(),
    city: vine.string().trim().minLength(2).maxLength(120),
    zipcode: vine.string().trim().minLength(2).maxLength(20),
    marketingOptIn: vine.boolean().optional(),
    source: vine.string().trim().maxLength(120).optional(),
    desiredServices: vine.array(vine.string().trim().minLength(1).maxLength(60)).optional(),
    preferredServiceModes: vine.array(vine.enum(['home', 'institute'] as const)).optional(),
    preferredBudgetCents: vine.number().positive().optional(),
    providerProfile: vine
      .object({
        displayName: vine.string().trim().minLength(2).maxLength(150),
        businessName: vine.string().trim().maxLength(150).optional(),
        serviceModes: vine.array(vine.enum(['home', 'institute'] as const)).optional(),
        instituteAddress: vine.string().trim().maxLength(500).optional(),
        specialties: vine.array(vine.string().trim().minLength(1).maxLength(60)).optional(),
        priceFromCents: vine.number().positive().optional(),
        yearsExperience: vine.number().positive().optional(),
        hasCertification: vine.boolean().optional(),
        instagramUrl: vine.string().trim().url().maxLength(255).optional(),
        tiktokUrl: vine.string().trim().url().maxLength(255).optional(),
      })
      .optional(),
    interest: vine.string().trim().maxLength(2000).optional(),
    comment: vine.string().trim().maxLength(5000).optional(),
  })
)

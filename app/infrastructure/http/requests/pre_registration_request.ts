import vine from '@vinejs/vine'

export const preRegistrationRequestValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email(),
    password: vine.string().minLength(8).maxLength(255),
    phone: vine.string().trim().minLength(6).maxLength(30),
    username: vine.string().trim().minLength(2).maxLength(100),
    city: vine.string().trim().minLength(2).maxLength(120),
    zipcode: vine.string().trim().minLength(2).maxLength(20),
    interest: vine.string().trim().maxLength(2000).optional(),
    comment: vine.string().trim().maxLength(5000).optional(),
  })
)

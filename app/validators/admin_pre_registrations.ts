import vine from '@vinejs/vine'

export const rejectPreRegistrationValidator = vine.compile(
  vine.object({
    reason: vine.string().trim().minLength(3).maxLength(2000),
  })
)

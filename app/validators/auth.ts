import vine from '@vinejs/vine'

export const registerValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email(),
    password: vine.string().minLength(8).maxLength(255),
    deviceName: vine.string().trim().minLength(2).maxLength(80).optional(),
  })
)

export const loginValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email(),
    password: vine.string().minLength(8).maxLength(255),
    deviceName: vine.string().trim().minLength(2).maxLength(80).optional(),
  })
)

export const forgotPasswordValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email(),
  })
)

export const resetPasswordValidator = vine.compile(
  vine.object({
    token: vine.string().trim().minLength(32).maxLength(255),
    password: vine.string().minLength(8).maxLength(255),
    passwordConfirmation: vine.string().minLength(8).maxLength(255),
  })
)

export const resetPasswordWithCodeValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email(),
    code: vine.string().trim().fixedLength(6),
    password: vine.string().minLength(8).maxLength(255),
    passwordConfirmation: vine.string().minLength(8).maxLength(255),
  })
)

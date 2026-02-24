import type { PreRegisterUserDto } from '#application/dto/pre_register_user_dto'

export interface PreRegisterUserWriteModel {
  roleId: number
  email: string
  password: string
  phone: string
  username: string
  city: string
  zipcode: string
  interest: string | null
  comment: string | null
}

export function toPreRegisterUserWriteModel(dto: PreRegisterUserDto): PreRegisterUserWriteModel {
  return {
    roleId: dto.roleId,
    email: dto.email.toLowerCase(),
    password: dto.password,
    phone: dto.phone,
    username: dto.username,
    city: dto.city,
    zipcode: dto.zipcode,
    interest: dto.interest ?? null,
    comment: dto.comment ?? null,
  }
}

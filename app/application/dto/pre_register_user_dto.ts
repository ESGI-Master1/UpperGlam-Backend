export interface PreRegisterUserDto {
  roleId: number
  email: string
  password: string
  phone: string
  username: string
  city: string
  zipcode: string
  interest?: string
  comment?: string
}

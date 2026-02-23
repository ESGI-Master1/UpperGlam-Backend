export interface PreRegisterUserDto {
  email: string
  password: string
  phone: string
  username: string
  city: string
  zipcode: string
  interest?: string
  comment?: string
}

export type UserStatus = 'pending' | 'active' | 'suspended'

export interface PreRegistration {
  email: string
  passwordHash: string
  phone: string
  status: UserStatus
  username: string
  city: string
  zipcode: string
  interest: string | null
  comment: string | null
}

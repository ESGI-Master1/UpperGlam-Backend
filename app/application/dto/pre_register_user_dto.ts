export type PreRegistrationRole = 'user' | 'provider'
export type ServiceMode = 'home' | 'institute'

export interface PreRegisterProviderProfileDto {
  displayName: string
  businessName?: string
  serviceModes?: ServiceMode[]
  instituteAddress?: string
  specialties?: string[]
  priceFromCents?: number
  yearsExperience?: number
  hasCertification?: boolean
  instagramUrl?: string
  tiktokUrl?: string
}

export interface PreRegisterUserDto {
  role: PreRegistrationRole
  roleId: number
  email: string
  password: string
  phone: string
  firstName: string
  lastName: string
  username?: string
  city: string
  zipcode: string
  marketingOptIn?: boolean
  source?: string
  desiredServices?: string[]
  preferredServiceModes?: ServiceMode[]
  preferredBudgetCents?: number
  providerProfile?: PreRegisterProviderProfileDto
  interest?: string
  comment?: string
}

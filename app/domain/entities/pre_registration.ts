export type UserStatus = 'pending' | 'active' | 'suspended'
export type PreRegistrationReviewStatus = 'submitted' | 'in_review' | 'approved' | 'rejected'
export type ServiceMode = 'home' | 'institute'

export interface PreRegistration {
  roleId: number
  email: string
  passwordHash: string
  phone: string
  status: UserStatus
  firstName: string
  lastName: string
  username: string
  city: string
  zipcode: string
  marketingOptIn: boolean
  source: string | null
  desiredServices: string[] | null
  preferredServiceModes: ServiceMode[] | null
  preferredBudgetCents: number | null
  professionalDisplayName: string | null
  businessName: string | null
  providerServiceModes: ServiceMode[] | null
  providerInstituteAddress: string | null
  providerSpecialties: string[] | null
  providerPriceFromCents: number | null
  providerYearsExperience: number | null
  providerHasCertification: boolean
  providerInstagramUrl: string | null
  providerTiktokUrl: string | null
  reviewStatus: PreRegistrationReviewStatus
  reviewedAt: Date | null
  reviewedByUserId: number | null
  rejectionReason: string | null
  interest: string | null
  comment: string | null
}

import type {
  PreRegisterUserDto,
  PreRegisterProviderProfileDto,
  ServiceMode,
} from '#application/dto/pre_register_user_dto'

export interface PreRegisterUserWriteModel {
  role: 'user' | 'provider'
  roleId: number
  email: string
  password: string
  phone: string
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
  interest: string | null
  comment: string | null
}

function cleanText(value: string | undefined | null): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function cleanArray(values: string[] | undefined): string[] | null {
  if (!values || values.length === 0) {
    return null
  }

  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
  return normalized.length ? normalized : null
}

function cleanServiceModes(values: ServiceMode[] | undefined): ServiceMode[] | null {
  if (!values || values.length === 0) {
    return null
  }

  const allowed = new Set<ServiceMode>(['home', 'institute'])
  const normalized = [...new Set(values.filter((value) => allowed.has(value)))]
  return normalized.length ? normalized : null
}

function resolveUsername(dto: PreRegisterUserDto): string {
  const manual = cleanText(dto.username)
  if (manual) {
    return manual
  }

  if (dto.role === 'provider') {
    const providerDisplayName = cleanText(dto.providerProfile?.displayName)
    if (providerDisplayName) {
      return providerDisplayName
    }
  }

  const fullName = `${dto.firstName} ${dto.lastName}`.trim()
  return fullName || dto.email
}

function normalizeProviderProfile(
  role: 'user' | 'provider',
  profile: PreRegisterProviderProfileDto | undefined
) {
  if (role !== 'provider') {
    return {
      professionalDisplayName: null,
      businessName: null,
      providerServiceModes: null,
      providerInstituteAddress: null,
      providerSpecialties: null,
      providerPriceFromCents: null,
      providerYearsExperience: null,
      providerHasCertification: false,
      providerInstagramUrl: null,
      providerTiktokUrl: null,
    }
  }

  return {
    professionalDisplayName: cleanText(profile?.displayName),
    businessName: cleanText(profile?.businessName),
    providerServiceModes: cleanServiceModes(profile?.serviceModes),
    providerInstituteAddress: cleanText(profile?.instituteAddress),
    providerSpecialties: cleanArray(profile?.specialties),
    providerPriceFromCents: profile?.priceFromCents ?? null,
    providerYearsExperience: profile?.yearsExperience ?? null,
    providerHasCertification: profile?.hasCertification ?? false,
    providerInstagramUrl: cleanText(profile?.instagramUrl),
    providerTiktokUrl: cleanText(profile?.tiktokUrl),
  }
}

export function toPreRegisterUserWriteModel(dto: PreRegisterUserDto): PreRegisterUserWriteModel {
  const providerProfile = normalizeProviderProfile(dto.role, dto.providerProfile)

  return {
    role: dto.role,
    roleId: dto.roleId,
    email: dto.email.toLowerCase(),
    password: dto.password,
    phone: dto.phone,
    firstName: dto.firstName.trim(),
    lastName: dto.lastName.trim(),
    username: resolveUsername(dto),
    city: dto.city,
    zipcode: dto.zipcode,
    marketingOptIn: dto.marketingOptIn ?? false,
    source: cleanText(dto.source),
    desiredServices: cleanArray(dto.desiredServices),
    preferredServiceModes: cleanServiceModes(dto.preferredServiceModes),
    preferredBudgetCents: dto.preferredBudgetCents ?? null,
    professionalDisplayName: providerProfile.professionalDisplayName,
    businessName: providerProfile.businessName,
    providerServiceModes: providerProfile.providerServiceModes,
    providerInstituteAddress: providerProfile.providerInstituteAddress,
    providerSpecialties: providerProfile.providerSpecialties,
    providerPriceFromCents: providerProfile.providerPriceFromCents,
    providerYearsExperience: providerProfile.providerYearsExperience,
    providerHasCertification: providerProfile.providerHasCertification,
    providerInstagramUrl: providerProfile.providerInstagramUrl,
    providerTiktokUrl: providerProfile.providerTiktokUrl,
    interest: dto.interest ?? null,
    comment: dto.comment ?? null,
  }
}

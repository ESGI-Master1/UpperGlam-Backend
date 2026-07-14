import { test } from '@japa/runner'
import { toPreRegisterUserWriteModel } from '#application/mappers/pre_register_user_mapper'
import type { PreRegisterUserDto } from '#application/dto/pre_register_user_dto'

const baseDto: PreRegisterUserDto = {
  role: 'user',
  roleId: 1,
  email: 'CLIENT@EXAMPLE.COM',
  password: 'Password123!',
  phone: '+33600000000',
  firstName: '  Jane ',
  lastName: ' Doe ',
  city: 'Paris',
  zipcode: '75001',
}

test.group('pre-register user mapper', () => {
  test('normalizes a client pre-registration without provider fields', ({ assert }) => {
    const writeModel = toPreRegisterUserWriteModel({
      ...baseDto,
      username: '  ',
      source: '  instagram  ',
      desiredServices: [' hair ', '', 'hair', 'makeup'],
      preferredServiceModes: ['home', 'home'],
      preferredBudgetCents: 8500,
      marketingOptIn: true,
      interest: 'Demo',
    })

    assert.containSubset(writeModel, {
      role: 'user',
      roleId: 1,
      email: 'client@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      username: 'Jane   Doe',
      marketingOptIn: true,
      source: 'instagram',
      desiredServices: ['hair', 'makeup'],
      preferredServiceModes: ['home'],
      preferredBudgetCents: 8500,
      professionalDisplayName: null,
      providerServiceModes: null,
      providerHasCertification: false,
      interest: 'Demo',
      comment: null,
    })
  })

  test('normalizes a provider pre-registration and deduplicates provider data', ({ assert }) => {
    const writeModel = toPreRegisterUserWriteModel({
      ...baseDto,
      role: 'provider',
      roleId: 2,
      email: 'PRO@EXAMPLE.COM',
      providerProfile: {
        displayName: '  Maison Glow  ',
        businessName: '  MG SAS  ',
        serviceModes: ['home', 'institute', 'home'],
        instituteAddress: '  10 rue de Paris  ',
        specialties: [' nails ', 'makeup', 'nails', ''],
        priceFromCents: 12000,
        yearsExperience: 4,
        hasCertification: true,
        instagramUrl: '  https://instagram.example/pro  ',
      },
    })

    assert.containSubset(writeModel, {
      role: 'provider',
      roleId: 2,
      email: 'pro@example.com',
      username: 'Maison Glow',
      professionalDisplayName: 'Maison Glow',
      businessName: 'MG SAS',
      providerServiceModes: ['home', 'institute'],
      providerInstituteAddress: '10 rue de Paris',
      providerSpecialties: ['nails', 'makeup'],
      providerPriceFromCents: 12000,
      providerYearsExperience: 4,
      providerHasCertification: true,
      providerInstagramUrl: 'https://instagram.example/pro',
      providerTiktokUrl: null,
    })
  })
})

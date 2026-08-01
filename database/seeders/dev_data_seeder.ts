import { BaseSeeder } from '@adonisjs/lucid/seeders'
import hash from '@adonisjs/core/services/hash'
import { randomUUID } from 'node:crypto'

type RoleName = 'user' | 'provider' | 'admin'
type ServiceMode = 'home' | 'institute'
type BookingStatus = 'paid' | 'cancelled'

type SeedUser = {
  role: RoleName
  email: string
  phone: string
  firstName: string
  lastName: string
  userId?: number
}

type ProviderSeed = {
  userId: number
  profileId?: number
  displayName: string
  city: string
  serviceModes: ServiceMode[]
  priceFromCents: number
  currency: string
}

const CUSTOMER_COUNT = 120
const PROVIDER_COUNT = 40
const ADMIN_COUNT = 3
const DAYS_OF_SLOTS = 21
const SLOT_HOURS = [9, 11, 14, 16]
const BOOKING_COUNT = 260
const OPEN_DRAFT_COUNT = 90
const DEMO_SEED = Number.parseInt(process.env.DEMO_SEED ?? '20260715', 10)

let randomState = Number.isFinite(DEMO_SEED) ? DEMO_SEED >>> 0 : 20260715

function random(): number {
  randomState = (randomState + 0x6d2b79f5) >>> 0
  let value = randomState
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296
}

function randomInt(min: number, max: number) {
  return Math.floor(random() * (max - min + 1)) + min
}

function pickOne<T>(values: T[]): T {
  return values[randomInt(0, values.length - 1)]
}

function pickMany<T>(values: T[], count: number): T[] {
  const copy = [...values]
  const picked: T[] = []
  while (copy.length && picked.length < count) {
    const index = randomInt(0, copy.length - 1)
    picked.push(copy[index])
    copy.splice(index, 1)
  }
  return picked
}

function chunkArray<T>(values: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < values.length; i += chunkSize) {
    chunks.push(values.slice(i, i + chunkSize))
  }
  return chunks
}

function addDays(baseDate: Date, days: number, hours = 0, minutes = 0): Date {
  const date = new Date(baseDate)
  date.setUTCDate(date.getUTCDate() + days)
  date.setUTCHours(hours, minutes, 0, 0)
  return date
}

function toSafePhone(index: number): string {
  return `+3367${String(1000000 + index).slice(0, 7)}`
}

function sanitizeForPath(input: string): string {
  return input.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()
}

export default class extends BaseSeeder {
  static environment = ['development', 'testing']

  async run() {
    const db = this.client

    await db.rawQuery(`
      TRUNCATE TABLE
        provider_review_media,
        provider_reviews,
        payments,
        bookings,
        booking_drafts,
        provider_availability_slots,
        provider_gallery_items,
        provider_profile_tags,
        provider_tags,
        provider_profiles,
        media_assets,
        user_shortcuts,
        user_preferences,
        user_profiles,
        user_roles,
        password_reset_tokens,
        auth_access_tokens,
        users,
        roles
      RESTART IDENTITY CASCADE
    `)

    const now = new Date()
    const basePasswordHash = await hash.make('UpperGlam123!')

    const firstNames = [
      'Emma',
      'Lina',
      'Sarah',
      'Camille',
      'Lea',
      'Maya',
      'Nina',
      'Julie',
      'Sofia',
      'Yasmine',
      'Chloe',
      'Ines',
      'Zoé',
      'Amina',
      'Noémie',
      'Manon',
      'Iris',
      'Lou',
      'Anais',
      'Eva',
    ]
    const lastNames = [
      'Martin',
      'Bernard',
      'Dubois',
      'Thomas',
      'Robert',
      'Richard',
      'Petit',
      'Durand',
      'Leroy',
      'Moreau',
      'Simon',
      'Laurent',
      'Lefebvre',
      'Michel',
      'Garcia',
      'David',
      'Bertrand',
      'Roux',
      'Vincent',
      'Fournier',
    ]
    const cities = ['Paris', 'Lyon', 'Marseille', 'Lille', 'Bordeaux', 'Toulouse', 'Nantes']
    const bios = [
      'Spécialiste coiffure et soin capillaire.',
      'Experte beauté des mains et nail art.',
      'Make-up artist pour événements et mariages.',
      'Soins visage et rituel glow.',
      'Coloration, balayage et coupe personnalisée.',
      'Beauté du regard et extension de cils.',
      'Massages esthétiques et détente.',
    ]
    const tagCatalog = [
      { slug: 'coiffure', label: 'Coiffure' },
      { slug: 'barbier', label: 'Barbier' },
      { slug: 'ongles', label: 'Ongles' },
      { slug: 'maquillage', label: 'Maquillage' },
      { slug: 'visage', label: 'Soin visage' },
      { slug: 'cils', label: 'Cils & Sourcils' },
      { slug: 'massage', label: 'Massage' },
      { slug: 'epilation', label: 'Epilation' },
      { slug: 'spa', label: 'Spa' },
      { slug: 'mariage', label: 'Mariage' },
      { slug: 'coloration', label: 'Coloration' },
      { slug: 'domicile', label: 'A domicile' },
    ]
    const serviceCatalog = [
      { name: 'Coupe et brushing', category: 'Coiffure', duration: 60 },
      { name: 'Maquillage événement', category: 'Maquillage', duration: 75 },
      { name: 'Manucure et pose de vernis', category: 'Onglerie', duration: 60 },
      { name: 'Soin du visage', category: 'Soins visage', duration: 50 },
      { name: 'Beauté du regard', category: 'Cils et sourcils', duration: 60 },
      { name: 'Massage esthétique', category: 'Massage', duration: 60 },
      { name: 'Épilation', category: 'Épilation', duration: 45 },
      { name: 'Préparation beauté mariage', category: 'Mariage', duration: 120 },
    ]

    const seedUsers: SeedUser[] = []
    for (let i = 0; i < CUSTOMER_COUNT; i++) {
      seedUsers.push({
        role: 'user',
        email: `customer+${String(i + 1).padStart(3, '0')}@upperglam.dev`,
        phone: toSafePhone(i + 1),
        firstName: pickOne(firstNames),
        lastName: pickOne(lastNames),
      })
    }
    for (let i = 0; i < PROVIDER_COUNT; i++) {
      seedUsers.push({
        role: 'provider',
        email: `provider+${String(i + 1).padStart(3, '0')}@upperglam.dev`,
        phone: toSafePhone(CUSTOMER_COUNT + i + 1),
        firstName: pickOne(firstNames),
        lastName: pickOne(lastNames),
      })
    }
    for (let i = 0; i < ADMIN_COUNT; i++) {
      seedUsers.push({
        role: 'admin',
        email: `admin+${String(i + 1).padStart(3, '0')}@upperglam.dev`,
        phone: toSafePhone(CUSTOMER_COUNT + PROVIDER_COUNT + i + 1),
        firstName: pickOne(firstNames),
        lastName: pickOne(lastNames),
      })
    }

    const insertedRoles = await db
      .table('roles')
      .insert([
        { name: 'user', created_at: now },
        { name: 'provider', created_at: now },
        { name: 'admin', created_at: now },
      ])
      .returning(['id', 'name'])
    const roleIdByName = new Map<string, number>()
    for (const role of insertedRoles) {
      roleIdByName.set(String(role.name), Number(role.id))
    }

    const insertedUsers = await db
      .table('users')
      .insert(
        seedUsers.map((seedUser) => ({
          email: seedUser.email,
          password_hash: basePasswordHash,
          phone: seedUser.phone,
          status: 'active',
          created_at: now,
        }))
      )
      .returning(['id', 'email'])

    const userIdByEmail = new Map<string, number>()
    for (const insertedUser of insertedUsers) {
      userIdByEmail.set(String(insertedUser.email), Number(insertedUser.id))
    }
    for (const seedUser of seedUsers) {
      seedUser.userId = userIdByEmail.get(seedUser.email)
    }

    await db.table('user_roles').insert(
      seedUsers.map((seedUser) => ({
        user_id: seedUser.userId!,
        role_id: roleIdByName.get(seedUser.role)!,
      }))
    )

    await db.table('user_profiles').insert(
      seedUsers.map((seedUser) => ({
        user_id: seedUser.userId!,
        first_name: seedUser.firstName,
        last_name: seedUser.lastName,
        created_at: addDays(now, -randomInt(0, 45)),
        updated_at: now,
      }))
    )

    await db.table('user_preferences').insert(
      seedUsers.map((seedUser) => ({
        user_id: seedUser.userId!,
        reminder_enabled: true,
        offers_enabled: random() > 0.55,
        analytics_enabled: true,
        created_at: addDays(now, -randomInt(0, 20)),
        updated_at: now,
      }))
    )

    const providerUsers = seedUsers.filter((seedUser) => seedUser.role === 'provider')
    const customerUsers = seedUsers.filter((seedUser) => seedUser.role === 'user')

    const providerIdsSample = providerUsers
      .slice(0, Math.min(providerUsers.length, 8))
      .map((seedUser) => seedUser.userId!)
    await db.table('user_shortcuts').insert(
      seedUsers.map((seedUser) => ({
        user_id: seedUser.userId!,
        recent_provider_ids:
          seedUser.role === 'user'
            ? JSON.stringify(
                pickMany(providerIdsSample, randomInt(0, Math.min(providerIdsSample.length, 4)))
              )
            : JSON.stringify([]),
        last_search:
          seedUser.role === 'user'
            ? JSON.stringify({
                query: pickOne(['coiffure', 'ongles', 'maquillage', 'spa', 'cils']),
                location: pickOne(cities),
                updatedAt: addDays(now, -randomInt(0, 10)).toISOString(),
              })
            : null,
        updated_at: now,
      }))
    )

    const providerSeeds: ProviderSeed[] = providerUsers.map((seedUser, index) => {
      const modes = random() > 0.35 ? ['home', 'institute'] : [pickOne(['home', 'institute'])]
      return {
        userId: seedUser.userId!,
        displayName: `${seedUser.firstName} ${seedUser.lastName} Studio`,
        city: cities[index % cities.length],
        serviceModes: modes as ServiceMode[],
        priceFromCents: randomInt(25, 130) * 100,
        currency: 'EUR',
      }
    })

    const insertedProviders = await db
      .table('provider_profiles')
      .insert(
        providerSeeds.map((providerSeed, index) => ({
          user_id: providerSeed.userId,
          display_name: providerSeed.displayName,
          city: providerSeed.city,
          bio: pickOne(bios),
          institute_address: `${randomInt(1, 180)} rue ${pickOne(['de Paris', 'Victor Hugo', 'des Fleurs', 'du Centre'])}, ${providerSeed.city}`,
          service_modes: JSON.stringify(providerSeed.serviceModes),
          price_from_cents: providerSeed.priceFromCents,
          currency: providerSeed.currency,
          is_featured: index < 8,
          rating_avg: 0,
          rating_count: 0,
          created_at: addDays(now, -randomInt(10, 120)),
          updated_at: now,
        }))
      )
      .returning(['id', 'user_id'])

    const providerIdByUserId = new Map<number, number>()
    for (const insertedProvider of insertedProviders) {
      providerIdByUserId.set(Number(insertedProvider.user_id), Number(insertedProvider.id))
    }
    for (const providerSeed of providerSeeds) {
      providerSeed.profileId = providerIdByUserId.get(providerSeed.userId)
    }

    const insertedTags = await db
      .table('provider_tags')
      .insert(tagCatalog)
      .returning(['id', 'slug'])
    const tagIdBySlug = new Map<string, number>()
    for (const insertedTag of insertedTags) {
      tagIdBySlug.set(String(insertedTag.slug), Number(insertedTag.id))
    }

    const providerTagRows: Array<{ provider_profile_id: number; provider_tag_id: number }> = []
    for (const providerSeed of providerSeeds) {
      const chosenTags = pickMany(tagCatalog, randomInt(2, 4))
      for (const tag of chosenTags) {
        providerTagRows.push({
          provider_profile_id: providerSeed.profileId!,
          provider_tag_id: tagIdBySlug.get(tag.slug)!,
        })
      }
    }
    await db.table('provider_profile_tags').insert(providerTagRows)

    await db.table('provider_services').insert(
      providerSeeds.flatMap((providerSeed) =>
        pickMany(serviceCatalog, randomInt(2, 4)).map((service, index) => ({
          provider_profile_id: providerSeed.profileId!,
          name: service.name,
          category: service.category,
          duration_minutes: service.duration,
          price_cents: providerSeed.priceFromCents + index * 1_000,
          is_active: true,
          created_at: now,
          updated_at: now,
        }))
      )
    )

    const mediaBucket = 'upperglam-user-images'
    const avatarMediaRows = providerSeeds.map((providerSeed) => ({
      owner_user_id: providerSeed.userId,
      bucket: mediaBucket,
      object_key: `users/${providerSeed.userId}/profile/provider-avatar-${providerSeed.profileId}.jpg`,
      mime_type: 'image/jpeg',
      size_bytes: randomInt(120_000, 580_000),
      category: 'profile',
      visibility: 'private',
      created_at: addDays(now, -randomInt(1, 50)),
    }))
    const coverMediaRows = providerSeeds.map((providerSeed) => ({
      owner_user_id: providerSeed.userId,
      bucket: mediaBucket,
      object_key: `users/${providerSeed.userId}/shop/provider-cover-${providerSeed.profileId}.jpg`,
      mime_type: 'image/jpeg',
      size_bytes: randomInt(180_000, 950_000),
      category: 'shop',
      visibility: 'private',
      created_at: addDays(now, -randomInt(1, 50)),
    }))
    const insertedAvatars = await db.table('media_assets').insert(avatarMediaRows).returning(['id'])
    const insertedCovers = await db.table('media_assets').insert(coverMediaRows).returning(['id'])

    for (const [i, providerSeed] of providerSeeds.entries()) {
      const avatarMediaId = Number(insertedAvatars[i].id)
      const coverMediaId = Number(insertedCovers[i].id)

      await db.from('provider_profiles').where('id', providerSeed.profileId!).update({
        avatar_media_id: avatarMediaId,
        cover_media_id: coverMediaId,
        updated_at: now,
      })
      await db.from('user_profiles').where('user_id', providerSeed.userId).update({
        avatar_media_id: avatarMediaId,
        updated_at: now,
      })
    }

    const customerAvatarUsers = pickMany(customerUsers, Math.min(customerUsers.length, 50))
    if (customerAvatarUsers.length) {
      const customerAvatarRows = customerAvatarUsers.map((seedUser) => ({
        owner_user_id: seedUser.userId!,
        bucket: mediaBucket,
        object_key: `users/${seedUser.userId}/profile/customer-avatar-${sanitizeForPath(seedUser.email)}.jpg`,
        mime_type: 'image/jpeg',
        size_bytes: randomInt(80_000, 450_000),
        category: 'profile',
        visibility: 'private',
        created_at: addDays(now, -randomInt(1, 50)),
      }))
      const insertedCustomerAvatars = await db
        .table('media_assets')
        .insert(customerAvatarRows)
        .returning(['id'])
      for (const [i, customerAvatarUser] of customerAvatarUsers.entries()) {
        await db
          .from('user_profiles')
          .where('user_id', customerAvatarUser.userId!)
          .update({
            avatar_media_id: Number(insertedCustomerAvatars[i].id),
            updated_at: now,
          })
      }
    }

    const galleryRows: Array<{
      owner_user_id: number
      bucket: string
      object_key: string
      mime_type: string
      size_bytes: number
      category: 'shop'
      visibility: 'private'
      created_at: Date
    }> = []
    const galleryMeta: Array<{ providerProfileId: number; position: number }> = []
    for (const providerSeed of providerSeeds) {
      const itemsCount = randomInt(3, 6)
      for (let position = 0; position < itemsCount; position++) {
        galleryRows.push({
          owner_user_id: providerSeed.userId,
          bucket: mediaBucket,
          object_key: `users/${providerSeed.userId}/shop/provider-${providerSeed.profileId}-gallery-${position + 1}.jpg`,
          mime_type: 'image/jpeg',
          size_bytes: randomInt(160_000, 1_200_000),
          category: 'shop',
          visibility: 'private',
          created_at: addDays(now, -randomInt(1, 70)),
        })
        galleryMeta.push({ providerProfileId: providerSeed.profileId!, position })
      }
    }
    const insertedGalleryMedia = await db
      .table('media_assets')
      .insert(galleryRows)
      .returning(['id'])
    await db.table('provider_gallery_items').insert(
      insertedGalleryMedia.map((media, index) => ({
        provider_profile_id: galleryMeta[index].providerProfileId,
        media_id: Number(media.id),
        title: `Photo ${galleryMeta[index].position + 1}`,
        position: galleryMeta[index].position,
        created_at: now,
      }))
    )

    const slotRows: Array<{
      provider_profile_id: number
      slot_start_at: Date
      slot_end_at: Date
      is_booked: boolean
      booking_id: null
      created_at: Date
      updated_at: Date
    }> = []
    const slotStartDay = addDays(now, 1, 0, 0)
    for (const providerSeed of providerSeeds) {
      for (let dayOffset = 0; dayOffset < DAYS_OF_SLOTS; dayOffset++) {
        for (const hour of SLOT_HOURS) {
          const slotStart = addDays(slotStartDay, dayOffset, hour, 0)
          const slotEnd = addDays(slotStartDay, dayOffset, hour + 1, 0)
          slotRows.push({
            provider_profile_id: providerSeed.profileId!,
            slot_start_at: slotStart,
            slot_end_at: slotEnd,
            is_booked: false,
            booking_id: null,
            created_at: now,
            updated_at: now,
          })
        }
      }
    }
    for (const chunk of chunkArray(slotRows, 700)) {
      await db.table('provider_availability_slots').insert(chunk)
    }

    const allSlots = await db
      .from('provider_availability_slots')
      .select('id', 'provider_profile_id', 'slot_start_at', 'slot_end_at')
      .orderBy('id', 'asc')

    const providerById = new Map<number, ProviderSeed>()
    for (const providerSeed of providerSeeds) {
      providerById.set(providerSeed.profileId!, providerSeed)
    }

    const bookingSlots = allSlots.slice(0, Math.min(BOOKING_COUNT, allSlots.length))
    const bookingDraftRows = bookingSlots.map((slot) => {
      const providerSeed = providerById.get(Number(slot.provider_profile_id))!
      const mode = pickOne(providerSeed.serviceModes)
      return {
        customer_user_id: pickOne(customerUsers).userId!,
        provider_profile_id: Number(slot.provider_profile_id),
        slot_start_at: new Date(String(slot.slot_start_at)),
        slot_end_at: new Date(String(slot.slot_end_at)),
        appointment_mode: mode,
        address:
          mode === 'home'
            ? `${randomInt(1, 220)} avenue ${pickOne(['de la Republique', 'des Arts', 'du Soleil'])}, ${providerSeed.city}`
            : null,
        note: random() > 0.5 ? 'Client de test mobile' : null,
        amount_cents: providerSeed.priceFromCents,
        currency: providerSeed.currency,
        status: 'completed',
        expires_at: addDays(now, 2),
        created_at: addDays(now, -randomInt(1, 18)),
        updated_at: now,
      }
    })
    const insertedBookingDrafts = await db
      .table('booking_drafts')
      .insert(bookingDraftRows)
      .returning(['id'])

    const bookingRows = insertedBookingDrafts.map((draft, index) => {
      const status: BookingStatus = random() > 0.18 ? 'paid' : 'cancelled'
      return {
        draft_id: Number(draft.id),
        customer_user_id: bookingDraftRows[index].customer_user_id,
        provider_profile_id: bookingDraftRows[index].provider_profile_id,
        slot_start_at: bookingDraftRows[index].slot_start_at,
        slot_end_at: bookingDraftRows[index].slot_end_at,
        appointment_mode: bookingDraftRows[index].appointment_mode,
        address: bookingDraftRows[index].address,
        note: bookingDraftRows[index].note,
        amount_cents: bookingDraftRows[index].amount_cents,
        currency: 'EUR',
        status,
        confirmation_code: `UG-${String(index + 1).padStart(6, '0')}`,
        cancelled_at: status === 'cancelled' ? addDays(now, -randomInt(0, 8)) : null,
        created_at: bookingDraftRows[index].created_at,
        updated_at: now,
      }
    })
    const insertedBookings = await db
      .table('bookings')
      .insert(bookingRows)
      .returning(['id', 'draft_id'])

    const bookingIdByDraftId = new Map<number, number>()
    for (const booking of insertedBookings) {
      bookingIdByDraftId.set(Number(booking.draft_id), Number(booking.id))
    }

    for (const [i, bookingSlot] of bookingSlots.entries()) {
      const draftId = Number(insertedBookingDrafts[i].id)
      const bookingId = bookingIdByDraftId.get(draftId)!
      await db.from('provider_availability_slots').where('id', Number(bookingSlot.id)).update({
        is_booked: true,
        booking_id: bookingId,
        updated_at: now,
      })
    }

    await db.table('payments').insert(
      insertedBookings.map((booking, index) => ({
        booking_draft_id: Number(booking.draft_id),
        booking_id: Number(booking.id),
        method: pickOne(['card', 'apple_pay', 'google_pay']),
        provider: 'wallet',
        provider_transaction_id: `txn_${String(index + 1).padStart(8, '0')}_${randomUUID().slice(0, 8)}`,
        provider_reference: `dev_ref_${String(index + 1).padStart(8, '0')}`,
        status: 'succeeded',
        created_at: addDays(now, -randomInt(0, 18)),
      }))
    )

    const openDraftSlots = allSlots.slice(
      bookingSlots.length,
      bookingSlots.length + OPEN_DRAFT_COUNT
    )
    if (openDraftSlots.length) {
      await db.table('booking_drafts').insert(
        openDraftSlots.map((slot, index) => {
          const providerSeed = providerById.get(Number(slot.provider_profile_id))!
          const mode = pickOne(providerSeed.serviceModes)
          const draftStatus = pickOne(['pending_payment', 'payment_failed', 'expired'])
          return {
            customer_user_id: pickOne(customerUsers).userId!,
            provider_profile_id: Number(slot.provider_profile_id),
            slot_start_at: new Date(String(slot.slot_start_at)),
            slot_end_at: new Date(String(slot.slot_end_at)),
            appointment_mode: mode,
            address: mode === 'home' ? `Adresse test ${index + 1}` : null,
            note: 'Draft de test',
            amount_cents: providerSeed.priceFromCents,
            currency: 'EUR',
            status: draftStatus,
            expires_at:
              draftStatus === 'pending_payment' ? addDays(now, 1) : addDays(now, -randomInt(1, 3)),
            created_at: addDays(now, -randomInt(0, 7)),
            updated_at: now,
          }
        })
      )
    }

    const paidBookings = await db
      .from('bookings')
      .where('status', 'paid')
      .select('id', 'provider_profile_id', 'customer_user_id')

    const reviewRows = paidBookings
      .filter(() => random() > 0.32)
      .slice(0, 180)
      .map((booking) => ({
        provider_profile_id: Number(booking.provider_profile_id),
        author_user_id: Number(booking.customer_user_id),
        booking_id: Number(booking.id),
        rating: pickOne([3, 4, 4, 5, 5]),
        comment: pickOne([
          'Super expérience, je recommande.',
          'Très professionnelle, résultat au top.',
          'Ponctuelle et attentive, parfait.',
          'Bonne prestation, je reviendrai.',
          'Service propre et rapide.',
        ]),
        created_at: addDays(now, -randomInt(0, 20)),
      }))
    const insertedReviews =
      reviewRows.length > 0
        ? await db
            .table('provider_reviews')
            .insert(reviewRows)
            .returning(['id', 'author_user_id', 'provider_profile_id'])
        : []

    const reviewMediaDraftRows: Array<{
      owner_user_id: number
      bucket: string
      object_key: string
      mime_type: string
      size_bytes: number
      category: 'review'
      visibility: 'private'
      created_at: Date
    }> = []
    const reviewMediaMeta: Array<{ reviewId: number; position: number }> = []

    for (const review of insertedReviews) {
      if (random() < 0.35) {
        const filesCount = randomInt(1, 3)
        for (let position = 0; position < filesCount; position++) {
          reviewMediaDraftRows.push({
            owner_user_id: Number(review.author_user_id),
            bucket: mediaBucket,
            object_key: `users/${Number(review.author_user_id)}/reviews/${Number(review.id)}/photo-${position + 1}.jpg`,
            mime_type: 'image/jpeg',
            size_bytes: randomInt(140_000, 900_000),
            category: 'review',
            visibility: 'private',
            created_at: addDays(now, -randomInt(0, 20)),
          })
          reviewMediaMeta.push({ reviewId: Number(review.id), position })
        }
      }
    }

    if (reviewMediaDraftRows.length) {
      const insertedReviewMedia = await db
        .table('media_assets')
        .insert(reviewMediaDraftRows)
        .returning(['id'])
      await db.table('provider_review_media').insert(
        insertedReviewMedia.map((media, index) => ({
          provider_review_id: reviewMediaMeta[index].reviewId,
          media_id: Number(media.id),
          position: reviewMediaMeta[index].position,
          created_at: now,
        }))
      )
    }

    const ratings = await db
      .from('provider_reviews')
      .select('provider_profile_id')
      .avg('rating as rating_avg')
      .count('* as rating_count')
      .groupBy('provider_profile_id')
    for (const rating of ratings) {
      await db
        .from('provider_profiles')
        .where('id', Number(rating.provider_profile_id))
        .update({
          rating_avg: Number(rating.rating_avg ?? 0).toFixed(2),
          rating_count: Number(rating.rating_count ?? 0),
          updated_at: now,
        })
    }

    await db
      .from('provider_profiles')
      .orderBy('rating_avg', 'desc')
      .limit(10)
      .update({ is_featured: true, updated_at: now })
  }
}

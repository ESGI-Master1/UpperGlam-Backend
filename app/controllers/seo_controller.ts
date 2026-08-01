import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { dataResponse } from '#services/http'

const LOCATION_PAGE_MIN_PROVIDERS = 3

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Public, privacy-conscious snapshot used by the marketing SSG build.
 * Only active and actually bookable providers are exposed here.
 */
export default class SeoController {
  async catalog({ response }: HttpContext) {
    const now = DateTime.utc().toJSDate()
    const providerRows = await db
      .from('provider_profiles as pp')
      .join('users as u', 'u.id', 'pp.user_id')
      .where('u.status', 'active')
      .whereNotNull('pp.bio')
      .whereExists((query) => {
        query
          .select(db.raw('1'))
          .from('provider_services as ps')
          .whereRaw('ps.provider_profile_id = pp.id')
          .where('ps.is_active', true)
      })
      .whereExists((query) => {
        query
          .select(db.raw('1'))
          .from('provider_availability_slots as pas')
          .whereRaw('pas.provider_profile_id = pp.id')
          .where('pas.is_booked', false)
          .where('pas.slot_start_at', '>=', now)
      })
      .orderBy('pp.rating_avg', 'desc')
      .select(
        'pp.id',
        'pp.display_name',
        'pp.city',
        'pp.bio',
        'pp.institute_address',
        'pp.service_modes',
        'pp.home_service_zones',
        'pp.price_from_cents',
        'pp.currency',
        'pp.rating_avg',
        'pp.rating_count',
        'pp.updated_at'
      )

    const providerIds = providerRows.map((row) => Number(row.id))
    const [serviceRows, tagRows, slotRows] = providerIds.length
      ? await Promise.all([
          db
            .from('provider_services')
            .whereIn('provider_profile_id', providerIds)
            .where('is_active', true)
            .orderBy('price_cents', 'asc')
            .select(
              'provider_profile_id',
              'name',
              'category',
              'duration_minutes',
              'price_cents',
              'updated_at'
            ),
          db
            .from('provider_profile_tags as ppt')
            .join('provider_tags as pt', 'pt.id', 'ppt.provider_tag_id')
            .whereIn('ppt.provider_profile_id', providerIds)
            .orderBy('pt.label', 'asc')
            .select('ppt.provider_profile_id', 'pt.slug', 'pt.label'),
          db
            .from('provider_availability_slots')
            .whereIn('provider_profile_id', providerIds)
            .where('is_booked', false)
            .where('slot_start_at', '>=', now)
            .orderBy('slot_start_at', 'asc')
            .select('provider_profile_id', 'slot_start_at'),
        ])
      : [[], [], []]

    const providers = providerRows.map((row) => {
      const id = Number(row.id)
      const services = serviceRows
        .filter((service) => Number(service.provider_profile_id) === id)
        .map((service) => ({
          name: String(service.name),
          category: String(service.category),
          categorySlug: slugify(String(service.category)),
          durationMinutes: Number(service.duration_minutes),
          priceCents: Number(service.price_cents),
        }))
      const tags = tagRows
        .filter((tag) => Number(tag.provider_profile_id) === id)
        .map((tag) => ({ slug: String(tag.slug), label: String(tag.label) }))
      const nextSlots = slotRows
        .filter((slot) => Number(slot.provider_profile_id) === id)
        .slice(0, 3)
        .map((slot) => new Date(String(slot.slot_start_at)).toISOString())

      return {
        id,
        slug: `${slugify(String(row.display_name))}-${slugify(String(row.city))}-${id}`,
        name: String(row.display_name),
        city: String(row.city),
        citySlug: slugify(String(row.city)),
        bio: String(row.bio),
        instituteAddress: row.institute_address ? String(row.institute_address) : null,
        serviceModes: Array.isArray(row.service_modes) ? row.service_modes : [],
        homeServiceZones: Array.isArray(row.home_service_zones) ? row.home_service_zones : [],
        priceFromCents: row.price_from_cents === null ? null : Number(row.price_from_cents),
        currency: String(row.currency ?? 'EUR'),
        rating: Number(row.rating_avg ?? 0),
        reviewCount: Number(row.rating_count ?? 0),
        updatedAt: new Date(String(row.updated_at)).toISOString(),
        services,
        tags,
        nextSlots,
      }
    })

    const categories = new Map<string, { slug: string; name: string; providerIds: Set<number> }>()
    const cities = new Map<string, { slug: string; name: string; providerIds: Set<number> }>()
    for (const provider of providers) {
      const city = cities.get(provider.citySlug) ?? {
        slug: provider.citySlug,
        name: provider.city,
        providerIds: new Set<number>(),
      }
      city.providerIds.add(provider.id)
      cities.set(provider.citySlug, city)

      for (const service of provider.services) {
        const category = categories.get(service.categorySlug) ?? {
          slug: service.categorySlug,
          name: service.category,
          providerIds: new Set<number>(),
        }
        category.providerIds.add(provider.id)
        categories.set(service.categorySlug, category)
      }
    }

    const latestUpdate = providers
      .map((provider) => provider.updatedAt)
      .sort()
      .at(-1)

    response.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
    return response.ok(
      dataResponse({
        generatedAt: DateTime.utc().toISO(),
        updatedAt: latestUpdate ?? null,
        locationPageMinProviders: LOCATION_PAGE_MIN_PROVIDERS,
        providers,
        categories: [...categories.values()].map((category) => ({
          slug: category.slug,
          name: category.name,
          providerCount: category.providerIds.size,
        })),
        cities: [...cities.values()].map((city) => ({
          slug: city.slug,
          name: city.name,
          providerCount: city.providerIds.size,
        })),
      })
    )
  }
}

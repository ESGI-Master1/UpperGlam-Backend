import Stripe from 'stripe'
import env from '#start/env'

let stripeClient: Stripe | null = null

export function getStripeClient() {
  const secretKey = env.get('STRIPE_SECRET_KEY')
  if (!secretKey) {
    return null
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey)
  }

  return stripeClient
}

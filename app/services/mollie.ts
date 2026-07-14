import env from '#start/env'

const MOLLIE_API_BASE_URL = 'https://api.mollie.com/v2'

type MollieLink = {
  href: string
  type?: string
}

export type MolliePayment = {
  id: string
  status: 'open' | 'canceled' | 'pending' | 'authorized' | 'expired' | 'failed' | 'paid' | string
  method?: string | null
  amount: {
    currency: string
    value: string
  }
  metadata?: Record<string, unknown> | null
  _links?: {
    checkout?: MollieLink
    self?: MollieLink
  }
}

export type MollieRefund = {
  id: string
  paymentId?: string
  status?: string
  amount: {
    currency: string
    value: string
  }
  description?: string
  metadata?: Record<string, unknown> | null
}

type CreateMolliePaymentInput = {
  amountCents: number
  currency: string
  description: string
  method: 'applepay' | 'googlepay'
  metadata: Record<string, string>
}

type CreateMollieRefundInput = {
  paymentId: string
  amountCents: number
  currency: string
  description: string
  metadata: Record<string, string>
}

function getMollieApiKey() {
  return env.get('MOLLIE_API_KEY')
}

function formatMollieAmount(amountCents: number) {
  return (amountCents / 100).toFixed(2)
}

async function requestMollie<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = getMollieApiKey()
  if (!apiKey) {
    throw new Error('MOLLIE_API_KEY is not configured')
  }

  const response = await fetch(`${MOLLIE_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Mollie API error ${response.status}: ${body}`)
  }

  return response.json() as Promise<T>
}

export function isMollieConfigured() {
  return Boolean(getMollieApiKey())
}

export async function createMolliePayment(input: CreateMolliePaymentInput) {
  const webhookUrl = env.get('MOLLIE_WEBHOOK_URL')
  const redirectUrl = env.get('MOLLIE_REDIRECT_URL') ?? 'upperglam://payment-return'

  return requestMollie<MolliePayment>('/payments', {
    method: 'POST',
    body: JSON.stringify({
      amount: {
        currency: input.currency.toUpperCase(),
        value: formatMollieAmount(input.amountCents),
      },
      description: input.description,
      method: input.method,
      redirectUrl,
      ...(webhookUrl ? { webhookUrl } : {}),
      metadata: input.metadata,
    }),
  })
}

export async function getMolliePayment(paymentId: string) {
  return requestMollie<MolliePayment>(`/payments/${encodeURIComponent(paymentId)}`)
}

export async function createMollieRefund(input: CreateMollieRefundInput) {
  return requestMollie<MollieRefund>(`/payments/${encodeURIComponent(input.paymentId)}/refunds`, {
    method: 'POST',
    body: JSON.stringify({
      amount: {
        currency: input.currency.toUpperCase(),
        value: formatMollieAmount(input.amountCents),
      },
      description: input.description,
      metadata: input.metadata,
    }),
  })
}

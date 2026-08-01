import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
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
  method: 'creditcard' | 'applepay' | 'googlepay'
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

export function isMollieMockEnabled() {
  return env.get('MOLLIE_MOCK') === true
}

export function isMollieMockPaymentId(paymentId: string) {
  return paymentId.startsWith('tr_mock_')
}

function getMollieMockBaseUrl() {
  const configuredBaseUrl = env.get('MOLLIE_MOCK_BASE_URL')?.replace(/\/+$/, '')
  if (configuredBaseUrl) {
    return configuredBaseUrl
  }

  const webhookUrl = env.get('MOLLIE_WEBHOOK_URL')
  if (webhookUrl) {
    try {
      return new URL(webhookUrl).origin
    } catch {
      // Fall back to the local Adonis address below.
    }
  }

  return `http://localhost:${env.get('PORT')}`
}

export function formatMollieAmount(amountCents: number) {
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
  return isMollieMockEnabled() || Boolean(getMollieApiKey())
}

export async function createMolliePayment(input: CreateMolliePaymentInput) {
  const webhookUrl = env.get('MOLLIE_WEBHOOK_URL')
  const redirectUrl = env.get('MOLLIE_REDIRECT_URL') ?? 'upperglam://payment-return'

  if (isMollieMockEnabled()) {
    const paymentId = `tr_mock_${randomUUID().replaceAll('-', '')}`
    const mockBaseUrl = getMollieMockBaseUrl()

    return {
      id: paymentId,
      status: 'open',
      method: input.method,
      amount: {
        currency: input.currency.toUpperCase(),
        value: formatMollieAmount(input.amountCents),
      },
      metadata: input.metadata,
      _links: {
        checkout: {
          href: `${mockBaseUrl}/payments/mock/${paymentId}`,
          type: 'text/html',
        },
        self: {
          href: `${mockBaseUrl}/payments/mock/${paymentId}`,
          type: 'application/json',
        },
      },
    } satisfies MolliePayment
  }

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
  if (isMollieMockEnabled() && isMollieMockPaymentId(paymentId)) {
    const payment = await db
      .from('payments')
      .where('provider_transaction_id', paymentId)
      .select('provider_payload')
      .first()

    if (!payment?.provider_payload) {
      throw new Error(`Mock Mollie payment ${paymentId} not found`)
    }

    const payload =
      typeof payment.provider_payload === 'string'
        ? JSON.parse(payment.provider_payload)
        : payment.provider_payload

    return payload as MolliePayment
  }

  return requestMollie<MolliePayment>(`/payments/${encodeURIComponent(paymentId)}`)
}

export async function createMollieRefund(input: CreateMollieRefundInput) {
  if (isMollieMockEnabled() && isMollieMockPaymentId(input.paymentId)) {
    return {
      id: `re_mock_${randomUUID().replaceAll('-', '')}`,
      paymentId: input.paymentId,
      status: 'refunded',
      amount: {
        currency: input.currency.toUpperCase(),
        value: formatMollieAmount(input.amountCents),
      },
      description: input.description,
      metadata: input.metadata,
    } satisfies MollieRefund
  }

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
